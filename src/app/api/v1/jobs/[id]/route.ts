import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { actionToResponse, errorResponse, noContentResponse } from "@/lib/api/response";
import { UpdateJobSchema, isValidUUID } from "@/lib/api/schemas";
import { findOrCreate, JOB_DETAIL_SELECT, JOB_API_SELECT } from "@/lib/api/helpers";

/** CORS preflight */
export const OPTIONS = withApiAuth(async () => new Response(null));

/**
 * GET /api/v1/jobs/:id — Get a single job with full details.
 */
export const GET = withApiAuth(async (_req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: JOB_DETAIL_SELECT,
  });

  if (!job) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  return actionToResponse({ success: true, data: job });
});

/**
 * PATCH /api/v1/jobs/:id — Partial update a job.
 */
export const PATCH = withApiAuth(async (req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  // Verify ownership + fetch version for optimistic locking (S3-D3)
  const existing = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, version: true },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = UpdateJobSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  }

  const { version: expectedVersion, ...updates } = parsed.data;

  // Optimistic locking: reject if caller's expected version is stale (S3-D3)
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return errorResponse("CONFLICT", "Resource was modified by another request. Refresh and retry.", 409);
  }

  if (Object.keys(updates).length === 0) {
    return errorResponse("VALIDATION_ERROR", "No fields to update", 400);
  }

  const result = await buildUpdateData(updates, userId);
  if ("error" in result) {
    return result.error;
  }

  // Always increment version on update
  result.data.version = { increment: 1 };

  const job = await prisma.job.update({
    where: { id: jobId },
    data: result.data,
    select: JOB_API_SELECT,
  });

  return actionToResponse({ success: true, data: job });
});

/**
 * DELETE /api/v1/jobs/:id — Delete a job.
 */
export const DELETE = withApiAuth(async (_req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  const existing = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true, _count: { select: { Interview: true } } },
  });
  if (!existing) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  // Delete related interviews first (no cascade in schema, ADR-015 defense-in-depth)
  await prisma.interview.deleteMany({ where: { jobId, job: { userId } } });
  await prisma.job.delete({ where: { id: jobId } });

  return noContentResponse();
});

// --- PATCH helper ---

type UpdateFields = Partial<{
  title: string;
  company: string;
  location: string | null;
  source: string | null;
  type: string;
  salaryRange: string | null;
  dueDate: string | null;
  dateApplied: string | null;
  jobDescription: string;
  jobUrl: string | null;
  applied: boolean;
  resume: string | null;
  tags: string[];
}>;

type BuildResult =
  | { data: Record<string, unknown> }
  | { error: Response };

/**
 * Build the Prisma `data` object from validated PATCH fields.
 * Resolves relations in parallel where possible.
 */
async function buildUpdateData(
  updates: UpdateFields,
  userId: string,
): Promise<BuildResult> {
  const data: Record<string, unknown> = {};

  // 1. Resolve independent relation lookups in parallel
  // Use separate variables for resolver results to avoid polluting the Prisma data object (BS-02)
  const resolvers: Promise<void>[] = [];

  if (updates.title !== undefined) {
    resolvers.push(
      findOrCreate("jobTitle", userId, updates.title).then((r) => {
        data.jobTitleId = r.id;
      }),
    );
  }
  if (updates.company !== undefined) {
    resolvers.push(
      findOrCreate("company", userId, updates.company).then((r) => {
        data.companyId = r.id;
      }),
    );
  }
  if (updates.location !== undefined) {
    if (updates.location) {
      resolvers.push(
        findOrCreate("location", userId, updates.location).then((r) => {
          data.locationId = r.id;
        }),
      );
    } else {
      data.locationId = null;
    }
  }
  if (updates.source !== undefined) {
    if (updates.source) {
      resolvers.push(
        findOrCreate("jobSource", userId, updates.source).then((r) => {
          data.jobSourceId = r.id;
        }),
      );
    } else {
      data.jobSourceId = null;
    }
  }

  await Promise.all(resolvers);

  // 2. Map simple scalar fields
  if (updates.type !== undefined) data.jobType = updates.type;
  if (updates.salaryRange !== undefined) data.salaryRange = updates.salaryRange || null;
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  if (updates.dateApplied !== undefined) data.appliedDate = updates.dateApplied ? new Date(updates.dateApplied) : null;
  if (updates.jobDescription !== undefined) data.description = updates.jobDescription;
  if (updates.jobUrl !== undefined) data.jobUrl = updates.jobUrl || null;
  if (updates.applied !== undefined) data.applied = updates.applied;

  // 3. Validate ownership for resume and tags
  if (updates.resume !== undefined) {
    if (updates.resume) {
      const ownedResume = await prisma.resume.findFirst({
        where: { id: updates.resume, profile: { userId } },
        select: { id: true },
      });
      if (!ownedResume) {
        return { error: errorResponse("VALIDATION_ERROR", "Invalid resume ID", 400) };
      }
    }
    data.resumeId = updates.resume || null;
  }

  if (updates.tags !== undefined) {
    if (updates.tags.length > 0) {
      const ownedTags = await prisma.tag.count({
        where: { id: { in: updates.tags }, createdBy: userId },
      });
      if (ownedTags !== updates.tags.length) {
        return { error: errorResponse("VALIDATION_ERROR", "One or more invalid tag IDs", 400) };
      }
    }
    data.tags = { set: updates.tags.map((id) => ({ id })) };
  }

  return { data };
}
