/**
 * NotificationDispatcher — Event Bus Consumer
 *
 * Maps domain events to notification drafts and routes them through the ChannelRouter.
 * Each channel (InApp, Webhook, Email, Push) decides independently whether to dispatch.
 *
 * For VacancyStaged events: buffers by automationId and emits a summary
 * notification after a flush interval (5 seconds of inactivity).
 *
 * Spec: specs/notification-dispatch.allium (contract NotificationDispatcher)
 */

import { eventBus } from "../event-bus";
import { DomainEventType } from "../event-types";
import type {
  DomainEvent,
  VacancyPromotedPayload,
  VacancyStagedPayload,
  BulkActionCompletedPayload,
  ModuleDeactivatedPayload,
  ModuleReactivatedPayload,
  RetentionCompletedPayload,
  JobStatusChangedPayload,
} from "../event-types";
import prisma from "@/lib/db";
import type { NotificationType } from "@/models/notification.model";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/models/notification.model";
import type { NotificationPreferences } from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";
import { channelRouter } from "@/lib/notifications/channel-router";
import { InAppChannel } from "@/lib/notifications/channels/in-app.channel";
import { WebhookChannel } from "@/lib/notifications/channels/webhook.channel";
import { EmailChannel } from "@/lib/notifications/channels/email.channel";
import type { NotificationDraft } from "@/lib/notifications/types";
import { t } from "@/i18n/server";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";

// ---------------------------------------------------------------------------
// Channel Registration (one-time)
// ---------------------------------------------------------------------------

// Register channels on first import. The channelRouter is a globalThis singleton,
// so duplicate registration is guarded internally.
channelRouter.register(new InAppChannel());
channelRouter.register(new WebhookChannel());
channelRouter.register(new EmailChannel());

// ---------------------------------------------------------------------------
// VacancyStaged batch buffer (spec: rule BatchSummary)
// ---------------------------------------------------------------------------

interface StagedBuffer {
  userId: string;
  count: number;
  timer: ReturnType<typeof setTimeout>;
}

const FLUSH_DELAY_MS = 5_000;

/** In-memory buffer: automationId -> { userId, count, timer } */
const stagedBuffers = new Map<string, StagedBuffer>();

// ---------------------------------------------------------------------------
// Preference Resolution (direct Prisma, not via server action)
// ---------------------------------------------------------------------------

async function resolvePreferences(userId: string): Promise<NotificationPreferences> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_NOTIFICATION_PREFERENCES;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
  } catch {
    return DEFAULT_NOTIFICATION_PREFERENCES;
  }
}

/**
 * Resolve the user's preferred locale from their settings.
 * Falls back to DEFAULT_LOCALE ("en") if settings are unavailable or unparseable.
 */
async function resolveLocale(userId: string): Promise<string> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_LOCALE;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    const locale = parsed.display?.locale;
    if (locale && isValidLocale(locale)) return locale;
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

// ---------------------------------------------------------------------------
// Dispatch Helper
// ---------------------------------------------------------------------------

/**
 * Build a NotificationDraft and route through all channels.
 * Replaces the old direct prisma.notification.create() calls.
 */
async function dispatchNotification(draft: NotificationDraft): Promise<void> {
  const prefs = await resolvePreferences(draft.userId);

  // Fire-and-forget: do NOT await channel routing.
  // Webhook delivery can retry for up to 36s — blocking here would stall
  // the EventBus publish() loop and freeze the calling Server Action.
  channelRouter.route(draft, prefs).catch((err) => {
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

  const locale = await resolveLocale(entry.userId);
  const message = t(locale, "notifications.batchStaged")
    .replace("{count}", String(entry.count));

  const draft: NotificationDraft = {
    userId: entry.userId,
    type: "vacancy_batch_staged" satisfies NotificationType,
    message,
    automationId,
    data: { count: entry.count, automationId },
  };

  await dispatchNotification(draft);
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleVacancyPromoted(
  event: DomainEvent<typeof DomainEventType.VacancyPromoted>,
): Promise<void> {
  const payload = event.payload as VacancyPromotedPayload;
  const locale = await resolveLocale(payload.userId);

  await dispatchNotification({
    userId: payload.userId,
    type: "vacancy_promoted" satisfies NotificationType,
    message: t(locale, "notifications.vacancyPromoted"),
    data: { stagedVacancyId: payload.stagedVacancyId, jobId: payload.jobId },
  });
}

async function handleVacancyStaged(
  event: DomainEvent<typeof DomainEventType.VacancyStaged>,
): Promise<void> {
  const payload = event.payload as VacancyStagedPayload;

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
  const payload = event.payload as BulkActionCompletedPayload;
  const locale = await resolveLocale(payload.userId);
  const message = t(locale, "notifications.bulkActionCompleted")
    .replace("{succeeded}", String(payload.succeeded))
    .replace("{actionType}", payload.actionType);

  await dispatchNotification({
    userId: payload.userId,
    type: "bulk_action_completed" satisfies NotificationType,
    message,
    data: {
      actionType: payload.actionType,
      succeeded: payload.succeeded,
      failed: payload.failed,
      itemCount: payload.itemIds.length,
    },
  });
}

async function handleModuleDeactivated(
  event: DomainEvent<typeof DomainEventType.ModuleDeactivated>,
): Promise<void> {
  const payload = event.payload as ModuleDeactivatedPayload;
  const locale = await resolveLocale(payload.userId);
  const message = t(locale, "notifications.moduleDeactivated")
    .replace("{name}", payload.moduleId)
    .replace("{automationCount}", String(payload.affectedAutomationIds.length));

  await dispatchNotification({
    userId: payload.userId,
    type: "module_deactivated" satisfies NotificationType,
    message,
    moduleId: payload.moduleId,
    data: {
      moduleId: payload.moduleId,
      affectedAutomationCount: payload.affectedAutomationIds.length,
    },
  });
}

async function handleModuleReactivated(
  event: DomainEvent<typeof DomainEventType.ModuleReactivated>,
): Promise<void> {
  const payload = event.payload as ModuleReactivatedPayload;
  const locale = await resolveLocale(payload.userId);
  const message = t(locale, "notifications.moduleReactivated")
    .replace("{name}", payload.moduleId)
    .replace("{automationCount}", String(payload.pausedAutomationCount));

  await dispatchNotification({
    userId: payload.userId,
    type: "module_reactivated" satisfies NotificationType,
    message,
    moduleId: payload.moduleId,
    data: {
      moduleId: payload.moduleId,
      pausedAutomationCount: payload.pausedAutomationCount,
    },
  });
}

async function handleRetentionCompleted(
  event: DomainEvent<typeof DomainEventType.RetentionCompleted>,
): Promise<void> {
  const payload = event.payload as RetentionCompletedPayload;
  const locale = await resolveLocale(payload.userId);
  const message = t(locale, "notifications.retentionCompleted")
    .replace("{count}", String(payload.purgedCount));

  await dispatchNotification({
    userId: payload.userId,
    type: "retention_completed" satisfies NotificationType,
    message,
    data: { purgedCount: payload.purgedCount, hashesCreated: payload.hashesCreated },
  });
}

async function handleJobStatusChanged(
  event: DomainEvent<typeof DomainEventType.JobStatusChanged>,
): Promise<void> {
  const payload = event.payload as JobStatusChangedPayload;
  const locale = await resolveLocale(payload.userId);
  const message = t(locale, "notifications.jobStatusChanged")
    .replace("{newStatus}", payload.newStatusValue)
    .replace("{jobId}", payload.jobId);

  await dispatchNotification({
    userId: payload.userId,
    type: "job_status_changed" satisfies NotificationType,
    message,
    data: {
      jobId: payload.jobId,
      previousStatus: payload.previousStatusValue,
      newStatus: payload.newStatusValue,
      note: payload.note,
      historyEntryId: payload.historyEntryId,
    },
  });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerNotificationDispatcher(): void {
  eventBus.subscribe(DomainEventType.VacancyPromoted, handleVacancyPromoted);
  eventBus.subscribe(DomainEventType.VacancyStaged, handleVacancyStaged);
  eventBus.subscribe(DomainEventType.BulkActionCompleted, handleBulkActionCompleted);
  eventBus.subscribe(DomainEventType.ModuleDeactivated, handleModuleDeactivated);
  eventBus.subscribe(DomainEventType.ModuleReactivated, handleModuleReactivated);
  eventBus.subscribe(DomainEventType.RetentionCompleted, handleRetentionCompleted);
  eventBus.subscribe(DomainEventType.JobStatusChanged, handleJobStatusChanged);
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
  resolvePreferences,
  dispatchNotification,
  FLUSH_DELAY_MS,
};
