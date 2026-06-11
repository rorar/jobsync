import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { paginatedResponse, createdResponse, errorResponse } from "@/lib/api/response";
import { JobsListQuerySchema, CreateJobSchema } from "@/lib/api/schemas";
import { findOrCreate, resolveStatus, JOB_LIST_SELECT, JOB_API_SELECT } from "@/lib/api/helpers";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { buildJobSalaryData } from "@/lib/salary/build-job-salary";
import { parseSalaryRange } from "@/lib/salary/parse-salary-range";

/** CORS preflight */
export const OPTIONS = withApiAuth(async () => new Response(null));

/**
 * GET /api/v1/jobs — List jobs with pagination, filtering, and search.
 */
export const GET = withApiAuth(async (req, { userId }) => {
  const url = new URL(req.url);
  const parsed = JobsListQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
    filter: url.searchParams.get("filter") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  const { page, perPage, filter, search } = parsed.data;
  const skip = (page - 1) * perPage;

  const whereClause: Record<string, unknown> = { userId };

  if (filter) {
    whereClause.Status = { value: filter };
  }

  if (search) {
    whereClause.OR = [
      { JobTitle: { label: { contains: search, mode: 'insensitive' } } },
      { Company: { label: { contains: search, mode: 'insensitive' } } },
      { Location: { label: { contains: search, mode: 'insensitive' } } },
      { description: { contains: search, mode: 'insensitive' } },
    ];
  }

  const [data, total] = await Promise.all([
    prisma.job.findMany({
      where: whereClause,
      skip,
      take: perPage,
      select: JOB_LIST_SELECT,
      orderBy: { createdAt: "desc" },
    }),
    prisma.job.count({ where: whereClause }),
  ]);

  return paginatedResponse(data, total, page, perPage);
});

/**
 * POST /api/v1/jobs — Create a new job.
 */
export const POST = withApiAuth(async (req, { userId }) => {
  const body = await req.json().catch(() => null);
  if (!body) {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = CreateJobSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  }

  const {
    title, company, recruitingCompany, relationshipType, location, type, status, source,
    salaryRange, salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryBonus,
    dueDate, dateApplied, jobDescription, jobUrl,
    applied, resume, tags,
  } = parsed.data;

  // Welle 3 (F-AJ-08): recruiter triangle. recruitingCompany is an optional NAME
  // string; a trimmed-empty / null value means "no recruiter" (never a "" upsert).
  const recruiterName = recruitingCompany || null;

  // Structured salary wins; fall back to parsing a legacy free-text salaryRange.
  const hasStructured =
    salaryMin != null || salaryMax != null || salaryCurrency != null ||
    salaryPeriod != null || salaryBonus != null;
  const salaryData = buildJobSalaryData(
    hasStructured
      ? { salaryMin, salaryMax, salaryCurrency, salaryPeriod, salaryBonus }
      : salaryRange
        ? { ...parseSalaryRange(salaryRange), salaryRangeFallback: salaryRange }
        : {},
  );

  // Check if companies already exist before find-or-create (for CompanyCreated events).
  // Mirror the hiring-company pre-check for the recruiting company.
  const [existingCompany, existingRecruitingCompany] = await Promise.all([
    prisma.company.findFirst({
      where: { value: company.trim().toLowerCase(), createdBy: userId },
      select: { id: true },
    }),
    recruiterName
      ? prisma.company.findFirst({
          where: { value: recruiterName.trim().toLowerCase(), createdBy: userId },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);

  // Resolve all independent entities in parallel
  const [jobTitle, companyRecord, recruitingCompanyRecord, locationRecord, sourceRecord, statusRecord] =
    await Promise.all([
      findOrCreate("jobTitle", userId, title),
      findOrCreate("company", userId, company),
      recruiterName ? findOrCreate("company", userId, recruiterName) : Promise.resolve(null),
      location ? findOrCreate("location", userId, location) : null,
      source ? findOrCreate("jobSource", userId, source) : null,
      resolveStatus(status ?? "draft"),
    ]);

  if (!statusRecord) {
    return errorResponse("VALIDATION_ERROR", "Invalid job status", 400);
  }

  const tagIds = tags ?? [];

  // Validate resume ownership (IDOR prevention)
  if (resume) {
    const ownedResume = await prisma.resume.findFirst({
      where: { id: resume, profile: { userId } },
      select: { id: true },
    });
    if (!ownedResume) {
      return errorResponse("VALIDATION_ERROR", "Invalid resume ID", 400);
    }
  }

  // Validate tag ownership (IDOR prevention)
  if (tagIds.length > 0) {
    const ownedTags = await prisma.tag.count({
      where: { id: { in: tagIds }, createdBy: userId },
    });
    if (ownedTags !== tagIds.length) {
      return errorResponse("VALIDATION_ERROR", "One or more invalid tag IDs", 400);
    }
  }

  // Create job + initial JobStatusHistory atomically
  const [job, historyEntry] = await prisma.$transaction(async (tx) => {
    const newJob = await tx.job.create({
      data: {
        userId,
        jobTitleId: jobTitle.id,
        companyId: companyRecord.id,
        recruitingCompanyId: recruitingCompanyRecord?.id ?? null,
        relationshipType: relationshipType ?? null,
        locationId: locationRecord?.id ?? null,
        statusId: statusRecord.id,
        jobSourceId: sourceRecord?.id ?? null,
        ...salaryData,
        createdAt: new Date(),
        dueDate: dueDate ? new Date(dueDate) : null,
        appliedDate: dateApplied ? new Date(dateApplied) : null,
        description: jobDescription,
        jobType: type,
        jobUrl: jobUrl || null,
        applied,
        resumeId: resume ?? null,
        ...(tagIds.length > 0
          ? { tags: { connect: tagIds.map((id) => ({ id })) } }
          : {}),
      },
      select: JOB_API_SELECT,
    });

    const history = await tx.jobStatusHistory.create({
      data: {
        jobId: newJob.id,
        userId,
        previousStatusId: null,
        newStatusId: statusRecord.id,
        note: null,
      },
    });

    return [newJob, history] as const;
  });

  // S6a: audit the Job creation via the public API (actor = API-key user).
  writeDataAuditLog({
    actorId: userId,
    action: "job.create",
    targetType: "job",
    targetId: job.id,
  });

  // Emit JobStatusChanged for the initial status assignment
  emitEvent(
    createEvent(DomainEventTypes.JobStatusChanged, {
      jobId: job.id,
      userId,
      previousStatusValue: null,
      newStatusValue: statusRecord.value ?? "draft",
      historyEntryId: historyEntry.id,
    }),
  );

  // Emit CompanyCreated only when the company was newly created
  if (!existingCompany) {
    emitEvent(
      createEvent(DomainEventTypes.CompanyCreated, {
        companyId: companyRecord.id,
        companyName: company,
        userId,
      }),
    );
  }

  // Emit CompanyCreated for a newly-created recruiting company too — but never a
  // duplicate when it resolved to the same record as the hiring company (edge 4).
  if (
    recruitingCompanyRecord &&
    !existingRecruitingCompany &&
    recruitingCompanyRecord.id !== companyRecord.id
  ) {
    emitEvent(
      createEvent(DomainEventTypes.CompanyCreated, {
        companyId: recruitingCompanyRecord.id,
        companyName: recruiterName!,
        userId,
      }),
    );
  }

  return createdResponse(job);
});
