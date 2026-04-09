import "server-only";

import prisma from "@/lib/db";
import { emitEvent, createEvent } from "@/lib/events";
import { DomainEventType } from "@/lib/events/event-types";
import type { NotificationDataExtended } from "@/models/notification.model";
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
 * Notification i18n — late-binding pattern (ADR-030)
 * --------------------------------------------------
 * Degradation notifications are written directly via prisma (not through the
 * notification-dispatcher), because they are produced inside module runtime
 * code paths that cannot easily round-trip through the event bus for
 * per-automation fan-out. The structured 5W+H fields are now first-class
 * Prisma columns (ADR-030, `add_notification_structured_fields` migration).
 * Writers here dual-write during rollout:
 *
 *   - `message`     — English fallback (backward compat for email/webhook
 *                     channels and older clients that don't read structured fields).
 *   - Top-level columns `titleKey`, `titleParams`, `actorType`, `actorId`,
 *                     `reasonKey`, `severity` — new typed fields resolved at
 *                     render time in the user's current locale via
 *                     formatNotificationTitle().
 *   - Legacy `data.*` blob — kept populated during rollout for pre-migration
 *                     clients and tests that still read `data.titleKey`.
 *
 * Keys referenced here already exist in src/i18n/dictionaries/notifications.ts.
 */

const CONSECUTIVE_RUN_FAILURE_THRESHOLD = 5;
const CB_ESCALATION_THRESHOLD = 3;

// Soft upper bound on free-text fragments stored inside notification data.
// Matches the length guard used for the English `message` fallback.
const NAME_TRUNCATION_LENGTH = 200;

function truncate(value: string, maxLength = NAME_TRUNCATION_LENGTH): string {
  return value.length > maxLength ? value.slice(0, maxLength) : value;
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

    // Create persistent notifications using createMany (no N+1).
    //
    // i18n: `message` is the English fallback; authoritative title is carried
    // in the top-level `titleKey + titleParams` columns (ADR-030) and resolved
    // at render time in the user's current locale (see formatNotificationTitle()).
    // We also dual-write the legacy `data.*` blob for backward compat.
    try {
      const safeModuleName = truncate(registered.manifest.name);
      const titleKey = "notifications.authFailure.title";
      const reasonKey = "notifications.reason.authExpired";
      await prisma.notification.createMany({
        data: affectedAutomations.map((auto) => {
          const safeAutomationName = truncate(auto.name);
          const extendedData: NotificationDataExtended = {
            moduleId,
            moduleName: safeModuleName,
            automationId: auto.id,
            automationName: safeAutomationName,
            titleKey,
            actorType: "module",
            actorId: moduleId,
            reasonKey,
            severity: "error",
          };
          return {
            userId: auto.userId,
            type: "auth_failure",
            // English fallback — structured title is late-bound via top-level `titleKey`.
            message: `Automation "${safeAutomationName}" paused: authentication failed for module "${safeModuleName}". Please check your credentials.`,
            moduleId,
            automationId: auto.id,
            data: extendedData as object,
            // Top-level 5W+H columns (ADR-030)
            titleKey,
            actorType: "module",
            actorId: moduleId,
            reasonKey,
            severity: "error",
          };
        }),
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

    // Create persistent notification for the automation owner.
    //
    // i18n: `message` is the English fallback; authoritative title is carried
    // in the top-level `titleKey + titleParams` columns (ADR-030) and resolved
    // at render time in the user's current locale (see formatNotificationTitle()).
    // We also dual-write the legacy `data.*` blob for backward compat.
    try {
      const safeAutomationName = truncate(automation.name);
      const titleKey = "notifications.consecutiveFailures.title";
      const titleParams = { count: CONSECUTIVE_RUN_FAILURE_THRESHOLD };
      const extendedData: NotificationDataExtended = {
        automationId,
        automationName: safeAutomationName,
        failureCount: CONSECUTIVE_RUN_FAILURE_THRESHOLD,
        titleKey,
        titleParams,
        actorType: "automation",
        actorId: automationId,
        severity: "warning",
      };
      await prisma.notification.create({
        data: {
          userId: automation.userId,
          type: "consecutive_failures",
          message: `Automation "${safeAutomationName}" paused after ${CONSECUTIVE_RUN_FAILURE_THRESHOLD} consecutive failed runs.`,
          automationId,
          data: extendedData as object,
          // Top-level 5W+H columns (ADR-030)
          titleKey,
          titleParams: titleParams as object,
          actorType: "automation",
          actorId: automationId,
          severity: "warning",
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

    // Create persistent notifications using createMany (no N+1).
    //
    // i18n: `message` is the English fallback; authoritative title is carried
    // in the top-level `titleKey + titleParams` columns (ADR-030) and resolved
    // at render time in the user's current locale (see formatNotificationTitle()).
    // We also dual-write the legacy `data.*` blob for backward compat.
    try {
      const safeModuleName = truncate(registered.manifest.name);
      const titleKey = "notifications.cbEscalation.title";
      const reasonKey = "notifications.reason.circuitBreaker";
      await prisma.notification.createMany({
        data: affectedAutomations.map((auto) => {
          const safeAutomationName = truncate(auto.name);
          const extendedData: NotificationDataExtended = {
            moduleId,
            moduleName: safeModuleName,
            automationId: auto.id,
            automationName: safeAutomationName,
            failureCount: newFailureCount,
            titleKey,
            actorType: "module",
            actorId: moduleId,
            reasonKey,
            severity: "warning",
          };
          return {
            userId: auto.userId,
            type: "cb_escalation",
            // English fallback — structured title is late-bound via top-level `titleKey`.
            message: `Automation "${safeAutomationName}" paused: module "${safeModuleName}" circuit breaker tripped ${newFailureCount} times.`,
            moduleId,
            automationId: auto.id,
            data: extendedData as object,
            // Top-level 5W+H columns (ADR-030)
            titleKey,
            actorType: "module",
            actorId: moduleId,
            reasonKey,
            severity: "warning",
          };
        }),
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
