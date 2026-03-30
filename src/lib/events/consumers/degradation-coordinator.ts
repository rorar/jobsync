/**
 * DegradationCoordinator — Event Bus Consumer
 *
 * Bridges degradation events to RunCoordinator: when an automation is degraded
 * (auth failure, CB escalation, consecutive failures), release its run lock
 * so the scheduler can proceed.
 *
 * Spec: specs/module-lifecycle.allium (A8: Degradation <-> RunCoordinator bridge)
 */

import { eventBus } from "@/lib/events/event-bus"
import { DomainEventType } from "@/lib/events/event-types"
import { runCoordinator } from "@/lib/scheduler/run-coordinator"

export function registerDegradationCoordinator(): void {
  eventBus.subscribe(DomainEventType.AutomationDegraded, async (event) => {
    const { automationId } = event.payload
    runCoordinator.acknowledgeExternalStop(automationId)
  })
}
