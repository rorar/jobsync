# Phase 2 Performance Review — Sprint A/B/C

**Reviewer:** Performance Engineer (Claude Sonnet 4.6)
**Date:** 2026-04-01
**Scope:** 34 files across Scheduler, Staging, Company Blacklist, LRU Cache, Public API v1

---

## Summary

Three HIGH findings were already fixed in S1a (lastUsedAt throttling, unbounded job URL query, rate-limiter memory cap). This review found **1 Critical**, **4 High**, **5 Medium**, and **4 Low** additional issues. No N+1 query patterns were found in any of the reviewed files. The SSE singleton pattern and shared-interval pattern for RunStatusBadge are both clean.

---

## Findings

---

### F-01 — CRITICAL: ConnectorCache singleton not registered in production

**File:** `src/lib/connector/cache.ts` lines 258–263
**Impact:** In production (`NODE_ENV === "production"`), the `globalThis[GLOBAL_KEY]` assignment is skipped. Every module import evaluates the module-level singleton expression once per module load, but Next.js can load server-side modules multiple times across different request contexts or edge workers. The HMR-survival guard is absent in production — the guard that protects RunCoordinator and EventBus (`if (!g.__x) g.__x = new X()`) is missing for the cache. The result is that in production the cache is never written back to `globalThis`, so each new process boundary or module re-evaluation creates a fresh `ConnectorCache` with zero entries. Cache hit rate in production is effectively 0% — every request is a cold miss, defeating the 900s search TTL and the 86400s reference TTL entirely.

**Fix:** Apply the same unconditional `globalThis` guard used by RunCoordinator and EventBus:
```ts
// Replace the conditional block with:
if (!globalThis[GLOBAL_KEY]) {
  globalThis[GLOBAL_KEY] = connectorCache;
}
```
Or, more precisely, the full pattern should be:
```ts
const g = globalThis as typeof globalThis & { [GLOBAL_KEY]?: ConnectorCache };
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new ConnectorCache();
export const connectorCache: ConnectorCache = g[GLOBAL_KEY]!;
```

**Tradeoff:** None. The current production-only exclusion appears to be an oversight — all other singletons in this codebase use the unconditional pattern.

---

### F-02 — HIGH: PATCH /api/v1/jobs/:id executes up to 6 sequential upserts before the job update

**File:** `src/app/api/v1/jobs/[id]/route.ts` lines 77–139
**Impact:** The PATCH handler resolves each changed relational field (title, company, location, status, source, resume, tags) with a sequential `await findOrCreate(...)` or `await prisma.x.findFirst(...)` call. In the worst case — a client sends all 7 relational fields in one PATCH — this produces 7 sequential DB round-trips before the final `prisma.job.update`. On SQLite with a typical 1–2ms per query, that is 7–14ms of added latency per PATCH. The prior `findFirst` for ownership verification (line 48) adds another round-trip, and the subsequent `prisma.job.update` with `include` adds another — total worst-case: 9 sequential DB queries.

**Fix:** Batch the independent `findOrCreate` calls for title, company, location, and source with `Promise.all`. Status lookup can also be parallelised with those four. Resume and tag ownership checks are conditional on user input so they remain sequential, but they can be parallelised with each other when both are present:
```ts
// Parallel resolution of independent fields:
const [titleRec, companyRec, locationRec, sourceRec, statusRec] = await Promise.all([
  updates.title ? findOrCreate("jobTitle", userId, updates.title) : Promise.resolve(undefined),
  updates.company ? findOrCreate("company", userId, updates.company) : Promise.resolve(undefined),
  updates.location ? findOrCreate("location", userId, updates.location) : Promise.resolve(undefined),
  updates.source ? findOrCreate("jobSource", userId, updates.source) : Promise.resolve(undefined),
  updates.status ? prisma.jobStatus.findFirst({ where: { value: updates.status } }) : Promise.resolve(undefined),
]);
```
This reduces the worst case from 9 to approximately 5 sequential DB interactions (ownership check → parallel resolution → parallel resume+tag check → update → response).

**Tradeoff:** Minor code restructuring required. SQLite serialises writes anyway, but `Promise.all` still eliminates Node.js event-loop idle time between awaits.

---

### F-03 — HIGH: POST /api/v1/jobs executes up to 5 sequential upserts before the job create

**File:** `src/app/api/v1/jobs/route.ts` lines 102–116
**Impact:** The POST handler calls `findOrCreateJobTitle`, `findOrCreateCompany`, `findOrCreateLocation`, `findOrCreateSource`, and `resolveStatus` sequentially with individual awaits. These five calls are fully independent — none depends on the result of another. Each is a DB round-trip. In the common case of a full job submission, this is ~5ms extra latency before the final `prisma.job.create`.

**Fix:** Same `Promise.all` pattern as F-02:
```ts
const [jobTitle, companyRecord, locationRecord, sourceRecord, statusRecord] = await Promise.all([
  findOrCreateJobTitle(userId, title),
  findOrCreateCompany(userId, company),
  location ? findOrCreateLocation(userId, location) : Promise.resolve(null),
  source ? findOrCreateSource(userId, source) : Promise.resolve(null),
  resolveStatus(status ?? "draft"),
]);
```

**Tradeoff:** None. These five operations are semantically independent.

---

### F-04 — HIGH: AutomationDetailPage issues 4 concurrent server action calls but then redundantly re-fetches runs

**File:** `src/app/dashboard/automations/[id]/page.tsx` lines 99–121
**Impact:** `loadData()` correctly uses `Promise.all` for 4 concurrent calls. However, `getAutomationById` returns `automationResult.data.runs` (line 108: `setRuns(automationResult.data.runs || [])`), and then immediately after, `getAutomationRuns` returns its own `runsResult.data` which overwrites that state (line 120: `setRuns(runsResult.data)`). The `getAutomationById` call already fetches runs, making `getAutomationRuns` a duplicate round-trip on every page load and every `loadData()` invocation. Given `loadData()` is called on page mount, after pause/resume, after run completion, and when the edit wizard closes — this duplicate fetch compounds with usage.

Additionally, `getResumeList(1, 100)` uses a page size of 100 (line 103), fetching up to 100 resumes on every `loadData()` call even though only the `id` and `title` fields are needed. If a user has many resumes, this is wasteful.

**Fix:** Remove the `getAutomationRuns` call from `loadData()` since `getAutomationById` already returns runs. If detailed run data is needed separately, fetch it lazily only when the "history" tab is activated. For resumes, consider fetching once on mount (not on every reload) since the resume list rarely changes during the automation detail view lifecycle.

**Tradeoff:** Removing the dual-fetch simplifies the data flow. Lazy tab loading adds minor tab-switching latency the first time only.

---

### F-05 — HIGH: getBlacklistEntries has no LIMIT — unbounded query on large blacklists

**File:** `src/actions/companyBlacklist.actions.ts` lines 23–27
**Impact:** `prisma.companyBlacklist.findMany({ where: { userId }, orderBy: { createdAt: "desc" } })` has no `take` clause. While individual users are unlikely to have thousands of entries, the query is structurally unbounded. If this action is called from `StagingContainer` via `addBlacklistEntry` (which reloads entries after add), or if a user imports entries programmatically via the public API in a future version, this will cause unbounded memory allocation. The absence of a limit is also inconsistent with every other `findMany` in the reviewed codebase.

**Fix:** Add a reasonable upper bound (e.g., `take: 500`) matching the documented maximum, or add pagination to the Settings UI. For the Settings component, a limit of 500 entries is more than sufficient and prevents accidental runaway queries.

**Tradeoff:** A hard cap requires the UI to surface a message if the limit is reached.

---

### F-06 — MEDIUM: SSE filterStateForUser performs three array filter passes on every poll tick

**File:** `src/app/api/scheduler/status/route.ts` lines 61–79
**Impact:** Every 2 seconds per connected client, `filterStateForUser()` performs:
1. `fullState.runningAutomations.filter(...)` — O(n) where n = running automations
2. `fullState.pendingAutomations.filter(...)` — O(m) where m = queue depth
3. `Object.entries(fullState.runningProgress).filter(...)` — O(p) where p = progress entries

For a single-user self-hosted instance with a small number of automations (n,m,p typically 0–5), this is negligible. However, the JSON diff check (`json === lastSentJson`) that follows is a full string comparison on every tick even when the state hasn't changed — which is the common case. The `JSON.stringify` call itself also runs on every tick.

The combined cost per tick: 3 array traversals + 1 JSON.stringify + 1 string equality check. At 2s intervals with multiple browser tabs open, this is ~30 operations per minute per tab.

**Fix:** This is acceptable for the self-hosted single-user use case. The improvement opportunity is to move `filterStateForUser` to a lazy getter that only re-evaluates when the underlying `runCoordinator` state actually changes (using a dirty flag or version counter). However, given the self-hosted deployment model, this is low priority.

**Tradeoff:** Adding a version counter to RunCoordinator couples the coordinator to SSE concerns.

---

### F-07 — MEDIUM: LRU eviction in ConnectorCache is insertion-order, not access-order

**File:** `src/lib/connector/cache.ts` lines 239–245
**Impact:** `evictOldest()` evicts the first key by Map insertion order, which approximates FIFO rather than true LRU (least-recently-used). This means a frequently-accessed entry that was inserted early will be evicted before a stale entry that was inserted later. For reference data (ESCO occupations, NUTS regions) with 24-hour TTLs and high hit rates, this eviction strategy reduces effective cache hit rates once the store approaches `maxSize` (500 entries). With locale-sensitive keys (EN + DE + FR + ES × N occupation categories), the 500-entry default could fill relatively quickly.

**Fix:** Track access time in `CacheEntry` and evict the entry with the oldest `lastAccessedAt` rather than the oldest `createdAt`. Alternatively, maintain a separate access-order list. A simpler approximation: evict the entry with the lowest `expiresAt` (i.e., soonest to expire), which better preserves high-value long-TTL reference data.

**Tradeoff:** True LRU requires either a doubly-linked list + Map (O(1) operations) or periodic O(n) scan. The expiry-based eviction is a good practical compromise.

---

### F-08 — MEDIUM: ConnectorCache has no periodic prune — expired entries accumulate until eviction pressure

**File:** `src/lib/connector/cache.ts` lines 224–233
**Impact:** The `prune()` method exists but is never called automatically. Expired entries remain in the store until either a new entry triggers `evictOldest()` (which only removes one entry) or `prune()` is called explicitly. With 24-hour reference TTLs and 500 max entries, the store can fill with entries that are expired but still occupying memory slots. This interacts poorly with the FIFO eviction: a slot occupied by an expired entry will not be reclaimed until capacity pressure triggers `evictOldest`, which may evict a still-valid entry instead.

**Fix:** Schedule a periodic prune, similar to how the rate-limiter schedules cleanup via `setInterval`. A 15-minute prune interval (matching the search TTL) is appropriate. Apply the same `unref()` pattern used in the rate-limiter to avoid blocking Node.js exit.

**Tradeoff:** A background interval adds a small amount of periodic CPU work.

---

### F-09 — MEDIUM: RunHistoryList renders all runs without pagination

**File:** `src/components/automations/RunHistoryList.tsx` lines 94–163
**Impact:** `RunHistoryList` receives a `runs: AutomationRun[]` prop and renders every run in a `<Table>` with no virtualization, no pagination, and no max-row limit. The `getAutomationRuns` action defaults to `limit: 10`, but the caller in `page.tsx` (line 101) calls it as `getAutomationRuns(automationId)` with no options, so 10 runs are returned. However, if the calling code is updated in the future or if the action default changes, there is no UI-side guard. The component itself has no awareness of the total count and renders whatever it receives.

For a long-running automation with hundreds of runs, this would render a very large DOM table. Each row contains two icon components, a `Badge`, two `<span>` elements, and a conditional `TooltipProvider` — approximately 12–15 DOM nodes per row.

**Fix:** Add `take: 25` as a hard cap in `getAutomationRuns` for the detail page call, or pass a `total` prop to `RunHistoryList` and add a "Load more" button when `runs.length < total`.

**Tradeoff:** Paginating run history requires additional state management in the parent.

---

### F-10 — LOW: StagingContainer accumulates vacancies in state via append-on-load-more

**File:** `src/components/staging/StagingContainer.tsx` lines 151–153
**Impact:** `loadVacancies` appends to the existing `vacancies` array for load-more (page > 1): `setVacancies((prev) => pageNum === 1 ? data : [...prev, ...data])`. There is no cleanup when the user switches tabs — `onTabChange` calls `clearSelection()` but does not reset `vacancies` to `[]`. The next `loadVacancies(1, newTab)` call replaces the state (since `pageNum === 1`), which is correct. However, between the tab switch and the data load completing, the stale vacancies from the previous tab remain in state and are briefly rendered under the new tab. This is a flash-of-stale-content issue rather than a memory leak, but the accumulation pattern means that after several "load more" interactions within a tab session, the state array can be large (e.g., 3 pages × 25 = 75 objects) and each re-render copies the full array.

**Fix:** Reset `vacancies` to `[]` synchronously in `onTabChange` before the async load begins. This eliminates the stale-content flash and keeps memory bounded per-tab.

**Tradeoff:** The user sees a brief empty state during tab transitions instead of stale data.

---

### F-11 — LOW: AutomationList calls isAutomationRunning(automation.id) twice per list item on each render

**File:** `src/components/automations/AutomationList.tsx` lines 165 and 344
**Impact:** Inside the `automations.map(...)` render loop, `isAutomationRunning(automation.id)` is called twice for each automation: once for the `className` conditional (line 165) and once for the button `disabled` prop (line 344). Since `isAutomationRunning` uses `stateRef.current` (a stable ref lookup) and `Array.some`, this is not a correctness issue and is cheap — O(r) where r = running automations. However, for a list with 20 automations, this is 40 `Array.some` calls per render. When SSE fires at 2s intervals, this list re-renders frequently.

**Fix:** Extract the result into a local variable at the top of the map callback: `const running = isAutomationRunning(automation.id);`. This halves the calls from 40 to 20 per render cycle without any API change.

**Tradeoff:** None. This is a trivial local optimization.

---

### F-12 — LOW: Notes endpoint lacks pagination — unbounded for jobs with many notes

**File:** `src/app/api/v1/jobs/[id]/notes/route.ts` lines 27–36
**Impact:** `GET /api/v1/jobs/:id/notes` fetches all notes for a job with no `take` clause: `prisma.note.findMany({ where: { jobId, userId }, orderBy: { createdAt: "desc" } })`. A job with thousands of notes (e.g., imported via the API) returns all of them in a single response. This is unbounded payload growth.

**Fix:** Add `take: 100` as a default page size with pagination query params, consistent with the `PaginationSchema` used by `GET /api/v1/jobs`. This can use the same `PaginationSchema` and `paginatedResponse` helper already in place.

**Tradeoff:** Clients relying on the current behaviour of receiving all notes in one response will need to handle pagination.

---

### F-13 — LOW: DeckCard re-creates color-classification functions on every render

**File:** `src/components/staging/DeckCard.tsx` lines 22–33
**Impact:** `MatchScoreRing` defines `getColor` and `getStrokeColor` as inline functions on every render call. These functions have no external dependencies and return values that can be computed purely from the `score` argument. While React function components re-declare inner functions on every render regardless, the `MatchScoreRing` component is rendered once per card and cards are shallow in the deck (at most 3 visible). Impact is negligible for this use case.

This is only a finding because the two functions share identical branching logic and could be unified into a single lookup table, but that is a code quality concern rather than a measurable performance issue at the current scale.

**Fix:** Not worth changing for performance reasons. Optionally unify into a single `getColors(score)` returning `{ text, stroke }` to eliminate duplication.

**Tradeoff:** None applicable.

---

## Performance Summary

| ID | Severity | Area | Issue |
|----|----------|------|-------|
| F-01 | Critical | Cache | Singleton not registered in production → 0% hit rate |
| F-02 | High | DB/API | PATCH /jobs/:id: up to 9 sequential DB round-trips |
| F-03 | High | DB/API | POST /jobs: 5 sequential upserts before job.create |
| F-04 | High | DB/UI | AutomationDetailPage: duplicate runs fetch on every loadData() |
| F-05 | High | DB | getBlacklistEntries: unbounded findMany (no LIMIT) |
| F-06 | Medium | SSE | filterStateForUser: 3 array passes + JSON.stringify per 2s tick |
| F-07 | Medium | Cache | LRU eviction is FIFO, not access-order |
| F-08 | Medium | Cache | No periodic prune — expired entries occupy slots indefinitely |
| F-09 | Medium | UI | RunHistoryList: no pagination guard, full DOM table always rendered |
| F-10 | Low | UI | StagingContainer: stale vacancies flash on tab switch |
| F-11 | Low | UI | AutomationList: isAutomationRunning called twice per item per render |
| F-12 | Low | DB/API | Notes GET endpoint: unbounded findMany (no LIMIT/pagination) |
| F-13 | Low | UI | DeckCard: duplicate inline color functions (code quality, not perf) |

---

## Top 3 Priority Optimizations

1. **F-01 (Critical) — Fix cache singleton in production.** One-line fix. Without it, every ESCO/EURES API response cache miss causes a live external HTTP call, burning connector quota and adding 200–2000ms per cache-miss interaction. The fix is unconditionally assigning to `globalThis` as all other singletons in this codebase do.

2. **F-02 + F-03 (High) — Parallelize findOrCreate chains in POST and PATCH /api/v1/jobs.** Wrapping the 4–5 independent upsert calls in `Promise.all` reduces worst-case latency by ~60% (from ~10ms sequential to ~3ms parallel on SQLite). These endpoints are the core of the Public API and will be called frequently by external consumers (n8n, scripts).

3. **F-04 (High) — Remove duplicate getAutomationRuns call from loadData().** The runs are already returned by `getAutomationById`. Removing the redundant call eliminates one DB round-trip and one network hop on every page load, every pause/resume action, and every post-run refresh. At 4 calls per user session cycle, this compounds.

---

## Recommended SLOs for These Features

| Feature | P50 Target | P95 Target | Notes |
|---------|-----------|-----------|-------|
| GET /api/v1/jobs | < 50ms | < 150ms | Paginated, indexed on userId+createdAt |
| POST /api/v1/jobs | < 100ms | < 300ms | After F-03 fix (parallel upserts) |
| PATCH /api/v1/jobs/:id | < 100ms | < 300ms | After F-02 fix (parallel upserts) |
| GET /api/v1/jobs/:id/notes | < 30ms | < 100ms | After F-12 fix (bounded query) |
| SSE /api/scheduler/status | < 5ms first byte | n/a | In-memory state, no DB |
| loadData() AutomationDetailPage | < 300ms | < 800ms | After F-04 fix (3 parallel calls) |
| Staging tab switch | < 100ms | < 400ms | DB query + render |
| ConnectorCache hit | < 1ms | < 1ms | In-memory Map.get |
| ConnectorCache miss (ESCO) | < 500ms | < 2000ms | External HTTP after F-01 fix |

---

## What Was Confirmed Clean

- **N+1 queries:** None found. All pagination uses `take`/`skip`. All loop operations use `createMany`/`updateMany`/`in` clauses.
- **SSE memory leak:** The shared EventSource singleton (`use-scheduler-status.ts`) correctly unsubscribes on last consumer unmount and handles the server-initiated close event with immediate reconnect. No leak.
- **Shared tick interval (RunStatusBadge):** The `subscribeToTick` pattern correctly uses a module-level `Set` and clears the interval when the last subscriber unsubscribes. Clean.
- **RunCoordinator mutex:** Lock acquire and release are both in the same synchronous tick before the first `await`. The try/finally pattern guarantees release even on throw. The watchdog timer correctly uses `cancelWatchdog` before lock release to prevent double-release. Clean.
- **Rate limiter HMR singleton:** Correctly uses `globalThis.__publicApiRateLimitStore ??= new Map()`. Clean.
- **EventConsumers guard:** The `__eventConsumersRegistered` guard on `globalThis` correctly prevents double-registration across HMR. Clean.
- **DegradationCoordinator:** Correctly releases the run lock via `acknowledgeExternalStop` on `AutomationDegraded` events. The `H-1 fix` guard (`const lockStillHeld = this.runLocks.delete(...)`) prevents double-emit of `AutomationRunCompleted`. Clean.
- **blacklistEntries query in actions:** `removeBlacklistEntry` correctly uses `findFirst({ where: { id, userId } })` for ownership check (ADR-015 compliant). Clean.
- **Public API key actions:** `listPublicApiKeys`, `revokePublicApiKey`, `deletePublicApiKey` all correctly scope queries by `userId`. No IDOR surface. Clean.
- **UUID validation regex:** Duplicated in 3 route files (`[id]/route.ts`, `[id]/notes/route.ts`) — acceptable duplication for now, but a shared `validateUUID` helper from `schemas.ts` would reduce repetition.
