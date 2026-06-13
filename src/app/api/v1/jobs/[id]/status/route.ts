import prisma from "@/lib/db";
import { withApiAuth } from "@/lib/api/with-api-auth";
import { actionToResponse, errorResponse } from "@/lib/api/response";
import { ChangeJobStatusSchema, isValidUUID } from "@/lib/api/schemas";
import { JOB_API_SELECT } from "@/lib/api/helpers";
import { isValidCategoryTransitionByKind, appliedSideEffectByKind } from "@/lib/crm/status-transition";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";

/** CORS preflight */
export const OPTIONS = withApiAuth(async () => new Response(null));

/**
 * POST /api/v1/jobs/:id/status — Change a job's status via the CRM state machine.
 *
 * Enforces valid state transitions (same rules as the internal changeJobStatus
 * server action). Status changes are NOT allowed via PATCH — this is the only
 * way to change status through the Public API.
 *
 * Body: { statusId: string, note?: string, expectedFromStatusId?: string }
 *
 * Spec: specs/crm-workflow.allium (state_machine JobStatusTransitions)
 * Security: ADR-015 (IDOR ownership), S3-D1 fix
 */
export const POST = withApiAuth(async (req, { userId, params }) => {
  const jobId = params?.id;
  if (!jobId || !isValidUUID(jobId)) {
    return errorResponse("VALIDATION_ERROR", "Valid Job ID is required", 400);
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return errorResponse("VALIDATION_ERROR", "Invalid JSON body", 400);
  }

  const parsed = ChangeJobStatusSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(
      "VALIDATION_ERROR",
      parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      400,
    );
  }

  const { statusId: newStatusId, note, expectedFromStatusId, expectedVersion } = parsed.data;

  // Parallel lookups: current job (with ownership check) + target status
  const [currentJob, newStatus] = await Promise.all([
    prisma.job.findFirst({
      where: { id: jobId, userId },
      select: {
        id: true, statusId: true, version: true, appliedDate: true,
        Status: { select: { value: true, category: { select: { kind: true } } } },
      },
    }),
    prisma.jobStatus.findFirst({
      where: { id: newStatusId, userId },
      select: { id: true, value: true, category: { select: { kind: true } } },
    }),
  ]);

  if (!currentJob) {
    return errorResponse("NOT_FOUND", "api.statusChange.jobNotFound", 404);
  }
  if (!newStatus) {
    return errorResponse("VALIDATION_ERROR", "api.statusChange.invalidStatus", 400);
  }

  // Optimistic concurrency: reject if caller's expected fromStatus is stale
  if (expectedFromStatusId !== undefined && currentJob.statusId !== expectedFromStatusId) {
    return errorResponse("CONFLICT", "api.statusChange.staleState", 409);
  }

  // Optimistic locking: reject if caller's expected version is stale (S3-D3)
  if (expectedVersion !== undefined && currentJob.version !== expectedVersion) {
    return errorResponse("CONFLICT", "api.statusChange.staleState", 409);
  }

  // Validate transition — category-ordered (Welle 4 per-user custom statuses).
  if (!isValidCategoryTransitionByKind(currentJob.Status.category.kind, newStatus.category.kind)) {
    return errorResponse("VALIDATION_ERROR", "api.statusChange.invalidTransition", 400);
  }

  // Compute side effects (applied flag derived from the target stage).
  const sideEffects = appliedSideEffectByKind(
    newStatus.category.kind,
    currentJob.appliedDate,
  );

  // Transaction: update job + create history entry
  const [updatedJob, historyEntry] = await prisma.$transaction(async (tx) => {
    const job = await tx.job.update({
      where: { id: jobId, userId },
      data: {
        statusId: newStatusId,
        version: { increment: 1 },
        ...sideEffects,
      },
      select: JOB_API_SELECT,
    });

    const history = await tx.jobStatusHistory.create({
      data: {
        jobId,
        userId,
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
      userId,
      previousStatusValue: currentJob.Status.value,
      newStatusValue: newStatus.value,
      note: note ?? undefined,
      historyEntryId: historyEntry.id,
    }),
  );

  return actionToResponse({ success: true, data: updatedJob });
});
