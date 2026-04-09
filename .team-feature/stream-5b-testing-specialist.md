# Sprint 2 Testing Specialist Validation

## Purpose
Validation run — specialized `pr-review-toolkit:pr-test-analyzer` (testing-dimension expert) vs baseline `.team-feature/stream-5b-testing.md` (generic `agent-teams:team-reviewer`). Scope: commits `a92aaf3..HEAD` (HEAD = dc48f4b), 129 files, ~14k lines, Sprint 0 + Sprint 1 CRIT fixes + two `/agent-teams:team-feature` runs + cleanups + Jest worker enforcement.

This specialist cross-checks baseline HIGHs for factual accuracy, hunts for new HIGH gaps that a generic reviewer missed, and weighs whether the specialization delivers real uplift for the testing dimension.

## Summary
- Test files reviewed: ~40 (baseline claim "~37" confirmed to be in range)
- Production files without matching specs: 4 confirmed, 1 partially refuted (see H-T-04)
- Baseline HIGH confirmed: 3 of 4
- Baseline HIGH downgraded/rejected: 1 of 4 (H-T-02 — file exists, was already there pre-sprint — but the specific ADR-030 callbacks remain uncovered, so the underlying risk is real at a lower severity)
- NEW HIGH: 3
- NEW MEDIUM: 4
- NEW LOW: 3

## Baseline findings — agreement check

### H-T-01 (CRIT-Y1 no regression guard) — **CONFIRMED**
Specialist validation: correct. Search across `__tests__/` for `h-11`, `w-11`, `CRIT-Y1`, or WCAG size assertions returns zero matches. The fix at `src/components/staging/DeckView.tsx:378,431,443` (block/skip/undo buttons grown to `h-11 w-11`) has no automated regression guard. A future "simplify the rail" refactor could silently shrink these back to `h-10` and both `DeckView.spec.tsx` and `a11y-deck-view.spec.tsx` would pass — axe does not enforce WCAG 2.5.5 AAA target sizes by default, and Tailwind classes do not resolve through `window.getComputedStyle` in jsdom so the tests cannot even observe the physical size. Baseline's className-grep suggestion is the right level. Rating 8 (important, not data-loss).

### H-T-02 (useDeckStack no unit tests) — **PARTIALLY REJECTED, DOWNGRADED TO MEDIUM**
Factual correction: `__tests__/useDeckStack.spec.ts` **does exist** (11,322 bytes, 15 tests, last modified by `d32e716` — prior to the a92aaf3 scope boundary). `git log a92aaf3..HEAD -- __tests__/useDeckStack.spec.ts` returns zero commits — the file was not touched this sprint. The baseline claim "`ls __tests__/useDeckStack*` returns nothing" is incorrect. I have verified this twice with different commands.

What the existing spec **does** cover well:
- Initial state, navigation, session completion, empty-vacancy edge case
- `jest.useFakeTimers()` with `advanceTimersAndFlush(300)` helper
- `performAction` success → index advance, stats update, onAction called
- `performAction` failure path: `mockResolvedValue({ success: false })` → rollback, no index advance, no undo entry, stats unchanged
- `mockRejectedValue(new Error("Network error"))` → caught rejection → rollback
- Only-on-success undo stack push via `failThenSucceed` sequence
- Skip bypasses onAction, does not push undo
- Block sets exit direction "down" and records `blocked` stat
- `undo()` reverses the blocked stat
- `isAnimating` guard: rapid double-fire → second action no-ops

What the existing spec **does NOT** cover (the real Sprint-2 coverage gap):
1. **`onSuperLikeSuccess(createdJobId, vacancy)` callback path** — the whole reason CRIT-A2 existed. No test asserts that `performAction("superlike")` with `mockResolvedValue({ success: true, createdJobId: "job-42" })` triggers `onSuperLikeSuccess` with the correct args.
2. **`onSuperLikeSuccess` NOT fired when `createdJobId` is absent** — the fallback path (`if (action === "superlike" && result.createdJobId)`).
3. **`onSuperLikeUndone(createdJobId)` callback on undo of a super-like** — the entire celebration-removal-on-undo invariant is untested.
4. **`isDetailsOpen` keyboard gate** — when `isDetailsOpen=true`, deck shortcuts must be suppressed so the user can type inside the sheet. Zero coverage.
5. **Keyboard shortcut bindings** — `d`/`p`/`s`/`b`/`n`/`z`/arrow keys are completely untested. If a maintainer swaps `d` and `s` during a refactor nothing fails.
6. **INPUT/TEXTAREA/SELECT/contentEditable guard** — the code branch at lines 234-242 that prevents shortcut firing when typing in a form field. Untested.
7. **`containerRef.contains(target)` focus-gating** — shortcuts only fire when focus is inside the deck. Untested.
8. **`MAX_UNDO_STACK = 5` boundary** — the oldest entry must be dropped when the stack overflows. Untested.

So the **risk** is real (the CRIT-A2 class of regressions can still slip through), but the **remedy** is "extend an existing spec", not "create one from scratch". I downgrade from HIGH to MEDIUM and rename it M-T-07 (see below). Specialist wins on accuracy here — the baseline would have prompted the team to create a duplicate file.

### H-T-03 (detailsXxxAdapter routing) — **CONFIRMED**
Specialist validation: correct. `grep -rn 'detailsPromoteAdapter|detailsSuperLikeAdapter|detailsBlockAdapter|detailsDismissAdapter|handleDeckAction' __tests__/` returns nothing. The four mode-aware adapters at `src/components/staging/StagingContainer.tsx:359-412` have zero unit test coverage. The comment block at lines 349-358 explicitly calls out honesty-gate finding #16 (super-like wired to promote silently broke celebration) as the exact regression class that is still unprotected.

Additional specialist observation the baseline missed: `detailsPromoteAdapter` at line 377 and `detailsSuperLikeAdapter` at line 391 have a **missing dependency in useCallback** — the deps array is `[detailsMode, handleDeckAction]` but both functions close over `handlePromote` in the list-mode branch. This is a latent bug (stale closure on `handlePromote`) that a stricter `useStagingDetailsAdapters` hook extraction with proper deps would surface — and a hook extraction is what enables unit testing the routing branch. Rating 8 — the previously-fixed regression is the exact class still unprotected. Baseline's "extract to a hook" suggestion is both a testability improvement AND a latent-bug fix.

### H-T-04 (5 files without specs) — **CONFIRMED with 1 refutation**
Specialist validation per file:
1. **`StagedVacancyCard.tsx` (+86 lines)** — CONFIRMED. No `StagedVacancyCard.spec.tsx`. Adds a new `onOpenDetails` prop + a body-level click handler + an Info button. Specialist-only finding (NEW HIGH — H-T-06 below): the body uses `role="presentation"` with `onClick` but **no** keyboard handler. This is a mouse-only interaction — a keyboard-only user can only open details via the Info button. No test guards this.
2. **`StagedVacancyDetailContent.tsx` (+374 lines)** — **PARTIALLY REFUTED**. It IS rendered transitively by `StagedVacancyDetailSheet.spec.tsx` (line 135 of the production Sheet imports it, and the Sheet spec asserts on title, employer, source, external-link `rel`, classification, industry codes, working languages, match score — all of which actually exercise the content component). Coverage is via integration, not isolation. The baseline's framing ("no dedicated unit test") is technically correct but overstates the risk — the component IS exercised. Severity should be LOW not HIGH.
3. **`SuperLikeCelebrationHost.tsx`** — CONFIRMED partial coverage. Grace-period test block (lines 459-660 of `SuperLikeCelebration.spec.tsx`) is excellent and directly tests the Host. But the `router.push('/dashboard/myjobs/${jobId}')` side effect (line 147 of the Host) is never asserted — `next/navigation` is mocked as `useRouter: () => ({ push: jest.fn(), ... })` and the inline `jest.fn()` is unreachable from test assertions because it's re-created per render. Specialist NEW FINDING (M-T-08): the entire navigation path is covered at the contract level (`onOpenJob` callback fires) but not at the side-effect level (`router.push` actually invoked). Rating 5.
4. **`DiscoveredJobDetail.tsx` (+47 lines)** — CONFIRMED. No test. Sprint 2 commit `cbef375` adds translation string usage; zero coverage of the new i18n paths.
5. **`NotificationDropdown.tsx` (+143 lines)** — CONFIRMED and the baseline's severity is CORRECT — the new file contains a pure function `groupNotifications()` with time-bucket logic (`today`/`yesterday`/`thisWeek`/`earlier`) that has **zero tests** (`grep` in `__tests__/` for `groupNotifications|getGroupKey|startOfDay` returns nothing). A date-sensitive pure function with no tests is a classic source of timezone-dependent flakes. Specialist escalates this specific gap to HIGH as H-T-07 below (date bucketing deserves its own finding).

## NEW HIGH findings

### H-T-05 — Event-triggered enrichment concurrency semaphore has zero test coverage
- **File:** `src/lib/events/consumers/enrichment-trigger.ts:36-57` / `__tests__/enrichment-auto-trigger.spec.ts` (has no semaphore coverage)
- **Severity:** HIGH
- **Rule:** Concurrency-critical infrastructure added this sprint must have deterministic tests.
- **Finding:** Commit `14585f8` ("enrichment: cross-user cache leak, dead timeout, **batch throttling**, DRY violations") introduced an in-memory semaphore limiting concurrent enrichments to `MAX_CONCURRENT_ENRICHMENTS = 5`:
  ```ts
  let activeEnrichments = 0;
  const enrichmentQueue: Array<() => void> = [];
  async function withEnrichmentLimit<T>(fn: () => Promise<T>): Promise<T> {
    if (activeEnrichments >= MAX_CONCURRENT_ENRICHMENTS) {
      await new Promise<void>((resolve) => enrichmentQueue.push(resolve));
    }
    activeEnrichments++;
    try { return await fn(); }
    finally {
      activeEnrichments--;
      const next = enrichmentQueue.shift();
      if (next) next();
    }
  }
  ```
  `grep -rn 'MAX_CONCURRENT_ENRICHMENTS|withEnrichmentLimit|activeEnrichments|enrichmentQueue' __tests__/` returns zero matches. The semaphore has several latent bugs that a test suite would surface immediately:
  1. **Not reset between tests.** `activeEnrichments` is a module-level `let` (not `globalThis`), so it persists across test cases within the same file. If one test triggers enrichment and the mocked `enrichmentOrchestrator.execute()` rejects synchronously, the `finally` still runs and the counter comes back to 0 — but only if the test awaits it. If the test doesn't await (fire-and-forget pattern is how the code calls it), the next test starts with a leaked counter.
  2. **Race between the counter increment and the queue push.** At high rates, `if (activeEnrichments >= 5) { await queue.push }` then `activeEnrichments++` is not atomic — if 10 callers hit this path simultaneously, they all see `activeEnrichments < 5`, skip the await, and increment past 5. JavaScript's single-threaded model saves this from being a race in the literal sense, but the logic still admits >5 concurrent executions during the window between the check and the increment, because `await fn()` suspends and the scheduler can run other ticks.
  3. **Zombie resolver when `fn()` throws synchronously.** If `fn()` throws before returning a promise, the `try/finally` path still decrements but the next queued resolver is called — correct. But if `fn()` throws AFTER awaiting something, the error propagates up and the caller's `.catch` handler fires; all internal bookkeeping is OK. Still — no test asserts this.
- **Reproduction / rationale:** Write a test that fires 10 `handleCompanyCreated` events in parallel against a mocked orchestrator that waits 50ms then resolves. Assert that `activeEnrichments` never exceeds 5 at any point (spy + peek). Assert that all 10 eventually complete. Current tests fire one event at a time and never exercise the queue.
- **Suggested fix direction:** Add `__tests__/enrichment-auto-trigger-semaphore.spec.ts` (or extend the existing file) that:
  1. Mocks the orchestrator with a controllable promise (`new Promise(resolve => { deferred.resolve = resolve; })`).
  2. Fires 7 events in parallel, asserts 5 are "in flight" and 2 are queued.
  3. Resolves one in-flight → asserts one queued resolves, counter stays at 5.
  4. Resolves all → counter returns to 0.
  5. Exports the semaphore state (counter, queue length) via a `_testHelpers` object so the spec can peek without reaching into module-level mutable state.
  Extract the semaphore into a separate `src/lib/concurrency/semaphore.ts` module with `acquire()` / `release()` to make it independently testable. The current inlined implementation is hard to isolate.

### H-T-06 — StagedVacancyCard click-body interaction is mouse-only, no keyboard path, no test
- **File:** `src/components/staging/StagedVacancyCard.tsx:94-102` (diff added this sprint) / no matching test
- **Severity:** HIGH
- **Rule:** A11y invariant — click-to-open interactions must be keyboard accessible. Tests must guard the non-ESLint-visible cases.
- **Finding:** The sprint-2 diff added a card-body click handler that opens the details sheet:
  ```tsx
  <div
    role="presentation"
    onClick={handleBodyClick}
    className={onOpenDetails ? "cursor-pointer hover:bg-muted/40 ..." : undefined}
  >
  ```
  The `role="presentation"` choice exempts the div from ESLint's `jsx-a11y/click-events-have-key-events` rule, so linting passes. But the practical effect is that a keyboard-only user cannot reach the click target by Tab — presentation-role removes the element from the a11y tree entirely. The Info button at line 128 is the only keyboard-accessible entry point, which is fine **as long as it stays visible** — but there is no test that asserts "if the body is clickable with the mouse, an equivalent keyboard path exists". A future refactor that hides the Info button (e.g. "move details into a hover-only affordance") would silently break keyboard accessibility with no test signal. Also, the nested `<Button>`s inside the body use `onClick={(e) => e.stopPropagation()}` to prevent double-firing — this is the pattern that quietly breaks if a future refactor moves the body handler up or swaps it for a `<button>` wrapper.
- **Reproduction / rationale:** Remove the Info button (line 128-138 range of `StagedVacancyCard.tsx`). Run the jest suite. Every test passes. The card is now unreachable from a keyboard.
- **Suggested fix direction:** Add `__tests__/StagedVacancyCard.spec.tsx` that asserts:
  1. The Info button exists with an accessible name.
  2. Clicking the Info button fires `onOpenDetails(vacancy)`.
  3. The action buttons (Promote, Dismiss, Archive, Block) use `stopPropagation` correctly — clicking Promote does not ALSO fire `onOpenDetails` even when the parent has a body handler.
  4. If the body is meant to be interactive, either: (a) assert a keyboard handler OR (b) assert the body is `role="presentation"` AND the Info button is present AND has a visible label (i.e. a strict invariant: "clickable body requires visible Info button").
  Add an `a11y-staged-vacancy-card.spec.tsx` that runs axe against the card in list mode and in deck mode.

### H-T-07 — `NotificationDropdown.groupNotifications` time-bucket pure function has zero tests
- **File:** `src/components/layout/NotificationDropdown.tsx:36-100` / no matching test
- **Severity:** HIGH
- **Rule:** Pure functions with date-sensitive logic must have deterministic unit tests with frozen clocks.
- **Finding:** Commit `42ea3cb` ("5W+H layout, deep-links, fix dispatcher locale bug") added a brand new file with a critical pure function:
  ```ts
  function getGroupKey(createdAt: Date, now: Date): GroupKey {
    const today = startOfDay(now);
    const created = startOfDay(createdAt);
    const diffMs = today.getTime() - created.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return "today";
    if (diffDays === 1) return "yesterday";
    if (diffDays < 7) return "thisWeek";
    return "earlier";
  }
  function groupNotifications(notifications: Notification[], now: Date = new Date()): NotificationGroup[] { ... }
  ```
  `grep -rn 'groupNotifications|getGroupKey|startOfDay' __tests__/` returns **zero** matches. This function has **six** subtle bug classes, each of which a single unit test would catch:
  1. **DST boundary.** `Math.round(diffMs / 86_400_000)` uses a fixed 24-hour day. On the spring-forward day, a notification created at 23:00 yesterday is 23 hours ago, rounds to "1" → "yesterday". Correct. But a notification created at 01:00 today is -1 hour ago locally → the absolute ms difference is negative but `diffMs` is computed via `today - created`, not relative — actually works out. Still, no test pins this.
  2. **Timezone-local `startOfDay`.** Uses `setHours(0,0,0,0)` which is local-timezone. A notification from 23:59 local is "today" at 00:00 local the next day → diffDays = 1 → "yesterday". Depending on the user's intent ("everything from the current calendar day") this may be correct, but a test would pin the contract.
  3. **`diffDays <= 0` for future dates.** A notification with a future `createdAt` (clock skew) goes into "today" silently. Is that intentional? No comment, no test.
  4. **`diffDays < 7` bucket boundary.** Day-6-at-00:01 is "thisWeek", day-7-at-00:01 is "earlier". Off-by-one edge case deserves a pinned test.
  5. **Empty groups are omitted.** The comment at line 60 says so, but the loop assigns into `buckets` unconditionally. The omission logic is in the iteration that builds `NotificationGroup[]` (not shown in the excerpt). A test with all-"today" notifications should assert that `yesterday`/`thisWeek`/`earlier` groups are NOT returned.
  6. **Default parameter `now = new Date()`.** Using `new Date()` as a default parameter makes the function non-deterministic in tests. A spec cannot pass `now = undefined` and expect a pinned result.
- **Reproduction / rationale:** Any of the above bug classes will cause silent mis-grouping in production without any test failure. If the user is in `Pacific/Auckland` and creates a notification at 23:30, and then views the dropdown at 00:15 in `UTC` (via SSR), the "today" bucket is computed against the server's "today" (UTC), not the user's "today" (NZDT). The notification could land in "yesterday" unexpectedly.
- **Suggested fix direction:** Add `__tests__/notification-dropdown-grouping.spec.ts` that:
  1. Exports `groupNotifications` and `getGroupKey` (currently private — refactor to named exports, or export a `__test__` namespace).
  2. Uses `jest.useFakeTimers().setSystemTime(new Date("2026-04-09T12:00:00Z"))` to freeze the clock.
  3. Tests each bucket boundary: notification at 00:00 today, 23:59 today, 00:00 yesterday, 23:59 yesterday, 00:00 6 days ago, 00:00 7 days ago.
  4. Tests empty-group omission.
  5. Tests future-date handling (explicit contract, whatever it is).
  6. Tests that passing an explicit `now` parameter overrides the default.

## NEW MEDIUM / LOW findings

### M-T-07 — `useDeckStack.spec.ts` exists but does not cover the ADR-030 callback contract (was baseline H-T-02)
- **File:** `__tests__/useDeckStack.spec.ts:1-372`
- **Severity:** MEDIUM (downgraded from baseline's HIGH)
- See "Baseline H-T-02 agreement check" above for the full list of uncovered ADR-030 paths: `onSuperLikeSuccess(createdJobId)` / absent-createdJobId fallback / `onSuperLikeUndone(createdJobId)` / `isDetailsOpen` keyboard gate / keyboard shortcut bindings / `MAX_UNDO_STACK` overflow.

### M-T-08 — `SuperLikeCelebrationHost` router.push side effect is mocked but never asserted
- **File:** `__tests__/SuperLikeCelebration.spec.tsx:18-28` (the `useRouter` mock) and the grace-period describe block
- **Severity:** MEDIUM
- **Rule:** When a component has a navigation side effect, at least one test must assert the correct URL.
- **Finding:** The `next/navigation` mock uses an inline `jest.fn()` inside the factory:
  ```ts
  jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: jest.fn(), ... }),
  }));
  ```
  A fresh `jest.fn()` is returned on every `useRouter()` call, so the test code cannot hold a reference to assert against. `grep -n 'mockPush|router\.push|toHaveBeenCalledWith.*myjobs' __tests__/SuperLikeCelebration.spec.tsx` returns 0 matches. The Host's `onOpenJob` callback at line 142-148 does `dismiss(displayedItem.id); router.push(\`/dashboard/myjobs/\${jobId}\`);` — the `dismiss` call is verified (via the `dismiss` prop mock) but `router.push` is not. If a future refactor drops the `router.push` or changes the URL template to `/myjobs/${jobId}` (missing `/dashboard/`), no test fails.
- **Reproduction / rationale:** Change line 147 to `router.push('/wrong/${jobId}')`. All tests pass.
- **Suggested fix direction:** Hoist the mock to a module-level variable:
  ```ts
  const mockPush = jest.fn();
  jest.mock("next/navigation", () => ({
    useRouter: () => ({ push: mockPush, ... }),
  }));
  ```
  Add one test: render the Host, click the primary CTA, assert `expect(mockPush).toHaveBeenCalledWith("/dashboard/myjobs/job-1")`.

### M-T-09 — Notification dispatcher locale fix has no regression guard
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:112-115` (`resolveLocale`) / `__tests__/notification-dispatcher.spec.ts`
- **Severity:** MEDIUM
- **Rule:** Bug fixes must land with a regression test that reproduces the original bug.
- **Finding:** Commit `42ea3cb` message: "feat(notifications): 5W+H layout, deep-links, **fix dispatcher locale bug**". The dispatcher now calls `resolveLocale(payload.userId)` before building the English fallback `message`. The spec at `__tests__/notification-dispatcher.spec.ts:40-54` mocks `@/i18n/dictionaries`:
  ```ts
  jest.mock("@/i18n/dictionaries", () => ({
    t: jest.fn((_locale: string, key: string) => {
      const translations: Record<string, string> = { ... }; // all English
      return translations[key] ?? key;
    }),
  }));
  ```
  The mock **ignores the locale parameter entirely** (`_locale: string`). So a test that sets `mockFindUnique.mockResolvedValue({ settings: { locale: 'de' } })` to exercise a German user would get exactly the same output as an English user. `grep -n 'resolveLocale|NEXT_LOCALE|locale.*de|resolveUserSettings' __tests__/notification-dispatcher.spec.ts` returns 0 matches. The locale fix is unguarded — a future regression back to `t("en", ...)` hardcoding would not fail any test.
- **Reproduction / rationale:** The commit message claims a bug was fixed. But the fix is invisible to the test suite because the `t` mock erases the locale.
- **Suggested fix direction:** Rewrite the `t` mock to branch on locale:
  ```ts
  const translations = {
    en: { "notifications.batchStaged": "{count} new vacancies staged from automation" },
    de: { "notifications.batchStaged": "{count} neue Stellenangebote aus der Automatisierung" },
  };
  t: jest.fn((locale: string, key: string) => translations[locale]?.[key] ?? key),
  ```
  Add a test: user has `settings.locale = 'de'`, publish `VacancyStaged`, flush, assert `mockCreate` was called with `message: expect.stringMatching(/neue Stellenangebote/)`.

### M-T-10 — `DeckCard.onInfoClick` button has no test (baseline's "out-of-scope" note, specialist escalation)
- **File:** `src/components/staging/DeckCard.tsx:88-104` / `__tests__/DeckCard.spec.tsx`
- **Severity:** MEDIUM
- **Rule:** New UI affordances must have at least one smoke test.
- **Finding:** Baseline downgraded this to an "out-of-scope note", but specialist thinks it's MEDIUM because:
  1. The `onInfoClick` button is the **only** keyboard entry point into the details sheet from deck mode (combined with the `i` keyboard shortcut wired in `useDeckStack`).
  2. `grep -n 'onInfoClick|Info.*click|Info.*button' __tests__/DeckCard.spec.tsx` returns 0 matches.
  3. A regression that conditionally hides the Info button on some card states (e.g. preview mode, empty state) would silently break details access.
- **Suggested fix direction:** Add 3 tests to `DeckCard.spec.tsx`:
  1. When `onInfoClick` is provided, an Info button with a proper aria-label is rendered.
  2. Clicking the Info button fires `onInfoClick(vacancy)`.
  3. When `isPreview=true`, the Info button is NOT rendered (per the production guard `{onInfoClick && !isPreview && ...}`).

### L-T-05 — `MatchScoreRing` has no test for negative scores or `NaN`/`Infinity`
- **File:** `src/components/staging/MatchScoreRing.tsx:50-52` / `__tests__/MatchScoreRing.spec.tsx`
- **Severity:** LOW
- **Finding:** The component clamps via `Math.max(0, Math.min(100, safeScore))` and checks `Number.isFinite(score)` for the `hasScore` guard. The spec covers 0, 50, 75, 85, 100, 150 (above max), null, undefined — but misses: negative scores, `NaN`, `Infinity`, and `-Infinity`. A regression that replaces `Number.isFinite` with `typeof score === "number"` would silently render `NaN` as the aria label. One-line fix: add `it.each([-5, NaN, Infinity, -Infinity])("renders placeholder for %p", ...)`.

### L-T-06 — `undoStore` migrated to `globalThis` singleton without a test asserting HMR-survival semantics
- **File:** `src/lib/undo/undo-store.ts:173-176` / `__tests__/undo-store.spec.ts`
- **Severity:** LOW
- **Finding:** Commit `9f89f18` (small cleanups sprint) migrated `undoStore` from `export const undoStore = new UndoStore()` to a `globalThis.__undoStore` pattern. The spec at `__tests__/undo-store.spec.ts:11-13` calls `undoStore.reset()` in `beforeEach` so pollution between tests is handled. But:
  1. No test asserts that two imports of `undoStore` return the same instance (the point of `globalThis`).
  2. No test asserts that `__undoStore` survives a hypothetical re-import (jest `resetModules` + re-require).
  3. Runtime assertion is missing that the store is actually on `globalThis`.
  Minor — the pattern is well-established in the codebase (EventBus, RunCoordinator, EnrichmentOrchestrator, enrichment-inflight Map), all of which use the same pattern and are tested transitively.

### L-T-07 — `badge.tsx` `whitespace-nowrap` addition has no regression guard
- **File:** `src/components/ui/badge.tsx:6` / no matching test
- **Severity:** LOW
- **Finding:** Commit `0301c20` ("stretch badges to fit translated text, fix clipping hotspots") added `whitespace-nowrap` to the base Tailwind class. No test asserts the class is present. A future `cn()` refactor that drops the class while "tidying up the base style" would revert the fix silently. One-line fix: add a test that renders a default `<Badge>Foo</Badge>` and asserts `expect(badge.className).toMatch(/whitespace-nowrap/)`.

## Methodology

Tool calls made:
1. `Read .team-feature/stream-5b-testing.md` (full baseline).
2. `Bash: ls __tests__/` to enumerate existing spec files (the most critical call — it immediately disproved baseline H-T-02).
3. `Bash: git log a92aaf3..HEAD` + `git diff --stat a92aaf3..HEAD` to map scope.
4. `Bash: git log --all --oneline --follow __tests__/useDeckStack.spec.ts` to confirm the file predates the scope.
5. `Read __tests__/useDeckStack.spec.ts` (full 372 lines) to enumerate covered vs uncovered paths.
6. `Read src/hooks/useDeckStack.ts` to enumerate the ADR-030 callback contract.
7. `Grep 'h-11|w-11|CRIT-Y1'` in `__tests__/` (validates H-T-01, returns 0 matches).
8. `Grep 'onSuperLikeSuccess|onSuperLikeUndone|createdJobId'` in `__tests__/` (found only in `PromotionDialog.spec.tsx`, confirming useDeckStack gap).
9. `Grep 'detailsPromoteAdapter|detailsSuperLikeAdapter|detailsBlockAdapter|detailsDismissAdapter|handleDeckAction'` in `__tests__/` (validates H-T-03, returns 0 matches).
10. `Read src/components/staging/StagingContainer.tsx` lines 240-412 to verify the adapter routing and find the missing useCallback dep on `handlePromote`.
11. `Read __tests__/DeckView.spec.tsx` to verify M-T-01 (`mockResolvedValue(undefined)` at line 95).
12. `Read __tests__/StagedVacancyDetailSheet.spec.tsx:62-120` to verify M-T-06 (full Sheet mock).
13. `Read __tests__/a11y-deck-view.spec.tsx:72-95` to verify M-T-05 (DeckCard stubbed).
14. `Read __tests__/enrichment-actions.spec.ts:183-198` to verify M-T-02 (cleanup inside test body).
15. `Read __tests__/useSuperLikeCelebrations.spec.ts:140-162` + `Read src/hooks/useSuperLikeCelebrations.ts:40-87` to verify L-T-02.
16. `Read __tests__/notification-dispatcher.spec.ts` full body to find the locale-bug gap (M-T-09).
17. `Read __tests__/SuperLikeCelebration.spec.tsx:459-650` (grace-period block) to verify router.push gap.
18. `Grep 'mockPush|router\.push|useRouter'` in `__tests__/SuperLikeCelebration.spec.tsx` (M-T-08 evidence).
19. `Read src/lib/events/consumers/enrichment-trigger.ts:30-90` to analyze the semaphore (H-T-05).
20. `Grep 'MAX_CONCURRENT_ENRICHMENTS|withEnrichmentLimit|activeEnrichments|enrichmentQueue|semaphore'` in `__tests__/` (zero matches — validates H-T-05).
21. `Read src/components/layout/NotificationDropdown.tsx:1-80` (groupNotifications analysis, H-T-07).
22. `Grep 'groupNotifications|getGroupKey|startOfDay'` in `__tests__/` (zero matches).
23. `git diff a92aaf3..HEAD -- src/components/staging/StagedVacancyCard.tsx` to find the `role="presentation"` click body (H-T-06).
24. `Grep 'onKeyDown|handleBodyKey'` in the Card source — zero matches (confirms mouse-only).
25. Cross-checked i18n dictionary completeness: `git diff` shows 4× `moduleDeactivated.title` entries → all 4 locales updated, no dictionary-completeness gap this sprint.

Files read in full or in part (absolute paths):
- `/home/pascal/projekte/jobsync/.team-feature/stream-5b-testing.md`
- `/home/pascal/projekte/jobsync/__tests__/useDeckStack.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/DeckView.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/StagedVacancyDetailSheet.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/StagingContainerBanner.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/NotificationBell.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/notification-dispatcher.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/notification-deep-links.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/module.actions.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/a11y-deck-view.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/enrichment-actions.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/enrichment-auto-trigger.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/useStagingLayout.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/useSuperLikeCelebrations.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/SuperLikeCelebration.spec.tsx`
- `/home/pascal/projekte/jobsync/__tests__/MatchScoreRing.spec.tsx`
- `/home/pascal/projekte/jobsync/src/hooks/useDeckStack.ts`
- `/home/pascal/projekte/jobsync/src/components/staging/StagingContainer.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/DeckView.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/DeckCard.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/StagedVacancyCard.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/MatchScoreRing.tsx`
- `/home/pascal/projekte/jobsync/src/components/staging/SuperLikeCelebrationHost.tsx`
- `/home/pascal/projekte/jobsync/src/components/layout/NotificationDropdown.tsx`
- `/home/pascal/projekte/jobsync/src/hooks/useSuperLikeCelebrations.ts`
- `/home/pascal/projekte/jobsync/src/lib/events/consumers/enrichment-trigger.ts`
- `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts`
- `/home/pascal/projekte/jobsync/src/models/notification.model.ts` (via diff)
- `/home/pascal/projekte/jobsync/src/components/ui/badge.tsx` (via diff)
- `/home/pascal/projekte/jobsync/src/lib/undo/undo-store.ts` (via diff)
- `/home/pascal/projekte/jobsync/src/lib/connector/degradation.ts` (via diff)
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` (via diff)
- `/home/pascal/projekte/jobsync/e2e/crud/staging-details-sheet.spec.ts`

Approach: I deliberately started from baseline claims and tried to falsify each, then looked for what a generic reviewer would miss by (a) re-reading diffs with the test-effectiveness lens (mock-shape drift, hidden integration failures), (b) scanning for hand-written concurrency primitives added this sprint (semaphore discovery), (c) looking for pure functions added in new files without co-located tests (grouping function discovery), and (d) validating every "regression fix" commit message against the presence of a corresponding regression test.

## Verdict on specialization value

**PARTIAL** — The specialization delivered real uplift (3 new HIGH, 4 new MEDIUM, 3 new LOW) AND a factual correction on baseline H-T-02 that would have prevented the team from creating a duplicate `useDeckStack.spec.ts` file. The most valuable finds (H-T-05 semaphore, H-T-07 date grouping, M-T-09 locale fix) all required reading production code added this sprint and cross-checking against the test suite — a generic reviewer doing a "coverage checklist" pass would plausibly miss all three because none involve an obviously-missing spec file. The specialization also caught subtleties the baseline got right but didn't deeply investigate: the `next/navigation` inline `jest.fn()` in the Host test (M-T-08), the `role="presentation"` keyboard-accessibility hole (H-T-06), and the missing `useCallback` dep on `handlePromote` in the adapter routing (a latent bug, not just a coverage gap).

That said, the baseline's findings were 75% accurate (3 of 4 HIGHs landed cleanly; 1 was factually wrong but pointed at a real sub-problem) and the MEDIUM/LOW list was strong — particularly M-T-01 (DeckView mock shape) and M-T-06 (Sheet primitive mock). Specialization uplift is therefore meaningful (3 new HIGHs is a lot) but the baseline is already competent. Recommend specialization for any sprint that touches: concurrency primitives, date/time pure functions, i18n-dependent server paths, or keyboard-accessibility patterns — the baseline's surface-coverage lens misses these categories systematically.
