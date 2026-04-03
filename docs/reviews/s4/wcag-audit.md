# S4 WCAG 2.2 Audit -- Data Enrichment Connector

**Date**: 2026-04-03
**Scope**: Data Enrichment UI components added in S4
**Standard**: WCAG 2.2 (Level A, AA, AAA)
**Components Audited**: CompanyLogo, EnrichmentModuleSettings, HealthIndicator, enrichment status displays

---

## Summary

| Level | Findings | Fixed | Documented |
|-------|----------|-------|------------|
| Level A | 7 | 7 | 0 |
| Level AA | 4 | 0 | 4 |
| Level AAA | 1 | 0 | 1 |
| **Total** | **12** | **7** | **5** |

All Level A violations have been remediated. Level AA/AAA findings are documented for future improvement.

---

## Level A Findings (7) -- ALL FIXED

### W4-A01 -- CompanyLogo missing alt text [SC 1.1.1 Non-text Content]

**Location**: `src/components/enrichment/CompanyLogo.tsx`
**Description**: The `<img>` element for the company logo had no `alt` attribute. When the logo loaded, screen readers announced the image URL instead of a meaningful description.
**Impact**: Screen reader users cannot identify the company from the logo.
**Fix**: Added `alt={companyName + " logo"}` with i18n key `enrichment.companyLogoAlt`. Falls back to `alt=""` (decorative) when used as pure decoration alongside visible company name text.
**WCAG SC**: 1.1.1 (Level A)

### W4-A02 -- Health indicator status not programmatically determinable [SC 1.3.1 Info and Relationships]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: Module health status was conveyed only through a colored dot (green/yellow/red). No programmatic alternative existed for assistive technology.
**Impact**: Screen reader users could not determine module health status.
**Fix**: Added `aria-label` with translated status text (e.g., "Health: Reachable", "Health: Degraded"). Added `role="status"` to the health indicator container for live updates.
**WCAG SC**: 1.3.1 (Level A)

### W4-A03 -- Settings module toggle not keyboard-accessible [SC 2.1.1 Keyboard]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: Module activation toggle was implemented as a clickable `<div>` without keyboard event handlers. Tab key skipped over the control entirely.
**Impact**: Keyboard-only users could not activate/deactivate enrichment modules.
**Fix**: Replaced `<div onClick>` with `<Switch>` component from Shadcn UI, which provides native keyboard support (Space/Enter to toggle, Tab to focus).
**WCAG SC**: 2.1.1 (Level A)

### W4-A04 -- Loading skeleton missing aria-busy [SC 4.1.2 Name, Role, Value]

**Location**: `src/components/enrichment/CompanyLogo.tsx`
**Description**: During the skeleton loading phase, the container had no `aria-busy` attribute. Screen readers could not distinguish between "loading" and "empty" states.
**Impact**: Screen readers announce nothing during loading, causing confusion.
**Fix**: Added `aria-busy="true"` to the skeleton container. Added `aria-busy="false"` when content loads. Screen readers now announce "Loading" during the skeleton phase.
**WCAG SC**: 4.1.2 (Level A)

### W4-A05 -- Enrichment status badge uses color only [SC 1.3.1 Info and Relationships]

**Location**: `src/components/enrichment/CompanyLogo.tsx`
**Description**: The enrichment status (fresh/stale/error) was indicated only by badge color. No text or icon alternative for non-color perception.
**Impact**: Color-blind users cannot distinguish between enrichment states.
**Fix**: Added sr-only text labels and distinct icons per status (checkmark for fresh, clock for stale, exclamation for error).
**WCAG SC**: 1.3.1 (Level A)

### W4-A06 -- Module activation toggle missing aria-label [SC 4.1.2 Name, Role, Value]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: The Switch toggle for module activation/deactivation had no accessible label. Screen readers announced only "switch" without context.
**Impact**: Screen reader users cannot determine what the toggle controls.
**Fix**: Added `aria-label={t("enrichment.toggleModule", { name: module.manifest.name })}` to each Switch component.
**WCAG SC**: 4.1.2 (Level A)

### W4-A07 -- Enrichment error state not announced [SC 3.3.1 Error Identification]

**Location**: `src/components/enrichment/CompanyLogo.tsx`
**Description**: When enrichment fails, the error state (fallback to initials) was visual only. No announcement for screen reader users.
**Impact**: Screen reader users are not informed that enrichment failed.
**Fix**: Added `role="alert"` on the error state container with descriptive text. The alert fires once on transition from loading to error.
**WCAG SC**: 3.3.1 (Level A)

---

## Level AA Findings (4) -- DOCUMENTED

### W4-AA01 -- Health dot color insufficient contrast [SC 1.4.3 Contrast (Minimum)]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: The green health dot (#22c55e on white #ffffff) has a contrast ratio of approximately 2.1:1, below the 3:1 minimum for non-text UI components under SC 1.4.11.
**Recommendation**: Use darker green (#16a34a, ~3.5:1) or add a visible border.
**Priority**: Low -- mitigated by the aria-label text providing the same information.

### W4-AA02 -- Module card border relies on color alone [SC 1.4.11 Non-text Contrast]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: Active vs inactive module cards are distinguished primarily by border color (green vs gray). The color is the primary differentiator.
**Recommendation**: Add an icon badge or text label ("Active"/"Inactive") visible in the card header.
**Priority**: Low -- the Switch toggle state provides a secondary indicator.

### W4-AA03 -- No status message on enrichment completion [SC 4.1.3 Status Messages]

**Location**: `src/components/enrichment/CompanyLogo.tsx`
**Description**: When enrichment completes successfully (logo appears), no status message is announced. The user sees the visual change but assistive technology is not notified.
**Recommendation**: Add `aria-live="polite"` region that announces "Company logo loaded" on successful enrichment.
**Priority**: Medium -- enrichment is typically background-triggered, so the user may not be actively waiting.

### W4-AA04 -- Focus not moved to result after manual enrichment [SC 2.4.7 Focus Visible]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: After manually triggering enrichment from Settings, focus remains on the trigger button. The result appears elsewhere in the UI without focus management.
**Recommendation**: Move focus to the result area or announce the result via aria-live.
**Priority**: Low -- manual enrichment trigger is an admin-level action used infrequently.

---

## Level AAA Findings (1) -- DOCUMENTED

### W4-AAA01 -- Settings enrichment section not in page heading hierarchy [SC 2.4.10 Section Headings]

**Location**: `src/components/settings/EnrichmentModuleSettings.tsx`
**Description**: The enrichment settings section uses a styled `<div>` for its title rather than a heading element (`<h3>` or `<h4>`). This breaks the document outline for screen reader navigation.
**Recommendation**: Use `<h3>` for the section title within the Settings page heading hierarchy.
**Priority**: Low -- Level AAA criterion, the section is still navigable via other means.

---

## Testing Recommendations

1. **Automated**: Add axe-core assertions to enrichment component tests (follow pattern from `__tests__/a11y-*.spec.tsx`)
2. **Manual**: Test CompanyLogo state transitions with VoiceOver/NVDA (skeleton -> image -> error -> initials)
3. **Regression**: Verify aria-busy toggles correctly during async enrichment
