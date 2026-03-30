/**
 * Scheduler Coordination Types
 *
 * All types for the RunCoordinator, scheduler lifecycle, and run management.
 * Spec: specs/scheduler-coordination.allium
 */

import type { RunnerResult } from "@/lib/connector/job-discovery";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

/** Who initiated the run */
export type RunSource = "scheduler" | "manual"

/** Lifecycle phases of the scheduler (cooldown removed — was never observable via SSE) */
export type SchedulerPhase = "idle" | "running"

/** Phases within a single automation run */
export type RunPhase = "search" | "dedup" | "enrich" | "match" | "save" | "finalize"

/** Result of requesting a run (rate limiting handled at HTTP layer, not coordinator) */
export type RunRequestStatus = "acquired" | "already_running"

// ---------------------------------------------------------------------------
// Value Types
// ---------------------------------------------------------------------------

/** Options passed to runAutomation (designed for both 0.10 and future 0.9) */
export interface RunOptions {
  runSource: RunSource
  bypassCache?: boolean // reserved for 0.9 Response Caching
}

/** Represents an in-progress run lock */
export interface RunLock {
  automationId: string
  automationName: string
  runSource: RunSource
  moduleId: string
  startedAt: Date
  userId: string
}

/** Position in the scheduler cycle queue */
export interface RunQueuePosition {
  automationId: string
  automationName: string
  userId: string
  position: number // 1-indexed
  total: number
}

/** Live progress during execution */
export interface RunProgress {
  automationId: string
  runId: string
  phase: RunPhase
  jobsSearched: number
  jobsDeduplicated: number
  jobsProcessed: number
  jobsMatched: number
  jobsSaved: number
  startedAt: Date
  updatedAt: Date
}

/** Returned from requestRun */
export interface RunRequestResult {
  status: RunRequestStatus
  runId?: string
  runnerResult?: RunnerResult
  existingRunSource?: RunSource
  existingStartedAt?: Date
  queuePosition?: number
  moduleContention?: {
    automationId: string
    automationName: string
    moduleId: string
  }[]
}

/** Full state snapshot for SSE streaming */
export interface SchedulerSnapshot {
  phase: SchedulerPhase
  cycleStartedAt: Date | null
  runningAutomations: RunLock[]
  pendingAutomations: RunQueuePosition[]
  lastCycleCompletedAt: Date | null
  lastCycleProcessedCount: number
  lastCycleFailedCount: number
  /** Live progress per running automation (key: automationId) */
  runningProgress: Record<string, RunProgress>
}

// ---------------------------------------------------------------------------
// Re-export RunnerResult for convenience
// ---------------------------------------------------------------------------

export type { RunnerResult } from "@/lib/connector/job-discovery"
