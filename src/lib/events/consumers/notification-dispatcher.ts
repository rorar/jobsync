/**
 * NotificationDispatcher — Event Bus Consumer
 *
 * Maps domain events to in-app notifications via Prisma.
 * Subscribes to notification-relevant event types and creates Notification records.
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
} from "../event-types";
import prisma from "@/lib/db";
import type { NotificationType } from "@/models/notification.model";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  shouldNotify,
} from "@/models/notification.model";
import type { NotificationPreferences } from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";

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

async function flushStagedBuffer(automationId: string): Promise<void> {
  const entry = stagedBuffers.get(automationId);
  if (!entry) return;
  stagedBuffers.delete(automationId);

  const prefs = await resolvePreferences(entry.userId);
  if (!shouldNotify(prefs, "vacancy_batch_staged")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: entry.userId,
        type: "vacancy_batch_staged" satisfies NotificationType,
        message: `${entry.count} new vacancies staged from automation`,
        automationId,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create batch staged notification:", error);
  }
}

// ---------------------------------------------------------------------------
// Event Handlers
// ---------------------------------------------------------------------------

async function handleVacancyPromoted(
  event: DomainEvent<typeof DomainEventType.VacancyPromoted>,
): Promise<void> {
  const payload = event.payload as VacancyPromotedPayload;
  const prefs = await resolvePreferences(payload.userId);
  if (!shouldNotify(prefs, "vacancy_promoted")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: "vacancy_promoted" satisfies NotificationType,
        message: `Job created from staged vacancy`,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create vacancy_promoted notification:", error);
  }
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
  const prefs = await resolvePreferences(payload.userId);
  if (!shouldNotify(prefs, "bulk_action_completed")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: "bulk_action_completed" satisfies NotificationType,
        message: `${payload.succeeded} items ${payload.actionType}d successfully`,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create bulk_action_completed notification:", error);
  }
}

async function handleModuleDeactivated(
  event: DomainEvent<typeof DomainEventType.ModuleDeactivated>,
): Promise<void> {
  const payload = event.payload as ModuleDeactivatedPayload;
  const prefs = await resolvePreferences(payload.userId);
  if (!shouldNotify(prefs, "module_deactivated")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: "module_deactivated" satisfies NotificationType,
        message: `Module ${payload.moduleId} deactivated. ${payload.affectedAutomationIds.length} automation(s) paused.`,
        moduleId: payload.moduleId,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create module_deactivated notification:", error);
  }
}

async function handleModuleReactivated(
  event: DomainEvent<typeof DomainEventType.ModuleReactivated>,
): Promise<void> {
  const payload = event.payload as ModuleReactivatedPayload;
  const prefs = await resolvePreferences(payload.userId);
  if (!shouldNotify(prefs, "module_reactivated")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: "module_reactivated" satisfies NotificationType,
        message: `Module ${payload.moduleId} reactivated. ${payload.pausedAutomationCount} automation(s) remain paused.`,
        moduleId: payload.moduleId,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create module_reactivated notification:", error);
  }
}

async function handleRetentionCompleted(
  event: DomainEvent<typeof DomainEventType.RetentionCompleted>,
): Promise<void> {
  const payload = event.payload as RetentionCompletedPayload;
  const prefs = await resolvePreferences(payload.userId);
  if (!shouldNotify(prefs, "retention_completed")) return;

  try {
    await prisma.notification.create({
      data: {
        userId: payload.userId,
        type: "retention_completed" satisfies NotificationType,
        message: `${payload.purgedCount} expired vacancies cleaned up`,
      },
    });
  } catch (error) {
    console.error("[NotificationDispatcher] Failed to create retention_completed notification:", error);
  }
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
  FLUSH_DELAY_MS,
};
