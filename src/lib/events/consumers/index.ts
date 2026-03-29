/**
 * Event Consumer Registration
 *
 * Called at application startup (instrumentation.ts) to wire all event handlers.
 * Spec: specs/event-bus.allium (rule ConsumerRegistration)
 */

import { registerAuditLogger } from "./audit-logger";
import { registerNotificationDispatcher } from "./notification-dispatcher";

let registered = false;

export function registerEventConsumers(): void {
  // Guard against duplicate registration on hot reload (dev mode)
  if (registered) return;
  registered = true;

  // Phase 1: Audit logging (all events)
  registerAuditLogger();

  // Phase 5: Notification Dispatcher (domain events -> in-app notifications)
  registerNotificationDispatcher();

  console.debug("[EventBus] All consumers registered");
}
