/**
 * CRM Temporal Rules — Cron job for time-based CRM rules.
 * Spec: specs/crm.allium rules ExpireAutoCreatedPersons, InterviewReminder, TaskOverdueReminder
 *
 * Architecture:
 * - Separate cron from the automation scheduler (bounded context separation)
 * - Activity log as idempotency guard (no extra schema columns)
 * - 15-minute interval — frequent enough for 24h reminders, lightweight for SQLite
 */

import "server-only";
import cron, { type ScheduledTask } from "node-cron";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { CRM_CONFIG } from "@/models/person.model";
import { debugLog, debugError } from "@/lib/debug";

let crmTask: ScheduledTask | null = null;

const CRM_CRON_EXPRESSION = "*/15 * * * *"; // Every 15 minutes

// ---------------------------------------------------------------------------
// Rule: ExpireAutoCreatedPersons
// ---------------------------------------------------------------------------

async function expireAutoCreatedPersons(): Promise<number> {
  const now = new Date();
  const expired = await prisma.person.findMany({
    where: {
      status: "active",
      dataSource: "auto_created",
      retentionExpiresAt: { lte: now },
    },
    select: { id: true, userId: true, firstName: true, lastName: true },
  });

  if (expired.length === 0) return 0;

  for (const person of expired) {
    try {
      await prisma.person.update({
        where: { id: person.id },
        data: { status: "archived" },
      });

      await prisma.crmActivityLog.create({
        data: {
          userId: person.userId,
          activityType: "reminder_triggered",
          actorId: null,
          targetPersonId: person.id,
          details: JSON.stringify({ reason: "retention_expired" }),
          linkedRecordName: [person.firstName, person.lastName].filter(Boolean).join(" ") || null,
        },
      });

      eventBus.publish(
        createEvent(DomainEventType.ReminderTriggered, {
          userId: person.userId,
          reason: "retention_expired",
          targetPersonId: person.id,
        }),
      );
    } catch (error) {
      debugError("crm-cron", `Failed to expire person ${person.id}:`, error);
    }
  }

  return expired.length;
}

// ---------------------------------------------------------------------------
// Rule: InterviewReminder
// ---------------------------------------------------------------------------

async function checkInterviewReminders(): Promise<number> {
  const now = new Date();
  const reminderThreshold = new Date(
    now.getTime() + CRM_CONFIG.interviewReminderBeforeHours * 60 * 60 * 1000,
  );

  // Find interviews happening within the reminder window that haven't been reminded
  const upcoming = await prisma.crmInterview.findMany({
    where: {
      status: { in: ["scheduled", "rescheduled"] },
      interviewDate: { lte: reminderThreshold, gte: now },
    },
    select: {
      id: true,
      userId: true,
      jobId: true,
      personId: true,
      interviewDate: true,
      job: { select: { JobTitle: { select: { label: true } } } },
    },
  });

  if (upcoming.length === 0) return 0;

  let reminded = 0;
  for (const interview of upcoming) {
    try {
      // Idempotency: check if reminder already sent (activity log within last 24h)
      const existing = await prisma.crmActivityLog.findFirst({
        where: {
          userId: interview.userId,
          activityType: "reminder_triggered",
          targetJobId: interview.jobId,
          happenedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          details: { contains: "interview_upcoming" },
        },
      });
      if (existing) continue;

      await prisma.crmActivityLog.create({
        data: {
          userId: interview.userId,
          activityType: "reminder_triggered",
          actorId: null,
          targetJobId: interview.jobId,
          targetPersonId: interview.personId,
          details: JSON.stringify({
            reason: "interview_upcoming",
            interviewId: interview.id,
            interviewDate: interview.interviewDate.toISOString(),
          }),
          linkedRecordName: interview.job?.JobTitle?.label ?? null,
        },
      });

      eventBus.publish(
        createEvent(DomainEventType.ReminderTriggered, {
          userId: interview.userId,
          reason: "interview_upcoming",
          targetJobId: interview.jobId,
          targetPersonId: interview.personId ?? undefined,
          interviewId: interview.id,
        }),
      );

      reminded++;
    } catch (error) {
      debugError("crm-cron", `Failed to send interview reminder for ${interview.id}:`, error);
    }
  }

  return reminded;
}

// ---------------------------------------------------------------------------
// Rule: TaskOverdueReminder
// ---------------------------------------------------------------------------

async function checkOverdueTasks(): Promise<number> {
  const now = new Date();

  const overdue = await prisma.crmTask.findMany({
    where: {
      status: "pending",
      dueDate: { lte: now },
    },
    select: { id: true, userId: true, title: true },
  });

  if (overdue.length === 0) return 0;

  let reminded = 0;
  for (const task of overdue) {
    try {
      // Idempotency: check if overdue reminder already sent (within last 24h)
      const existing = await prisma.crmActivityLog.findFirst({
        where: {
          userId: task.userId,
          activityType: "reminder_triggered",
          happenedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          details: { contains: task.id },
        },
      });
      if (existing) continue;

      await prisma.crmActivityLog.create({
        data: {
          userId: task.userId,
          activityType: "reminder_triggered",
          actorId: null,
          details: JSON.stringify({
            reason: "task_overdue",
            taskId: task.id,
          }),
          linkedRecordName: task.title,
        },
      });

      eventBus.publish(
        createEvent(DomainEventType.ReminderTriggered, {
          userId: task.userId,
          reason: "task_overdue",
          taskId: task.id,
        }),
      );

      reminded++;
    } catch (error) {
      debugError("crm-cron", `Failed to send overdue reminder for task ${task.id}:`, error);
    }
  }

  return reminded;
}

// ---------------------------------------------------------------------------
// Main cron loop
// ---------------------------------------------------------------------------

async function runCrmTemporalRules(): Promise<void> {
  debugLog("crm-cron", "[CRM-Cron] Checking temporal rules...");

  try {
    const [expired, interviews, tasks] = await Promise.all([
      expireAutoCreatedPersons(),
      checkInterviewReminders(),
      checkOverdueTasks(),
    ]);

    if (expired > 0 || interviews > 0 || tasks > 0) {
      debugLog(
        "crm-cron",
        `[CRM-Cron] Processed: ${expired} expired persons, ${interviews} interview reminders, ${tasks} overdue tasks`,
      );
    }
  } catch (error) {
    debugError("crm-cron", "[CRM-Cron] Error running temporal rules:", error);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startCrmCron(): void {
  if (crmTask) {
    debugLog("crm-cron", "[CRM-Cron] Already running");
    return;
  }

  if (!cron.validate(CRM_CRON_EXPRESSION)) {
    debugError("crm-cron", `[CRM-Cron] Invalid cron expression: ${CRM_CRON_EXPRESSION}`);
    return;
  }

  debugLog("crm-cron", `[CRM-Cron] Starting with schedule: ${CRM_CRON_EXPRESSION}`);

  crmTask = cron.schedule(CRM_CRON_EXPRESSION, runCrmTemporalRules, {
    timezone: process.env.TZ || "UTC",
  });

  debugLog("crm-cron", "[CRM-Cron] Started successfully");
}

export function stopCrmCron(): void {
  if (crmTask) {
    crmTask.stop();
    crmTask = null;
    debugLog("crm-cron", "[CRM-Cron] Stopped");
  }
}

// Exported for testing
export { expireAutoCreatedPersons, checkInterviewReminders, checkOverdueTasks, runCrmTemporalRules };
