# Phase 3a — Testing Strategy Review: S5b Email + Push Channels

**Date:** 2026-04-05
**Scope:** Email channel, Push channel, SMTP/Push server actions, notification infrastructure
**Reviewer:** Test Automation Agent

---

## Executive Summary

The S5b implementation ships with a solid unit test foundation for the channel layer. Core dispatch paths, rate limiters, VAPID key management, SMTP validation, and ChannelRouter routing are covered. However, there are **10 identified gaps**, two of which are HIGH severity: the server actions (`smtp.actions.ts`, `push.actions.ts`) have zero test coverage, and the `sendTestPush()` action sends a raw i18n key string as the notification body — a confirmed bug with no regression test.

---

## What IS Tested

### Unit Tests (all in `__tests__/`)

| Test File | Implementation File | Coverage Summary |
|---|---|---|
| `email-channel.spec.ts` | `email.channel.ts` | dispatch happy path, rate limit gate, no SMTP config, SSRF block, TLS enforcement, port 465 vs 587, no recipient, sendMail throws, decrypt fails, isAvailable |
| `email-rate-limit.spec.ts` | `email-rate-limit.ts` | 10/min window, blocks at 11th, window expiry, user isolation, test limit 1/60s, test cooldown |
| `email-templates.spec.ts` | `email/templates.ts` | all 11 NotificationTypes render, 4-locale output, HTML structure, escapeHtml applied, renderTestEmail shape |
| `smtp-validation.spec.ts` | `smtp-validation.ts` | localhost variants, RFC 1918 ranges, IMDS, IPv4-mapped IPv6, IPv6 private/link-local, GCP metadata, Carrier-Grade NAT, benchmarking ranges, valid public hosts, empty/whitespace, bracketed IPv6, case-insensitivity, whitespace trim |
| `push-channel.spec.ts` | `push.channel.ts` | send to all subscriptions, 410 stale cleanup, no VAPID config, no subscriptions, rate limited, VAPID decrypt fails, partial success, all-fail aggregation, isAvailable |
| `vapid.spec.ts` | `push/vapid.ts` | getOrCreateVapidKeys creates new, returns existing (decrypted), getVapidPublicKey returns key/null, rotateVapidKeys deletes+regenerates, missing old config no-op |
| `channel-router.spec.ts` | `channel-router.ts` | routes to all channels, shouldNotify gating, isAvailable gating, error isolation per channel, non-Error thrown, isAvailable throws, no channels, duplicate registration, results aggregation |
| `notification-dispatcher.spec.ts` | `notification-dispatcher.ts` | VacancyPromoted, BulkActionCompleted, RetentionCompleted, ModuleDeactivated, ModuleReactivated, VacancyStaged batching, manual staging ignored, error isolation |
| `notification-dispatcher-prefs.spec.ts` | `notification-dispatcher.ts` | resolvePreferences: no settings, no notifications key, stored prefs, DB error; flushStagedBuffer: with prefs, globally disabled, type disabled |

### E2E Tests

| Test File | Coverage |
|---|---|
| `e2e/crud/webhook-settings.spec.ts` | Webhook settings UI: display, create, toggle active, delete, expand events |

**No E2E tests exist for SMTP Settings or Push Settings.**

---

## Gap Analysis

### GAP-1 — CRITICAL: No tests for `smtp.actions.ts`

**Severity: HIGH**
**Risk: Security + Correctness**

`src/actions/smtp.actions.ts` has zero test coverage. This is a `"use server"` file with 4 server actions exposing security-sensitive operations:

- `saveSmtpConfig()` — encrypts password, validates SSRF, has IDOR ownership checks
- `getSmtpConfig()` — returns masked password via `toDTO()` (decrypt + getLast4 path)
- `testSmtpConnection()` — rate-limited, SSRF-revalidated, sends live email
- `deleteSmtpConfig()` — IDOR ownership check via `deleteMany({userId})`

**Untested behaviors:**

- `validateInput()` rejects invalid port range (0, 65536, non-integer, negative)
- `validateInput()` rejects malformed `fromAddress` (fails EMAIL_REGEX)
- Password is NOT re-required on update (when existing config present)
- `toDTO()` produces `****` mask when decrypt throws (hardcoded fallback)
- `saveSmtpConfig()` creates vs. updates based on whether `findFirst` returns a row
- `deleteSmtpConfig()` returns `NOT_FOUND` errorCode when no config exists
- `testSmtpConnection()` uses `resolveUserLocale()` to pick the correct template locale
- Unauthenticated call returns `errors.unauthorized`

**No regression exists for the SSRF re-validation in `testSmtpConnection()`** — the host is validated twice (on save and on test), but only the channel-level re-validation in `email.channel.ts` is covered.

---

### GAP-2 — CRITICAL: No tests for `push.actions.ts`

**Severity: HIGH**
**Risk: Security + Correctness**

`src/actions/push.actions.ts` has zero test coverage. Untested behaviors:

- `subscribePush()` rejects endpoint not starting with `https://`
- `subscribePush()` rejects missing `keys.p256dh` or `keys.auth`
- `subscribePush()` enforces MAX_SUBSCRIPTIONS_PER_USER (10) per user
- `subscribePush()` allows re-subscription to an existing endpoint even at the limit
- `subscribePush()` stores combined IV as `${ivP256dh}|${ivAuth}` (pipe separator)
- `unsubscribePush()` silently succeeds when endpoint not found (`.catch(() => {})`)
- `rotateVapidKeysAction()` delegates to `rotateVapidKeys()` under current user
- `getSubscriptionCount()` returns count with IDOR protection

---

### GAP-3 — HIGH: `sendTestPush()` sends raw i18n key as notification body

**Severity: HIGH**
**Risk: Bug**

In `src/actions/push.actions.ts:241`:

```typescript
message: "push.testBody",
```

This sends the literal string `"push.testBody"` as the push notification body rather than the translated text. The translated value ("Your push notifications are working correctly.") exists in all 4 locales in `src/i18n/dictionaries/email.ts` but is never fetched via `t()`. The push payload reaches the browser with an untranslated key visible to the user.

**No test exists to catch this regression.**

The analogous `testSmtpConnection()` in `smtp.actions.ts` does call `renderTestEmail(locale)` correctly. The inconsistency indicates the push test action was not aligned with the email pattern.

---

### GAP-4 — HIGH: `PushChannel` deletes subscriptions on 401/403 — no test

**Severity: HIGH**
**Risk: Security / Behavior**

In `src/lib/notifications/channels/push.channel.ts:168-188`:

```typescript
if (err.statusCode === 401 || err.statusCode === 403 || err.statusCode === 404 || err.statusCode === 410) {
  await prisma.webPushSubscription.delete({ where: { id: sub.id, userId } });
  ...
}
```

The implementation deletes subscriptions on `401`, `403`, and `404` in addition to `410 Gone`. The `push-channel.spec.ts` only tests the `410 Gone` path (one test: "deletes stale subscription on 410 Gone"). **There are no tests verifying that 401, 403, and 404 also trigger deletion.**

The CLAUDE.md review requirements explicitly flag: "PushChannel deletes subscriptions on 401/403 (should test that it DOESN'T)" — indicating this behavior may be **intentionally wrong** per the original design intention, or it needs a regression test to document the deliberate decision. Either way, the current test suite does not test for it.

---

### GAP-5 — MEDIUM: SMTP validation missing octal/hex IP bypass tests

**Severity: MEDIUM**
**Risk: SSRF bypass**

`smtp-validation.spec.ts` tests standard dotted-decimal and IPv6 notations. However, some HTTP libraries and Node.js DNS resolvers can accept non-standard IP representations. The following bypass vectors are not tested:

- Octal notation: `0177.0.0.1` (= 127.0.0.1 in some contexts)
- Hex notation: `0x7f000001` (= 127.0.0.1)
- Mixed notation: `127.1` (shorthand for 127.0.0.1)
- Decimal-encoded: `2130706433` (= 127.0.0.1 as a single 32-bit integer)

The current `validateSmtpHost()` implementation uses regex patterns on the raw string and does **not** parse these alternative forms. Whether the underlying nodemailer/OS DNS resolution accepts them is uncertain. Tests documenting the current behavior (blocked or allowed) would clarify the attack surface.

---

### GAP-6 — MEDIUM: No unit tests for push rate limiter (`push/rate-limit.ts`)

**Severity: MEDIUM**
**Risk: Rate limit bypass not caught by tests**

`src/lib/push/rate-limit.ts` has no direct test file. The `email-rate-limit.spec.ts` tests the equivalent `email-rate-limit.ts` module thoroughly (sliding window, window expiry, user isolation, test cooldown).

`push-channel.spec.ts` mocks `checkPushDispatchRateLimit` rather than exercising the real implementation. **The `checkTestPushRateLimit` function (used by `sendTestPush()`) is entirely untested.**

Missing coverage:
- `checkPushDispatchRateLimit`: 20/min limit, blocks at 21st, window expiry, user isolation
- `checkTestPushRateLimit`: 1/60s limit, blocks second call, allows after 60s cooldown
- Both stores reset via `resetPushRateLimitStores()`

---

### GAP-7 — MEDIUM: `buildNotificationMessage()` data interpolation not tested

**Severity: MEDIUM**
**Risk: Broken notification messages in email**

`src/lib/email/templates.ts` contains `buildNotificationMessage()` which performs string interpolation of data placeholders (`{name}`, `{automationCount}`, `{count}`, `{actionType}`, etc.). The `email-templates.spec.ts` tests call `renderEmailTemplate(type, {}, "en")` with empty `data` — no test exercises the interpolation logic.

**Untested paths:**

- `module_deactivated` with `{ moduleId: "eures", affectedAutomationCount: 3 }` → `"{name}"` replaced with `"eures"`
- `bulk_action_completed` with `{ succeeded: 5, actionType: "dismiss" }` → placeholders filled
- `retention_completed` with `{ purgedCount: 42 }` → `"{count}"` filled
- `vacancy_batch_staged` with `{ count: 7 }` → `"{count}"` filled
- Data with undefined values: `String(undefined)` → `"undefined"` appears in message

The `purgedCount` vs `count` dual-path (lines 198-205 in templates.ts) where both `purgedCount` and `count` are checked — the first match wins — is also untested.

---

### GAP-8 — MEDIUM: `resolveVapidSubject()` helper in `push.channel.ts` is untested

**Severity: MEDIUM**
**Risk: Wrong VAPID subject causes push delivery failures**

`push.channel.ts` exports `_testHelpers.resolveVapidSubject` for test access. The function:
1. Reads the user's `SmtpConfig.fromAddress` to build `mailto:` subject
2. Falls back to `DEFAULT_VAPID_SUBJECT` on any error or when SMTP is absent

The `push-channel.spec.ts` uses `mockSmtpConfigFindFirst.mockResolvedValue(null)` in `beforeEach` (always returning null), so the SMTP-found code path is never exercised. Additionally, the fallback when SMTP throws an error is not tested.

The `PUSH_TIMEOUT_MS` constant (10s) is also never verified against the `sendNotification()` call options in the test.

---

### GAP-9 — LOW: Email channel does not verify locale resolution path

**Severity: LOW**
**Risk: Non-English users receive English emails**

`email-channel.spec.ts` mocks `mockUserSettingsFindUnique.mockResolvedValue(null)` in `beforeEach`, always triggering the `DEFAULT_LOCALE` ("en") fallback. The `resolveUserLocale()` path where a valid stored locale (e.g., `"de"`) is returned and passed to `renderEmailTemplate()` is not tested.

The exported `_testHelpers.resolveUserLocale` is available but unused in tests.

---

### GAP-10 — LOW: No E2E tests for SMTP Settings and Push Settings UI

**Severity: LOW** (deferred from S5b per `project_s5b_deferred_items.md`)
**Risk: UI regressions go undetected**

`e2e/crud/webhook-settings.spec.ts` covers the Webhook channel UI. No equivalent E2E spec exists for:

- `SmtpSettings.tsx`: form display, save with validation errors, test button countdown, delete confirmation
- `PushSettings.tsx`: enable/disable push, test push button, VAPID rotation warning dialog, subscription count display

This is a known deferred item from S5b. The CRUD pattern from `webhook-settings.spec.ts` should be replicated for both settings sections. Key scenarios for SMTP:
1. Navigate to Settings → Email
2. Fill form with valid data → save → verify success toast
3. Fill form with blocked IP host → submit → verify SSRF error appears
4. Click "Test Connection" → verify rate-limit countdown appears on second click within 60s

---

## Test Quality Assessment

### Strengths

**EmailChannel tests** are behavioral, not implementation-bound. They test observable outcomes (returned `ChannelResult`, `createTransport` call shape) without brittle assertions on internal state. The decryption-failure test uses `jest.requireMock` correctly to override a single call.

**smtp-validation.spec.ts** is comprehensive for the documented threat model. The boundary tests for `172.15.x` (not private) and `172.32.x` (not private) correctly distinguish the RFC 1918 range edges.

**push-channel.spec.ts** correctly defines `WebPushError` inside the `jest.mock()` factory (hoisting-safe pattern). The `Promise.allSettled`-based partial-success test is well-designed.

**vapid.spec.ts** verifies the encryption contract (encrypt on create, decrypt on retrieve) and the transaction atomicity for rotation.

**channel-router.spec.ts** thoroughly tests the dispatch pipeline composition including the `isAvailable` throwing path — a subtle error-isolation case.

### Weaknesses

**notification-dispatcher.spec.ts** only validates the InApp channel path. Since the `channelRouter` is a `globalThis` singleton, the real `EmailChannel` and `PushChannel` are registered during import but their behavior is not verified in dispatcher tests — they pass because Prisma is mocked to return no SMTP config or VAPID config. This means the dispatcher's multi-channel routing is not integration-tested.

**email-templates.spec.ts** mocks `@/i18n/dictionaries` but `templates.ts` imports from `@/i18n/server` which re-exports from `@/i18n/dictionaries`. This works due to module resolution but is fragile — if the re-export chain changes, the mock may silently stop intercepting. The mock should target `@/i18n/server` directly (or both) for correctness.

**Push-channel subscription key decryption** is not individually tested. The `iv` field parsing (`split("|")`) with the fallback `ivParts[1] ?? ivParts[0]` for single-iv legacy records is tested only via the happy path (where the mock decrypt succeeds). A test with a malformed or single-part IV string is missing.

---

## Missing Tests: Action Items

| ID | File to Create | Priority | Description |
|---|---|---|---|
| T-1 | `__tests__/smtp.actions.spec.ts` | HIGH | Full unit test suite for all 4 server actions |
| T-2 | `__tests__/push.actions.spec.ts` | HIGH | Full unit test suite for all 6 server actions |
| T-3 | Add to `push-channel.spec.ts` | HIGH | Test 401/403/404 subscription deletion behavior |
| T-4 | Add to `push-channel.spec.ts` or `push.actions.spec.ts` | HIGH | Regression test for `sendTestPush()` sending translated body (not raw key) |
| T-5 | `__tests__/push-rate-limit.spec.ts` | MEDIUM | Real-implementation rate limit tests mirroring `email-rate-limit.spec.ts` |
| T-6 | Add to `email-templates.spec.ts` | MEDIUM | Data interpolation tests for all placeholder types |
| T-7 | Add to `push-channel.spec.ts` | MEDIUM | `resolveVapidSubject()` with SMTP config present and error fallback |
| T-8 | Add to `smtp-validation.spec.ts` | MEDIUM | Document behavior for octal (`0177.0.0.1`), hex (`0x7f000001`), shorthand (`127.1`) inputs |
| T-9 | Add to `email-channel.spec.ts` | LOW | `resolveUserLocale()` with valid stored locale (non-default path) |
| T-10 | `e2e/crud/smtp-settings.spec.ts` | LOW | E2E: SMTP Settings UI — save, test button, delete |
| T-11 | `e2e/crud/push-settings.spec.ts` | LOW | E2E: Push Settings UI — enable/disable, test button, rotation warning |

---

## Specific Test Sketches for HIGH Items

### T-1: smtp.actions.spec.ts — key scenarios

```typescript
// saveSmtpConfig — create
it("creates SMTP config with encrypted password", ...)
it("rejects invalid port 0", ...)
it("rejects invalid port 65536", ...)
it("rejects malformed fromAddress", ...)
it("rejects SSRF host (calls validateSmtpHost)", ...)
it("password not required on update", ...)
it("returns unauthorized when not logged in", ...)

// getSmtpConfig
it("returns masked password in DTO", ...)
it("returns null data when no config", ...)
it("toDTO returns **** mask when decrypt throws", ...)

// testSmtpConnection
it("returns smtp.testRateLimited when rate limited", ...)
it("returns smtp.notConfigured when no active config", ...)
it("re-validates SMTP host before sending", ...)
it("uses user locale for test email", ...)

// deleteSmtpConfig
it("returns NOT_FOUND when no config exists", ...)
it("uses deleteMany with userId (IDOR protection)", ...)
```

### T-2: push.actions.spec.ts — key scenarios

```typescript
// subscribePush
it("rejects non-https endpoint", ...)
it("rejects missing p256dh key", ...)
it("rejects when at limit and endpoint is new", ...)
it("allows re-subscription at limit (existing endpoint)", ...)
it("stores combined IV as pipe-separated string", ...)

// sendTestPush — regression for GAP-3
it("sends translated body, not raw i18n key", async () => {
  // After fix: verify message is "Your push notifications are working correctly."
  // not "push.testBody"
})

// unsubscribePush
it("succeeds silently when endpoint not found", ...)

// rotateVapidKeysAction
it("returns new publicKey", ...)
it("returns unauthorized when not logged in", ...)
```

### T-3/T-4: push-channel.spec.ts additions

```typescript
it("deletes subscription on 401 Unauthorized", async () => {
  const err401 = new MockWebPushError("Unauthorized", 401);
  mockSendNotification.mockRejectedValue(err401);
  const result = await channel.dispatch(NOTIFICATION, TEST_USER_ID);
  expect(mockWebPushSubscriptionDelete).toHaveBeenCalledWith({
    where: { id: SUBSCRIPTION_1.id, userId: TEST_USER_ID },
  });
  expect(result.error).toContain("VAPID auth failure (401)");
});

it("deletes subscription on 403 Forbidden", ...)
it("deletes subscription on 404 Not Found", ...)

// Regression for raw i18n key bug
it("uses sendTestPush with translated message not raw key", ...)
```

---

## Coverage Risk Summary

| Area | Unit | Integration | E2E | Risk |
|---|---|---|---|---|
| EmailChannel dispatch | GOOD | NONE | NONE | Medium |
| Email rate limiter | GOOD | — | — | Low |
| Email templates | GOOD (gap: interpolation) | — | — | Medium |
| SMTP validation | GOOD (gap: alt formats) | — | — | Medium |
| smtp.actions | **NONE** | NONE | NONE | HIGH |
| PushChannel dispatch | GOOD (gap: 401/403/404) | NONE | NONE | High |
| Push rate limiter | Mocked only | — | — | Medium |
| VAPID key management | GOOD | — | — | Low |
| push.actions | **NONE** | NONE | NONE | HIGH |
| ChannelRouter | GOOD | — | — | Low |
| NotificationDispatcher | GOOD (InApp only) | — | — | Medium |
| SmtpSettings UI | — | — | NONE | Low |
| PushSettings UI | — | — | NONE | Low |
| sw-push.js | — | — | NONE | Low |

---

## Conclusion

The channel implementation layer (EmailChannel, PushChannel, VAPID, rate limiters, ChannelRouter) has solid unit coverage. The two **critical gaps** are both at the server action boundary — `smtp.actions.ts` and `push.actions.ts` have no tests whatsoever, which means IDOR protection, input validation, rate limiting, and encryption contracts at the API surface are all untested. The confirmed `sendTestPush()` raw-key bug (GAP-3) requires both a fix and a regression test. The 401/403/404 deletion behavior in PushChannel (GAP-4) needs tests to document whether this is intentional design.

The deferred E2E tests for SmtpSettings and PushSettings remain the lowest-risk gap, consistent with the S5b deferral decision.
