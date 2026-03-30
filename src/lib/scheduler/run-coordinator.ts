/**
 * RunCoordinator — Single entry point for all automation runs.
 *
 * Provides mutex-based double-run prevention, scheduler phase lifecycle,
 * queue tracking, progress reporting, and module contention detection.
 * Singleton pattern (same as automationLogger).
 *
 * Spec: specs/scheduler-coordination.allium
 * Contract: RunCoordinator { requestRun, getState, getRunStatus, getModuleBusy, ... }
 * Invariant: NoConcurrentSameAutomation — at most one RunLock per automationId
 */

import { runAutomation } from "@/lib/connector/job-discovery"
import { emitEvent, createEvent } from "@/lib/events"
import { DomainEventType } from "@/lib/events/event-types"
import { SCHEDULER_CONSTANTS } from "@/lib/constants"
import { debugLog, debugError } from "@/lib/debug"
import type { Automation } from "@/models/automation.model"
import type {
  RunOptions,
  RunLock,
  RunProgress,
  RunQueuePosition,
  RunRequestResult,
  SchedulerPhase,
  SchedulerSnapshot,
  RunnerResult,
} from "./types"

class RunCoordinator {
  // In-memory mutex: Map<automationId, RunLock>
  // JS single-threaded: Map.has/set is atomic in the same tick (AD-2)
  private runLocks = new Map<string, RunLock>()

  // Live progress per running automation
  private progressMap = new Map<string, RunProgress>()

  // Watchdog timers: force-release stale locks after MAX_RUN_DURATION_MS (A7)
  private watchdogTimers = new Map<string, NodeJS.Timeout>()

  // Scheduler cycle queue (populated by startCycle, drained as runs complete)
  private cycleQueue: RunQueuePosition[] = []

  // Scheduler phase lifecycle
  private phase: SchedulerPhase = "idle"
  private cycleStartedAt: Date | null = null
  private lastCycleCompletedAt: Date | null = null
  private lastCycleProcessedCount = 0
  private lastCycleFailedCount = 0

  // ---------------------------------------------------------------------------
  // requestRun — Single entry point for ALL automation runs
  // ---------------------------------------------------------------------------

  async requestRun(
    automation: Automation,
    options: RunOptions,
  ): Promise<RunRequestResult> {
    // 1. Check double-run prevention (DoubleRunPrevention rule)
    const existingLock = this.runLocks.get(automation.id)
    if (existingLock) {
      debugLog(
        "scheduler",
        `[RunCoordinator] Automation ${automation.id} already running (source: ${existingLock.runSource})`,
      )
      return {
        status: "already_running",
        existingRunSource: existingLock.runSource,
        existingStartedAt: existingLock.startedAt,
      }
    }

    // 2. Check module contention (ManualRunGuard rule — informational only)
    const moduleContention = this.getModuleBusy(automation.jobBoard)
      .filter((lock) => lock.automationId !== automation.id)
      .map((lock) => ({
        automationId: lock.automationId,
        automationName: lock.automationName,
        moduleId: lock.moduleId,
      }))

    // 3. Acquire lock — atomic in same tick (no async gap)
    const lock: RunLock = {
      automationId: automation.id,
      automationName: automation.name,
      runSource: options.runSource,
      moduleId: automation.jobBoard,
      startedAt: new Date(),
      userId: automation.userId,
    }
    this.runLocks.set(automation.id, lock)

    debugLog(
      "scheduler",
      `[RunCoordinator] Lock acquired for ${automation.name} (source: ${options.runSource})`,
    )

    // Emit AutomationRunStarted event
    emitEvent(
      createEvent(DomainEventType.AutomationRunStarted, {
        automationId: automation.id,
        userId: automation.userId,
        moduleId: automation.jobBoard,
        runSource: options.runSource,
      }),
    )

    // Start watchdog timer — force-releases lock if run exceeds MAX_RUN_DURATION_MS (A7)
    const watchdogId = setTimeout(
      () => this.forceReleaseLock(automation.id, lock),
      SCHEDULER_CONSTANTS.MAX_RUN_DURATION_MS,
    )
    this.watchdogTimers.set(automation.id, watchdogId)

    // 4. Execute run inside try/finally — lock is ALWAYS released
    let runnerResult: RunnerResult | undefined
    try {
      runnerResult = await runAutomation(automation, options)
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error"
      debugError(
        "scheduler",
        `[RunCoordinator] Run failed for ${automation.name}: ${message}`,
      )
    } finally {
      // Cancel watchdog before releasing lock (A7)
      this.cancelWatchdog(automation.id)

      // 5. Release lock and update state
      this.runLocks.delete(automation.id)
      this.progressMap.delete(automation.id)

      // Update cycle queue: remove completed automation, decrement remaining positions
      this.removeFromQueue(automation.id)

      // Update cycle stats
      this.lastCycleProcessedCount++
      if (!runnerResult || runnerResult.status === "failed") {
        this.lastCycleFailedCount++
      }

      debugLog(
        "scheduler",
        `[RunCoordinator] Lock released for ${automation.name}`,
      )

      // Emit AutomationRunCompleted event
      emitEvent(
        createEvent(DomainEventType.AutomationRunCompleted, {
          automationId: automation.id,
          userId: automation.userId,
          moduleId: automation.jobBoard,
          runSource: options.runSource,
          status: runnerResult?.status ?? "failed",
          jobsSaved: runnerResult?.jobsSaved ?? 0,
          durationMs: Date.now() - lock.startedAt.getTime(),
        }),
      )
    }

    const result: RunRequestResult = {
      status: "acquired",
      runId: runnerResult?.runId,
      runnerResult,
    }

    if (moduleContention.length > 0) {
      result.moduleContention = moduleContention
    }

    return result
  }

  // ---------------------------------------------------------------------------
  // State queries
  // ---------------------------------------------------------------------------

  /** Returns current scheduler state for UI consumption */
  getState(): SchedulerSnapshot {
    return {
      phase: this.phase,
      cycleStartedAt: this.cycleStartedAt,
      runningAutomations: Array.from(this.runLocks.values()),
      pendingAutomations: [...this.cycleQueue],
      lastCycleCompletedAt: this.lastCycleCompletedAt,
      lastCycleProcessedCount: this.lastCycleProcessedCount,
      lastCycleFailedCount: this.lastCycleFailedCount,
    }
  }

  /** Returns the active RunLock for a specific automation, or null if not running */
  getRunStatus(automationId: string): RunLock | null {
    return this.runLocks.get(automationId) ?? null
  }

  /** Returns all active RunLocks using this module (for contention warnings) */
  getModuleBusy(moduleId: string): RunLock[] {
    const result: RunLock[] = []
    for (const lock of this.runLocks.values()) {
      if (lock.moduleId === moduleId) {
        result.push(lock)
      }
    }
    return result
  }

  /** Returns position in the scheduler queue, or null if not queued */
  getQueuePosition(automationId: string): RunQueuePosition | null {
    return this.cycleQueue.find((q) => q.automationId === automationId) ?? null
  }

  // ---------------------------------------------------------------------------
  // Progress reporting
  // ---------------------------------------------------------------------------

  /** Called by the runner to update progress during execution */
  reportProgress(automationId: string, progress: RunProgress): void {
    if (!this.runLocks.has(automationId)) {
      debugLog(
        "scheduler",
        `[RunCoordinator] Ignoring progress for non-running automation ${automationId}`,
      )
      return
    }
    this.progressMap.set(automationId, progress)
  }

  /** Returns live progress for a running automation */
  getActiveProgress(automationId: string): RunProgress | null {
    return this.progressMap.get(automationId) ?? null
  }

  // ---------------------------------------------------------------------------
  // Scheduler cycle lifecycle
  // ---------------------------------------------------------------------------

  /** Set phase to "running", populate queue positions */
  startCycle(automations: Array<{ id: string; name: string }>): void {
    this.phase = "running"
    this.cycleStartedAt = new Date()
    this.lastCycleProcessedCount = 0
    this.lastCycleFailedCount = 0

    // Build queue positions (1-indexed)
    this.cycleQueue = automations.map((a, index) => ({
      automationId: a.id,
      automationName: a.name,
      position: index + 1,
      total: automations.length,
    }))

    debugLog(
      "scheduler",
      `[RunCoordinator] Cycle started with ${automations.length} automation(s)`,
    )

    // Emit SchedulerCycleStarted event
    emitEvent(
      createEvent(DomainEventType.SchedulerCycleStarted, {
        queueDepth: automations.length,
        automationIds: automations.map((a) => a.id),
      }),
    )
  }

  /** Set phase to "cooldown", update lastCycle stats */
  completeCycle(): void {
    this.phase = "cooldown"
    this.lastCycleCompletedAt = new Date()

    const durationMs = this.cycleStartedAt
      ? Date.now() - this.cycleStartedAt.getTime()
      : 0

    debugLog(
      "scheduler",
      `[RunCoordinator] Cycle completed: ${this.lastCycleProcessedCount} processed, ${this.lastCycleFailedCount} failed, ${durationMs}ms`,
    )

    // Emit SchedulerCycleCompleted event
    emitEvent(
      createEvent(DomainEventType.SchedulerCycleCompleted, {
        processedCount: this.lastCycleProcessedCount,
        failedCount: this.lastCycleFailedCount,
        skippedCount: 0,
        durationMs,
      }),
    )

    // Transition to idle after cooldown
    this.cycleQueue = []
    this.phase = "idle"
    this.cycleStartedAt = null
  }

  // ---------------------------------------------------------------------------
  // External stop (A8: Degradation ↔ RunCoordinator bridge)
  // ---------------------------------------------------------------------------

  /** Called by degradation consumer to release lock for a degraded automation mid-run */
  acknowledgeExternalStop(automationId: string): void {
    const lock = this.runLocks.get(automationId)
    if (!lock) return // idempotent

    debugLog(
      "scheduler",
      `[RunCoordinator] External stop: ${automationId} (degradation mid-run)`,
    )
    this.cancelWatchdog(automationId)
    this.runLocks.delete(automationId)
    this.progressMap.delete(automationId)
    this.removeFromQueue(automationId)
    this.lastCycleProcessedCount++
    this.lastCycleFailedCount++

    emitEvent(
      createEvent(DomainEventType.AutomationRunCompleted, {
        automationId,
        userId: lock.userId,
        moduleId: lock.moduleId,
        runSource: lock.runSource,
        status: "failed",
        jobsSaved: 0,
        durationMs: Date.now() - lock.startedAt.getTime(),
      }),
    )
  }

  // ---------------------------------------------------------------------------
  // Watchdog timer (A7: stale lock prevention)
  // ---------------------------------------------------------------------------

  private cancelWatchdog(automationId: string): void {
    const timer = this.watchdogTimers.get(automationId)
    if (timer) {
      clearTimeout(timer)
      this.watchdogTimers.delete(automationId)
    }
  }

  private forceReleaseLock(automationId: string, lock: RunLock): void {
    try {
      debugError(
        "scheduler",
        `[RunCoordinator] Watchdog timeout: force-releasing lock for ${automationId} after ${SCHEDULER_CONSTANTS.MAX_RUN_DURATION_MS}ms`,
      )
      this.runLocks.delete(automationId)
      this.progressMap.delete(automationId)
      this.watchdogTimers.delete(automationId)
      this.removeFromQueue(automationId)
      this.lastCycleProcessedCount++
      this.lastCycleFailedCount++

      emitEvent(
        createEvent(DomainEventType.AutomationRunCompleted, {
          automationId,
          userId: lock.userId,
          moduleId: lock.moduleId,
          runSource: lock.runSource,
          status: "failed",
          jobsSaved: 0,
          durationMs: SCHEDULER_CONSTANTS.MAX_RUN_DURATION_MS,
        }),
      )
    } catch (error) {
      debugError("scheduler", `[RunCoordinator] Error in forceReleaseLock:`, error)
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Remove skipped automation from queue (e.g., resume_missing) */
  skipFromQueue(automationId: string): void {
    this.removeFromQueue(automationId)
    debugLog(
      "scheduler",
      `[RunCoordinator] Skipped ${automationId} from queue`,
    )
  }

  /** Remove completed automation from queue, decrement remaining positions */
  private removeFromQueue(automationId: string): void {
    const index = this.cycleQueue.findIndex(
      (q) => q.automationId === automationId,
    )
    if (index === -1) return

    this.cycleQueue.splice(index, 1)

    // Decrement positions for remaining items (QueuePositionMonotonic invariant)
    for (const item of this.cycleQueue) {
      if (item.position > index + 1) {
        item.position--
      }
    }
  }
}

// Singleton — survives HMR via globalThis (same pattern as health-scheduler.ts)
const g = globalThis as unknown as { __runCoordinator?: RunCoordinator }
if (!g.__runCoordinator) g.__runCoordinator = new RunCoordinator()
export const runCoordinator = g.__runCoordinator

/**
 * Reconcile orphaned "running" AutomationRuns from prior crashes.
 * Called at startup in instrumentation.ts before the scheduler starts.
 * (Ghost Lock Prevention — scheduler-coordination.allium)
 */
export async function reconcileOrphanedRuns(): Promise<void> {
  const db = (await import("@/lib/db")).default
  const orphaned = await db.automationRun.updateMany({
    where: { status: "running" },
    data: {
      status: "failed",
      errorMessage: "process_restart",
      completedAt: new Date(),
    },
  })
  if (orphaned.count > 0) {
    debugLog(
      "scheduler",
      `[RunCoordinator] Reconciled ${orphaned.count} orphaned running run(s) from prior crash`,
    )
  }
}
