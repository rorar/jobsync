/**
 * In-Process Event Bus — Shared Kernel
 *
 * Synchronous dispatch with async handler support.
 * Error isolation: one consumer failure does not affect others.
 * Spec: specs/event-bus.allium (contract EventBus, rules ErrorIsolation, OrderGuarantee)
 */

import type { DomainEvent, DomainEventType, EventHandler, Unsubscribe } from "./event-types";

// Wildcard type for subscribing to ALL events (e.g., AuditLogger)
export const WILDCARD = "*" as const;
type SubscriptionKey = DomainEventType | typeof WILDCARD;

class TypedEventBus {
  private handlers = new Map<SubscriptionKey, Set<EventHandler<any>>>();

  /**
   * Publish a domain event to all registered handlers.
   * Handlers execute in registration order. Errors are isolated per handler.
   */
  async publish<T extends DomainEventType>(event: DomainEvent<T>): Promise<void> {
    const typeHandlers = this.handlers.get(event.type);
    const wildcardHandlers = this.handlers.get(WILDCARD);

    const allHandlers: EventHandler<any>[] = [];
    if (typeHandlers) allHandlers.push(...typeHandlers);
    if (wildcardHandlers) allHandlers.push(...wildcardHandlers);

    for (const handler of allHandlers) {
      try {
        await handler(event);
      } catch (error) {
        console.error(`[EventBus] Consumer failed for ${event.type}:`, error);
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

// Singleton — module-scoped per Node.js import caching (spec: SingletonBus invariant)
export const eventBus = new TypedEventBus();
