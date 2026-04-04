# Phase 1: Code Quality & Testing Coverage Review

Sprint A + B + C (34 files reviewed)

---

## Part 1: Code Quality & Best Practices

### 1. TypeScript Strictness

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| TS-1 | Medium | `src/components/automations/AutomationList.tsx:193` | `as any` cast on translation key: `t(PAUSE_REASON_KEYS[automation.pauseReason] as any)`. Used twice (lines 193, 198). | Type `PAUSE_REASON_KEYS` values as `TranslationKey` (imported from `@/i18n`) so the cast becomes unnecessary. The `Record<AutomationPauseReason, TranslationKey>` type would eliminate both casts. |
| TS-2 | Medium | `src/app/api/v1/jobs/[id]/route.ts:194` | `as any` cast: `const model = prisma[type] as any;` to access Prisma models dynamically. | Use a discriminated helper with explicit overloads per entity type, or a type map: `type PrismaModelMap = { jobTitle: typeof prisma.jobTitle; ... }`. This eliminates the runtime `any` and preserves type checking on the upsert call. |
| TS-3 | Low | `src/lib/api/rate-limit.ts:35` | `(globalThis as any).__publicApiRateLimitStore` -- the only `as any` in the API layer. | Follow the pattern used elsewhere in the codebase (`const g = globalThis as unknown as { ... }`) for explicit typing. The same pattern is correctly used in `cache.ts`, `run-coordinator.ts`, and `last-used-throttle.ts`. |
| TS-4 | Low | `src/app/dashboard/automations/[id]/page.tsx:125,250` | Two `as unknown as DiscoveredJob[]` casts with comments noting structural compatibility. | Introduce a shared mapped type or extend `StagedVacancyWithAutomation` to include a type assertion helper, rather than repeating the double-cast in two locations. Alternatively, update the server action return type so no cast is needed. |
| TS-5 | Low | `src/app/dashboard/automations/[id]/page.tsx:69` | `params.id as string` -- non-null assertion on route params. | This is standard Next.js pattern for dynamic routes, but a null check before use would be safer: `if (!params.id) return null;` |
| TS-6 | Low | `src/components/scheduler/RunProgressPanel.tsx:104,148` | `t(PHASE_KEYS[phase] as Parameters<typeof t>[0])` -- type cast to satisfy the `t()` function. Used twice. | Type the `PHASE_KEYS` record values as `TranslationKey` directly. |

### 2. Error Handling

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| EH-1 | High | `src/actions/publicApiKey.actions.ts:23,28,31,39,81,119,129,132,156,165,168` | All validation and auth errors use `throw new Error("English string")`. Per project rules (MEMORY: `feedback_i18n_error_messages.md`), server action errors shown via toast MUST use i18n keys. | Replace with i18n keys: `throw new Error("api.notAuthenticated")`, `throw new Error("api.nameRequired")`, etc. The `handleError` utility passes these to the client where they are displayed in toasts. |
| EH-2 | High | `src/actions/companyBlacklist.actions.ts:21,52,109` | `message: "Not authenticated"` -- hardcoded English string returned to client in ActionResult. Same file also has `message: "Entry not found"` (line 117) and `message: "Invalid match type"` (line 56). | Use i18n keys: `message: "common.notAuthenticated"`, `message: "blacklist.entryNotFound"`, `message: "blacklist.invalidMatchType"`. The `patternRequired` and `alreadyExists` keys are already correctly using i18n keys (lines 62, 76). |
| EH-3 | Medium | `src/lib/connector/degradation.ts:84,168,247` | Notification messages are hardcoded English template strings: `Automation "${auto.name}" paused: authentication failed...`. These are persisted to the `notification` table and displayed to users. | Build notification messages using i18n keys with parameter interpolation. Since this is server-only code, use `t(locale, key)` from `@/i18n/server`. Requires resolving the user's locale from their profile or using a sensible default. |
| EH-4 | Medium | `src/app/api/scheduler/status/route.ts:60` | `session.user!.id!` -- double non-null assertion. While the null check on line 35 covers this path, the `!` bypasses TypeScript safety. | Extract to a checked variable immediately after the auth guard: `const userId = session.user.id; if (!userId) return createSSEErrorResponse("Not Authenticated");` |
| EH-5 | Low | `src/lib/connector/degradation.ts:54,89,172,252` | Multiple `catch {}` blocks with no logging. While the comments say "best-effort", silently swallowing errors in notification creation and module registration makes debugging harder. | Add at minimum a `console.warn` or `debugLog` call inside each catch block so failures are traceable. |
| EH-6 | Low | `src/hooks/use-scheduler-status.ts:53` | `catch {}` in SSE message handler silently swallows parse errors. | Add a `console.debug("[SSE] Parse error:", error)` for development-time debugging. |

### 3. Naming & DDD Ubiquitous Language

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| NM-1 | Low | `src/app/dashboard/automations/[id]/page.tsx:292,301` | Hardcoded English labels `Keywords:` and `Location:` in the automation detail header. These are not i18n keys and will display as English regardless of locale. | Replace with `{t("automations.keywords")}:` and `{t("automations.locationLabel")}:` respectively. The keys already exist and are used correctly in `AutomationList.tsx` (lines 214, 222). |
| NM-2 | Low | `src/lib/connector/cache.ts` | The LRU eviction comment says "LRU approximation via insertion order" but the implementation is actually FIFO (first-in, first-out), not LRU. `Map` preserves insertion order, not access order. Frequently accessed but old entries would be evicted first. | Rename the comment to "FIFO eviction" for accuracy, or implement true LRU by re-inserting entries on `get()` to refresh their position. The same naming issue exists in `rate-limit.ts:76`. |
| NM-3 | Low | `src/lib/scheduler/types.ts:8` | Re-export of `RunnerResult` from `@/lib/connector/job-discovery` -- the barrel re-export at line 101 is also duplicated with the import at line 8. | Remove the redundant `import` at line 8 and keep only the `export type` at line 101, or consolidate to a single import+re-export. |

### 4. Code Duplication

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| DUP-1 | Medium | `src/app/api/v1/jobs/route.ts:180-220` vs `src/app/api/v1/jobs/[id]/route.ts:192-202` | Four `findOrCreate*` helper functions in `jobs/route.ts` are duplicated as a single generic `findOrCreate` in `jobs/[id]/route.ts`. The single-job route uses a cleaner generic pattern; the list route has four separate functions that do the same thing. | Extract the generic `findOrCreate` helper from `[id]/route.ts` into a shared utility (e.g., `src/lib/api/helpers.ts`) and use it in both routes. Remove the four separate functions from `jobs/route.ts`. |
| DUP-2 | Medium | `src/app/api/v1/jobs/[id]/route.ts:14,43,162` and `src/app/api/v1/jobs/[id]/notes/route.ts:14,46` | UUID validation regex `/^[0-9a-f]{8}-...$/i` is copy-pasted across 5 locations in API routes. | Extract to a shared `isValidUUID(id: string): boolean` function in `src/lib/api/schemas.ts` (which already contains Zod schemas). Import and reuse. |
| DUP-3 | Low | `src/app/dashboard/automations/[id]/page.tsx:111,133,165,196,203` | Five separate toast calls with `title: "Error"` (hardcoded English) and varying descriptions. | Create a shared `showErrorToast(description: string)` helper or use `t("common.error")` consistently. |
| DUP-4 | Low | `src/lib/scheduler/run-coordinator.ts:132-161,308-333,348-374` | Lock release + event emission + queue removal logic is repeated in three places: `requestRun` finally block, `acknowledgeExternalStop`, and `forceReleaseLock`. | Extract a private `releaseLockAndEmit(automationId, lock, status, jobsSaved, durationMs)` method that handles cleanup, event emission, and stats consistently. |

### 5. Clean Code

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| CC-1 | Medium | `src/app/dashboard/automations/[id]/page.tsx` | The entire component is 514 lines with 12 useState hooks and 6 handler functions. This exceeds the 50-line function guideline substantially. | Extract the header section, stats card, and tab content into separate sub-components. Extract `loadData`, `executeRun`, `handleRunNow`, and `handlePauseResume` into a custom hook (e.g., `useAutomationDetail`). |
| CC-2 | Medium | `src/components/staging/StagingContainer.tsx` | 497 lines with 16 useState hooks. Contains duplicated action handler pattern (handleDismiss, handleRestore, handleArchive, handleTrash, handleRestoreFromTrash all follow identical try/success/error pattern). | Extract the 5 nearly-identical action handlers into a generic `handleAction(actionFn, successKey)` wrapper. Extract the complex tab/search/pagination logic into a custom hook. |
| CC-3 | Low | `src/app/api/v1/jobs/[id]/route.ts:41-155` | PATCH handler is 115 lines with deeply nested field-by-field mapping logic. | Group the field mapping into a `buildUpdateData(updates, userId)` helper function to reduce the handler's cognitive complexity. |
| CC-4 | Low | `src/components/staging/DeckView.tsx:163-209` | The drag handler and overlay calculation contains 3 levels of ternary nesting for determining which overlay to show. | Extract the overlay determination into a `getActiveOverlay(rightOverlay, leftOverlay, upOverlay)` helper function that returns `{className, icon}`. |

### 6. i18n Compliance

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| I18N-1 | High | `src/app/dashboard/automations/[id]/page.tsx:111,133,165,196,203` | Five toast calls use hardcoded `title: "Error"` instead of a translated string. | Replace with `title: t("common.error")`. |
| I18N-2 | High | `src/app/dashboard/automations/[id]/page.tsx:112` | Hardcoded English fallback: `"Automation not found"`. | Replace with `t("automations.notFound")`. Add the key to all 4 locales if missing. |
| I18N-3 | High | `src/app/dashboard/automations/[id]/page.tsx:292,301` | `Keywords:` and `Location:` are hardcoded English labels in the detail page header. | Replace with translated keys as noted in NM-1. |
| I18N-4 | Medium | `src/lib/connector/degradation.ts:84,168,247` | Notification messages stored in DB are hardcoded English. Users in DE/FR/ES locales will see English notifications. | Use i18n-aware notification message construction as noted in EH-3. |
| I18N-5 | Medium | `src/components/settings/CompanyBlacklistSettings.tsx:115-118` | Only "contains" and "exact" match types are shown in the Select dropdown, but the server action accepts all 4 types ("exact", "contains", "starts_with", "ends_with"). | Either add SelectItem entries for "starts_with" and "ends_with" with proper translations, or document that these are API-only match types. Currently the UI and server contract are misaligned. |
| I18N-6 | Low | `src/components/settings/CompanyBlacklistSettings.tsx:163-165` | Match type display only handles "exact" and "contains" in the entry list. If a "starts_with" or "ends_with" entry exists (added via API or future UI), it would display incorrectly. | Add handling for all 4 match types in both the Select and the display logic. |
| I18N-7 | Low | `src/components/automations/RunHistoryList.tsx:108` | `run.status.replace("_", " ")` displays raw status values like "completed with errors" without translation. | Map status values through i18n keys (e.g., `t("automations.status." + run.status)`). |

### 7. Security Observations

| # | Severity | File:Line | Description | Recommended Fix |
|---|----------|-----------|-------------|-----------------|
| SEC-1 | Medium | `src/app/api/v1/jobs/[id]/route.ts:175` | `await prisma.interview.deleteMany({ where: { jobId } })` -- the interview deletion uses only `jobId` without `userId` filter. While the parent job was already ownership-checked, a defense-in-depth approach would include the userId. | Add `userId` to the `where` clause or join through the job relation: `{ where: { jobId, job: { userId } } }`. |
| SEC-2 | Low | `src/lib/api/auth.ts:29-33` | The "constant-time evaluation" comment claims to prevent timing oracles, but `findUnique` already reveals key existence through response time (DB query vs. no query). The constant-time logic after the DB call provides minimal additional protection. | Consider using `timingSafeEqual` from crypto for hash comparison if true timing resistance is needed. The current approach is acceptable for the threat model (self-hosted). |
| SEC-3 | Low | `src/lib/connector/cache.ts:258-263` | Cache singleton only survives HMR in non-production via the `if (process.env.NODE_ENV !== "production")` guard. In production, a new `ConnectorCache` is created but never assigned to `globalThis`. | This is intentional for HMR but the inline ternary pattern (`globalThis[GLOBAL_KEY] ?? new ConnectorCache()`) means production gets a new instance per module load. If the module is loaded once per process lifetime (normal), this is fine. Document the intention. |

---

## Part 2: Testing Coverage Gaps

### Test Coverage Matrix

| Source File | Test File | Status | Notes |
|---|---|---|---|
| `src/lib/connector/degradation.ts` | `__tests__/degradation.spec.ts` | COVERED | Tests all 3 escalation rules + recovery |
| `src/lib/scheduler/run-coordinator.ts` | `__tests__/run-coordinator.spec.ts` | COVERED | Tests mutex, double-run, events, lifecycle |
| `src/lib/scheduler/types.ts` | (type-only, no test needed) | N/A | Pure type definitions |
| `src/lib/events/event-types.ts` | (type-only + `createEvent`) | PARTIAL | `createEvent` is exercised in run-coordinator tests |
| `src/lib/events/consumers/degradation-coordinator.ts` | `__tests__/degradation-coordinator.spec.ts` | COVERED | |
| `src/lib/events/consumers/index.ts` | (registration barrel, no logic) | N/A | |
| `src/lib/constants.ts` | `__tests__/constants.spec.ts` | COVERED | |
| `src/components/automations/RunStatusBadge.tsx` | `__tests__/RunStatusBadge.spec.tsx` | COVERED | |
| `src/components/scheduler/SchedulerStatusBar.tsx` | `__tests__/SchedulerStatusBar.spec.tsx` | COVERED | |
| `src/components/scheduler/RunProgressPanel.tsx` | `__tests__/RunProgressPanel.spec.tsx` | COVERED | |
| `src/components/automations/ModuleBusyBanner.tsx` | `__tests__/ModuleBusyBanner.spec.tsx` | COVERED | |
| `src/components/automations/AutomationList.tsx` | **NONE** | MISSING | No component test exists |
| `src/components/automations/RunHistoryList.tsx` | **NONE** | MISSING | No component test exists |
| `src/components/staging/StagingContainer.tsx` | `__tests__/StagingContainerBanner.spec.tsx` | PARTIAL | Only tests the "new items available" banner |
| `src/app/api/scheduler/status/route.ts` | `__tests__/scheduler-status-route.spec.ts` | COVERED | Tests auth, filtering, diff optimization |
| `src/hooks/use-scheduler-status.ts` | `__tests__/use-scheduler-status.spec.ts` | COVERED | |
| `src/actions/companyBlacklist.actions.ts` | `__tests__/companyBlacklist.actions.spec.ts` | COVERED | |
| `src/components/settings/CompanyBlacklistSettings.tsx` | **NONE** | MISSING | No component test exists |
| `src/lib/connector/cache.ts` | `__tests__/connectorCache.spec.ts` | COVERED | Tests LRU, TTL, coalescing, stale-if-error |
| `src/components/staging/DeckCard.tsx` | `__tests__/DeckCard.spec.tsx` | COVERED | |
| `src/components/staging/DeckView.tsx` | `__tests__/DeckView.spec.tsx` | COVERED | |
| `src/components/staging/ViewModeToggle.tsx` | `__tests__/ViewModeToggle.spec.tsx` | COVERED | |
| `src/lib/api/auth.ts` | **NONE** | MISSING | No unit test for validateApiKey, hashApiKey, generateApiKey |
| `src/lib/api/rate-limit.ts` | **NONE** | MISSING | No unit test for sliding window logic |
| `src/lib/api/response.ts` | `__tests__/public-api-response.spec.ts` | COVERED | Tests all response helpers |
| `src/lib/api/with-api-auth.ts` | **NONE** | MISSING | No integration test for the HOF wrapper |
| `src/lib/api/schemas.ts` | (Zod schemas, self-validating) | PARTIAL | Exercised indirectly through route tests, but no dedicated schema test |
| `src/app/api/v1/jobs/route.ts` | **NONE** | MISSING | No route handler test |
| `src/app/api/v1/jobs/[id]/route.ts` | **NONE** | MISSING | No route handler test |
| `src/app/api/v1/jobs/[id]/notes/route.ts` | **NONE** | MISSING | No route handler test |
| `src/actions/publicApiKey.actions.ts` | `__tests__/public-api-key-actions.spec.ts` | COVERED | Tests CRUD + validation |
| `src/components/settings/PublicApiKeySettings.tsx` | **NONE** | MISSING | No component test exists |
| `src/lib/api/last-used-throttle.ts` | **NONE** | MISSING | No unit test for throttle logic |
| `src/i18n/dictionaries/automations.ts` | `__tests__/dictionaries.spec.ts` | COVERED | Key consistency across 4 locales |
| `src/app/dashboard/automations/[id]/page.tsx` | **NONE** | MISSING | No component/page test exists |

### Critical Test Gaps

| # | Severity | File | What Is Missing | Impact |
|---|----------|------|-----------------|--------|
| TG-1 | Critical | `src/lib/api/auth.ts` | No unit tests for `validateApiKey`, `extractApiKey`, `hashApiKey`, `generateApiKey`, `getKeyPrefix`. This is the authentication gate for the entire Public API. | A regression in key validation, hash comparison, or extraction logic would silently break or compromise all API authentication. Key scenarios to test: valid Bearer token, valid X-API-Key, missing key, revoked key, malformed header, hash stability. |
| TG-2 | Critical | `src/lib/api/rate-limit.ts` | No unit tests for `checkRateLimit`. This protects against DoS and abuse. | Regressions in sliding window logic, cleanup, or the MAX_STORE_SIZE cap would go undetected. Key scenarios: within limit, at limit, over limit, window expiry, cleanup behavior, store size cap. The file even exports `resetRateLimitStore` specifically for testing. |
| TG-3 | Critical | `src/lib/api/with-api-auth.ts` | No integration test for the HOF wrapper that combines CORS + auth + rate limiting + error catching. | This is the security perimeter for all `/api/v1/*` routes. Missing tests mean CORS header behavior, the two-tier rate limiting (IP then key), and error sanitization are untested as a composed unit. |
| TG-4 | High | `src/app/api/v1/jobs/route.ts`, `[id]/route.ts`, `[id]/notes/route.ts` | No route handler tests for any of the 8 API endpoints (GET/POST jobs, GET/PATCH/DELETE jobs/:id, GET/POST jobs/:id/notes, OPTIONS). | The Public API has zero functional tests. IDOR protection, Zod validation, relation resolution (findOrCreate), tag/resume ownership checks, and pagination logic are all untested at the route level. |
| TG-5 | High | `src/lib/api/last-used-throttle.ts` | No unit test despite exporting `resetLastUsedThrottle()` for testing. | Throttle bypass bugs would cause either DB write storms (every request) or stale lastUsedAt (never updated). Key scenarios: first call returns true, call within window returns false, call after window returns true, LRU eviction. |
| TG-6 | Medium | `src/components/automations/AutomationList.tsx` | No component test. This is the main list view for automations with pause/resume/delete actions. | Rendering of pause reasons, status badges, dropdown actions, and the delete confirmation dialog are untested. |
| TG-7 | Medium | `src/components/automations/RunHistoryList.tsx` | No component test. Renders run history with status icons and duration calculations. | The duration calculation logic (`completedAt - startedAt`) and status config mapping are untested. |
| TG-8 | Medium | `src/components/settings/CompanyBlacklistSettings.tsx` | No component test for the blacklist management UI. | Add/remove entry flow, form validation, and match type display are untested. |
| TG-9 | Medium | `src/components/settings/PublicApiKeySettings.tsx` | No component test for the API key management UI (449 lines). | Key creation flow, the "shown once" dialog, revoke/delete confirmations, and clipboard copy are untested. |
| TG-10 | Medium | `src/app/dashboard/automations/[id]/page.tsx` | No page test for the automation detail page (514 lines). | The entire data loading flow, tab rendering, conflict detection, and run execution path are untested. |
| TG-11 | Low | `src/components/staging/StagingContainer.tsx` | Only partial test coverage (banner only). Missing: tab switching, pagination, search, deck/list mode toggle, bulk selection, action handlers. | The staging container is a central UI component with complex state. Only the "new items available" banner has test coverage. |
| TG-12 | Low | `src/lib/api/schemas.ts` | No dedicated schema tests. | While Zod schemas are self-documenting, explicit tests for edge cases (max lengths, empty strings, invalid UUIDs, datetime parsing) would catch regressions. The schemas define the Public API contract. |

### Test Quality Observations

| # | Severity | File | Observation |
|---|----------|------|-------------|
| TQ-1 | Low | `__tests__/run-coordinator.spec.ts` | Good quality: typed mocks, clear fixtures, tests mutex invariant, event payloads, and lifecycle. Uses `testFixtures.ts` for reusable data. |
| TQ-2 | Low | `__tests__/degradation.spec.ts` | Good quality: tests all 3 escalation rules with proper mock setup. Tests TOCTOU-safe query pattern. |
| TQ-3 | Low | `__tests__/connectorCache.spec.ts` | Good quality: tests buildKey permutations, TTL expiry, LRU eviction, request coalescing, stale-if-error, and bypass mode. |
| TQ-4 | Low | `__tests__/public-api-response.spec.ts` | Good quality: tests all response helpers including error status inference and message sanitization. |
| TQ-5 | Low | `__tests__/public-api-key-actions.spec.ts` | Adequate: tests CRUD operations but mocks are relatively shallow. Does not test the `handleError` integration path with real error objects. |
| TQ-6 | Low | `__tests__/scheduler-status-route.spec.ts` | Good quality: tests auth guard, per-user filtering (M-1 security), and diff optimization. |

---

## Summary Statistics

| Category | Critical | High | Medium | Low | Total |
|----------|----------|------|--------|-----|-------|
| TypeScript Strictness | 0 | 0 | 2 | 4 | 6 |
| Error Handling | 0 | 2 | 2 | 2 | 6 |
| Naming / DDD | 0 | 0 | 0 | 3 | 3 |
| Code Duplication | 0 | 0 | 2 | 2 | 4 |
| Clean Code | 0 | 0 | 2 | 2 | 4 |
| i18n Compliance | 0 | 3 | 2 | 2 | 7 |
| Security | 0 | 0 | 1 | 2 | 3 |
| **Testing Gaps** | **3** | **2** | **5** | **2** | **12** |
| **TOTAL** | **3** | **7** | **16** | **19** | **45** |

## Priority Action Items

### Immediate (Critical)

1. **Write tests for `src/lib/api/auth.ts`** -- The Public API authentication gate has zero test coverage. Test key extraction, hash stability, revoked key rejection, and header parsing.
2. **Write tests for `src/lib/api/rate-limit.ts`** -- The rate limiter protecting against DoS has zero test coverage. Test sliding window, cleanup, and capacity limits.
3. **Write tests for `src/lib/api/with-api-auth.ts`** -- The security perimeter composing CORS + auth + rate limiting is untested as a unit.

### Next Sprint (High)

4. **Write route handler tests for all `/api/v1/` endpoints** -- 8 endpoints with zero functional test coverage. Prioritize PATCH (complex field mapping) and POST (relation resolution).
5. **Write test for `src/lib/api/last-used-throttle.ts`** -- Simple utility with clear test contract and exported reset function.
6. **Fix hardcoded English strings in `publicApiKey.actions.ts`** (EH-1) -- 11 `throw new Error("English")` calls that violate the i18n error message rule.
7. **Fix hardcoded English strings in `companyBlacklist.actions.ts`** (EH-2) -- 3 hardcoded English messages.
8. **Fix hardcoded "Error" toast titles in automation detail page** (I18N-1, I18N-2, I18N-3) -- 5 instances plus 2 hardcoded labels.

### Subsequent Sprint (Medium)

9. Write component tests for `AutomationList.tsx`, `RunHistoryList.tsx`, `CompanyBlacklistSettings.tsx`, and `PublicApiKeySettings.tsx`.
10. Extract duplicate `findOrCreate` helpers from API routes into shared utility (DUP-1).
11. Extract duplicate UUID validation into shared function (DUP-2).
12. Refactor large components: `AutomationDetailPage` (514 lines) and `StagingContainer` (497 lines) by extracting custom hooks (CC-1, CC-2).
13. Fix notification messages in `degradation.ts` to use i18n (I18N-4).
14. Align `CompanyBlacklistSettings.tsx` UI with server-side match type support (I18N-5).
