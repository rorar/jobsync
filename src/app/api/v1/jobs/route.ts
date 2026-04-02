import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { paginatedResponse, createdResponse, errorResponse } from "@/lib/api/response";
import { JobsListQuerySchema, CreateJobSchema } from "@/lib/api/schemas";
import { findOrCreate, resolveStatus, JOB_LIST_SELECT, JOB_API_SELECT } from "@/lib/api/helpers";

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
    title, company, location, type, status, source,
    salaryRange, dueDate, dateApplied, jobDescription, jobUrl,
    applied, resume, tags,
  } = parsed.data;

  // Resolve all independent entities in parallel
  const [jobTitle, companyRecord, locationRecord, sourceRecord, statusRecord] =
    await Promise.all([
      findOrCreate("jobTitle", userId, title),
      findOrCreate("company", userId, company),
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

  const job = await prisma.job.create({
    data: {
      userId,
      jobTitleId: jobTitle.id,
      companyId: companyRecord.id,
      locationId: locationRecord?.id ?? null,
      statusId: statusRecord.id,
      jobSourceId: sourceRecord?.id ?? null,
      salaryRange: salaryRange ?? null,
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

  return createdResponse(job);
});
