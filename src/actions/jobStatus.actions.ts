"use server";

/**
 * Job-Status Repository (Welle 4, F-AJ-09).
 *
 * Per-user status + stage-category management. Every query is userId-scoped
 * (ADR-015). These "use server" exports take a statusId/categoryId/label — never
 * a raw userId — so they are not an ADR-019 hazard; the owner comes from the
 * session via getCurrentUser().
 *
 * Spec: specs/job-status.allium (rules CreateJobStatus, RenameJobStatus,
 * ReorderJobStatus, SetDefaultStatus, DeleteUnusedJobStatus,
 * ReassignAndDeleteJobStatus).
 */

import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { revalidatePath } from "next/cache";
import { seedJobStatusesForUser } from "@/lib/crm/seed-job-statuses";

export interface JobStatusCategoryView {
  id: string;
  kind: string;
  label: string;
  colour: string;
  sortOrder: number;
  isAppliedStage: boolean;
  isTerminal: boolean;
  defaultCollapsed: boolean;
  allowsSelfTransition: boolean;
}

export interface JobStatusView {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  isDefault: boolean;
  /** Number of jobs currently in this status (delete-in-use + stage-move impact). */
  jobCount: number;
  category: JobStatusCategoryView;
}

const CATEGORY_SELECT = {
  id: true,
  kind: true,
  label: true,
  colour: true,
  sortOrder: true,
  isAppliedStage: true,
  isTerminal: true,
  defaultCollapsed: true,
  allowsSelfTransition: true,
} as const;

const STATUS_SELECT = {
  id: true,
  value: true,
  label: true,
  sortOrder: true,
  isDefault: true,
  category: { select: CATEGORY_SELECT },
  _count: { select: { jobs: true } },
} as const;

/** Flatten the Prisma `_count.jobs` shape into the JobStatusView `jobCount` field. */
function toStatusView(row: {
  id: string;
  value: string;
  label: string;
  sortOrder: number;
  isDefault: boolean;
  category: JobStatusCategoryView;
  _count: { jobs: number };
}): JobStatusView {
  const { _count, ...rest } = row;
  return { ...rest, jobCount: _count.jobs };
}

const MAX_LABEL_LENGTH = 60;

/** Slugify a label into a stable machine value, unique within the supplied set. */
function slugifyStatusValue(label: string, existing: Set<string>): string {
  const base =
    label
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, MAX_LABEL_LENGTH) || "status";
  if (!existing.has(base)) return base;
  let n = 2;
  while (existing.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/**
 * List the user's statuses, ordered by (category.sortOrder, status.sortOrder).
 * Seeds the default set on first access so the form/Kanban always have data.
 */
export const getJobStatuses = async (): Promise<ActionResult<JobStatusView[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    let rows = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      select: STATUS_SELECT,
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    if (rows.length === 0) {
      await seedJobStatusesForUser(prisma, user.id);
      rows = await prisma.jobStatus.findMany({
        where: { userId: user.id },
        select: STATUS_SELECT,
        orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
      });
    }

    return { success: true, data: rows.map(toStatusView) };
  } catch (error) {
    return handleError(error, "errors.fetchFailed");
  }
};

/** List the user's stage categories, ordered by sortOrder. */
export const getJobStatusCategories = async (): Promise<ActionResult<JobStatusCategoryView[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    const categories = await prisma.jobStatusCategory.findMany({
      where: { userId: user.id },
      select: CATEGORY_SELECT,
      orderBy: { sortOrder: "asc" },
    });
    return { success: true, data: categories };
  } catch (error) {
    return handleError(error, "errors.fetchFailed");
  }
};

/** Create a custom status under one of the user's stage categories. */
export const createJobStatus = async (
  categoryId: string,
  label: string,
): Promise<ActionResult<{ id: string }>> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    const trimmed = label.trim();
    if (!trimmed) return { success: false, message: "errors.statusLabelRequired", errorCode: "VALIDATION_ERROR" };

    // ADR-015: the category must belong to the caller.
    const category = await prisma.jobStatusCategory.findFirst({
      where: { id: categoryId, userId: user.id },
      select: { id: true },
    });
    if (!category) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

    const existing = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      select: { value: true },
    });
    const value = slugifyStatusValue(trimmed, new Set(existing.map((s) => s.value)));

    const created = await prisma.jobStatus.create({
      data: {
        userId: user.id,
        categoryId: category.id,
        label: trimmed.slice(0, MAX_LABEL_LENGTH),
        value,
        isDefault: false,
      },
      select: { id: true },
    });

    revalidatePath("/dashboard/myjobs");
    return { success: true, data: created };
  } catch (error) {
    return handleError(error, "errors.createFailed");
  }
};

/** Rename a status and/or move it to another stage. value is never renamed. */
export const renameJobStatus = async (
  statusId: string,
  newLabel: string,
  newCategoryId: string,
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    const trimmed = newLabel.trim();
    if (!trimmed) return { success: false, message: "errors.statusLabelRequired", errorCode: "VALIDATION_ERROR" };

    const status = await prisma.jobStatus.findFirst({
      where: { id: statusId, userId: user.id },
      select: { id: true },
    });
    if (!status) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

    const category = await prisma.jobStatusCategory.findFirst({
      where: { id: newCategoryId, userId: user.id },
      select: { id: true, isAppliedStage: true },
    });
    if (!category) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

    await prisma.$transaction(async (tx) => {
      await tx.jobStatus.update({
        where: { id: status.id },
        data: { label: trimmed.slice(0, MAX_LABEL_LENGTH), categoryId: category.id },
      });

      // Moving INTO an applied stage recomputes the stored applied flag for the
      // status's jobs so it never drifts from the new stage semantics.
      if (category.isAppliedStage) {
        await tx.job.updateMany({
          where: { userId: user.id, statusId: status.id, applied: false },
          data: { applied: true },
        });
        await tx.job.updateMany({
          where: { userId: user.id, statusId: status.id, applied: true, appliedDate: null },
          data: { appliedDate: new Date() },
        });
      }
    });

    revalidatePath("/dashboard/myjobs");
    return { success: true };
  } catch (error) {
    return handleError(error, "errors.updateFailed");
  }
};

/** Reposition a status within its stage (Kanban column order). */
export const reorderJobStatus = async (
  statusId: string,
  newSortOrder: number,
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    // sortOrder is a RELATIVE ordinal within a stage — negatives are valid and
    // intended (the midpoint reorder helper returns e.g. -1 to move a status
    // above the current top item at sortOrder 0). Only reject non-integers.
    if (!Number.isInteger(newSortOrder)) {
      return { success: false, message: "errors.invalidSortOrder", errorCode: "VALIDATION_ERROR" };
    }

    const result = await prisma.jobStatus.updateMany({
      where: { id: statusId, userId: user.id },
      data: { sortOrder: newSortOrder },
    });
    if (result.count === 0) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

    revalidatePath("/dashboard/myjobs");
    return { success: true };
  } catch (error) {
    return handleError(error, "errors.updateFailed");
  }
};

/** Choose the status new manually-created jobs start in (exactly one per user). */
export const setDefaultJobStatus = async (statusId: string): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    const status = await prisma.jobStatus.findFirst({
      where: { id: statusId, userId: user.id },
      select: { id: true },
    });
    if (!status) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

    await prisma.$transaction([
      prisma.jobStatus.updateMany({
        where: { userId: user.id, isDefault: true },
        data: { isDefault: false },
      }),
      prisma.jobStatus.update({ where: { id: status.id }, data: { isDefault: true } }),
    ]);

    revalidatePath("/dashboard/myjobs");
    return { success: true };
  } catch (error) {
    return handleError(error, "errors.updateFailed");
  }
};

/**
 * Delete a status. If jobs OR history reference it, a reassignment target is
 * required (STATUS_IN_USE otherwise); references are repointed to the target,
 * then the status is removed so no job loses its status. Cannot delete the
 * default status or the user's last remaining status.
 */
export const deleteJobStatus = async (
  statusId: string,
  reassignToId?: string,
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated", errorCode: "UNAUTHORIZED" };

    const status = await prisma.jobStatus.findFirst({
      where: { id: statusId, userId: user.id },
      select: { id: true, isDefault: true },
    });
    if (!status) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    if (status.isDefault) {
      return { success: false, message: "errors.cannotDeleteDefaultStatus", errorCode: "VALIDATION_ERROR" };
    }

    const total = await prisma.jobStatus.count({ where: { userId: user.id } });
    if (total <= 1) {
      return { success: false, message: "errors.cannotDeleteLastStatus", errorCode: "VALIDATION_ERROR" };
    }

    const [jobCount, historyCount] = await Promise.all([
      prisma.job.count({ where: { userId: user.id, statusId: status.id } }),
      prisma.jobStatusHistory.count({ where: { userId: user.id, newStatusId: status.id } }),
    ]);
    const inUse = jobCount > 0 || historyCount > 0;

    if (inUse) {
      if (!reassignToId) {
        return { success: false, message: "errors.statusInUse", errorCode: "REFERENCE_ERROR" };
      }
      const target = await prisma.jobStatus.findFirst({
        where: { id: reassignToId, userId: user.id },
        select: { id: true },
      });
      if (!target || target.id === status.id) return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };

      await prisma.$transaction([
        prisma.job.updateMany({
          where: { userId: user.id, statusId: status.id },
          data: { statusId: target.id },
        }),
        prisma.jobStatusHistory.updateMany({
          where: { userId: user.id, newStatusId: status.id },
          data: { newStatusId: target.id },
        }),
        prisma.jobStatusHistory.updateMany({
          where: { userId: user.id, previousStatusId: status.id },
          data: { previousStatusId: target.id },
        }),
        prisma.jobStatus.delete({ where: { id: status.id } }),
      ]);
    } else {
      await prisma.jobStatus.delete({ where: { id: status.id } });
    }

    revalidatePath("/dashboard/myjobs");
    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteFailed");
  }
};
