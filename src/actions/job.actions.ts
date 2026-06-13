"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { AddJobFormSchema } from "@/models/addJobForm.schema";
import { ActionResult } from "@/models/actionResult";
import { JOB_TYPES, JobStatus, JobResponse, JobSource, JobLocation, isValidRelationshipType } from "@/models/job.model";
import { getCurrentUser } from "@/utils/user.utils";
import { APP_CONSTANTS } from "@/lib/constants";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { isValidCategoryTransitionByKind, appliedSideEffectByKind } from "@/lib/crm/status-transition";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { buildJobSalaryData } from "@/lib/salary/build-job-salary";

export const getStatusList = async (): Promise<ActionResult<JobStatus[]>> => {
  try {
    // Welle 4: JobStatus is now PER-USER (ADR-015). Scope by userId — a global
    // findMany would leak every user's statuses.
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const statuses = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      // Welle 4: carry the stage (category) so the form ComboBox, Kanban and
      // applied-derivation read workflow semantics without a second query.
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });
    return { success: true, data: statuses };
  } catch (error) {
    const msg = "errors.fetchStatusList";
    return handleError(error, msg);
  }
};

export const getJobSourceList = async (): Promise<ActionResult<JobSource[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const list = await prisma.jobSource.findMany({
      where: {
        createdBy: user.id,
      },
    });
    return { success: true, data: list };
  } catch (error) {
    const msg = "errors.fetchJobSourceList";
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
    // CON-H06 — clamp pagination parameters
    const MAX_LIMIT = 200;
    const safePage = Math.max(1, Math.floor(page));
    const safeLimit = Math.min(Math.max(1, Math.floor(limit)), MAX_LIMIT);

    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }
    const skip = (safePage - 1) * safeLimit;

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
        take: safeLimit,
        select: {
          id: true,
          userId: true,
          createdAt: true,
          JobSource: true,
          JobTitle: true,
          jobType: true,
          Company: true,
          // Welle 3 (F-AJ-08): recruiter triangle — needed to prefill the edit form.
          relationshipType: true,
          RecruitingCompany: { select: { id: true, label: true, value: true } },
          Status: true,
          Location: true,
          dueDate: true,
          appliedDate: true,
          salaryRange: true,
          salaryMin: true,
          salaryMax: true,
          salaryCurrency: true,
          salaryPeriod: true,
          salaryBonus: true,
          jobUrl: true,
          applied: true,
          description: false,
          Resume: {
            select: {
              id: true,
              profileId: true,
              title: true,
              createdAt: true,
              updatedAt: true,
              FileId: true,
              File: { select: { id: true, fileName: true, fileType: true } },
            },
          },
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
    // Narrow cast: Prisma returns Resume.File as `| null` but profile.model.ts
    // declares it as `File?: File` (optional, not nullable). Same pattern as getJobDetails.
    return { success: true, data: data as unknown as JobResponse[], total };
  } catch (error) {
    return handleError(error, "errors.fetchJobsList");
  }
};

export async function* getJobsIterator(filter?: string, pageSize = 200) {
  const user = await getCurrentUser();
  if (!user) {
    throw new Error("errors.notAuthenticated");
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
        // Welle 4: carry the stage so list-row status checks use category.kind.
        Status: { include: { category: true } },
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
      throw new Error("errors.notAuthenticated");
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
        // Welle 4: carry the stage so detail status checks use category.kind.
        Status: { include: { category: true } },
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
    return handleError(error, "errors.fetchJobDetails");
  }
};

export const createLocation = async (
  label: string,
): Promise<ActionResult<JobLocation>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
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
    return handleError(error, "errors.createJobLocation");
  }
};

export const createJobSource = async (
  label: string,
): Promise<ActionResult<JobSource>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
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
    return handleError(error, "errors.createJobSource");
  }
};

export const addJob = async (
  data: z.infer<typeof AddJobFormSchema>,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const {
      title,
      company,
      location,
      type,
      status,
      source,
      dueDate,
      dateApplied,
      jobDescription,
      jobUrl,
      applied,
      resume,
      tags,
      recruitingCompany,
      relationshipType,
    } = data;

    const tagIds = tags ?? [];
    const salaryData = buildJobSalaryData(data);

    // Normalize FK fields: treat empty strings as absent (defense against falsy-bypass)
    const titleId = title || undefined;
    const companyId = company || undefined;
    const locationId = location || undefined;
    const sourceId = source || undefined;
    const resumeId = resume || undefined;
    // Welle 3 (F-AJ-08): recruiter triangle. relationshipType is runtime-validated
    // (erased union, ADR-019); recruitingCompany ownership is verified below.
    const recruitingCompanyId = recruitingCompany || undefined;
    const safeRelationshipType = isValidRelationshipType(relationshipType)
      ? relationshipType
      : null;

    // Required FKs must be present
    if (!titleId || !companyId) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
    }

    // Verify FK ownership (CON-C01 — prevent cross-user FK injection)
    const [titleOwned, companyOwned, locationOwned, sourceOwned, resumeOwned, recruitingOwned] =
      await Promise.all([
        prisma.jobTitle.findFirst({ where: { id: titleId, createdBy: user.id }, select: { id: true } }),
        prisma.company.findFirst({ where: { id: companyId, createdBy: user.id }, select: { id: true } }),
        locationId ? prisma.location.findFirst({ where: { id: locationId, createdBy: user.id }, select: { id: true } }) : true,
        sourceId ? prisma.jobSource.findFirst({ where: { id: sourceId, createdBy: user.id }, select: { id: true } }) : true,
        resumeId ? prisma.resume.findFirst({ where: { id: resumeId, profile: { userId: user.id } }, select: { id: true } }) : true,
        recruitingCompanyId ? prisma.company.findFirst({ where: { id: recruitingCompanyId, createdBy: user.id }, select: { id: true } }) : true,
      ]);

    if (!titleOwned || !companyOwned || !locationOwned || !sourceOwned || !resumeOwned || !recruitingOwned) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
    }

    // Verify tag ownership
    if (tagIds && tagIds.length > 0) {
      const ownedTagCount = await prisma.tag.count({
        where: { id: { in: tagIds }, createdBy: user.id }
      });
      if (ownedTagCount !== tagIds.length) {
        return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
      }
    }

    // Verify statusId exists (F8)
    const statusExists = await prisma.jobStatus.findFirst({
      where: { id: status, userId: user.id },
      select: { id: true },
    });
    if (statusExists === null) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
    }

    // Transaction: create job + initial status history entry
    const [job, historyEntry] = await prisma.$transaction(async (tx) => {
      const newJob = await tx.job.create({
        data: {
          jobTitleId: titleId,
          companyId: companyId,
          locationId: locationId || null,
          statusId: status,
          jobSourceId: sourceId || null,
          ...salaryData,
          recruitingCompanyId: recruitingCompanyId || null,
          relationshipType: safeRelationshipType,
          createdAt: new Date(),
          dueDate: dueDate ?? null,
          appliedDate: dateApplied,
          description: jobDescription,
          jobType: type,
          userId: user.id,
          jobUrl,
          applied,
          resumeId: resumeId || null,
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

    // GDPR audit trail (S6a): record Job creation. Fire-and-forget, non-blocking.
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "job.create",
      targetType: "job",
      targetId: job.id,
    });

    return { data: job, success: true };
  } catch (error) {
    return handleError(error, "errors.createJob");
  }
};

export const updateJob = async (
  data: z.infer<typeof AddJobFormSchema>,
  expectedVersion?: number,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();

    if (!user) {
      throw new Error("errors.notAuthenticated");
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
      dueDate,
      dateApplied,
      jobDescription,
      jobUrl,
      applied,
      resume,
      tags,
      recruitingCompany,
      relationshipType,
    } = data;

    const tagIds = tags ?? [];
    const salaryData = buildJobSalaryData(data);

    // Normalize FK fields: treat empty strings as absent (defense against falsy-bypass)
    const titleId = title || undefined;
    const companyId = company || undefined;
    const locationId = location || undefined;
    const sourceId = source || undefined;
    const resumeId = resume || undefined;
    // Welle 3 (F-AJ-08): recruiter triangle. relationshipType is runtime-validated
    // (erased union, ADR-019); recruitingCompany ownership is verified below.
    const recruitingCompanyId = recruitingCompany || undefined;
    const safeRelationshipType = isValidRelationshipType(relationshipType)
      ? relationshipType
      : null;

    // Required FKs must be present
    if (!titleId || !companyId) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
    }

    // Verify FK ownership (CON-C01 — prevent cross-user FK injection)
    const [titleOwned, companyOwned, locationOwned, sourceOwned, resumeOwned, recruitingOwned] =
      await Promise.all([
        prisma.jobTitle.findFirst({ where: { id: titleId, createdBy: user.id }, select: { id: true } }),
        prisma.company.findFirst({ where: { id: companyId, createdBy: user.id }, select: { id: true } }),
        locationId ? prisma.location.findFirst({ where: { id: locationId, createdBy: user.id }, select: { id: true } }) : true,
        sourceId ? prisma.jobSource.findFirst({ where: { id: sourceId, createdBy: user.id }, select: { id: true } }) : true,
        resumeId ? prisma.resume.findFirst({ where: { id: resumeId, profile: { userId: user.id } }, select: { id: true } }) : true,
        recruitingCompanyId ? prisma.company.findFirst({ where: { id: recruitingCompanyId, createdBy: user.id }, select: { id: true } }) : true,
      ]);

    if (!titleOwned || !companyOwned || !locationOwned || !sourceOwned || !resumeOwned || !recruitingOwned) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
    }

    // Verify tag ownership
    if (tagIds && tagIds.length > 0) {
      const ownedTagCount = await prisma.tag.count({
        where: { id: { in: tagIds }, createdBy: user.id }
      });
      if (ownedTagCount !== tagIds.length) {
        return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" as const };
      }
    }

    // State machine enforcement (F5): validate status transitions via edit form.
    // Fetch the current job to compare status. If the status is changing,
    // validate the transition against the state machine before writing.
    const currentJob = await prisma.job.findFirst({
      where: { id, userId: user.id },
      include: { Status: { include: { category: true } } },
    }).catch(() => null);

    // Optimistic locking: reject if caller's expected version is stale (S3-D3)
    if (expectedVersion !== undefined && currentJob && currentJob.version !== expectedVersion) {
      return { success: false, message: "errors.staleState", errorCode: "STALE_STATE" };
    }

    // Welle 4: a status move is recorded (history + event) when the target differs
    // from the current status, OR when it re-selects the CURRENT status on a
    // self-transition stage (interviewing multi-round). Any other same-status save
    // is a no-op for the state machine (plain field update, no history spam).
    const statusDiffers = !!(currentJob?.Status && status !== currentJob.statusId);
    const selfTransition = !!(
      currentJob?.Status?.category &&
      status === currentJob.statusId &&
      isValidCategoryTransitionByKind(
        currentJob.Status.category.kind,
        currentJob.Status.category.kind,
        { sameStatus: true },
      )
    );
    let newStatus: Awaited<
      ReturnType<typeof prisma.jobStatus.findFirst<{ include: { category: true } }>>
    > | null = null;

    if (statusDiffers) {
      newStatus = await prisma.jobStatus.findFirst({
        where: { id: status, userId: user.id },
        include: { category: true },
      });

      // Welle 4: transition validity is CATEGORY-ordered (per-user custom statuses),
      // not the value-keyed matrix — a custom status' value is not in the old graph.
      if (
        newStatus &&
        !isValidCategoryTransitionByKind(currentJob!.Status.category.kind, newStatus.category.kind)
      ) {
        return {
          success: false,
          message: "errors.invalidTransition",
          errorCode: "INVALID_TRANSITION",
        };
      }
    } else if (selfTransition) {
      // The target IS the current status (same category, already loaded) — logging
      // a new round, not moving stage.
      newStatus = currentJob!.Status;
    }

    const recordTransition = (statusDiffers && !!newStatus) || selfTransition;

    const jobData = {
      jobTitleId: titleId,
      companyId: companyId,
      locationId: locationId || null,
      statusId: status,
      jobSourceId: sourceId || null,
      ...salaryData,
      recruitingCompanyId: recruitingCompanyId || null,
      relationshipType: safeRelationshipType,
      // Coerce undefined -> null so clearing the (now optional) due date
      // actually persists as null instead of being a no-op on update.
      dueDate: dueDate ?? null,
      appliedDate: dateApplied,
      description: jobDescription,
      jobType: type,
      jobUrl,
      applied,
      resumeId: resumeId || null,
      tags: { set: tagIds.map((id) => ({ id })) },
      version: { increment: 1 },
    };

    const jobInclude = {
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      JobSource: true,
      tags: true,
    };

    // GDPR audit trail (S6a): build a before/after diff of CHANGED Job scalar
    // fields only (never Person PII). `currentJob` was fetched above for the
    // ADR-015 IDOR/state-machine check and serves as the "before" snapshot.
    const auditScalarFields = {
      jobTitleId: jobData.jobTitleId,
      companyId: jobData.companyId,
      locationId: jobData.locationId,
      statusId: jobData.statusId,
      jobSourceId: jobData.jobSourceId,
      salaryRange: jobData.salaryRange,
      dueDate: jobData.dueDate,
      appliedDate: jobData.appliedDate,
      description: jobData.description,
      jobType: jobData.jobType,
      jobUrl: jobData.jobUrl,
      applied: jobData.applied,
      resumeId: jobData.resumeId,
    } as const;
    const jobUpdateDiff: Record<string, { before: unknown; after: unknown }> = {};
    if (currentJob) {
      // Value-aware equality so equal Dates (distinct instances) are NOT flagged
      // as changed, keeping the snapshot to genuinely-mutated fields.
      const sameValue = (a: unknown, b: unknown): boolean => {
        if (a instanceof Date && b instanceof Date) {
          return a.getTime() === b.getTime();
        }
        return a === b;
      };
      for (const [field, after] of Object.entries(auditScalarFields)) {
        const before = (currentJob as Record<string, unknown>)[field];
        if (!sameValue(before, after)) {
          jobUpdateDiff[field] = { before, after };
        }
      }
    }
    const writeJobUpdateAudit = () =>
      writeDataAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: "job.update",
        targetType: "job",
        targetId: id,
        beforeAfter:
          Object.keys(jobUpdateDiff).length > 0 ? jobUpdateDiff : undefined,
      });

    if (recordTransition && newStatus) {
      const sideEffects = appliedSideEffectByKind(newStatus.category.kind, currentJob!.appliedDate);
      const previousStatusValue = currentJob!.Status.value;

      const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
        const updated = await tx.job.update({
          where: { id, userId: user.id },
          data: { ...jobData, ...sideEffects },
          include: jobInclude,
        });

        const history = await tx.jobStatusHistory.create({
          data: {
            jobId: id!,
            userId: user.id,
            previousStatusId: currentJob.statusId,
            newStatusId: status!,
            note: null,
          },
        });

        return [updated, history] as const;
      });

      emitEvent(
        createEvent(DomainEventTypes.JobStatusChanged, {
          jobId: id!,
          userId: user.id,
          previousStatusValue,
          newStatusValue: newStatus.value,
          historyEntryId: historyEntry.id,
        }),
      );

      revalidatePath("/dashboard/myjobs", "page");
      revalidatePath("/dashboard", "page");

      writeJobUpdateAudit();

      return { data: updatedJob, success: true };
    }

    const job = await prisma.job.update({
      where: { id, userId: user.id },
      data: jobData,
      include: jobInclude,
    });

    writeJobUpdateAudit();

    return { data: job, success: true };
  } catch (error) {
    return handleError(error, "errors.updateJob");
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
      throw new Error("errors.notAuthenticated");
    }

    // CrmInterview, JobContact, etc. cascade-delete via onDelete: Cascade in schema
    await prisma.job.delete({
      where: {
        id: jobId,
        userId: user.id,
      },
    });

    // GDPR audit trail (S6a): record Job deletion. No snapshot. Fire-and-forget.
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "job.delete",
      targetType: "job",
      targetId: jobId,
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteJob");
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
      throw new Error("errors.notAuthenticated");
    }

    // Resolve names from IDs for the StagedVacancy record (CON-H05 — ownership filter)
    const [jobTitle, company, location] = await Promise.all([
      prisma.jobTitle.findFirst({ where: { id: data.title, createdBy: user.id }, select: { label: true } }),
      prisma.company.findFirst({ where: { id: data.company, createdBy: user.id }, select: { label: true } }),
      data.location
        ? prisma.location.findFirst({ where: { id: data.location, createdBy: user.id }, select: { label: true } })
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
    return handleError(error, "errors.sendJobToQueue");
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
  companyLogoAssetId: string | null;
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
  /** Stage kind of the status (Welle 4: lets the funnel aggregate by stage). */
  categoryKind: string;
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
  // Welle 4: stage of each status so the timeline colours + semantic checks
  // derive from category (kind/colour), not a hardcoded value switch.
  previousStatusKind: string | null;
  previousStatusColour: string | null;
  newStatusKind: string | null;
  newStatusColour: string | null;
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
  expectedFromStatusId?: string,
  expectedVersion?: number,
): Promise<ActionResult<JobResponse>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    // Validate note length (server-side enforcement)
    if (note && note.length > 500) {
      return { success: false, message: "errors.noteTooLong", errorCode: "VALIDATION_ERROR" };
    }

    // Parallel lookups (independent queries)
    const [currentJob, newStatus] = await Promise.all([
      prisma.job.findFirst({
        where: { id: jobId, userId: user.id },
        include: { Status: { include: { category: true } } },
      }),
      prisma.jobStatus.findFirst({
        where: { id: newStatusId, userId: user.id },
        include: { category: true },
      }),
    ]);
    if (!currentJob) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }
    if (!newStatus) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    // Compare-and-swap: reject if caller's expected fromStatus is stale (DAU-2)
    if (expectedFromStatusId !== undefined && currentJob.statusId !== expectedFromStatusId) {
      return { success: false, message: "errors.staleState", errorCode: "STALE_STATE" };
    }

    // Optimistic locking: reject if caller's expected version is stale (S3-D3)
    if (expectedVersion !== undefined && currentJob.version !== expectedVersion) {
      return { success: false, message: "errors.staleState", errorCode: "STALE_STATE" };
    }

    // Validate transition — category-ordered (Welle 4 per-user custom statuses).
    // sameStatus re-selection is valid only on a self-transition stage (interviewing
    // multi-round, Welle 4): it then logs a new round (history + event) below.
    const currentStatusValue = currentJob.Status.value;
    const sameStatus = newStatusId === currentJob.statusId;
    if (
      !isValidCategoryTransitionByKind(
        currentJob.Status.category.kind,
        newStatus.category.kind,
        { sameStatus },
      )
    ) {
      // A same-status re-selection on a NON-self-transition stage is a benign
      // no-op (no history spam), not an error — return the job unchanged. A
      // genuine different-status invalid move is rejected.
      if (sameStatus) {
        const job = await prisma.job.findFirst({
          where: { id: jobId, userId: user.id },
          include: {
            JobTitle: true,
            Company: true,
            Status: true,
            Location: true,
            JobSource: true,
            tags: true,
          },
        });
        if (!job) {
          return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
        }
        return { data: job, success: true };
      }
      return {
        success: false,
        message: "errors.invalidTransition",
        errorCode: "INVALID_TRANSITION",
      };
    }

    // Compute side effects (applied flag derived from the target stage)
    const sideEffects = appliedSideEffectByKind(
      newStatus.category.kind,
      currentJob.appliedDate,
    );

    // Transaction: update job (with version increment) + create history entry
    const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
      const job = await tx.job.update({
        where: { id: jobId, userId: user.id },
        data: {
          statusId: newStatusId,
          version: { increment: 1 },
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

    // GDPR audit trail (S6a): record the status transition with a before/after
    // snapshot (status values only — no Person PII). Fire-and-forget.
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "job.status_change",
      targetType: "job",
      targetId: jobId,
      beforeAfter: {
        status: { before: currentStatusValue, after: newStatus.value },
      },
    });

    return { data: updatedJob, success: true };
  } catch (error) {
    return handleError(error, "errors.changeJobStatus");
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
      throw new Error("errors.notAuthenticated");
    }

    // Fetch the user's statuses to build columns even if empty (ADR-015 per-user).
    // Welle 4: include the stage so collapse derives from category.defaultCollapsed.
    const allStatuses = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      include: { category: true },
      orderBy: [{ category: { sortOrder: "asc" } }, { sortOrder: "asc" }],
    });

    // Single query for all user jobs, ordered by sortOrder then createdAt
    const jobs = await prisma.job.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        JobTitle: { select: { label: true } },
        Company: { select: { label: true, logoUrl: true, logoAssetId: true } },
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
        companyLogoAssetId: job.Company.logoAssetId ?? null,
        location: job.Location?.label ?? null,
        matchScore: job.matchScore,
        dueDate: job.dueDate,
        tags: job.tags,
        sortOrder: job.sortOrder,
        createdAt: job.createdAt,
      });
    }

    // Build columns from ALL the user's statuses, in stage order — NO hardcoded
    // STATUS_ORDER filter (custom statuses' jobs were silently dropped before).
    const columns: KanbanColumn[] = allStatuses
      .map((status) => {
        const columnJobs = jobsByStatus.get(status.value) ?? [];
        return {
          statusId: status.id,
          statusValue: status.value,
          statusLabel: status.label,
          jobCount: columnJobs.length,
          isCollapsed: status.category?.defaultCollapsed ?? false,
          jobs: columnJobs,
        };
      });

    return { success: true, data: { columns } };
  } catch (error) {
    return handleError(error, "errors.loadKanbanBoard");
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
      throw new Error("errors.notAuthenticated");
    }

    // Validate sortOrder: must be a finite number (negative values are valid for insertion ordering)
    if (!Number.isFinite(newSortOrder)) {
      return { success: false, message: "errors.invalidSortOrder", errorCode: "VALIDATION_ERROR" };
    }

    // CON-H04 — note length validation
    if (note && note.length > 500) {
      return { success: false, message: "errors.noteTooLong", errorCode: "VALIDATION_ERROR" as const };
    }

    // Fetch job with ownership check
    const currentJob = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      include: { Status: { include: { category: true } } },
    });
    if (!currentJob) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    // Welle 4: a drop onto a DIFFERENT column is a status move; a drop onto the
    // SAME interviewing column (self-transition stage) logs a new round. Any other
    // same-column drop is a pure reorder (no history) — see the else branch.
    const statusDiffers = newStatusId !== undefined && newStatusId !== currentJob.statusId;
    const selfTransition =
      newStatusId !== undefined &&
      newStatusId === currentJob.statusId &&
      !!currentJob.Status?.category &&
      isValidCategoryTransitionByKind(
        currentJob.Status.category.kind,
        currentJob.Status.category.kind,
        { sameStatus: true },
      );

    if (statusDiffers || selfTransition) {
      // Resolve the target status. A different status is fetched + validated; a
      // self-transition re-selects the current status (same category, loaded).
      let newStatus: Awaited<
        ReturnType<typeof prisma.jobStatus.findFirst<{ include: { category: true } }>>
      >;
      if (statusDiffers) {
        newStatus = await prisma.jobStatus.findFirst({
          where: { id: newStatusId, userId: user.id },
          include: { category: true },
        });
        if (!newStatus) {
          return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
        }
        if (!isValidCategoryTransitionByKind(currentJob.Status.category.kind, newStatus.category.kind)) {
          return {
            success: false,
            message: "errors.invalidTransition",
            errorCode: "INVALID_TRANSITION",
          };
        }
      } else {
        newStatus = currentJob.Status;
      }

      const sideEffects = appliedSideEffectByKind(
        newStatus.category.kind,
        currentJob.appliedDate,
      );

      // Transaction: update job + create history entry
      const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
        const job = await tx.job.update({
          where: { id: jobId, userId: user.id },
          data: {
            sortOrder: newSortOrder,
            statusId: newStatusId,
            version: { increment: 1 },
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

      // GDPR audit trail (S6a): Kanban drag-and-drop status transition.
      writeDataAuditLog({
        actorId: user.id,
        actorEmail: user.email,
        action: "job.status_change",
        targetType: "job",
        targetId: jobId,
        beforeAfter: {
          status: {
            before: currentJob.Status.value,
            after: updatedJob.Status.value,
          },
        },
      });

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
    return handleError(error, "errors.updateKanbanOrder");
  }
};

/**
 * Get status transition history for a job.
 *
 * Spec: specs/crm-workflow.allium (rule GetStatusHistory)
 */
export const getJobStatusHistory = async (
  jobId: string,
  take: number = 50,
  skip: number = 0,
): Promise<ActionResult<StatusHistoryEntry[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    // Clamp pagination parameters
    const safeTake = Math.min(Math.max(1, Math.floor(take)), 200);
    const safeSkip = Math.max(0, Math.floor(skip));

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
        previousStatus: { select: { label: true, value: true, category: { select: { kind: true, colour: true } } } },
        newStatus: { select: { label: true, value: true, category: { select: { kind: true, colour: true } } } },
      },
      orderBy: { changedAt: "asc" },
      take: safeTake,
      skip: safeSkip,
    });

    const entries: StatusHistoryEntry[] = history.map((h) => ({
      id: h.id,
      previousStatusLabel: h.previousStatus?.label ?? null,
      previousStatusValue: h.previousStatus?.value ?? null,
      newStatusLabel: h.newStatus.label,
      newStatusValue: h.newStatus.value,
      note: h.note,
      changedAt: h.changedAt,
      previousStatusKind: h.previousStatus?.category?.kind ?? null,
      previousStatusColour: h.previousStatus?.category?.colour ?? null,
      newStatusKind: h.newStatus.category?.kind ?? null,
      newStatusColour: h.newStatus.category?.colour ?? null,
    }));

    return { success: true, data: entries };
  } catch (error) {
    return handleError(error, "errors.fetchStatusHistory");
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
      throw new Error("errors.notAuthenticated");
    }

    const jobs = await prisma.job.groupBy({
      by: ["statusId"],
      where: { userId: user.id },
      _count: { id: true },
    });

    // Fetch the user's statuses for labels + stage (ADR-015 per-user).
    const allStatuses = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      include: { category: true },
    });
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
          categoryKind: status.category?.kind ?? "",
        };
      })
      .filter((d): d is StatusDistribution => d !== null);

    return { success: true, data: distribution };
  } catch (error) {
    return handleError(error, "errors.fetchStatusDistribution");
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
      throw new Error("errors.notAuthenticated");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      include: { Status: { include: { category: true } } },
    });
    if (!job) {
      return { success: false, message: "errors.notFound", errorCode: "NOT_FOUND" };
    }

    // Welle 4: valid targets derive from the category-ordered transition rule, not
    // a value-keyed matrix. Filter the user's statuses by transition validity.
    const allStatuses = await prisma.jobStatus.findMany({
      where: { userId: user.id },
      include: { category: true },
    });
    const fromKind = job.Status.category.kind;
    // Welle 4: the CURRENT status stays in the list only on a self-transition stage
    // (interviewing multi-round) so the user can re-select it to log another round;
    // every other status is filtered by the category-ordered transition rule.
    const statuses = allStatuses.filter((s) => {
      const sameStatus = s.id === job.statusId;
      return isValidCategoryTransitionByKind(fromKind, s.category.kind, { sameStatus });
    });

    return { success: true, data: statuses };
  } catch (error) {
    return handleError(error, "errors.fetchValidTransitions");
  }
};
