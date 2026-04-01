import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { actionToResponse, errorResponse, noContentResponse } from "@/lib/api/response";
import { UpdateJobSchema } from "@/lib/api/schemas";

/** CORS preflight */
export const OPTIONS = withApiAuth(async () => new Response(null));

/**
 * GET /api/v1/jobs/:id — Get a single job with full details.
 */
export const GET = withApiAuth(async (_req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    include: {
      JobSource: true,
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      Resume: { include: { File: { select: { id: true, fileName: true, fileType: true } } } },
      tags: true,
    },
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
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  // Verify ownership
  const existing = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true },
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

  const updates = parsed.data;
  if (Object.keys(updates).length === 0) {
    return errorResponse("VALIDATION_ERROR", "No fields to update", 400);
  }
  const data: Record<string, unknown> = {};

  // Map API fields to Prisma fields, resolving relations as needed
  if (updates.title !== undefined) {
    const jobTitle = await findOrCreate("jobTitle", userId, updates.title);
    data.jobTitleId = jobTitle.id;
  }
  if (updates.company !== undefined) {
    const company = await findOrCreate("company", userId, updates.company);
    data.companyId = company.id;
  }
  if (updates.location !== undefined) {
    if (updates.location) {
      const location = await findOrCreate("location", userId, updates.location);
      data.locationId = location.id;
    } else {
      data.locationId = null;
    }
  }
  if (updates.status !== undefined) {
    const status = await prisma.jobStatus.findFirst({
      where: { value: updates.status },
    });
    if (!status) {
      return errorResponse("VALIDATION_ERROR", "Invalid job status", 400);
    }
    data.statusId = status.id;
  }
  if (updates.source !== undefined) {
    if (updates.source) {
      const source = await findOrCreate("jobSource", userId, updates.source);
      data.jobSourceId = source.id;
    } else {
      data.jobSourceId = null;
    }
  }
  if (updates.type !== undefined) data.jobType = updates.type;
  if (updates.salaryRange !== undefined) data.salaryRange = updates.salaryRange || null;
  if (updates.dueDate !== undefined) data.dueDate = updates.dueDate ? new Date(updates.dueDate) : null;
  if (updates.dateApplied !== undefined) data.appliedDate = updates.dateApplied ? new Date(updates.dateApplied) : null;
  if (updates.jobDescription !== undefined) data.description = updates.jobDescription;
  if (updates.jobUrl !== undefined) data.jobUrl = updates.jobUrl || null;
  if (updates.applied !== undefined) data.applied = updates.applied;
  if (updates.resume !== undefined) {
    if (updates.resume) {
      const ownedResume = await prisma.resume.findFirst({
        where: { id: updates.resume, profile: { userId } },
        select: { id: true },
      });
      if (!ownedResume) {
        return errorResponse("VALIDATION_ERROR", "Invalid resume ID", 400);
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
        return errorResponse("VALIDATION_ERROR", "One or more invalid tag IDs", 400);
      }
    }
    data.tags = { set: updates.tags.map((id) => ({ id })) };
  }

  const job = await prisma.job.update({
    where: { id: jobId },
    data,
    include: {
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      JobSource: true,
      tags: true,
    },
  });

  return actionToResponse({ success: true, data: job });
});

/**
 * DELETE /api/v1/jobs/:id — Delete a job.
 */
export const DELETE = withApiAuth(async (_req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(jobId)) {
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

// --- Helper using upsert to avoid TOCTOU race conditions ---

type EntityType = "jobTitle" | "company" | "location" | "jobSource";

const COMPOSITE_KEY_MAP: Record<EntityType, string> = {
  jobTitle: "value_createdBy",
  company: "value_createdBy",
  location: "value_createdBy",
  jobSource: "value_createdBy",
};

async function findOrCreate(type: EntityType, userId: string, label: string) {
  const value = label.trim().toLowerCase();
  const model = prisma[type] as any;
  const compositeKey = COMPOSITE_KEY_MAP[type];

  return model.upsert({
    where: { [compositeKey]: { value, createdBy: userId } },
    update: {},
    create: { label: label.trim(), value, createdBy: userId },
  });
}
