# S2 WCAG 2.2 Audit — New Success Criteria

**Date:** 2026-04-02
**Scope:** 13 Sprint B+C components against WCAG 2.2 new/updated criteria
**Status:** All findings FIXED

## CRITICAL Blockers (6)

| ID | Criterion | Component | Finding | Resolution |
|---|---|---|---|---|
| W22-C1 | 2.4.7 Focus Visible | DeckView | `outline-none` on card container removes visible focus indicator entirely | FIXED — replaced with `focus-visible:ring-2 focus-visible:ring-ring` |
| W22-C2 | 4.1.2 Name, Role, Value | AutomationList | Nested `<button>` inside `<Link>` — assistive tech cannot determine primary action | FIXED — separated into distinct interactive regions |
| W22-C3 | 2.4.11 Focus Not Obscured | DeckCard | Tooltip on hover not keyboard-focusable — content inaccessible to keyboard users | FIXED — added `tabIndex={0}` and focus trigger |
| W22-C4 | 2.4.11 Focus Not Obscured | RunProgressPanel | Phase tooltip not keyboard-accessible | FIXED — added focusable trigger element |
| W22-C5 | 2.5.8 Target Size (Minimum) | DeckCard | "Show more" link target area below 24x24px minimum | FIXED — increased to `min-h-[44px] min-w-[44px]` touch target |
| W22-C6 | 1.4.3 Contrast (Minimum) | Multiple | `amber-600` on white background: 3.1:1 (below 4.5:1 threshold) | FIXED — see color contrast fixes below |

## Color Contrast Fixes

| Original Token | Contrast Ratio | Replacement | New Ratio | Components |
|---|---|---|---|---|
| `amber-600` | 3.1:1 | `orange-700` | 4.6:1 | RunStatusBadge, SchedulerStatusBar |
| `amber-500` | 2.8:1 | `amber-700` | 4.9:1 | DeckCard priority badge |
| `muted-foreground` + 50% opacity | 2.4:1 | `muted-foreground` (full opacity) | 5.2:1 | StagingContainer, RunHistoryList |

## Key PASS Results

| Criterion | Component | Why It Passes |
|---|---|---|
| 2.5.7 Dragging Movements (AA) | DeckView | Button alternatives (approve/reject) + keyboard shortcuts (arrow keys) exist alongside swipe gestures |
| 2.4.12 Focus Not Obscured (Enhanced) | ConflictWarningDialog | Dialog overlay ensures focused element is fully visible |
| 2.4.13 Focus Appearance | RunStatusBadge | 2px ring with offset, clearly visible on all backgrounds |
| 3.2.6 Consistent Help | Settings panels | Help text consistently placed below form fields |
| 3.3.7 Redundant Entry | PublicApiKeySettings | Key name pre-filled from previous entry pattern |

## axe-core Infrastructure

**Gap identified:** No automated a11y testing in the test suite. Manual review required for every component change.

**Resolution:** `jest-axe` installed and integrated:
- Added `jest-axe` dependency and TypeScript types
- Created axe-core test patterns for component tests
- New tests verify zero a11y violations on render for all 13 reviewed components

## WCAG 2.2 Criteria Checklist

| Criterion | Level | Applicable | Status |
|---|---|---|---|
| 2.4.11 Focus Not Obscured (Minimum) | AA | Yes | PASS (after fixes) |
| 2.4.12 Focus Not Obscured (Enhanced) | AAA | Partial | PASS where applicable |
| 2.4.13 Focus Appearance | AAA | Partial | PASS where applicable |
| 2.5.7 Dragging Movements | AA | Yes (DeckView) | PASS |
| 2.5.8 Target Size (Minimum) | AA | Yes | PASS (after fixes) |
| 3.2.6 Consistent Help | A | Yes | PASS |
| 3.3.7 Redundant Entry | A | Partial | PASS |
| 3.3.8 Accessible Authentication (Minimum) | AA | N/A (no CAPTCHA) | N/A |
| 3.3.9 Accessible Authentication (Enhanced) | AAA | N/A | N/A |

## Findings Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 6 | All FIXED |
| HIGH | 0 | -- |
| MEDIUM | 8 | All FIXED |
| LOW | 5 | All FIXED |
| **Total** | **19** | **All FIXED** |
