/**
 * CRM Activity Logger — projects domain events into CrmActivityLog entries.
 * Spec: specs/crm.allium contract TimelineProjection (AppendOnly invariant)
 *
 * This consumer subscribes to CRM-related domain events and creates
 * immutable CrmActivityLog entries as a materialized read model.
 */

import "server-only";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import type {
  JobStatusChangedPayload,
  ContactCreatedPayload,
  ContactUpdatedPayload,
} from "@/lib/events/event-types";

export function registerCrmActivityLogConsumers(): void {
  // Project JobStatusChanged → status_changed activity
  eventBus.subscribe(DomainEventType.JobStatusChanged, async (event) => {
    const payload = event.payload as JobStatusChangedPayload;
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
    const payload = event.payload as ContactCreatedPayload;
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
    const payload = event.payload as ContactUpdatedPayload;
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
}
