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
import type { z } from "zod";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import type { DomainEvent, DomainEventType } from "@/lib/events/event-types";
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
  schema: z.ZodType<T>,
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
    "JobStatusChanged" as DomainEventType,
    JobStatusChangedPayloadSchema,
    "status_changed",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      targetJobId: p.jobId,
      details: JSON.stringify({
        previousStatus: p.previousStatusValue,
        newStatus: p.newStatusValue,
      }),
    }),
  );

  // ContactCreated → contact_created (DB lookup: Person name)
  registerProjection(
    "ContactCreated" as DomainEventType,
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
  registerProjection(
    "ContactUpdated" as DomainEventType,
    ContactUpdatedPayloadSchema,
    "contact_updated",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      targetPersonId: p.personId,
    }),
  );

  // ContactDeleted → contact_deleted
  registerProjection(
    "ContactDeleted" as DomainEventType,
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
    "InterviewScheduled" as DomainEventType,
    InterviewScheduledPayloadSchema,
    "interview_scheduled",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } } },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        targetPersonId: p.personId ?? null,
        linkedRecordName: job?.JobTitle?.label ?? null,
      };
    },
  );

  // InterviewCompleted → interview_completed (DB lookup: Job title)
  registerProjection(
    "InterviewCompleted" as DomainEventType,
    InterviewCompletedPayloadSchema,
    "interview_completed",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } } },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        linkedRecordName: job?.JobTitle?.label ?? null,
      };
    },
  );

  // CrmTaskCreated → task_created
  registerProjection(
    "CrmTaskCreated" as DomainEventType,
    CrmTaskCreatedPayloadSchema,
    "task_created",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      linkedRecordName: p.title,
    }),
  );

  // CrmTaskCompleted → task_completed
  registerProjection(
    "CrmTaskCompleted" as DomainEventType,
    CrmTaskCompletedPayloadSchema,
    "task_completed",
    (p) => ({
      userId: p.userId,
      actorId: p.userId,
      linkedRecordName: p.title,
    }),
  );

  // CrmNoteCreated → note_added (DB lookup: Note targets)
  registerProjection(
    "CrmNoteCreated" as DomainEventType,
    CrmNoteCreatedPayloadSchema,
    "note_added",
    async (p) => {
      const note = await prisma.crmNote.findUnique({
        where: { id: p.noteId },
        select: { title: true, targets: { select: { targetPersonId: true, targetJobId: true }, take: 1 } },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetPersonId: note?.targets[0]?.targetPersonId ?? null,
        targetJobId: note?.targets[0]?.targetJobId ?? null,
        linkedRecordName: note?.title ?? null,
      };
    },
  );

  // VacancyPromoted → application_submitted (DB lookup: Job title + Company)
  registerProjection(
    "VacancyPromoted" as DomainEventType,
    VacancyPromotedPayloadSchema,
    "application_submitted",
    async (p) => {
      const job = await prisma.job.findUnique({
        where: { id: p.jobId },
        select: { JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
      });
      return {
        userId: p.userId,
        actorId: p.userId,
        targetJobId: p.jobId,
        linkedRecordName: job?.JobTitle?.label ?? null,
        details: JSON.stringify({ stagedVacancyId: p.stagedVacancyId }),
      };
    },
  );
}
