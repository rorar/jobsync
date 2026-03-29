/**
 * Audit Logger — Event Bus Consumer
 *
 * Logs all domain events for debugging and audit purposes.
 * Subscribes to wildcard (*) to receive every event.
 *
 * Spec: specs/event-bus.allium (rule ConsumerRegistration)
 */

import type { DomainEvent } from "../event-types";
import { eventBus, WILDCARD } from "../event-bus";

function handleEvent(event: DomainEvent): void {
  console.debug(`[DomainEvent] ${event.type}`, event.payload);
}

export function registerAuditLogger(): void {
  eventBus.subscribe(WILDCARD, handleEvent);
}
