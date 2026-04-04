# Database Implementation: Phase 1 — RunCoordinator Core

## Schema Change Applied
- `prisma/schema.prisma`: Added `runSource String @default("scheduler")` to AutomationRun
- Migration: `prisma/migrations/20260330174155_add_run_source_to_automation_run/migration.sql`
- All existing rows receive default `"scheduler"`

## Files Created
- `src/lib/scheduler/types.ts` — RunSource, RunLock, SchedulerSnapshot, RunOptions, etc.
- `src/lib/scheduler/run-coordinator.ts` — RunCoordinator singleton + reconcileOrphanedRuns()

## Files Modified
- `src/lib/scheduler/index.ts` — Uses runCoordinator.requestRun() instead of direct runAutomation()
- `src/lib/connector/job-discovery/runner.ts` — Accepts RunOptions, persists runSource
- `src/app/api/automations/[id]/run/route.ts` — Routes through RunCoordinator, handles 409
- `src/models/automation.model.ts` — Added RunSource type, runSource field on AutomationRun
- `src/instrumentation.ts` — Calls reconcileOrphanedRuns() at startup (Ghost Lock Prevention)
- `specs/scheduler-coordination.allium` — Added OrphanedRunReconciliation rule, merged RunSourceTracking, expanded RunCompletedEvent terminal statuses

## Review Findings Addressed
- Critical: Ghost Lock Prevention via reconcileOrphanedRuns() at startup
- Critical: RunCompletedEvent now covers all terminal statuses (blocked, rate_limited)
- Critical: Duplicate RunSourceTracking rule merged into DoubleRunPrevention

## Verification
- Build: ✓ (zero TypeScript errors)
- Tests: ✓ (85 suites, 1765 tests passed)
- Migration: ✓ (applied successfully)
