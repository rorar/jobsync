/**
 * CRM Temporal Rules — Cron job for time-based CRM rules.
 * Spec: specs/crm.allium rules ExpireAutoCreatedPersons, InterviewReminder, TaskOverdueReminder
 *
 * Also handles GDPR account deletion rules:
 * - purgeExpiredDeletions: execute deletions past cooling-off period (F-4)
 * - sweepExpiredDeletionTokens: clean up expired confirmation tokens (F-2)
 *
 * Architecture:
 * - Separate cron from the automation scheduler (bounded context separation)
 * - Activity log as idempotency guard (no extra schema columns)
 * - 15-minute interval — frequent enough for 24h reminders, lightweight for SQLite
 * - isRunning guard prevents overlapping cycles (same pattern as enrichment semaphore)
 */

import "server-only";
import cron, { type ScheduledTask } from "node-cron";
import prisma from "@/lib/db";
import { eventBus } from "@/lib/events";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { CRM_CONFIG } from "@/models/person.model";
import { debugLog, debugError } from "@/lib/debug";
import { getPrivacySettingsForUser } from "@/lib/account/privacy-helpers";
import { executeAccountDeletion } from "@/lib/account/execute-deletion";
import { writeAdminAuditLog } from "@/lib/auth/admin";

// globalThis guard: survives Next.js HMR module reloads (same pattern as RunCoordinator)
const CRM_CRON_KEY = "__crmCronTask";
const CRM_CRON_RUNNING_KEY = "__crmCronRunning";

function getCrmTask(): ScheduledTask | null {
  return (globalThis as Record<string, unknown>)[CRM_CRON_KEY] as ScheduledTask | null ?? null;
}
function setCrmTask(task: ScheduledTask | null): void {
  (globalThis as Record<string, unknown>)[CRM_CRON_KEY] = task;
}
function getIsRunning(): boolean {
  return ((globalThis as Record<string, unknown>)[CRM_CRON_RUNNING_KEY] as boolean) ?? false;
}
function setIsRunning(v: boolean): void {
  (globalThis as Record<string, unknown>)[CRM_CRON_RUNNING_KEY] = v;
}

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

  let archived = 0;
  for (const person of expired) {
    try {
      // Transaction: archive + audit log atomically (Finding 2 fix)
      await prisma.$transaction([
        prisma.person.update({
          where: { id: person.id },
          data: { status: "archived" },
        }),
        prisma.crmActivityLog.create({
          data: {
            userId: person.userId,
            activityType: "reminder_triggered",
            actorId: null,
            targetPersonId: person.id,
            details: JSON.stringify({ reason: "retention_expired" }),
            linkedRecordName: [person.firstName, person.lastName].filter(Boolean).join(" ") || null,
          },
        }),
      ]);

      // Event publish outside transaction — best-effort
      eventBus.publish(
        createEvent(DomainEventType.ReminderTriggered, {
          userId: person.userId,
          reason: "retention_expired",
          targetPersonId: person.id,
        }),
      );

      archived++;
    } catch (error) {
      debugError("crm-cron", `Failed to expire person ${person.id}:`, error);
    }
  }

  return archived;
}

// ---------------------------------------------------------------------------
// Rule: InterviewReminder
// ---------------------------------------------------------------------------

async function checkInterviewReminders(): Promise<number> {
  const now = new Date();
  const reminderThreshold = new Date(
    now.getTime() + CRM_CONFIG.interviewReminderBeforeHours * 60 * 60 * 1000,
  );

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
      // Idempotency: check by interviewId in details (Finding 5 fix — scoped to specific interview)
      const existing = await prisma.crmActivityLog.findFirst({
        where: {
          userId: interview.userId,
          activityType: "reminder_triggered",
          happenedAt: { gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
          details: { contains: `"interviewId":"${interview.id}"` },
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

  // Finding 8 fix: include in_progress tasks (consistent with getCrmTasks overdue filter)
  const overdue = await prisma.crmTask.findMany({
    where: {
      status: { in: ["pending", "in_progress"] },
      dueDate: { lte: now },
    },
    select: { id: true, userId: true, title: true },
  });

  if (overdue.length === 0) return 0;

  let reminded = 0;
  for (const task of overdue) {
    try {
      // Idempotency: check by taskId in details (within last 24h)
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
// Rule: PurgeExpiredDeletions (F-4 cooling-off)
// ---------------------------------------------------------------------------

async function purgeExpiredDeletions(): Promise<number> {
  const now = new Date();
  const users = await prisma.user.findMany({
    where: { deletionScheduledAt: { lte: now } },
    select: { id: true, email: true, name: true },
  });

  if (users.length === 0) return 0;

  let purged = 0;
  for (const user of users) {
    try {
      // Read privacy settings for audit log
      const privacy = await getPrivacySettingsForUser(user.id);

      if (privacy.auditAccountDeletion) {
        writeAdminAuditLog(
          { id: user.id, name: user.name ?? "", email: user.email ?? "" },
          {
            action: "account_deletion_executed",
            targetId: user.id,
            extra: { trigger: "cooling_off_expired" },
          },
          { allowed: true, tier: "explicit_list" },
        );
      }

      await executeAccountDeletion(user.id);
      purged++;
    } catch (error) {
      debugError("crm-cron", `Failed to purge user ${user.id}:`, error);
    }
  }

  return purged;
}

// ---------------------------------------------------------------------------
// Rule: SweepExpiredDeletionTokens (F-2 token cleanup)
// ---------------------------------------------------------------------------

async function sweepExpiredDeletionTokens(): Promise<number> {
  const result = await prisma.deletionConfirmationToken.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}

// ---------------------------------------------------------------------------
// Main cron loop
// ---------------------------------------------------------------------------

async function runCrmTemporalRules(): Promise<void> {
  // Prevent overlapping cycles (globalThis-backed guard)
  if (getIsRunning()) {
    debugLog("crm-cron", "[CRM-Cron] Previous cycle still running, skipping.");
    return;
  }
  setIsRunning(true);

  try {
    debugLog("crm-cron", "[CRM-Cron] Checking temporal rules...");

    // Promise.allSettled: one failing rule must not block the others
    const results = await Promise.allSettled([
      expireAutoCreatedPersons(),
      checkInterviewReminders(),
      checkOverdueTasks(),
      purgeExpiredDeletions(),
      sweepExpiredDeletionTokens(),
    ]);

    const expired = results[0].status === "fulfilled" ? results[0].value : 0;
    const interviews = results[1].status === "fulfilled" ? results[1].value : 0;
    const tasks = results[2].status === "fulfilled" ? results[2].value : 0;
    const purged = results[3].status === "fulfilled" ? results[3].value : 0;
    const swept = results[4].status === "fulfilled" ? results[4].value : 0;

    // Log individual rule failures
    const ruleLabels = [
      "expirePersons",
      "interviewReminders",
      "overdueTasks",
      "purgeExpiredDeletions",
      "sweepExpiredDeletionTokens",
    ];
    for (const [i, label] of ruleLabels.entries()) {
      if (results[i].status === "rejected") {
        debugError("crm-cron", `[CRM-Cron] Rule ${label} failed:`, (results[i] as PromiseRejectedResult).reason);
      }
    }

    if (expired > 0 || interviews > 0 || tasks > 0 || purged > 0 || swept > 0) {
      debugLog(
        "crm-cron",
        `[CRM-Cron] Processed: ${expired} expired persons, ${interviews} interview reminders, ${tasks} overdue tasks, ${purged} purged accounts, ${swept} swept tokens`,
      );
    }
  } catch (error) {
    debugError("crm-cron", "[CRM-Cron] Error running temporal rules:", error);
  } finally {
    setIsRunning(false);
  }
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function startCrmCron(): void {
  if (getCrmTask()) {
    debugLog("crm-cron", "[CRM-Cron] Already running");
    return;
  }

  if (!cron.validate(CRM_CRON_EXPRESSION)) {
    debugError("crm-cron", `[CRM-Cron] Invalid cron expression: ${CRM_CRON_EXPRESSION}`);
    return;
  }

  debugLog("crm-cron", `[CRM-Cron] Starting with schedule: ${CRM_CRON_EXPRESSION}`);

  const task = cron.schedule(CRM_CRON_EXPRESSION, runCrmTemporalRules, {
    timezone: process.env.TZ || "UTC",
  });
  setCrmTask(task);

  debugLog("crm-cron", "[CRM-Cron] Started successfully");
}

export function stopCrmCron(): void {
  const task = getCrmTask();
  if (task) {
    task.stop();
    setCrmTask(null);
    debugLog("crm-cron", "[CRM-Cron] Stopped");
  }
}

// Exported for testing
export {
  expireAutoCreatedPersons,
  checkInterviewReminders,
  checkOverdueTasks,
  purgeExpiredDeletions,
  sweepExpiredDeletionTokens,
  runCrmTemporalRules,
};
