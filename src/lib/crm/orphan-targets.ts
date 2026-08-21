/**
 * Pruning of CRM notes/tasks orphaned by a target deletion (W-D3).
 *
 * `CrmNoteTarget` / `CrmTaskTarget` are polymorphic join rows that cascade-delete
 * with their target Person, Company or Job (`onDelete: Cascade`, schema.prisma).
 * A note or task whose ONLY target was that entity therefore survives with zero
 * targets: unreachable on every timeline (all reads filter via `targets.some`),
 * yet still holding its free-text body — which, on the GDPR erasure path, is
 * free-text about the very person being erased.
 *
 * That state is not reachable by any legal action: CreateNote/CreateTask require
 * `targets.count > 0` (specs/crm.allium), and creation is atomic (nested
 * `targets: { create: [...] }`), so a zero-target record is always residue and
 * can be pruned unconditionally per user.
 *
 * ORDERING: these ops must run AFTER the target rows are gone. Inside a Prisma
 * array transaction the statements execute in order, so append them LAST:
 *
 *   await prisma.$transaction([
 *     prisma.job.delete({ where: { id, userId } }),
 *     ...buildOrphanedCrmPruneOps(prisma, userId),
 *   ]);
 *
 * Spec: specs/crm.allium (ExactlyOneTaskTarget / ExactlyOneNoteTarget constrain a
 * single join row; the "a record always has at least one target" obligation lives
 * on CreateNote/CreateTask and is upheld here on the delete side).
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** Accepts the full client or a transaction client. */
type CrmPruneDb = Pick<PrismaClient, "crmNote" | "crmTask"> | Prisma.TransactionClient;

/**
 * Build the two deleteMany operations that remove the user's zero-target notes
 * and tasks. Returns unawaited Prisma promises for use in an array transaction —
 * append them last (see ORDERING above).
 */
export function buildOrphanedCrmPruneOps(db: CrmPruneDb, userId: string) {
  const where = { userId, targets: { none: {} } };
  return [
    db.crmNote.deleteMany({ where }),
    db.crmTask.deleteMany({ where }),
  ];
}

/**
 * Await-and-count variant for interactive contexts (already inside a `$transaction`
 * callback, or where the caller wants the prune counts).
 */
export async function pruneOrphanedCrmRecords(
  db: CrmPruneDb,
  userId: string,
): Promise<{ notes: number; tasks: number }> {
  const [notes, tasks] = await Promise.all(buildOrphanedCrmPruneOps(db, userId));
  return { notes: notes.count, tasks: tasks.count };
}
