/**
 * CRM Activity Logger — projects domain events into CrmActivityLog entries.
 * Spec: specs/crm.allium contract TimelineProjection (AppendOnly invariant)
 *
 * This consumer subscribes to CRM-related domain events and creates
 * immutable CrmActivityLog entries as a materialized read model.
 *
 * Architecture decision (Strang 3): ALL activity log writes go through this
 * consumer. Actions publish domain events, the consumer projects them into
 * CrmActivityLog. No direct prisma.crmActivityLog.create() in action files.
 * Exception: crm-cron.ts writes directly because its activity log entries
 * serve as idempotency guards within transactions.
 *
 * Pattern: Declarative event projections via registerProjection().
 * Adding a new projection = 1 function call. No boilerplate.
 */

import "server-only";
import type { ZodType } from "zod";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import type { DomainEvent } from "@/lib/events/event-types";
import { DomainEventType } from "@/lib/events/event-types";
import {
  JobStatusChangedPayloadSchema,
  ContactCreatedPayloadSchema,
  ContactUpdatedPayloadSchema,
  ContactDeletedPayloadSchema,
  InterviewScheduledPayloadSchema,
  InterviewCompletedPayloadSchema,
  CrmTaskCreatedPayloadSchema,
  CrmTaskCompletedPayloadSchema,
  CrmNoteCreatedPayloadSchema,
  VacancyPromotedPayloadSchema,
  AutomationDegradedPayloadSchema,
  safeParsePayload,
} from "@/lib/events/event-schemas";

// =============================================================================
// Projection infrastructure
// =============================================================================

/**
 * Data shape for CrmActivityLog.create (minus activityType — managed by
 * registerProjection). Matches the Prisma model's nullable FK columns.
 */
interface ActivityData {
  userId: string;
  actorId: string;
  targetPersonId?: string | null;
  targetCompanyId?: string | null;
  targetJobId?: string | null;
  details?: string | null;
  linkedRecordName?: string | null;
}

/**
 * Register a domain event → CrmActivityLog projection.
 *
 * Centralizes the subscribe → parse → try/create → catch cycle.
 * Each projection is a declarative call with a typed `mapToData` callback.
 *
 * Type-safe: `schema: z.ZodType<T>` infers `T`, so `mapToData` receives
 * the correctly typed payload with full autocomplete — no `any`, no casts.
 *
 * @param eventType   - Domain event to subscribe to
 * @param schema      - Zod schema for payload validation (infers T)
 * @param activityType - Value written to CrmActivityLog.activityType
 * @param mapToData   - Async-capable callback that transforms the typed payload
 *                      into ActivityData fields (may include DB lookups)
 */
function registerProjection<T>(
  eventType: DomainEventType,
  schema: ZodType<T>,
  activityType: string,
  mapToData: (payload: T) => Promise<ActivityData> | ActivityData,
): void {
  eventBus.subscribe(eventType, async (event: DomainEvent) => {
    const payload = safeParsePayload(schema, event);
    if (!payload) return;
    try {
      const data = await mapToData(payload);
      await prisma.crmActivityLog.create({
        data: { activityType, ...data },
      });
    } catch (error) {
      console.error(`[crm-activity-logger] Failed to log ${activityType}:`, error);
    }
  });
}

// =============================================================================
// Projections
// =============================================================================

export function registerCrmActivityLogConsumers(): void {
  // JobStatusChanged → status_changed
  registerProjection(
    DomainEventType.JobStatusChanged,
    JobStatusChangedPayloadSchema,
    "status_changed",
    async (p) => {
      // Welle 3 (P3): resolve the job's company so the entry also lands on the
      // Company timeline.
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { companyId: true },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        targetCompanyId: job?.companyId ?? null,
        details: JSON.stringify({
          previousStatus: p.previousStatusValue,
          newStatus: p.newStatusValue,
        }),
      };
    },
  );

  // ContactCreated → contact_created (DB lookup: Person name)
  registerProjection(
    DomainEventType.ContactCreated,
    ContactCreatedPayloadSchema,
    "contact_created",
    async (p) => {
      const person = await prisma.person.findUnique({
        where: { id: p.personId },
        select: { firstName: true, lastName: true },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetPersonId: p.personId,
        linkedRecordName: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || null,
      };
    },
  );

  // ContactUpdated → contact_updated
  // Welle 3 (Task 1.5): when the update is a job↔person link/unlink (jobId set),
  // also stamp targetJobId and resolve targetCompanyId from the job, so the link
  // surfaces on the Job and Company timelines — not only the Person timeline.
  registerProjection(
    DomainEventType.ContactUpdated,
    ContactUpdatedPayloadSchema,
    "contact_updated",
    async (p) => {
      let targetCompanyId: string | null = null;
      if (p.jobId) {
        const job = await prisma.job.findUnique({
          where: { id: p.jobId },
          select: { companyId: true },
        });
        targetCompanyId = job?.companyId ?? null;
      }
      return {
        userId: p.userId,
        actorId: p.userId,
        targetPersonId: p.personId,
        targetJobId: p.jobId ?? null,
        targetCompanyId,
      };
    },
  );

  // ContactDeleted → contact_deleted
  registerProjection(
    DomainEventType.ContactDeleted,
    ContactDeletedPayloadSchema,
    "contact_deleted",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      targetPersonId: null,
      details: JSON.stringify({ reason: p.reason }),
      linkedRecordName: null,
    }),
  );

  // InterviewScheduled → interview_scheduled (DB lookup: Job title)
  registerProjection(
    DomainEventType.InterviewScheduled,
    InterviewScheduledPayloadSchema,
    "interview_scheduled",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } }, companyId: true },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        targetPersonId: p.personId ?? null,
        targetCompanyId: job?.companyId ?? null,
        linkedRecordName: job?.JobTitle?.label ?? null,
      };
    },
  );

  // InterviewCompleted → interview_completed (DB lookup: Job title)
  registerProjection(
    DomainEventType.InterviewCompleted,
    InterviewCompletedPayloadSchema,
    "interview_completed",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } }, companyId: true },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        targetCompanyId: job?.companyId ?? null,
        linkedRecordName: job?.JobTitle?.label ?? null,
      };
    },
  );

  // CrmTaskCreated → task_created
  registerProjection(
    DomainEventType.CrmTaskCreated,
    CrmTaskCreatedPayloadSchema,
    "task_created",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      targetPersonId: p.targetPersonId ?? null,
      targetJobId: p.targetJobId ?? null,
      linkedRecordName: p.title,
    }),
  );

  // CrmTaskCompleted → task_completed
  registerProjection(
    DomainEventType.CrmTaskCompleted,
    CrmTaskCompletedPayloadSchema,
    "task_completed",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      targetPersonId: p.targetPersonId ?? null,
      targetJobId: p.targetJobId ?? null,
      linkedRecordName: p.title,
    }),
  );

  // CrmNoteCreated → note_added (payload-first, DB fallback for old events)
  registerProjection(
    DomainEventType.CrmNoteCreated,
    CrmNoteCreatedPayloadSchema,
    "note_added",
    async (p) => {
      // Prefer payload fields (CB-5 pattern); fall back to DB for backward compat
      const hasTargetInPayload = p.targetPersonId || p.targetJobId;
      let targetPersonId: string | null = p.targetPersonId ?? null;
      let targetJobId: string | null = p.targetJobId ?? null;
      let linkedRecordName: string | null = null;

      if (!hasTargetInPayload) {
        // Backward compat: old events without target IDs — look up from DB
        const note = await prisma.crmNote.findUnique({
          where: { id: p.noteId },
          select: { title: true, targets: { select: { targetPersonId: true, targetJobId: true }, take: 1 } },
        });
        targetPersonId = note?.targets[0]?.targetPersonId ?? null;
        targetJobId = note?.targets[0]?.targetJobId ?? null;
        linkedRecordName = note?.title ?? null;
      } else {
        // Fetch title only (targets already known)
        const note = await prisma.crmNote.findUnique({
          where: { id: p.noteId },
          select: { title: true },
        });
        linkedRecordName = note?.title ?? null;
      }

      return {
        userId: p.userId,
        actorId: p.userId,
        targetPersonId,
        targetJobId,
        linkedRecordName,
      };
    },
  );

  // VacancyPromoted → application_submitted (DB lookup: Job title + Company)
  registerProjection(
    DomainEventType.VacancyPromoted,
    VacancyPromotedPayloadSchema,
    "application_submitted",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } }, companyId: true },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        targetCompanyId: job?.companyId ?? null,
        linkedRecordName: job?.JobTitle?.label ?? null,
        details: JSON.stringify({ stagedVacancyId: p.stagedVacancyId }),
      };
    },
  );

  // AutomationDegraded → automation_degraded (module-level, no person/job target)
  registerProjection(
    DomainEventType.AutomationDegraded,
    AutomationDegradedPayloadSchema,
    "automation_degraded",
    (p) => ({
      userId: p.userId,
      actorId: p.moduleId ?? p.userId,
      linkedRecordName: p.automationName,
      details: JSON.stringify({
        reason: p.reason,
        moduleName: p.moduleName ?? p.moduleId,
        automationId: p.automationId,
      }),
    }),
  );
}
