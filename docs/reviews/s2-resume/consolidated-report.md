# S2-Resume Consolidated Review Report

**Date:** 2026-04-02
**Sources:** Interaction Design Review, WCAG 2.2 Audit, UX Data Story
**Methodology:** Multi-reviewer finding deduplication and severity calibration

---

## Deduplication Summary

| Metric | Count |
|--------|-------|
| Raw findings (interaction design) | 14 (N-1 through N-14) |
| Raw findings (WCAG) | 15 (V-01 through V-15) |
| Raw findings total | 29 |
| Duplicates removed | 3 |
| Unique findings | 26 |

### Duplicate Mappings

| Interaction ID | WCAG ID | Component | Overlap | Kept As |
|---|---|---|---|---|
| N-1 | WCAG claim row 7 | Multiple (13 spinners) | `animate-spin` missing `motion-reduce:animate-none` -- same root issue, same fix | C-01 |
| N-10 | V-03 | AutomationMetadataGrid | Decorative icons (Clock, AlertTriangle, FileText) missing `aria-hidden="true"` -- identical finding | C-10 |
| N-13 | V-10 | StagedVacancyCard | Action buttons `h-7` (28px) below recommended touch target -- same component, same measurement | C-18 |

---

## Previous S2 Claims Assessment

Both reviews independently verified the original S2 review claims. Results:

| Review | Claims Checked | Fully Verified | Partially Verified | False | Accuracy |
|---|---|---|---|---|---|
| Interaction Design | 15 | 5 | 3 | 7 | 33% |
| WCAG 2.2 | 6 critical claims | 4 | 2 | 0 | 67-100% |

The interaction design review verified against all 15 original claims and found a 33% accuracy rate -- 7 claims had no evidence in the source code (fabricated transitions, animations, and icon swaps). The WCAG audit focused on 6 critical claims and found higher accuracy (4 fully verified, 2 partially -- functional but implemented differently than described).

The discrepancy makes sense: WCAG claims tend to be binary (element exists or not), while interaction design claims about "200ms ease-out transitions" and "pulse stops after 3 iterations" are specific enough to be falsifiable and were indeed false.

---

## Deduplicated Findings (by severity)

### CRITICAL (2 findings)

| ID | Component | Finding | Source | Status |
|---|---|---|---|---|
| C-01 | AutomationList | Clickable `<div>` with `onClick={router.push}` has no keyboard handler, no `tabIndex`, no focus styles. Keyboard users cannot navigate to automation detail via the card. | WCAG V-01 (2.1.1 Keyboard) | **FIXED** |
| C-02 | AutomationDetailHeader | Two icon-only buttons (back arrow, refresh) have no accessible name. Screen readers announce "button" with no label. | WCAG V-02 (4.1.2 Name, Role, Value) | **FIXED** |

### HIGH (6 findings)

| ID | Component | Finding | Source | Status |
|---|---|---|---|---|
| C-03 | Multiple (8 components, 13 instances) | `animate-spin` without `motion-reduce:animate-none`. Causes continuous rotation for users with vestibular disorders. Merged: Interaction N-1 + WCAG motion-reduce claim. | Interaction N-1 + WCAG | **FIXED** |
| C-04 | AutomationMetadataGrid | Three decorative icons (Clock, AlertTriangle, FileText) missing `aria-hidden="true"`. Merged: Interaction N-10 + WCAG V-03. | Interaction N-10 + WCAG V-03 | **FIXED** |
| C-05 | StagedVacancyCard | Three decorative icons (Building2, MapPin, Calendar) missing `aria-hidden="true"`. | WCAG V-04 | **FIXED** |
| C-06 | AutomationDetailHeader | Six decorative icons missing `aria-hidden="true"` alongside text labels or within labeled buttons. | WCAG V-05 | **FIXED** |
| C-07 | StagedVacancyCard | Checkbox input has no accessible label. Screen readers announce "checkbox" with no context about which vacancy it applies to. | WCAG V-06 (3.3.2 Labels) | **FIXED** |
| C-08 | SchedulerStatusBar | `aria-live="polite"` on wrapper `<span>` around entire button. Every re-render triggers screen reader announcement -- excessively chatty during active scheduler cycles. | WCAG V-07 | **FIXED** |

### MEDIUM (11 findings -- documented only)

| ID | Component | Finding | Source | Status |
|---|---|---|---|---|
| C-09 | RunProgressPanel | Phase transitions are instant -- icon swaps from Circle to Loader2 to CheckCircle2 with no visual continuity. Add `transition-opacity duration-200`. | Interaction N-3 | Documented |
| C-10 | SchedulerStatusBar | Status pill has no CSS transition. Background/border/text colors swap instantly between idle and running states. Add `transition-colors duration-150`. | Interaction N-4 | Documented |
| C-11 | ModuleBusyBanner | Banner appears/disappears instantly via conditional render. An entrance transition would soften the appearance. | Interaction N-5 | Documented |
| C-12 | StagingContainer | View mode switch between deck and list produces jarring instant content swap. No fade or cross-dissolve transition. | Interaction N-6 | Documented |
| C-13 | RunHistoryList | Table rows have no interactive affordance despite containing error tooltips. No hover state, no cursor change. | Interaction N-7 | Documented |
| C-14 | PublicApiKeySettings | Copy-to-clipboard provides only toast notification. No inline visual feedback (icon swap, checkmark) on the copy button itself. | Interaction N-8 | Documented |
| C-15 | RunHistoryList | `text-amber-500` for status icons has ~2.8:1 contrast ratio on white -- below 3:1 minimum for non-text elements. | WCAG V-08 (1.4.3 Contrast) | Documented |
| C-16 | RunProgressPanel | `text-muted-foreground/50` halves contrast ratio for pending phase labels, potentially below 4.5:1. | WCAG V-09 (1.4.3 Contrast) | Documented |
| C-17 | RunHistoryList | Table columns hidden on mobile via `hidden md:table-cell` with no responsive alternative. Data is completely inaccessible on narrow viewports. | WCAG V-11 (1.3.1) | Documented |
| C-18 | AutomationContainer | Icon-only refresh button missing `aria-label`. Outside primary audit scope but noted. | WCAG V-12 (4.1.2) | Documented |
| C-19 | StagedVacancyCard | Action buttons `h-7` (28px) below 44px touch target recommendation. Meets 24px AA minimum but not AAA. Merged: Interaction N-13 + WCAG V-10. | Interaction N-13 + WCAG V-10 | Documented |

### LOW (7 findings -- documented only)

| ID | Component | Finding | Source | Status |
|---|---|---|---|---|
| C-20 | DeckView | Swipe hint only shown on mobile via screen width. Touch-capable desktop users (touchscreens, tablets in landscape) receive no gestural affordance. | Interaction N-9 | Documented |
| C-21 | StagedVacancyCard | No hover state on card. Inconsistent with AutomationList which has `hover:bg-accent/50 transition-colors`. | Interaction N-11 | Documented |
| C-22 | DeckView | Action button `active:scale-90` is a transform animation not wrapped with `motion-reduce:active:scale-100`. | Interaction N-12 | Documented |
| C-23 | `tailwind.config.ts` | `deck-enter` keyframe and animation defined but never referenced. Unused animation in CSS bundle. | Interaction N-14 | Documented |
| C-24 | DeckView | Swipe overlay icons (Check, X, Star) during drag lack `aria-hidden="true"`. Minimal risk since they are inside `pointer-events-none` div. | WCAG V-13 | Documented |
| C-25 | SchedulerStatusBar | Queue count badge uses `text-[10px]` (10px text). Very small for low-vision users, even though screen readers get `aria-label`. | WCAG V-14 | Documented |
| C-26 | SchedulerStatusBar | Popover heading uses `<h4>` without a `<h3>` ancestor, breaking heading hierarchy. | WCAG V-15 (1.3.1) | Documented |

---

## Cross-Review Patterns

### Pattern 1: Decorative icon `aria-hidden` inconsistency
Both reviews flagged missing `aria-hidden="true"` on decorative icons. The WCAG audit found 12 missing instances across 3 components (V-03, V-04, V-05); the interaction design review flagged 3 in AutomationMetadataGrid (N-10). This is a systemic pattern -- developers add icons for visual context but do not consistently mark them as decorative. **Recommendation for S3:** Add an ESLint rule or code review checklist item requiring `aria-hidden="true"` on all Lucide icon imports used alongside text labels.

### Pattern 2: Missing CSS transitions on state changes
The interaction design review flagged 4 components with instant state swaps and no CSS transitions (N-3 RunProgressPanel, N-4 SchedulerStatusBar, N-5 ModuleBusyBanner, N-6 StagingContainer). The original S2 review claimed these transitions existed (e.g., "200ms ease-out", "150ms background-color transition") but 7 of 15 claims were false. **Conclusion:** The design intent was there but never implemented. These are polish items, not blockers.

### Pattern 3: RunHistoryList needs holistic attention
Both reviews independently flagged RunHistoryList: the interaction design review noted missing hover states (N-7), while the WCAG audit found contrast issues on status icons (V-08) and hidden columns on mobile (V-11). Three findings on one component across two reviews suggests it was underserved in S2.

### Pattern 4: Hover state inconsistency across list components
AutomationList has `hover:bg-accent/50 transition-colors`, but RunHistoryList (N-7) and StagedVacancyCard (N-11) lack hover feedback. This is a design system consistency gap, not a per-component issue.

### Pattern 5: Toast-only feedback pattern
PublicApiKeySettings (N-8) uses only toast for copy-to-clipboard feedback. This is an isolated finding but represents a broader pattern: inline feedback (icon swap, color flash) is more reliable than toast-only feedback since toasts can be missed, especially by screen reader users or those with short auto-dismiss timers.

### Pattern 6: Multi-dimensional review catches more
The WCAG audit surfaced 2 CRITICAL findings (V-01 keyboard trap, V-02 icon-only buttons) that the interaction design review did not flag. Conversely, the interaction design review caught 6 MEDIUM transition/polish issues the WCAG audit considered out of scope. Neither review alone would have produced the full picture.

---

## Severity Calibration Notes

Several findings were recalibrated during consolidation:

| ID | Original Severity | Calibrated | Rationale |
|---|---|---|---|
| N-10 / V-03 | LOW (interaction) / HIGH (WCAG) | **HIGH** | Missing `aria-hidden` is a WCAG 1.1.1 Level A violation; "LOW" underestimates compliance impact. Adopted WCAG severity. |
| N-13 / V-10 | LOW (interaction) / MEDIUM (WCAG) | **MEDIUM** | 28px meets WCAG AA 2.5.8 (24px minimum). Below AAA (44px) but not a compliance failure. MEDIUM is appropriate. |
| V-14 | LOW | LOW | 10px badge text is a usability concern for low-vision users but has `aria-label` fallback. LOW is correct. |
| C-18 (AutomationContainer) | MEDIUM | MEDIUM | Icon-only button without label is normally HIGH (4.1.2), but this was noted as outside primary audit scope. Keeping MEDIUM since it is an isolated icon-only button. |

---

## Unfixed Findings for S3

The following 18 findings are documented but not yet fixed. They should be tracked for S3 planning.

### MEDIUM priority (11 items)

| ID | Component | Finding | Review Dimension |
|---|---|---|---|
| C-09 | RunProgressPanel | No transition on phase step changes | Interaction design |
| C-10 | SchedulerStatusBar | No CSS transition on status pill | Interaction design |
| C-11 | ModuleBusyBanner | No entrance transition | Interaction design |
| C-12 | StagingContainer | No transition on view mode switch | Interaction design |
| C-13 | RunHistoryList | No hover state on table rows | Interaction design |
| C-14 | PublicApiKeySettings | Copy button lacks inline feedback | Interaction design |
| C-15 | RunHistoryList | amber-500 icon contrast below 3:1 | WCAG 1.4.3 |
| C-16 | RunProgressPanel | muted-foreground/50 text contrast | WCAG 1.4.3 |
| C-17 | RunHistoryList | Hidden columns on mobile with no alternative | WCAG 1.3.1 |
| C-18 | AutomationContainer | Icon-only refresh button missing aria-label | WCAG 4.1.2 |
| C-19 | StagedVacancyCard | 28px touch target (below 44px AAA) | Interaction + WCAG |

### LOW priority (7 items)

| ID | Component | Finding | Review Dimension |
|---|---|---|---|
| C-20 | DeckView | Swipe hint not shown on touch-capable desktops | Interaction design |
| C-21 | StagedVacancyCard | No hover state on card | Interaction design |
| C-22 | DeckView | active:scale-90 not motion-reduce-safe | Interaction design |
| C-23 | tailwind.config.ts | Unused deck-enter animation | Interaction design |
| C-24 | DeckView | Swipe overlay icons missing aria-hidden | WCAG 1.1.1 |
| C-25 | SchedulerStatusBar | 10px badge text size | WCAG 2.4.7 |
| C-26 | SchedulerStatusBar | h4 heading hierarchy gap | WCAG 1.3.1 |

---

## Summary Statistics

| Category | Count |
|---|---|
| Total unique findings | 26 |
| CRITICAL (all fixed) | 2 |
| HIGH (all fixed) | 6 |
| MEDIUM (documented for S3) | 11 |
| LOW (documented for S3) | 7 |
| **Fixed in this review cycle** | **8** |
| **Deferred to S3** | **18** |
| S2 claim accuracy (interaction) | 33% (5/15) |
| S2 claim accuracy (WCAG) | 67-100% (4-6/6) |
