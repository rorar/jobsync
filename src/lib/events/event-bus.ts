/**
 * In-Process Event Bus — Shared Kernel
 *
 * Asynchronous dispatch with parallel consumer execution.
 * Error isolation: one consumer failure does not affect others.
 * Spec: specs/event-bus.allium (contract EventBus, rules ErrorIsolation, OrderGuarantee)
 *
 * Sprint 2 H-P-06 performance fix:
 * Consumers used to execute sequentially under a per-handler await, which made
 * publish() stall on the slowest consumer and effectively serialized every
 * publisher behind every consumer's full execution. We now dispatch all
 * handlers concurrently via Promise.allSettled() so the total latency of
 * publish() is max(handler_i) instead of sum(handler_i).
 *
 * Spec impact: the original event-bus.allium ErrorIsolation rule mandates
 * `for_each handler in allHandlers: try: await handler.handle(event)`, which
 * literally describes a sequential loop. The finding H-P-06 explicitly calls
 * out that pattern as load-bearing on performance, and the team accepted
 * parallel dispatch as the remediation. We preserve the rule's *intent*:
 *   - Error isolation: allSettled guarantees a rejected handler never affects
 *     other handlers in the same publish().
 *   - OrderGuarantee: events published sequentially (await publish(A) then
 *     await publish(B)) still deliver A before B to every handler, because
 *     publish() awaits its own allSettled barrier before returning.
 *   - NoEventLoss: every registered handler is still invoked; none are
 *     skipped, even if earlier handlers reject.
 * What changes: intra-publish ordering across DIFFERENT handlers is no
 * longer guaranteed. Reviewed all 5 consumers (audit-logger, notification-
 * dispatcher, degradation-coordinator, enrichment-trigger, logo-asset-
 * subscriber) — none depend on observing another consumer's side-effects
 * within the same event dispatch. See tests in __tests__/event-bus.spec.ts.
 */

import type { DomainEvent, DomainEventType, EventHandler, Unsubscribe } from "./event-types";

// Wildcard type for subscribing to ALL events (e.g., AuditLogger)
export const WILDCARD = "*" as const;
type SubscriptionKey = DomainEventType | typeof WILDCARD;

class TypedEventBus {
  private handlers = new Map<SubscriptionKey, Set<EventHandler<any>>>();

  /**
   * Publish a domain event to all registered handlers.
   *
   * Handlers are invoked concurrently via Promise.allSettled so that:
   *  - a slow handler cannot block faster siblings
   *  - a throwing/rejecting handler cannot prevent other handlers from running
   *  - publish() still resolves only after EVERY handler settles (so tests
   *    and callers can observe side-effects after `await publish(...)`).
   *
   * Intra-publish handler ordering is NOT guaranteed. Publishers that need
   * causal ordering across consumers must publish separate events.
   */
  async publish<T extends DomainEventType>(event: DomainEvent<T>): Promise<void> {
    const typeHandlers = this.handlers.get(event.type);
    const wildcardHandlers = this.handlers.get(WILDCARD);

    // Snapshot handler list BEFORE dispatch so late subscribers during a handler
    // execution do not receive the current event (matches prior sequential
    // snapshot semantics and prevents set-mutation-during-iteration bugs).
    const allHandlers: EventHandler<any>[] = [];
    if (typeHandlers) allHandlers.push(...typeHandlers);
    if (wildcardHandlers) allHandlers.push(...wildcardHandlers);

    if (allHandlers.length === 0) return;

    // Wrap each handler invocation in its own try/catch so ALL failures — sync
    // throws, async rejects, and even handlers that throw before returning a
    // Promise — are isolated. Promise.allSettled alone would not catch a
    // synchronous throw during `handler(event)` evaluation.
    const results = await Promise.allSettled(
      allHandlers.map(async (handler) => handler(event)),
    );

    for (const result of results) {
      if (result.status === "rejected") {
        console.error(
          `[EventBus] Consumer failed for ${event.type}:`,
          result.reason,
        );
      }
    }
  }

  /**
   * Subscribe to events of a specific type.
   * Returns an unsubscribe function.
   */
  subscribe<T extends DomainEventType>(
    eventType: T | typeof WILDCARD,
    handler: EventHandler<T>,
  ): Unsubscribe {
    const key = eventType as SubscriptionKey;
    if (!this.handlers.has(key)) {
      this.handlers.set(key, new Set());
    }
    this.handlers.get(key)!.add(handler);

    return () => {
      this.handlers.get(key)?.delete(handler);
    };
  }

  /**
   * Remove a previously registered handler. No-op if not found.
   */
  unsubscribe<T extends DomainEventType>(
    eventType: T | typeof WILDCARD,
    handler: EventHandler<T>,
  ): void {
    this.handlers.get(eventType as SubscriptionKey)?.delete(handler);
  }

  /**
   * Remove all subscriptions. Used in tests only.
   */
  reset(): void {
    this.handlers.clear();
  }

  /**
   * Get handler count for a given event type (useful for testing).
   */
  handlerCount(eventType?: DomainEventType | typeof WILDCARD): number {
    if (eventType) {
      return this.handlers.get(eventType as SubscriptionKey)?.size ?? 0;
    }
    let total = 0;
    for (const set of this.handlers.values()) {
      total += set.size;
    }
    return total;
  }
}

// Singleton — survives HMR via globalThis (spec: SingletonBus invariant)
// Module-level variables reset on hot reload, but globalThis persists.
const g = globalThis as unknown as { __eventBus?: TypedEventBus };
if (!g.__eventBus) g.__eventBus = new TypedEventBus();
export const eventBus = g.__eventBus;
