/**
 * Bulk Action Service — Domain Service
 *
 * Orchestrates multi-item operations on StagedVacancies with partial-success semantics.
 * Each item is validated and processed individually; invalid items are skipped, not rolled back.
 *
 * Spec: specs/vacancy-pipeline.allium
 *   - rule BulkPartialSuccess (each item validated individually, failures skipped, not rolled back)
 *   - rule BatchUndoGranularity (one UndoToken per batch)
 *   - rule BulkActionEvent (exactly one BulkActionCompleted event per batch)
 *
 * Sprint 2 H-P-04 performance fix:
 * The previous implementation ran 2·N sequential Prisma queries per batch —
 * one findFirst + one update/delete per item — inside a per-item for loop.
 * A 1000-item trash batch meant 2000 round-trips.
 *
 * The new implementation:
 *  1. Fetches all N candidate rows in ONE findMany (userId-scoped for IDOR).
 *  2. Partitions them into "eligible" and "error" sets in memory, preserving
 *     the exact per-item validation rules (partial-success semantics).
 *  3. Issues ONE updateMany (or deleteMany for hard delete) for the eligible
 *     IDs. Result: 2 DB round-trips per batch, regardless of batch size.
 *
 * Previous behaviour preserved:
 *  - Per-item failure reasons (exact same strings)
 *  - Per-item previous-state snapshots for undo compensation
 *  - Exactly one BulkActionCompleted event per batch (rule BulkActionEvent)
 *  - No individual per-item events (spec invariant)
 *  - Missing items report "Vacancy not found"
 *  - Status guards enforced ("Can only dismiss staged or ready vacancies", etc.)
 */

import prisma from "@/lib/db";
import type { BulkActionResult } from "@/models/stagedVacancy.model";
import { emitEvent, createEvent } from "@/lib/events";
import { undoStore, createUndoEntry } from "@/lib/undo";

export type BulkActionType = "dismiss" | "archive" | "trash" | "restore" | "restoreFromTrash" | "delete";

// Snapshot of the fields we need to evaluate partial-success rules and build
// the undo compensation. Kept minimal to reduce Prisma payload size.
interface VacancySnapshot {
  id: string;
  status: string;
  archivedAt: Date | null;
  trashedAt: Date | null;
}

type PreviousStateMap = Map<string, { status: string; archivedAt: Date | null; trashedAt: Date | null }>;

/**
 * Execute a bulk action on staged vacancies with partial-success semantics.
 *
 * Rules:
 * - Each item validated individually; invalid items skipped, NOT rolled back
 * - One BulkActionCompleted event per batch
 * - One UndoEntry per batch (compensation reverses all succeeded items)
 * - Returns undoTokenId in the result
 */
export async function executeBulkAction(
  userId: string,
  actionType: BulkActionType,
  itemIds: string[],
): Promise<BulkActionResult & { undoTokenId?: string }> {
  // Early return for empty input
  if (itemIds.length === 0) {
    return { totalRequested: 0, succeeded: 0, failed: 0, errors: [] };
  }

  const errors: { itemId: string; reason: string }[] = [];
  const previousStates: PreviousStateMap = new Map();

  // ── Step 1: single batched fetch (IDOR-scoped) ──────────────────────────
  // IDOR protection: userId is part of the where clause, identical to the
  // previous per-item findFirst({ id, userId }) guard.
  let rows: VacancySnapshot[];
  try {
    rows = await prisma.stagedVacancy.findMany({
      where: { id: { in: itemIds }, userId },
      select: {
        id: true,
        status: true,
        archivedAt: true,
        trashedAt: true,
      },
    });
  } catch (error) {
    // On a complete batch failure, mark every requested item as failed.
    // Preserves the previous behaviour where per-item try/catch caught this
    // kind of failure and reported it on each item.
    const reason = error instanceof Error ? error.message : "Unknown error";
    return {
      totalRequested: itemIds.length,
      succeeded: 0,
      failed: itemIds.length,
      errors: itemIds.map((itemId) => ({ itemId, reason })),
    };
  }

  // ── Step 2: in-memory partitioning (preserves partial-success semantics) ─
  const rowsById = new Map<string, VacancySnapshot>();
  for (const row of rows) {
    rowsById.set(row.id, row);
  }

  // Walk the ORIGINAL requested order so error reporting matches the previous
  // per-item loop order exactly (tests assert error ordering).
  const eligibleIds: string[] = [];
  for (const itemId of itemIds) {
    const vacancy = rowsById.get(itemId);
    if (!vacancy) {
      errors.push({ itemId, reason: "Vacancy not found" });
      continue;
    }

    const validation = validateItem(actionType, vacancy);
    if (!validation.ok) {
      errors.push({ itemId, reason: validation.reason });
      continue;
    }

    // Snapshot the previous state for undo compensation BEFORE the write.
    previousStates.set(itemId, {
      status: vacancy.status,
      archivedAt: vacancy.archivedAt,
      trashedAt: vacancy.trashedAt,
    });
    eligibleIds.push(itemId);
  }

  // ── Step 3: single batched write ────────────────────────────────────────
  if (eligibleIds.length > 0) {
    try {
      await applyBatchAction(actionType, eligibleIds);
    } catch (error) {
      // Entire batched write failed → every eligible item is a failure.
      // Clear the previous-state snapshots so the undo token is not created
      // (we check eligibleIds.length-consistency further down).
      const reason = error instanceof Error ? error.message : "Unknown error";
      for (const itemId of eligibleIds) {
        errors.push({ itemId, reason });
        previousStates.delete(itemId);
      }
      eligibleIds.length = 0;
    }
  }

  let undoTokenId: string | undefined;

  // Create ONE UndoEntry per batch for reversible actions (not for hard delete)
  if (eligibleIds.length > 0 && actionType !== "delete") {
    const undoEntry = createUndoEntry(
      userId,
      `bulk_${actionType}`,
      eligibleIds,
      buildCompensation(actionType, eligibleIds, previousStates),
    );
    undoStore.push(undoEntry);
    undoTokenId = undoEntry.id;
  }

  // Emit ONE BulkActionCompleted event per batch (spec rule BulkActionEvent)
  if (eligibleIds.length > 0 || errors.length > 0) {
    emitEvent(
      createEvent("BulkActionCompleted", {
        actionType,
        itemIds: eligibleIds,
        userId,
        succeeded: eligibleIds.length,
        failed: errors.length,
      }),
    );
  }

  return {
    totalRequested: itemIds.length,
    succeeded: eligibleIds.length,
    failed: errors.length,
    errors,
    undoTokenId,
  };
}

// ---------------------------------------------------------------------------
// Per-Item Validation (in-memory, no DB)
// ---------------------------------------------------------------------------

interface ValidationOk {
  ok: true;
}

interface ValidationErr {
  ok: false;
  reason: string;
}

type Validation = ValidationOk | ValidationErr;

const OK: ValidationOk = { ok: true };

function validateItem(actionType: BulkActionType, vacancy: VacancySnapshot): Validation {
  switch (actionType) {
    case "dismiss":
      if (vacancy.status !== "staged" && vacancy.status !== "ready") {
        return { ok: false, reason: "Can only dismiss staged or ready vacancies" };
      }
      return OK;

    case "archive":
      if (vacancy.status === "promoted") {
        return { ok: false, reason: "Cannot archive a promoted vacancy" };
      }
      return OK;

    case "trash":
      if (vacancy.status === "promoted") {
        return { ok: false, reason: "Cannot trash a promoted vacancy" };
      }
      return OK;

    case "restore":
      if (vacancy.status !== "dismissed") {
        return { ok: false, reason: "Can only restore dismissed vacancies" };
      }
      return OK;

    case "restoreFromTrash":
      if (!vacancy.trashedAt) {
        return { ok: false, reason: "Vacancy is not in trash" };
      }
      return OK;

    case "delete":
      if (!vacancy.trashedAt) {
        return { ok: false, reason: "Can only permanently delete trashed vacancies" };
      }
      return OK;

    default:
      return { ok: false, reason: `Unknown action type: ${actionType}` };
  }
}

// ---------------------------------------------------------------------------
// Batched Write — one Prisma call per batch
// ---------------------------------------------------------------------------

async function applyBatchAction(
  actionType: BulkActionType,
  eligibleIds: string[],
): Promise<void> {
  switch (actionType) {
    case "dismiss":
      await prisma.stagedVacancy.updateMany({
        where: { id: { in: eligibleIds } },
        data: { status: "dismissed" },
      });
      return;

    case "archive":
      await prisma.stagedVacancy.updateMany({
        where: { id: { in: eligibleIds } },
        data: { archivedAt: new Date() },
      });
      return;

    case "trash":
      await prisma.stagedVacancy.updateMany({
        where: { id: { in: eligibleIds } },
        data: { trashedAt: new Date() },
      });
      return;

    case "restore":
      await prisma.stagedVacancy.updateMany({
        where: { id: { in: eligibleIds } },
        data: { status: "staged" },
      });
      return;

    case "restoreFromTrash":
      await prisma.stagedVacancy.updateMany({
        where: { id: { in: eligibleIds } },
        data: { trashedAt: null },
      });
      return;

    case "delete":
      await prisma.stagedVacancy.deleteMany({
        where: { id: { in: eligibleIds } },
      });
      return;
  }
}

// ---------------------------------------------------------------------------
// Compensation Builders (for Undo)
// ---------------------------------------------------------------------------

function buildCompensation(
  actionType: BulkActionType,
  succeededIds: string[],
  previousStates: PreviousStateMap,
): () => Promise<void> {
  switch (actionType) {
    case "dismiss":
    case "restore": {
      // Both restore mutations target `status`. To honour per-item previous
      // status (restore may have been applied to vacancies that were in
      // different pre-dismissed states), we group by previous status and
      // issue one updateMany per group.
      return async () => {
        const byStatus = new Map<string, string[]>();
        for (const id of succeededIds) {
          const prev = previousStates.get(id);
          if (!prev) continue;
          const bucket = byStatus.get(prev.status) ?? [];
          bucket.push(id);
          byStatus.set(prev.status, bucket);
        }
        for (const [status, ids] of byStatus) {
          await prisma.stagedVacancy.updateMany({
            where: { id: { in: ids } },
            data: { status },
          });
        }
      };
    }

    case "archive":
      return async () => {
        await prisma.stagedVacancy.updateMany({
          where: { id: { in: succeededIds } },
          data: { archivedAt: null },
        });
      };

    case "trash":
      return async () => {
        await prisma.stagedVacancy.updateMany({
          where: { id: { in: succeededIds } },
          data: { trashedAt: null },
        });
      };

    case "restoreFromTrash": {
      // Per-item previous trashedAt is preserved. Group by timestamp ISO so
      // batches can share updateMany calls.
      return async () => {
        const byTs = new Map<string | null, string[]>();
        for (const id of succeededIds) {
          const prev = previousStates.get(id);
          if (!prev) continue;
          const key = prev.trashedAt ? prev.trashedAt.toISOString() : null;
          const bucket = byTs.get(key) ?? [];
          bucket.push(id);
          byTs.set(key, bucket);
        }
        for (const [key, ids] of byTs) {
          await prisma.stagedVacancy.updateMany({
            where: { id: { in: ids } },
            data: { trashedAt: key ? new Date(key) : null },
          });
        }
      };
    }

    default:
      // delete has no undo
      return async () => {};
  }
}
