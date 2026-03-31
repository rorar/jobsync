import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { actionToResponse, createdResponse, errorResponse } from "@/lib/api/response";
import { CreateNoteSchema } from "@/lib/api/schemas";

/**
 * GET /api/v1/jobs/:id/notes — List all notes for a job.
 */
export const GET = withApiAuth(async (_req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId) {
    return errorResponse("VALIDATION_ERROR", "Job ID is required", 400);
  }

  // Verify job ownership
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true },
  });
  if (!job) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  const notes = await prisma.note.findMany({
    where: { jobId, userId },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return actionToResponse({ success: true, data: notes });
});

/**
 * POST /api/v1/jobs/:id/notes — Add a note to a job.
 */
export const POST = withApiAuth(async (req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId) {
    return errorResponse("VALIDATION_ERROR", "Job ID is required", 400);
  }

  // Verify job ownership
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true },
  });
  if (!job) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = CreateNoteSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  const note = await prisma.note.create({
    data: {
      jobId,
      userId,
      content: parsed.data.content,
    },
    select: {
      id: true,
      content: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return createdResponse(note);
});
