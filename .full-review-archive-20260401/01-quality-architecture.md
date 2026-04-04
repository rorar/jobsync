# Phase 1: Code Quality & Architecture Review

## Code Quality Findings (21 total)

### Critical (1 actionable — C-2 already fixed)
- **C-1** [OPEN]: `isConnected` in `use-scheduler-status.ts:173` reads module-level variable, never triggers re-renders. No component currently uses it for display, but it's a correctness gap.
- **C-2** [FIXED]: Duplicate `AutomationRunCompleted` events during degradation mid-run. Fixed with `lockStillHeld` guard in `run-coordinator.ts` finally block.

### High (4)
- **H-1** [NOTE]: SSE returns HTTP 200 for auth errors (standard SSE pattern — EventSource doesn't support non-200). Acceptable.
- **H-2** [LOW RISK]: `createEvent` exported from both `event-types.ts` and `index.ts`. Same function, dual export path.
- **H-3** [MITIGATED]: Rate limit Map grows with active users. Already fixed empty-entry cleanup. Periodic sweep deferred (single-user app).
- **H-4** [TECH DEBT]: AutomationDetailPage has 14 useState — extract useConflictDialog() and useRunNow() hooks.

### Medium (7)
- **M-1**: RunStatusBadge 1s interval per badge — consider shared interval
- **M-2**: Duplicated Prisma→Domain mapping in scheduler + route — extract mapper
- **M-3**: removeFromQueue mixed indexing (correct but fragile)
- **M-4**: completeCycle doesn't verify all locks released — add warning log
- **M-5**: Hard-coded English strings in detail page stat labels
- **M-6**: SchedulerStatusBar only shows first running automation
- **M-7**: Test singleton state can bleed between tests — add _resetForTesting()

### Low (5) + Informational (3)
- Translation key casts, inconsistent counter display, alert role semantics, empty sr-only span, timer cleanup in tests, cooldown comments, timing constants centralization

## Architecture Findings (7 total)

### Critical: 0
### High (1 — already fixed)
- **H-1** [FIXED]: Duplicate event emission race condition → `lockStillHeld` guard applied

### Medium (2)
- **M-1** [FIXED]: `AutomationDegradedPayload.reason` typed as string → changed to union type
- **M-2** [OPEN]: `reportProgress()` defined but never called from runner — RunProgressPanel shows fallback

### Low (4)
- L-1: Rate limiter Map unbounded (mitigated), L-2: Redundant type intersection (fixed), L-3: isConnected not reactive, L-4: Duplicated Automation mapping

## Critical Issues for Phase 2 Context
- SSE endpoint returns 200 for auth errors — Security team should evaluate
- In-memory rate limiter has no periodic cleanup — Performance team should evaluate
- RunProgressPanel progress data never actually populated from runner — Test coverage gap
