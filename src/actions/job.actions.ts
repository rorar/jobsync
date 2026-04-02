"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { AddJobFormSchema } from "@/models/addJobForm.schema";
import { ActionResult } from "@/models/actionResult";
import { JOB_TYPES, JobStatus, JobResponse, JobSource, JobLocation } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidTransition, computeTransitionSideEffects, getValidTargets, STATUS_ORDER, COLLAPSED_BY_DEFAULT } from "@/lib/crm/status-machine";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";

export const getStatusList = async (): Promise<ActionResult<JobStatus[]>> => {
  try {
    // Auth check gates access — only logged-in users can fetch status list.
    // JobStatus is a system-wide lookup table, not user-scoped — no userId filter needed.
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    const statuses = await prisma.jobStatus.findMany();
    return { success: true, data: statuses };
  } catch (error) {
    const msg = "Failed to fetch status list. ";
    return handleError(error, msg);
  }
};

export const getJobSourceList = async (): Promise<ActionResult<JobSource[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }
    const list = await prisma.jobSource.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: list };
  } catch (error) {
    const msg = "Failed to fetch job source list. ";
    return handleError(error, msg);
  }
};

export const getJobsList = async (
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE,
  filter?: string,
  search?: string,
): Promise<ActionResult<JobResponse[]>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }
    const skip = (page - 1) * limit;

    const filterBy = filter
      ? filter === Object.keys(JOB_TYPES)[1]
        ? {
            jobType: filter,
          }
        : {
            Status: {
              value: filter,
            },
          }
      : {};

    const whereClause: any = {
      userId: user.id,
      ...filterBy,
    };

    if (search) {
      whereClause.OR = [
        { JobTitle: { label: { contains: search } } },
        { Company: { label: { contains: search } } },
        { Location: { label: { contains: search } } },
        { description: { contains: search } },
      ];
    }

    const [data, total] = await Promise.all([
      prisma.job.findMany({
        where: whereClause,
        skip,
        take: limit,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          JobSource: true,
          JobTitle: true,
          jobType: true,
          Company: true,
          Status: true,
          Location: true,
          dueDate: true,
          appliedDate: true,
          salaryRange: true,
          jobUrl: true,
          applied: true,
          description: false,
          Resume: true,
          matchScore: true,
          _count: { select: { Notes: true } },
        },
        orderBy: {
          createdAt: "desc",
          // appliedDate: "desc",
        },
      }),
      prisma.job.count({
        where: whereClause,
      }),
    ]);
    return { success: true, data, total };
  } catch (error) {
    const msg = "Failed to fetch jobs list. ";
    return handleError(error, msg);
  }
};

export async function* getJobsIterator(filter?: string, pageSize = 200) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("Not authenticated");
  }
  let page = 1;
  let fetchedCount = 0;

  while (true) {
    const skip = (page - 1) * pageSize;
    const filterBy = filter
      ? filter === Object.keys(JOB_TYPES)[1]
        ? { status: filter }
        : { type: filter }
      : {};

    const chunk = await prisma.job.findMany({
      where: {
        userId: user.id,
        ...filterBy,
      },
      select: {
        id: true,
        createdAt: true,
        JobSource: true,
        JobTitle: true,
        jobType: true,
        Company: true,
        Status: true,
        Location: true,
        dueDate: true,
        applied: true,
        appliedDate: true,
      },
      skip,
      take: pageSize,
      orderBy: { createdAt: "desc" },
    });

    if (!chunk.length) {
      break;
    }

    yield chunk;
    fetchedCount += chunk.length;
    page++;
  }
}

export const getJobDetails = async (
  jobId: string,
): Promise<ActionResult<JobResponse>> => {
  try {
    if (!jobId) {
      throw new Error("Please provide job id");
    }
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const job = await prisma.job.findFirst({
      where: {
        id: jobId,
        userId: user.id,
      },
      include: {
        JobSource: true,
        JobTitle: true,
        Company: true,
        Status: true,
        Location: true,
        Resume: {
          include: {
            File: { select: { id: true, fileName: true, fileType: true } },
          },
        },
        tags: true,
      },
    });
    // Narrow cast: Prisma returns Resume.File as `| null` but profile.model.ts
    // declares it as `File?: File` (optional, not nullable). Fix profile.model.ts
    // to fully remove this cast.
    return { data: (job ?? undefined) as JobResponse | undefined, success: true };
  } catch (error) {
    const msg = "Failed to fetch job details. ";
    return handleError(error, msg);
  }
};

export const createLocation = async (
  label: string,
): Promise<ActionResult<JobLocation>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const value = label.trim().toLowerCase();

    if (!value) {
      throw new Error("Please provide location name");
    }

    const existing = await prisma.location.findFirst({
      where: { value, createdBy: user.id },
    });
    if (existing) {
      return { data: existing, success: true };
    }

    const location = await prisma.location.create({
      data: { label, value, createdBy: user.id },
    });

    return { data: location, success: true };
  } catch (error) {
    const msg = "Failed to create job location. ";
    return handleError(error, msg);
  }
};

export const createJobSource = async (
  label: string,
): Promise<ActionResult<JobSource>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const value = label.trim().toLowerCase();

    if (!value) {
      throw new Error("Please provide job source name");
    }

    const existing = await prisma.jobSource.findFirst({
      where: { value, createdBy: user.id },
    });
    if (existing) {
      return { data: existing, success: true };
    }

    const jobSource = await prisma.jobSource.create({
      data: { label, value, createdBy: user.id },
    });

    return { data: jobSource, success: true };
  } catch (error) {
    const msg = "Failed to create job source. ";
    return handleError(error, msg);
  }
};

export const addJob = async (
  data: z.infer<typeof AddJobFormSchema>,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    const {
      title,
      company,
      location,
      type,
      status,
      source,
      salaryRange,
      dueDate,
      dateApplied,
      jobDescription,
      jobUrl,
      applied,
      resume,
      tags,
    } = data;

    const tagIds = tags ?? [];

    // Transaction: create job + initial status history entry
    const [job, historyEntry] = await prisma.$transaction(async (tx) => {
      const newJob = await tx.job.create({
        data: {
          jobTitleId: title,
          companyId: company,
          locationId: location,
          statusId: status,
          jobSourceId: source,
          salaryRange: salaryRange,
          createdAt: new Date(),
          dueDate: dueDate,
          appliedDate: dateApplied,
          description: jobDescription,
          jobType: type,
          userId: user.id,
          jobUrl,
          applied,
          resumeId: resume || null,
          ...(tagIds.length > 0
            ? { tags: { connect: tagIds.map((id) => ({ id })) } }
            : {}),
        },
        include: {
          JobTitle: true,
          Company: true,
          Status: true,
          Location: true,
          JobSource: true,
          tags: true,
        },
      });

      const history = await tx.jobStatusHistory.create({
        data: {
          jobId: newJob.id,
          userId: user.id,
          previousStatusId: null,
          newStatusId: status,
          note: null,
          changedAt: new Date(),
        },
      });

      return [newJob, history] as const;
    });

    // Publish domain event AFTER transaction commits
    emitEvent(
      createEvent(DomainEventTypes.JobStatusChanged, {
        jobId: job.id,
        userId: user.id,
        previousStatusValue: null,
        newStatusValue: job.Status.value,
        note: undefined,
        historyEntryId: historyEntry.id,
      }),
    );

    return { data: job, success: true };
  } catch (error) {
    const msg = "Failed to create job. ";
    return handleError(error, msg);
  }
};

export const updateJob = async (
  data: z.infer<typeof AddJobFormSchema>,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }
    if (!data.id) {
      throw new Error("Id is not provided");
    }

    const {
      id,
      title,
      company,
      location,
      type,
      status,
      source,
      salaryRange,
      dueDate,
      dateApplied,
      jobDescription,
      jobUrl,
      applied,
      resume,
      tags,
    } = data;

    const tagIds = tags ?? [];

    const job = await prisma.job.update({
      where: {
        id,
        userId: user.id,
      },
      data: {
        jobTitleId: title,
        companyId: company,
        locationId: location,
        statusId: status,
        jobSourceId: source,
        salaryRange: salaryRange,
        dueDate: dueDate,
        appliedDate: dateApplied,
        description: jobDescription,
        jobType: type,
        jobUrl,
        applied,
        resumeId: resume || null,
        tags: { set: tagIds.map((id) => ({ id })) },
      },
      include: {
        JobTitle: true,
        Company: true,
        Status: true,
        Location: true,
        JobSource: true,
        tags: true,
      },
    });
    // revalidatePath("/dashboard/myjobs", "page");
    return { data: job, success: true };
  } catch (error) {
    const msg = "Failed to update job. ";
    return handleError(error, msg);
  }
};

/**
 * Legacy wrapper — delegates to changeJobStatus so ALL status changes
 * go through the state machine (validation, side effects, history, events).
 */
export const updateJobStatus = async (
  jobId: string,
  status: JobStatus,
): Promise<ActionResult<JobResponse>> => {
  return changeJobStatus(jobId, status.id);
};

export const deleteJobById = async (
  jobId: string,
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("Not authenticated");
    }

    await prisma.job.delete({
      where: {
        id: jobId,
        userId: user.id,
      },
    });
    return { success: true };
  } catch (error) {
    const msg = "Failed to delete job.";
    return handleError(error, msg);
  }
};

/**
 * Create a StagedVacancy from the Add Job form (manual queue option).
 * Instead of creating a Job directly, this sends the entry to the staging queue
 * with source: "manual" for later review.
 */
export const addJobToQueue = async (
  data: z.infer<typeof AddJobFormSchema>,
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Resolve names from IDs for the StagedVacancy record
    const [jobTitle, company, location] = await Promise.all([
      prisma.jobTitle.findUnique({ where: { id: data.title }, select: { label: true } }),
      prisma.company.findUnique({ where: { id: data.company }, select: { label: true } }),
      data.location
        ? prisma.location.findUnique({ where: { id: data.location }, select: { label: true } })
        : null,
    ]);

    if (!jobTitle) throw new Error("Job title not found");
    if (!company) throw new Error("Company not found");

    await prisma.stagedVacancy.create({
      data: {
        userId: user.id,
        sourceBoard: "manual",
        externalId: null,
        sourceUrl: data.jobUrl || null,
        title: jobTitle.label,
        employerName: company.label,
        location: location?.label || null,
        description: data.jobDescription || null,
        salary: null,
        employmentType: data.type || null,
        source: "manual",
        status: "staged",
        discoveredAt: new Date(),
      },
    });

    return { success: true };
  } catch (error) {
    const msg = "Failed to send job to queue.";
    return handleError(error, msg);
  }
};

// =============================================================================
// CRM Core — Status Workflow + Kanban Board
// Spec: specs/crm-workflow.allium
// =============================================================================

/** Type for Kanban board column */
export interface KanbanColumn {
  statusId: string;
  statusValue: string;
  statusLabel: string;
  jobCount: number;
  isCollapsed: boolean;
  jobs: KanbanJob[];
}

/** Lightweight job representation for Kanban cards */
export interface KanbanJob {
  id: string;
  title: string;
  company: string;
  companyLogoUrl: string | null;
  location: string | null;
  matchScore: number | null;
  dueDate: Date | null;
  tags: { id: string; label: string; value: string }[];
  sortOrder: number;
  createdAt: Date;
}

/** Type for Kanban board result */
export interface KanbanBoard {
  columns: KanbanColumn[];
}

/** Type for status distribution */
export interface StatusDistribution {
  statusId: string;
  statusValue: string;
  statusLabel: string;
  count: number;
}

/** Type for status history entry */
export interface StatusHistoryEntry {
  id: string;
  previousStatusLabel: string | null;
  previousStatusValue: string | null;
  newStatusLabel: string;
  newStatusValue: string;
  note: string | null;
  changedAt: Date;
}

/**
 * Change job status with state machine validation, side effects, history,
 * and domain event publishing.
 *
 * Spec: specs/crm-workflow.allium (rule TransitionJobStatus)
 */
export const changeJobStatus = async (
  jobId: string,
  newStatusId: string,
  note?: string,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Validate note length (server-side enforcement)
    if (note && note.length > 500) {
      return { success: false, message: "errors.noteTooLong", errorCode: "VALIDATION_ERROR" };
    }

    // Fetch job with ownership check (IDOR safe)
    const currentJob = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      include: { Status: true },
    });
    if (!currentJob) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    // Get new status
    const newStatus = await prisma.jobStatus.findFirst({
      where: { id: newStatusId },
    });
    if (!newStatus) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    // Validate transition against state machine
    const currentStatusValue = currentJob.Status.value;
    if (!isValidTransition(currentStatusValue, newStatus.value)) {
      return {
        success: false,
        message: "errors.invalidTransition",
        errorCode: "INVALID_TRANSITION",
      };
    }

    // Compute side effects
    const sideEffects = computeTransitionSideEffects(
      newStatus.value,
      currentJob.appliedDate,
    );

    // Transaction: update job + create history entry
    const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
      const job = await tx.job.update({
        where: { id: jobId, userId: user.id },
        data: {
          statusId: newStatusId,
          ...sideEffects,
        },
        include: {
          JobTitle: true,
          Company: true,
          Status: true,
          Location: true,
          JobSource: true,
          tags: true,
        },
      });

      const history = await tx.jobStatusHistory.create({
        data: {
          jobId,
          userId: user.id,
          previousStatusId: currentJob.statusId,
          newStatusId,
          note: note ?? null,
        },
      });

      return [job, history] as const;
    });

    // Publish domain event AFTER transaction commits (eventual consistency)
    emitEvent(
      createEvent(DomainEventTypes.JobStatusChanged, {
        jobId,
        userId: user.id,
        previousStatusValue: currentStatusValue,
        newStatusValue: newStatus.value,
        note: note ?? undefined,
        historyEntryId: historyEntry.id,
      }),
    );

    revalidatePath("/dashboard/myjobs", "page");
    revalidatePath("/dashboard", "page");

    return { data: updatedJob, success: true };
  } catch (error) {
    const msg = "Failed to change job status.";
    return handleError(error, msg);
  }
};

/**
 * Load all jobs grouped by status for Kanban display.
 *
 * Spec: specs/crm-workflow.allium (rule GetKanbanBoard)
 */
export const getKanbanBoard = async (): Promise<ActionResult<KanbanBoard>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Fetch all statuses to build columns even if empty
    const allStatuses = await prisma.jobStatus.findMany();

    // Single query for all user jobs, ordered by sortOrder then createdAt
    const jobs = await prisma.job.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        JobTitle: { select: { label: true } },
        Company: { select: { label: true, logoUrl: true } },
        Location: { select: { label: true } },
        Status: { select: { id: true, value: true, label: true } },
        matchScore: true,
        dueDate: true,
        tags: { select: { id: true, label: true, value: true } },
        sortOrder: true,
        createdAt: true,
        statusId: true,
      },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    });

    // Group jobs by status value
    const jobsByStatus = new Map<string, KanbanJob[]>();
    for (const job of jobs) {
      const statusValue = job.Status.value;
      if (!jobsByStatus.has(statusValue)) {
        jobsByStatus.set(statusValue, []);
      }
      jobsByStatus.get(statusValue)!.push({
        id: job.id,
        title: job.JobTitle.label,
        company: job.Company.label,
        companyLogoUrl: job.Company.logoUrl ?? null,
        location: job.Location?.label ?? null,
        matchScore: job.matchScore,
        dueDate: job.dueDate,
        tags: job.tags,
        sortOrder: job.sortOrder,
        createdAt: job.createdAt,
      });
    }

    // Build status lookup
    const statusMap = new Map(allStatuses.map((s) => [s.value, s]));

    // Build columns in STATUS_ORDER
    const columns: KanbanColumn[] = STATUS_ORDER
      .filter((statusValue) => statusMap.has(statusValue))
      .map((statusValue) => {
        const status = statusMap.get(statusValue)!;
        const columnJobs = jobsByStatus.get(statusValue) ?? [];
        return {
          statusId: status.id,
          statusValue: status.value,
          statusLabel: status.label,
          jobCount: columnJobs.length,
          isCollapsed: COLLAPSED_BY_DEFAULT.includes(statusValue),
          jobs: columnJobs,
        };
      });

    return { success: true, data: { columns } };
  } catch (error) {
    const msg = "Failed to load Kanban board.";
    return handleError(error, msg);
  }
};

/**
 * Update Kanban card position (sortOrder) and optionally status via drag-and-drop.
 *
 * Spec: specs/crm-workflow.allium (rules KanbanDragAndDrop, KanbanReorder)
 */
export const updateKanbanOrder = async (
  jobId: string,
  newSortOrder: number,
  newStatusId?: string,
  note?: string,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Validate sortOrder: must be a finite non-negative number
    if (!Number.isFinite(newSortOrder) || newSortOrder < 0) {
      return { success: false, message: "errors.invalidSortOrder", errorCode: "VALIDATION_ERROR" };
    }

    // Fetch job with ownership check
    const currentJob = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      include: { Status: true },
    });
    if (!currentJob) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    const statusChanged = newStatusId !== undefined && newStatusId !== currentJob.statusId;

    if (statusChanged) {
      // Validate transition
      const newStatus = await prisma.jobStatus.findFirst({
        where: { id: newStatusId },
      });
      if (!newStatus) {
        return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
      }

      if (!isValidTransition(currentJob.Status.value, newStatus.value)) {
        return {
          success: false,
          message: "errors.invalidTransition",
          errorCode: "INVALID_TRANSITION",
        };
      }

      const sideEffects = computeTransitionSideEffects(
        newStatus.value,
        currentJob.appliedDate,
      );

      // Transaction: update job + create history entry
      const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
        const job = await tx.job.update({
          where: { id: jobId, userId: user.id },
          data: {
            sortOrder: newSortOrder,
            statusId: newStatusId,
            ...sideEffects,
          },
          include: {
            JobTitle: true,
            Company: true,
            Status: true,
            Location: true,
            JobSource: true,
            tags: true,
          },
        });

        const history = await tx.jobStatusHistory.create({
          data: {
            jobId,
            userId: user.id,
            previousStatusId: currentJob.statusId,
            newStatusId: newStatusId!,
            note: note ?? null,
          },
        });

        return [job, history] as const;
      });

      // Publish domain event
      emitEvent(
        createEvent(DomainEventTypes.JobStatusChanged, {
          jobId,
          userId: user.id,
          previousStatusValue: currentJob.Status.value,
          newStatusValue: updatedJob.Status.value,
          note: note ?? undefined,
          historyEntryId: historyEntry.id,
        }),
      );

      revalidatePath("/dashboard/myjobs", "page");
      revalidatePath("/dashboard", "page");

      return { data: updatedJob, success: true };
    } else {
      // Same column reorder — no transition, no history, no event
      const updatedJob = await prisma.job.update({
        where: { id: jobId, userId: user.id },
        data: { sortOrder: newSortOrder },
        include: {
          JobTitle: true,
          Company: true,
          Status: true,
          Location: true,
          JobSource: true,
          tags: true,
        },
      });

      revalidatePath("/dashboard/myjobs", "page");
      revalidatePath("/dashboard", "page");

      return { data: updatedJob, success: true };
    }
  } catch (error) {
    const msg = "Failed to update Kanban order.";
    return handleError(error, msg);
  }
};

/**
 * Get status transition history for a job.
 *
 * Spec: specs/crm-workflow.allium (rule GetStatusHistory)
 */
export const getJobStatusHistory = async (
  jobId: string,
): Promise<ActionResult<StatusHistoryEntry[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    // Verify job ownership (IDOR safe)
    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      select: { id: true },
    });
    if (!job) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    const history = await prisma.jobStatusHistory.findMany({
      where: { jobId, userId: user.id },
      include: {
        previousStatus: { select: { label: true, value: true } },
        newStatus: { select: { label: true, value: true } },
      },
      orderBy: { changedAt: "asc" },
    });

    const entries: StatusHistoryEntry[] = history.map((h) => ({
      id: h.id,
      previousStatusLabel: h.previousStatus?.label ?? null,
      previousStatusValue: h.previousStatus?.value ?? null,
      newStatusLabel: h.newStatus.label,
      newStatusValue: h.newStatus.value,
      note: h.note,
      changedAt: h.changedAt,
    }));

    return { success: true, data: entries };
  } catch (error) {
    const msg = "Failed to fetch status history.";
    return handleError(error, msg);
  }
};

/**
 * Get status distribution (count per status) for the current user.
 * Used for dashboard stats and landing page funnel.
 *
 * Spec: specs/crm-workflow.allium (extension point 9.5)
 */
export const getStatusDistribution = async (): Promise<ActionResult<StatusDistribution[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const jobs = await prisma.job.groupBy({
      by: ["statusId"],
      where: { userId: user.id },
      _count: { id: true },
    });

    // Fetch all statuses for labels
    const allStatuses = await prisma.jobStatus.findMany();
    const statusMap = new Map(allStatuses.map((s) => [s.id, s]));

    const distribution: StatusDistribution[] = jobs
      .map((group) => {
        const status = statusMap.get(group.statusId);
        if (!status) return null;
        return {
          statusId: group.statusId,
          statusValue: status.value,
          statusLabel: status.label,
          count: group._count.id,
        };
      })
      .filter((d): d is StatusDistribution => d !== null);

    return { success: true, data: distribution };
  } catch (error) {
    const msg = "Failed to fetch status distribution.";
    return handleError(error, msg);
  }
};

/**
 * Get valid target statuses for a given job (for UI dropdowns and DnD targets).
 */
export const getValidTransitions = async (
  jobId: string,
): Promise<ActionResult<JobStatus[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("Not authenticated");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      include: { Status: true },
    });
    if (!job) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    const validValues = getValidTargets(job.Status.value);

    const statuses = await prisma.jobStatus.findMany({
      where: { value: { in: validValues } },
    });

    return { success: true, data: statuses };
  } catch (error) {
    const msg = "Failed to fetch valid transitions.";
    return handleError(error, msg);
  }
};
