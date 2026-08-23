/**
 * Pruning of CRM notes orphaned by a target deletion (W-D3).
 *
 * `CrmNoteTarget` / `CrmTaskTarget` are polymorphic join rows (schema.prisma)
 * that cascade-delete with their target Person, Company or Job
 * (`onDelete: Cascade`).
 *
 * A NOTE whose only target was that entity is then unreachable: every note read
 * goes through a target filter (`getCrmNotes` is only ever called as
 * `getCrmNotes({ targetPersonId })`), so the note disappears from the UI while
 * still holding its free-text body — which, on the GDPR erasure path, is free
 * text about the very person being erased. `CreateNote` requires
 * `targets.count > 0` (specs/crm.allium) and creation is atomic (nested
 * `targets: { create: [...] }`), so a zero-target note is always residue and can
 * be pruned unconditionally per user.
 *
 * A TASK is deliberately NOT pruned. It is not residue:
 *   - the task board reads `getCrmTasks()` with no filter
 *     (`CrmTasksPageClient`) and renders the zero-target case explicitly, so an
 *     orphaned task stays visible and actionable;
 *   - `checkOverdueTasks` (`src/lib/scheduler/crm-cron.ts`) selects on status +
 *     dueDate alone, so reminders keep firing for it.
 * Deleting one would also bypass `rule DeleteTask` (specs/crm.allium), which
 * permits a hard delete only for a task in a terminal status — the guard
 * `deleteCrmTask` enforces (W-A1). A task that loses its last target simply
 * loses its link: `targets.count > 0` is an obligation on the creating action,
 * not a standing predicate over current state (the same reasoning that moved
 * the converted-referral guarantee onto `TipReifiesToJob`, W-D2).
 *
 * ORDERING: the prune matches on `targets: { none: {} }`, which only holds once
 * the cascade has removed the join rows, so it must run AFTER the delete. Prisma
 * array transactions execute in order — `withOrphanedCrmPrune` owns that
 * position so a caller cannot get it wrong:
 *
 *   await prisma.$transaction(
 *     withOrphanedCrmPrune(prisma, userId, [
 *       prisma.job.delete({ where: { id, userId } }),
 *     ]),
 *   );
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** Accepts the full client or a transaction client. */
type CrmPruneDb = Pick<PrismaClient, "crmNote"> | Prisma.TransactionClient;

type PruneOp = Prisma.PrismaPromise<Prisma.BatchPayload>;

function orphanedNotePruneOp(db: CrmPruneDb, userId: string): PruneOp {
  return db.crmNote.deleteMany({ where: { userId, targets: { none: {} } } });
}

/**
 * Append the orphaned-note prune to a set of transaction operations. Pass the
 * result straight to `prisma.$transaction` — the prune is always last, and the
 * caller's own tuple types survive, so destructuring still works:
 *
 *   const [company] = await prisma.$transaction(
 *     withOrphanedCrmPrune(prisma, userId, [prisma.company.delete({ ... })]),
 *   );
 */
export function withOrphanedCrmPrune<T extends readonly Prisma.PrismaPromise<unknown>[]>(
  db: CrmPruneDb,
  userId: string,
  ops: readonly [...T],
): [...T, PruneOp] {
  return [...ops, orphanedNotePruneOp(db, userId)] as [...T, PruneOp];
}

/**
 * Await-and-count variant, for callers that are not building a transaction
 * array (or are already inside a `$transaction` callback).
 */
export async function pruneOrphanedCrmNotes(
  db: CrmPruneDb,
  userId: string,
): Promise<number> {
  const { count } = await orphanedNotePruneOp(db, userId);
  return count;
}
