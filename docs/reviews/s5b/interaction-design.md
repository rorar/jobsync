# S5b Interaction Design Review -- Notification Channel Settings

**Reviewer:** UI Design Agent (Interaction Design)
**Date:** 2026-04-05
**Scope:** SmtpSettings.tsx, PushSettings.tsx, smtp.actions.ts, push.actions.ts
**Status:** 14 findings (1 Critical, 3 High, 7 Medium, 3 Low)

---

## Summary

The SMTP and Push notification settings UIs are well-structured with clear state management, proper loading/error states, and good i18n coverage across all 4 locales. The code follows the project's established patterns (ActionResult, toast feedback, AlertDialog for destructive actions). However, several interaction design gaps affect usability under real-world conditions -- particularly around long-running operations, mobile touch targets, and multi-device push management.

---

## Findings

### ID-001: SMTP test button lacks timeout expectation during 30s wait

**Severity:** High
**Scenario:** User clicks "Send Test Email". The SMTP server takes up to 30 seconds (SEND_TIMEOUT_MS) to respond or time out.
**Component:** SmtpSettings.tsx lines 224-246, smtp.actions.ts line 55

**Current behavior:** The button shows a spinner with "Sending..." text. There is no indication of how long this might take. The server-side timeout is 30 seconds across connectionTimeout, greetingTimeout, and socketTimeout. A user staring at a spinner for 30 seconds will likely assume the app is broken and attempt to click again or navigate away.

**Recommended improvement:** Add a secondary text indicator beneath the test button or within the toast that appears after ~5 seconds, such as "This may take up to 30 seconds depending on your SMTP server." Alternatively, show a progress indication that communicates the operation is still actively working. The existing spinner is insufficient for a wait this long.

---

### ID-002: Form submission not blocked during SMTP test in progress

**Severity:** High
**Scenario:** User has an existing SMTP config (view mode). They click "Send Test Email" (spinner begins). While the test is in progress, the "Save Configuration" (edit) button remains clickable.
**Component:** SmtpSettings.tsx lines 579-607

**Current behavior:** In the non-editing state (lines 579-652), three buttons are shown: Edit ("Save Configuration" label), Test Email, and Delete. The edit button (`handleEdit`, line 582) transitions to edit mode regardless of whether a test is running. If the user enters edit mode, modifies fields, and saves while the original test email action is still in flight, both async operations run concurrently against potentially different config states.

**Recommended improvement:** Disable the Edit and Delete buttons while `testing` is true. Add `disabled={testing}` to both the edit button and the delete AlertDialogTrigger button. This prevents concurrent state mutations during the test operation.

---

### ID-003: Edit button label says "Save Configuration" in view mode

**Severity:** Medium
**Scenario:** User has a saved SMTP config and is in the view/summary state.
**Component:** SmtpSettings.tsx line 583

**Current behavior:** The button to enter edit mode uses the label `t("settings.smtpSave")` which translates to "Save Configuration" (EN), "Konfiguration speichern" (DE), etc. This is the same label used for the actual save button in edit mode (line 569). The user sees a button labeled "Save Configuration" that does not save anything -- it switches to edit mode.

**Recommended improvement:** Add a new i18n key `settings.smtpEdit` with values like "Edit Configuration" / "Konfiguration bearbeiten" / "Modifier la configuration" / "Editar configuracion". Use this key for the view-mode button instead of reusing the save label.

---

### ID-004: Push permission denied -- no recovery guidance

**Severity:** High
**Scenario:** User clicks "Enable Push Notifications". The browser permission prompt appears and the user clicks "Block" (or permission was previously denied).
**Component:** PushSettings.tsx lines 188-196, lines 426-432

**Current behavior:** The yellow warning banner shows `t("settings.pushPermissionDenied")` which reads: "Push notification permission was denied. Enable it in your browser settings." This is vague -- the user has no idea how to find browser notification settings. Different browsers have different paths (Chrome: Settings > Privacy and Security > Notifications; Firefox: Settings > Privacy & Security > Permissions > Notifications; Safari: Preferences > Websites > Notifications). Additionally, the "Enable Push Notifications" button remains clickable even when permission is denied, meaning the user can repeatedly trigger the same denied flow.

**Recommended improvement:**
1. Disable the "Enable Push Notifications" button when `permissionDenied` is true and `!isSubscribed`. This prevents futile repeated attempts.
2. Enhance the warning text with a more specific instruction: "Push notification permission was denied. To enable it, open your browser's site settings for this page and change notification permissions to 'Allow'."
3. Consider adding a "Check Again" button that re-checks `Notification.permission` rather than re-triggering the subscribe flow, since browsers typically do not re-prompt after a deny.

---

### ID-005: Push subscription out-of-sync with browser state

**Severity:** Medium
**Scenario:** User enables push in the app, then goes to browser settings and manually revokes notification permission for the site, then returns to the settings page.
**Component:** PushSettings.tsx lines 81-123

**Current behavior:** The `checkStatus` function (line 81) checks `Notification.permission === "denied"` and sets `permissionDenied`, but it also independently checks for an existing PushManager subscription (lines 104-112). If the user revoked permission at the browser level, the PushManager subscription may still exist locally but notifications will silently fail. The UI will show the "Active" badge and the subscription count, but push delivery will fail server-side with no user-visible feedback.

**Recommended improvement:** When `Notification.permission === "denied"` AND `isSubscribed` is true, show a warning state: "Push notifications appear enabled but browser permission has been revoked. Notifications will not be delivered until you re-allow notifications in your browser settings." Additionally, trigger a server-side cleanup of the stale subscription.

---

### ID-006: No device identification in multi-device push view

**Severity:** Medium
**Scenario:** User has enabled push on 3 devices (work laptop, phone, tablet). They want to disable push on their phone only.
**Component:** PushSettings.tsx lines 434-442

**Current behavior:** The device count is shown as a single number: "{count} device(s) subscribed". The unsubscribe button only removes the current browser's subscription. There is no list of subscribed devices, no way to identify which device is which, and no way to remove a subscription from a different device (e.g., removing a lost phone's subscription from the desktop).

**Recommended improvement:** For Phase 1, this is acceptable, but add a note in the UI: "You can only disable push for this browser. To disable on other devices, visit settings on each device." For a future phase, add a device list showing User-Agent-derived device names (e.g., "Chrome on Windows", "Safari on iPhone") with individual remove buttons per subscription.

---

### ID-007: VAPID rotation confirmation dialog lacks consequence detail

**Severity:** Medium
**Scenario:** User clicks "Rotate Keys" and sees the confirmation dialog.
**Component:** PushSettings.tsx lines 540-557

**Current behavior:** The dialog shows `t("settings.pushRotateWarning")` as title ("Rotate VAPID keys?") and `t("settings.pushRotateDesc")` as description ("This will invalidate ALL existing push subscriptions across ALL devices. Users will need to re-enable push notifications."). The confirm button uses `t("settings.pushRotateConfirm")` ("Rotate Keys"). The AlertDialogAction uses the default button variant (primary/blue), not a destructive variant.

**Issues found:**
1. The confirm button renders with the default primary style via `buttonVariants()` in alert-dialog.tsx (line 107). Since this is a destructive and irreversible action, it should use a destructive (red) variant to signal danger.
2. The description mentions "Users" (plural) which is confusing for a self-hosted single-user context. It should say "you" instead.
3. No mention of the specific count of subscriptions that will be lost. If `deviceCount` is available, showing "This will invalidate 3 active push subscriptions" is more concrete.

**Recommended improvement:**
1. Add `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"` to the AlertDialogAction, or wrap it with a destructive Button variant.
2. Update the i18n key to use "you" instead of "Users" in all 4 locales.
3. Interpolate the device count into the warning message when > 0.

---

### ID-008: SMTP test cooldown not communicated before first click

**Severity:** Low
**Scenario:** User wants to test their SMTP config. They do not know there is a 60-second rate limit until after clicking.
**Component:** SmtpSettings.tsx lines 586-608

**Current behavior:** The test button shows no pre-click indication of the cooldown. After clicking, the countdown appears in the button text: "Test Email (58s)". If the test fails (wrong password), the user must wait the full 60 seconds before they can try again, even though the failure was immediate. The cooldown starts unconditionally in the `finally` block (line 244).

**Recommended improvement:** The cooldown should only start on success or when the server action was actually attempted (not on client-side validation failure). Currently it starts unconditionally in `finally`. If the server returns a rate limit error ("smtp.testRateLimited"), the cooldown should sync with the server's remaining window rather than starting a fresh 60-second client-side timer. For the pre-click communication, add a small helper text below the test button area: "One test email per minute."

---

### ID-009: SMTP delete confirmation uses non-destructive button style

**Severity:** Medium
**Scenario:** User clicks "Delete Configuration" and sees the confirmation dialog.
**Component:** SmtpSettings.tsx lines 645-646

**Current behavior:** The AlertDialogAction for delete uses the default primary button style (same issue as ID-007). Destructive confirmations should be visually distinct from normal confirmations to prevent accidental data loss.

**Recommended improvement:** Add destructive styling to the AlertDialogAction: `className="bg-destructive text-destructive-foreground hover:bg-destructive/90"`. This matches the visual language already used for the delete trigger button (line 615: `className="text-destructive hover:text-destructive"`).

---

### ID-010: Switch touch targets below 44x44px minimum

**Severity:** Medium
**Scenario:** User configures SMTP on a mobile device and tries to toggle the TLS or Active switches.
**Component:** SmtpSettings.tsx lines 522-529, 533-548; switch.tsx

**Current behavior:** The Switch component renders at `h-6 w-11` (24x44px). While the width meets the 44px minimum, the height is only 24px. The containing `div` with `px-4 py-3` adds padding around the row, but the actual interactive Switch element itself is 24px tall. The label and description text occupy separate space but are not wired as click targets for the Switch (the Label has `htmlFor` but the description `<p>` does not). On mobile, a finger tap may miss the switch and land on the surrounding non-interactive area.

**Recommended improvement:** Wrap the entire row in a clickable area that toggles the switch, or increase the Switch's touch target using an invisible padding overlay. The simplest fix: make the outer `div` itself clickable to toggle the switch, so the entire 44px+ tall row acts as the touch target. This is a common pattern in mobile settings UIs.

---

### ID-011: SMTP form grid layout at 375px width

**Severity:** Medium
**Scenario:** User configures SMTP on an iPhone SE or similar 375px-width device.
**Component:** SmtpSettings.tsx line 405

**Current behavior:** The host/port row uses `grid grid-cols-1 sm:grid-cols-[1fr_120px]`. At the `sm` breakpoint (640px), the grid becomes two columns. Below 640px, both fields stack vertically. This is correct responsive behavior. However, the action buttons section (line 551: `flex flex-wrap gap-2`) may cause the "Delete Configuration" button with its long label to wrap awkwardly at 375px. On a 375px screen with default padding, three buttons (Save/Edit, Test Email, Delete) in a flex-wrap layout will likely create an uneven two-row arrangement.

**Recommended improvement:** At mobile widths, consider stacking the action buttons vertically (`flex-col` below `sm` breakpoint) so each button gets full width. This also ensures each button meets the 44px minimum height touch target. Use `flex flex-col sm:flex-row gap-2` instead of `flex flex-wrap gap-2`.

---

### ID-012: Password field keyboard type on mobile

**Severity:** Low
**Scenario:** User enters their SMTP password on a mobile device.
**Component:** SmtpSettings.tsx lines 458-472

**Current behavior:** The password input uses `type={showPassword ? "text" : "password"}` with `autoComplete="new-password"`. On iOS, the `type="password"` input triggers the password manager and secure text entry mode, which is correct. The show/hide toggle button at `tabIndex={-1}` correctly prevents focus-trap issues. However, `autoComplete="new-password"` may cause password managers to offer to generate and save a random password, which is wrong for an SMTP server password that the user already has.

**Recommended improvement:** Change `autoComplete="new-password"` to `autoComplete="off"` or `autoComplete="current-password"` to prevent password generation prompts. The user is entering an existing SMTP password, not creating a new account password.

---

### ID-013: Push error toast reuses test-failed key for subscribe errors

**Severity:** Medium
**Scenario:** User clicks "Enable Push" but the VAPID key fetch fails, or the server-side subscribe call fails.
**Component:** PushSettings.tsx lines 166-173, 231-236, 238-241, 270-273

**Current behavior:** Multiple distinct failure scenarios all display the same toast title: `t("settings.pushTestFailed")` ("Test push notification failed"). This key is semantically wrong for subscription failures -- the user did not attempt a test; they attempted to enable push. The failures at lines 166-173 (VAPID fetch failure), 231-236 (subscribe server call failure), 238-241 (generic catch), and 270-273 (unsubscribe failure) all reuse this same test-related error message.

**Recommended improvement:** Add distinct i18n keys:
- `settings.pushEnableFailed` -- "Failed to enable push notifications"
- `settings.pushDisableFailed` -- "Failed to disable push notifications"
Use these in the respective handlers instead of the test-failed key. This gives the user accurate feedback about what actually failed.

---

### ID-014: SMTP active toggle is editable only in edit mode, but semantically should be quick-toggle

**Severity:** Low
**Scenario:** User wants to temporarily disable email notifications without changing any SMTP settings.
**Component:** SmtpSettings.tsx lines 533-548, line 528

**Current behavior:** The "Active" switch is disabled when `!showForm` (view mode). To toggle email notifications on/off, the user must: click "Save Configuration" (which is really Edit, per ID-003) to enter edit mode, toggle the switch, then click Save, then wait for the server round-trip. This is a 4-step operation for what should be a quick toggle.

**Recommended improvement:** Make the Active switch a standalone quick-toggle that works in view mode. When the user toggles it, immediately call a lightweight server action (or the existing `saveSmtpConfig` with only the `active` field changed) and show a toast. This matches the common pattern in notification settings UIs where enable/disable is a one-tap operation, while editing the underlying configuration is a separate deeper flow.

---

## Positive Observations

These aspects of the implementation are well-done and should be preserved:

1. **Loading states** -- Both components show a spinner with translated text during initial data fetch. The SMTP component also has a dedicated error state with a "Try Again" button.

2. **Confirmation dialogs** -- Destructive actions (SMTP delete, VAPID rotation) use AlertDialog with cancel/confirm, preventing accidental data loss.

3. **Cooldown timer** -- The client-side countdown in the test button text provides clear feedback about when the user can try again. The `useRef` cleanup on unmount prevents memory leaks.

4. **Password handling** -- The SMTP password is never returned from the server. The masked display (****last4) gives enough context without exposing the full credential. The show/hide toggle with proper aria-labels is accessible.

5. **Browser support detection** -- PushSettings correctly checks for ServiceWorker and PushManager support before rendering the full UI, with a clean fallback state.

6. **i18n coverage** -- All 4 locales (EN, DE, FR, ES) have complete translations for every SMTP and Push key. No hardcoded strings found.

7. **Motion-reduce** -- All spinner animations include `motion-reduce:animate-none` for users who prefer reduced motion.

8. **Permission check on mount** -- PushSettings checks `Notification.permission` on initial load and shows the denied warning banner proactively.

---

## Priority Matrix

| ID | Severity | Effort | Impact | Fix Order |
|----|----------|--------|--------|-----------|
| ID-004 | High | Medium | Prevents user from completing push setup | 1 |
| ID-001 | High | Low | User confusion during 30s SMTP test wait | 2 |
| ID-002 | High | Low | Race condition between test and edit | 3 |
| ID-013 | Medium | Low | Wrong error messages confuse troubleshooting | 4 |
| ID-003 | Medium | Low | Misleading button label | 5 |
| ID-007 | Medium | Low | Destructive action lacks visual warning | 6 |
| ID-009 | Medium | Low | Same as ID-007 for SMTP delete | 7 |
| ID-010 | Medium | Medium | Mobile accessibility (Switch touch targets) | 8 |
| ID-011 | Medium | Low | Mobile layout polish | 9 |
| ID-005 | Medium | Medium | Stale subscription detection | 10 |
| ID-006 | Medium | Low | Multi-device clarity (text change only) | 11 |
| ID-008 | Low | Low | Cooldown timing accuracy | 12 |
| ID-012 | Low | Low | Password autocomplete attribute | 13 |
| ID-014 | Low | Medium | Quick-toggle convenience | 14 |

---

## Files Reviewed

| File | Lines | Role |
|------|-------|------|
| `src/components/settings/SmtpSettings.tsx` | 659 | SMTP configuration form component |
| `src/components/settings/PushSettings.tsx` | 566 | Push notification settings component |
| `src/actions/smtp.actions.ts` | 358 | SMTP server actions (CRUD + test) |
| `src/actions/push.actions.ts` | 259 | Push server actions (subscribe, VAPID, test) |
| `src/lib/email-rate-limit.ts` | 146 | Email rate limiting (test: 1/60s) |
| `src/lib/push/rate-limit.ts` | 160 | Push rate limiting (test: 1/60s) |
| `src/lib/smtp-validation.ts` | 130 | SMTP host SSRF validation |
| `src/lib/email/templates.ts` | 213 | Email template rendering |
| `src/components/settings/SettingsSidebar.tsx` | 106 | Settings navigation sidebar |
| `src/app/dashboard/settings/page.tsx` | 55 | Settings page layout |
| `src/components/ui/button.tsx` | -- | Button size variants (h-9 sm, h-10 default) |
| `src/components/ui/switch.tsx` | -- | Switch dimensions (h-6 w-11 = 24x44px) |
| `src/components/ui/alert-dialog.tsx` | -- | AlertDialogAction default styling |
| `src/i18n/dictionaries/settings.ts` | -- | All SMTP/Push i18n keys (4 locales) |
| `public/sw-push.js` | 40 | Push service worker |
