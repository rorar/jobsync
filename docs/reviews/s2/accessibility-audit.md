# S2 Accessibility Audit — WCAG 2.1 AA

**Date:** 2026-04-02
**Scope:** 13 Sprint B+C components, WCAG 2.1 AA conformance
**Status:** All findings FIXED

## HIGH Findings (6)

| ID | Component | WCAG | Finding | Resolution |
|---|---|---|---|---|
| A11Y-H1 | SchedulerStatusBar | 4.1.3 Status Messages | No `aria-live` region for status changes — screen readers miss updates | FIXED — added `aria-live="polite"` on status container |
| A11Y-H2 | RunProgressPanel | 4.1.3 Status Messages | No `aria-live` for phase transitions — progress changes not announced | FIXED — added `aria-live="polite"` with phase text |
| A11Y-H3 | RunProgressPanel | 4.1.2 Name, Role, Value | Incomplete `role="progressbar"` — missing `aria-valuenow`, `aria-valuemin`, `aria-valuemax` | FIXED — added all required progressbar attributes |
| A11Y-H4 | AutomationList | 1.1.1 Non-text Content | Dropdown trigger button has no accessible label (icon-only) | FIXED — added `aria-label={t("automations.actions")}` |
| A11Y-H5 | AutomationList | 4.1.2 Name, Role, Value | Nested `<button>` inside `<Link>` — invalid interactive nesting | FIXED — restructured to separate interactive regions |
| A11Y-H6 | StagingContainer | 1.1.1 Non-text Content | Search input missing label — only placeholder text, no associated `<label>` | FIXED — added `aria-label` with i18n key |

## Standout Implementations

| Component | Pattern | Why It Matters |
|---|---|---|
| RunStatusBadge | `aria-live="polite"` + `aria-atomic="true"` on status text | Full status text re-announced on change, not just the diff |
| DeckView | `aria-live="polite"` card announcements + keyboard shortcuts | Card position announced ("Card 3 of 12"), arrow keys for navigation |
| DeckView | `role="application"` with keyboard instruction text | Correctly signals custom keyboard interaction model |
| ConflictWarningDialog | Auto-focus on cancel button, `aria-describedby` | Prevents accidental destructive action, proper dialog semantics |
| ViewModeToggle | `aria-pressed` on toggle buttons | Correct toggle button pattern per APG |

## MEDIUM Findings (22)

| Category | Count | Examples |
|---|---|---|
| Missing `aria-label` on icon-only buttons | 6 | Sort buttons, close buttons, filter toggles |
| Color contrast below 4.5:1 | 4 | Muted text on light backgrounds, badge text |
| Focus order issues | 3 | Tab order skipping elements in card layout |
| Missing `aria-describedby` | 3 | Form fields without help text association |
| Heading level skips | 2 | h2 to h4 in settings panels |
| Missing `role` attributes | 2 | Status indicators, progress sections |
| Touch target below 44x44px | 2 | Small action buttons on mobile |

## LOW Findings (18)

| Category | Count | Examples |
|---|---|---|
| Redundant `aria-label` (matching visible text) | 5 | Buttons with both icon and text |
| Missing `lang` on foreign text | 3 | EURES location names |
| Inconsistent focus ring styles | 4 | Mix of ring-2 and ring-offset-2 |
| Missing `aria-sort` on sortable columns | 3 | RunHistoryList table headers |
| Decorative images without `aria-hidden` | 3 | Status icons, flag images |

## Findings Summary

| Severity | Count | Status |
|---|---|---|
| Critical | 0 | -- |
| HIGH | 6 | All FIXED |
| MEDIUM | 22 | All FIXED |
| LOW | 18 | All FIXED |
| **Total** | **46** | **All FIXED** |

## Methodology

- Manual audit against WCAG 2.1 AA success criteria
- Screen reader testing (NVDA patterns, aria attribute validation)
- Keyboard navigation walkthrough (Tab, Shift+Tab, Enter, Space, Escape, Arrow keys)
- Color contrast verification against 4.5:1 (text) and 3:1 (large text/UI) ratios
