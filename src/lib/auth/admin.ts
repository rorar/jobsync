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
 * Structured audit log for admin actions. Uses `console.warn` so that the
 * entry is picked up by any log aggregator watching stderr (same pattern as
 * the runner/scheduler debug lines). The log line is a single JSON object
 * so it can be parsed by log-shipping pipelines without regex.
 *
 * Intentionally NOT a Prisma model in this hotfix — that would require a
 * migration which the hotfix pipeline cannot run. A follow-up sprint may
 * promote this to a DB-backed `AdminAuditLog` model; the signature stays
 * stable so callers never need to change.
 */
export function writeAdminAuditLog(
  user: CurrentUser | null,
  context: AdminAuditContext,
  result: AdminAuthorizationResult,
): void {
  const entry = {
    kind: "admin_audit",
    ts: new Date().toISOString(),
    action: context.action,
    targetId: context.targetId ?? null,
    actorId: user?.id ?? null,
    actorEmail: user?.email ?? null,
    allowed: result.allowed,
    tier: result.tier,
    reason: result.reason ?? null,
    ...(context.extra ?? {}),
  };
  // console.warn so the entry is on stderr and visible in production logs
  // regardless of DEBUG_LOGGING. Use a stable prefix for log-shipper filters.
  console.warn("[admin-audit]", JSON.stringify(entry));
}
