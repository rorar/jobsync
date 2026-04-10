import "server-only";

import prisma from "@/lib/db";
import type { CurrentUser } from "@/models/user.model";

/**
 * Admin authorization helper — Sprint 1.5 CRIT-S-04 remediation.
 *
 * JobSync has no role model (no `isAdmin` column on User). Admin-only actions
 * (module activation/deactivation and other system-level toggles that mutate
 * shared singleton state) are gated through a tiered rule instead of RBAC:
 *
 *   Tier A — `ADMIN_USER_IDS` env var is set: only the listed user IDs are
 *            admins. Matches the existing env-var pattern from ADR-018
 *            (`AUTH_SECRET`) and keeps the config surface small.
 *   Tier B — `ADMIN_USER_IDS` is unset AND exactly ONE user exists in the
 *            database: that user is implicitly admin. This preserves the
 *            zero-config self-hosted single-user UX.
 *   Tier C — `ADMIN_USER_IDS` is unset AND more than one user exists: the
 *            check fails closed with a generic "not authorized" result.
 *            Multi-user deployments MUST configure an explicit admin list.
 *
 * The tiered rule is intentionally conservative: fail-closed is the default
 * for any ambiguous case. Adding an admin on a running multi-user deployment
 * requires an operator to set `ADMIN_USER_IDS` and restart, which is the same
 * trust boundary the rest of the security-sensitive env-var configuration
 * already relies on (AUTH_SECRET, ENCRYPTION_KEY).
 *
 * Import rule: this file declares `import "server-only"`, so its exports can
 * never be called from the browser via the Next.js Server Action protocol.
 * Callers living inside `"use server"` files MUST gate admin actions with
 * `requireAdmin()` — see ADR-019 ("use server" Export Security).
 *
 * Spec: specs/module-lifecycle.allium invariant `AdminOnlyModuleLifecycle`.
 * ADR family: ADR-015 (IDOR), ADR-018 (AUTH_SECRET env pattern),
 * ADR-019 ("use server" export security).
 */

export interface AdminAuthorizationResult {
  /** True iff the user is allowed to perform the admin action. */
  allowed: boolean;
  /** Which tier granted or denied the request — surfaced in audit logs. */
  tier: "explicit_list" | "single_user_implicit" | "denied";
  /** Generic message key for the caller to return as ActionResult. */
  reason?: string;
}

/**
 * Context data captured for audit-log purposes. Callers pass a short action
 * identifier and any additional structured fields — the audit writer adds
 * the caller identity, timestamp, and tier.
 */
export interface AdminAuditContext {
  action: string;
  targetId?: string;
  extra?: Record<string, string | number | boolean | null | undefined>;
}

const ADMIN_ENV_VAR = "ADMIN_USER_IDS";

/**
 * Parse `ADMIN_USER_IDS` — comma-separated list of user IDs. Whitespace is
 * trimmed; empty entries are ignored. Returns `null` when the env var is
 * unset or empty (Tier B/C fall-through).
 */
function parseAdminUserIds(): string[] | null {
  const raw = process.env[ADMIN_ENV_VAR];
  if (!raw) return null;
  const ids = raw
    .split(",")
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
  return ids.length > 0 ? ids : null;
}

/**
 * Check whether `user` is authorized as an admin. Does NOT throw — callers
 * use the returned `allowed` flag to build an `ActionResult` response.
 *
 * Contract:
 * - `user` null → always denied (fail-closed when not authenticated).
 * - Tier A  → allowed iff `user.id` is in `ADMIN_USER_IDS`.
 * - Tier B  → allowed iff `prisma.user.count() === 1` AND `user.id` matches
 *             the sole user in the DB (defence-in-depth: a stale session
 *             referencing a deleted user must NOT pass).
 * - Tier C  → denied.
 */
export async function checkAdminAuthorization(
  user: CurrentUser | null,
): Promise<AdminAuthorizationResult> {
  if (!user) {
    return { allowed: false, tier: "denied", reason: "errors.notAuthenticated" };
  }

  // Tier A — explicit allowlist.
  const explicitIds = parseAdminUserIds();
  if (explicitIds) {
    if (explicitIds.includes(user.id)) {
      return { allowed: true, tier: "explicit_list" };
    }
    return { allowed: false, tier: "denied", reason: "errors.notAuthorized" };
  }

  // Tier B / C — fall back to DB user count.
  let userCount: number;
  try {
    userCount = await prisma.user.count();
  } catch (dbError) {
    // Fail-closed if the DB is unreachable. Better to block a legitimate
    // single-user admin than silently allow a cross-tenant escalation.
    console.error(
      "[admin.checkAdminAuthorization] prisma.user.count() failed — denying:",
      dbError,
    );
    return { allowed: false, tier: "denied", reason: "errors.notAuthorized" };
  }

  if (userCount === 1) {
    // Tier B — implicit self-hosted single-user. Confirm the session user IS
    // the sole row (stale session guard).
    const soleUser = await prisma.user.findFirst({ select: { id: true } });
    if (soleUser && soleUser.id === user.id) {
      return { allowed: true, tier: "single_user_implicit" };
    }
    return { allowed: false, tier: "denied", reason: "errors.notAuthorized" };
  }

  // Tier C — multi-user deployment without explicit admin list.
  return { allowed: false, tier: "denied", reason: "errors.notAuthorized" };
}

/**
 * Convenience wrapper around `checkAdminAuthorization` that also writes an
 * audit-log entry. Returns the authorization result so the caller can decide
 * how to shape its `ActionResult`.
 */
export async function authorizeAdminAction(
  user: CurrentUser | null,
  context: AdminAuditContext,
): Promise<AdminAuthorizationResult> {
  const result = await checkAdminAuthorization(user);
  writeAdminAuditLog(user, context, result);
  return result;
}

/**
 * Structured audit log for admin actions — Hexagonal port/adapter design.
 *
 * Sprint 5 Stream D promoted this from stderr-only to DB-backed (the Sprint 1.5
 * CRIT-S-04 deferred follow-up). The function now writes to TWO sinks per call:
 *
 *   1. Primary adapter — `prisma.adminAuditLog.create`. Append-only DB row that
 *      the admin review UI and retention sweeps can query. See
 *      `prisma/schema.prisma::AdminAuditLog`.
 *
 *   2. Always-available port — single-line JSON on stderr, prefix `[admin-audit]`.
 *      Picked up by log-shipping pipelines and survives every kind of DB outage
 *      (migration not yet applied, Prisma client not regenerated, DB unreachable,
 *      schema drift). The stderr line is the SOURCE OF TRUTH; the DB row is a
 *      convenient query layer on top of it.
 *
 * Trade-off — the DB write is intentionally FIRE-AND-FORGET (no `await`):
 *   - Pro: the function stays synchronous (`void` return), so the existing
 *          callers in `authorizeAdminAction()` and elsewhere never become
 *          async, avoiding a ripple through every "use server" file.
 *   - Pro: an admin action is never blocked on a DB round-trip for the audit
 *          write — the action's own DB writes already provide consistency.
 *   - Con: if the process exits between the `.create()` call and Prisma's
 *          flush, the DB row is lost. ACCEPTED because the stderr line is
 *          synchronous and is the durable record.
 *
 * The DB write's `.catch` handler logs `[admin-audit-db-write-failed]` to
 * stderr so the failure itself is observable. We never re-throw — fail-open is
 * the right semantic for an audit sink that has a fallback port.
 *
 * Schema parity: every field on the JSON entry exists 1:1 on the Prisma model.
 * `kind` is omitted from the DB row because the table name already conveys it.
 * `ts` is stored as the `timestamp` column. `extra` (the spread of
 * `context.extra`) is JSON-serialised into the `extra` column on the DB row
 * (SQLite has no jsonb).
 */
export function writeAdminAuditLog(
  user: CurrentUser | null,
  context: AdminAuditContext,
  result: AdminAuthorizationResult,
): void {
  const ts = new Date();
  const tsIso = ts.toISOString();

  // Build the structured entry once and use it for BOTH sinks. Field names
  // mirror the Sprint 1.5 schema so existing log-shipper rules still match.
  const stderrEntry = {
    kind: "admin_audit",
    ts: tsIso,
    action: context.action,
    targetId: context.targetId ?? null,
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    allowed: result.allowed,
    tier: result.tier,
    reason: result.reason ?? null,
    ...(context.extra ?? {}),
  };

  // ---------------------------------------------------------------------
  // Primary adapter — DB persistence (fire-and-forget).
  // ---------------------------------------------------------------------
  // We do NOT await this. See the function docstring for the trade-off
  // rationale. The try/catch defends against TWO failure modes:
  //   1. The Promise rejects asynchronously (most Prisma errors) — handled
  //      by the `.catch()` chain.
  //   2. `prisma.adminAuditLog.create(...)` THROWS synchronously before
  //      returning a Promise (Prisma client not generated, schema drift,
  //      runtime initialization error). The outer try/catch catches that
  //      and routes it through the same `[admin-audit-db-write-failed]`
  //      observability channel.
  // Either way, the caller never sees the failure — the stderr line below
  // is the source of truth for the audit trail.
  if (user) {
    const extraSerialized =
      context.extra && Object.keys(context.extra).length > 0
        ? JSON.stringify(context.extra)
        : null;

    try {
      void prisma.adminAuditLog
        .create({
          data: {
            timestamp: ts,
            action: context.action,
            targetId: context.targetId ?? null,
            actorId: user.id,
            actorEmail: user.email ?? null,
            allowed: result.allowed,
            tier: result.tier ?? null,
            reason: result.reason ?? null,
            extra: extraSerialized,
          },
        })
        .catch((dbError: unknown) => {
          // Fail-open: never lose an audit entry. The stderr line below is
          // already the source of truth — this just makes the DB-write
          // failure itself observable so an operator can notice schema drift
          // or a missing migration.
          console.error("[admin-audit-db-write-failed]", dbError);
        });
    } catch (syncError) {
      // Synchronous throw — same observability channel as the async case.
      console.error("[admin-audit-db-write-failed]", syncError);
    }
  }
  // When `user` is null (the check failed BEFORE we knew who the actor was —
  // unauthenticated request) we deliberately skip the DB write because
  // `actorId` is NOT NULL on the schema. The stderr line still records the
  // anonymous attempt with `actorId: null`.

  // ---------------------------------------------------------------------
  // Always-available port — structured stderr JSON line.
  // ---------------------------------------------------------------------
  // Use console.warn so the line lands on stderr regardless of DEBUG_LOGGING.
  // The stable `[admin-audit]` prefix lets log-shippers grep without regex.
  console.warn("[admin-audit]", JSON.stringify(stderrEntry));
}
