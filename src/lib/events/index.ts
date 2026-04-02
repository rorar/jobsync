/**
 * Domain Events — Public API
 *
 * Re-exports the EventBus singleton and all event types.
 * The `emitEvent()` function is a convenience wrapper around `eventBus.publish()`.
 *
 * Spec: specs/event-bus.allium (rule StubMigration)
 */

// Re-export everything from event-types for backward compatibility
export type {
  DomainEvent,
  DomainEventType,
  EventHandler,
  Unsubscribe,
  EventPayloadMap,
  VacancyPromotedPayload,
  VacancyDismissedPayload,
  VacancyStagedPayload,
  VacancyArchivedPayload,
  VacancyTrashedPayload,
  VacancyRestoredFromTrashPayload,
  BulkActionCompletedPayload,
  ModuleDeactivatedPayload,
  ModuleReactivatedPayload,
  RetentionCompletedPayload,
  NotificationCreatedPayload,
  SchedulerCycleStartedPayload,
  SchedulerCycleCompletedPayload,
  AutomationRunStartedPayload,
  AutomationRunCompletedPayload,
  AutomationDegradedPayload,
  JobStatusChangedPayload,
} from "./event-types";

export { DomainEventType as DomainEventTypes, createEvent } from "./event-types";
export { eventBus, WILDCARD } from "./event-bus";

// ---------------------------------------------------------------------------
// Convenience: backward-compatible emitEvent wrapper
// ---------------------------------------------------------------------------

import { eventBus } from "./event-bus";
import type { DomainEvent, DomainEventType } from "./event-types";

/**
 * Publish a domain event through the Event Bus.
 * Backward-compatible with the old stub signature.
 * New code should prefer `eventBus.publish()` or `createEvent()` directly.
 */
export function emitEvent<T extends DomainEventType>(event: DomainEvent<T>): void {
  // Fire-and-forget: the bus handles errors internally (ErrorIsolation rule)
  eventBus.publish(event).catch((error) => {
    console.error("[emitEvent] Unexpected bus error:", error);
  });
}
