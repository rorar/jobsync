# WCAG 2.2 Level AA Accessibility Audit -- S5b Notification Channel Settings

**Date:** 2026-04-05
**Auditor:** Accessibility Specialist (automated review)
**Scope:** SmtpSettings.tsx, PushSettings.tsx, templates.ts (email)
**Standard:** WCAG 2.2 Level AA
**Prior fixes applied:** S5b-F03 (hardcoded aria-labels), S5b-F06 (missing role="alert")

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 1     |
| High     | 4     |
| Medium   | 5     |
| Low      | 4     |
| **Total**| **14**|

Components use Shadcn UI / Radix Primitives, which provide strong baseline accessibility (focus management in dialogs, proper ARIA on Switch, AlertDialog, etc.). Findings below focus on gaps above that baseline.

---

## Findings

### WCAG-A01 -- SMTP form missing `aria-invalid` and `aria-describedby` for inline validation errors

**WCAG Criterion:** 3.3.1 Error Identification, 4.1.2 Name, Role, Value
**Severity:** High
**File:** `src/components/settings/SmtpSettings.tsx`
**Lines:** 408-509 (all five input fields)

**Issue:** The SMTP form performs client-side validation via `isFormValid()` but never marks invalid inputs with `aria-invalid="true"` or associates error descriptions via `aria-describedby`. When the Save button is disabled because a required field is empty, screen reader users have no programmatic indication of which field caused the problem. Compare with WebhookSettings.tsx, which correctly uses `aria-invalid` and `aria-describedby` on the URL input (line 357-358).

**Impact:** Screen reader users cannot determine which field has an error or why the Save button is disabled.

**Fix:**
- Add `aria-invalid={!form.host.trim() && wasSubmitted}` and a corresponding error `<p id="smtp-host-error">` for each required field.
- Add `aria-describedby="smtp-host-error"` to each input when the error is shown.
- Consider showing inline error messages on attempted save (not just disabling the button), following the pattern already established in WebhookSettings.

---

### WCAG-A02 -- SMTP From Address input missing `autoComplete="email"`

**WCAG Criterion:** 1.3.5 Identify Input Purpose
**Severity:** Medium
**File:** `src/components/settings/SmtpSettings.tsx`
**Line:** 501-509

**Issue:** The From Address field has `type="email"` but lacks the `autoComplete="email"` attribute. The Username and Password fields correctly have `autoComplete` attributes (`username` and `new-password`), but the From Address and Host fields do not. Per WCAG 1.3.5, inputs whose purpose relates to the user should declare it via `autocomplete`.

**Impact:** Autofill and assistive technologies cannot identify the purpose of this input. Users with cognitive disabilities benefit from browser autofill.

**Fix:** Add `autoComplete="email"` to the From Address input.

---

### WCAG-A03 -- Password toggle button has `tabIndex={-1}`, removing it from keyboard access

**WCAG Criterion:** 2.1.1 Keyboard
**Severity:** High
**File:** `src/components/settings/SmtpSettings.tsx`
**Line:** 480

**Issue:** The show/hide password toggle button uses `tabIndex={-1}`, which removes it from the tab order entirely. Keyboard-only users cannot toggle password visibility. While `tabIndex={-1}` is sometimes used to avoid double-tabbing into a composite widget, this is a standalone button that provides important functionality -- especially for users verifying their password input.

**Impact:** Keyboard-only users and switch-access users cannot toggle password visibility.

**Fix:** Remove `tabIndex={-1}` from the password toggle button. The button already has a proper `aria-label` and will receive focus-visible styling from the Button component's `focus-visible:ring-2` class.

---

### WCAG-A04 -- No `aria-live` region for dynamic state changes in SmtpSettings or PushSettings

**WCAG Criterion:** 4.1.3 Status Messages (WCAG 2.1)
**Severity:** Medium
**File:** `src/components/settings/SmtpSettings.tsx`, `src/components/settings/PushSettings.tsx`

**Issue:** Both components undergo significant state transitions (loading -> configured/empty -> editing) that re-render the entire component body, but neither uses `aria-live` regions to announce these transitions. While toast notifications (via Radix Toast) do announce success/error outcomes, the intermediate states (cooldown countdown, subscription status change) are not announced.

Specific gaps:
1. The cooldown countdown text ("Test in 45s...") updates every second but is not in an `aria-live` region. Screen reader users cannot track when the test button becomes available again.
2. PushSettings subscription status change (subscribed/unsubscribed badge) is not announced.

Compare with WebhookSettings, which wraps the endpoint list in `aria-live="polite"` (line 422).

**Impact:** Screen reader users do not receive feedback about dynamic state changes.

**Fix:**
- Wrap the cooldown text span in both components with `aria-live="polite"` and `aria-atomic="true"`.
- Add `aria-live="polite"` to the PushSettings status badge area so subscription changes are announced.

---

### WCAG-A05 -- PushSettings "Rotate VAPID Keys" button touch target too small on mobile

**WCAG Criterion:** 2.5.8 Target Size (Minimum) -- WCAG 2.2 Level AA
**Severity:** Medium
**File:** `src/components/settings/PushSettings.tsx`
**Line:** 519-538

**Issue:** The "Rotate VAPID Keys" button uses `size="sm"` which renders at `h-9` (36px height). WCAG 2.2 Success Criterion 2.5.8 requires a minimum target size of 24x24 CSS pixels, which this meets. However, the adjacent spacing between this button and the surrounding content may not meet the 24px spacing requirement when considered alongside surrounding targets.

Note: The default-sized buttons in both components (h-10, 40px) comfortably exceed the minimum. Only `size="sm"` buttons at 36px are near the threshold.

**Impact:** Mobile users with motor impairments may have difficulty tapping the smaller target.

**Fix:** Consider using the default button size instead of `size="sm"` for the rotate button, or ensure at least 24px of spacing between adjacent interactive targets.

---

### WCAG-A06 -- Email template: footer text color `#71717a` on `#fafafa` background fails 4.5:1 contrast for small text

**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** High
**File:** `src/lib/email/templates.ts`
**Line:** 74

**Issue:** The email footer uses `color:#71717a` on `background-color:#fafafa`. This yields an approximate contrast ratio of 4.2:1, which fails the WCAG AA requirement of 4.5:1 for normal-sized text (12px at `font-size:12px`).

Calculated: `#71717a` on `#fafafa` = approximately 4.21:1.

**Impact:** Users with low vision may not be able to read the footer text in email notifications.

**Fix:** Darken the footer text to at least `#636369` (approximately 5.0:1) or `#52525b` (zinc-600, approximately 6.3:1) to meet AA requirements.

---

### WCAG-A07 -- Email template: body text color `#27272a` on `#ffffff` is excellent, but no dark mode support

**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** Low
**File:** `src/lib/email/templates.ts`
**Lines:** 54, 121-122

**Issue:** The email body text uses `color:#27272a` on `background-color:#ffffff`, giving a contrast ratio of approximately 15.4:1, which is excellent. However, email templates have hardcoded light-mode colors with no `@media (prefers-color-scheme: dark)` support. While many email clients strip media queries, modern clients (Apple Mail, some Outlook versions) do support them.

**Impact:** Users who prefer dark mode in supporting email clients see a bright white email that may cause discomfort. This is an enhancement rather than a compliance failure.

**Fix:** Optionally add a `@media (prefers-color-scheme: dark)` block in the `<head>` for clients that support it. Low priority since email client support is inconsistent.

---

### WCAG-A08 -- Email template: no skip mechanism for layout tables

**WCAG Criterion:** 1.3.1 Info and Relationships
**Severity:** Low
**File:** `src/lib/email/templates.ts`
**Lines:** 55-78

**Issue:** The email template correctly uses `role="presentation"` on layout tables (lines 55, 58), which is the right approach. However, the template uses nested tables three levels deep. Screen readers in some email clients may still announce table structure despite `role="presentation"` due to email client rendering quirks.

**Impact:** Minimal -- `role="presentation"` is correctly applied, which handles the standard case.

**Fix:** No action required. The current implementation follows best practices for email accessibility. Noted for completeness.

---

### WCAG-A09 -- Email template: missing `<html dir="auto">` for RTL locale support

**WCAG Criterion:** 1.3.2 Meaningful Sequence
**Severity:** Low
**File:** `src/lib/email/templates.ts`
**Line:** 48

**Issue:** The `<html>` tag includes a `lang` attribute (good), but does not include `dir="auto"` or `dir="ltr"`. While all four current locales (en, de, fr, es) are LTR, best practice is to include `dir` explicitly. If RTL locales (e.g., Arabic) are added in the future, the email template would need this attribute.

**Impact:** No impact for current locales. Preventive measure for future i18n expansion.

**Fix:** Add `dir="ltr"` to the `<html>` tag for explicitness. Change to `dir="auto"` if RTL locales are added.

---

### WCAG-A10 -- SMTP form is not wrapped in a `<form>` element

**WCAG Criterion:** 1.3.1 Info and Relationships, 3.3.1 Error Identification
**Severity:** Critical
**File:** `src/components/settings/SmtpSettings.tsx`
**Lines:** 403-653

**Issue:** The entire SMTP configuration form uses individual `<Input>` elements with `onClick` handlers on the Save button, but is not wrapped in a semantic `<form>` element. This means:
1. Pressing Enter in any input field does not submit the form (no implicit form submission).
2. Browser-native validation (the `required` attributes on lines 415, 430, 447, etc.) never fires because there is no form to validate.
3. Screen readers do not identify this as a form landmark, reducing navigability.
4. The `required` attributes on inputs are misleading -- they suggest browser validation will occur, but it never does without a `<form>`.
5. Per ADR-015/ADR-016 security rules, credential forms should use `method="POST" action=""`.

This applies to PushSettings as well, though PushSettings has no text inputs so the impact is lower there.

**Impact:** Keyboard users cannot submit with Enter. Screen readers miss the form landmark. Browser validation is silently bypassed.

**Fix:** Wrap the CardContent in a `<form onSubmit={handleSave} method="POST" action="">` element. Add an `onSubmit` handler that calls `e.preventDefault()` then `handleSave()`. This enables Enter-to-submit, browser validation on `required` fields, and proper form landmark identification.

---

### WCAG-A11 -- PushSettings: Badge color `bg-green-600 text-white` needs contrast verification

**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** Medium
**File:** `src/components/settings/PushSettings.tsx`
**Line:** 414

**Issue:** The "Subscribed" badge uses `className="bg-green-600 hover:bg-green-600 text-white"`. Tailwind's `green-600` is `#16a34a`. White (`#ffffff`) on `#16a34a` gives a contrast ratio of approximately 3.5:1, which fails the WCAG AA requirement of 4.5:1 for normal-sized text.

**Impact:** Users with low vision may not be able to read the badge text.

**Fix:** Either:
- Use `bg-green-700` (`#15803d`) which gives approximately 4.9:1 with white text, meeting AA.
- Use `bg-green-800` (`#166534`) for a more comfortable 6.5:1 ratio.
- Or switch to dark text on a lighter green background: `bg-green-100 text-green-800`.

---

### WCAG-A12 -- PushSettings: permission denied warning uses yellow colors that may fail contrast in dark mode

**WCAG Criterion:** 1.4.3 Contrast (Minimum)
**Severity:** Medium
**File:** `src/components/settings/PushSettings.tsx`
**Lines:** 427-431

**Issue:** The permission denied warning uses `text-yellow-800 dark:text-yellow-200` on `bg-yellow-50 dark:bg-yellow-950/20`. In dark mode:
- `yellow-200` is `#fef08a` and `yellow-950/20` creates a very dark, low-opacity overlay on the background. The effective background color depends on the page background, making contrast unpredictable.
- The `/20` opacity modifier (20% opacity) means the background is nearly transparent, so the text color contrasts primarily against the page background rather than the yellow tint.

**Impact:** In dark mode, the warning text may not have sufficient contrast depending on the underlying page background.

**Fix:** Remove the `/20` opacity modifier from the dark mode background (`dark:bg-yellow-950` instead of `dark:bg-yellow-950/20`) to ensure a predictable contrast ratio. Alternatively, use `dark:text-yellow-100` for higher contrast.

---

### WCAG-A13 -- Heading hierarchy: settings components use `<h3>` without surrounding `<h1>` or `<h2>`

**WCAG Criterion:** 1.3.1 Info and Relationships
**Severity:** Low
**File:** `src/components/settings/SmtpSettings.tsx` (line 302), `src/components/settings/PushSettings.tsx` (line 345)

**Issue:** Both components render section headings as `<h3>` elements. The parent Settings page (`src/app/dashboard/settings/page.tsx`, line 26) also uses `<h3>` for the page title "Settings". This means the document has `<h3>` tags without preceding `<h1>` or `<h2>` headings, creating a gap in the heading hierarchy.

The heading hierarchy should be:
- `<h1>` -- page title (likely in the layout)
- `<h2>` -- "Settings"
- `<h3>` -- individual settings sections (SMTP, Push, etc.)

**Impact:** Screen reader users navigating by headings encounter a non-sequential heading structure.

**Fix:** This is a broader page-level architecture issue. The settings page title should be `<h2>` and section titles within SmtpSettings/PushSettings should remain `<h3>`, assuming the layout provides an `<h1>`. Audit the layout to confirm `<h1>` exists.

---

### WCAG-A14 -- Decorative icons inside buttons lack explicit `aria-hidden` in PushSettings

**WCAG Criterion:** 1.1.1 Non-text Content
**Severity:** High
**File:** `src/components/settings/PushSettings.tsx`
**Lines:** 454-457, 469-471, 488-490, 527-529

**Issue:** Several Loader2 icons inside buttons in PushSettings are marked `aria-hidden="true"` (correct), but the corresponding non-loading state icons (BellRing, Send) are also correctly marked `aria-hidden="true"`. However, the ChevronUp/ChevronDown icons in WebhookSettings (line 582-584, noted for comparison) lack `aria-hidden` and may be announced by screen readers. Within PushSettings itself, all decorative icons are properly handled.

Upon closer review, PushSettings correctly marks all icons with `aria-hidden="true"`. Downgrading this to an informational note -- no action required for the audited files.

**Revised Severity:** Informational (no finding)

---

## Already Correct (Positive Observations)

The following accessibility patterns are correctly implemented:

1. **Motion respect:** All `animate-spin` instances include `motion-reduce:animate-none` class.
2. **Decorative icons:** Lucide icons in SmtpSettings and PushSettings consistently use `aria-hidden="true"`.
3. **Label associations:** All form inputs in SmtpSettings have proper `<Label htmlFor>` + `id` pairings.
4. **Switch components:** Radix Switch primitives provide built-in ARIA role, checked state, and keyboard interaction.
5. **AlertDialog:** Radix AlertDialog handles focus trapping, Escape to close, and proper ARIA roles.
6. **Error state `role="alert"`:** SmtpSettings error state (line 331) and PushSettings permission warning (line 427) correctly use `role="alert"`.
7. **Toast accessibility:** Radix Toast provides ARIA live region announcement; ToastClose has translated label text.
8. **Focus visible:** Button and Switch components include `focus-visible:ring-2` for keyboard focus indication.
9. **Email template `lang` attribute:** The email `<html>` tag includes a dynamic `lang` attribute from the locale parameter.
10. **Email template `role="presentation"`:** Layout tables correctly use `role="presentation"`.
11. **i18n translations:** All visible strings use `t()` function -- no hardcoded English text.
12. **Password autocomplete:** Username and Password fields have appropriate `autoComplete` attributes.
13. **Email template viewport meta:** Includes `<meta name="viewport" content="width=device-width, initial-scale=1.0">`.

---

## Prioritized Remediation Plan

### Immediate (Critical + High)

| ID | Finding | Effort |
|----|---------|--------|
| WCAG-A10 | Wrap SMTP form in `<form>` element | Small |
| WCAG-A01 | Add `aria-invalid` + `aria-describedby` to SMTP inputs | Medium |
| WCAG-A03 | Remove `tabIndex={-1}` from password toggle | Trivial |
| WCAG-A06 | Darken email footer text color | Trivial |
| WCAG-A11 | Fix green badge contrast ratio | Trivial |

### Short-term (Medium)

| ID | Finding | Effort |
|----|---------|--------|
| WCAG-A02 | Add `autoComplete="email"` to From Address | Trivial |
| WCAG-A04 | Add `aria-live` regions for cooldown + subscription status | Small |
| WCAG-A05 | Consider larger touch target for Rotate button | Trivial |
| WCAG-A12 | Fix dark mode contrast on yellow warning | Trivial |

### Deferred (Low)

| ID | Finding | Effort |
|----|---------|--------|
| WCAG-A07 | Email dark mode media query | Medium |
| WCAG-A09 | Add `dir` attribute to email template | Trivial |
| WCAG-A13 | Heading hierarchy audit (page-level) | Medium |

---

## Testing Recommendations

1. **Screen reader testing:** Test SmtpSettings form flow with NVDA on Windows and VoiceOver on macOS. Verify that validation errors are announced, form landmark is discoverable, and toast notifications are read.
2. **Keyboard testing:** Tab through the entire SmtpSettings form. Verify Enter submits the form. Verify the password toggle is reachable.
3. **Color contrast:** Use axe DevTools or Lighthouse to validate contrast ratios on the green badge and yellow warning in both light and dark modes.
4. **Email testing:** Send a test email and verify it reads correctly in VoiceOver reading an Apple Mail message and in NVDA reading an Outlook message.
5. **Automated testing:** Add `jest-axe` tests for SmtpSettings and PushSettings render states (loading, empty, configured, editing).
