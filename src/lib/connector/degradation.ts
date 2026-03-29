import "server-only";

import prisma from "@/lib/db";
import { moduleRegistry } from "./registry";
import { ModuleStatus } from "./manifest";

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
  userId: string,
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
  } catch {
    // best-effort
  }

  // Pause all active automations using this module
  const result = await prisma.automation.updateMany({
    where: {
      userId,
      jobBoard: moduleId,
      status: "active",
    },
    data: {
      status: "paused",
      pauseReason: "auth_failure",
    },
  });

  console.error(
    `[Degradation] Auth failure for module "${moduleId}": ${errorDetail}. Paused ${result.count} automation(s).`,
  );

  return { pausedCount: result.count };
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

    // All must be failed
    const allFailed = recentRuns.every((r) => r.status === "failed");
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
  userId: string,
): Promise<{ pausedCount: number }> {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) return { pausedCount: 0 };

  // Increment consecutive failures via registry mutation method
  const newFailureCount = registered.consecutiveFailures + 1;
  moduleRegistry.updateCircuitBreaker(moduleId, newFailureCount, new Date());

  // Check if escalation threshold reached
  if (newFailureCount < CB_ESCALATION_THRESHOLD) {
    return { pausedCount: 0 };
  }

  // Escalation: pause all active automations using this module
  const result = await prisma.automation.updateMany({
    where: {
      userId,
      jobBoard: moduleId,
      status: "active",
    },
    data: {
      status: "paused",
      pauseReason: "cb_escalation",
    },
  });

  console.warn(
    `[Degradation] CB escalation for module "${moduleId}": ${newFailureCount} consecutive opens. Paused ${result.count} automation(s).`,
  );

  return { pausedCount: result.count };
}

/**
 * When a module's circuit breaker recovers, reset the counter.
 */
export function handleCircuitBreakerRecovery(moduleId: string): void {
  moduleRegistry.updateCircuitBreaker(moduleId, 0, undefined);
}
