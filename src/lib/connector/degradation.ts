import "server-only";

import prisma from "@/lib/db";
import { emitEvent, createEvent } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import { moduleRegistry } from "./registry";
import { ModuleStatus, CircuitBreakerState } from "./manifest";

/**
 * Automation Degradation Rules
 *
 * Implements three escalation rules from specs/module-lifecycle.allium:
 * - AuthFailureEscalation: immediate pause on auth failure
 * - ConsecutiveRunFailureEscalation: pause after N consecutive failed runs
 * - CircuitBreakerEscalation: pause after N consecutive CB opens
 */

const CONSECUTIVE_RUN_FAILURE_THRESHOLD = 5;
const CB_ESCALATION_THRESHOLD = 3;

// =============================================================================
// AuthFailureEscalation (Allium spec rule)
// =============================================================================

/**
 * When a module's credential becomes invalid during operation, pause affected automations.
 * Called by modules when they detect auth failure (e.g., 401/403 response).
 */
export async function handleAuthFailure(
  moduleId: string,
  errorDetail: string,
): Promise<{ pausedCount: number }> {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) return { pausedCount: 0 };

  // Spec precondition: only escalate for modules that require credentials
  // See specs/module-lifecycle.allium, rule AuthFailureEscalation (line 548):
  //   requires: module.manifest.credential.required = true
  if (!registered.manifest.credential.required) return { pausedCount: 0 };

  // Set module to error status
  moduleRegistry.setStatus(moduleId, ModuleStatus.ERROR);

  try {
    await prisma.moduleRegistration.upsert({
      where: { moduleId },
      update: { status: "error" },
      create: {
        moduleId,
        connectorType: moduleRegistry.get(moduleId)?.manifest.connectorType ?? "unknown",
        status: "error",
      },
    });
  } catch (err) {
    console.warn("[Degradation] Failed to persist module error status:", err);
  }

  // Query IDs BEFORE update to avoid TOCTOU race — captures the exact set
  // of automations that will be paused, before any concurrent changes.
  const affectedAutomations = await prisma.automation.findMany({
    where: {
      jobBoard: moduleId,
      status: "active",
    },
    select: { id: true, userId: true, name: true },
  });

  if (affectedAutomations.length > 0) {
    // Update by the specific IDs we captured (no TOCTOU)
    await prisma.automation.updateMany({
      where: { id: { in: affectedAutomations.map((a) => a.id) } },
      data: {
        status: "paused",
        pauseReason: "auth_failure",
      },
    });

    // Create persistent notifications using createMany (no N+1)
    // TODO(i18n): Notification messages are stored in English. Migrate to structured
    // i18n format { key, params } when notification rendering supports it.
    try {
      const safeModuleName = registered.manifest.name.slice(0, 200);
      await prisma.notification.createMany({
        data: affectedAutomations.map((auto) => ({
          userId: auto.userId,
          type: "auth_failure",
          message: `Automation "${auto.name.slice(0, 200)}" paused: authentication failed for module "${safeModuleName}". Please check your credentials.`,
          moduleId,
          automationId: auto.id,
        })),
      });
    } catch (err) {
      console.warn("[Degradation] Failed to create auth_failure notifications:", err);
    }

    // Emit AutomationDegraded events (A8: bridge to RunCoordinator)
    for (const auto of affectedAutomations) {
      emitEvent(
        createEvent(DomainEventType.AutomationDegraded, {
          automationId: auto.id,
          userId: auto.userId,
          reason: "auth_failure",
        }),
      );
    }
  }

  console.error(
    `[Degradation] Auth failure for module "${moduleId}": ${errorDetail}. Paused ${affectedAutomations.length} automation(s).`,
  );

  return { pausedCount: affectedAutomations.length };
}

// =============================================================================
// ConsecutiveRunFailureEscalation (Allium spec rule)
// =============================================================================

/**
 * When an automation's recent runs have all failed, pause it.
 * Called after each automation run completes.
 */
export async function checkConsecutiveRunFailures(
  automationId: string,
): Promise<{ paused: boolean }> {
  try {
    const recentRuns = await prisma.automationRun.findMany({
      where: { automationId },
      orderBy: { startedAt: "desc" },
      take: CONSECUTIVE_RUN_FAILURE_THRESHOLD,
      select: { status: true },
    });

    // Need at least THRESHOLD runs to trigger
    if (recentRuns.length < CONSECUTIVE_RUN_FAILURE_THRESHOLD) {
      return { paused: false };
    }

    // All must be terminal failure statuses (failed, blocked, rate_limited)
    const FAILURE_STATUSES = ["failed", "blocked", "rate_limited"];
    const allFailed = recentRuns.every((r) => FAILURE_STATUSES.includes(r.status));
    if (!allFailed) {
      return { paused: false };
    }

    // Check if automation is still active
    const automation = await prisma.automation.findUnique({
      where: { id: automationId },
      select: { status: true, name: true, userId: true },
    });

    if (!automation || automation.status !== "active") {
      return { paused: false };
    }

    // Pause the automation
    await prisma.automation.update({
      where: { id: automationId },
      data: {
        status: "paused",
        pauseReason: "consecutive_failures",
      },
    });

    // Create persistent notification for the automation owner
    // TODO(i18n): Notification messages are stored in English. Migrate to structured
    // i18n format { key, params } when notification rendering supports it.
    try {
      await prisma.notification.create({
        data: {
          userId: automation.userId,
          type: "consecutive_failures",
          message: `Automation "${automation.name.slice(0, 200)}" paused after ${CONSECUTIVE_RUN_FAILURE_THRESHOLD} consecutive failed runs.`,
          automationId,
        },
      });
    } catch (err) {
      console.warn("[Degradation] Failed to create consecutive_failures notification:", err);
    }

    // Emit AutomationDegraded event (A8: bridge to RunCoordinator)
    emitEvent(
      createEvent(DomainEventType.AutomationDegraded, {
        automationId,
        userId: automation.userId,
        reason: "consecutive_failures",
      }),
    );

    console.warn(
      `[Degradation] Automation "${automation.name}" paused after ${CONSECUTIVE_RUN_FAILURE_THRESHOLD} consecutive failed runs.`,
    );

    return { paused: true };
  } catch (error) {
    console.error("[Degradation] Error checking consecutive run failures:", error);
    return { paused: false };
  }
}

// =============================================================================
// CircuitBreakerEscalation (Allium spec rule)
// =============================================================================

/**
 * When a module's circuit breaker has opened too many times, pause automations.
 * Called when a CB trip event is observed.
 */
export async function handleCircuitBreakerTrip(
  moduleId: string,
): Promise<{ pausedCount: number }> {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) return { pausedCount: 0 };

  // Increment consecutive failures + set CB state to OPEN (spec rule CircuitBreakerStateTransition)
  const newFailureCount = registered.consecutiveFailures + 1;
  moduleRegistry.updateCircuitBreaker(
    moduleId, newFailureCount, CircuitBreakerState.OPEN, new Date(),
  );

  // Check if escalation threshold reached
  if (newFailureCount < CB_ESCALATION_THRESHOLD) {
    return { pausedCount: 0 };
  }

  // Query IDs BEFORE update to avoid TOCTOU race — captures the exact set
  // of automations that will be paused, before any concurrent changes.
  const affectedAutomations = await prisma.automation.findMany({
    where: {
      jobBoard: moduleId,
      status: "active",
    },
    select: { id: true, userId: true, name: true },
  });

  if (affectedAutomations.length > 0) {
    // Update by the specific IDs we captured (no TOCTOU)
    await prisma.automation.updateMany({
      where: { id: { in: affectedAutomations.map((a) => a.id) } },
      data: {
        status: "paused",
        pauseReason: "cb_escalation",
      },
    });

    // Create persistent notifications using createMany (no N+1)
    // TODO(i18n): Notification messages are stored in English. Migrate to structured
    // i18n format { key, params } when notification rendering supports it.
    try {
      const safeModuleName = registered.manifest.name.slice(0, 200);
      await prisma.notification.createMany({
        data: affectedAutomations.map((auto) => ({
          userId: auto.userId,
          type: "cb_escalation",
          message: `Automation "${auto.name.slice(0, 200)}" paused: module "${safeModuleName}" circuit breaker tripped ${newFailureCount} times.`,
          moduleId,
          automationId: auto.id,
        })),
      });
    } catch (err) {
      console.warn("[Degradation] Failed to create cb_escalation notifications:", err);
    }

    // Emit AutomationDegraded events (A8: bridge to RunCoordinator)
    for (const auto of affectedAutomations) {
      emitEvent(
        createEvent(DomainEventType.AutomationDegraded, {
          automationId: auto.id,
          userId: auto.userId,
          reason: "cb_escalation",
        }),
      );
    }
  }

  console.warn(
    `[Degradation] CB escalation for module "${moduleId}": ${newFailureCount} consecutive opens. Paused ${affectedAutomations.length} automation(s).`,
  );

  return { pausedCount: affectedAutomations.length };
}

/**
 * When a module's circuit breaker recovers, reset the counter.
 */
export function handleCircuitBreakerRecovery(moduleId: string): void {
  // Reset counter + set CB state to CLOSED (spec rule CircuitBreakerRecovery)
  moduleRegistry.updateCircuitBreaker(moduleId, 0, CircuitBreakerState.CLOSED, null);
}
