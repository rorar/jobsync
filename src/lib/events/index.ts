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
  SchedulerCycleStartedPayload,
  SchedulerCycleCompletedPayload,
  AutomationRunStartedPayload,
  AutomationRunCompletedPayload,
  AutomationDegradedPayload,
  JobStatusChangedPayload,
  CompanyCreatedPayload,
  EnrichmentCompletedPayload,
  EnrichmentFailedPayload,
} from "./event-types";

export { DomainEventType as DomainEventTypes, createEvent } from "./event-types";
export { eventBus, WILDCARD } from "./event-bus";

// ---------------------------------------------------------------------------
// Convenience: backward-compatible emitEvent wrapper
// ---------------------------------------------------------------------------

import { eventBus } from "./event-bus";
import type { DomainEvent, DomainEventType } from "./event-types";

/**
 * Publish a domain event through the Event Bus, fire-and-forget.
 *
 * IF-10 — INTENTIONAL CONTRACT (do not "fix" into an awaited call):
 * `emitEvent` returns `void` synchronously and never blocks the publisher on
 * consumer execution. This is by design — domain events decouple the publisher
 * from its consumers, and the bus already guarantees per-handler ErrorIsolation
 * (a throwing/rejecting consumer is caught inside `publish()` and never reaches
 * the publisher). The trailing `.catch` here only guards an *unexpected* bus
 * error (not handler errors), so a malformed event can never produce an
 * unhandled rejection.
 *
 * If a caller genuinely needs the delivery barrier (await all consumers settle,
 * observe side-effects, or sequence A-before-B), it must `await eventBus.publish()`
 * DIRECTLY instead of using this wrapper — that awaitable path already exists and
 * is the documented escape hatch. No current caller needs it; all ~30 call sites
 * are fire-and-forget.
 *
 * Contract pinned by `__tests__/event-bus.spec.ts` ("emitEvent contract (IF-10)").
 */
export function emitEvent<T extends DomainEventType>(event: DomainEvent<T>): void {
  // Fire-and-forget: the bus handles handler errors internally (ErrorIsolation
  // rule). This .catch only guards an unexpected bus-level failure.
  eventBus.publish(event).catch((error) => {
    console.error("[emitEvent] Unexpected bus error:", error);
  });
}
