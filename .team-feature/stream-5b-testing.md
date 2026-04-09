# Sprint 2 Team Review — Testing Dimension

## Summary
- Test files reviewed: ~37 (unit/component + E2E + jest infra)
- Production files changed without corresponding unit tests: 5 (StagedVacancyCard, StagedVacancyDetailContent, StagingContainer deck-routing adapters, DiscoveredJobDetail, useDeckStack)
- HIGH findings: 4
- MEDIUM findings: 6
- LOW findings: 4
- Verified CRIT fixes:
  - **CRIT-A1 (module.actions → ModuleDeactivated event):** Pinned by `__tests__/module.actions.spec.ts` via the clever "notification entry is intentionally absent from the prisma mock → any direct write throws synchronously" pattern (lines 20–26, 286–303). Strong regression guard.
  - **CRIT-A2 (PromotionDialog jobId threading):** Pinned by `__tests__/PromotionDialog.spec.tsx` — 5 tests including the full `promotionResolveRef` chain and the `onOpenChange`/`onSuccess` microtask race (lines 140–266). Contract shape matches the real `ActionResult<{jobId, stagedVacancyId}>` return of `promoteStagedVacancyToJob`. Strong.
  - **CRIT-Y2 (StagingLayoutToggle non-color indicator + single accessible name):** Pinned by `__tests__/StagingLayoutToggle.spec.tsx` lines 203–300. Tests confirm exactly one indicator, `aria-hidden="true"` on it, no `title` attribute, no sr-only duplicate span, accessible name equals `aria-label` exactly. Strong.
  - **CRIT-Y3 (SuperLikeCelebration focus/Escape/labelledby/focus-pause):** Pinned by `__tests__/SuperLikeCelebration.spec.tsx` lines 207–456. Covers mount-focus delay, `prefers-reduced-motion` immediate-focus variant, programmatic-focus-does-not-pause-timer, user-focus-does-pause-timer, global Escape with focus outside the card, non-consuming event propagation (for Dialog co-existence), `aria-labelledby` resolution, regression guard against static `aria-label`. Strong.
  - **CRIT-Y1 (deck button target sizes ≥ 44×44):** **NOT pinned by any test.** See H-T-01.

## HIGH findings

### H-T-01 — CRIT-Y1 regression guard missing: no test asserts deck button target sizes
- **File:** `src/components/staging/DeckView.tsx:378-450` (production) / no matching test
- **Severity:** HIGH
- **Rule:** Regression guards for fixed CRITs must be pinned at the nearest test boundary.
- **Finding:** The CRIT-Y1 fix grew the Block, Skip, and Undo buttons from `h-10 w-10` to `h-11 w-11` (≥ 44×44 per WCAG 2.5.5 AAA). A commit-level grep across `__tests__/` for `h-11 w-11`, `44`, or `CRIT-Y1` returns zero matches. `__tests__/DeckView.spec.tsx` exercises these buttons by aria-label but never asserts their className or computed size. `__tests__/a11y-deck-view.spec.tsx` stubs `DeckCard` entirely (`jest.mock("@/components/staging/DeckCard", ...)`) but crucially it does NOT stub the DeckView itself — axe IS run against the real deck buttons. However, axe doesn't enforce WCAG 2.5.5 AAA target sizes by default. So nothing would catch a future regression where someone shrinks the Block button back to `h-10`.
- **Reproduction / rationale:** Delete the `h-11 w-11` from `DeckView.tsx:380,431,443`, replace with `h-10 w-10`. `bun run test:jest __tests__/DeckView.spec.tsx __tests__/a11y-deck-view.spec.tsx` passes without complaint.
- **Suggested fix direction:** In `__tests__/DeckView.spec.tsx` (or a new `DeckView.target-size.spec.tsx`), assert the container class for each action button: `expect(screen.getByLabelText("Block this company").className).toMatch(/\bh-11\b.*\bw-11\b|\bh-(1[1-9]|[2-9]\d)\b/)`. Alternatively, use `toHaveStyle` against a computed minimum via `window.getComputedStyle` (Tailwind classes don't resolve in jsdom, so className assertion is the right level). Include all five rail buttons: Dismiss (h-14), Block (h-11), SuperLike (h-12), Promote (h-16), Skip (h-11), Undo (h-11). Pin all five so a future refactor cannot silently shrink any of them below 44×44 while pretending to "simplify the design".

### H-T-02 — `useDeckStack` hook has no dedicated spec; ADR-030 routing invariant untested
- **File:** `src/hooks/useDeckStack.ts` (production) / no matching `__tests__/useDeckStack.spec.ts`
- **Severity:** HIGH
- **Rule:** Coverage gap — a critical hook touched this sprint (the ADR-030 deck action contract owner) has no unit tests.
- **Finding:** `useDeckStack` is the state machine at the center of the ADR-030 deck routing invariant. It owns the optimistic exit animation, the `setTimeout(300ms)` rollback-or-advance logic, the `{success, createdJobId}` contract forwarding into `onSuperLikeSuccess`, the undo stack with `createdJobId` tracking, and the stats bookkeeping. None of this is tested in isolation. `__tests__/DeckView.spec.tsx` exercises the hook transitively, but:
  1. It never calls `jest.useFakeTimers()` or advances past the 300ms animation delay, so `performAction`'s post-timeout branch (success → index++ / failure → rollback) never executes.
  2. It uses `jest.fn().mockResolvedValue(undefined)` as `onAction` — `undefined` is neither `{success: true}` nor `{success: false}`, so `result.success` evaluates to `undefined` (falsy) and the card would roll back. The test avoids this latent bug by never asserting that the index advances or that the next card appears.
  3. The `onSuperLikeSuccess` callback — the reason CRIT-A2 existed — is never driven to completion from the hook's side.
  4. The `onSuperLikeUndone` undo path with `createdJobId` is entirely uncovered.
- **Reproduction / rationale:** `ls __tests__/useDeckStack*` returns nothing. `grep -rn 'useDeckStack' __tests__/` only shows the mock in `StagingContainerBanner.spec.tsx` (which replaces the entire hook with a jest.fn).
- **Suggested fix direction:** Create `__tests__/useDeckStack.spec.ts` with `renderHook`. Cover (at minimum):
  1. `performAction("dismiss")` success → after `jest.advanceTimersByTime(300)`, `currentIndex` increments, stats updated, `exitDirection` resets.
  2. `performAction("dismiss")` failure → index does NOT advance, `exitDirection` resets (rollback).
  3. `performAction("superlike")` success with `createdJobId: "job-1"` → `onSuperLikeSuccess` called with `("job-1", vacancy)`.
  4. `performAction("superlike")` success WITHOUT `createdJobId` → `onSuperLikeSuccess` NOT called (celebration silently no-ops).
  5. `performAction("skip")` → bypasses `onAction` entirely, stats.skipped++, no undo entry.
  6. `performAction` while `isAnimating` → no-ops (`animatingRef.current` guard).
  7. `undo()` on a super-like entry → `onSuperLikeUndone(createdJobId)` fires.
  8. `undo()` past `MAX_UNDO_STACK` (5) → oldest entry dropped.
  9. Keyboard shortcuts (`d`/`p`/`s`/`b`/`n`/`z`) fire the right actions when `containerRef` has focus.
  10. Keyboard shortcuts are suppressed when `isDetailsOpen=true`.
  11. Keyboard shortcuts ignore input/textarea/select target elements.

### H-T-03 — `StagingContainer` detailsXxxAdapter routing (ADR-030 invariant) has zero regression coverage
- **File:** `src/components/staging/StagingContainer.tsx:344-412` (production) / no matching test
- **Severity:** HIGH
- **Rule:** A documented invariant (ADR-030 honesty gate finding #16/#17) must have at least one regression guard.
- **Finding:** ADR-030 introduces four mode-aware adapters in `StagingContainer` (`detailsDismissAdapter`, `detailsPromoteAdapter`, `detailsSuperLikeAdapter`, `detailsBlockAdapter`) that MUST branch on `detailsMode === "deck"` vs `"list"` and route to `handleDeckAction` in deck mode. The honesty gate commit explicitly called out that a previous refactor silently swallowed the super-like celebration by wiring `onSuperLike` to the promote adapter. `grep -rn 'detailsPromoteAdapter\|detailsSuperLikeAdapter\|detailsBlockAdapter\|handleDeckAction' __tests__/` returns nothing. The only existing StagingContainer unit test is `__tests__/StagingContainerBanner.spec.tsx`, which stubs `StagedVacancyDetailSheet` to `() => null` and never mounts the sheet — so the routing cannot be exercised. The e2e test `e2e/crud/staging-details-sheet.spec.ts` opens/closes the sheet but never clicks an action button from inside the sheet.
- **Reproduction / rationale:** If a future refactor replaces `handleDeckAction(vacancy, "superlike")` with `handlePromote(vacancy)` in `detailsSuperLikeAdapter` (the exact regression that honesty gate #16 caught), no test fails.
- **Suggested fix direction:** Add a `StagingContainer.routing.spec.tsx` (or extend the banner spec) that mounts `StagingContainer`, forces `viewMode="deck"`, opens the details sheet via the real `onOpenDetails` path, clicks Super-Like inside the (un-stubbed) sheet, and asserts that (a) `promoteStagedVacancyToJob` is invoked through the dispatch (i.e. the adapter went through `handleDeckAction → performAction → onAction`), (b) the undo stack receives an entry, (c) stats.superLiked increments. If full mount is too heavy, at minimum unit-test the four adapters by extracting them to a hook (`useStagingDetailsAdapters(mode, deckAction, listHandlers)`) and pinning the branch selection.

### H-T-04 — Production components touched this sprint with zero unit tests
- **File:** Multiple (see below)
- **Severity:** HIGH
- **Rule:** "New feature → unit + component tests + at minimum 1 E2E" (`CLAUDE.md` Testing Requirements).
- **Finding:** Sprint 2 touched five significant production files that have no matching `*.spec.tsx`:
  1. `src/components/staging/StagedVacancyCard.tsx` (+86 lines) — new "Details" button with aria-label threading, the list-mode entry point into the sheet. No test asserts the button is present or that `onOpenDetails` fires.
  2. `src/components/staging/StagedVacancyDetailContent.tsx` (+374 lines, new file) — the shared content renderer used by the sheet. The sheet spec tests content via the container, but the component in isolation (its MatchScoreRing integration, empty-field fallbacks, link rel attributes, null-vacancy handling) has no dedicated unit test.
  3. `src/components/staging/SuperLikeCelebrationHost.tsx` — has coverage inside `SuperLikeCelebration.spec.tsx` (the grace-period describe block), but the `router.push` side effect of the "Open job" CTA is never verified. Host-specific behavior like the grace-period timer cleanup on unmount is untested.
  4. `src/components/automations/DiscoveredJobDetail.tsx` (+47 lines, +31 -16) — translation touches; no test exists.
  5. `src/components/layout/NotificationDropdown.tsx` (+143 lines) — significant structural changes for 5W+H layout and late-bind i18n; only tested transitively via `NotificationBell.spec.tsx`, which stubs the dropdown trigger entirely.
- **Reproduction / rationale:** `git diff --name-only a92aaf3..HEAD | grep '\.tsx$'` shows the 5 files; searching `__tests__/` for matching specs returns none for StagedVacancyCard, StagedVacancyDetailContent, DiscoveredJobDetail, NotificationDropdown.
- **Suggested fix direction:** At minimum add a one-render smoke test for each component that renders with a representative fixture and asserts the critical user-visible string. For StagedVacancyCard, assert that the "Details" button exists and fires `onOpenDetails(vacancy)` when clicked. For NotificationDropdown, assert that grouping headers render and that the dropdown honors `onMarkAllAsRead` separately from `onDismiss`.

## MEDIUM findings

### M-T-01 — `DeckView.spec.tsx` mock shape mismatch: `onAction` resolves `undefined` while real type is `{success, createdJobId?}`
- **File:** `__tests__/DeckView.spec.tsx:95`
- **Severity:** MEDIUM
- **Rule:** Mocks must reflect real API shapes (CRIT-A2 pattern).
- **Finding:** `const mockOnAction = jest.fn().mockResolvedValue(undefined);` — but the real `onAction` signature (per `src/components/staging/DeckView.tsx:29-32` and `useDeckStack.ts:38-42`) returns `Promise<{success: boolean; createdJobId?: string}>`. With `undefined`, `useDeckStack.performAction` would do `const result = await actionPromise; if (result.success)` → `undefined.success` evaluates to `undefined`, falsy, and the card rolls back. The current tests don't hit this code path because they never `jest.advanceTimersByTime(300)` past the animation delay. That's the same "tests mock their way around the real shape" pattern that enabled CRIT-A2 to ship undetected. A future author who writes "after clicking dismiss, next card appears" would be baffled when the test fails because the index doesn't advance.
- **Reproduction / rationale:** Add to `DeckView.spec.tsx`:
  ```ts
  jest.useFakeTimers();
  fireEvent.click(screen.getByLabelText("Dismiss this vacancy"));
  act(() => jest.advanceTimersByTime(301));
  expect(screen.getByText("Job Beta")).toBeInTheDocument(); // expects next card
  ```
  This would fail because `result.success` is undefined → rollback.
- **Suggested fix direction:** Change to `jest.fn().mockResolvedValue({ success: true })` and make the few tests that want the failure path explicitly mock `{ success: false }`. Better: extract a `makeOnAction(result = { success: true })` fixture factory. While you're there, make at least one DeckView test advance the timer past `ANIMATION_DURATION` and assert index advancement — that pins the contract end-to-end.

### M-T-02 — `enrichment-actions.spec.ts` mutates `globalThis.__enrichmentInflight` without `afterEach` cleanup
- **File:** `__tests__/enrichment-actions.spec.ts:183-198`
- **Severity:** MEDIUM
- **Rule:** Tests must clean up side effects (listeners, timers, mocks, globals) in `afterEach`.
- **Finding:** The "concurrency error" test sets `globalThis.__enrichmentInflight.set("user-1", MAX_CONCURRENT_PER_USER)` inline, then calls `delete` at the end of the test body. The `delete` line runs inside the test function, not an `afterEach`. If any assertion before the `delete` fails (e.g. `result.message` changes, `mockOrchestrator.execute` wiring changes), Jest aborts the test body before cleanup runs → the stale entry leaks into the next test in the same file. `jest.clearAllMocks()` in `beforeEach` does NOT clear `globalThis.__enrichmentInflight`. This is mitigated by the fact that the next test usually reassigns `getCurrentUser` and uses a different `userId`, but any test that shares `user-1` as the mock user (and several do) would silently fail with `enrichment.tooManyConcurrent` instead of the expected result.
- **Reproduction / rationale:** Replace the assertion `expect(mockOrchestrator.execute).not.toHaveBeenCalled()` at line 194 with a failing assertion (e.g. `.toHaveBeenCalled()`); the delete at line 197 never runs; the next test's `triggerEnrichment("company-1", "logo")` call for `user-1` returns `enrichment.tooManyConcurrent` unexpectedly.
- **Suggested fix direction:** Add an `afterEach`:
  ```ts
  afterEach(() => {
    const g = globalThis as unknown as { __enrichmentInflight?: Map<string, number> };
    g.__enrichmentInflight?.delete("user-1");
  });
  ```
  Or better: reset the entire map with `g.__enrichmentInflight?.clear()`.

### M-T-03 — `e2e/crud/staging-details-sheet.spec.ts` is not self-contained — skips silently without seed data
- **File:** `e2e/crud/staging-details-sheet.spec.ts:46-52`
- **Severity:** MEDIUM
- **Rule:** "CRUD tests must be self-contained (create → assert → cleanup in one test body)" (`e2e/CONVENTIONS.md`).
- **Finding:** The test uses `test.skip(buttonCount === 0, "no staged vacancies in seed data — details sheet cannot be opened")`. If the auth'd user has no staged vacancies, the test silently passes (skipped). This is a honest limitation the author called out in the comment — but it means CI can green the PR without ever actually running the assertion, contradicting the CONVENTIONS rule. Worse, because the assertion is gated, a broken sheet would not be caught if CI happens to start with an empty DB (which can happen after a retention cleanup run or a seed refresh).
- **Reproduction / rationale:** Start CI with no staged vacancies → the test reports `skipped` and the entire sheet action path is uncovered at the e2e layer.
- **Suggested fix direction:** The test needs to create a staged vacancy as setup. Since running a full automation is out of scope for e2e, seed via a direct Prisma helper or a test-only API route (e.g. `POST /api/test/seed-staged-vacancy` gated on `NODE_ENV !== "production"`) that inserts a synthetic row. Then the test can be unconditional and deterministic. In the interim, assert `buttonCount > 0` (fail the test) rather than skipping — at least the signal is honest.

### M-T-04 — E2E helpers use `waitForTimeout` (flaky-by-design) in new specs
- **File:** `e2e/crud/staging-details-sheet.spec.ts:28`, `e2e/crud/enrichment.spec.ts:23`
- **Severity:** MEDIUM
- **Rule:** Deterministic tests — no flaky timers or race conditions.
- **Finding:** Both new/updated E2E specs use `page.waitForTimeout(800)` / `page.waitForTimeout(1000)` after navigation "to let the list load". This is a Playwright anti-pattern: it wastes time on fast machines and may be insufficient on slow VMs under load. The jobsync NixOS 8GB VM is known to be slow (see `scripts/test.sh` docs about the worker-count incident). Under contention, 800ms may not be enough and the test flakes.
- **Reproduction / rationale:** Run E2E under CPU pressure (e.g. parallel `bun run build`) → timeout expires before list actually renders → subsequent selectors fail with "element not found" instead of "test skipped because no data".
- **Suggested fix direction:** Replace the timeouts with explicit `waitFor` assertions tied to visible state. For staging-details-sheet: `await page.waitForSelector('[data-testid="staged-vacancy-card"], [data-testid="staging-empty-state"]')`. For enrichment: wait on the `add-job-btn` visible state (already present at line 22) and then remove the redundant timeout.

### M-T-05 — `a11y-deck-view.spec.tsx` stubs `DeckCard` — real card a11y never axed
- **File:** `__tests__/a11y-deck-view.spec.tsx:73-77`
- **Severity:** MEDIUM
- **Rule:** Mocks should not hide the thing the test claims to cover.
- **Finding:** The a11y test stubs `DeckCard` with a trivial `<div>{title}</div>` component. This means axe only checks the DeckView wrapper (counter, action buttons, keyboard hints, live regions) — not the actual card contents that the user interacts with (title h3, match-score ring SVG, description collapse toggle, source badges, date formatting, Info button). The file name (`a11y-deck-view`) implies "deck view a11y is covered" but the coverage is significantly narrower than the name suggests. The real DeckCard has an `onInfoClick` button added in this sprint that lacks its own a11y assertions.
- **Reproduction / rationale:** Introduce an a11y violation inside `DeckCard` (e.g. `<div role="button">Click me</div>` without a keyboard handler) — the test still passes because axe never sees the real card.
- **Suggested fix direction:** Remove the DeckCard mock OR create a separate `__tests__/a11y-deck-card.spec.tsx` that renders the real DeckCard with a populated fixture and runs axe on it. The latter is probably safer because the full DeckView render has heavy dependencies (SuperLikeCelebrationHost → router → ...).

### M-T-06 — `StagedVacancyDetailSheet.spec.tsx` mocks the entire Sheet primitive, hiding focus-trap and Escape behavior
- **File:** `__tests__/StagedVacancyDetailSheet.spec.tsx:62-120`
- **Severity:** MEDIUM
- **Rule:** Tests assert against behavior, not implementation details — and should not mock away the behavior under test.
- **Finding:** The spec stubs `@/components/ui/sheet` so `Sheet` renders as a plain `<div>` and `SheetContent` as `<div role="dialog">`. This skips:
  1. Focus trap (Radix `DismissableLayer` keeps Tab inside the sheet).
  2. Escape-to-close (the ADR-030 contract requires Escape to close the sheet AND allow the SuperLikeCelebration's global Escape listener to coexist).
  3. Auto-focus on open.
  4. Focus restoration to the trigger on close.
  5. `aria-describedby` wiring to the `SheetDescription` id.
  The test title implies "open/close behavior" coverage but none of these are tested. The `useMediaQuery` mock also hard-codes `true` (desktop) so the mobile-bottom branch never runs.
- **Reproduction / rationale:** Break Escape-to-close inside the real Sheet primitive → the test passes because Escape never reaches the stubbed Sheet.
- **Suggested fix direction:** Let the real Sheet primitive render (Radix provides jsdom compat for non-portal testing). Remove the Sheet mock entirely — only mock ScrollArea and CompanyLogo. For portal issues, use `<Sheet modal={false}>` in test mode or `within(document.body)` queries. Add explicit tests for: Escape closes the sheet, Tab stays inside, aria-describedby resolves to the visible description text.

## LOW findings

### L-T-01 — `scripts/check-notification-writers.sh` grep pattern is `prisma.notification` only, misses `db.notification`
- **File:** `scripts/check-notification-writers.sh:37`
- **Severity:** LOW
- **Rule:** Enforcement scripts should match actual code idioms.
- **Finding:** The grep uses `prisma\.notification\.(create|createMany)`. 18 files in `src/` import the Prisma client as `import db from "@/lib/db"`. If a future notification writer is added via `db.notification.create(...)`, the script would not flag it even though it violates the SingleNotificationWriter invariant. There's also no meta-test pinning that the allowlist has not silently grown.
- **Reproduction / rationale:** Add `await db.notification.create({...})` to `src/actions/module.actions.ts` (which imports `db`). Run `bash scripts/check-notification-writers.sh` → reports OK, no violations.
- **Suggested fix direction:** Broaden the regex to `(prisma|db)\.notification\.(create|createMany)`. Add a jest test that invokes the script via `execSync` and asserts the exit code, pinning the allowlist. Alternatively, move the check to an ESLint rule (custom rule that traces imports to `@/lib/db` and flags `.notification.create` calls).

### L-T-02 — `useSuperLikeCelebrations.spec.ts` dedupe-test assertion may give a false positive on re-add semantics
- **File:** `__tests__/useSuperLikeCelebrations.spec.ts:150-160`
- **Severity:** LOW
- **Rule:** Assertions should match the documented contract.
- **Finding:** The test "re-adding the same jobId deduplicates (no stacked duplicates)" asserts `result.current.current?.vacancyTitle).toBe("First (re-added)")`. The hook's implementation (`src/hooks/useSuperLikeCelebrations.ts:56-72`) does `prev.filter(item => item.jobId !== entry.jobId)` then appends — so re-adding removes the existing entry and pushes the new one to the END. For a single-item queue that makes the new entry also the current, so the test passes. But for a multi-item queue, the behavior is: the oldest item stays current and the re-added item moves to the END. The test does not cover this: if the queue contained `[job-1, job-2]` and you re-added `job-2`, the order becomes `[job-1, job-2 (new title)]` with `current=job-1`. The test only covers the single-item case and implicitly asserts that re-adding promotes the new title to current, which is only true for a one-item queue. Future maintenance risk.
- **Reproduction / rationale:** Add a multi-item test where the dedupe target is NOT the current item and assert the queue order. Current test suite would pass it, but it's not there to catch changes to the dedupe semantics.
- **Suggested fix direction:** Add one test: queue `[A, B, C]`, re-add `B` → assert items are `[A, C, B (new title)]` and `current` is still `A`.

### L-T-03 — `jest.config.ts` has no `slowTestThreshold` configured
- **File:** `jest.config.ts:176`
- **Severity:** LOW
- **Rule:** Test performance guard — no test should silently take >5s.
- **Finding:** The config comment at line 176 references `slowTestThreshold: 5` but leaves it commented out. Several specs in this sprint use fake timers and advance them by 10+ seconds (webhook channel retry backoffs, SuperLikeCelebration auto-dismiss). None of them are actually slow in wall-clock time, but any new test author could write a `setTimeout(..., 10000)` under real timers and not be warned. The VM resource guard (`maxWorkers: 1`) also means one slow test blocks the entire suite.
- **Reproduction / rationale:** Write a test with `await new Promise(r => setTimeout(r, 10000))` → Jest reports `PASS` without any slow-test warning.
- **Suggested fix direction:** Uncomment `slowTestThreshold: 5` in `jest.config.ts`. Sprint 2 commits actively reference VM resource concerns — this is a natural companion guard.

### L-T-04 — Test fixtures `mockStagedVacancy` typed as `StagedVacancy`, used as `StagedVacancyWithAutomation` everywhere with inline spread
- **File:** `src/lib/data/testFixtures.ts:1045` (and consumers)
- **Severity:** LOW
- **Rule:** Shared fixtures should match the most commonly consumed type.
- **Finding:** `mockStagedVacancy` is typed `StagedVacancy` (no `automation` field). All staging/deck tests need `StagedVacancyWithAutomation` and therefore do `{ ...mockStagedVacancy, automation: { id: "auto-1", name: "EU Tech Jobs" } }` inline (see DeckView.spec, DeckCard.spec, PromotionDialog.spec, a11y-deck-view.spec, SuperLikeCelebration.spec indirectly). This duplication is small but invites drift — if `StagedVacancyWithAutomation` gains a new required field, every consumer breaks individually. A Sprint 1 addition (`testFixtures.ts` gained 103 lines) would have been the right time to add a `mockStagedVacancyWithAutomation` helper.
- **Reproduction / rationale:** Add a new required field to `StagedVacancyWithAutomation` → at least 5 test files need independent updates.
- **Suggested fix direction:** Add to `testFixtures.ts`:
  ```ts
  export const mockStagedVacancyWithAutomation: StagedVacancyWithAutomation = {
    ...mockStagedVacancy,
    automation: { id: mockAutomation.id, name: mockAutomation.name },
  };
  ```
  Migrate consumers to use it directly.

## Out-of-scope notes

### Jest worker enforcement is solid
`jest.config.ts:90-106` hard-defaults `maxWorkers: 1` with an env override (`JEST_MAX_WORKERS`), and `scripts/test.sh:27-54` translates the common `--workers=N` typo to `--maxWorkers=N` and defaults to 1 when no flag is given. The historical context comment (the silent `--workers` typo that ran tests at the Jest default for months) is a model of commit-trail honesty. This is the strongest test-infra improvement in Sprint 2 — fully verified. The `dc48f4b` commit for this fix is the right level of defense-in-depth.

### `module.actions.spec.ts` absent-mock pattern is excellent — propagate it
The `deactivateModule` test uses a clever pattern where `prisma.notification` is INTENTIONALLY omitted from the mock object. Any regression that re-introduces a direct notification write throws `Cannot read properties of undefined (reading 'create')` — a loud, correct failure. This pattern is worth documenting in a test-writing guide so future contributors reach for it when pinning "never write to X" invariants. Candidate next applications: any action that must route through an event bus (bulk actions → BulkActionCompleted event, retention → RetentionCompleted event).

### `SuperLikeCelebration.spec.tsx` is the most comprehensive spec in the sprint
Lines 207–456 cover five CRIT-Y3 sub-invariants with explicit commentary on each (focus-on-mount, reduced-motion variant, programmatic-focus-does-not-pause, user-focus-does-pause, global Escape, ARIA masking regression guard). The grace-period `describe` block (lines 459–665) is equally strong. This file is a good template for "regression guards with citations" — other specs should follow its lead.

### `degradation.spec.ts` and `webhook-channel.spec.ts` correctly mock `prisma.notification` (they are the allowlisted direct writers)
These two files are on the `check-notification-writers.sh` allowlist, so their tests legitimately mock `prisma.notification.create` / `createMany` and assert direct writes. This is consistent with production reality and not a violation of the SingleNotificationWriter invariant. Worth noting here so future reviewers don't flag them incorrectly.

### Coverage blind spot in `DeckCard` onInfoClick button
`DeckCard.tsx` gained an `onInfoClick` prop in this sprint, but `DeckCard.spec.tsx` has no test for the button's presence, click handling, or aria-label. This is lower priority than the H-T-03 routing gap because the button is a simple pass-through, but it's a blind spot for future maintenance. Consider adding a smoke test when the next DeckCard change lands.
