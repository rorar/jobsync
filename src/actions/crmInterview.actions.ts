"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import {
  type InterviewStatus,
  type InterviewOutcome,
  isValidInterviewTransition,
  isConsentBlocked,
} from "@/models/person.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ScheduleInterviewInput {
  jobId: string;
  personId?: string | null;
  interviewDate: string; // ISO 8601
  location?: string | null;
  notes?: string | null;
}

const INTERVIEW_SELECT = {
  id: true,
  userId: true,
  jobId: true,
  personId: true,
  interviewDate: true,
  location: true,
  notes: true,
  status: true,
  outcome: true,
  outcomeNotes: true,
  createdAt: true,
  updatedAt: true,
  job: { select: { id: true, description: true, jobTitleId: true, companyId: true,
    JobTitle: { select: { label: true } },
    Company: { select: { label: true } },
  } },
  person: { select: { id: true, firstName: true, lastName: true } },
} as const;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function scheduleInterview(
  input: ScheduleInterviewInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    // Verify job ownership
    const job = await prisma.job.findFirst({
      where: { id: input.jobId, userId: user.id },
      select: { id: true, description: true, JobTitle: { select: { label: true } } },
    });
    if (!job) return { success: false, message: "crm.errors.jobNotFound" };

    // Verify person ownership if provided
    if (input.personId) {
      const person = await prisma.person.findFirst({
        where: { id: input.personId, userId: user.id },
      });
      if (!person) return { success: false, message: "crm.errors.personNotFound" };
      // GDPR Art. 7(3): no new processing on a consent-blocked contact.
      if (isConsentBlocked(person)) {
        return { success: false, message: "crm.errors.consentWithdrawn" };
      }
    }

    const interview = await prisma.crmInterview.create({
      data: {
        userId: user.id,
        jobId: input.jobId,
        personId: input.personId ?? null,
        interviewDate: new Date(input.interviewDate),
        location: input.location ?? null,
        notes: input.notes ?? null,
        status: "scheduled",
      },
    });

    // Activity log projected via crm-activity-logger consumer (TimelineProjection contract)
    eventBus.publish(
      createEvent(DomainEventType.InterviewScheduled, {
        interviewId: interview.id,
        jobId: input.jobId,
        userId: user.id,
        personId: input.personId ?? undefined,
        interviewDate: input.interviewDate,
      }),
    );

    return { success: true, data: { id: interview.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function completeInterview(
  interviewId: string,
  outcome: InterviewOutcome,
  outcomeNotes?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const interview = await prisma.crmInterview.findFirst({
      where: { id: interviewId, userId: user.id },
      include: { job: { select: { id: true, JobTitle: { select: { label: true } } } } },
    });
    if (!interview) return { success: false, message: "crm.errors.interviewNotFound" };

    if (!isValidInterviewTransition(interview.status as InterviewStatus, "completed")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmInterview.update({
      where: { id: interviewId },
      data: {
        status: "completed",
        outcome,
        outcomeNotes: outcomeNotes ?? null,
        updatedByType: "user",
        updatedById: user.id,
      },
    });

    // Activity log projected via crm-activity-logger consumer (TimelineProjection contract)
    eventBus.publish(
      createEvent(DomainEventType.InterviewCompleted, {
        interviewId,
        jobId: interview.jobId,
        userId: user.id,
        outcome,
      }),
    );

    return { success: true, data: { id: interviewId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function cancelInterview(
  interviewId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const interview = await prisma.crmInterview.findFirst({
      where: { id: interviewId, userId: user.id },
    });
    if (!interview) return { success: false, message: "crm.errors.interviewNotFound" };

    if (!isValidInterviewTransition(interview.status as InterviewStatus, "cancelled")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmInterview.update({
      where: { id: interviewId },
      data: { status: "cancelled", updatedByType: "user", updatedById: user.id },
    });

    return { success: true, data: { id: interviewId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function rescheduleInterview(
  interviewId: string,
  newDate: string,
  newLocation?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const interview = await prisma.crmInterview.findFirst({
      where: { id: interviewId, userId: user.id },
    });
    if (!interview) return { success: false, message: "crm.errors.interviewNotFound" };

    if (!isValidInterviewTransition(interview.status as InterviewStatus, "rescheduled")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmInterview.update({
      where: { id: interviewId },
      data: {
        status: "rescheduled",
        interviewDate: new Date(newDate),
        location: newLocation !== undefined ? newLocation : interview.location,
        updatedByType: "user",
        updatedById: user.id,
      },
    });

    return { success: true, data: { id: interviewId } };
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function getInterviews(filters?: {
  jobId?: string;
  personId?: string;
  status?: InterviewStatus;
  upcoming?: boolean;
}): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const where: Record<string, unknown> = { userId: user.id };
    if (filters?.jobId) where.jobId = filters.jobId;
    if (filters?.personId) where.personId = filters.personId;
    if (filters?.status) where.status = filters.status;
    if (filters?.upcoming) {
      where.interviewDate = { gte: new Date() };
      where.status = { in: ["scheduled", "rescheduled"] };
    }

    const interviews = await prisma.crmInterview.findMany({
      where,
      select: INTERVIEW_SELECT,
      orderBy: { interviewDate: "asc" },
    });

    return { success: true, data: interviews };
  } catch (error) {
    return handleError(error);
  }
}
