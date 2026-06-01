import "server-only";

import prisma from "@/lib/db";

/**
 * GDPR data audit-trail writer (Welle 1 S6a + S6b).
 *
 * Persists Job-CRUD accountability rows (S6a) and Person-PII read-access rows
 * (S6b) to the shared `AdminAuditLog` table, mirroring the hexagonal pattern of
 * `writeAdminAuditLog()` (src/lib/auth/admin.ts): a fire-and-forget DB write
 * (the convenience adapter) plus an always-available structured stderr line (the
 * source of truth). Failures never propagate to the caller.
 *
 * ADR-019: this lives in a `server-only` leaf — NOT a `"use server"` file — so
 * the raw-`actorId` parameter is never exposed as a callable server action.
 * Callers pass `user.id` from `getCurrentUser()`.
 *
 * Spec: specs/audit-trail.allium. The writer structurally guarantees two of the
 * spec invariants so call sites cannot violate them:
 *  - DataMinimisation: a `person.pii_read` row NEVER carries a before/after
 *    snapshot (the field is dropped here regardless of what the caller passes).
 *  - SnapshotsAreFieldDiffsNotPii: a before/after snapshot is persisted ONLY for
 *    `job.update` / `job.status_change`.
 */

export type DataAuditAction =
  | "job.create"
  | "job.update"
  | "job.delete"
  | "job.status_change"
  | "job.note_add"
  | "person.pii_read";

export type DataAuditTargetType = "job" | "person" | "company";

/** Actions permitted to carry a before/after field-diff snapshot. */
const SNAPSHOT_ACTIONS: ReadonlySet<DataAuditAction> = new Set([
  "job.update",
  "job.status_change",
]);

export interface DataAuditInput {
  /** id of the acting user (from getCurrentUser); stored as a bare String, not a FK. */
  actorId: string;
  /** Denormalised actor email — self-contained audit row after user deletion. */
  actorEmail?: string | null;
  action: DataAuditAction;
  targetType: DataAuditTargetType;
  targetId?: string | null;
  /**
   * Field-level before/after diff for Job mutations. JSON-serialised into the
   * `extra` column. Dropped unless `action` is a snapshot action, and ALWAYS
   * dropped for `person.pii_read` (must never contain Person PII).
   */
  beforeAfter?: Record<string, unknown> | null;
}

export function writeDataAuditLog(input: DataAuditInput): void {
  const ts = new Date();

  // Enforce the spec minimisation invariants at the sink: only Job field
  // mutations may persist a snapshot; reads never do.
  const snapshot =
    SNAPSHOT_ACTIONS.has(input.action) &&
    input.beforeAfter &&
    Object.keys(input.beforeAfter).length > 0
      ? input.beforeAfter
      : null;

  const extraSerialized = snapshot ? JSON.stringify(snapshot) : null;

  // Primary adapter — fire-and-forget DB write. Defends against both async
  // rejection and synchronous throw (Prisma client/schema drift), routing both
  // to the same observability channel without ever throwing to the caller.
  try {
    void prisma.adminAuditLog
      .create({
        data: {
          timestamp: ts,
          action: input.action,
          targetType: input.targetType,
          targetId: input.targetId ?? null,
          actorId: input.actorId,
          actorEmail: input.actorEmail ?? null,
          allowed: true,
          tier: null,
          reason: null,
          extra: extraSerialized,
        },
      })
      .catch((dbError: unknown) => {
        console.error("[data-audit-db-write-failed]", dbError);
      });
  } catch (syncError) {
    console.error("[data-audit-db-write-failed]", syncError);
  }

  // Always-available port — structured stderr line (source of truth).
  console.warn(
    JSON.stringify({
      kind: "data_audit",
      ts: ts.toISOString(),
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId ?? null,
      actorId: input.actorId,
      actorEmail: input.actorEmail ?? null,
      hasSnapshot: extraSerialized !== null,
    }),
  );
}
