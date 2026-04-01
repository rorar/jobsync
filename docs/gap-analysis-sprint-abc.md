# Gap Analysis — Sprint A, B, C vs. Masterplan

**Date:** 2026-04-01 | **Session:** S1a — Allium Weed + Gap Analysis + Performance Fixes

## Sprint A: Architecture Debt (10 Items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| A1 | HMR globalThis for RunCoordinator + EventBus | **DONE** | `run-coordinator.ts:409-411` globalThis pattern, `event-bus.ts:92-94` same pattern |
| A2 | Rate limit Map leak fix | **DONE** | `rate-limit.ts:39-60` cleanup interval removes expired entries, stops when empty |
| A3 | Degradation: blocked/rate_limited as failures | **DONE** | `degradation.ts:137` `FAILURE_STATUSES = ["failed", "blocked", "rate_limited"]` |
| A4 | Delete automation guard | **DONE** | `automation.actions.ts:352-356` checks `runCoordinator.getRunStatus(id)` before delete |
| A5 | Remove unused `polling` from SchedulerPhase | **DONE** | `types.ts:18` `"idle" \| "running"` — no `polling` |
| A6 | Remove unused `rate_limited` from RunRequestStatus | **DONE** | `types.ts:24` `"acquired" \| "already_running"` — no `rate_limited` |
| A7 | Watchdog timer for stale locks | **DONE** | `run-coordinator.ts:39,109-113,340-375` watchdog with `MAX_RUN_DURATION_MS` |
| A8 | Degradation ↔ RunCoordinator event bridge | **DONE** | `degradation-coordinator.ts` subscribes to `AutomationDegraded`, calls `acknowledgeExternalStop` |
| A9 | Hardcoded English strings → i18n | **DONE** (was PARTIAL) | Fixed: 16 hardcoded strings in `[id]/page.tsx` replaced with `t()` calls. Keys added to all 4 locales. |
| A10 | RunStatusBadge aria-live + reduced motion | **DONE** | `RunStatusBadge.tsx:58` `aria-live="polite"`, `:61` `motion-reduce:animate-none` |

## Sprint B: UX/UI Gaps (10 Items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| B1 | SchedulerStatusBar | **DONE** | `SchedulerStatusBar.tsx` — pill in header, popover with queue, all states (idle/running) |
| B2 | ConflictWarning Dialog | **DONE** | `ConflictWarningDialog.tsx` — blocked (Cancel only) + contention (Proceed + Cancel) |
| B3 | RunProgressPanel | **DONE** | `RunProgressPanel.tsx` — 6-phase stepper, horizontal (desktop) + vertical (mobile), SSE via `useSchedulerStatus()` |
| B4 | Running card visual differentiation | **DONE** | `AutomationList.tsx:164-168` `border-l-4 border-l-blue-500 bg-blue-50/30` |
| B5 | Elapsed time in RunStatusBadge | **DONE** | `RunStatusBadge.tsx:51-55` live timer from `lock.startedAt`, shared 1s tick |
| B6 | Disabled button tooltip for Run Now | **DONE** (was PARTIAL) | Fixed: tooltip now shows for all 3 disabled states: alreadyRunning, paused, resumeMissing |
| B7 | ModuleBusyBanner link | **DONE** | `ModuleBusyBanner.tsx:34-36` `<Link>` to conflicting automation detail page |
| B8 | RunHistoryList responsive | **DONE** | `RunHistoryList.tsx:77` `overflow-x-auto` wrapper |
| B9 | SSE diff optimization | **DONE** | `status/route.ts:94-95` `if (json === lastSentJson) return;` |
| B10 | Staging Queue "New items" banner | **DONE** | `StagingContainer.tsx:74,85-97,358-370` detects running→idle transition, shows reload banner |

## Sprint C: ROADMAP Features — Tracks 1-4 (4 Items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| C1 | JobDeck Swipe UI | **DONE** | `DeckCard.tsx` (match score ring, vacancy details), `DeckView.tsx` (swipe X/Y, undo), `ViewModeToggle.tsx` (list/deck persistence) |
| C2 | Public API v1 | **DONE** | `src/lib/api/` (auth, rate-limit, response, schemas, with-api-auth), `src/app/api/v1/jobs/` (CRUD + notes) |
| C3 | Company Blacklist | **DONE** | `companyBlacklist.actions.ts` (CRUD), `runner.ts:352-366` (pipeline filter after dedup, before AI matching) |
| C4 | Response Caching | **DONE** | `cache.ts` — LRU with TTL, request coalescing, stale-if-error, eviction, prune, invalidateModule, stats |

## Fixes Applied in This Session

### A9: i18n Fix (16 hardcoded strings)
- **File:** `src/app/dashboard/automations/[id]/page.tsx`
- **What:** Replaced all hardcoded English labels (Status, Job Board, Match Threshold, Schedule, daily, Resume, Missing, Next Run, Last Run, Never, Discovered Jobs, total, new, Logs, Run History) with `t()` calls
- **i18n keys added:** `automations.never`, `automations.tabLogs`, `automations.total`, `automations.runNowPaused`, `automations.runNowResumeMissing` — in all 4 locales (en, de, fr, es)
- **Existing keys reused:** `statusHeader`, `jobBoard`, `matchThreshold`, `stepSchedule`, `daily`, `resumeLabel`, `resumeMissing`, `nextRun`, `lastRun`, `discoveredJobs`, `new`, `runHistory`

### B6: Tooltip Fix (3 disabled states)
- **File:** `src/app/dashboard/automations/[id]/page.tsx`
- **What:** Tooltip now shows explanatory text for ALL three disabled states (was only showing for "already running"):
  - Running → `automations.alreadyRunning`
  - Paused → `automations.runNowPaused`
  - Resume missing → `automations.runNowResumeMissing`

## Performance Fixes (3 HIGH Findings)

### 3a: lastUsedAt DB-Write Throttling
- **New file:** `src/lib/api/last-used-throttle.ts`
- **Modified:** `src/lib/api/auth.ts`, `src/lib/connector/credential-resolver.ts`
- **What:** In-memory timestamp map, max 1 DB write per 5 minutes per key ID. Prevents write amplification under load.
- **Test:** `__tests__/last-used-throttle.spec.ts` (7 tests)

### 3b: Bounded Dedup Query (90-day window)
- **Modified:** `src/lib/connector/job-discovery/runner.ts` (`getExistingVacancyKeys`)
- **What:** Added `createdAt: { gte: dedupCutoff }` (90 days) to `db.job.findMany` query. Prevents loading ALL jobs for dedup.
- **Impact:** With 10k+ promoted jobs, this eliminates the unbounded memory/query issue.

### 3c: Rate Limiter Memory Cap
- **Modified:** `src/lib/api/rate-limit.ts`
- **What:** Added `MAX_STORE_SIZE = 10_000` cap with oldest-entry eviction when creating new entries.
- **Test:** Extended `__tests__/public-api-auth.spec.ts` (1 test added)

## Summary

| Sprint | Total Items | DONE | PARTIAL | MISSING |
|--------|-------------|------|---------|---------|
| A | 10 | **10** | 0 | 0 |
| B | 10 | **10** | 0 | 0 |
| C | 4 | **4** | 0 | 0 |
| **Total** | **24** | **24** | **0** | **0** |

All 24 items verified as DONE. 2 PARTIAL items (A9, B6) were fixed in this session.
