import "server-only";

import prisma from "@/lib/db";
import { emitEvent, createEvent } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import type { AutomationDegradedPayload } from "@/lib/events/event-types";
import { moduleRegistry } from "./registry";
import { ModuleStatus, CircuitBreakerState } from "./manifest";

/**
 * Automation Degradation Rules
 *
 * Implements three escalation rules from specs/module-lifecycle.allium:
 * - AuthFailureEscalation: immediate pause on auth failure
 * - ConsecutiveRunFailureEscalation: pause after N consecutive failed runs
 * - CircuitBreakerEscalation: pause after N consecutive CB opens
 *
 * Sprint C Architecture Decoupling
 * ---------------------------------
 * Notifications are NO LONGER routed from here. Each escalation rule emits
 * an `AutomationDegraded` event with enriched payload (notification fields).
 * The notification-dispatcher consumer subscribes to `AutomationDegraded`
 * and routes through ChannelRouter — one event per automation.
 */

const CONSECUTIVE_RUN_FAILURE_THRESHOLD = 5;
const CB_ESCALATION_THRESHOLD = 3;

// Soft upper bound on free-text fragments stored inside notification data.
const NAME_TRUNCATION_LENGTH = 200;

function truncate(value: string, maxLength = NAME_TRUNCATION_LENGTH): string {
  const sanitized = value.replace(/[\n\r\t]/g, " ");
  return sanitized.length > maxLength ? sanitized.slice(0, maxLength) : sanitized;
}

/**
 * Emit AutomationDegraded events for a set of affected automations.
 * Shared by handleAuthFailure and handleCircuitBreakerTrip which have
 * identical loop structures differing only in the event payload fields.
 *
 * `buildMessage` receives the truncated automation name so each event
 * carries a human-readable per-automation message.
 */
function emitDegradationEvents(
  automations: { id: string; userId: string; name: string }[],
  base: Omit<AutomationDegradedPayload, "automationId" | "userId" | "automationName" | "message">,
  buildMessage: (automationName: string) => string,
): void {
  for (const auto of automations) {
    const safeName = truncate(auto.name);
    emitEvent(
      createEvent(DomainEventType.AutomationDegraded, {
        ...base,
        automationId: auto.id,
        userId: auto.userId,
        automationName: safeName,
        message: buildMessage(safeName),
      }),
    );
  }
}

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

  // Guard: only escalate for currently active modules (CB-7)
  // Prevents spurious escalation on already-errored or inactive modules
  if (registered.status !== ModuleStatus.ACTIVE) return { pausedCount: 0 };

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

    const safeModuleName = truncate(registered.manifest.name);
    emitDegradationEvents(
      affectedAutomations,
      {
        reason: "auth_failure",
        moduleId,
        titleKey: "notifications.authFailure.title",
        actorType: "module",
        actorId: moduleId,
        reasonKey: "notifications.reason.authExpired",
        severity: "error",
        moduleName: safeModuleName,
      },
      (name) => `Automation "${name}" paused: authentication failed for module "${safeModuleName}". Please check your credentials.`,
    );
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
 *
 * M-S-02 AUDIT — Security invariant (confirmed-safe, NOT a cross-user leak):
 * -------------------------------------------------------------------------
 * This function queries AutomationRun and Automation by `automationId` only,
 * without an additional `userId` scope parameter. This is INTENTIONAL and
 * correct per the following analysis:
 *
 * 1. Caller: the RunCoordinator (system-internal), which passes a validated
 *    automationId from its own mutex/lock map — never a user-supplied value.
 * 2. Scope: per-automation (one user's automation), NOT per-module. Each
 *    Automation record belongs to exactly one User (Automation.userId).
 *    The function reads that userId from the DB record (line below) and uses
 *    it ONLY to scope the resulting notification and event to the owner.
 *    It never touches another user's automations.
 * 3. Contrast with handleAuthFailure / handleCircuitBreakerTrip: those
 *    intentionally operate cross-user (module-level failures affect ALL users
 *    running that module). ConsecutiveRunFailureEscalation is per-automation
 *    by spec design (different automations may hit different code paths in
 *    the same module — see specs/module-lifecycle.allium guidance on rule
 *    ConsecutiveRunFailureEscalation).
 * 4. No admin gate needed: this is a runtime signal (system-initiated),
 *    not a user-initiated toggle. See BUGS.md Sprint 1.5 "runtime-signal
 *    carve-out" and CLAUDE.md § Cross-User Degradation.
 *
 * Conclusion: leave as-is. Adding userId scope here would require the caller
 * to know the userId before calling, which is a worse design (the caller is
 * the scheduler, not an action handler that already has a session user).
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

    // Check if automation is still active (defense-in-depth: scope by automationId)
    // Note: findFirst required for ADR-015 compliance pattern (findUnique needs unique key only)
    const automation = await prisma.automation.findFirst({
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

    // Emit via shared helper (same pattern as handleAuthFailure/handleCircuitBreakerTrip)
    emitDegradationEvents(
      [{ id: automationId, userId: automation.userId, name: automation.name }],
      {
        reason: "consecutive_failures",
        titleKey: "notifications.consecutiveFailures.title",
        titleParams: { count: CONSECUTIVE_RUN_FAILURE_THRESHOLD },
        actorType: "automation",
        actorId: automationId,
        severity: "warning",
        failureCount: CONSECUTIVE_RUN_FAILURE_THRESHOLD,
      },
      (name) => `Automation "${name}" paused after ${CONSECUTIVE_RUN_FAILURE_THRESHOLD} consecutive failed runs.`,
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

  // Guard: only escalate for currently active modules (CB-7)
  // Prevents spurious escalation on already-errored or inactive modules
  if (registered.status !== ModuleStatus.ACTIVE) return { pausedCount: 0 };

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

    const safeModuleName = truncate(registered.manifest.name);
    emitDegradationEvents(
      affectedAutomations,
      {
        reason: "cb_escalation",
        moduleId,
        titleKey: "notifications.cbEscalation.title",
        actorType: "module",
        actorId: moduleId,
        reasonKey: "notifications.reason.circuitBreaker",
        severity: "warning",
        moduleName: safeModuleName,
        failureCount: newFailureCount,
      },
      (name) => `Automation "${name}" paused: module "${safeModuleName}" circuit breaker tripped ${newFailureCount} times.`,
    );
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
