# Stream 5 — Team Review (5 parallel specialists)

## Scope
Review of both team-feature runs against the pre-existing `main` baseline.
Commit range: `a92aaf3..HEAD` (roughly 13 commits, ~4800 lines changed)
Reviewers: `security`, `performance`, `architecture`, `testing`, `accessibility`

## Summary of findings

| Severity | Count |
|----------|-------|
| CRITICAL | 5     |
| HIGH     | 23    |
| MEDIUM   | 28    |
| LOW      | 21    |
| **Total**| **77**|

The architecture reviewer was the most valuable of the five — it surfaced
CRIT-A2 (super-like celebration dead path in auto-approve-OFF flow) which
none of the other four dimensions could catch. Security/performance/testing/
accessibility operate on patterns; architecture operates on contracts
between layers.

## Detailed CRITICAL findings (the 5 that drive Sprint 1)

### CRIT-A1 — Architecture — 6th direct notification writer
- **File:** `src/actions/module.actions.ts:262` (`deactivateModule`)
- **Issue:** Calls `prisma.notification.createMany()` with a pre-composed
  English string, no `data` blob, and no `titleKey`. Violates the
  `LateBoundLocale` invariant (specs/notification-dispatch.allium) and
  ADR-030's rule that any notification write must populate the 5W+H
  structured fields.
- **Risk:** Users on non-English locales see English text. Also likely to
  produce **duplicate** notifications because the same deactivation is
  already observed by `notification-dispatcher.ts:handleModuleDeactivated`
  via `ModuleDeactivated` domain events.
- **How found:** Stream 4's `scripts/check-notification-writers.sh` grep
  discovered this writer — it was missed by the Stream H blind-spot pass
  because the earlier grep only looked under `src/lib/`.
- **Fix direction:** Absorb Stream 2's event-emission refactor scope.
  Remove the direct write entirely; emit a domain event and let the
  dispatcher create the notification via `InAppChannel`. Use the
  `backend-development:architecture-patterns` skill for the event-emission
  design (single-writer invariant, idempotency, ordering).

### CRIT-A2 — Architecture — Super-like celebration dead path
- **Files:**
  - `src/components/staging/PromotionDialog.tsx` — `onSuccess: () => void`
  - `src/components/staging/StagingContainer.tsx:605-612` —
    `promotionResolveRef.current({ success: true })` (no `createdJobId`)
- **Issue:** When auto-approve is OFF (the default), the promotion dialog
  opens. `PromotionDialog.handlePromote` receives the full
  `ActionResult<{ jobId, stagedVacancyId }>` from the server action but
  `onSuccess` has the signature `() => void` — the jobId is **thrown away**.
  The promise that `useDeckStack.performAction` awaits then resolves as
  `{ success: true, createdJobId: undefined }`, and the
  `useSuperLikeCelebrations` queue never receives the job id. The celebration
  fly-in (Stream 3 of the honesty gate sprint) is **dead in the default
  flow** and only works when auto-approve is enabled.
- **Why undetected:** Every test either mocks the promise resolution or
  uses the auto-approve path. No integration test covers the full chain
  deckCard → confirmation dialog → promotion → celebration.
- **Fix direction:** Refine `PromotionDialog.onSuccess` to
  `(result: { jobId: string }) => void`. Thread `data.jobId` through in
  `handlePromote`. Update `promotionResolveRef` typing and plumb the
  `createdJobId` into the final `performAction` resolution. Use the
  `backend-development:architecture-patterns` skill for the covariant
  return type refinement (already ADR-030 compliant).

### CRIT-Y1 — Accessibility — Deck action button target sizes
- **Files:**
  - `src/components/staging/DeckCard.tsx` — Info button is `h-7 w-7` (28×28)
  - `src/components/staging/DeckView.tsx` — Block / Skip / Undo are
    `h-10 w-10` (40×40)
- **Rule violated:** WCAG 2.5.5 AAA (44×44) and 2.5.8 AA (24×24). 28×28
  fails even the AA minimum.
- **Impact:** Users with motor impairment or on touch devices can miss the
  target. Info is especially painful because it's the keyboard shortcut
  entry point (`i`) and the fallback for opening the details sheet.
- **Fix direction:** Grow to `h-11 w-11` (44×44) with matching icon sizes,
  OR add a 44×44 invisible hit-area wrapper around the visible icon. Keep
  the same visual weight.

### CRIT-Y2 — Accessibility — Color-only toggle state + redundant ARIA
- **File:** `src/components/staging/StagingLayoutToggle.tsx`
- **Issues:**
  1. Active state is signalled **only** by background color — fails WCAG
     1.4.1 (Use of Color).
  2. Each radio has THREE redundant accessible name sources:
     `aria-label`, a visually-hidden span, and a `title` attribute. Screen
     readers may announce the label twice or mix them. The `title` also
     creates a tooltip that interferes with keyboard navigation.
- **Fix direction:**
  1. Add a non-color indicator — a small checkmark overlay, a bold weight
     change, or an outline on the active radio.
  2. Keep ONLY `aria-label`. Remove the sr-only span and the `title`
     attribute.

### CRIT-Y3 — Accessibility — SuperLikeCelebration keyboard orphan + ARIA masking
- **Files:** `src/components/staging/SuperLikeCelebration.tsx` +
  `SuperLikeCelebrationHost.tsx`
- **Issues:**
  1. The "Open job" CTA is keyboard-orphaned: when the celebration mounts,
     focus remains on whatever triggered the super-like (the deck card).
     Users must Tab through the whole DOM to reach the CTA before
     auto-dismiss fires.
  2. No global Escape listener — only the inner `onKeyDown` of the
     component, which requires focus to already be inside.
  3. The `aria-label` on the status container (line 174) **overrides** the
     inner text content for screen readers. It announces "Super-liked!"
     **without** the vacancy title, so AT users lose context.
  4. Auto-dismiss timer is not pause-aware when AT focus is inside the
     celebration — violates WCAG 2.2.1 (Timing Adjustable). The hover-pause
     works but not the focus-pause.
- **Fix direction:**
  1. On mount, programmatically move focus to the "Open job" button
     (respect the 1500ms grace-period exit).
  2. Add a global `document.addEventListener("keydown", ...)` while
     mounted that closes on Escape.
  3. Change the container aria-label to include the vacancy title, OR
     remove it and rely on the visible text content.
  4. Add `focusin` / `focusout` handlers to pause the auto-dismiss timer
     the same way `pointerenter` / `pointerleave` do.

## HIGH / MEDIUM / LOW findings

The detailed per-finding output of the 5 reviewers is not persisted on disk.
Each reviewer agent returned its findings via task-notifications during the
team-review run. Most reviewers also reported intermittent API 529
Overloaded pressure (same issue that killed Streams F and G in the honesty
gate sprint), but all 5 completed successfully.

**Breakdown by dimension** (approximate, from the task-notification
messages during Stream 5):

| Dimension      | CRIT | HIGH | MED | LOW | Total |
|----------------|------|------|-----|-----|-------|
| Architecture   | 2    | ~7   | ~6  | ~3  | ~18   |
| Accessibility  | 3    | ~7   | ~6  | ~4  | ~20   |
| Security       | 0    | ~1   | ~4  | ~3  | ~8    |
| Performance    | 0    | ~2   | ~5  | ~5  | ~12   |
| Testing        | 0    | ~6   | ~7  | ~6  | ~19   |
| **Total**      | 5    | 23   | 28  | 21  | 77    |

## Recovery path for Sprint 2 planning

The full per-finding detail is in the conversation transcript at
`~/.claude/projects/-home-pascal/579f56eb-fcbe-44f9-99d1-e09140ddfd3d.jsonl`
(pre-compaction). When Sprint 2 (HIGH) starts, pull the 23 HIGH items from
that transcript OR re-run `/agent-teams:team-review --reviewers security,
performance,architecture,testing,accessibility` against the post-Sprint-1
HEAD (cheaper than transcript reconstruction and gives fresh findings
after the CRITs are fixed).

## 4-sprint plan (user-approved)

- **Sprint 0** (this commit series) — land Streams 1/3/4/5 on `main` so
  Sprint 1 starts from a clean base.
- **Sprint 1** — 5 CRITICAL fixes (2 architecture + 3 accessibility).
  STOP and await `CONTINUE` or `CHAT ABOUT THIS`.
- **Sprint 2** — 23 HIGH fixes. Special rules: stop dev server + kill
  blocking processes before tests; no Jest during implementation; single
  full test run + build only at the last checkpoint before Sprint 3.
  STOP and await GO.
- **Sprint 3** — 28 MEDIUM fixes. STOP and await GO.
- **Sprint 4** — 21 LOW fixes. Final sprint.

Architecture and backend decisions in all sprints use the
`backend-development:architecture-patterns` skill.
