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
import { APP_CONSTANTS } from "@/lib/constants";

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

    // Tab-based filtering
    if (tab === "archived") {
      whereClause.archivedAt = { not: null };
    } else if (tab === "trashed") {
      whereClause.trashedAt = { not: null };
    } else {
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
      prisma.stagedVacancy.findMany({
        where: whereClause,
        include: { automation: { select: { id: true, name: true } } },
        orderBy: { discoveredAt: "desc" },
        skip: offset,
        take: safeTake,
      }),
      prisma.stagedVacancy.count({ where: whereClause }),
    ]);

    return {
      success: true,
      data: data.map(toStagedVacancy) as StagedVacancyWithAutomation[],
      total,
    };
  } catch (error) {
    return handleError(error, "Failed to fetch staged vacancies");
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
    return handleError(error, "Failed to fetch staged vacancy");
  }
}

/**
 * Dismiss a staged vacancy.
 */
export async function dismissStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy>> {
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

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { status: "dismissed" },
    });

    console.debug("[DomainEvent] VacancyDismissed", { stagedVacancyId: id, userId: user.id });
    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "Failed to dismiss staged vacancy");
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
    return handleError(error, "Failed to restore staged vacancy");
  }
}

/**
 * Archive a staged vacancy.
 */
export async function archiveStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy>> {
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

    console.debug("[DomainEvent] VacancyArchived", { stagedVacancyId: id, userId: user.id });
    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "Failed to archive staged vacancy");
  }
}

/**
 * Move a staged vacancy to trash.
 */
export async function trashStagedVacancy(
  id: string,
): Promise<ActionResult<StagedVacancy>> {
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

    console.debug("[DomainEvent] VacancyTrashed", { stagedVacancyId: id, userId: user.id });
    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "Failed to trash staged vacancy");
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

    return { success: true, data: toStagedVacancy(updated) as StagedVacancy };
  } catch (error) {
    return handleError(error, "Failed to restore from trash");
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
    return handleError(error, "Failed to fetch staged vacancy counts");
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
    return handleError(error, "Failed to promote staged vacancy");
  }
}
