/**
 * Event Consumer Registration
 *
 * Called at application startup (instrumentation.ts) to wire all event handlers.
 * Spec: specs/event-bus.allium (rule ConsumerRegistration)
 */

import { registerAuditLogger } from "./audit-logger";
import { registerNotificationDispatcher } from "./notification-dispatcher";
import { registerEnrichmentTrigger } from "./enrichment-trigger";
import { runCoordinator } from "@/lib/scheduler/run-coordinator";
import { registerLogoAssetSubscriber } from "@/lib/assets/logo-asset-subscriber";
import { registerCrmActivityLogConsumers } from "./crm-activity-logger";

// Guard survives HMR via globalThis (same pattern as health-scheduler.ts, event-bus.ts)
const g = globalThis as unknown as { __eventConsumersRegistered?: boolean };

export function registerEventConsumers(): void {
  if (g.__eventConsumersRegistered) return;
  g.__eventConsumersRegistered = true;

  // Phase 1: Audit logging (all events)
  registerAuditLogger();

  // Phase 5: Notification Dispatcher (domain events -> in-app notifications)
  registerNotificationDispatcher();

  // Degradation ↔ RunCoordinator bridge (A8: self-subscription, Sprint C)
  runCoordinator.subscribeToEvents();

  // Data Enrichment triggers (spec: data-enrichment.allium, rules TriggerEnrichmentOnCompanyCreated, TriggerEnrichmentOnJobImported)
  registerEnrichmentTrigger();

  // Logo Asset Cache (spec: logo-asset-cache.allium, rule DownloadOnEnrichment)
  registerLogoAssetSubscriber();

  // CRM Activity Logger (spec: crm.allium, contract TimelineProjection)
  registerCrmActivityLogConsumers();

  console.debug("[EventBus] All consumers registered");
}
