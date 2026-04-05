# Phase 4a: Next.js & TypeScript Best Practices Review

**Scope:** S5b Email + Push Notification Channels
**Reviewer:** Phase 4a (Framework Idioms, Modern Patterns, DevOps)
**Date:** 2026-04-05

---

## Summary

The S5b implementation follows project conventions well and demonstrates solid architectural patterns. The ChannelRouter abstraction is clean and extensible. The main areas for improvement are: duplicated helper code across files, missing `server-only` guards on channel modules that access encrypted data, inconsistent use of `findFirst` vs `findUnique` when querying by `@unique` fields, and not using React's `useTransition` for server action calls in the settings components.

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 2     |
| Medium   | 5     |
| Low      | 5     |

---

## Findings

### HIGH-1: Channel modules lack `import "server-only"` guard

**Location:** `src/lib/notifications/channels/email.channel.ts`, `src/lib/notifications/channels/push.channel.ts`

**Description:** Both `EmailChannel` and `PushChannel` import `decrypt` from `@/lib/encryption` and perform decryption of SMTP passwords and VAPID private keys. The encryption module itself has `import "server-only"`, which provides a transitive guard. However, the channel files themselves do not declare `import "server-only"`. If the encryption module's guard were ever removed or if these files were refactored to use a different decryption path, credentials could be exposed to the client bundle.

By contrast, `src/lib/email-rate-limit.ts`, `src/lib/smtp-validation.ts`, `src/lib/push/vapid.ts`, and `src/lib/push/rate-limit.ts` all correctly declare `import "server-only"`.

**Recommendation:** Add `import "server-only";` at the top of both channel files. This makes the server-only intent explicit and provides defense-in-depth, consistent with the other S5b modules.

---

### HIGH-2: Duplicated `resolveUserLocale` helper across 4 files

**Location:**
- `src/lib/notifications/channels/email.channel.ts` (lines 49-60)
- `src/actions/smtp.actions.ts` (lines 64-75)
- `src/lib/notifications/channels/webhook.channel.ts` (lines 153-162)
- `src/lib/events/consumers/notification-dispatcher.ts` (lines 86-97)

**Description:** The `resolveUserLocale()` function is implemented independently in 4 different files. Each reads `UserSettings`, parses the JSON, extracts `display.locale`, and falls back to `DEFAULT_LOCALE`. The webhook channel version is slightly different (hardcodes `"en"` fallback instead of using `DEFAULT_LOCALE`, does not call `isValidLocale()`).

This violates DRY and creates maintenance risk: if the UserSettings JSON shape changes or locale validation logic evolves, all four copies must be updated. The webhook version already has a subtle behavioral difference (no locale validation).

**Recommendation:** Extract a shared `resolveUserLocale(userId: string): Promise<string>` into a dedicated server-only utility, e.g. `src/lib/locale-resolver.ts` with `import "server-only"`. All consumers then import from this single source.

---

### MEDIUM-1: `findFirst` used where `findUnique` is correct for SmtpConfig

**Location:** `src/lib/notifications/channels/email.channel.ts:97`, `src/actions/smtp.actions.ts:169,236,266,341`

**Description:** `SmtpConfig` has `userId String @unique` in the Prisma schema. All queries use `findFirst({ where: { userId, active: true } })` or `findFirst({ where: { userId } })`. When querying only by `userId` (without `active: true`), `findUnique({ where: { userId } })` is the correct and more efficient Prisma method. `findFirst` bypasses the unique constraint optimization.

For queries that include `active: true` alongside `userId`, `findFirst` is necessary since Prisma's `findUnique` only accepts the unique key. However, the queries at `smtp.actions.ts:169` and `smtp.actions.ts:341` use only `where: { userId: user.id }` without the `active` filter, and should use `findUnique`.

**Recommendation:** Use `findUnique({ where: { userId } })` wherever the query filters only by `userId`. Keep `findFirst` only for queries that add the `active: true` condition.

---

### MEDIUM-2: Duplicated nodemailer transporter configuration

**Location:** `src/lib/notifications/channels/email.channel.ts:140-156`, `src/actions/smtp.actions.ts:294-310`

**Description:** The nodemailer `createTransport()` configuration is duplicated between the EmailChannel dispatch and the `testSmtpConnection()` server action. Both set identical TLS settings (`rejectUnauthorized: true`, `minVersion: "TLSv1.2"`), identical timeout values, and the same `secure`/`requireTLS` logic. If TLS requirements change, both locations must be updated.

**Recommendation:** Extract a `createSmtpTransporter(config, decryptedPassword)` factory function into a shared module (e.g., `src/lib/email/transport.ts` with `import "server-only"`). Both the channel and the test action import from it.

---

### MEDIUM-3: Settings components do not use `useTransition` for server actions

**Location:** `src/components/settings/SmtpSettings.tsx`, `src/components/settings/PushSettings.tsx`

**Description:** Both components manage loading states manually with `useState` booleans (`saving`, `testing`, `deleting`, etc.) when calling server actions. The React 19 / Next.js 15 idiomatic pattern for server action calls is `useTransition` (or `useActionState` for form submissions), which provides a `pending` state that integrates with React's concurrent rendering model and keeps the UI responsive during transitions.

The project already uses `useTransition` in other components (e.g., `CreateResume.tsx`, `AddExperience.tsx`, `AddEducation.tsx`), so this is an inconsistency within the codebase.

While the current approach works correctly, it does not benefit from React's ability to keep showing the old UI during transitions and may cause unnecessary re-renders when setting multiple state variables in sequence.

**Recommendation:** Refactor the action handlers to use `useTransition` or `useActionState` for consistency with the rest of the codebase. This is a progressive improvement and the current implementation is functionally correct.

---

### MEDIUM-4: Placeholder interpolation in templates is fragile

**Location:** `src/lib/email/templates.ts:179-211`

**Description:** `buildNotificationMessage()` performs placeholder interpolation via sequential `String.replace()` calls. There are two issues:

1. **Double replacement risk:** Lines 180-181 iterate over all data keys and replace `{key}` with values. Then lines 186-209 do a second pass replacing specific known keys. If a data value itself contains a `{placeholder}` pattern, the second pass could inadvertently replace it.

2. **Non-global replace:** `String.replace()` with a string argument only replaces the first occurrence. If a template uses `{count}` twice, the second occurrence would not be replaced. Using a regex with the global flag or `replaceAll()` would be safer.

**Recommendation:** Either consolidate into a single pass using a regex-based replacer (`message.replace(/\{(\w+)\}/g, (_, key) => String(data[key] ?? ""))`) or at minimum use `replaceAll()` instead of `replace()`. The second manual pass (lines 186-209) can be removed if the generic loop handles all keys correctly.

---

### MEDIUM-5: `sendTestPush` uses `module_unreachable` as test notification type

**Location:** `src/actions/push.actions.ts:239`

**Description:** The test push action uses `type: "module_unreachable"` for the test notification. This is semantically wrong -- it will bypass per-type suppression if the user has disabled `module_unreachable` notifications, and it will pass per-type checks when the user only wants to test push delivery. Additionally, the message `"push.testBody"` is not an actual translated notification message -- it is an i18n key being sent raw as the push body.

**Recommendation:** Either create a dedicated `"test"` notification type (if the type system allows it) or skip the `shouldNotify()` type check for test dispatches. At minimum, resolve the i18n key before passing it as the message: use `t(locale, "push.testBody")` with the user's locale.

---

### LOW-1: `_testHelpers` exports on production code

**Location:** `src/lib/notifications/channels/email.channel.ts:200-204`, `src/lib/notifications/channels/push.channel.ts:261-265`, `src/lib/events/consumers/notification-dispatcher.ts:308-316`

**Description:** Several modules export `_testHelpers` objects that expose internal functions and constants. While the underscore prefix convention signals internal use, these exports are included in the production bundle and increase the module's public API surface. This is consistent with the existing `webhook.channel.ts` pattern, so it is a project-wide convention rather than an S5b-specific issue.

**Recommendation:** No action needed for S5b specifically. Consider a future refactor using `vitest` module mocking or conditional exports behind `process.env.NODE_ENV === 'test'` to avoid shipping test helpers in production.

---

### LOW-2: Service worker uses `var` instead of `let`/`const`

**Location:** `public/sw-push.js`

**Description:** The service worker uses `var` declarations throughout (lines 11, 20-27, 32-33, 37). While this is functional and the `eslint-disable` comment at line 8 indicates intentional choice, `let`/`const` are universally supported in browsers that support service workers and push notifications.

**Recommendation:** Replace `var` with `const` or `let` as appropriate. All browsers supporting `PushManager` also support ES6+ block scoping.

---

### LOW-3: SmtpSettings password field uses `autoComplete="new-password"` which may trigger password manager save dialogs

**Location:** `src/components/settings/SmtpSettings.tsx:469`

**Description:** The SMTP password field has `autoComplete="new-password"`. This is the correct hint for preventing autofill of the user's login password, but it can trigger password manager "Save this password?" dialogs in some browsers (Chrome, Firefox), which could confuse users since this is an SMTP server password, not an account password.

**Recommendation:** Consider `autoComplete="off"` to suppress password manager interaction entirely for this field. This is a minor UX concern.

---

### LOW-4: ChannelRouter dispatches channels sequentially, not concurrently

**Location:** `src/lib/notifications/channel-router.ts:56-79`

**Description:** The `route()` method iterates channels with a `for...of` loop, `await`-ing each channel's `isAvailable()` and `dispatch()` calls sequentially. With 4 channels registered (InApp, Webhook, Email, Push), this means each channel blocks the next. The webhook channel alone can take up to 36 seconds (3 retries with backoffs).

The `notification-dispatcher.ts` mitigates this at lines 113-115 by calling `channelRouter.route()` in a fire-and-forget pattern (`route(...).catch()`), so it does not block the event bus. However, within the route itself, Email and Push dispatch are still blocked by Webhook retries.

**Recommendation:** Consider using `Promise.allSettled()` for parallel dispatch within the router, similar to how individual channels already dispatch to multiple endpoints concurrently. This would reduce worst-case notification latency significantly. Note: ordering guarantees would need to be reconsidered if any channel depends on another's result.

---

### LOW-5: Inconsistent error toast key reuse in PushSettings

**Location:** `src/components/settings/PushSettings.tsx:168,235,240,272,299`

**Description:** The `PushSettings` component reuses `t("settings.pushTestFailed")` as the error toast title for multiple distinct error scenarios: subscribe failures (line 168, 235, 240), unsubscribe failures (line 272), and actual test push failures (line 299). This makes it harder for users to understand what went wrong.

**Recommendation:** Use distinct i18n keys for different error scenarios: `settings.pushSubscribeFailed`, `settings.pushUnsubscribeFailed`, and `settings.pushTestFailed` respectively.

---

## Positive Observations

The following patterns deserve recognition as well-implemented:

1. **Clean channel abstraction:** The `NotificationChannel` interface and `ChannelRouter` singleton are well-designed. Adding a new channel requires only implementing the interface and registering it -- zero changes to the router or dispatcher.

2. **Consistent IDOR protection:** All Prisma queries include `userId` in the where clause (ADR-015). The `SmtpConfig.update` correctly uses `where: { userId: user.id }`.

3. **Proper TLS enforcement:** Both SMTP transporter configurations set `rejectUnauthorized: true` and `minVersion: "TLSv1.2"`, and the `requireTLS` flag is user-configurable.

4. **Rate limiting with globalThis pattern:** Both email and push rate limiters correctly use `globalThis` singletons with cleanup timers, consistent with the project's established patterns for HMR survival.

5. **Service worker security:** The `sw-push.js` correctly validates URLs on notification click (rejecting absolute URLs, protocol-relative URLs, and `javascript:` URIs to prevent open redirect via push payload).

6. **SSRF re-validation on dispatch:** Both `EmailChannel` and `WebhookChannel` re-validate hosts/URLs on every dispatch, not just at configuration time -- accounting for DNS rebinding attacks.

7. **Encrypted secrets at rest:** VAPID private keys, SMTP passwords, and push subscription keys are all AES-encrypted before storage and decrypted only at send time.

8. **`transporter.close()` in finally blocks:** Both SMTP transporter usages properly close the connection in a `finally` block to prevent socket leaks.

9. **Stale subscription cleanup:** PushChannel automatically deletes subscriptions that return 410 Gone or 404 Not Found, preventing silent failures from accumulating.

10. **Accessibility:** Settings components consistently use `aria-hidden="true"` on decorative icons, `motion-reduce:animate-none` on spinners, and `role="alert"` on error states.
