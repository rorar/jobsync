# S1b Consolidated Findings -- Comprehensive Review

**Session:** S1b (2026-04-01)
**Scope:** 34 files across Sprint A, B, C (Tracks 1-3), ~7465 lines
**Reviewers:** Architecture, Security, Performance, Quality/Testing, Blind Spot Analysis
**Consolidator:** Claude Opus 4.6

---

## Summary

**Total unique findings: 68** (37 fixed, 15 open, 16 deferred)

> **Note:** F-MED-09 was incorrectly listed as fixed — reclassified to O-MED-06 (open) by final blind spot analysis.

| Severity | Found | Fixed | Open | Deferred |
|----------|-------|-------|------|----------|
| Critical | 4     | 3     | 1    | 0        |
| High     | 18    | 16    | 2    | 0        |
| Medium   | 24    | 13    | 5    | 6        |
| Low      | 22    | 6     | 6    | 10       |

**Key fixes delivered:** ConnectorCache production singleton, API v1 data leak (userId/matchData/FK exposure), 9 IDOR/defense-in-depth violations, 19+ hardcoded English strings replaced with i18n keys, parallel DB upserts in API v1, unbounded query bounds, SSE connection limits, cache LRU + periodic prune.

**Key open items:** i18n key display regression (BS-03), variable shadowing in SSE route (BS-01), missing test coverage for Public API security layer (auth, rate-limit, withApiAuth, route handlers), large component refactoring (AutomationDetailPage 514 lines, StagingContainer 497 lines).

---

## Notation

- **Source tags** indicate which report(s) found the issue: `[ARCH]` Architecture, `[SEC]` Security, `[PERF]` Performance, `[QUAL]` Quality/Testing, `[BS]` Blind Spot
- **BUGS.md ID** references the tracked bug identifier
- **Commit** references the fixing commit (short SHA)

---

## Fixed Findings

### Critical -- Fixed (3)

#### F-CRIT-01: ConnectorCache singleton not registered in production -- 0% hit rate
- **Sources:** `[ARCH] C-1` / `[PERF] F-01` / `[QUAL] SEC-3`
- **BUGS.md:** S1b-1
- **Files:** `src/lib/connector/cache.ts:258-263`
- **Description:** The `globalThis` assignment was guarded by `NODE_ENV !== "production"`, so production never persisted the singleton. Every module import created a fresh cache instance. Hit rate in production was effectively 0%, causing all ESCO/EURES requests to make live external HTTP calls.
- **Fix:** Unconditional `globalThis` assignment matching RunCoordinator/EventBus pattern.
- **Commit:** `03e3ee2`

#### F-CRIT-02: GET/PATCH/POST `/api/v1/jobs` leak userId, matchData, foreign keys, and nested createdBy via `include`
- **Sources:** `[SEC] SEC-P2-01` / `[SEC] SEC-P2-06` / `[SEC] SEC-P2-07`
- **BUGS.md:** S1b-2
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:18-29`, `src/app/api/v1/jobs/route.ts:54`
- **Description:** GET single used `include` instead of `select`, leaking userId, matchData, automationId, discoveryStatus, all foreign keys, and nested `createdBy` on related entities. GET list explicitly included `userId: true`. POST/PATCH responses used `include: true` on relations, leaking `createdBy` through nested paths.
- **Fix:** Replaced all `include` with explicit `select` shapes (`JOB_API_SELECT`, `JOB_DETAIL_SELECT`, `JOB_LIST_SELECT`). Removed userId from list select.
- **Commit:** `03e3ee2`

#### F-CRIT-03: `inferErrorStatus()` breaks with i18n keys -- returns 500 instead of 401
- **Sources:** `[BS] BS-03` (downstream consequence)
- **BUGS.md:** S1b-26
- **Files:** `src/lib/api/response.ts:118-133`
- **Description:** After S1b replaced hardcoded English error strings with i18n keys (e.g., "api.notAuthenticated"), the `inferErrorStatus()` function, which pattern-matched on English words like "not authenticated", stopped recognizing these keys. All i18n-keyed errors were returned as 500 instead of their correct HTTP status.
- **Fix:** Added camelCase i18n key pattern matching alongside legacy English patterns.
- **Commit:** `23a3ce5`

### High -- Fixed (16)

#### F-HIGH-01: PATCH `/api/v1/jobs/:id` -- up to 9 sequential DB round-trips
- **Sources:** `[PERF] F-02`
- **BUGS.md:** S1b-3
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:77-139`
- **Description:** Sequential `await findOrCreate(...)` calls for each relational field. Worst case: 9 DB queries per PATCH.
- **Fix:** `Promise.all` for independent findOrCreate calls via `buildUpdateData()`.
- **Commit:** `03e3ee2`

#### F-HIGH-02: POST `/api/v1/jobs` -- 5 sequential upserts before job create
- **Sources:** `[PERF] F-03`
- **BUGS.md:** S1b-4
- **Files:** `src/app/api/v1/jobs/route.ts:102-116`
- **Description:** Five independent `findOrCreate` calls executed sequentially.
- **Fix:** `Promise.all` parallelization.
- **Commit:** `03e3ee2`

#### F-HIGH-03: AutomationDetailPage duplicate runs fetch on every loadData()
- **Sources:** `[PERF] F-04`
- **BUGS.md:** S1b-5
- **Files:** `src/app/dashboard/automations/[id]/page.tsx:99-121`
- **Description:** `getAutomationById` already returns runs, then `getAutomationRuns` was called redundantly, doubling the DB hit on every page load, pause/resume, and post-run refresh.
- **Fix:** Removed redundant `getAutomationRuns` call.
- **Commit:** `c2ba58f`

#### F-HIGH-04: `getBlacklistEntries` unbounded findMany (no LIMIT)
- **Sources:** `[PERF] F-05` / `[SEC] SEC-P2-09` (partial -- length validation)
- **BUGS.md:** S1b-6
- **Files:** `src/actions/companyBlacklist.actions.ts:23-27`
- **Description:** `findMany` with no `take` clause. Pattern and reason inputs also had no max length.
- **Fix:** Added `take: 500`. Added max length validation (pattern: 500, reason: 1000).
- **Commit:** `c2ba58f`

#### F-HIGH-05: `degradation.ts` `checkConsecutiveRunFailures` uses `findUnique` without userId (ADR-015)
- **Sources:** `[ARCH] C-2` / `[SEC] SEC-P2-02`
- **BUGS.md:** S1b-7
- **Files:** `src/lib/connector/degradation.ts:144-146`
- **Description:** Used `findUnique` by automationId alone. ADR-015 mandates userId in all Prisma where clauses and `findFirst` when adding userId filters.
- **Fix:** Changed to `findFirst`. (Note: userId scoping was NOT added to the where clause -- see O-LOW-05 for the incomplete portion.)
- **Commit:** `2c2e44c`

#### F-HIGH-06: IP rate limiting trusts spoofable `x-forwarded-for` header
- **Sources:** `[SEC] SEC-P2-05`
- **BUGS.md:** S1b-8
- **Files:** `src/lib/api/with-api-auth.ts:44-47`
- **Description:** Rate limiter extracted IP from easily spoofable headers. Fallback `"unknown"` created a shared bucket for all headerless clients.
- **Fix:** Unique per-request fallback key + documentation of trusted proxy requirement.
- **Commit:** `c2ba58f`

#### F-HIGH-07: Misleading "constant-time" comment on API key validation
- **Sources:** `[SEC] SEC-P2-04` / `[QUAL] SEC-2`
- **BUGS.md:** S1b-9
- **Files:** `src/lib/api/auth.ts:24-35`
- **Description:** Comment claimed constant-time evaluation, but DB query timing and conditional `lastUsedAt` update create measurable timing differences.
- **Fix:** Corrected comment, documented as accepted risk for self-hosted deployment.
- **Commit:** `2c2e44c`

#### F-HIGH-08: 11x hardcoded English in `publicApiKey.actions.ts`
- **Sources:** `[ARCH] H-2` / `[SEC] SEC-P2-16` / `[QUAL] EH-1`
- **BUGS.md:** S1b-10
- **Files:** `src/actions/publicApiKey.actions.ts:23,28,31,39,81,119,129,132,156,165,168`
- **Description:** All `throw new Error("English string")` calls in server actions, violating i18n error message rule.
- **Fix:** Replaced with i18n keys (`api.*` namespace).
- **Commit:** `2c2e44c`

#### F-HIGH-09: 3x hardcoded English in `companyBlacklist.actions.ts`
- **Sources:** `[ARCH] H-3` / `[QUAL] EH-2`
- **BUGS.md:** S1b-11
- **Files:** `src/actions/companyBlacklist.actions.ts:21,52,56,109,117`
- **Description:** Mixed i18n compliance -- some messages used keys, others used English.
- **Fix:** All messages now use i18n keys (`blacklist.*`, `common.*` namespace).
- **Commit:** `2c2e44c`

#### F-HIGH-10: 5x hardcoded "Error" toast titles + 2 hardcoded labels in AutomationDetailPage
- **Sources:** `[ARCH] H-1` / `[QUAL] I18N-1` / `[QUAL] I18N-2` / `[QUAL] I18N-3` / `[QUAL] DUP-3`
- **BUGS.md:** S1b-12
- **Files:** `src/app/dashboard/automations/[id]/page.tsx:111,133,165,196,203,292,301`
- **Description:** Five `title: "Error"` in toast calls, one `"Automation not found"` fallback, and `Keywords:` / `Location:` hardcoded labels.
- **Fix:** Replaced with `t("common.error")`, `t("automations.notFound")`, `t("automations.keywords")`, `t("automations.locationLabel")`.
- **Commit:** `2c2e44c`

#### F-HIGH-11: `event-types.ts` imports `RunSource` from scheduler -- bidirectional coupling
- **Sources:** `[ARCH] H-5`
- **BUGS.md:** S1b-13
- **Files:** `src/lib/events/event-types.ts:10`
- **Description:** Event Bus imported type from Scheduler, creating bidirectional conceptual dependency.
- **Fix:** Inlined `type RunSource = "scheduler" | "manual"` directly in event-types.ts.
- **Commit:** `2c2e44c`

#### F-HIGH-12: `_statusResolved` sentinel on shared data object can leak into Prisma update
- **Sources:** `[BS] BS-02`
- **BUGS.md:** S1b-27
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:170-197`
- **Description:** S1b's parallel upsert fix used a sentinel property on the shared `data` object that could leak into the Prisma update call if the logic was extended.
- **Fix:** Replaced with separate `resolvedStatus` variable.
- **Commit:** `23a3ce5`

#### F-HIGH-13: `interview.deleteMany` lacks userId scope in DELETE handler (ADR-015)
- **Sources:** `[QUAL] SEC-1` / `[BS] BS-04`
- **BUGS.md:** S1b-28
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:100`
- **Description:** `deleteMany({ where: { jobId } })` without userId. Job ownership was verified earlier, but ADR-015 requires userId in ALL Prisma writes.
- **Fix:** Added `job: { userId }` to where clause.
- **Commit:** `23a3ce5`

#### F-HIGH-14: `handleAuthFailure` and `handleCircuitBreakerTrip` query automations without userId scoping
- **Sources:** `[SEC] SEC-P2-03`
- **BUGS.md:** (documented as intentional cross-user behavior)
- **Files:** `src/lib/connector/degradation.ts:60-71,223-239`
- **Description:** Both functions query and update automations by `jobBoard` alone without userId. Intentional for module-level failures affecting all users.
- **Fix:** Documented as intentional cross-user degradation behavior. Notifications are per-user.
- **Commit:** `2c2e44c`

#### F-HIGH-15: Degradation notification messages hardcoded English (partial fix)
- **Sources:** `[ARCH] H-4` / `[SEC] SEC-P2-12` / `[QUAL] EH-3` / `[QUAL] I18N-4`
- **BUGS.md:** S1b-23
- **Files:** `src/lib/connector/degradation.ts:84,168,247`
- **Description:** Notification messages in DB are hardcoded English template strings. Users in DE/FR/ES see English notifications. Also, user-controlled automation names could contain special characters.
- **Fix:** Added `TODO(i18n)` marker + name truncation (`.slice(0, 200)`). Full i18n requires structured notification data (deferred).
- **Commit:** `2c2e44c` (partial), `39d49e9` (truncation)

#### F-HIGH-16: `BlacklistMatchType` missing `starts_with` / `ends_with` in UI
- **Sources:** `[SEC] SEC-P2-13` / `[QUAL] I18N-5` / `[QUAL] I18N-6`
- **BUGS.md:** S1b-18
- **Files:** `src/components/settings/CompanyBlacklistSettings.tsx:115-118`, `src/actions/companyBlacklist.actions.ts:43`
- **Description:** Server accepted 4 match types but UI only showed 2. Display logic only handled "exact" and "contains".
- **Fix:** Extended type + matcher. Added UI support for all 4 types.
- **Commit:** `c2ba58f`

### Medium -- Fixed (13)

#### F-MED-01: SSE endpoint lacks per-user rate limiting / connection limit
- **Sources:** `[SEC] SEC-P2-08`
- **BUGS.md:** S1b-14
- **Files:** `src/app/api/scheduler/status/route.ts:33`
- **Fix:** Added max 5 connections per user via in-memory counter on `globalThis`.
- **Commit:** `c2ba58f`

#### F-MED-02: Cache eviction was FIFO, not LRU
- **Sources:** `[ARCH] M-5` / `[PERF] F-07` / `[QUAL] NM-2`
- **BUGS.md:** S1b-15
- **Files:** `src/lib/connector/cache.ts:240-245`
- **Fix:** LRU via Map delete + re-insert on `get()`.
- **Commit:** `03e3ee2`

#### F-MED-03: No periodic prune -- expired cache entries accumulate indefinitely
- **Sources:** `[PERF] F-08`
- **BUGS.md:** S1b-16
- **Files:** `src/lib/connector/cache.ts:224-233`
- **Fix:** Added 15-minute prune interval with `unref()`.
- **Commit:** `03e3ee2`

#### F-MED-04: Cache key injection via unsanitized `:` delimiter in user input
- **Sources:** `[SEC] SEC-P2-10`
- **BUGS.md:** S1b-17
- **Files:** `src/lib/connector/cache.ts:63-82`
- **Fix:** Sanitize params segment in `buildKey`. (Note: module/operation segments not sanitized -- see O-MED-04.)
- **Commit:** `03e3ee2`

#### F-MED-05: Notes GET endpoint unbounded -- no pagination
- **Sources:** `[PERF] F-12`
- **BUGS.md:** S1b-19
- **Files:** `src/app/api/v1/jobs/[id]/notes/route.ts:27-36`
- **Fix:** Added `NotesListQuerySchema` with take/skip/count pagination.
- **Commit:** `c2ba58f`

#### F-MED-06: UUID regex duplicated in 5 locations across API routes
- **Sources:** `[QUAL] DUP-2`
- **BUGS.md:** S1b-20
- **Files:** `src/app/api/v1/jobs/[id]/route.ts`, `src/app/api/v1/jobs/[id]/notes/route.ts`
- **Fix:** Extracted `isValidUUID()` to `src/lib/api/schemas.ts`.
- **Commit:** `c2ba58f`

#### F-MED-07: 4x duplicate `findOrCreate` helpers across API routes
- **Sources:** `[QUAL] DUP-1`
- **BUGS.md:** S1b-21
- **Files:** `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[id]/route.ts`
- **Fix:** Extracted to `src/lib/api/helpers.ts`.
- **Commit:** `03e3ee2`

#### F-MED-08: SSE route double non-null assertion on userId
- **Sources:** `[ARCH] M-3` / `[QUAL] EH-4`
- **BUGS.md:** S1b-22
- **Files:** `src/app/api/scheduler/status/route.ts:60`
- **Fix:** Explicit validation with early return.
- **Commit:** `c2ba58f`

#### ~~F-MED-09~~ O-MED-06: `as any` cast on translation key in AutomationList
- **Sources:** `[ARCH] L-1` / `[QUAL] TS-1`
- **Severity calibration:** Upgraded from Low to Medium (appears in multiple reports as a pattern issue).
- **Status:** **OPEN** — file was never modified during S1b (false positive fix claim corrected by final blind spot analysis)
- **Files:** `src/components/automations/AutomationList.tsx:193,198`
- **Fix needed:** Remove `as any` — `TranslationKey` is `string`, cast is unnecessary. Formatter may revert changes (investigate root cause).

#### F-MED-10: `as any` cast for dynamic Prisma model access in API route
- **Sources:** `[QUAL] TS-2`
- **BUGS.md:** (fixed as part of helpers extraction)
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:194`
- **Fix:** Refactored during helpers extraction.
- **Commit:** `03e3ee2`

#### F-MED-11: `ViewModeToggle` aria-label uses wrong key
- **Sources:** `[ARCH] L-3`
- **BUGS.md:** S1b-24
- **Files:** `src/components/staging/ViewModeToggle.tsx:30`
- **Fix:** Fixed to describe group purpose.
- **Commit:** `2c2e44c`

#### F-MED-12: Degradation empty catch blocks (no logging)
- **Sources:** `[QUAL] EH-5`
- **BUGS.md:** S1b-25
- **Files:** `src/lib/connector/degradation.ts:54,89,172,252`
- **Fix:** Added `console.warn` in all catch blocks.
- **Commit:** `2c2e44c`

#### F-MED-13: `removeBlacklistEntry` TOCTOU -- findFirst then delete by ID alone
- **Sources:** `[SEC] SEC-P2-17`
- **BUGS.md:** (fixed in S1a as BS2-2, then refined)
- **Files:** `src/actions/companyBlacklist.actions.ts:112-121`
- **Fix:** Atomic `deleteMany({ where: { id, userId } })`.
- **Commit:** `d540c37`

---

## Open Findings (require action)

### Critical -- Open (1)

#### O-CRIT-01: Variable shadowing in SSE route -- `userId` redeclared inside ReadableStream closure
- **Sources:** `[BS] BS-01`
- **Files:** `src/app/api/scheduler/status/route.ts:81`
- **Description:** S1b added a per-user SSE connection limit with `const userId` at line 46 (outer scope). Inside the `ReadableStream.start()` callback at line 81, there is a SECOND `const userId = session.user!.id as string` declaration that shadows the outer one. The inner declaration uses the old double non-null assertion pattern (`!`) that S1b was supposed to remove. The `cleanup()` closure captures the outer `userId` while `filterStateForUser()` uses the inner one. If either is changed independently, they will silently diverge. This indicates the double `!` removal (M-3/EH-4) was incomplete.
- **Fix effort:** Trivial -- delete line 81. The `start()` closure has access to the outer `userId` via lexical scoping.
- **Priority:** P0

### High -- Open (2)

#### O-HIGH-01: `handleError` passes i18n KEY strings as raw toast descriptions -- not translated
- **Sources:** `[BS] BS-03` / `[BS] BS-08`
- **Files:** `src/actions/publicApiKey.actions.ts` + `src/lib/utils.ts:40-55` + `src/components/settings/PublicApiKeySettings.tsx:88`
- **Description:** S1b correctly changed `throw new Error("Not authenticated")` to `throw new Error("api.notAuthenticated")`. But `handleError` in utils.ts forwards `error.message` directly, and `PublicApiKeySettings.tsx` displays it without translation. Users now see raw key strings like `"api.notAuthenticated"` instead of translated messages. `CompanyBlacklistSettings.tsx` does NOT have this problem -- it calls `t(result.message)`. The two components use inconsistent patterns.
- **Fix effort:** Small -- either translate in UI component (match blacklist pattern) or switch from `throw` to `ActionResult` return pattern.
- **Priority:** P0

#### O-HIGH-02: `_statusResolved` sentinel pattern is fragile (design risk)
- **Sources:** `[BS] BS-02`
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:170-197`
- **Description:** While the immediate sentinel leak was fixed (S1b-27), the underlying pattern of using a shared mutable `data` object as both Prisma payload AND temporary storage remains. Any future developer adding fields to the parallel resolver block could introduce a sentinel that leaks into the DB update.
- **Status:** The bug was fixed, but the design fragility remains. Refactoring to use a separate `results` object for parallel resolution output would eliminate the class of bug.
- **Fix effort:** Small
- **Priority:** P1

### Medium -- Open (5)

#### O-MED-01: Parallel `findOrCreate` upserts in POST/PATCH may trigger SQLite BUSY errors
- **Sources:** `[BS] BS-06`
- **Files:** `src/app/api/v1/jobs/route.ts:87-94`, `src/app/api/v1/jobs/[id]/route.ts`
- **Description:** S1b parallelized 5 independent `findOrCreate` calls with `Promise.all`. Each does a Prisma `upsert` (INSERT OR UPDATE). SQLite uses a single-writer lock. Under I/O pressure from concurrent automation runs, lock contention could cause `SQLITE_BUSY` errors.
- **Fix effort:** Small -- use `prisma.$transaction([...])` or add retry wrapper.
- **Priority:** P2

#### O-MED-02: `buildKey` sanitization incomplete -- `module` and `operation` segments not sanitized
- **Sources:** `[BS] BS-07`
- **Files:** `src/lib/connector/cache.ts:71-73`
- **Description:** S1b added key sanitization for `params`, `locale`, and `userId` segments but not for `module` and `operation`. Current module IDs are safe, but the sanitization is inconsistent.
- **Fix effort:** Trivial
- **Priority:** P2

#### O-MED-03: Cache `startPeriodicPrune()` runs at module load time -- no cleanup in tests
- **Sources:** `[BS] BS-05`
- **Files:** `src/lib/connector/cache.ts:294`, `__tests__/connectorCache.spec.ts`
- **Description:** The prune timer starts as a module-level side effect. In test environments, this creates a 15-minute `setInterval` that runs throughout the test suite without cleanup.
- **Fix effort:** Trivial -- add `afterAll` cleanup or guard behind `NODE_ENV !== "test"`.
- **Priority:** P2

#### O-MED-04: `handleError` forwards raw Prisma error messages to UI via ActionResult
- **Sources:** `[SEC] SEC-P2-11`
- **Files:** `src/lib/utils.ts:54`
- **Description:** If Prisma throws an error (e.g., unique constraint violation), the raw message with DB schema details is displayed in toast notifications. The API layer sanitizes 500s, but server actions used by UI components pass through raw messages.
- **Fix effort:** Medium -- map known Prisma error codes to safe i18n message keys.
- **Priority:** P2

#### O-MED-05: `response.ts` error status inference relies on fragile string matching
- **Sources:** `[ARCH] M-8`
- **Files:** `src/lib/api/response.ts:118-133`
- **Description:** `inferErrorStatus()` maps error messages to HTTP status codes by pattern-matching lowercase strings. Any message containing "not found" returns 404, which could misclassify legitimate messages. S1b added i18n key pattern support (S1b-26), but the underlying approach remains fragile.
- **Fix effort:** Medium -- add explicit error code field on ActionResult.
- **Priority:** P2

---

## Deferred Findings (tracked for future sprints)

### Medium -- Deferred (6)

#### D-MED-01: Public API v1 routes bypass Job Aggregate actions (known architectural debt)
- **Sources:** `[ARCH] M-4`
- **Files:** `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[id]/route.ts`
- **Description:** API routes use direct Prisma queries instead of `job.actions.ts`. Documented in CLAUDE.md for Phase 2 resolution via `AsyncLocalStorage` bridge.
- **Deferred to:** Phase 2 (Public API)

#### D-MED-02: `CORS wildcard` on API v1 safe now but risks future CSRF if cookie auth added
- **Sources:** `[ARCH] M-7`
- **Files:** `src/lib/api/with-api-auth.ts:13-18`
- **Description:** `Access-Control-Allow-Origin: *` is correct for API-key-only auth but would be a CSRF vector if cookie-based session auth is added.
- **Deferred to:** Phase 2 ADR

#### D-MED-03: `useSchedulerStatus` `isConnected` is not reactive -- reads module-level variable
- **Sources:** `[ARCH] M-9`
- **Files:** `src/hooks/use-scheduler-status.ts:188`
- **Description:** `isConnected` is a snapshot from render time, not a reactive state value. No reviewed component currently reads it.
- **Deferred to:** Next SSE iteration

#### D-MED-04: SSE `filterStateForUser` runs 3 array passes + JSON.stringify per 2-second tick
- **Sources:** `[PERF] F-06`
- **Files:** `src/app/api/scheduler/status/route.ts:61-79`
- **Description:** Acceptable for self-hosted single-user deployment. Optimization would add version counter coupling.
- **Deferred to:** Multi-user scaling

#### D-MED-05: `RunHistoryList` renders all runs without pagination guard
- **Sources:** `[PERF] F-09`
- **Files:** `src/components/automations/RunHistoryList.tsx:94-163`
- **Description:** Current caller limits to 10 runs, but component has no internal guard.
- **Deferred to:** S2

#### D-MED-06: Degradation notification messages need full i18n (structured data pattern)
- **Sources:** `[ARCH] H-4` / `[SEC] SEC-P2-12` / `[QUAL] EH-3` / `[QUAL] I18N-4`
- **Files:** `src/lib/connector/degradation.ts:84,168,247`
- **Description:** Partial fix applied (name truncation, TODO marker). Full solution requires storing structured data (`{ type, moduleId, automationName }`) in notification records and rendering translated messages client-side.
- **Deferred to:** S2 Notification system redesign

### Low -- Deferred (10)

#### D-LOW-01: `as unknown as DiscoveredJob` type casts in AutomationDetailPage
- **Sources:** `[ARCH] M-1` / `[QUAL] TS-4`
- **Files:** `src/app/dashboard/automations/[id]/page.tsx:125,250`
- **Deferred to:** S2 type unification

#### D-LOW-02: `RunStatusBadge` module-level mutable state outside React lifecycle
- **Sources:** `[ARCH] M-2`
- **Files:** `src/components/automations/RunStatusBadge.tsx:11-28`
- **Deferred to:** Acceptable for current architecture

#### D-LOW-03: `RunProgressPanel` `as Parameters<typeof t>[0]` cast
- **Sources:** `[ARCH] L-2` / `[QUAL] TS-6`
- **Files:** `src/components/scheduler/RunProgressPanel.tsx:104,149`
- **Deferred to:** S2 type cleanup

#### D-LOW-04: DeckCard string `.replace("{name}", ...)` interpolation pattern
- **Sources:** `[ARCH] L-4`
- **Files:** `src/components/staging/DeckCard.tsx:188`, `src/components/staging/DeckView.tsx:119-121`
- **Deferred to:** S2 if i18n adapter supports parameterized translations

#### D-LOW-05: `StagingContainer` imports `addBlacklistEntry` directly -- cross-aggregate call
- **Sources:** `[ARCH] L-5`
- **Files:** `src/components/staging/StagingContainer.tsx:19`
- **Deferred to:** Acceptable in monolith UI layer

#### D-LOW-06: `DeckView` keyboard hints not co-located with actual bindings
- **Sources:** `[ARCH] L-6`
- **Files:** `src/components/staging/DeckView.tsx:262-290`
- **Deferred to:** S2 if keyboard bindings are refactored

#### D-LOW-07: `isMockDataEnabled` uses `NEXT_PUBLIC_` env var visible to clients
- **Sources:** `[SEC] SEC-P2-14`
- **Files:** `src/lib/constants.ts:63-68`
- **Deferred to:** Acceptable for dev-only flag controlling UI elements

#### D-LOW-08: `RunHistoryList` displays raw status without translation
- **Sources:** `[QUAL] I18N-7`
- **Files:** `src/components/automations/RunHistoryList.tsx:108`
- **Deferred to:** S2 RunHistoryList component tests + i18n

#### D-LOW-09: StagingContainer stale vacancies flash on tab switch
- **Sources:** `[PERF] F-10`
- **Files:** `src/components/staging/StagingContainer.tsx:151-153`
- **Deferred to:** S2

#### D-LOW-10: DeckCard re-creates color-classification functions on every render
- **Sources:** `[PERF] F-13`
- **Files:** `src/components/staging/DeckCard.tsx:22-33`
- **Deferred to:** Not worth changing (at most 3 visible cards)

---

## Open Testing Gaps

These are findings from the Quality/Testing and Blind Spot reviews that represent missing test coverage rather than code bugs. They are tracked separately because they require new test files.

### Critical Test Gaps

#### TG-01: No unit tests for `src/lib/api/auth.ts` -- Public API authentication gate
- **Sources:** `[QUAL] TG-1`
- **Status:** OPEN
- **Priority:** P0 -- regression in key validation would silently break all API auth

#### TG-02: No unit tests for `src/lib/api/rate-limit.ts` -- DoS protection
- **Sources:** `[QUAL] TG-2`
- **Status:** OPEN
- **Priority:** P0 -- sliding window logic, cleanup, capacity limits untested

#### TG-03: No integration test for `src/lib/api/with-api-auth.ts` -- security perimeter
- **Sources:** `[QUAL] TG-3`
- **Status:** FIXED
- **Commit:** `21924a9`

### High Test Gaps

#### TG-04: No route handler tests for `/api/v1/` endpoints (8 endpoints)
- **Sources:** `[QUAL] TG-4`
- **Status:** FIXED
- **Commit:** `21924a9`

#### TG-05: No unit test for `src/lib/api/last-used-throttle.ts`
- **Sources:** `[QUAL] TG-5`
- **Status:** OPEN
- **Priority:** P1

### Medium Test Gaps

#### TG-06: No component test for `AutomationList.tsx`
- **Sources:** `[QUAL] TG-6`
- **Status:** OPEN -- Deferred to S2

#### TG-07: No component test for `RunHistoryList.tsx`
- **Sources:** `[QUAL] TG-7`
- **Status:** OPEN -- Deferred to S2

#### TG-08: No component test for `CompanyBlacklistSettings.tsx`
- **Sources:** `[QUAL] TG-8`
- **Status:** OPEN -- Deferred to S2

#### TG-09: No component test for `PublicApiKeySettings.tsx`
- **Sources:** `[QUAL] TG-9`
- **Status:** OPEN -- Deferred to S2

#### TG-10: No page test for `AutomationDetailPage` (514 lines)
- **Sources:** `[QUAL] TG-10` / `[BS] BS-10`
- **Status:** OPEN -- Deferred to S2

### Low Test Gaps

#### TG-11: `StagingContainer` only partially tested (banner only)
- **Sources:** `[QUAL] TG-11`
- **Status:** OPEN -- Deferred to S2

#### TG-12: No dedicated schema tests for `src/lib/api/schemas.ts`
- **Sources:** `[QUAL] TG-12`
- **Status:** OPEN -- Deferred to S2

#### TG-13: `connectorCache.spec.ts` does not exercise `startPeriodicPrune` / `stopPeriodicPrune`
- **Sources:** `[BS] BS-11`
- **Status:** OPEN -- Deferred to S2

---

## Open Code Quality Findings

### Large Component Refactoring (Deferred to S2)

#### CQ-01: `AutomationDetailPage` is 514 lines with 12 useState hooks
- **Sources:** `[QUAL] CC-1`
- **Files:** `src/app/dashboard/automations/[id]/page.tsx`
- **Status:** DEFERRED -- Extract sub-components + custom hook

#### CQ-02: `StagingContainer` is 497 lines with 16 useState hooks
- **Sources:** `[QUAL] CC-2`
- **Files:** `src/components/staging/StagingContainer.tsx`
- **Status:** DEFERRED -- Extract generic action handler + custom hook

#### CQ-03: PATCH handler 115 lines with deep field mapping
- **Sources:** `[QUAL] CC-3`
- **Files:** `src/app/api/v1/jobs/[id]/route.ts:41-155`
- **Status:** PARTIALLY ADDRESSED -- `buildUpdateData()` extracted, but still long

#### CQ-04: DeckView drag overlay ternary nesting
- **Sources:** `[QUAL] CC-4`
- **Files:** `src/components/staging/DeckView.tsx:163-209`
- **Status:** DEFERRED

### Minor Cleanup Items (Deferred)

#### CQ-05: Rate limiter `globalThis` uses `as any` instead of typed pattern
- **Sources:** `[ARCH] M-6` / `[QUAL] TS-3`
- **Files:** `src/lib/api/rate-limit.ts:34-35`
- **Status:** DEFERRED

#### CQ-06: Lock release + event emission logic duplicated 3x in RunCoordinator
- **Sources:** `[QUAL] DUP-4`
- **Files:** `src/lib/scheduler/run-coordinator.ts:132-161,308-333,348-374`
- **Status:** DEFERRED

#### CQ-07: Redundant RunnerResult re-export in scheduler/types.ts
- **Sources:** `[QUAL] NM-3`
- **Files:** `src/lib/scheduler/types.ts:8`
- **Status:** DEFERRED

#### CQ-08: `isAutomationRunning` called twice per list item per render
- **Sources:** `[PERF] F-11`
- **Files:** `src/components/automations/AutomationList.tsx:165,344`
- **Status:** DEFERRED -- Trivial local variable extraction

#### CQ-09: SSE `onmessage` catch block silently swallows parse errors
- **Sources:** `[QUAL] EH-6`
- **Files:** `src/hooks/use-scheduler-status.ts:53`
- **Status:** DEFERRED

---

## Remaining Low-Severity Findings (Not Fixed, Low Priority)

#### O-LOW-01: `ViewModeToggle` localStorage read is safe (no action needed)
- **Sources:** `[SEC] SEC-P2-15`
- **Status:** NO ACTION NEEDED -- correctly defaults to safe value

#### O-LOW-02: `params.id as string` non-null assertion on route params
- **Sources:** `[QUAL] TS-5`
- **Files:** `src/app/dashboard/automations/[id]/page.tsx:69`
- **Status:** Standard Next.js pattern -- acceptable

#### O-LOW-03: SSE connection count not decremented on `createSSEErrorResponse` paths
- **Sources:** `[BS] BS-09`
- **Files:** `src/app/api/scheduler/status/route.ts:50-53`
- **Status:** OPEN -- Extremely unlikely to trigger. P3.

#### O-LOW-04: `automations.loadFailed` and `automations.notFound` keys not verified in test
- **Sources:** `[BS] BS-10`
- **Status:** OPEN -- Covered by TG-10 (AutomationDetailPage test gap)

#### O-LOW-05: `checkConsecutiveRunFailures` IDOR fix incomplete -- userId not in where clause
- **Sources:** `[BS] BS-12`
- **Files:** `src/lib/connector/degradation.ts:148-150`
- **Description:** S1b changed `findUnique` to `findFirst` (the ADR-015 pattern) but did NOT add `userId` to the where clause as recommended. The function signature still accepts only `automationId` with no `userId` parameter. Same issue for `recentRuns` query at line 127-132.
- **Status:** OPEN -- Server-only code, not directly callable from client. P3.

---

## Cross-Reference: Reports to Unique Findings

This table maps original report finding IDs to their consolidated ID for traceability.

| Report Finding | Consolidated ID | Status |
|---|---|---|
| **Architecture** | | |
| C-1 | F-CRIT-01 | FIXED |
| C-2 | F-HIGH-05 | FIXED (partial, see O-LOW-05) |
| H-1 | F-HIGH-10 | FIXED |
| H-2 | F-HIGH-08 | FIXED |
| H-3 | F-HIGH-09 | FIXED |
| H-4 | F-HIGH-15 / D-MED-06 | PARTIAL FIX |
| H-5 | F-HIGH-11 | FIXED |
| M-1 | D-LOW-01 | DEFERRED |
| M-2 | D-LOW-02 | DEFERRED |
| M-3 | F-MED-08 | FIXED (see O-CRIT-01 for regression) |
| M-4 | D-MED-01 | DEFERRED |
| M-5 | F-MED-02 | FIXED |
| M-6 | CQ-05 | DEFERRED |
| M-7 | D-MED-02 | DEFERRED |
| M-8 | O-MED-05 | OPEN |
| M-9 | D-MED-03 | DEFERRED |
| L-1 | O-MED-06 | OPEN |
| L-2 | D-LOW-03 | DEFERRED |
| L-3 | F-MED-11 | FIXED |
| L-4 | D-LOW-04 | DEFERRED |
| L-5 | D-LOW-05 | DEFERRED |
| L-6 | D-LOW-06 | DEFERRED |
| **Security** | | |
| SEC-P2-01 | F-CRIT-02 | FIXED |
| SEC-P2-02 | F-HIGH-05 | FIXED (partial) |
| SEC-P2-03 | F-HIGH-14 | FIXED (documented) |
| SEC-P2-04 | F-HIGH-07 | FIXED |
| SEC-P2-05 | F-HIGH-06 | FIXED |
| SEC-P2-06 | F-CRIT-02 | FIXED |
| SEC-P2-07 | F-CRIT-02 | FIXED |
| SEC-P2-08 | F-MED-01 | FIXED |
| SEC-P2-09 | F-HIGH-04 | FIXED |
| SEC-P2-10 | F-MED-04 | FIXED (partial, see O-MED-02) |
| SEC-P2-11 | O-MED-04 | OPEN |
| SEC-P2-12 | F-HIGH-15 / D-MED-06 | PARTIAL FIX |
| SEC-P2-13 | F-HIGH-16 | FIXED |
| SEC-P2-14 | D-LOW-07 | DEFERRED |
| SEC-P2-15 | O-LOW-01 | NO ACTION |
| SEC-P2-16 | F-HIGH-08 | FIXED |
| SEC-P2-17 | F-MED-13 | FIXED |
| **Performance** | | |
| F-01 | F-CRIT-01 | FIXED |
| F-02 | F-HIGH-01 | FIXED |
| F-03 | F-HIGH-02 | FIXED |
| F-04 | F-HIGH-03 | FIXED |
| F-05 | F-HIGH-04 | FIXED |
| F-06 | D-MED-04 | DEFERRED |
| F-07 | F-MED-02 | FIXED |
| F-08 | F-MED-03 | FIXED |
| F-09 | D-MED-05 | DEFERRED |
| F-10 | D-LOW-09 | DEFERRED |
| F-11 | CQ-08 | DEFERRED |
| F-12 | F-MED-05 | FIXED |
| F-13 | D-LOW-10 | DEFERRED |
| **Quality/Testing** | | |
| TS-1 | O-MED-06 | OPEN |
| TS-2 | F-MED-10 | FIXED |
| TS-3 | CQ-05 | DEFERRED |
| TS-4 | D-LOW-01 | DEFERRED |
| TS-5 | O-LOW-02 | ACCEPTABLE |
| TS-6 | D-LOW-03 | DEFERRED |
| EH-1 | F-HIGH-08 | FIXED |
| EH-2 | F-HIGH-09 | FIXED |
| EH-3 | F-HIGH-15 / D-MED-06 | PARTIAL FIX |
| EH-4 | F-MED-08 | FIXED (see O-CRIT-01) |
| EH-5 | F-MED-12 | FIXED |
| EH-6 | CQ-09 | DEFERRED |
| NM-1 | F-HIGH-10 | FIXED |
| NM-2 | F-MED-02 | FIXED |
| NM-3 | CQ-07 | DEFERRED |
| DUP-1 | F-MED-07 | FIXED |
| DUP-2 | F-MED-06 | FIXED |
| DUP-3 | F-HIGH-10 | FIXED |
| DUP-4 | CQ-06 | DEFERRED |
| CC-1 | CQ-01 | DEFERRED |
| CC-2 | CQ-02 | DEFERRED |
| CC-3 | CQ-03 | PARTIALLY ADDRESSED |
| CC-4 | CQ-04 | DEFERRED |
| I18N-1 | F-HIGH-10 | FIXED |
| I18N-2 | F-HIGH-10 | FIXED |
| I18N-3 | F-HIGH-10 | FIXED |
| I18N-4 | F-HIGH-15 / D-MED-06 | PARTIAL FIX |
| I18N-5 | F-HIGH-16 | FIXED |
| I18N-6 | F-HIGH-16 | FIXED |
| I18N-7 | D-LOW-08 | DEFERRED |
| SEC-1 | F-HIGH-13 | FIXED |
| SEC-2 | F-HIGH-07 | FIXED |
| SEC-3 | F-CRIT-01 | FIXED |
| TG-1 | TG-01 | OPEN |
| TG-2 | TG-02 | OPEN |
| TG-3 | TG-03 | FIXED |
| TG-4 | TG-04 | FIXED |
| TG-5 | TG-05 | OPEN |
| TG-6 | TG-06 | DEFERRED |
| TG-7 | TG-07 | DEFERRED |
| TG-8 | TG-08 | DEFERRED |
| TG-9 | TG-09 | DEFERRED |
| TG-10 | TG-10 | DEFERRED |
| TG-11 | TG-11 | DEFERRED |
| TG-12 | TG-12 | DEFERRED |
| **Blind Spot** | | |
| BS-01 | O-CRIT-01 | OPEN |
| BS-02 | F-HIGH-12 / O-HIGH-02 | FIXED (bug), OPEN (design) |
| BS-03 | O-HIGH-01 | OPEN |
| BS-04 | F-HIGH-13 | FIXED |
| BS-05 | O-MED-03 | OPEN |
| BS-06 | O-MED-01 | OPEN |
| BS-07 | O-MED-02 | OPEN |
| BS-08 | O-HIGH-01 | OPEN (duplicate of BS-03) |
| BS-09 | O-LOW-03 | OPEN |
| BS-10 | O-LOW-04 / TG-10 | OPEN |
| BS-11 | TG-13 | OPEN |
| BS-12 | O-LOW-05 | OPEN |

---

## Priority Action Items for Next Sprint

### P0 (Fix immediately)
1. **O-CRIT-01** -- Remove shadowed `userId` at SSE route line 81 (trivial)
2. **O-HIGH-01** -- Fix i18n key display in PublicApiKeySettings toast (small)
3. **TG-01** -- Write unit tests for `auth.ts` (medium)
4. **TG-02** -- Write unit tests for `rate-limit.ts` (medium)

### P1 (Fix in S2)
5. **O-HIGH-02** -- Refactor `buildUpdateData` to use separate results object (small)
6. **TG-05** -- Write unit test for `last-used-throttle.ts` (small)

### P2 (Fix in S2-S3)
7. **O-MED-01** -- Document SQLite parallel write limitation; consider `$transaction` (small)
8. **O-MED-02** -- Sanitize all cache key segments (trivial)
9. **O-MED-03** -- Guard prune timer in test environment (trivial)
10. **O-MED-04** -- Map Prisma error codes to safe messages in `handleError` (medium)
11. **O-MED-05** -- Add explicit error code field on ActionResult (medium)
12. **D-MED-06** -- Full i18n for degradation notification messages (medium)
