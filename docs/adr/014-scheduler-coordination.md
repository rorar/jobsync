# ADR-014: Scheduler Transparency & Run Coordination

**Date:** 2026-03-30
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The scheduler was a black box -- no visibility into what's running, no protection against double-execution (manual + scheduler), no UI feedback during runs. Three interconnected problems:

1. **No scheduler state exposure** -- users could not see what automations were running or queued
2. **No run coordination** -- manual triggers and scheduled runs could execute the same automation simultaneously
3. **No UI feedback** -- automation runs provided no progress indication, users had to wait and check logs after completion

## Decision

Implement a RunCoordinator application service as the single entry point for all automation runs, based on the Allium specification (`specs/scheduler-coordination.allium`).

### Architecture

**RunCoordinator** (`src/lib/scheduler/run-coordinator.ts`): Singleton service that manages an in-memory mutex (`Map<automationId, RunLock>`) to prevent double-execution. All automation runs -- scheduled and manual -- must go through `runCoordinator.requestRun()`.

**SSE State Streaming** (`GET /api/scheduler/status`): Real-time scheduler state streamed to the browser, per-user filtered. Client hook `useSchedulerStatus()` manages a shared singleton EventSource (one connection per tab).

**Domain Events via EventBus**: Scheduler lifecycle observable through typed events (`SchedulerCycleStarted`, `AutomationRunStarted`, `AutomationDegraded`, etc.).

**Progress Reporting**: Runner calls `runCoordinator.reportProgress()` at each phase (search, dedup, enrich, match, save, finalize). UI shows live stepper via RunProgressPanel.

### Key Design Decisions

1. **In-memory mutex** (`Map<automationId, RunLock>`) -- JS is single-threaded, no distributed lock needed for single-process deployment
2. **RunCoordinator as standalone singleton** (not extending AutomationLogger) -- SRP separation; logging retention is a different concern than run coordination
3. **Manual runs through coordinator** (not queued) -- users expect immediate execution, queuing would feel unresponsive
4. **SSE for state streaming** (not WebSocket) -- simpler, one-directional, matches existing pattern in LogsTab
5. **Module contention = informational** (not blocking) -- Cockatiel already handles rate limiting at the module level
6. **globalThis for HMR survival** -- matching existing `health-scheduler.ts` pattern for dev-mode stability
7. **Watchdog timer** (10min) -- force-releases stale locks to prevent deadlocks from crashed runs
8. **Degradation event bridge** -- `AutomationDegraded` event releases locks mid-run, integrating with ADR-013 degradation rules
9. **Ghost Lock Prevention** -- `reconcileOrphanedRuns()` at startup cleans locks from previous process crashes
10. **RunOptions with bypassCache** -- forward-designed for 0.9 Response Caching integration

### Alternatives Considered

- **DB-level locking**: Rejected -- TOCTOU race conditions, unnecessary overhead for single-process architecture
- **WebSocket**: Rejected -- more complex setup, bidirectional communication not needed for state streaming
- **Worker pool**: Deferred -- sequential execution sufficient for current scale; future 8.4 Administrative Queue can reimplement the RunCoordinator interface
- **Extending AutomationLogger**: Rejected -- different concern (log retention vs coordination), would violate SRP

## Consequences

### Positive
- All callers use a single entry point (`runCoordinator.requestRun()`), eliminating double-execution
- SSE provides real-time visibility into scheduler state without polling
- Scheduler phase lifecycle observable via EventBus events
- Progress reporting gives users immediate feedback during automation runs
- Forward-compatible with 0.9 Caching (`RunOptions.bypassCache`) and 8.4 Administrative Queue

### Negative
- SSE connection per browser tab (managed by singleton hook, but still one connection per tab)
- In-memory mutex lost on process restart (mitigated by `reconcileOrphanedRuns()` at startup)
- Watchdog timer is a safety net, not a guarantee -- 10min timeout may be too short for very large runs

### Risks
- EventBus `globalThis` pattern may conflict with future multi-process deployments
- SSE connections may hit browser per-domain connection limits (6 in HTTP/1.1) if many tabs are open

## Files

### New
- `src/lib/scheduler/types.ts` -- RunSource, RunLock, SchedulerSnapshot, RunOptions, RunProgress
- `src/lib/scheduler/run-coordinator.ts` -- RunCoordinator singleton
- `src/hooks/use-scheduler-status.ts` -- Client SSE hook (shared singleton EventSource)
- `specs/scheduler-coordination.allium` -- Authoritative specification

### Modified
- `src/lib/scheduler/index.ts` -- Scheduler cron loop refactored to use RunCoordinator
- SSE endpoint, RunProgressPanel UI, automation trigger actions
