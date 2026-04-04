# Blind Spot Check -- Post-S1b Fix Verification

**Auditor:** Claude Opus 4.6 (Blind Spot Analyst)
**Date:** 2026-04-01
**Scope:** All files changed in S1b, cross-referenced against S1b review findings, Allium specs, and ADRs

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 3     |
| Medium   | 4     |
| Low      | 4     |
| **Total**| **12**|

S1b fixed 25 findings well, but introduced 1 new bug and left several issues that sit in blind spots between the review dimensions.

---

## Critical Findings

### BS-01: Variable shadowing in SSE route -- `userId` redeclared inside ReadableStream closure

**File:** `src/app/api/scheduler/status/route.ts:81`
**Category:** Bug introduced BY S1b fix (regression)
**CWE:** CWE-561 (Dead Code) / Runtime correctness

The S1b fix added a per-user SSE connection limit (SEC-P2-08) with a `const userId = session.user.id` at line 46. However, inside the `ReadableStream.start()` callback at line 81, there is a SECOND declaration:

```ts
// Line 46 (outer scope):
const userId = session.user.id;

// Line 81 (inner scope, inside start() callback):
const userId = session.user!.id as string;
```

This creates **variable shadowing**. The inner `const userId` shadows the outer one. While both resolve to the same value at this point, the inner declaration uses the old double non-null assertion pattern (`session.user!.id`) that S1b was supposed to fix (the `!` was flagged in the original review as M-3/EH-4).

The **real risk** is that the `cleanup()` closure at lines 63-77 captures the **outer** `userId` (line 46), while `filterStateForUser()` at line 82 uses the **inner** `userId` (line 81). If a future refactoring changes only the outer declaration (e.g., to read from a different source), the inner one would silently diverge, causing the connection counter to decrement for a different user than it filters for.

In strict TypeScript/ESLint configs, this would be caught by `no-shadow`. It currently works by coincidence, not by design.

**Severity:** Critical (correctness risk + indicates the double `!` was NOT actually removed as claimed)

**Recommended fix:** Remove line 81 entirely. The `start()` closure already has access to the outer `userId` via lexical scoping. The inner redeclaration is redundant:

```diff
-      // Filter state to current user's automations only (M-1 security fix)
-      // userId is guaranteed by the auth check above (session?.user?.id)
-      const userId = session.user!.id as string;
       const filterStateForUser = () => {
```

---

## High Findings

### BS-02: `_statusResolved` sentinel value can leak into Prisma update if status resolution throws

**File:** `src/app/api/v1/jobs/[id]/route.ts:170-197`
**Category:** Bug introduced BY S1b fix (parallel upserts)

The `buildUpdateData()` function uses a temporary sentinel `data._statusResolved` to stash the status resolution result from the parallel `Promise.all`. After awaiting, it reads and deletes this sentinel at lines 190-197. However, if `resolveStatus()` throws an exception (e.g., DB connection error), `Promise.all` rejects, and the sentinel is never cleaned up.

More subtly: the sentinel is written via `.then()` on the resolver promise. If `resolveStatus` succeeds but another resolver in the same `Promise.all` throws, the `data._statusResolved` key will still exist when the error propagates -- but in this case the entire function throws, so the data object is discarded. This path is safe.

The actual concern is that if `data._statusResolved` is NOT deleted (e.g., status check skipped because `updates.status` is undefined after the initial check passes), the sentinel value could leak into the `prisma.job.update()` call. However, examining the code, the `delete data._statusResolved` at line 192 only executes when `updates.status !== undefined`, and the sentinel is only SET when `updates.status !== undefined` (line 167). These are logically paired.

**Re-evaluation:** The logic is actually correct for all current paths. However, the pattern of using a shared mutable `data` object as both the Prisma payload AND a temporary storage mechanism is fragile. Any future developer adding fields to the parallel resolver block could accidentally introduce a sentinel that leaks.

**Severity:** High (design fragility -- not a current bug, but one `resolvers.push()` away from becoming one)

**Recommended fix:** Use a separate `results` object for parallel resolution output, then merge into `data` after `Promise.all`:

```ts
const results: Record<string, { id: string } | null> = {};
// ... resolvers write to results ...
await Promise.all(resolvers);
if (results.title) data.jobTitleId = results.title.id;
```

---

### BS-03: `handleError` passes i18n KEY strings as raw toast descriptions -- not translated

**File:** `src/actions/publicApiKey.actions.ts` + `src/lib/utils.ts:40-55` + `src/components/settings/PublicApiKeySettings.tsx:88`
**Category:** i18n regression introduced BY S1b fix

S1b correctly changed `throw new Error("Not authenticated")` to `throw new Error("api.notAuthenticated")` in `publicApiKey.actions.ts`. However, the `handleError` utility at `src/lib/utils.ts:54` forwards `error.message` directly:

```ts
return { success: false, message: error.message || msg };
```

This means `result.message` is now the literal string `"api.notAuthenticated"` -- the i18n KEY, not the translated value. The UI component at `PublicApiKeySettings.tsx:88` displays this key as-is:

```tsx
description: result.message,  // Shows "api.notAuthenticated" to the user
```

The toast shows the raw key string `"api.notAuthenticated"` instead of "Not authenticated" / "Nicht authentifiziert" / etc.

The same problem affects ALL error keys in `publicApiKey.actions.ts`: `api.keyNameRequired`, `api.keyNameTooLong`, `api.maxKeysReached`, `api.keyNotFound`, `api.keyAlreadyRevoked`, `api.keyMustBeRevoked`.

The blacklist actions do NOT have this problem because they return `ActionResult` directly with the key in `message`, and the UI component presumably calls `t(result.message)` to translate it.

**Severity:** High (visible i18n regression -- users see raw key strings in toast notifications)

**Recommended fix:** Either:
- (A) In `PublicApiKeySettings.tsx`, wrap the message: `description: result.message ? t(result.message as any) : undefined`
- (B) In `publicApiKey.actions.ts`, switch from `throw new Error()` to returning `ActionResult` with the i18n key, like `companyBlacklist.actions.ts` does
- (C) In `handleError`, detect i18n key patterns and translate server-side using `t(locale, key)` from `@/i18n/server`

Option (B) is the most architecturally sound -- it aligns with the blacklist pattern already in use.

---

### BS-04: `interview.deleteMany` in DELETE handler lacks userId scope -- IDOR defense-in-depth violation

**File:** `src/app/api/v1/jobs/[id]/route.ts:100`
**Category:** Security (missed by S1b review, already flagged as SEC-1 in phase1 but not fixed)

```ts
await prisma.interview.deleteMany({ where: { jobId } });
```

While the job ownership was verified at line 91 via `findFirst({ where: { id: jobId, userId } })`, the subsequent `interview.deleteMany` uses only `jobId` without `userId`. Per ADR-015, ALL Prisma writes MUST include userId.

This was flagged as SEC-1 in the phase1-quality-testing review but was NOT included in the S1b fix set. Since the S1b fixes touched this exact file and refactored the PATCH handler, the interview deletion was a missed opportunity.

**Severity:** High (ADR-015 violation -- defense-in-depth. The job ownership check at line 91 mitigates the practical risk, but the pattern violates the project's security invariant.)

**Recommended fix:**
```ts
await prisma.interview.deleteMany({ where: { jobId, job: { userId } } });
```

---

## Medium Findings

### BS-05: Cache `startPeriodicPrune()` runs at module load time -- no cleanup on process exit

**File:** `src/lib/connector/cache.ts:294`
**Category:** Performance / resource leak

Line 294 calls `connectorCache.startPeriodicPrune()` at module-level (top-level side effect). The timer is `unref()`ed so it does not block Node.js exit. However, in test environments where the module is imported, this creates a 15-minute `setInterval` that runs throughout the test suite. The test file `connectorCache.spec.ts` creates its own `new ConnectorCache(10)` instances but does NOT interact with the singleton, meaning the singleton's prune timer is never stopped.

This is not a production issue (the timer is `unref()`ed), but it is a test hygiene issue -- the timer fires during test runs and could cause flaky behavior if it runs during an unrelated test's timer mocking.

**Severity:** Medium (test reliability)

**Recommended fix:** Add an `afterAll` hook in the cache test suite:
```ts
afterAll(() => {
  connectorCache.stopPeriodicPrune();
});
```

Or guard the `startPeriodicPrune()` call behind a `process.env.NODE_ENV !== "test"` check.

---

### BS-06: Parallel `findOrCreate` upserts in POST /api/v1/jobs may trigger SQLite BUSY errors

**File:** `src/app/api/v1/jobs/route.ts:87-94`
**Category:** Performance / correctness (introduced BY S1b fix)

S1b parallelized the 5 independent `findOrCreate` calls using `Promise.all`. Each `findOrCreate` does a Prisma `upsert`, which is an INSERT OR UPDATE operation. SQLite uses a single-writer lock -- only one write transaction can proceed at a time. When 5 concurrent upserts race, 4 of them will be queued behind the WAL write lock.

With the default Prisma/SQLite configuration, concurrent writes trigger `SQLITE_BUSY` errors after the busy timeout (default: 5000ms in Prisma's SQLite connector). Under normal conditions, the upserts are fast enough that they serialize without hitting the timeout. However:

1. If the database is under I/O pressure (e.g., concurrent automation run writing discovered jobs), the lock contention increases.
2. Prisma's default journal mode for SQLite is WAL, which allows concurrent reads but still serializes writes.
3. The Node.js event loop dispatches all 5 upserts nearly simultaneously, maximizing lock contention.

In practice, for a self-hosted single-user deployment with SQLite, this is unlikely to cause failures under normal load. But it is a correctness regression from the sequential pattern, which guaranteed no write contention within a single request.

**Severity:** Medium (latent -- will surface under concurrent API usage)

**Recommended fix:** Document the SQLite write serialization limitation. Consider using `prisma.$transaction([...])` to batch all 5 upserts in a single transaction, which avoids the per-statement lock acquisition overhead. Alternatively, keep the `Promise.all` pattern but add a retry wrapper for `SQLITE_BUSY` errors.

---

### BS-07: `buildKey` sanitization is incomplete -- `module` and `operation` segments are NOT sanitized

**File:** `src/lib/connector/cache.ts:71-73`
**Category:** Security gap in S1b fix (SEC-P2-10)

S1b added key sanitization to prevent delimiter injection:

```ts
const sanitize = (s: string) => s.replace(/:/g, "%3A");
const segments = [parts.module, parts.operation, sanitize(parts.params)];
```

The `params`, `locale`, and `userId` segments are sanitized. However, `parts.module` and `parts.operation` are NOT sanitized. While these are typically controlled by code (not user input), the `module` value comes from `manifest.id` and the `operation` string from calling code. If a future module has a colon in its ID, or if user input flows into the operation string, the key collision vulnerability returns.

Additionally, the `userId` segment at line 80 is NOT sanitized either, though UUIDs do not contain colons.

**Severity:** Medium (defense-in-depth gap -- current module IDs are safe, but the sanitization is inconsistent)

**Recommended fix:** Sanitize ALL segments for consistency:
```ts
const segments = [sanitize(parts.module), sanitize(parts.operation), sanitize(parts.params)];
```

---

### BS-08: `PublicApiKeySettings` does NOT translate `result.message` but `CompanyBlacklistSettings` does -- inconsistent pattern

**File:** `src/components/settings/PublicApiKeySettings.tsx:88` vs `src/components/settings/CompanyBlacklistSettings.tsx:66`
**Category:** Inconsistent i18n error handling pattern across components

`CompanyBlacklistSettings.tsx` correctly translates error messages at line 66:
```tsx
title: result.message ? t(result.message) : t("common.error"),
```

But `PublicApiKeySettings.tsx` does NOT translate at line 88:
```tsx
description: result.message,  // raw i18n key displayed to user
```

This confirms BS-03 is a real regression. The blacklist component got it right, but the API key component did not receive the same treatment. The two components use different patterns for handling the same type of i18n-keyed error messages from server actions.

**Severity:** Medium (confirms BS-03 is a real user-visible bug, and highlights the pattern inconsistency)

**Recommended fix:** Update `PublicApiKeySettings.tsx` to match the blacklist pattern:
```tsx
description: result.message ? t(result.message as any) : undefined,
```

---

## Low Findings

### BS-09: SSE connection count not decremented on `createSSEErrorResponse` paths

**File:** `src/app/api/scheduler/status/route.ts:50-53`
**Category:** Resource accounting gap

When the connection limit check at line 50 passes and the counter is incremented at line 53, but then the `ReadableStream` constructor or any code between lines 53-59 throws an exception, the counter is incremented but never decremented (cleanup only runs inside the stream's `start()` callback).

In practice, `new ReadableStream()` and `new TextEncoder()` are extremely unlikely to throw. But the accounting is not fail-safe -- the increment happens before the cleanup scope is established.

**Severity:** Low (extremely unlikely to trigger)

**Recommended fix:** Wrap lines 59-141 in a try/catch that decrements the counter on failure:
```ts
try {
  const stream = new ReadableStream({ ... });
  return new NextResponse(stream, { ... });
} catch {
  const count = sseConnectionCounts.get(userId) ?? 1;
  if (count <= 1) sseConnectionCounts.delete(userId);
  else sseConnectionCounts.set(userId, count - 1);
  throw;
}
```

---

### BS-10: `automations.loadFailed` and `automations.notFound` keys exist but are not verified in test

**File:** `__tests__/connectorCache.spec.ts`, `__tests__/public-api-key-actions.spec.ts`
**Category:** Testing gap

S1b added i18n keys to the automation detail page (`t("common.error")`, `t("automations.loadFailed")`, `t("automations.notFound")`) but there are no tests for the `AutomationDetailPage` component (flagged as TG-10 in phase1 but not addressed). The i18n key changes could silently break if the keys are renamed or removed in a future dictionary refactoring, since no test exercises the `loadData()` error paths.

**Severity:** Low (existing gap, not new -- but S1b changes are untested)

**Recommended fix:** Add component tests for `AutomationDetailPage` that verify the error toast content uses i18n keys. At minimum, a snapshot test that renders the loading/error state.

---

### BS-11: `connectorCache.spec.ts` tests do not exercise `startPeriodicPrune` / `stopPeriodicPrune`

**File:** `__tests__/connectorCache.spec.ts`
**Category:** Testing gap for new S1b code

S1b added `startPeriodicPrune()` and `stopPeriodicPrune()` methods to `ConnectorCache`. The test suite has no test for these methods. Edge cases include:
- Idempotent start (calling `startPeriodicPrune()` twice should not create two timers)
- Stop clears the timer
- Prune callback actually invokes `prune()`
- `unref()` is called on the timer

**Severity:** Low (methods are simple, but zero test coverage for new code)

**Recommended fix:** Add tests:
```ts
describe("periodicPrune", () => {
  it("starts idempotently", () => { ... });
  it("stops the timer", () => { ... });
});
```

---

### BS-12: `degradation.ts` IDOR fix was incomplete -- `checkConsecutiveRunFailures` still lacks userId in where clause

**File:** `src/lib/connector/degradation.ts:148-150`
**Category:** Incomplete S1b fix

S1b changed `findUnique` to `findFirst` (addressing the ADR-015 pattern requirement), but did NOT add `userId` to the where clause. The original finding (SEC-P2-02 / C-2) specifically recommended: "pass userId from the caller and use findFirst with `{ id: automationId, userId }`."

The current code at line 148-150:
```ts
const automation = await prisma.automation.findFirst({
  where: { id: automationId },
  select: { status: true, name: true, userId: true },
});
```

The `findUnique` -> `findFirst` change was applied, but the `userId` scoping was not. The function signature still accepts only `automationId: string` with no `userId` parameter.

Similarly, the `recentRuns` query at line 127-132 queries `automationRun` by `automationId` alone without userId.

**Severity:** Low (server-only code, not directly callable from client, but ADR-015 compliance is incomplete)

**Recommended fix:** Add `userId` parameter to `checkConsecutiveRunFailures` and include it in both the `automationRun.findMany` and `automation.findFirst` where clauses.

---

## Cross-Dependency Analysis

### Impact on S3 (CRM Core)

The `handleError` i18n key passthrough issue (BS-03) sets a precedent. If CRM Core server actions follow the same `throw new Error("crm.someKey")` pattern, the same raw-key-display bug will propagate. **Recommendation:** Fix the `handleError` pattern now before CRM Core begins.

### Impact on S4 (Data Enrichment)

The parallel upsert pattern (BS-06) in the API route is being established as a template. S4's Data Enrichment Connector will likely have similar entity resolution patterns. If the SQLite BUSY issue surfaces there under higher write load (enrichment writes are more frequent), it will be harder to fix retroactively. **Recommendation:** Document the SQLite parallel write limitation in the ADR for Public API.

### Allium Spec Alignment

The `checkConsecutiveRunFailures` IDOR gap (BS-12) does not affect the Allium spec compliance because `specs/module-lifecycle.allium` specifies the rule at the behavior level ("pause after N failures"), not at the Prisma query level. The spec is still correctly implemented. The gap is purely an ADR-015 defense-in-depth concern.

---

## Verification: What S1b Got Right

The following S1b fixes were verified as correct and complete:

1. **ConnectorCache globalThis singleton** (F-01/C-1): Lines 288-291 now use the unconditional `globalThis` pattern. Correct.
2. **LRU re-insertion on get()** (F-07/M-5): Line 153-154 deletes and re-inserts on cache hit. Correct.
3. **Cache key sanitization** (SEC-P2-10): Params segment is sanitized. Partially correct (see BS-07).
4. **API response select shapes** (SEC-P2-01/06/07): `JOB_API_SELECT`, `JOB_DETAIL_SELECT`, `JOB_LIST_SELECT` all exclude userId, matchData, foreign keys. Correct.
5. **Shared helpers extraction** (DUP-1): `findOrCreate`, `resolveStatus`, and select shapes extracted to `src/lib/api/helpers.ts`. Correct.
6. **Notes pagination** (F-12): Notes GET now uses `NotesListQuerySchema` with pagination. Correct.
7. **Blacklist atomic delete** (SEC-P2-17): Uses `deleteMany({ where: { id, userId } })`. Correct.
8. **Blacklist bounded query** (F-05): `take: 500` added. Correct.
9. **Blacklist input validation** (SEC-P2-09): Pattern max 500, reason max 1000. Correct.
10. **IP rate limit unique fallback** (was shared "unknown" bucket): Now uses `anon-${Date.now()}`. Correct.
11. **RunSource inlined** (H-5): `type RunSource = "scheduler" | "manual"` defined directly in event-types.ts. Correct.
12. **SSE per-user connection limit** (SEC-P2-08): Counter on globalThis, max 5. Correct (modulo BS-01/BS-09).
13. **Notification name truncation** (SEC-P2-12): `.slice(0, 200)` on automation name and module name. Correct.
14. **Degradation console.warn** (EH-5): All catch blocks now have `console.warn`. Correct.
15. **i18n keys in blacklist actions** (EH-2/H-3): All messages now use i18n keys. Correct.
16. **i18n keys in publicApiKey actions** (EH-1/H-2): Keys changed to i18n. Correct (but display is broken, see BS-03).
17. **Automation detail page i18n** (H-1/I18N-1/2/3): Toast titles use `t("common.error")`, labels use `t("automations.keywords")`. Correct.
18. **Parallel POST upserts** (F-03): `Promise.all` in POST handler. Correct (but see BS-06 for SQLite caveat).
19. **Parallel PATCH upserts** (F-02): `buildUpdateData` uses parallel resolvers. Correct (but see BS-02 for fragility).
20. **Removed duplicate getAutomationRuns** (F-04): `loadData()` now uses runs from `getAutomationById`. Correct.

---

## Priority Action Items

| Priority | ID | Fix Effort | Description |
|----------|----|------------|-------------|
| P0 | BS-01 | Trivial | Remove shadowed `userId` declaration at SSE route line 81 |
| P0 | BS-03 | Small | Fix i18n key display -- either translate in UI or switch to ActionResult pattern |
| P1 | BS-04 | Trivial | Add userId to interview.deleteMany in DELETE handler |
| P1 | BS-02 | Small | Refactor buildUpdateData to use separate results object |
| P2 | BS-06 | Small | Document SQLite parallel write limitation; consider $transaction |
| P2 | BS-07 | Trivial | Sanitize all cache key segments, not just params |
| P2 | BS-08 | Small | Audit CompanyBlacklistSettings toast calls for t() wrapping |
| P3 | BS-05 | Trivial | Guard prune timer in test environment |
| P3 | BS-09 | Small | Add counter decrement on SSE stream creation failure |
| P3 | BS-10 | Medium | Add AutomationDetailPage component tests |
| P3 | BS-11 | Small | Add periodicPrune test coverage |
| P3 | BS-12 | Small | Complete IDOR fix in checkConsecutiveRunFailures |
