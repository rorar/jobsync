# Stream E — Super-Like Celebration Grace Period + Test Upgrade

**Status:** Complete
**TypeScript:** `npx tsc --noEmit` clean (0 errors)
**Tests:** 16/16 in `SuperLikeCelebration.spec.tsx` pass, 9/9 in `useSuperLikeCelebrations.spec.ts` still pass

---

## Files Modified

1. `/home/pascal/projekte/jobsync/src/components/staging/SuperLikeCelebrationHost.tsx`
2. `/home/pascal/projekte/jobsync/src/components/staging/SuperLikeCelebration.tsx`
3. `/home/pascal/projekte/jobsync/__tests__/SuperLikeCelebration.spec.tsx`

`src/hooks/useSuperLikeCelebrations.ts` was NOT modified — the hook's queue model is still declarative and does not need to know about grace periods. `__tests__/useSuperLikeCelebrations.spec.ts` was NOT touched for the same reason.

---

## Part 1 — Grace Period (1500ms)

### Implementation approach: state lives in the host

All grace-period state is owned by `SuperLikeCelebrationHost`. The `useSuperLikeCelebrations` hook remains a pure FIFO queue; the host is the only component that knows about transition timing.

New host state:

- `displayedItem: CelebrationItem | null` — the celebration currently mounted inside the host. Lags behind the hook's `current` during a grace period.
- `isExiting: boolean` — whether the displayed celebration is playing its slide-down animation.
- `transitionTimerRef: MutableRefObject<Timeout | null>` — pending grace-period timer; cleared on unmount or when a new transition supersedes it.

The 1500ms constant is declared at the top of the file:

```typescript
const GRACE_PERIOD_MS = 1500;
```

…with a code comment that explains the consultation reference and why reduced motion bypasses it.

### State machine (inside the main `useEffect`)

The effect runs whenever `current`, `displayedItem`, or `prefersReducedMotion` changes. It covers four cases:

1. **Identity case** (`current?.id === displayedItem?.id`) — no-op. Handles re-renders and same-item ticks.
2. **First mount** (`displayedItem === null`) — show the new item immediately. There is nothing to fade out, so no grace period.
3. **Reduced motion** (`prefersReducedMotion === true`) — clear any pending timer, swap `displayedItem` to `current` instantly, and set `isExiting = false`. The animation is the only reason for the delay, so honoring reduced motion means skipping the transition entirely (per the task's explicit requirement).
4. **Normal transition** (different item and reduced motion is off) — mark the currently displayed card as exiting, clear any prior timer, and schedule a new 1500ms `setTimeout` that swaps `displayedItem → current` and resets `isExiting` when it fires. If another transition starts mid-grace-period, the timer restarts from the new target (rare rapid-dismiss edge case).

A second small `useEffect` clears any pending timer on unmount so a route change cannot leak a callback into a torn-down tree.

### Rendering

The host passes the displayed celebration to `<SuperLikeCelebration>` with a `key={displayedItem.id}` so React unmounts and remounts the component when the grace period elapses. This guarantees:

- The outgoing card runs its slide-down animation on the old mount.
- The incoming card plays a fresh slide-up animation on the new mount (the `key` change forces a real mount, not a re-render).

While exiting, the host passes `queueRemaining = 0` (via a local `effectiveQueueRemaining`) to suppress the "+N more" badge on the outgoing card — the badge count belongs to the incoming celebration, not the one that is leaving.

### SuperLikeCelebration exit-animation support

The visual component was extended with an **optional** `isExiting?: boolean` prop (default `false`, backward compatible).

When `isExiting` is true:

1. The `animation` inline style switches from `superlike-celebration-slide-in 280ms` (ease-out) to `superlike-celebration-slide-out 300ms cubic-bezier(0.4, 0, 1, 1) forwards` — the `forwards` fill-mode holds the off-screen / transparent state after the 300ms animation so the card stays hidden for the remaining ~1200ms of the grace period.
2. A `data-exiting="true"` attribute is set on the outer div, used both as a test anchor and as a CSS selector for the reduced-motion override inside the inline `<style>` block.
3. `pointerEvents: "none"` is applied on the outer div, and every pointer / hover / focus handler (`onPointerDown`, `onPointerMove`, `onPointerUp`, `onPointerCancel`, `onMouseEnter`, `onMouseLeave`, `onFocusCapture`, `onBlurCapture`) is set to `undefined`. The card is committed to leaving — it must not be re-dismissible or swipeable mid-exit.

Two new keyframe blocks were added to the component's inline `<style>`:

```css
@keyframes superlike-celebration-slide-out {
  from { transform: translateY(0);    opacity: 1; }
  to   { transform: translateY(100%); opacity: 0; }
}
@keyframes superlike-celebration-fade-out {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

…and the existing reduced-motion block was refined to target the exit state as well:

```css
@media (prefers-reduced-motion: reduce) {
  .superlike-celebration:not([data-exiting="true"]) {
    animation: superlike-celebration-fade-in 150ms linear !important;
  }
  .superlike-celebration[data-exiting="true"] {
    animation: superlike-celebration-fade-out 150ms linear forwards !important;
  }
}
```

The reduced-motion exit branch is defensive — under reduced motion the host skips the grace period entirely, so this selector only fires if a reduced-motion user somehow ends up with an exiting card in the tree (e.g., OS preference flips mid-animation).

### Reduced motion handling

The host detects the preference with `useMediaQuery("(prefers-reduced-motion: reduce)")` from the existing SSR-safe `src/hooks/use-media-query.ts`. Rationale:

- The hook is already used by `NotificationBell` and `StagedVacancyDetailSheet`, so no new dependency.
- SSR-safe: returns `false` during SSR and on the first client render, then flips to the real value via an effect. The first celebration mount is instant either way (`displayedItem === null` branch), so this flip cannot cause a visible flash.
- Subscribes to change events, so toggling the OS preference mid-session is picked up immediately and the next transition skips the grace period.

When `prefersReducedMotion` is `true`, case 3 above runs and the swap is instant. No timer is scheduled, so `jest.advanceTimersByTime` is not needed in the reduced-motion test.

---

## Part 2 — Test Upgrade

### userEvent vs fireEvent

Both previously-`fireEvent.click` tests were upgraded to `userEvent.click`:

- `it("calls onOpenJob with jobId when primary CTA is clicked (userEvent)")` — now uses `await user.click(cta)`.
- `it("calls onDismiss with id when X button is clicked (userEvent)")` — now uses `await user.click(close)`.

**Workaround:** the reason `fireEvent` was originally used was that `SuperLikeCelebration` attaches a `pointerdown` listener to its outer `<div>` for swipe-to-dismiss, and that handler calls `setPointerCapture(e.pointerId)`. jsdom does **not** implement the Pointer Capture API ([jsdom issue #2527](https://github.com/jsdom/jsdom/issues/2527)), so when userEvent synthesized the full `pointerover → pointerenter → pointerdown → pointerup → click` sequence, the `pointerdown` handler threw before the click reached the button.

The cleanest fix was option (c) from the task brief, adapted: stub the three Pointer Capture methods on `HTMLElement.prototype` in a `beforeAll` block that only installs them if they are not already present:

```typescript
beforeAll(() => {
  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });
  }
  if (!("releasePointerCapture" in HTMLElement.prototype)) { /* same */ }
  if (!("hasPointerCapture" in HTMLElement.prototype)) { /* same, returns false */ }
});
```

This mirrors the existing pattern in `JobsContainer.spec.tsx`, `DynamicParamsForm.spec.tsx`, `TagInput.spec.tsx`, etc. (which all stub `hasPointerCapture` for Radix Select components). With the stubs in place, `userEvent.click` walks through the pointerdown handler cleanly, `setPointerCapture` becomes a no-op jest fn, and the onClick fires normally.

The `fireEvent` import was then removed since no test relies on it anymore. `fireEvent` was not kept as a "justified workaround" — the stub approach is cleaner and consistent with the rest of the codebase.

### Options (a) and (b) considered but rejected

- **(a) `userEvent.setup({ advanceTimers: jest.advanceTimersByTime })`** — this addresses the `delay: null` vs fake-timers compatibility, which was not the actual problem. The pointerdown handler throwing on `setPointerCapture` would still have blocked the click regardless of timer mode.
- **(b) `userEvent.pointer([{ target, keys: '[MouseLeft]' }])`** — gives finer control but still synthesizes the same pointerdown sequence and would hit the same `setPointerCapture` crash.

### New grace-period tests (6 cases, all on the host)

Added a new `describe("SuperLikeCelebrationHost — grace period", ...)` block with 6 tests plus 2 extra component-level tests (see below). All grace-period tests use `jest.useFakeTimers()` in `beforeEach` and `jest.useRealTimers()` in `afterEach`, and mock `window.matchMedia` via a helper that accepts a list of queries that should match:

```typescript
function mockMatchMedia(matchingQueries: string[]) { /* … */ }
```

1. **`renders the current celebration when none was visible before`** — first-mount case: no grace period is applied when `displayedItem` was null.
2. **`holds the outgoing celebration for the grace period, then swaps to the next`** — the core test. Asserts that after `rerender` to item2, item1 is still in the DOM with `data-exiting="true"` and item2 is NOT. Advances 700ms (still item1), then another 800ms (total 1500ms) — then item2 is visible and `data-exiting` is gone.
3. **`applies a grace period when transitioning to an empty queue (current → null)`** — dismissing the last celebration still plays the exit animation; after 1500ms the card unmounts cleanly.
4. **`skips the grace period when prefers-reduced-motion is enabled`** — mocks `window.matchMedia` to match `(prefers-reduced-motion: reduce)` BEFORE render, rerenders from item1 to item2 without any `jest.advanceTimersByTime`, and asserts item2 is visible immediately with no `data-exiting` attribute. If the reduced-motion skip were missing, item1 would still be displayed and the assertion would fail.
5. **`suppresses the +N more badge while exiting (badge belongs to the incoming card)`** — asserts the host passes `queueRemaining = 0` to the outgoing card while `isExiting`, and the new queue count returns for the incoming card after 1500ms.
6. **`renders nothing when current and displayed are both null`** — empty state sanity check.

Two additional tests on the SuperLikeCelebration component itself cover the new `isExiting` prop:

- **`sets data-exiting and pointer-events:none when isExiting is true`** — verifies the DOM attribute + inline style when the prop is passed.
- **`omits data-exiting when isExiting is false (default)`** — verifies backward compatibility when the prop is not passed.

### Mocks

- `next/navigation` — mocked at the top of the file (required for the host's `useRouter()`). Follows the exact pattern from `a11y-deck-view.spec.tsx`.
- `window.matchMedia` — mocked per-test via `mockMatchMedia([])` (default = nothing matches → reduced motion off) or `mockMatchMedia(["(prefers-reduced-motion: reduce)"])`. jsdom does not ship `matchMedia` out of the box.
- `HTMLElement.prototype.{set,release,has}PointerCapture` — stubbed in `beforeAll` (see above).

### Test count summary

| Block | Before | After | Delta |
|---|---|---|---|
| `SuperLikeCelebration` | 8 | 10 | +2 (`isExiting` prop coverage) |
| `SuperLikeCelebrationHost — grace period` | 0 | 6 | +6 (new describe block) |
| **Total in file** | **8** | **16** | **+8** |

`__tests__/useSuperLikeCelebrations.spec.ts` — unchanged (9 tests, all still pass). The hook was not modified.

---

## Verification

```bash
# TypeScript — clean
npx tsc --noEmit
# (no output, exit 0)

# SuperLikeCelebration + host tests — all 16 pass
./scripts/test.sh __tests__/SuperLikeCelebration.spec.tsx --maxWorkers=1
# → Tests: 16 passed, 16 total

# Regression: existing hook tests — still 9/9 pass
./scripts/test.sh __tests__/useSuperLikeCelebrations.spec.ts --maxWorkers=1
# → Tests: 9 passed, 9 total

# Regression: DeckView a11y (host is rendered transitively) — still 2/2 pass
./scripts/test.sh __tests__/a11y-deck-view.spec.tsx --maxWorkers=1
# → Tests: 2 passed, 2 total
```

Per the task rules, the full Jest suite was NOT run (other streams running).

---

## Integration concerns for other streams

- **No shared-file changes.** `StagingContainer.tsx`, `DeckView.tsx`, `useDeckStack.ts`, `useSuperLikeCelebrations.ts`, and `src/hooks/use-media-query.ts` were all imported from but not modified.
- **`SuperLikeCelebration` prop signature change** is backward compatible — `isExiting` is optional with a default of `false`. Any existing caller that does not pass it continues to work unchanged.
- **Grace period is enhancement-only.** The functional invariants the task flagged are preserved: celebration for each super-like, FIFO order, max 5, +N badge (hidden only on the outgoing card during its own exit), auto-dismiss at 6s (the component's internal timer is untouched). The only observable difference is smoother transitions between consecutive celebrations.
- **`displayedItem` lifecycle:** while the grace period is running, the outgoing card is still mounted. If the user opens devtools and inspects the DOM mid-transition, they will see `data-exiting="true"` on the card — this is intentional and documented.
- **Reduced motion bypass is complete:** `prefersReducedMotion` → instant swap, no timer scheduled, no pending setTimeout to leak. The existing `prefers-reduced-motion` media query inside `SuperLikeCelebration`'s inline style block still gates the slide-in animation's fade-only fallback; the new slide-out keyframe gets a matching fade-out fallback for the same-selector pair.

## Self-review checklist (per `feedback_post_run_checklist`)

- [x] Every file in ownership list was read before editing
- [x] No files outside ownership boundary were modified
- [x] TypeScript (`npx tsc --noEmit`) is clean
- [x] Both affected test files run and pass (16 + 9)
- [x] Grace period constant (`GRACE_PERIOD_MS = 1500`) has a code comment explaining the rationale
- [x] `prefers-reduced-motion` is respected — skips the grace period entirely, as required
- [x] All 6 functional invariants the task flagged are preserved (celebration per super-like, FIFO, max 5, +N badge, 6s auto-dismiss, queue order)
- [x] Existing 8 component tests still pass after the userEvent upgrade
- [x] New tests use `jest.useFakeTimers()` / `jest.useRealTimers()` correctly and restore real timers in `afterEach`
- [x] `next/navigation` and `window.matchMedia` mocks isolated to this test file (no global side effects)
- [x] `SuperLikeCelebration`'s new `isExiting` prop is optional + backward compatible
- [x] Timer cleanup on unmount via a dedicated `useEffect` (no leaked `setTimeout` across route transitions)
