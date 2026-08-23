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
 * `targets: { create: [...] }`), so a note left with no targets is residue.
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
 * SCOPE: the prune is deliberately NOT a per-user sweep of every zero-target
 * note. It only reaps notes that actually pointed at the entity being deleted,
 * so `deleteJobById` cannot reap a note orphaned weeks ago by something else,
 * and residue left by some *other* defect survives as evidence of that defect
 * instead of being silently swallowed. Two phases:
 *
 *   1. `collectOrphanCandidateNoteIds` BEFORE the delete — the join rows still
 *      exist and name their note.
 *   2. `withOrphanedCrmPrune` appends the prune to the transaction array; it
 *      deletes a candidate only if it is left with NO targets at all, so a note
 *      that also targeted a person or company survives untouched.
 *
 * ORDERING: the no-live-target predicate only holds once the cascade has removed the
 * join rows, so the prune must run after the delete. Prisma array transactions
 * execute in order and `withOrphanedCrmPrune` owns the last position, so a
 * caller cannot get it wrong:
 *
 *   const noteIds = await collectOrphanCandidateNoteIds(prisma, userId, {
 *     targetJobId: jobId,
 *   });
 *   await prisma.$transaction(
 *     withOrphanedCrmPrune(prisma, userId, noteIds, [
 *       prisma.job.delete({ where: { id: jobId, userId } }),
 *     ]),
 *   );
 */

import type { Prisma, PrismaClient } from "@prisma/client";

/** Accepts the full client or a transaction client. */
type CrmPruneDb = Pick<PrismaClient, "crmNote" | "crmNoteTarget"> | Prisma.TransactionClient;

type PruneOp = Prisma.PrismaPromise<Prisma.BatchPayload>;

/**
 * "Has no target that actually points at anything."
 *
 * Not simply `{ none: {} }`: the polymorphic FKs were created `ON DELETE SET
 * NULL` (migrations `20260510092100`, `20260512221118`) before
 * `20260512224224` switched them to `ON DELETE CASCADE`, so a database seeded
 * under the old schema can hold join rows whose three target columns are all
 * null. Such a ghost row is not a target, but it would make `none: {}` false and
 * silently spare the note — on the GDPR erasure path in particular.
 */
const NO_LIVE_TARGET = {
  none: {
    OR: [
      { targetPersonId: { not: null } },
      { targetCompanyId: { not: null } },
      { targetJobId: { not: null } },
    ],
  },
} satisfies Prisma.CrmNoteTargetListRelationFilter;

/**
 * Notes that point at the entity about to be deleted — the only candidates the
 * prune may touch. Call this BEFORE the delete: afterwards the join rows are
 * gone and nothing names the note any more.
 *
 * `where` is the caller's target predicate on `CrmNoteTarget`
 * (`{ targetJobId }`, `{ targetPersonId }`, a nested relation filter, …).
 * Ownership scoping via `note.userId` is added here — `CrmNoteTarget` has no
 * `userId` column of its own (ADR-015).
 */
export async function collectOrphanCandidateNoteIds(
  db: CrmPruneDb,
  userId: string,
  where: Prisma.CrmNoteTargetWhereInput,
): Promise<string[]> {
  const rows = await db.crmNoteTarget.findMany({
    where: { ...where, note: { userId } },
    select: { noteId: true },
  });
  return [...new Set(rows.map((r) => r.noteId))];
}

/**
 * Append the orphaned-note prune to a set of transaction operations. Pass the
 * result straight to `prisma.$transaction` — the prune is always last, and the
 * caller's own tuple types survive, so destructuring still works:
 *
 *   const [company] = await prisma.$transaction(
 *     withOrphanedCrmPrune(prisma, userId, noteIds, [
 *       prisma.company.delete({ ... }),
 *     ]),
 *   );
 *
 * The returned array's LAST element resolves to the prune's `{ count }`.
 */
export function withOrphanedCrmPrune<T extends readonly Prisma.PrismaPromise<unknown>[]>(
  db: CrmPruneDb,
  userId: string,
  candidateNoteIds: readonly string[],
  ops: readonly [...T],
): [...T, PruneOp] {
  const prune = db.crmNote.deleteMany({
    where: {
      id: { in: [...candidateNoteIds] },
      userId,
      targets: NO_LIVE_TARGET,
    },
  });
  return [...ops, prune] as [...T, PruneOp];
}

/**
 * Prune the collected candidates, for callers that are not building a
 * transaction array. The candidates must have been collected BEFORE the delete
 * (`collectOrphanCandidateNoteIds`) — afterwards the join rows are gone and
 * nothing names the note any more. Returns how many notes were pruned.
 */
export async function pruneOrphanedCrmNotesByIds(
  db: CrmPruneDb,
  userId: string,
  candidateNoteIds: readonly string[],
): Promise<number> {
  if (candidateNoteIds.length === 0) return 0;

  const { count } = await db.crmNote.deleteMany({
    where: { id: { in: [...candidateNoteIds] }, userId, targets: NO_LIVE_TARGET },
  });
  return count;
}
