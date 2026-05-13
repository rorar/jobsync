/**
 * NotificationDispatcher — Event Bus Consumer
 *
 * Maps domain events to notification drafts and routes them through the ChannelRouter.
 * Each channel (InApp, Webhook, Email, Push) decides independently whether to dispatch.
 *
 * For VacancyStaged events: buffers by automationId and emits a summary
 * notification after a flush interval (5 seconds of inactivity).
 *
 * 5W+H structured fields (ADR-030): every handler populates the `titleKey`,
 * `titleParams`, `actorType`, `actorId`, `reasonKey`, `reasonParams`, and
 * `severity` fields on the `NotificationDraft`. During rollout we dual-write
 * the same values into the legacy `data.*` blob so older readers still work.
 * The InAppChannel persists both into the new top-level Prisma columns and
 * the `data` JSON blob.
 *
 * Spec: specs/notification-dispatch.allium (contract NotificationDispatcher)
 */

import "server-only";

import { eventBus } from "../event-bus";
import { DomainEventType } from "../event-types";
import type {
  DomainEvent,
  AutomationDegradedPayload,
} from "../event-types";
import {
  VacancyPromotedPayloadSchema,
  VacancyStagedPayloadSchema,
  BulkActionCompletedPayloadSchema,
  ModuleDeactivatedPayloadSchema,
  ModuleReactivatedPayloadSchema,
  RetentionCompletedPayloadSchema,
  JobStatusChangedPayloadSchema,
  ReminderTriggeredPayloadSchema,
  safeParsePayload,
} from "../event-schemas";

import prisma from "@/lib/db";
import type {
  NotificationType,
  NotificationDataExtended,
} from "@/models/notification.model";
import type {
  NotificationSeverity,
  NotificationActorType,
} from "@/models/notification.model";
import {
  channelRouter,
  registerChannels,
} from "@/lib/notifications/channel-router";
import {
  buildDispatchContext,
  type DispatchContext,
} from "@/lib/notifications/dispatch-context";
import type { NotificationDraft } from "@/lib/notifications/types";
import { t } from "@/i18n/server";

// Compile-time exhaustive mapping from degradation reason to notification type.
// Avoids an unsafe `as NotificationType` cast — if a new reason is added to
// AutomationDegradedPayload["reason"], TypeScript will error here until the
// mapping is updated.
const DEGRADATION_REASON_TO_TYPE: Record<AutomationDegradedPayload["reason"], NotificationType> = {
  auth_failure: "auth_failure",
  cb_escalation: "cb_escalation",
  consecutive_failures: "consecutive_failures",
};

// ---------------------------------------------------------------------------
// Channel Registration (explicit, Sprint 3 M-A-05)
// ---------------------------------------------------------------------------
//
// Channel registration used to run as a top-level module side effect:
//   channelRouter.register(new InAppChannel());
//   channelRouter.register(new WebhookChannel());
//   channelRouter.register(new EmailChannel());
//   channelRouter.register(new PushChannel());
//
// That pattern meant any importer of this file (tests, type consumers, the
// `_testHelpers` export, HMR reloads) incurred channel registration as a
// side effect of `import notification-dispatcher`. Registration order
// depended on module import order, which is fragile under HMR and Jest.
//
// The fix moves registration into `registerChannels()` (exported from
// channel-router.ts) and calls it from `registerNotificationDispatcher()`
// below. `registerEventConsumers()` in `consumers/index.ts` is the single
// well-known init point that invokes `registerNotificationDispatcher()`,
// so channels are now registered "on application boot" instead of "on
// first import". Tests that want to inject mock channels substitute them
// BEFORE calling `registerNotificationDispatcher`, matching the existing
// `__tests__/channel-router.spec.ts` pattern.

// ---------------------------------------------------------------------------
// VacancyStaged batch buffer (spec: rule BatchSummary)
// ---------------------------------------------------------------------------

interface StagedBuffer {
  userId: string;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

const FLUSH_DELAY_MS = 5_000;

// L-S-02: Move stagedBuffers to globalThis so it survives HMR module reloads
// in development. Under HMR the module is re-executed, which would create a
// fresh Map reference while existing setTimeout callbacks still close over the
// OLD reference — causing flush() to call stagedBuffers.get() on the new Map
// and silently miss the entry. The globalThis singleton pattern (documented in
// CLAUDE.md "Scheduler Coordination — Singleton Pattern") keeps the single
// canonical Map alive across reloads. In production (no HMR) this is a no-op.
const _g = globalThis as unknown as {
  __notifStagedBuffers?: Map<string, StagedBuffer>;
};
/** In-memory buffer: automationId -> { userId, count, timer } */
const stagedBuffers: Map<string, StagedBuffer> =
  (_g.__notifStagedBuffers ??= new Map<string, StagedBuffer>());

// ---------------------------------------------------------------------------
// Dispatch Helper
// ---------------------------------------------------------------------------

/**
 * Build a NotificationDraft and route through all channels.
 * Replaces the old direct prisma.notification.create() calls.
 *
 * PERF-3: receives the pre-built DispatchContext instead of bare preferences.
 * The context carries preferences, locale, SMTP config, VAPID keys,
 * push subscriptions, webhook endpoints, and availability flags — all
 * resolved in a single parallel batch by buildDispatchContext().
 */
async function dispatchNotification(
  draft: NotificationDraft,
  ctx: DispatchContext,
): Promise<void> {
  // Fire-and-forget: do NOT await channel routing.
  // Webhook delivery can retry for up to 36s — blocking here would stall
  // the EventBus publish() loop and freeze the calling Server Action.
  channelRouter.route(draft, ctx).catch((err) => {
    console.error("[NotificationDispatcher] Channel routing failed:", err);
  });
}

// ---------------------------------------------------------------------------
// Flush staged buffer (batched VacancyStaged notifications)
// ---------------------------------------------------------------------------

async function flushStagedBuffer(automationId: string): Promise<void> {
  const entry = stagedBuffers.get(automationId);
  if (!entry) return;
  stagedBuffers.delete(automationId);

  // Fetch automation name for the notification message (English fallback).
  // The authoritative late-bound title comes from the top-level `titleKey +
  // titleParams` columns (ADR-030) and is resolved in the UI at render time
  // via formatNotificationTitle().
  const automation = await prisma.automation.findFirst({
    where: { id: automationId, userId: entry.userId },
    select: { name: true },
  });
  const automationName = automation?.name ?? automationId;

  // PERF-3: single buildDispatchContext call replaces resolveUserSettings +
  // all per-channel DB reads.
  const ctx = await buildDispatchContext(entry.userId);
  // Legacy `message` fallback: still dispatched for email/webhook/push channels
  // and for historical compatibility with clients that don't read structured data.
  const message = t(ctx.locale, "notifications.batchStaged")
    .replace("{count}", String(entry.count))
    .replace("{name}", automationName);

  const titleKey = "notifications.vacancyBatchStaged.title";
  const titleParams = { count: entry.count, automationName };
  const severity: NotificationSeverity = "info";
  const actorType: NotificationActorType = "automation";

  // Legacy `data.*` blob — dual-written alongside the top-level columns for
  // backward compat during rollout (ADR-030).
  const extendedData: NotificationDataExtended = {
    count: entry.count,
    automationId,
    titleKey,
    titleParams,
    actorType,
    actorId: automationId,
    severity,
  };

  const draft: NotificationDraft = {
    userId: entry.userId,
    type: "vacancy_batch_staged" satisfies NotificationType,
    message,
    automationId,
    data: extendedData,
    // Top-level 5W+H fields (new) — persisted by InAppChannel into the
    // first-class Prisma columns.
    titleKey,
    titleParams,
    actorType,
    actorId: automationId,
    severity,
  };

  await dispatchNotification(draft, ctx);
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleVacancyPromoted(
  event: DomainEvent<typeof DomainEventType.VacancyPromoted>,
): Promise<void> {
  const payload = safeParsePayload(VacancyPromotedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);

  const titleKey = "notifications.vacancyPromoted.title";
  const severity: NotificationSeverity = "success";
  const actorType: NotificationActorType = "system";

  // Dual-write: legacy `data.*` blob for backward compat + top-level columns
  // for the new typed fields (ADR-030).
  const extendedData: NotificationDataExtended = {
    stagedVacancyId: payload.stagedVacancyId,
    jobId: payload.jobId,
    titleKey,
    actorType,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "vacancy_promoted" satisfies NotificationType,
      message: t(ctx.locale, "notifications.vacancyPromoted"),
      data: extendedData,
      titleKey,
      actorType,
      severity,
    },
    ctx,
  );
}

async function handleVacancyStaged(
  event: DomainEvent<typeof DomainEventType.VacancyStaged>,
): Promise<void> {
  const payload = safeParsePayload(VacancyStagedPayloadSchema, event);
  if (!payload) return;

  // Only batch automation-sourced staging. Manual staging is individual.
  if (!payload.automationId) return;

  const automationId = payload.automationId;
  const existing = stagedBuffers.get(automationId);

  if (existing) {
    // Reset the timer and increment count
    clearTimeout(existing.timer);
    existing.count += 1;
    existing.timer = setTimeout(() => flushStagedBuffer(automationId), FLUSH_DELAY_MS);
  } else {
    // Start a new buffer
    stagedBuffers.set(automationId, {
      userId: payload.userId,
      count: 1,
      timer: setTimeout(() => flushStagedBuffer(automationId), FLUSH_DELAY_MS),
    });
  }
}

async function handleBulkActionCompleted(
  event: DomainEvent<typeof DomainEventType.BulkActionCompleted>,
): Promise<void> {
  const payload = safeParsePayload(BulkActionCompletedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);
  const message = t(ctx.locale, "notifications.bulkActionCompleted")
    .replace("{succeeded}", String(payload.succeeded))
    .replace("{actionType}", payload.actionType);

  const titleKey = "notifications.bulkActionCompleted.title";
  const titleParams = { action: payload.actionType, count: payload.succeeded };
  const severity: NotificationSeverity = payload.failed > 0 ? "warning" : "success";
  const actorType: NotificationActorType = "user";

  const extendedData: NotificationDataExtended = {
    actionType: payload.actionType,
    succeeded: payload.succeeded,
    failed: payload.failed,
    itemCount: payload.itemIds.length,
    titleKey,
    titleParams,
    actorType,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "bulk_action_completed" satisfies NotificationType,
      message,
      data: extendedData,
      titleKey,
      titleParams,
      actorType,
      severity,
    },
    ctx,
  );
}

async function handleModuleDeactivated(
  event: DomainEvent<typeof DomainEventType.ModuleDeactivated>,
): Promise<void> {
  const payload = safeParsePayload(ModuleDeactivatedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);
  // Sprint 3 M-A-02: prefer the payload's `moduleName` (authoritative display
  // name captured at publish time) over the raw `moduleId` slug. Pre-Sprint-3
  // events have no `moduleName` — fall back to the slug for compat.
  const displayName = payload.moduleName ?? payload.moduleId;
  const message = t(ctx.locale, "notifications.moduleDeactivated")
    .replace("{name}", displayName)
    .replace("{automationCount}", String(payload.affectedAutomationIds.length));

  const titleKey = "notifications.moduleDeactivated.title";
  const titleParams = { moduleName: displayName };
  const reasonKey = "notifications.reason.manualDeactivation";
  const severity: NotificationSeverity = "warning";
  const actorType: NotificationActorType = "module";

  const extendedData: NotificationDataExtended = {
    moduleId: payload.moduleId,
    affectedAutomationCount: payload.affectedAutomationIds.length,
    titleKey,
    titleParams,
    actorType,
    actorId: payload.moduleId,
    reasonKey,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "module_deactivated" satisfies NotificationType,
      message,
      moduleId: payload.moduleId,
      data: extendedData,
      titleKey,
      titleParams,
      actorType,
      actorId: payload.moduleId,
      reasonKey,
      severity,
    },
    ctx,
  );
}

async function handleModuleReactivated(
  event: DomainEvent<typeof DomainEventType.ModuleReactivated>,
): Promise<void> {
  const payload = safeParsePayload(ModuleReactivatedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);
  // Sprint 3 M-A-02: see handleModuleDeactivated.
  const displayName = payload.moduleName ?? payload.moduleId;
  const message = t(ctx.locale, "notifications.moduleReactivated")
    .replace("{name}", displayName)
    .replace("{automationCount}", String(payload.pausedAutomationCount));

  const titleKey = "notifications.moduleReactivated.title";
  const titleParams = { moduleName: displayName };
  const severity: NotificationSeverity = "success";
  const actorType: NotificationActorType = "module";

  const extendedData: NotificationDataExtended = {
    moduleId: payload.moduleId,
    pausedAutomationCount: payload.pausedAutomationCount,
    titleKey,
    titleParams,
    actorType,
    actorId: payload.moduleId,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "module_reactivated" satisfies NotificationType,
      message,
      moduleId: payload.moduleId,
      data: extendedData,
      titleKey,
      titleParams,
      actorType,
      actorId: payload.moduleId,
      severity,
    },
    ctx,
  );
}

async function handleRetentionCompleted(
  event: DomainEvent<typeof DomainEventType.RetentionCompleted>,
): Promise<void> {
  const payload = safeParsePayload(RetentionCompletedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);
  const message = t(ctx.locale, "notifications.retentionCompleted")
    .replace("{count}", String(payload.purgedCount));

  const titleKey = "notifications.retentionCompleted.title";
  const titleParams = { count: payload.purgedCount };
  const severity: NotificationSeverity = "success";
  const actorType: NotificationActorType = "system";

  const extendedData: NotificationDataExtended = {
    purgedCount: payload.purgedCount,
    hashesCreated: payload.hashesCreated,
    titleKey,
    titleParams,
    actorType,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "retention_completed" satisfies NotificationType,
      message,
      data: extendedData,
      titleKey,
      titleParams,
      actorType,
      severity,
    },
    ctx,
  );
}

async function handleJobStatusChanged(
  event: DomainEvent<typeof DomainEventType.JobStatusChanged>,
): Promise<void> {
  const payload = safeParsePayload(JobStatusChangedPayloadSchema, event);
  if (!payload) return;
  // PERF-3: single buildDispatchContext replaces resolveUserSettings + channel reads
  const ctx = await buildDispatchContext(payload.userId);
  const message = t(ctx.locale, "notifications.jobStatusChanged")
    .replace("{newStatus}", payload.newStatusValue)
    .replace("{jobId}", payload.jobId);

  const titleKey = "notifications.jobStatusChanged.title";
  const titleParams = { status: payload.newStatusValue };
  const severity: NotificationSeverity = "info";
  const actorType: NotificationActorType = "user";

  const extendedData: NotificationDataExtended = {
    jobId: payload.jobId,
    previousStatus: payload.previousStatusValue,
    newStatus: payload.newStatusValue,
    note: payload.note,
    historyEntryId: payload.historyEntryId,
    titleKey,
    titleParams,
    actorType,
    severity,
  };

  await dispatchNotification(
    {
      userId: payload.userId,
      type: "job_status_changed" satisfies NotificationType,
      message,
      data: extendedData,
      titleKey,
      titleParams,
      actorType,
      severity,
    },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// CRM Reminder Handler (Strang 2: ReminderTriggered → Notification)
// ---------------------------------------------------------------------------

const REMINDER_TYPE_MAP: Record<string, NotificationType> = {
  interview_upcoming: "interview_reminder",
  task_overdue: "follow_up_due",
  retention_expired: "retention_expired",
};

const REMINDER_TITLE_KEY_MAP: Record<string, string> = {
  interview_upcoming: "notifications.interviewReminder",
  task_overdue: "notifications.followUpDue",
  retention_expired: "notifications.retentionExpired",
};

const REMINDER_SEVERITY_MAP: Record<string, NotificationSeverity> = {
  interview_upcoming: "warning",
  task_overdue: "warning",
  retention_expired: "warning",
};

async function handleReminderTriggered(
  event: DomainEvent<typeof DomainEventType.ReminderTriggered>,
): Promise<void> {
  const payload = safeParsePayload(ReminderTriggeredPayloadSchema, event);
  if (!payload) return;
  const ctx = await buildDispatchContext(payload.userId);

  const notificationType = REMINDER_TYPE_MAP[payload.reason];
  if (!notificationType) return;

  const titleKey = REMINDER_TITLE_KEY_MAP[payload.reason];
  const severity = REMINDER_SEVERITY_MAP[payload.reason] ?? "info";
  const actorType: NotificationActorType = "system";

  const extendedData: NotificationDataExtended = {
    reason: payload.reason,
    ...(payload.targetJobId ? { jobId: payload.targetJobId } : {}),
    ...(payload.targetPersonId ? { personId: payload.targetPersonId } : {}),
    ...(payload.interviewId ? { interviewId: payload.interviewId } : {}),
    ...(payload.taskId ? { taskId: payload.taskId } : {}),
    titleKey,
    actorType,
    severity,
  };

  const message = t(ctx.locale, titleKey);

  await dispatchNotification(
    {
      userId: payload.userId,
      type: notificationType,
      message,
      data: extendedData,
      titleKey,
      actorType,
      severity,
    },
    ctx,
  );
}

// ---------------------------------------------------------------------------
// AutomationDegraded (Sprint C: event-based degradation notifications)
// ---------------------------------------------------------------------------

// Scalability note (P-6): For batch degradation affecting N automations of K distinct
// users, this executes N×6 DB queries where K×6 would suffice via context deduplication.
// The old routeDrafts() deduped with new Set(userIds). Consider adding a per-userId
// context cache with a short TTL window, or batching events per user.
async function handleAutomationDegraded(
  event: DomainEvent<typeof DomainEventType.AutomationDegraded>,
): Promise<void> {
  const payload = event.payload;
  const ctx = await buildDispatchContext(payload.userId);

  const draft: NotificationDraft = {
    userId: payload.userId,
    type: DEGRADATION_REASON_TO_TYPE[payload.reason],
    message: payload.message,
    moduleId: payload.moduleId,
    automationId: payload.automationId,
    titleKey: payload.titleKey,
    titleParams: payload.titleParams,
    actorType: payload.actorType,
    actorId: payload.actorId,
    reasonKey: payload.reasonKey,
    severity: payload.severity,
    data: {
      moduleId: payload.moduleId,
      moduleName: payload.moduleName,
      automationId: payload.automationId,
      automationName: payload.automationName,
      ...(payload.failureCount != null ? { failureCount: payload.failureCount } : {}),
    },
  };

  await dispatchNotification(draft, ctx);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerNotificationDispatcher(): void {
  // Sprint 3 M-A-05: register production channels on the singleton router
  // BEFORE subscribing to events. `registerChannels()` is idempotent
  // (guarded by `__channelRouterRegistered` on globalThis) so repeat calls
  // during HMR or test boot are safe. Registration is synchronous — the
  // channel modules are imported statically from channel-router.ts, not
  // lazily inside this call, so tests that `jest.mock()` a channel file
  // see the mocked constructor when `registerChannels()` instantiates it.
  registerChannels();

  eventBus.subscribe(DomainEventType.VacancyPromoted, handleVacancyPromoted);
  eventBus.subscribe(DomainEventType.VacancyStaged, handleVacancyStaged);
  eventBus.subscribe(DomainEventType.BulkActionCompleted, handleBulkActionCompleted);
  eventBus.subscribe(DomainEventType.ModuleDeactivated, handleModuleDeactivated);
  eventBus.subscribe(DomainEventType.ModuleReactivated, handleModuleReactivated);
  eventBus.subscribe(DomainEventType.RetentionCompleted, handleRetentionCompleted);
  eventBus.subscribe(DomainEventType.JobStatusChanged, handleJobStatusChanged);
  eventBus.subscribe(DomainEventType.ReminderTriggered, handleReminderTriggered);
  eventBus.subscribe(DomainEventType.AutomationDegraded, handleAutomationDegraded);
}

// ---------------------------------------------------------------------------
// Test Helpers (exported for test access)
// ---------------------------------------------------------------------------

/** @internal — exposed for tests only */
export const _testHelpers = {
  get stagedBuffers() {
    return stagedBuffers;
  },
  flushStagedBuffer,
  buildDispatchContext,
  dispatchNotification,
  FLUSH_DELAY_MS,
};
