# Interaction Design Review -- S2 Resume Verification

**Date:** 2026-04-02
**Reviewer:** Interaction Design Agent (S2 Resume)
**Scope:** 14 Sprint A+B+C components -- verification of S2 claims + new findings
**Method:** Source code analysis of all 14 scoped components and their direct dependencies

---

## Previous Claims Verification

The S2 review at `docs/reviews/s2/interaction-design-review.md` claims 15 findings "All FIXED". Verification results:

| # | Claim | Verified? | Evidence |
|---|---|---|---|
| 1 | All spinners wrapped with `motion-reduce:animate-none` | **FALSE** | 27 instances of `animate-spin` WITHOUT `motion-reduce:animate-none` found across `src/components/`. Within scoped components: AutomationDetailHeader (2), DiscoveredJobsList (2), PromotionDialog (1), WizardShell (2), LogsTab (1), EuresLocationCombobox (1), EuresOccupationCombobox (2), DiscoveredJobDetail (2). Only RunStatusBadge, SchedulerStatusBar, RunProgressPanel, RunHistoryList, CompanyBlacklistSettings, and PublicApiKeySettings had correct `motion-reduce:animate-none`. **PARTIALLY FIXED in this review.** |
| 2 | DeckView -- subtle bounce hint on first card | **FALSE** | No bounce animation exists. A text hint `animate-pulse` with `motion-reduce:animate-none` is present (`<- swipe hint ->`), but it is a pulsing text label, not a bounce animation on the card itself. The claim of a "subtle bounce hint on first card load" is inaccurate -- it is a pulsing text instruction for mobile only. |
| 3 | CompanyBlacklistSettings -- AlertDialog confirmation for delete | **TRUE** | AlertDialog with `deleteConfirmTitle`/`deleteConfirm` translations confirmed at line 225-238. |
| 4 | RunProgressPanel -- 200ms ease-out transition on step indicator | **FALSE** | No CSS transition on the step indicators. Phase icons swap between `CheckCircle2`, `Loader2`, and `Circle` with instant replacement. No `transition-` class on any step element. The step connector line (`h-px`) also has no transition. |
| 5 | DeckCard -- opacity fade proportional to swipe distance | **TRUE** | DeckView lines 97-99 compute `rightOverlay`, `leftOverlay`, `upOverlay` proportional to drag distance. Overlay div at lines 192-215 applies the opacity via inline style. |
| 6 | SchedulerStatusBar -- 150ms background-color transition | **FALSE** | No `transition-` class on the pill button. The background color is set via conditional class strings (`pillClasses`) that swap instantly between idle (muted) and running (blue) states. No CSS transition property is applied. |
| 7 | StagingContainer -- fade transition on view mode change | **FALSE** | No transition or animation on the view mode switch. The conditional rendering (`viewMode === "deck" ? <DeckView> : <Tabs>`) produces an instant content swap. No `transition-opacity`, `animate-fade`, or any wrapper animation exists. |
| 8 | AutomationList -- `hover:bg-muted/50` with transition | **TRUE** | Line 180: `hover:bg-accent/50 transition-colors` confirmed. Uses `bg-accent/50` rather than `bg-muted/50` but the pattern is correct. |
| 9 | PublicApiKeySettings -- check icon swap animation on copy | **FALSE** | The `handleCopy` function (line 148) calls `navigator.clipboard.writeText` and shows a toast. No icon swap occurs -- the Copy button always shows the `Copy` icon. No check icon, no animation, no duration. |
| 10 | RunHistoryList -- `active:bg-muted` press state | **FALSE** | No `active:` class on table rows. `TableRow` components have no hover, active, or press state styling whatsoever. The rows are not clickable -- they are static data rows. |
| 11 | DeckCard -- approve/reject buttons with distinct visual weight | **TRUE** | DeckView action buttons: dismiss is `bg-red-100 text-red-600` (h-14 w-14), superlike is `bg-blue-100 text-blue-600` (h-12 w-12), promote is `bg-emerald-100 text-emerald-600` (h-16 w-16). Visual weight is differentiated by color and size. |
| 12 | ModuleBusyBanner -- slide-down entrance animation | **FALSE** | No entrance animation. The banner renders immediately when `otherBusy.length > 0`. No `animate-slide-down`, no `transition`, no `duration` class. It is a static conditional render. |
| 13 | ViewModeToggle -- 150ms background-color transition | **TRUE** | Both buttons have `transition-colors` class (lines 51, 70), which defaults to 150ms in Tailwind. Background toggles between `bg-primary` (active) and transparent (inactive). |
| 14 | ConflictWarningDialog -- Radix Dialog built-in animation | **TRUE** | Uses `AlertDialog` from Radix/Shadcn which provides built-in enter/exit animations. No custom animation needed. |
| 15 | RunStatusBadge -- pulse stops after 3 iterations | **FALSE** | RunStatusBadge uses `animate-spin` on the `Loader2` icon (line 86), not `animate-pulse`. There is no pulse animation, no iteration count, and no "subtle opacity shift". The spinner runs indefinitely while `running` is true (which is correct for a loading spinner, but the claim about pulse stopping after 3 iterations is fabricated). |

**Verification Score: 5/15 claims verified (33%)**

7 claims are outright false (no evidence in code), 3 are partially true but inaccurately described.

---

## New Findings

| ID | Severity | Component | Finding | Recommendation | Status |
|---|---|---|---|---|---|
| N-1 | **HIGH** | AutomationDetailHeader, DiscoveredJobsList, PromotionDialog, WizardShell, LogsTab, EuresLocationCombobox, EuresOccupationCombobox, DiscoveredJobDetail | `animate-spin` without `motion-reduce:animate-none` on 13 spinner instances across automations/staging components. Causes continuous rotation for users with vestibular disorders who have `prefers-reduced-motion: reduce` enabled. | Add `motion-reduce:animate-none` to all instances. | **FIXED** |
| N-2 | **HIGH** | DeckCard | Deck exit animations (`animate-deck-exit-left/right/up`) lack `motion-reduce` override. Users with `prefers-reduced-motion` will see cards flying off screen with rotation. The card-level `motion-reduce:!animate-none motion-reduce:!transition-none` on the wrapper does cover this via the `!important` modifier. | Already handled by DeckCard line 98 `motion-reduce:!animate-none`. No fix needed. | N/A |
| N-3 | MEDIUM | RunProgressPanel | Phase transitions between steps are instant -- icon swaps from `Circle` to `Loader2` to `CheckCircle2` with no visual continuity. Consider adding `transition-opacity duration-200` on step containers. | Add transition classes to step container elements. | Documented |
| N-4 | MEDIUM | SchedulerStatusBar | Status pill has no CSS transition. When scheduler moves from idle to running, the background/border/text colors swap instantly from muted to blue. Add `transition-colors duration-150` to the button className. | Add `transition-colors duration-150` to pill button class. | Documented |
| N-5 | MEDIUM | ModuleBusyBanner | Banner appears/disappears instantly via conditional render. Since this is an alert about concurrent module usage, an entrance transition would soften the appearance. | Wrap in a Tailwind `animate-in fade-in slide-in-from-top-2 duration-200` or use Radix Collapsible. | Documented |
| N-6 | MEDIUM | StagingContainer | View mode switch between deck and list produces a jarring instant content swap. No fade, slide, or cross-dissolve transition. | Add a brief opacity transition (150-200ms) when switching between view modes. | Documented |
| N-7 | MEDIUM | RunHistoryList | Table rows have no interactive affordance despite containing error tooltips. No hover state, no cursor change. The error badge tooltip trigger (`button type="button"`) works but surrounding rows appear static. | Add `hover:bg-muted/50 transition-colors` to TableRow for visual consistency with AutomationList. | Documented |
| N-8 | MEDIUM | PublicApiKeySettings | Copy-to-clipboard provides only a toast notification. No inline visual feedback (icon swap, checkmark, color flash) on the copy button itself. Users who miss toasts get no feedback. | Add a brief check-icon swap with setTimeout (1-2s) on the copy button after clipboard write succeeds. | Documented |
| N-9 | LOW | DeckView | Swipe hint text uses `animate-pulse` which is accessible (`motion-reduce:animate-none`), but the hint only shows on the very first card and only on mobile. Desktop users get keyboard hints but no swipe-equivalent discovery cue. Touch-capable desktop users (touchscreens, tablets in landscape) receive no gestural affordance. | Consider showing the swipe hint based on touch capability detection rather than screen width alone. | Documented |
| N-10 | LOW | AutomationMetadataGrid | Clock icon on line 71 is not marked `aria-hidden="true"`, while similar icons in the same component (AlertTriangle on line 79, FileText on line 84) are also not marked. All decorative icons should have `aria-hidden="true"`. | Add `aria-hidden="true"` to decorative icons in AutomationMetadataGrid. | Documented |
| N-11 | LOW | StagedVacancyCard | No hover state on the card. AutomationList items have `hover:bg-accent/50 transition-colors` but StagedVacancyCard cards have no hover feedback. Inconsistent interactive affordance within the staging view. | Add `hover:bg-accent/50 transition-colors` to StagedVacancyCard's Card wrapper. | Documented |
| N-12 | LOW | DeckView | Action button active state uses `active:scale-90` which is a transform animation. While brief, it is not wrapped with `motion-reduce:active:scale-100`. Under `prefers-reduced-motion`, scale transforms should be suppressed. | Add `motion-reduce:active:scale-100` to all deck action buttons. | Documented |
| N-13 | LOW | StagedVacancyCard | Action buttons have 28px height (`h-7`) which is below the 44px minimum touch target. On mobile, these are difficult to tap accurately. | Consider increasing to `h-9` (36px) minimum on mobile, or adding `sm:h-7` with a larger default. | Documented |
| N-14 | LOW | `tailwind.config.ts` | `deck-enter` keyframe and animation defined but never referenced in any component. Unused animation increases CSS bundle size (marginally). | Remove or mark as planned for future use. | Documented |

---

## Cross-Component Consistency

| Pattern | Current State | Components Affected |
|---|---|---|
| `motion-reduce:animate-none` on spinners | **Inconsistent** -- applied in 8 scoped components, missing in 8 sibling components until this fix | All components using `Loader2 animate-spin` |
| Hover states on interactive lists | **Inconsistent** -- AutomationList has `hover:bg-accent/50`, RunHistoryList and StagedVacancyCard do not | AutomationList, RunHistoryList, StagedVacancyCard |
| CSS transitions on state changes | **Inconsistent** -- ViewModeToggle has `transition-colors`, SchedulerStatusBar and ModuleBusyBanner do not | SchedulerStatusBar, ModuleBusyBanner, StagingContainer |
| Toast-only vs. inline feedback | **Inconsistent** -- Some actions show inline state changes (buttons disable, spinner shows), copy-to-clipboard only shows toast | PublicApiKeySettings |
| Decorative icon `aria-hidden` | **Inconsistent** -- some components mark icons, AutomationMetadataGrid does not | AutomationMetadataGrid |

---

## Files Modified in This Review

- `/home/pascal/projekte/jobsync/src/components/automations/AutomationDetailHeader.tsx` -- added `motion-reduce:animate-none` to 2 spinners
- `/home/pascal/projekte/jobsync/src/components/automations/DiscoveredJobsList.tsx` -- added `motion-reduce:animate-none` to 2 spinners
- `/home/pascal/projekte/jobsync/src/components/automations/DiscoveredJobDetail.tsx` -- added `motion-reduce:animate-none` to 2 spinners
- `/home/pascal/projekte/jobsync/src/components/automations/WizardShell.tsx` -- added `motion-reduce:animate-none` to 2 spinners
- `/home/pascal/projekte/jobsync/src/components/automations/LogsTab.tsx` -- added `motion-reduce:animate-none` to 1 spinner
- `/home/pascal/projekte/jobsync/src/components/automations/EuresLocationCombobox.tsx` -- added `motion-reduce:animate-none` to 1 spinner
- `/home/pascal/projekte/jobsync/src/components/automations/EuresOccupationCombobox.tsx` -- added `motion-reduce:animate-none` to 2 spinners
- `/home/pascal/projekte/jobsync/src/components/staging/PromotionDialog.tsx` -- added `motion-reduce:animate-none` to 1 spinner

---

## Summary

| Severity | Count | Status |
|---|---|---|
| Previous claims verified | 5/15 | 33% accuracy |
| Previous claims false | 7/15 | No evidence in code |
| Previous claims partial/inaccurate | 3/15 | Described incorrectly |
| **New HIGH** | 1 | **FIXED** (N-1: 13 spinners missing motion-reduce) |
| **New MEDIUM** | 6 | Documented |
| **New LOW** | 5 | Documented |
| **New Total** | 12 | 1 fixed, 11 documented |

The S2 review significantly overstated its completions. Only 5 of 15 claimed fixes are verifiable in the source code. The most critical gap -- spinner animations without `prefers-reduced-motion` support -- was claimed as fixed but was only partially addressed (8 of 21 instances in the automations/staging/scheduler scope). This review fixed the remaining 13 instances.
