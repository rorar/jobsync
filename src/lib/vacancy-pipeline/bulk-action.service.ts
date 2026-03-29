/**
 * Bulk Action Service — Domain Service
 *
 * Orchestrates multi-item operations on StagedVacancies with partial-success semantics.
 * Each item is validated and processed individually; invalid items are skipped, not rolled back.
 *
 * Spec: specs/vacancy-pipeline.allium (rule BulkPartialSuccess, BatchUndoGranularity)
 */

import prisma from "@/lib/db";
import type { BulkActionResult } from "@/models/stagedVacancy.model";
import { emitEvent, createEvent } from "@/lib/events";
import { undoStore, createUndoEntry } from "@/lib/undo";

export type BulkActionType = "dismiss" | "archive" | "trash" | "restore" | "restoreFromTrash" | "delete";

interface BulkActionContext {
  userId: string;
  actionType: BulkActionType;
  itemIds: string[];
}

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

  const context: BulkActionContext = { userId, actionType, itemIds };
  const succeededIds: string[] = [];
  const errors: { itemId: string; reason: string }[] = [];

  // Track previous states for undo compensation
  const previousStates: Map<string, { status: string; archivedAt: Date | null; trashedAt: Date | null }> = new Map();

  // Process each item individually with try/catch per item
  for (const itemId of itemIds) {
    try {
      const result = await processItem(context, itemId, previousStates);
      if (result.success) {
        succeededIds.push(itemId);
      } else {
        errors.push({ itemId, reason: result.reason });
      }
    } catch (error) {
      errors.push({
        itemId,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  let undoTokenId: string | undefined;

  // Create ONE UndoEntry per batch for reversible actions (not for hard delete)
  if (succeededIds.length > 0 && actionType !== "delete") {
    const undoEntry = createUndoEntry(
      userId,
      `bulk_${actionType}`,
      succeededIds,
      buildCompensation(actionType, succeededIds, previousStates),
    );
    undoStore.push(undoEntry);
    undoTokenId = undoEntry.id;
  }

  // Emit ONE BulkActionCompleted event per batch
  if (succeededIds.length > 0 || errors.length > 0) {
    emitEvent(
      createEvent("BulkActionCompleted", {
        actionType,
        itemIds: succeededIds,
        userId,
        succeeded: succeededIds.length,
        failed: errors.length,
      }),
    );
  }

  return {
    totalRequested: itemIds.length,
    succeeded: succeededIds.length,
    failed: errors.length,
    errors,
    undoTokenId,
  };
}

// ---------------------------------------------------------------------------
// Per-Item Processing
// ---------------------------------------------------------------------------

interface ItemResult {
  success: boolean;
  reason: string;
}

async function processItem(
  context: BulkActionContext,
  itemId: string,
  previousStates: Map<string, { status: string; archivedAt: Date | null; trashedAt: Date | null }>,
): Promise<ItemResult> {
  const vacancy = await prisma.stagedVacancy.findFirst({
    where: { id: itemId, userId: context.userId },
  });

  if (!vacancy) {
    return { success: false, reason: "Vacancy not found" };
  }

  // Store previous state for undo
  previousStates.set(itemId, {
    status: vacancy.status,
    archivedAt: vacancy.archivedAt,
    trashedAt: vacancy.trashedAt,
  });

  switch (context.actionType) {
    case "dismiss":
      return processDismiss(itemId, vacancy);
    case "archive":
      return processArchive(itemId, vacancy);
    case "trash":
      return processTrash(itemId, vacancy);
    case "restore":
      return processRestore(itemId, vacancy);
    case "restoreFromTrash":
      return processRestoreFromTrash(itemId, vacancy);
    case "delete":
      return processDelete(itemId, vacancy);
    default:
      return { success: false, reason: `Unknown action type: ${context.actionType}` };
  }
}

// dismiss: set status to "dismissed" (only if currently "staged" or "ready")
async function processDismiss(
  itemId: string,
  vacancy: { status: string },
): Promise<ItemResult> {
  if (vacancy.status !== "staged" && vacancy.status !== "ready") {
    return { success: false, reason: "Can only dismiss staged or ready vacancies" };
  }
  await prisma.stagedVacancy.update({
    where: { id: itemId },
    data: { status: "dismissed" },
  });
  return { success: true, reason: "" };
}

// archive: set archivedAt to now (only if not promoted)
async function processArchive(
  itemId: string,
  vacancy: { status: string },
): Promise<ItemResult> {
  if (vacancy.status === "promoted") {
    return { success: false, reason: "Cannot archive a promoted vacancy" };
  }
  await prisma.stagedVacancy.update({
    where: { id: itemId },
    data: { archivedAt: new Date() },
  });
  return { success: true, reason: "" };
}

// trash: set trashedAt to now (only if not promoted)
async function processTrash(
  itemId: string,
  vacancy: { status: string },
): Promise<ItemResult> {
  if (vacancy.status === "promoted") {
    return { success: false, reason: "Cannot trash a promoted vacancy" };
  }
  await prisma.stagedVacancy.update({
    where: { id: itemId },
    data: { trashedAt: new Date() },
  });
  return { success: true, reason: "" };
}

// restore: set status to "staged" (only if currently "dismissed")
async function processRestore(
  itemId: string,
  vacancy: { status: string },
): Promise<ItemResult> {
  if (vacancy.status !== "dismissed") {
    return { success: false, reason: "Can only restore dismissed vacancies" };
  }
  await prisma.stagedVacancy.update({
    where: { id: itemId },
    data: { status: "staged" },
  });
  return { success: true, reason: "" };
}

// restoreFromTrash: set trashedAt to null (only if currently trashed)
async function processRestoreFromTrash(
  itemId: string,
  vacancy: { trashedAt: Date | null },
): Promise<ItemResult> {
  if (!vacancy.trashedAt) {
    return { success: false, reason: "Vacancy is not in trash" };
  }
  await prisma.stagedVacancy.update({
    where: { id: itemId },
    data: { trashedAt: null },
  });
  return { success: true, reason: "" };
}

// delete: hard delete (only if currently trashed — safety guard)
async function processDelete(
  itemId: string,
  vacancy: { trashedAt: Date | null },
): Promise<ItemResult> {
  if (!vacancy.trashedAt) {
    return { success: false, reason: "Can only permanently delete trashed vacancies" };
  }
  await prisma.stagedVacancy.delete({
    where: { id: itemId },
  });
  return { success: true, reason: "" };
}

// ---------------------------------------------------------------------------
// Compensation Builders (for Undo)
// ---------------------------------------------------------------------------

function buildCompensation(
  actionType: BulkActionType,
  succeededIds: string[],
  previousStates: Map<string, { status: string; archivedAt: Date | null; trashedAt: Date | null }>,
): () => Promise<void> {
  switch (actionType) {
    case "dismiss":
      return async () => {
        for (const id of succeededIds) {
          const prev = previousStates.get(id);
          if (prev) {
            await prisma.stagedVacancy.update({
              where: { id },
              data: { status: prev.status },
            });
          }
        }
      };

    case "archive":
      return async () => {
        for (const id of succeededIds) {
          await prisma.stagedVacancy.update({
            where: { id },
            data: { archivedAt: null },
          });
        }
      };

    case "trash":
      return async () => {
        for (const id of succeededIds) {
          await prisma.stagedVacancy.update({
            where: { id },
            data: { trashedAt: null },
          });
        }
      };

    case "restore":
      return async () => {
        for (const id of succeededIds) {
          const prev = previousStates.get(id);
          if (prev) {
            await prisma.stagedVacancy.update({
              where: { id },
              data: { status: prev.status },
            });
          }
        }
      };

    case "restoreFromTrash":
      return async () => {
        for (const id of succeededIds) {
          const prev = previousStates.get(id);
          if (prev) {
            await prisma.stagedVacancy.update({
              where: { id },
              data: { trashedAt: prev.trashedAt },
            });
          }
        }
      };

    default:
      // delete has no undo
      return async () => {};
  }
}
