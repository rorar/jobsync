import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { paginatedResponse, createdResponse, errorResponse } from "@/lib/api/response";
import { NotesListQuerySchema, CreateNoteSchema, isValidUUID } from "@/lib/api/schemas";

/** CORS preflight */
export const OPTIONS = withApiAuth(async () => new Response(null));

/**
 * GET /api/v1/jobs/:id/notes — List notes for a job with pagination.
 */
export const GET = withApiAuth(async (req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  // Verify job ownership
  const job = await prisma.job.findFirst({
    where: { id: jobId, userId },
    select: { id: true },
  });
  if (!job) {
    return errorResponse("NOT_FOUND", "Job not found", 404);
  }

  const url = new URL(req.url);
  const parsed = NotesListQuerySchema.safeParse({
    page: url.searchParams.get("page") ?? undefined,
    perPage: url.searchParams.get("perPage") ?? undefined,
  });

  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => i.message).join(", "),
      400,
    );
  }

  const { page, perPage } = parsed.data;
  const skip = (page - 1) * perPage;

  const [notes, total] = await Promise.all([
    prisma.note.findMany({
      where: { jobId, userId },
      orderBy: { createdAt: "desc" },
      skip,
      take: perPage,
      select: {
        id: true,
        content: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
    prisma.note.count({ where: { jobId, userId } }),
  ]);

  return paginatedResponse(notes, total, page, perPage);
});

/**
 * POST /api/v1/jobs/:id/notes — Add a note to a job.
 */
export const POST = withApiAuth(async (req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
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
