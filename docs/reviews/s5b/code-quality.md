# Phase 1a: Code Quality Review -- S5b Email + Push Channels

**Reviewer:** Claude Opus 4.6 (1M context)
**Date:** 2026-04-05
**Scope:** 16 files across Email Channel, Push Channel, and Notification Infrastructure
**Methodology:** Manual analysis of code complexity, maintainability, duplication, Clean Code, technical debt, error handling, i18n compliance, and DDD compliance

---

## Summary

| Severity | Count |
|----------|-------|
| Critical | 2     |
| High     | 5     |
| Medium   | 8     |
| Low      | 5     |
| **Total** | **20** |

---

## Critical Findings

### C-1: Test Push Sends Raw i18n Key as Notification Body

**File:** `src/actions/push.actions.ts` -- line 241
**Category:** Bug / i18n Compliance

The `sendTestPush()` server action constructs a `NotificationDraft` with `message: "push.testBody"` -- a raw i18n dictionary key. The `PushChannel.dispatch()` method on line 122 of `push.channel.ts` passes `notification.message` directly into the JSON payload as the browser notification body:

```ts
const payload = JSON.stringify({
  title: "JobSync",
  body: notification.message,  // receives "push.testBody" literally
  url: "/dashboard",
  tag: notification.type,
});
```

Users will see the literal string `push.testBody` in their browser notification instead of the translated text ("Your push notifications are working correctly.").

**Fix:** Resolve the i18n key before constructing the draft. Import the locale resolution logic and call `t(locale, "push.testBody")` before passing it as the message field.

---

### C-2: Double Placeholder Replacement in Email Templates Causes Silent Data Corruption

**File:** `src/lib/email/templates.ts` -- lines 180-210
**Category:** Logic Bug / Code Complexity

The `buildNotificationMessage()` function performs placeholder replacement twice:

1. **Generic loop** (line 180-182): Iterates `Object.entries(data)` and replaces `{key}` with the value for every key in the data object.
2. **Manual replacements** (lines 186-210): Performs additional targeted replacements for the same data under different placeholder names (e.g., `data.moduleId` mapped to `{name}`, `data.purgedCount` mapped to `{count}`).

The problem is that the generic loop runs first and replaces `{moduleId}`, `{purgedCount}`, `{affectedAutomationCount}`, etc. -- but the i18n templates use different placeholder names (`{name}`, `{count}`, `{automationCount}`). So:

- The generic loop replaces placeholders that do NOT exist in the templates (no-op, harmless but wasteful).
- The manual block then replaces the actual template placeholders.
- If a template ever uses `{moduleId}` (matching a data key), the generic loop replaces it first, and then the manual `{name}` replacement on line 187 becomes a no-op because `{name}` does not appear -- or worse, it could replace a stale `{name}` placeholder from a different notification type.

Additionally, for `retention_completed` events, both `data.purgedCount` (line 202) and `data.count` (line 204) attempt to replace `{count}`. If `data.count` is present (which it would be for `vacancy_batch_staged`), the first generic-loop replacement may have already consumed the `{count}` placeholder, and then the manual replacement on line 202 becomes a no-op.

**Fix:** Remove the generic loop entirely. The manual replacements are already exhaustive for all 11 notification types. Alternatively, standardize the data keys to match the template placeholders and use only the generic loop, removing the manual block.

---

## High Findings

### H-1: `resolveUserLocale` / `resolveLocale` Duplicated 4 Times with Inconsistent Behavior

**Files:**
- `src/lib/events/consumers/notification-dispatcher.ts` -- lines 86-97 (uses `isValidLocale()`)
- `src/lib/notifications/channels/email.channel.ts` -- lines 49-60 (uses `isValidLocale()`)
- `src/actions/smtp.actions.ts` -- lines 64-75 (uses `isValidLocale()`)
- `src/lib/notifications/channels/webhook.channel.ts` -- lines 153-162 (does NOT use `isValidLocale()`, hardcodes `"en"` instead of `DEFAULT_LOCALE`)

**Category:** Code Duplication / Maintainability / Inconsistency

Four separate implementations of the same locale resolution logic. Three of them properly validate the locale with `isValidLocale()` and use the `DEFAULT_LOCALE` constant; the webhook channel does neither. This means an invalid locale stored in user settings would be passed directly to the `t()` function from the webhook channel, but properly rejected by the other three.

**Fix:** Extract a single `resolveUserLocale(userId: string): Promise<string>` helper into a shared file (e.g., `src/lib/locale-resolver.ts` with `import "server-only"`). All four call sites should import from this single source.

---

### H-2: Nodemailer Transporter Configuration Duplicated Between EmailChannel and SMTP Actions

**Files:**
- `src/lib/notifications/channels/email.channel.ts` -- lines 140-156
- `src/actions/smtp.actions.ts` -- lines 294-310

**Category:** Code Duplication / Maintainability

The entire nodemailer `createTransport()` configuration block (host, port, secure detection, TLS settings, timeouts) is duplicated verbatim. If a security-sensitive setting like `minVersion` or `rejectUnauthorized` needs to change, both locations must be updated in lockstep. A missed update in one would create a security inconsistency.

**Fix:** Extract a `createSmtpTransporter(config, decryptedPassword)` factory function into a shared `src/lib/email/transport.ts` file. Both `EmailChannel.dispatch()` and `testSmtpConnection()` should call this factory.

---

### H-3: `sendTestPush()` Creates a New PushChannel Instance and Double-Charges Rate Limits

**File:** `src/actions/push.actions.ts` -- lines 230-245
**Category:** Logic Bug / Resource Waste

The `sendTestPush()` action:
1. Checks `checkTestPushRateLimit()` (1/60s) -- consumes one test-rate-limit token.
2. Creates `new PushChannel()` -- a fresh instance, not the one registered in the ChannelRouter.
3. Calls `channel.dispatch()`, which internally calls `checkPushDispatchRateLimit()` (20/min) -- consuming one dispatch-rate-limit token.

This means test pushes are double-counted: once against the test limit and once against the dispatch limit. Under high notification volume, a test push could be rejected by the dispatch rate limiter even though the test limiter allowed it. Additionally, creating a new `PushChannel` instance bypasses the singleton pattern used everywhere else.

**Fix:** Either skip the dispatch rate limit check inside `dispatch()` when called with a test flag, or call the internal send logic directly without going through `dispatch()`.

---

### H-4: `buildNotificationMessage()` Recreates a Static Map on Every Call

**File:** `src/lib/email/templates.ts` -- lines 162-174
**Category:** Performance / Maintainability

The `messageKeyMap` record is recreated as a new object literal on every invocation of `buildNotificationMessage()`. This function is called for every email notification. The map is static and should be a module-level constant.

Similarly, `SUBJECT_KEYS` (line 28) is correctly defined at module scope -- `messageKeyMap` should follow the same pattern.

**Fix:** Move `messageKeyMap` to module scope alongside `SUBJECT_KEYS`.

---

### H-5: Channel Files Missing `import "server-only"` Guard

**Files:**
- `src/lib/notifications/channels/email.channel.ts`
- `src/lib/notifications/channels/push.channel.ts`
- `src/lib/notifications/channels/webhook.channel.ts`
- `src/lib/notifications/channel-router.ts`

**Category:** Security / ADR-019 Compliance

These files use Prisma database access and `decrypt()` for credential handling, but none of them include the `import "server-only"` guard. Per the project security rules (ADR-019), files that handle credentials or direct database access should be protected from accidental client-side bundling. While these files are unlikely to be imported in client components today, the guard is a defense-in-depth measure.

Note: `src/lib/email/templates.ts`, `src/lib/email-rate-limit.ts`, `src/lib/smtp-validation.ts`, `src/lib/push/vapid.ts`, and `src/lib/push/rate-limit.ts` all correctly include this guard.

**Fix:** Add `import "server-only";` as the first line in all four channel files and the channel-router module.

---

## Medium Findings

### M-1: `buildNotificationMessage()` Has High Cyclomatic Complexity from Cascading Conditionals

**File:** `src/lib/email/templates.ts` -- lines 156-212
**Category:** Code Complexity / Maintainability

The function body contains 8 sequential `if` blocks checking for the presence of specific data keys, each performing a string replacement. This is procedural, fragile, and requires manual extension every time a new notification type is added. Combined with the generic loop above it, the cognitive complexity is high.

**Fix:** Define a per-type replacement config map:
```ts
const PLACEHOLDER_MAP: Record<string, string> = {
  moduleId: "name",
  affectedAutomationCount: "automationCount",
  pausedAutomationCount: "automationCount",
  purgedCount: "count",
  // ...
};
```
Then iterate the map once, performing `message.replace(`{${target}}`, String(data[source]))`.

---

### M-2: Push Channel Payload Title Hardcoded as "JobSync" -- Not i18n Compliant

**File:** `src/lib/notifications/channels/push.channel.ts` -- line 121
**Category:** i18n Compliance

The push notification title is hardcoded as `"JobSync"` rather than using a per-notification-type translated title. While the application name is likely the same across locales, the CLAUDE.md instructions state "Every UI string must be translated." At minimum, this should be a constant. For better UX, it could use the notification-type-specific subject line (as the email channel does).

**Fix:** Use `t(locale, "push.notificationTitle")` or at minimum extract to a named constant `PUSH_TITLE`.

---

### M-3: Notification Dispatcher Makes Two Separate DB Calls to Resolve Preferences and Locale

**File:** `src/lib/events/consumers/notification-dispatcher.ts` -- lines 71-97, 108-116
**Category:** Performance

Each notification dispatch calls `resolvePreferences(userId)` (DB call) and then `resolveLocale(userId)` (separate DB call) against the same `userSettings` table row. Meanwhile, `dispatchNotification()` calls `resolvePreferences()` but the locale was already resolved by the caller.

This means most notification dispatches make 2 DB calls for the same row when 1 would suffice.

**Fix:** Create a single `resolveUserContext(userId)` function that returns `{ preferences, locale }` from one DB call.

---

### M-4: `SmtpSettings.tsx` Component Has 658 Lines -- Too Large for a Single Component

**File:** `src/components/settings/SmtpSettings.tsx`
**Category:** Maintainability / Component Cohesion

At 658 lines, this component handles loading states, error states, empty states, form state, cooldown timers, and the full CRUD UI. The component could be broken down into:
- `SmtpSettingsForm` (form fields + validation)
- `SmtpSettingsView` (read-only display with action buttons)
- `SmtpSettings` (orchestrator with state management)

**Fix:** Extract the form UI into a sub-component `SmtpSettingsForm` and the view-mode UI into `SmtpSettingsView`, reducing the main component to state orchestration.

---

### M-5: PushSettings.tsx Duplicates Cooldown Logic from SmtpSettings.tsx

**Files:**
- `src/components/settings/SmtpSettings.tsx` -- lines 151-164
- `src/components/settings/PushSettings.tsx` -- lines 141-154

**Category:** Code Duplication

The cooldown timer logic (start countdown, decrement per second, clear on zero, cleanup on unmount) is copy-pasted between the two components. Both use the same `TEST_COOLDOWN_SECONDS = 60`, the same `cooldownRef` pattern, and the same `startCooldown()` implementation.

**Fix:** Extract a `useCooldown(seconds: number)` custom hook that returns `{ cooldown, startCooldown }`.

---

### M-6: `toDTO()` in smtp.actions.ts Decrypts Password Just to Show Last 4 Characters

**File:** `src/actions/smtp.actions.ts` -- lines 116-150
**Category:** Security Smell / Performance

Every time `getSmtpConfig()` is called (including on page load), the encrypted password is fully decrypted just to extract the last 4 characters for the mask display. The full plaintext password exists in memory unnecessarily.

**Fix:** Store the last 4 characters of the password as a separate non-sensitive field (`passwordHint`) at encryption time. This eliminates the need to decrypt during read operations. Alternatively, store the password hash suffix separately.

---

### M-7: `PushChannel.dispatch()` Has Deeply Nested Logic (4+ Levels)

**File:** `src/lib/notifications/channels/push.channel.ts` -- lines 67-239
**Category:** Code Complexity

The dispatch method has 4 levels of nesting: try/catch > map callback > try/catch > if/else for error status codes. The subscription delivery loop (lines 128-201) contains significant logic that could be extracted into a helper.

**Fix:** Extract the per-subscription delivery into a `deliverToSubscription(sub, payload, vapidConfig, vapidSubject, userId)` method. This would reduce nesting and improve testability.

---

### M-8: `notification-dispatcher.ts` Template Interpolation Is Inconsistent with Email Templates

**File:** `src/lib/events/consumers/notification-dispatcher.ts` vs `src/lib/email/templates.ts`
**Category:** Maintainability / DRY Violation

The notification dispatcher (lines 128-287) performs template interpolation using `.replace("{placeholder}", value)` chains with specific placeholder names (`{count}`, `{name}`, `{automationCount}`, etc.). The email template module (lines 156-212) performs its own independent interpolation with different mapping logic. If the i18n template for a notification type changes its placeholder names, both files must be updated independently.

**Fix:** Centralize template interpolation into a shared `interpolateNotificationMessage(type, data, locale)` function. Both the dispatcher and email templates would call it.

---

## Low Findings

### L-1: `SEND_TIMEOUT_MS` Constant Defined in Two Files

**Files:**
- `src/lib/notifications/channels/email.channel.ts` -- line 39
- `src/actions/smtp.actions.ts` -- line 55

**Category:** Code Duplication

Both files define `const SEND_TIMEOUT_MS = 30_000`. If the timeout needs adjustment, both must be changed.

**Fix:** Define once in a shared email config module (same extracted file as the transporter factory from H-2).

---

### L-2: PushChannel Cleanup of 401/403 Subscriptions May Be Too Aggressive

**File:** `src/lib/notifications/channels/push.channel.ts` -- lines 166-190
**Category:** Design Decision / Technical Debt

The channel deletes push subscriptions on HTTP 401 and 403 responses from the push service. While 410 (Gone) and 404 (Not Found) clearly indicate a stale subscription, 401/403 may indicate a temporary VAPID key issue (e.g., clock skew or a transient auth error on the push service). Deleting the subscription forces the user to re-enable push.

**Fix:** Consider only deleting on 404/410 and logging 401/403 as warnings. If 401/403 persists across multiple attempts, then clean up. This matches the behavior described in the allium spec more closely.

---

### L-3: Service Worker Uses `var` Instead of `const`/`let`

**File:** `public/sw-push.js` -- lines 11, 20-27, 33-37
**Category:** Code Style

The service worker uses `var` declarations throughout. While this works in the global scope of a service worker, using `const`/`let` would be more consistent with the rest of the codebase and prevents accidental hoisting bugs.

**Fix:** Replace `var` with `const` (or `let` where reassignment occurs).

---

### L-4: SmtpSettings Edit Button Label Reuses Save Key

**File:** `src/components/settings/SmtpSettings.tsx` -- line 583
**Category:** i18n / UX

The "Edit" button (line 583) uses `t("settings.smtpSave")` as its label text, which is the same key used for the actual "Save" button (line 569). Users see "Save" when they should see "Edit."

**Fix:** Use a dedicated `t("settings.smtpEdit")` key or reuse a `t("settings.edit")` key if one exists.

---

### L-5: `PushSettings` Uses `pushTestFailed` Toast Title for Non-Test Failures

**File:** `src/components/settings/PushSettings.tsx` -- lines 167-168, 234-235, 270-271
**Category:** i18n / UX

When `handleSubscribe()`, `handleUnsubscribe()`, or the vapid key fetch fails, the error toast displays `t("settings.pushTestFailed")` -- a label intended for test push failures. This misleads users who see "Test push failed" when the actual failure is in subscription or unsubscription.

**Fix:** Use context-appropriate error titles: `t("settings.pushSubscribeFailed")`, `t("settings.pushUnsubscribeFailed")`, etc.

---

## Architectural Observations (Non-Actionable)

1. **Channel pattern is well-designed.** The `NotificationChannel` interface, `ChannelRouter`, and per-channel implementations follow a clean Strategy pattern. Registration on first import via `globalThis` singleton is appropriate for the Next.js server environment.

2. **SSRF validation is thorough and consistent.** Both `smtp-validation.ts` and the webhook URL validation cover private IPs, IMDS, IPv4-mapped IPv6, and cloud metadata servers. Re-validation on every dispatch is the correct approach.

3. **Rate limiting implementation is solid.** The sliding window approach with self-stopping cleanup intervals and `unref()` prevents process-exit blocking. The test vs. dispatch separation prevents test actions from depleting operational capacity.

4. **ADR-015 compliance is good across server actions.** All Prisma queries in `smtp.actions.ts` and `push.actions.ts` include `userId` in where clauses. The `getCurrentUser()` session validation is consistently the first check.

5. **Error isolation in ChannelRouter is correct.** Each channel dispatch is wrapped in try/catch, and `Promise.allSettled` in the push/webhook channels prevents one subscription/endpoint failure from blocking others.
