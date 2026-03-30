/**
 * Event Consumer Registration
 *
 * Called at application startup (instrumentation.ts) to wire all event handlers.
 * Spec: specs/event-bus.allium (rule ConsumerRegistration)
 */

import { registerAuditLogger } from "./audit-logger";
import { registerNotificationDispatcher } from "./notification-dispatcher";

// Guard survives HMR via globalThis (same pattern as health-scheduler.ts, event-bus.ts)
const g = globalThis as unknown as { __eventConsumersRegistered?: boolean };

export function registerEventConsumers(): void {
  if (g.__eventConsumersRegistered) return;
  g.__eventConsumersRegistered = true;

  // Phase 1: Audit logging (all events)
  registerAuditLogger();

  // Phase 5: Notification Dispatcher (domain events -> in-app notifications)
  registerNotificationDispatcher();

  console.debug("[EventBus] All consumers registered");
}
