# Review Scope

## Target

Full comprehensive review of ROADMAP 0.10 (Scheduler Transparency & Run Coordination) + Sprint A (Architecture Debt Cleanup, 10 items) + Sprint B (UX/UI Gaps, 10 items + 3 blind spot fixes). The changeset spans 7 commits (fd4c8db..7b700b1), 16 new files, ~4500 insertions.

## Files (33 total)

### New Files (16)
- `specs/scheduler-coordination.allium` — Allium spec (700+ lines)
- `src/lib/scheduler/types.ts` — Type definitions (RunSource, RunLock, SchedulerSnapshot, etc.)
- `src/lib/scheduler/run-coordinator.ts` — RunCoordinator singleton (mutex, state, events, watchdog)
- `src/app/api/scheduler/status/route.ts` — SSE endpoint for scheduler state
- `src/hooks/use-scheduler-status.ts` — Shared singleton SSE client hook
- `src/components/automations/RunStatusBadge.tsx` — Running/Queued badge with elapsed time
- `src/components/automations/ModuleBusyBanner.tsx` — Module contention warning
- `src/components/automations/ConflictWarningDialog.tsx` — Preventive conflict dialog
- `src/components/scheduler/SchedulerStatusBar.tsx` — Header pill + popover
- `src/components/scheduler/RunProgressPanel.tsx` — 6-phase stepper with live counters
- `src/lib/events/consumers/degradation-coordinator.ts` — AutomationDegraded → RunCoordinator bridge
- `__tests__/run-coordinator.spec.ts` — 52 unit tests
- `prisma/migrations/20260330174155_add_run_source_to_automation_run/migration.sql`

### Modified Files (17)
- `src/lib/scheduler/index.ts` — Scheduler uses RunCoordinator, startCycle/completeCycle
- `src/lib/connector/job-discovery/runner.ts` — RunOptions parameter, runSource on create
- `src/app/api/automations/[id]/run/route.ts` — Routes through RunCoordinator, 409 handling
- `src/lib/events/event-types.ts` — 5 new event types + payloads
- `src/lib/events/event-bus.ts` — globalThis singleton pattern
- `src/lib/events/index.ts` — Re-exports for new types
- `src/lib/events/consumers/index.ts` — Register degradation coordinator + globalThis guard
- `src/lib/connector/degradation.ts` — Emit AutomationDegraded events, blocked/rate_limited as failures
- `src/lib/constants.ts` — MAX_RUN_DURATION_MS
- `src/models/automation.model.ts` — RunSource re-export, runSource on AutomationRun
- `src/instrumentation.ts` — reconcileOrphanedRuns at startup
- `prisma/schema.prisma` — runSource column on AutomationRun
- `src/components/automations/AutomationList.tsx` — RunStatusBadge + running card accent
- `src/app/dashboard/automations/[id]/page.tsx` — RunStatusBadge, ModuleBusyBanner, ConflictWarning, RunProgressPanel, i18n fixes
- `src/components/automations/RunHistoryList.tsx` — runSource badge, responsive wrapper
- `src/components/staging/StagingContainer.tsx` — New items available banner
- `src/components/Header.tsx` — SchedulerStatusBar integration
- `src/i18n/dictionaries/automations.ts` — ~40 new keys × 4 locales
- `src/actions/automation.actions.ts` — Delete automation guard
- `docs/ROADMAP.md` — 0.10 DONE, 0.3 DONE, new sections

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 15 (App Router) + Prisma + SQLite + Shadcn UI

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report
