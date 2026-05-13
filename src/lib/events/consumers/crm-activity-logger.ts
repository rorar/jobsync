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
 */

import "server-only";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import {
  JobStatusChangedPayloadSchema,
  ContactCreatedPayloadSchema,
  ContactUpdatedPayloadSchema,
  InterviewScheduledPayloadSchema,
  InterviewCompletedPayloadSchema,
  CrmTaskCreatedPayloadSchema,
  CrmTaskCompletedPayloadSchema,
  CrmNoteCreatedPayloadSchema,
  VacancyPromotedPayloadSchema,
  safeParsePayload,
} from "@/lib/events/event-schemas";

export function registerCrmActivityLogConsumers(): void {
  // Project JobStatusChanged → status_changed activity
  eventBus.subscribe(DomainEventType.JobStatusChanged, async (event) => {
    const payload = safeParsePayload(JobStatusChangedPayloadSchema, event);
    if (!payload) return;
    try {
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "status_changed",
          actorId: payload.userId,
          targetJobId: payload.jobId,
          details: JSON.stringify({
            previousStatus: payload.previousStatusValue,
            newStatus: payload.newStatusValue,
          }),
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log status change:", error);
    }
  });

  // Project ContactCreated → contact_created activity
  eventBus.subscribe(DomainEventType.ContactCreated, async (event) => {
    const payload = safeParsePayload(ContactCreatedPayloadSchema, event);
    if (!payload) return;
    try {
      const person = await prisma.person.findUnique({
        where: { id: payload.personId },
        select: { firstName: true, lastName: true },
      });
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "contact_created",
          actorId: payload.userId,
          targetPersonId: payload.personId,
          linkedRecordName: [person?.firstName, person?.lastName].filter(Boolean).join(" ") || null,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log contact created:", error);
    }
  });

  // Project ContactUpdated → contact_updated activity
  eventBus.subscribe(DomainEventType.ContactUpdated, async (event) => {
    const payload = safeParsePayload(ContactUpdatedPayloadSchema, event);
    if (!payload) return;
    try {
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "contact_updated",
          actorId: payload.userId,
          targetPersonId: payload.personId,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log contact updated:", error);
    }
  });

  // Project InterviewScheduled → interview_scheduled activity
  eventBus.subscribe(DomainEventType.InterviewScheduled, async (event) => {
    const payload = safeParsePayload(InterviewScheduledPayloadSchema, event);
    if (!payload) return;
    try {
      const job = await prisma.job.findUnique({
        where: { id: payload.jobId },
        select: { JobTitle: { select: { label: true } } },
      });
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "interview_scheduled",
          actorId: payload.userId,
          targetJobId: payload.jobId,
          targetPersonId: payload.personId ?? null,
          linkedRecordName: job?.JobTitle?.label ?? null,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log interview scheduled:", error);
    }
  });

  // Project InterviewCompleted → interview_completed activity
  eventBus.subscribe(DomainEventType.InterviewCompleted, async (event) => {
    const payload = safeParsePayload(InterviewCompletedPayloadSchema, event);
    if (!payload) return;
    try {
      const job = await prisma.job.findUnique({
        where: { id: payload.jobId },
        select: { JobTitle: { select: { label: true } } },
      });
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "interview_completed",
          actorId: payload.userId,
          targetJobId: payload.jobId,
          linkedRecordName: job?.JobTitle?.label ?? null,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log interview completed:", error);
    }
  });

  // Project CrmTaskCreated → task_created activity
  eventBus.subscribe(DomainEventType.CrmTaskCreated, async (event) => {
    const payload = safeParsePayload(CrmTaskCreatedPayloadSchema, event);
    if (!payload) return;
    try {
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "task_created",
          actorId: payload.userId,
          linkedRecordName: payload.title,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log task created:", error);
    }
  });

  // Project CrmTaskCompleted → task_completed activity
  eventBus.subscribe(DomainEventType.CrmTaskCompleted, async (event) => {
    const payload = safeParsePayload(CrmTaskCompletedPayloadSchema, event);
    if (!payload) return;
    try {
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "task_completed",
          actorId: payload.userId,
          linkedRecordName: payload.title,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log task completed:", error);
    }
  });

  // Project CrmNoteCreated → note_added activity
  eventBus.subscribe(DomainEventType.CrmNoteCreated, async (event) => {
    const payload = safeParsePayload(CrmNoteCreatedPayloadSchema, event);
    if (!payload) return;
    try {
      const note = await prisma.crmNote.findUnique({
        where: { id: payload.noteId },
        select: { title: true, targets: { select: { targetPersonId: true, targetJobId: true }, take: 1 } },
      });
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "note_added",
          actorId: payload.userId,
          targetPersonId: note?.targets[0]?.targetPersonId ?? null,
          targetJobId: note?.targets[0]?.targetJobId ?? null,
          linkedRecordName: note?.title ?? null,
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log note created:", error);
    }
  });

  // Project VacancyPromoted → application_submitted activity (Pipeline→CRM bridge)
  eventBus.subscribe(DomainEventType.VacancyPromoted, async (event) => {
    const payload = safeParsePayload(VacancyPromotedPayloadSchema, event);
    if (!payload) return;
    try {
      const job = await prisma.job.findUnique({
        where: { id: payload.jobId },
        select: { JobTitle: { select: { label: true } }, Company: { select: { label: true } } },
      });
      await prisma.crmActivityLog.create({
        data: {
          userId: payload.userId,
          activityType: "application_submitted",
          actorId: payload.userId,
          targetJobId: payload.jobId,
          linkedRecordName: job?.JobTitle?.label ?? null,
          details: JSON.stringify({ stagedVacancyId: payload.stagedVacancyId }),
        },
      });
    } catch (error) {
      console.error("[crm-activity-logger] Failed to log vacancy promoted:", error);
    }
  });
}
