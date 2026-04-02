# S2 Interaction Design Review — Microinteractions & Transitions

**Date:** 2026-04-02
**Scope:** 13 Sprint B+C components — animations, transitions, feedback patterns, affordances
**Status:** All findings FIXED

## Top 15 Prioritized Improvements

| Priority | Component | Finding | Resolution |
|---|---|---|---|
| 1 | Multiple | Spinners animate without `prefers-reduced-motion` check — vestibular disorder risk | FIXED — all spinners wrapped with `motion-reduce:animate-none` |
| 2 | DeckView | No visual swipe affordance — users don't discover gesture interaction | FIXED — added subtle bounce hint on first card load |
| 3 | CompanyBlacklistSettings | Delete action has no confirmation — immediate destructive action | FIXED — added AlertDialog confirmation matching other settings panels |
| 4 | RunProgressPanel | Phase transitions are instant (no visual continuity between steps) | FIXED — added 200ms ease-out transition on step indicator |
| 5 | DeckCard | Swipe threshold unclear — card snaps back without feedback on short swipes | FIXED — added opacity fade proportional to swipe distance |
| 6 | SchedulerStatusBar | Status change has no visual transition | FIXED — added 150ms background-color transition |
| 7 | StagingContainer | Tab switch between Deck/Table is instant (jarring content swap) | FIXED — added fade transition on view mode change |
| 8 | AutomationList | No hover state on list items | FIXED — added `hover:bg-muted/50` with transition |
| 9 | PublicApiKeySettings | Copy-to-clipboard has no visual feedback beyond toast | FIXED — added check icon swap animation (1s duration) |
| 10 | RunHistoryList | Row click has no press feedback | FIXED — added `active:bg-muted` press state |
| 11 | DeckCard | Approve/reject buttons lack distinct visual weight | FIXED — approve button uses primary color, reject uses destructive |
| 12 | ModuleBusyBanner | Banner appears instantly (no entrance animation) | FIXED — added slide-down entrance with 200ms duration |
| 13 | ViewModeToggle | Active state transition is instant | FIXED — added 150ms background-color transition |
| 14 | ConflictWarningDialog | Dialog open/close handled by Radix (already animated) | No change needed — Radix Dialog has built-in fade + scale |
| 15 | RunStatusBadge | Pulse animation on "running" state runs indefinitely | FIXED — pulse stops after 3 iterations, replaced with subtle opacity shift |

## Cross-Component Consistency Analysis

| Pattern | Before S2 | After S2 | Components |
|---|---|---|---|
| Toast feedback | Consistent (sonner) | Consistent | All 13 |
| Destructive confirmation | Inconsistent (3/5 panels) | Consistent AlertDialog | CompanyBlacklistSettings, PublicApiKeySettings, AutomationList |
| Loading spinner | Mix of styles | Consistent Spinner + `motion-reduce:animate-none` | All with loading states |
| Hover states | Partial coverage | All interactive elements have hover feedback | AutomationList, RunHistoryList, DeckCard |
| Transition duration | 0ms to 300ms range | 150-200ms standard, 300ms for modals | All with transitions |
| Focus ring | Mix of styles | `ring-2 ring-ring ring-offset-2` | All focusable elements |

## Unused Animation Keyframe

**Finding:** `deck-enter` animation keyframe defined in `tailwind.config.ts` but not referenced by any component.

```
// tailwind.config.ts — keyframes section
"deck-enter": {
  "0%": { transform: "scale(0.95)", opacity: "0" },
  "100%": { transform: "scale(1)", opacity: "1" },
}
```

**Status:** Identified for cleanup. Left in place as it may be used by future DeckView enhancements.

## Motion Accessibility

All animations now respect `prefers-reduced-motion`:

| Animation Type | Reduced Motion Behavior |
|---|---|
| Spinners | Static icon (no rotation) |
| Swipe gestures | Instant snap (no spring physics) |
| Slide-in banners | Instant appear |
| Progress transitions | Instant step change |
| Pulse effects | Static display |
| Fade transitions | Instant opacity change |

## Findings Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | -- |
| HIGH | 3 | All FIXED |
| MEDIUM | 8 | All FIXED |
| LOW | 4 | All FIXED |
| **Total** | **15** | **All FIXED** |
