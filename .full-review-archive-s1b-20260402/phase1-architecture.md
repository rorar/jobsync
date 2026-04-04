# Phase 1: Architecture Review

**Reviewer:** Architecture Agent (Opus 4.6)
**Date:** 2026-04-01
**Scope:** 34 files across Sprint A, Sprint B, Sprint C (Tracks 1-3)
**Checks:** Aggregate Boundaries, ACL Compliance, Event Structure, Component Boundaries, Dependency Direction, DDD Ubiquitous Language, Singleton Pattern

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 5     |
| Medium   | 9     |
| Low      | 6     |
| **Total** | **22** |

Overall the architecture is well-structured. The Event Bus, RunCoordinator, and Public API layers follow clean separation of concerns. The most pressing issues are the ConnectorCache singleton failing in production (Critical), the degradation module bypassing IDOR ownership on a Prisma query (Critical), and systematic hardcoded English strings in server actions and UI toast titles that violate the project's i18n mandate.

---

## Critical Findings

### C-1. ConnectorCache singleton does NOT survive production restarts

**File:** `src/lib/connector/cache.ts:258-263`
**Category:** Singleton Pattern

The cache singleton is only assigned to `globalThis` when `NODE_ENV !== "production"`:

```ts
export const connectorCache: ConnectorCache =
  globalThis[GLOBAL_KEY] ?? new ConnectorCache();

if (process.env.NODE_ENV !== "production") {
  globalThis[GLOBAL_KEY] = connectorCache;
}
```

In development, `globalThis` assignment ensures HMR survival. In production, the `globalThis` assignment never executes. This means every module import of `cache.ts` creates a fresh `ConnectorCache()` instance because `globalThis[GLOBAL_KEY]` is always `undefined`. Request coalescing, hit/miss statistics, and LRU state will not be shared across import boundaries.

Compare with RunCoordinator (`src/lib/scheduler/run-coordinator.ts:409-411`) and EventBus (`src/lib/events/event-bus.ts:92-94`), which both unconditionally assign to `globalThis`.

**Recommended fix:** Remove the `if (process.env.NODE_ENV !== "production")` guard. Always assign to `globalThis`, matching the pattern used by RunCoordinator and EventBus:

```ts
const g = globalThis as unknown as { [GLOBAL_KEY]?: ConnectorCache };
if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new ConnectorCache();
export const connectorCache = g[GLOBAL_KEY];
```

---

### C-2. degradation.ts `checkConsecutiveRunFailures` uses `findUnique` without userId -- IDOR violation

**File:** `src/lib/connector/degradation.ts:144-146`
**Category:** Aggregate Boundaries / Security (ADR-015)

```ts
const automation = await prisma.automation.findUnique({
  where: { id: automationId },
  select: { status: true, name: true, userId: true },
});
```

Per ADR-015 and the project's Security Rules: "All Prisma reads/writes MUST include userId in the where clause. Never query by resource ID alone." Additionally, "`findFirst` replaces `findUnique` when adding userId filter (Prisma constraint)."

This function is server-only (has `import "server-only"`) and is called from the runner with a known `automationId`, so the practical exploit risk is limited. However, it violates the established architectural invariant that every Prisma query includes ownership scoping. The preceding `recentRuns` query at line 124 also queries `automationRun` by `automationId` alone without userId.

This is a system-internal function, not a server action, so the IDOR risk is theoretical. Still, it breaks the invariant that should hold project-wide. The `handleAuthFailure` and `handleCircuitBreakerTrip` functions query `automation.findMany` by `jobBoard` without `userId` (lines 60-66, 222-229), but this is correct because they intentionally affect all users' automations for that module.

**Recommended fix:** Since `checkConsecutiveRunFailures` operates on a single automation, pass `userId` from the caller and use `findFirst` with `{ id: automationId, userId }`. This also adds defense-in-depth against a corrupted automationId.

---

## High Findings

### H-1. Hardcoded English toast titles in AutomationDetailPage

**File:** `src/app/dashboard/automations/[id]/page.tsx:111,133,165,196,203`
**Category:** DDD Ubiquitous Language / i18n

Five toast calls use a hardcoded English string `"Error"` as the title:

- Line 111: `title: "Error"` (load failure)
- Line 133: `title: "Error"` (catch block)
- Line 165: `title: "Error"` (pause/resume failure)
- Line 196: `title: "Error"` (run failure)
- Line 203: `title: "Error"` (run exception)

Additionally, line 112 has a hardcoded fallback `"Automation not found"`.

Per CLAUDE.md: "CRITICAL: Every UI string must be translated." These should use `t("common.error")` or an appropriate i18n key.

**Recommended fix:** Replace all `title: "Error"` with `title: t("common.error")` and `"Automation not found"` with `t("automations.notFound")`.

---

### H-2. publicApiKey.actions.ts uses hardcoded English throw messages exposed to users

**File:** `src/actions/publicApiKey.actions.ts:23,28,31,39,129,132,165,168`
**Category:** i18n / DDD Ubiquitous Language

This `"use server"` file throws English error strings that propagate through `handleError()` and appear in toast messages:

- `"Not authenticated"` (lines 23, 81, 119, 156)
- `"Please provide a name for the API key"` (line 28)
- `"API key name must be 100 characters or less"` (line 31)
- `"Maximum of 10 active API keys per user"` (line 39)
- `"API key not found"` (lines 129, 165)
- `"API key is already revoked"` (line 132)
- `"API key must be revoked before it can be deleted"` (line 168)

Per the project's memory (`feedback_i18n_error_messages.md`): "All throw new Error() and result.message in server actions MUST use i18n keys, not hardcoded English."

**Recommended fix:** Replace with i18n key strings from the `api` namespace (e.g., `throw new Error("api.notAuthenticated")`), or switch to returning `ActionResult` with i18n key messages instead of throwing.

---

### H-3. companyBlacklist.actions.ts has mixed i18n compliance

**File:** `src/actions/companyBlacklist.actions.ts:21,52,56,109,117`
**Category:** i18n

Some messages use i18n keys correctly (`"blacklist.patternRequired"`, `"blacklist.alreadyExists"`), while others use hardcoded English:

- Line 21: `"Not authenticated"` (hardcoded English)
- Line 52: `"Not authenticated"` (hardcoded English)
- Line 56: `"Invalid match type"` (hardcoded English)
- Line 109: `"Not authenticated"` (hardcoded English)
- Line 117: `"Entry not found"` (hardcoded English)

This inconsistency within the same file suggests the i18n refactoring was partial.

**Recommended fix:** Replace all hardcoded English strings with i18n keys: `"common.notAuthenticated"`, `"blacklist.invalidMatchType"`, `"blacklist.entryNotFound"`.

---

### H-4. Degradation notification messages are hardcoded English

**File:** `src/lib/connector/degradation.ts:84,168,247`
**Category:** i18n / DDD Ubiquitous Language

The `Notification` records persisted to the database contain hardcoded English messages:

- Line 84: `Automation "${auto.name}" paused: authentication failed for module "${registered.manifest.name}". Please check your credentials.`
- Line 168: `Automation "${automation.name}" paused after ${CONSECUTIVE_RUN_FAILURE_THRESHOLD} consecutive failed runs.`
- Line 247: `Automation "${auto.name}" paused: module "${registered.manifest.name}" circuit breaker tripped ${newFailureCount} times.`

These are persisted notifications shown in the UI. Unlike transient toast messages, DB-stored messages cannot be translated client-side because the locale is unknown at persistence time.

**Recommended fix:** Store structured data (`{ type, moduleId, automationName, threshold }`) in the notification record and render the translated message client-side using i18n keys. Alternatively, store a message template key with parameters as JSON.

---

### H-5. event-types.ts creates a tight import coupling between events and scheduler layers

**File:** `src/lib/events/event-types.ts:10`
**Category:** Dependency Direction

```ts
import type { RunSource } from "@/lib/scheduler/types";
```

And `src/lib/events/consumers/degradation-coordinator.ts:13`:
```ts
import { runCoordinator } from "@/lib/scheduler/run-coordinator"
```

The Event Bus (`src/lib/events/`) imports types from the Scheduler (`src/lib/scheduler/`), and the Scheduler imports from Events. While this is a type-only import in `event-types.ts` (no runtime circular dependency risk), it creates a bidirectional conceptual dependency between the Event Bus (shared infrastructure) and the Scheduler (application service).

The consumer registration (degradation-coordinator importing runCoordinator) is architecturally expected -- consumers bridge between subsystems. However, the type import in the core event-types definition file couples the event vocabulary to the scheduler's domain types.

**Recommended fix:** Define `RunSource` as a union type directly in `event-types.ts` (it is already just `"scheduler" | "manual"`). This makes the Event Bus types self-contained. The consumer coupling is acceptable and follows the intended bridge pattern.

---

## Medium Findings

### M-1. AutomationDetailPage `as unknown as DiscoveredJob` type casts

**File:** `src/app/dashboard/automations/[id]/page.tsx:125,250`
**Category:** ACL Compliance / Type Safety

Two `as unknown as DiscoveredJob` casts bypass type safety:

```ts
setJobs(jobsResult.data as unknown as DiscoveredJob[]);      // line 125
setSelectedJob(result.data as unknown as DiscoveredJob);      // line 250
```

The comments explain these are structurally compatible (`StagedVacancyWithAutomation` vs `DiscoveredJob`), but `as unknown as T` silences all type checking. If either type drifts, this will produce silent runtime errors.

**Recommended fix:** Create a shared interface or use a mapping function. If they are truly structurally compatible, a simple type assertion `as DiscoveredJob[]` (without `unknown`) would at least catch incompatible fields. Best practice: define a `toDiscoveredJob(sv: StagedVacancyWithAutomation): DiscoveredJob` mapper in the ACL layer.

---

### M-2. RunStatusBadge module-level mutable state outside React lifecycle

**File:** `src/components/automations/RunStatusBadge.tsx:11-28`
**Category:** Component Boundaries

The shared tick interval mechanism (`tickListeners`, `tickInterval`) uses module-level mutable state. This is well-implemented (single interval for N badge instances), but:

1. The `Set` and `setInterval` references are module-level, not `globalThis`-backed, so they will be duplicated if the module is evaluated more than once (e.g., different chunks).
2. The cleanup function in `subscribeToTick` uses a closure but does not guard against double-unsubscribe.

This is a minor concern given the current architecture (single chunk likely). The performance optimization (shared timer) is sound.

**Recommended fix:** Consider moving to `globalThis` pattern for consistency, or document why module-level is sufficient for this client-side component.

---

### M-3. SSE route does not validate user.id type

**File:** `src/app/api/scheduler/status/route.ts:60`
**Category:** Security

```ts
const userId = session.user!.id!;
```

Double non-null assertion. While `auth()` is checked at line 35, the `!` assertion suppresses TypeScript's null checking. If `session.user` or `session.user.id` is unexpectedly undefined (e.g., malformed session), this would throw an unhandled exception instead of returning a clean error.

**Recommended fix:** Add explicit validation: `const userId = session.user?.id; if (!userId) return createSSEErrorResponse("Invalid session");`

---

### M-4. Public API v1 jobs route bypasses Job Aggregate actions

**File:** `src/app/api/v1/jobs/route.ts`, `src/app/api/v1/jobs/[id]/route.ts`
**Category:** Aggregate Boundaries

Per CLAUDE.md: "Job Aggregate: Job + Notes + Tags + Status (modify together via job.actions.ts)". The v1 API routes use direct Prisma queries instead of the `job.actions.ts` repository. This is acknowledged in CLAUDE.md ("Phase 1 uses direct Prisma queries because getCurrentUser() depends on NextAuth session"), but it means:

1. Any business logic in `job.actions.ts` (validation, side effects, event emission) is not applied to API-created jobs.
2. The Job Aggregate has two entry points with potentially divergent behavior.

This is a known architectural debt documented for Phase 2 resolution. No action needed now, but tracking here for completeness.

**Recommended fix:** Phase 2 should introduce the `AsyncLocalStorage` bridge as planned, then route API handlers through the same aggregate actions.

---

### M-5. ConnectorCache eviction is FIFO, not LRU

**File:** `src/lib/connector/cache.ts:240-245`
**Category:** Quality Attributes

The `evictOldest()` method evicts by Map insertion order (FIFO). However, `get()` does not re-insert on access, so frequently accessed items can still be evicted. The class comment says "LRU approximation" but the implementation is strictly FIFO.

For the current use case (500 entries, moderate traffic), this is acceptable. Under high load with skewed access patterns, hot entries could be evicted prematurely.

**Recommended fix:** On `get()` hit, delete and re-insert the entry to move it to the end of Map iteration order. This makes eviction true LRU with no additional data structures.

---

### M-6. Rate limiter store uses `any` cast for globalThis

**File:** `src/lib/api/rate-limit.ts:34-35`
**Category:** Singleton Pattern

```ts
const store: Map<string, RateLimitEntry> =
  (globalThis as any).__publicApiRateLimitStore ??= new Map<string, RateLimitEntry>();
```

Unlike RunCoordinator, EventBus, and last-used-throttle which use the `const g = globalThis as unknown as { ... }` typed pattern, the rate limiter uses `any`. This bypasses type checking.

**Recommended fix:** Use the same typed globalThis pattern as other singletons:
```ts
const g = globalThis as unknown as { __publicApiRateLimitStore?: Map<string, RateLimitEntry> };
if (!g.__publicApiRateLimitStore) g.__publicApiRateLimitStore = new Map();
const store = g.__publicApiRateLimitStore;
```

---

### M-7. `withApiAuth` CORS wildcard is safe but should be documented in ADR

**File:** `src/lib/api/with-api-auth.ts:13-18`
**Category:** Security Architecture

`Access-Control-Allow-Origin: *` is used with the rationale that auth is via API key, not cookies. This is correct for the current architecture. However, if the API ever adds cookie-based session auth (e.g., for the planned Phase 2 AsyncLocalStorage bridge), the wildcard would create a CSRF vector.

The inline comment explains the rationale, which is good. An ADR would provide stronger architectural protection against future regressions.

**Recommended fix:** Document in an ADR that wildcard CORS is intentional and MUST be re-evaluated if cookie/session-based auth is added to `/api/v1/*`.

---

### M-8. `response.ts` error status inference relies on string matching

**File:** `src/lib/api/response.ts:118-133`
**Category:** ACL Compliance

The `inferErrorStatus()` function maps error messages to HTTP status codes by pattern-matching against lowercase strings:

```ts
if (lower.includes("not authenticated") || lower.includes("not authorized")) return 401;
if (lower.includes("not found")) return 404;
```

This is fragile -- any message containing "not found" (e.g., "Job description not found to be relevant") would incorrectly return 404. The function serves as a translation layer between internal ActionResult messages and the API surface, but the mapping is implicit rather than explicit.

**Recommended fix:** Use an explicit error code field on ActionResult (e.g., `errorCode: "NOT_FOUND" | "UNAUTHORIZED" | "VALIDATION_ERROR"`) instead of inferring from message text. This is a larger refactoring, so in the short term, consider tightening the patterns (e.g., exact match on known error messages).

---

### M-9. useSchedulerStatus `isConnected` reads module-level variable, not reactive state

**File:** `src/hooks/use-scheduler-status.ts:188`
**Category:** Component Boundaries

```ts
return {
  isConnected: isSharedConnected,
  ...
};
```

`isSharedConnected` is a module-level boolean that is not tracked via React state. Components reading `isConnected` will get a stale value because changes to this boolean do not trigger re-renders. The hook correctly uses `useState` for `state` (via the listener pattern), but `isConnected` is a snapshot from render time, not a reactive value.

**Recommended fix:** Either include `isConnected` in the shared state notifications (notify listeners when connection status changes) or remove it from the public API if it is not used. Currently no reviewed component reads `isConnected`, so this is a latent issue.

---

## Low Findings

### L-1. `AutomationList.tsx` uses `as any` for translation key type

**File:** `src/components/automations/AutomationList.tsx:193,198`
**Category:** DDD Ubiquitous Language / Type Safety

```ts
{t(PAUSE_REASON_KEYS[automation.pauseReason] as any)}
```

The `PAUSE_REASON_KEYS` map returns `string`, but `t()` expects `TranslationKey`. Using `as any` silences the type checker. If a key is misspelled, it will fail silently at runtime.

**Recommended fix:** Type `PAUSE_REASON_KEYS` as `Record<AutomationPauseReason, TranslationKey>` and import `TranslationKey` from `@/i18n`.

---

### L-2. `RunProgressPanel.tsx` uses `as Parameters<typeof t>[0]` cast

**File:** `src/components/scheduler/RunProgressPanel.tsx:104,149`
**Category:** Type Safety

```ts
{t(PHASE_KEYS[phase] as Parameters<typeof t>[0])}
```

Same pattern as L-1 but with a more explicit cast. The `PHASE_KEYS` record should be typed as `Record<RunPhase, TranslationKey>`.

**Recommended fix:** Type the record with `TranslationKey` and remove the cast.

---

### L-3. `ViewModeToggle` aria-label uses wrong key

**File:** `src/components/staging/ViewModeToggle.tsx:30`
**Category:** Accessibility

```tsx
<div ... role="radiogroup" aria-label={t("deck.viewModeList")}>
```

The radiogroup's aria-label says "List" regardless of the current mode. It should describe the group purpose, not one option.

**Recommended fix:** Use a dedicated key like `t("deck.viewModeLabel")` or `t("staging.viewMode")` that describes the purpose of the toggle (e.g., "View mode").

---

### L-4. DeckCard string replacement pattern instead of interpolation

**File:** `src/components/staging/DeckCard.tsx:188`, `src/components/staging/DeckView.tsx:119-121,143-144,297-308`
**Category:** i18n

Multiple `.replace("{name}", ...)` calls for string interpolation. While functional, this pattern is fragile (case-sensitive, no type checking on placeholders). The project's i18n system may support interpolation natively.

**Recommended fix:** If the i18n adapter supports parameterized translations, migrate to that. Otherwise, document this as the standard interpolation pattern.

---

### L-5. `StagingContainer` imports `addBlacklistEntry` directly -- cross-aggregate call

**File:** `src/components/staging/StagingContainer.tsx:19`
**Category:** Aggregate Boundaries

```ts
import { addBlacklistEntry } from "@/actions/companyBlacklist.actions";
```

The StagingContainer (part of the Vacancy Pipeline) directly calls a Blacklist action. Per DDD aggregate boundaries, the staging component should only interact with `stagedVacancy.actions.ts`. The blacklist entry creation is a secondary action triggered from the staging UI.

This is a pragmatic cross-aggregate call from the UI layer (not domain layer), which is acceptable in a monolith. The server action enforces ownership correctly. Noting for awareness only.

**Recommended fix:** No immediate action needed. If the Blacklist Aggregate grows in complexity, consider using a domain event (`CompanyBlockRequested`) instead of a direct call.

---

### L-6. `DeckView` keyboard hints not wired to actions

**File:** `src/components/staging/DeckView.tsx:262-290`
**Category:** Component Boundaries

The keyboard hints section displays key bindings (D, P, S, Z) but the actual keyboard handler is implemented in the `useDeckStack` hook (not in the reviewed file set). The visual hints and the actual bindings could drift. No finding on correctness -- just noting the separation.

**Recommended fix:** Consider co-locating the key binding definitions with the hint display, or defining the bindings as a shared constant.

---

## Positive Observations

The following aspects of the architecture are well-executed and worth preserving:

1. **Event Bus design** (`event-types.ts`, `event-bus.ts`) -- Discriminated union with `EventPayloadMap` provides excellent type safety. The `createEvent()` constructor enforces correct payload shapes at the call site.

2. **RunCoordinator lock management** -- The try/finally pattern with `acknowledgeExternalStop` guard (H-1 fix) correctly handles the race between degradation events and normal run completion. The watchdog timer prevents stale locks.

3. **SSE user-scoped filtering** (`/api/scheduler/status/route.ts:61-79`) -- Filtering scheduler state to the authenticated user's automations prevents information disclosure. The diff-based skip (`if (json === lastSentJson) return`) reduces unnecessary SSE traffic.

4. **Public API `withApiAuth` HOF** -- Clean layering of CORS, IP rate limit, auth, per-key rate limit, and error catch. Pre-auth IP rate limiting (ADR-019) is correctly positioned before the `validateApiKey` call.

5. **IDOR prevention in API v1 routes** -- All job queries include `userId` in the where clause. Resume and tag ownership validation in POST/PATCH handlers prevents cross-user resource access.

6. **Consumer registration guard** (`events/consumers/index.ts:13-17`) -- The `globalThis.__eventConsumersRegistered` guard correctly prevents double-registration across HMR reloads.

7. **Degradation TOCTOU prevention** (`degradation.ts:58-70, 221-229`) -- Querying affected automation IDs before `updateMany` and then updating by captured IDs prevents time-of-check/time-of-use races.

8. **API key security** (`auth.ts`) -- SHA-256 hashing, timing-safe evaluation comment, throttled `lastUsedAt` writes, and the `shouldWriteLastUsedAt` utility all demonstrate security-conscious design.

9. **useSchedulerStatus stateRef pattern** (`use-scheduler-status.ts:140-141`) -- Using a ref for stable callback identity prevents re-render cascades from SSE updates. This is a thoughtful performance optimization.

---

## Dependency Direction Summary

The dependency graph flows correctly inward:

```
UI Components (Sprint B)
  -> Hooks (use-scheduler-status)
    -> Types (scheduler/types)
  -> Actions (automation.actions, stagedVacancy.actions, companyBlacklist.actions)
    -> Domain Models
    -> Prisma (lib/db)

SSE Route (api/scheduler/status)
  -> RunCoordinator (lib/scheduler)
  -> Auth (auth.ts)

API v1 Routes (Sprint C Track 3)
  -> withApiAuth (lib/api)
  -> Prisma (lib/db)
  -> Zod Schemas (lib/api/schemas)

Events Layer (Sprint A)
  -> EventBus (lib/events/event-bus)
  -> Consumers -> RunCoordinator (bridge, expected)
  -> event-types -> scheduler/types (type-only, see H-5)

Degradation (Sprint A)
  -> Prisma (lib/db)
  -> EventBus (lib/events)
  -> ModuleRegistry (lib/connector/registry)
```

No runtime circular dependencies detected. The type-level coupling between events and scheduler (H-5) is the only bidirectional dependency and is not a runtime concern.
