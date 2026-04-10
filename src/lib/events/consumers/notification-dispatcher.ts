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
  VacancyPromotedPayload,
  VacancyStagedPayload,
  BulkActionCompletedPayload,
  ModuleDeactivatedPayload,
  ModuleReactivatedPayload,
  RetentionCompletedPayload,
  JobStatusChangedPayload,
} from "../event-types";
import prisma from "@/lib/db";
import type {
  NotificationType,
  NotificationDataExtended,
} from "@/models/notification.model";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
} from "@/models/notification.model";
import type {
  NotificationPreferences,
  NotificationSeverity,
  NotificationActorType,
} from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";
import {
  channelRouter,
  registerChannels,
} from "@/lib/notifications/channel-router";
import type { NotificationDraft } from "@/lib/notifications/types";
import { t } from "@/i18n/server";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";

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
// Preference & Locale Resolution (single DB query per user)
// ---------------------------------------------------------------------------

interface UserSettingsResolved {
  preferences: NotificationPreferences;
  locale: string;
}

async function resolveUserSettings(userId: string): Promise<UserSettingsResolved> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return { preferences: DEFAULT_NOTIFICATION_PREFERENCES, locale: DEFAULT_LOCALE };
    const parsed: UserSettingsData = JSON.parse(row.settings);
    const preferences = parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
    const rawLocale = parsed.display?.locale;
    const locale = rawLocale && isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    return { preferences, locale };
  } catch {
    return { preferences: DEFAULT_NOTIFICATION_PREFERENCES, locale: DEFAULT_LOCALE };
  }
}

// Backward-compatible wrapper used by _testHelpers (exported as part of the
// public test surface). Handlers call `resolveUserSettings` directly so they
// can thread both `preferences` and `locale` into `dispatchNotification` with
// a single DB read (Sprint 2 H-P-01).
async function resolvePreferences(userId: string): Promise<NotificationPreferences> {
  const { preferences } = await resolveUserSettings(userId);
  return preferences;
}

// ---------------------------------------------------------------------------
// Dispatch Helper
// ---------------------------------------------------------------------------

/**
 * Build a NotificationDraft and route through all channels.
 * Replaces the old direct prisma.notification.create() calls.
 *
 * Performance (Sprint 2 H-P-01): callers MAY pass pre-resolved
 * `NotificationPreferences` via the second argument to avoid a second
 * `userSettings.findUnique` read inside the same handler invocation. Each
 * handler already reads `resolveUserSettings(userId)` to derive the locale
 * for the English fallback message, so threading the preferences through
 * eliminates the duplicate query. The default branch (no preferences arg)
 * keeps the old code path for any caller that has not been migrated.
 */
async function dispatchNotification(
  draft: NotificationDraft,
  preferences?: NotificationPreferences,
): Promise<void> {
  const resolved =
    preferences ?? (await resolveUserSettings(draft.userId)).preferences;

  // Fire-and-forget: do NOT await channel routing.
  // Webhook delivery can retry for up to 36s — blocking here would stall
  // the EventBus publish() loop and freeze the calling Server Action.
  channelRouter.route(draft, resolved).catch((err) => {
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

  // Single userSettings read (Sprint 2 H-P-01): resolve preferences + locale
  // together and thread both into dispatchNotification to avoid a second
  // `userSettings.findUnique` inside `dispatchNotification`.
  const { preferences, locale } = await resolveUserSettings(entry.userId);
  // Legacy `message` fallback: still dispatched for email/webhook/push channels
  // and for historical compatibility with clients that don't read structured data.
  const message = t(locale, "notifications.batchStaged")
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

  await dispatchNotification(draft, preferences);
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleVacancyPromoted(
  event: DomainEvent<typeof DomainEventType.VacancyPromoted>,
): Promise<void> {
  const payload = event.payload as VacancyPromotedPayload;
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);

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
      message: t(locale, "notifications.vacancyPromoted"),
      data: extendedData,
      titleKey,
      actorType,
      severity,
    },
    preferences,
  );
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
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  const message = t(locale, "notifications.bulkActionCompleted")
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
    preferences,
  );
}

async function handleModuleDeactivated(
  event: DomainEvent<typeof DomainEventType.ModuleDeactivated>,
): Promise<void> {
  const payload = event.payload as ModuleDeactivatedPayload;
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  // Sprint 3 M-A-02: prefer the payload's `moduleName` (authoritative display
  // name captured at publish time) over the raw `moduleId` slug. Pre-Sprint-3
  // events have no `moduleName` — fall back to the slug for compat.
  const displayName = payload.moduleName ?? payload.moduleId;
  const message = t(locale, "notifications.moduleDeactivated")
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
    preferences,
  );
}

async function handleModuleReactivated(
  event: DomainEvent<typeof DomainEventType.ModuleReactivated>,
): Promise<void> {
  const payload = event.payload as ModuleReactivatedPayload;
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  // Sprint 3 M-A-02: see handleModuleDeactivated.
  const displayName = payload.moduleName ?? payload.moduleId;
  const message = t(locale, "notifications.moduleReactivated")
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
    preferences,
  );
}

async function handleRetentionCompleted(
  event: DomainEvent<typeof DomainEventType.RetentionCompleted>,
): Promise<void> {
  const payload = event.payload as RetentionCompletedPayload;
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  const message = t(locale, "notifications.retentionCompleted")
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
    preferences,
  );
}

async function handleJobStatusChanged(
  event: DomainEvent<typeof DomainEventType.JobStatusChanged>,
): Promise<void> {
  const payload = event.payload as JobStatusChangedPayload;
  // Single userSettings read (Sprint 2 H-P-01)
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  const message = t(locale, "notifications.jobStatusChanged")
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
    preferences,
  );
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
