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

export function truncate(value: string, maxLength = NAME_TRUNCATION_LENGTH): string {
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
export function emitDegradationEvents(
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
 *
 * Returns `escalated: false` when the AuthFailureEscalation rule was NOT applied —
 * either because a precondition did not hold (unknown module, module not ACTIVE,
 * credential not required) or because the escalation could not be committed.
 *
 * That list IS the whole story, and keeping it so is the point: this function
 * does not reject. Its sole caller (`ai-provider/providers.ts:22`) is
 * `void handleAuthFailure(...).catch(...)`, so a rejection is observed by nobody
 * — an outcome that is not in the return value is not reported at all.
 *
 * MOD-B1 residual, closed 2026-09-05: the error status and the pause cascade are
 * ONE transaction. Until this change only the persist was guarded, so a throw in
 * the automation query or the pause left the module DURABLY in `error` with some
 * or none of its automations paused — and because the CB-7 guard above skips any
 * module that is not ACTIVE, no later auth failure could retry the cascade for
 * the life of the process. Nothing repaired it and nobody observed it.
 *
 * What the commit boundary buys, precisely:
 *   1. No automation is paused unless the error status commits. That was the
 *      original MOD-B1 property, previously enforced by statement ORDER, which
 *      only ever covered a failure of the first statement.
 *   2. The error status is not durable unless the cascade committed with it, so
 *      the state that permanently disarms CB-7 cannot arise from a partial run.
 *   3. A rollback leaves the module ACTIVE and memory untouched, which is the
 *      only RETRYABLE outcome: the next auth failure re-enters and tries again.
 *
 * The cascade is cross-user by design (CLAUDE.md § Cross-User Degradation). That
 * makes all-or-nothing MORE important, not less: a partial cascade pauses an
 * arbitrary subset of tenants with nothing recording which ones. SQLite
 * serializes writers at the database file — not per row, and not per tenant — so
 * this trades two short write locks for one slightly longer one over the same
 * three statements. Under contention it fails as SQLITE_BUSY and rolls back
 * whole, which is exactly the outcome wanted here.
 *
 * The in-memory mirror and the domain events sit AFTER the commit deliberately.
 * A registry mutation before the commit is the MOD-B1 shape again. An event
 * before the commit announces a pause that may still roll back, and its
 * consumers write through the NON-transactional client into a database this
 * transaction is still holding open.
 *
 * The cost of aborting is that automations keep running against a credential we
 * already know is dead until the database recovers. That cost is bounded: each
 * failed run re-enters this function (retrying the escalation) and feeds
 * `checkConsecutiveRunFailures`, which pauses the automation after five failures
 * through a different write on a different table.
 *
 * Two residuals, named rather than hidden, both in the window after the commit:
 *   - Events are fire-and-forget (IF-10), so a crash between commit and dispatch
 *     pauses automations without telling anyone. Same class as every other
 *     `emitEvent` call site.
 *   - A crash before `setStatus` leaves memory ACTIVE over a durable `error`.
 *     That self-repairs: the next auth failure re-enters, the upsert re-asserts
 *     `error`, the query finds no active automations left, and the call returns
 *     `{ pausedCount: 0, escalated: true }`.
 *
 * See MOD-B1 in docs/BUGS.md and specs/module-lifecycle.allium invariants
 * LifecycleStatusIsDurable + EscalationIsNotAtomic.
 */
export async function handleAuthFailure(
  moduleId: string,
  errorDetail: string,
): Promise<{ pausedCount: number; escalated: boolean }> {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) return { pausedCount: 0, escalated: false };

  // Guard: only escalate for currently active modules (CB-7)
  // Prevents spurious escalation on already-errored or inactive modules
  if (registered.status !== ModuleStatus.ACTIVE) return { pausedCount: 0, escalated: false };

  // Spec precondition: only escalate for modules that require credentials
  // See specs/module-lifecycle.allium, rule AuthFailureEscalation (line 548):
  //   requires: module.manifest.credential.required = true
  if (!registered.manifest.credential.required) return { pausedCount: 0, escalated: false };

  // MOD-B1 + its residual: the error status AND the pause cascade commit
  // together, or neither does. The persist stays first inside the transaction
  // so the statement order still reads as the rule does, but correctness no
  // longer rests on that order — it rests on the commit.
  //
  // Nothing that is not a database write belongs in here. The in-memory mirror
  // and the event emission are below, after the commit.
  let affectedAutomations: { id: string; userId: string; name: string }[];
  try {
    affectedAutomations = await prisma.$transaction(async (tx) => {
      await tx.moduleRegistration.upsert({
        where: { moduleId },
        update: { status: "error" },
        create: {
          moduleId,
          connectorType: registered.manifest.connectorType,
          status: "error",
        },
      });

      // Query IDs BEFORE update to avoid TOCTOU race — captures the exact set
      // of automations that will be paused, before any concurrent changes.
      const affected = await tx.automation.findMany({
        where: {
          jobBoard: moduleId,
          status: "active",
        },
        select: { id: true, userId: true, name: true },
      });

      if (affected.length > 0) {
        // Update by the specific IDs we captured (no TOCTOU)
        await tx.automation.updateMany({
          where: { id: { in: affected.map((a) => a.id) } },
          data: {
            status: "paused",
            pauseReason: "auth_failure",
          },
        });
      }

      return affected;
    });
  } catch (err) {
    console.error(
      `[Degradation] Auth failure escalation ABORTED for module "${moduleId}" ` +
        `(${errorDetail}): the escalation could not be committed, so the module ` +
        `is NOT recorded as errored and no automations were paused. The module ` +
        `stays ACTIVE; the next auth failure retries.`,
      err,
    );
    return { pausedCount: 0, escalated: false };
  }

  // Committed. Only now mirror the persisted state into the in-memory registry.
  moduleRegistry.setStatus(moduleId, ModuleStatus.ERROR);

  if (affectedAutomations.length > 0) {
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

  return { pausedCount: affectedAutomations.length, escalated: true };
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
