"use server";

import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import type {
  StagedVacancy,
  StagedVacancyStatus,
  StagedVacancyWithAutomation,
  BulkActionResult,
  PromotionInput,
} from "@/models/stagedVacancy.model";
import { promoteStagedVacancy } from "@/lib/connector/job-discovery/promoter";
import { emitEvent } from "@/lib/events";
import { undoStore, createUndoEntry } from "@/lib/undo";
import { APP_CONSTANTS } from "@/lib/constants";
import type { RetentionResult } from "@/lib/vacancy-pipeline/retention.service";
import { STAGED_VACANCY_LIST_SELECT } from "./stagedVacancy.select";

// Re-export the shared select shape as an async wrapper so tests and other
// callers can pull it from the "use server" module if they need to. The
// actual constant lives in a sibling non-action module (`stagedVacancy.select.ts`)
// because Next.js forbids non-async exports from files with the `"use server"`
// directive.
export async function getStagedVacancyListSelect(): Promise<
  typeof STAGED_VACANCY_LIST_SELECT
> {
  return STAGED_VACANCY_LIST_SELECT;
}

// Narrow Prisma string to domain enum
function toStagedVacancy<T extends { status: string; source: string }>(
  row: T
): T & { status: StagedVacancyStatus; source: "manual" | "automation" } {
  return {
    ...row,
    status: row.status as StagedVacancyStatus,
    source: row.source as "manual" | "automation",
  };
}

// Fill list-mode rows to match the full `StagedVacancy` shape for callers that
// expect every scalar to be present. `matchData` is the only heavy JSON column
// the list UI never reads (see M-P-02 in .team-feature/stream-5b-performance.md
// and the regression guard in __tests__/stagedVacancy-list-select.spec.ts).
// Any future reader that needs `matchData` MUST re-fetch via `getStagedVacancyById`.
function toListStagedVacancy<
  T extends { status: string; source: string },
>(row: T): T & {
  status: StagedVacancyStatus;
  source: "manual" | "automation";
  matchData: null;
} {
  return {
    ...row,
    status: row.status as StagedVacancyStatus,
    source: row.source as "manual" | "automation",
    matchData: null,
  };
}

/**
 * Get staged vacancies for the current user with pagination and filtering.
 */
export async function getStagedVacancies(
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  statusFilter?: StagedVacancyStatus[],
  search?: string,
  tab?: "new" | "dismissed" | "archived" | "trashed",
): Promise<ActionResult<StagedVacancyWithAutomation[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const safeTake = Math.min(Math.max(1, limit), 100);
    const safePage = Math.max(1, page);
    const offset = (safePage - 1) * safeTake;
    const whereClause: Prisma.StagedVacancyWhereInput = {
      userId: user.id,
    };

    // Tab-based filtering (per spec surface StagingQueue)
    if (tab === "archived") {
      whereClause.archivedAt = { not: null };
    } else if (tab === "trashed") {
      whereClause.trashedAt = { not: null };
    } else if (tab === "dismissed") {
      whereClause.trashedAt = null;
      whereClause.archivedAt = null;
      whereClause.status = "dismissed";
    } else {
      // "new" tab: exclude trashed and archived
      whereClause.trashedAt = null;
      whereClause.archivedAt = null;
    }

    if (statusFilter && statusFilter.length > 0) {
      whereClause.status = { in: statusFilter };
    }

    if (search) {
      whereClause.OR = [
        { title: { contains: search } },
        { employerName: { contains: search } },
        { location: { contains: search } },
        { description: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      // M-P-02: explicit `select` instead of `include`. The previous `include`
      // clause pulled every scalar column plus the `matchData` JSON blob for
      // every row in the list, paying the worst-case detail-sheet cost even
      // when the user never opens the sheet. The shared `STAGED_VACANCY_LIST_SELECT`
      // shape covers exactly the fields StagedVacancyCard and
      // StagedVacancyDetailContent read (the sheet reuses the list row — it
      // does not re-fetch) and deliberately omits `matchData`. See
      // .team-feature/stream-5b-performance.md M-P-02 and the regression guard
      // in __tests__/stagedVacancy-list-select.spec.ts.
      prisma.stagedVacancy.findMany({
        where: whereClause,
        select: STAGED_VACANCY_LIST_SELECT,
        orderBy: { discoveredAt: "desc" },
        skip: offset,
        take: safeTake,
      }),
      prisma.stagedVacancy.count({ where: whereClause }),
    ]);

    return {
      success: true,
      data: data.map(toListStagedVacancy) as StagedVacancyWithAutomation[],
      total,
    };
  } catch (error) {
    return handleError(error, "errors.fetchStagedVacancies");
  }
}

/**
 * Get a single staged vacancy by ID.
 */
export async function getStagedVacancyById(
  id: string,
): Promise<ActionResult<StagedVacancyWithAutomation>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
      include: { automation: { select: { id: true, name: true } } },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };

    return { success: true, data: toStagedVacancy(vacancy) as StagedVacancyWithAutomation };
  } catch (error) {
    return handleError(error, "errors.fetchStagedVacancy");
  }
}

/**
 * Dismiss a staged vacancy. Returns an undo token for reversal.
 */
export async function dismissStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy & { undoTokenId?: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };
    if (vacancy.status !== "staged" && vacancy.status !== "ready") {
      return { success: false, message: "Can only dismiss staged or ready vacancies" };
    }

    const previousStatus = vacancy.status;
    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { status: "dismissed" },
    });

    // Register undo token (compensation: restore to previous status)
    const undoEntry = createUndoEntry(
      user.id,
      "dismiss",
      [id],
      async () => {
        await prisma.stagedVacancy.update({
          where: { id },
          data: { status: previousStatus },
        });
      },
    );
    undoStore.push(undoEntry);

    emitEvent({ type: "VacancyDismissed", timestamp: new Date(), payload: { stagedVacancyId: id, userId: user.id } });
    return { success: true, data: { ...toStagedVacancy(updated) as StagedVacancy, undoTokenId: undoEntry.id } };
  } catch (error) {
    return handleError(error, "errors.dismissStagedVacancy");
  }
}

/**
 * Restore a dismissed staged vacancy back to staged.
 */
export async function restoreStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };
    if (vacancy.status !== "dismissed") return { success: false, message: "Can only restore dismissed vacancies" };

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { status: "staged" },
    });

    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "errors.restoreStagedVacancy");
  }
}

/**
 * Archive a staged vacancy. Returns an undo token for reversal.
 */
export async function archiveStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy & { undoTokenId?: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };
    if (vacancy.status === "promoted") return { success: false, message: "Cannot archive a promoted vacancy" };

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { archivedAt: new Date() },
    });

    const undoEntry = createUndoEntry(
      user.id,
      "archive",
      [id],
      async () => {
        await prisma.stagedVacancy.update({
          where: { id },
          data: { archivedAt: null },
        });
      },
    );
    undoStore.push(undoEntry);

    emitEvent({ type: "VacancyArchived", timestamp: new Date(), payload: { stagedVacancyId: id, userId: user.id } });
    return { success: true, data: { ...toStagedVacancy(updated) as StagedVacancy, undoTokenId: undoEntry.id } };
  } catch (error) {
    return handleError(error, "errors.archiveStagedVacancy");
  }
}

/**
 * Move a staged vacancy to trash. Returns an undo token for reversal.
 */
export async function trashStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy & { undoTokenId?: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };
    if (vacancy.status === "promoted") return { success: false, message: "Cannot trash a promoted vacancy" };

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { trashedAt: new Date() },
    });

    const undoEntry = createUndoEntry(
      user.id,
      "trash",
      [id],
      async () => {
        await prisma.stagedVacancy.update({
          where: { id },
          data: { trashedAt: null },
        });
      },
    );
    undoStore.push(undoEntry);

    emitEvent({ type: "VacancyTrashed", timestamp: new Date(), payload: { stagedVacancyId: id, userId: user.id } });
    return { success: true, data: { ...toStagedVacancy(updated) as StagedVacancy, undoTokenId: undoEntry.id } };
  } catch (error) {
    return handleError(error, "errors.trashStagedVacancy");
  }
}

/**
 * Restore from trash.
 */
export async function restoreFromTrash(
  id: string,
): Promise<ActionResult<StagedVacancy>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: { id, userId: user.id },
    });

    if (!vacancy) return { success: false, message: "Staged vacancy not found" };
    if (!vacancy.trashedAt) return { success: false, message: "Vacancy is not in trash" };

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { trashedAt: null },
    });

    emitEvent({ type: "VacancyRestoredFromTrash", timestamp: new Date(), payload: { stagedVacancyId: id, userId: user.id } });
    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "errors.restoreFromTrash");
  }
}

/**
 * Get counts per status tab for the staging UI.
 */
export async function getStagedVacancyCounts(): Promise<
  ActionResult<Record<string, number>>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const [newCount, ready, dismissed, archived, trashed] = await Promise.all([
      prisma.stagedVacancy.count({
        where: { userId: user.id, status: { in: ["staged", "processing", "ready"] }, archivedAt: null, trashedAt: null },
      }),
      prisma.stagedVacancy.count({
        where: { userId: user.id, status: "ready", archivedAt: null, trashedAt: null },
      }),
      prisma.stagedVacancy.count({
        where: { userId: user.id, status: "dismissed", trashedAt: null },
      }),
      prisma.stagedVacancy.count({
        where: { userId: user.id, archivedAt: { not: null } },
      }),
      prisma.stagedVacancy.count({
        where: { userId: user.id, trashedAt: { not: null } },
      }),
    ]);

    return {
      success: true,
      data: { new: newCount, ready, dismissed, archived, trashed },
    };
  } catch (error) {
    return handleError(error, "errors.fetchStagedVacancyCounts");
  }
}

/**
 * Promote a staged vacancy to a full Job record.
 */
export async function promoteStagedVacancyToJob(
  input: PromotionInput,
): Promise<ActionResult<{ jobId: string; stagedVacancyId: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const result = await promoteStagedVacancy(input, user.id);

    return { success: true, data: result };
  } catch (error) {
    return handleError(error, "errors.promoteStagedVacancy");
  }
}

/**
 * Run retention cleanup: purge expired trashed/dismissed vacancies,
 * preserving dedup hashes. Default retention: 30 days.
 */
export async function runRetentionCleanup(
  retentionDays: number = 30,
): Promise<ActionResult<RetentionResult>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    // Dynamic import to keep the server-only module out of the action's initial bundle
    const { runRetentionCleanup: runCleanup } = await import(
      "@/lib/vacancy-pipeline/retention.service"
    );
    const result = await runCleanup(user.id, retentionDays);

    return { success: true, data: result };
  } catch (error) {
    return handleError(error, "errors.runRetentionCleanup");
  }
}

/**
 * Execute a bulk action on staged vacancies with partial-success semantics.
 * Each item is validated individually; invalid items are skipped, not rolled back.
 * One BulkActionCompleted event per batch, one UndoEntry per batch.
 */
const VALID_BULK_ACTIONS = ["dismiss", "archive", "trash", "restore", "restoreFromTrash", "delete"] as const;

export async function executeBulkAction(
  actionType: import("@/lib/vacancy-pipeline/bulk-action.service").BulkActionType,
  itemIds: string[],
): Promise<ActionResult<BulkActionResult & { undoTokenId?: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    // Runtime validation — TypeScript types are erased (BS-8)
    if (!(VALID_BULK_ACTIONS as readonly string[]).includes(actionType)) {
      return { success: false, message: "Invalid action type" };
    }

    const { executeBulkAction: execBulk } = await import(
      "@/lib/vacancy-pipeline/bulk-action.service"
    );
    const result = await execBulk(user.id, actionType, itemIds);

    return { success: true, data: result };
  } catch (error) {
    return handleError(error, "errors.executeBulkAction");
  }
}
