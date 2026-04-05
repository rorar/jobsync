# Phase 2a: Security Audit -- S5b Email + Push Notification Channels

**Auditor:** Claude Opus 4.6 (Security Auditor Persona)
**Date:** 2026-04-05
**Scope:** Email Channel, Push Channel, Notification Infrastructure, Service Worker
**Methodology:** Manual code review against OWASP Top 10, project ADRs (015-019), and Allium specs

---

## Executive Summary

The S5b implementation demonstrates a generally strong security posture. Encryption at rest (AES-256-GCM with per-record random salts), SSRF validation on SMTP hosts, rate limiting on dispatch channels, and IDOR protection via userId in all Prisma queries are correctly implemented. The service worker includes effective open-redirect prevention.

However, this audit identified **15 findings** across the reviewed files, including **1 Critical**, **3 High**, **4 Medium**, and **7 Low** severity issues. The most significant findings are the missing `import "server-only"` guards on all four channel files (which handle decrypted credentials), the test push sending a raw i18n key instead of translated text, and the PushChannel deleting subscriptions on 401/403 errors (spec deviation that can cause data loss from transient VAPID configuration issues).

---

## Findings

### SEC-S5B-01: Missing `import "server-only"` on ALL Channel Files (HIGH)

**Severity:** High
**CWE:** CWE-200 (Exposure of Sensitive Information)
**Files:**
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/email.channel.ts` (line 1)
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/push.channel.ts` (line 1)
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` (line 1)
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/in-app.channel.ts` (line 1)

**Also missing on:**
- `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts` (line 1)
- `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts` (line 1)

**Description:**
None of the four channel implementation files, the channel router, or the notification dispatcher include the `import "server-only"` guard. These files import and invoke `decrypt()` from `@/lib/encryption` to handle SMTP passwords, VAPID private keys, webhook secrets, and push subscription keys. Without the guard, Next.js bundler could theoretically include these modules in a client bundle if any import chain reaches a client component.

The upstream modules they depend on (`@/lib/encryption`, `@/lib/email-rate-limit`, `@/lib/smtp-validation`, `@/lib/push/vapid`, `@/lib/push/rate-limit`) correctly have `import "server-only"`, which provides defense-in-depth -- but the channel files themselves are the primary entry points and should have their own guard per ADR-016 and project convention.

**Attack Scenario:**
If a future refactor introduces an import path from a `"use client"` component that transitively reaches a channel file, the bundler would attempt to include `decrypt()` logic in the client bundle, potentially exposing the decryption implementation and inviting client-side key handling.

**Remediation:**
Add `import "server-only";` as the first line in each of these six files. This is a zero-risk change -- the files are already server-only in practice.

---

### SEC-S5B-02: sendTestPush() Sends Raw i18n Key as Notification Body (CRITICAL)

**Severity:** Critical (user-visible bug + information leak)
**CWE:** CWE-209 (Generation of Error Message Containing Sensitive Information)
**File:** `/home/pascal/projekte/jobsync/src/actions/push.actions.ts`, lines 237-245

**Description:**
The `sendTestPush()` function constructs a `NotificationDraft` with `message: "push.testBody"` -- this is a raw i18n dictionary key, not a translated string. The `PushChannel.dispatch()` method uses `notification.message` directly as the push notification body (line 122 of `push.channel.ts`):

```typescript
const payload = JSON.stringify({
  title: "JobSync",
  body: notification.message,  // <-- raw "push.testBody" string
  url: "/dashboard",
  tag: notification.type,
});
```

The user sees "push.testBody" as their push notification text instead of a properly localized message like "This is a test push notification from JobSync."

This also leaks the internal i18n key naming convention to the user, which is a minor information disclosure.

**Proof of Concept:**
1. Enable push notifications in Settings
2. Click "Send Test Push"
3. Browser push notification displays body text: `push.testBody`

**Remediation:**
Resolve the user's locale and translate the message before dispatching:

```typescript
import { t } from "@/i18n/server";
import { resolveUserLocale } from "@/lib/email/templates"; // or inline the helper

// Inside sendTestPush():
const locale = await resolveUserLocale(user.id);
const message = t(locale, "push.testBody");

const result = await channel.dispatch(
  {
    userId: user.id,
    type: "module_unreachable",
    message, // translated string
    data: { test: true },
  },
  user.id,
);
```

Note: The `resolveUserLocale` helper is duplicated in `email.channel.ts` and `smtp.actions.ts`. It should be extracted to a shared utility.

---

### SEC-S5B-03: PushChannel Deletes Subscriptions on 401/403 (Spec Deviation / Data Loss) (HIGH)

**Severity:** High
**CWE:** CWE-404 (Improper Resource Shutdown or Release)
**File:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/push.channel.ts`, lines 166-191

**Description:**
The push channel deletes subscriptions when receiving 401 or 403 status codes from the push service. Per the Web Push protocol and the project's own specification (referenced in CLAUDE.md context as F-09), only 410 (Gone) and 404 (Not Found) should trigger subscription deletion:

- **410 Gone**: The push subscription has expired and been removed by the push service. Deletion is correct.
- **404 Not Found**: The subscription was never registered or has been purged. Deletion is correct.
- **401/403**: These indicate a VAPID authentication failure (wrong keys, expired JWT, etc.). The subscription itself may still be valid -- the server just cannot authenticate. Deleting the subscription causes permanent data loss that cannot be recovered without the user manually re-enabling push.

**Attack Scenario:**
1. A transient VAPID key issue (e.g., clock skew causing JWT expiration) returns 401
2. PushChannel deletes all subscriptions for the user
3. Even after the VAPID issue is resolved, the user must re-subscribe on every device

This is particularly damaging because VAPID errors affect ALL subscriptions for a user simultaneously, so a single transient failure can wipe out all 10 allowed subscriptions.

**Remediation:**
Only delete on 410 and 404. For 401/403, log the error and return failure but do NOT delete:

```typescript
if (err.statusCode === 410 || err.statusCode === 404) {
  await prisma.webPushSubscription
    .delete({ where: { id: sub.id, userId } })
    .catch(() => {});
  return { success: false, error: `Subscription expired (${err.statusCode})` };
}

if (err.statusCode === 401 || err.statusCode === 403) {
  console.error(
    `[PushChannel] VAPID auth failure (${err.statusCode}) for ${sub.endpoint}`
  );
  return { success: false, error: `VAPID auth failure (${err.statusCode})` };
}
```

---

### SEC-S5B-04: No Input Length Validation on SMTP/Push Server Actions (MEDIUM)

**Severity:** Medium
**CWE:** CWE-20 (Improper Input Validation), CWE-770 (Allocation of Resources Without Limits)
**Files:**
- `/home/pascal/projekte/jobsync/src/actions/smtp.actions.ts` -- `saveSmtpConfig()`
- `/home/pascal/projekte/jobsync/src/actions/push.actions.ts` -- `subscribePush()`

**Description:**
Neither server action enforces maximum length constraints on string inputs before passing them to Prisma:

**SMTP (`saveSmtpConfig`):**
- `host` -- no max length (attacker could submit a megabyte-long hostname)
- `username` -- no max length
- `password` -- no max length
- `fromAddress` -- only regex-validated, no length bound

**Push (`subscribePush`):**
- `endpoint` -- validated as `https://` prefix, but no max length (push endpoints can be long, but not unbounded)
- `keys.p256dh` -- no max length (should be exactly 65 bytes base64-encoded)
- `keys.auth` -- no max length (should be exactly 16 bytes base64-encoded)

SQLite will accept arbitrarily long strings, and the AES encryption operation on large strings consumes memory proportional to input size.

**Attack Scenario:**
An authenticated attacker sends a `subscribePush()` call with a 100MB `p256dh` value. The `encrypt()` function allocates memory for PBKDF2 key derivation + AES encryption on the 100MB string, potentially causing OOM or degraded server performance.

**Remediation:**
Add explicit length checks at the top of each server action:

```typescript
// smtp.actions.ts - inside validateInput()
if (data.host.length > 255) return { valid: false, error: "smtp.hostTooLong" };
if (data.username.length > 255) return { valid: false, error: "smtp.usernameTooLong" };
if (data.password && data.password.length > 1024) return { valid: false, error: "smtp.passwordTooLong" };
if (data.fromAddress.length > 320) return { valid: false, error: "smtp.fromTooLong" }; // RFC 5321

// push.actions.ts - inside subscribePush()
if (input.endpoint.length > 2048) return { success: false, message: "push.endpointTooLong" };
if (input.keys.p256dh.length > 256) return { success: false, message: "push.invalidKeys" };
if (input.keys.auth.length > 128) return { success: false, message: "push.invalidKeys" };
```

---

### SEC-S5B-05: SMTP Host Validation Missing Octal/Hex IP Bypass (MEDIUM)

**Severity:** Medium
**CWE:** CWE-918 (Server-Side Request Forgery)
**File:** `/home/pascal/projekte/jobsync/src/lib/smtp-validation.ts`

**Description:**
The SMTP host validation uses regex patterns against dotted-decimal IP addresses (e.g., `^10\.`, `^127\.`). However, it does not handle alternative IP address representations that some SMTP libraries or DNS resolvers might accept:

1. **Octal notation:** `0177.0.0.1` is `127.0.0.1` in octal. While nodemailer likely does not resolve octal, this is a defense gap.
2. **Decimal notation:** `2130706433` is the decimal representation of `127.0.0.1`. Some libraries resolve this.
3. **Shortened IPv4:** `127.1` can resolve to `127.0.0.1` in some contexts.
4. **Zero-prefix bypass:** `0127.0.0.1` -- depending on parser, this may be treated as octal (87.0.0.1) or stripped (127.0.0.1).

Note: This is partially mitigated because nodemailer performs DNS resolution internally and the SMTP connection goes through the OS network stack, not an HTTP URL parser. The risk is lower than for HTTP-based SSRF but still represents a defense gap.

**Remediation:**
Add a normalization step before regex checks. Parse the host as an IP address when possible, convert to canonical dotted-decimal form, then validate:

```typescript
import { isIP } from "net";

// If the host looks like an IP, normalize it
if (isIP(cleanHost)) {
  // Already in standard form, existing regex checks apply
} else if (/^\d+$/.test(cleanHost)) {
  // Decimal IP notation (e.g., 2130706433)
  const num = parseInt(cleanHost, 10);
  if (num >= 0 && num <= 0xFFFFFFFF) {
    const normalized = `${(num >>> 24) & 0xFF}.${(num >>> 16) & 0xFF}.${(num >>> 8) & 0xFF}.${num & 0xFF}`;
    return validateSmtpHost(normalized);
  }
}
```

---

### SEC-S5B-06: Email Templates Interpolation with Unsanitized Event Data (MEDIUM)

**Severity:** Medium
**CWE:** CWE-79 (Cross-site Scripting) -- in email context
**File:** `/home/pascal/projekte/jobsync/src/lib/email/templates.ts`, lines 179-211

**Description:**
The `buildNotificationMessage()` function interpolates event data directly into the message string via `String(v ?? "")` replacement. The resulting message is then passed through `escapeHtml()` before insertion into the HTML email body, which provides protection.

However, the plain-text email body (line 126) uses the raw `message` string without any sanitization:

```typescript
const text = `${greeting}\n\n${message}\n\n---\n${footer}`;
```

While plain-text emails do not execute HTML/JS, the interpolated data could contain:
- Control characters that break email parsing
- Extremely long strings that cause email client issues
- Crafted strings that exploit specific email client rendering bugs

The HTML path is correctly protected by `escapeHtml()`.

**Remediation:**
Apply basic sanitization to the plain-text message as well (strip control characters, enforce max length):

```typescript
function sanitizePlainText(str: string): string {
  return str
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "") // strip control chars
    .slice(0, 2000); // reasonable max length
}
```

---

### SEC-S5B-07: resolveUserLocale() Duplicated Across Four Files (MEDIUM)

**Severity:** Medium (maintenance/security risk, not directly exploitable)
**CWE:** CWE-1041 (Use of Redundant Code)
**Files:**
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/email.channel.ts`, lines 49-60
- `/home/pascal/projekte/jobsync/src/actions/smtp.actions.ts`, lines 64-75
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts`, lines 153-162
- `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts`, lines 86-97

**Description:**
The `resolveUserLocale()` helper is duplicated in four separate files. While functionally identical, this creates a maintenance risk: if a security fix is needed in the locale resolution logic (e.g., to prevent locale injection), it must be applied in four places. The webhook version also uses a slightly different default ("en" literal instead of `DEFAULT_LOCALE` constant).

**Remediation:**
Extract to a shared utility file (e.g., `src/lib/locale-resolver.ts`) with `import "server-only"` and import from all four locations.

---

### SEC-S5B-08: PushChannel Rate Limit Applied Per-User Not Per-Subscription (LOW)

**Severity:** Low
**CWE:** CWE-770 (Allocation of Resources Without Limits)
**File:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/push.channel.ts`, lines 72-77

**Description:**
The rate limit check is performed once per dispatch call (line 73), but a single dispatch call sends to ALL subscriptions for a user (up to 10). This means 20 push dispatches per minute could result in 200 actual push API calls if the user has 10 subscriptions. The `web-push` library makes one HTTP request per subscription.

While 200 requests/minute is unlikely to cause issues for most push services, it is technically an amplification vector. An attacker with 10 subscriptions registered could generate 10x the expected outbound traffic.

**Remediation:**
This is acceptable behavior for the current subscription limit of 10. Document the effective maximum: 20 dispatches x 10 subscriptions = 200 push requests/minute. If the subscription limit is ever increased, revisit this.

---

### SEC-S5B-09: Email Channel Sends to user.email, Not config.fromAddress (LOW -- Design Clarification)

**Severity:** Low (functional bug, not security vulnerability)
**CWE:** N/A
**File:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/email.channel.ts`, lines 65-75, 126

**Description:**
The `resolveRecipientEmail()` function queries `prisma.user.findUnique()` to get the user's account email, and uses that as the recipient. The SMTP `fromAddress` is used as the sender. This is correct behavior for sending notifications TO the user. However, the test email in `smtp.actions.ts` (line 314-315) sends to `config.fromAddress` (the sender address), not to the user's account email.

The specification context mentions "F-01: Email dispatch sends to user.email but spec says config.fromAddress." This should be clarified: sending to `user.email` is the correct design for notification emails. The `fromAddress` is the sender identity. If the spec says otherwise, the spec should be updated.

**Remediation:**
Clarify in the spec that notification emails go to `user.email` (recipient) FROM `config.fromAddress` (sender). The test email correctly goes to `fromAddress` since it is testing SMTP connectivity.

---

### SEC-S5B-10: SMTP Port 25 Allowed Without Warning (LOW)

**Severity:** Low
**CWE:** CWE-319 (Cleartext Transmission of Sensitive Information)
**File:** `/home/pascal/projekte/jobsync/src/actions/smtp.actions.ts`, line 91

**Description:**
The port validation accepts any port from 1-65535, including port 25 (plain SMTP). When port 25 is used with `tlsRequired: false`, the SMTP connection may send credentials in cleartext. While `tlsRequired: true` enforces STARTTLS, a user could misconfigure with `port: 25, tlsRequired: false`.

The `secure` flag is only set to `true` for port 465 (line 143 of email.channel.ts):
```typescript
secure: config.port === 465, // true for 465 (implicit TLS), false for others (STARTTLS)
```

If `requireTLS: false` and port is not 465, the connection will attempt opportunistic TLS but fall back to plaintext.

**Remediation:**
Consider warning users when `tlsRequired` is false, or enforce `tlsRequired: true` as a minimum security baseline. At minimum, add a UI warning in SmtpSettings.tsx when TLS is disabled.

---

### SEC-S5B-11: Push Subscription Endpoint Not Validated Against SSRF (LOW)

**Severity:** Low
**CWE:** CWE-918 (Server-Side Request Forgery)
**File:** `/home/pascal/projekte/jobsync/src/actions/push.actions.ts`, lines 75-81

**Description:**
The `subscribePush()` action validates that the endpoint starts with `https://` but does not perform SSRF validation against private IP ranges. The `web-push` library will make an HTTP POST to this endpoint when sending a push notification.

However, the risk is LOW because:
1. Push endpoints are generated by browser push services (FCM, Mozilla autopush), not user-typed
2. The `https://` requirement prevents non-TLS endpoints
3. Push services use well-known public domains (fcm.googleapis.com, updates.push.services.mozilla.com)
4. An attacker would need to register a malicious push subscription from their own browser

**Attack Scenario:**
An attacker registers a push subscription with a crafted endpoint pointing to an internal service (`https://internal-service.local:8080/`). When a notification is dispatched, the server makes an HTTPS POST to the internal endpoint with a predictable payload structure.

**Remediation:**
Consider adding a domain allowlist for known push service providers, or at minimum validate the endpoint against the standard SSRF blocklist:

```typescript
// Optional: validate endpoint domain against SSRF
const endpointUrl = new URL(input.endpoint);
const ssrfCheck = validateWebhookUrl(input.endpoint);
if (!ssrfCheck.valid) {
  return { success: false, message: "push.invalidEndpoint" };
}
```

---

### SEC-S5B-12: Test Push Uses Wrong NotificationType (LOW)

**Severity:** Low
**CWE:** CWE-233 (Improper Handling of Parameters)
**File:** `/home/pascal/projekte/jobsync/src/actions/push.actions.ts`, lines 237-245

**Description:**
The `sendTestPush()` function uses `type: "module_unreachable"` for the test notification. This is semantically incorrect -- a test push is not a module unreachable event. This could:

1. Confuse logging and metrics that track notification types
2. Incorrectly trigger per-type notification preferences (if the user has disabled `module_unreachable` notifications, the test push will be silently suppressed by `shouldNotify()`)
3. Show up in in-app notification feeds as a module failure if the draft leaks to the InAppChannel

**Remediation:**
Either add a dedicated `test_push` NotificationType, or bypass the channel router for test pushes and call `PushChannel.dispatch()` directly without routing through `shouldNotify()`.

---

### SEC-S5B-13: Decrypted VAPID Private Key Returned from getOrCreateVapidKeys() (LOW)

**Severity:** Low
**CWE:** CWE-312 (Cleartext Storage of Sensitive Information -- in memory)
**File:** `/home/pascal/projekte/jobsync/src/lib/push/vapid.ts`, lines 24-53

**Description:**
`getOrCreateVapidKeys()` returns both the public and private key in plaintext. The only caller in the current codebase is `getVapidPublicKeyAction()` in `push.actions.ts`, which only uses `keys.publicKey` and discards the private key. However, the function signature makes it easy for future callers to accidentally log or expose the private key.

The function is in a `"server-only"` module, so the risk is contained to server-side code.

**Remediation:**
Consider splitting into two functions:
- `getOrCreateVapidPublicKey(userId)` -- returns only the public key (for browser subscription)
- `getOrCreateVapidKeyPair(userId)` -- returns both (only for PushChannel dispatch)

Or at minimum, add a JSDoc warning about the sensitive return value.

---

### SEC-S5B-14: Service Worker Push Data Not Validated Against Schema (LOW)

**Severity:** Low
**CWE:** CWE-20 (Improper Input Validation)
**File:** `/home/pascal/projekte/jobsync/public/sw-push.js`, lines 10-29

**Description:**
The service worker `push` event handler parses the push payload JSON and extracts `title`, `body`, `url`, and `tag` without type validation. While the `notificationclick` handler correctly validates the URL (line 37), the `title` and `body` fields are passed directly to `showNotification()`:

```javascript
var title = data.title || "JobSync";
var options = {
  body: data.body || "",  // No validation
  ...
};
```

A malicious or corrupted push payload could set `data.title` or `data.body` to a non-string value (object, array, number), which would be passed to `showNotification()`. Most browsers will safely toString() these, but edge cases in notification rendering could cause unexpected behavior.

**Remediation:**
Add type coercion:

```javascript
var title = typeof data.title === "string" ? data.title : "JobSync";
var body = typeof data.body === "string" ? data.body : "";
```

---

### SEC-S5B-15: Channel Registration Order Allows InApp to Block on Slow Channels (LOW)

**Severity:** Low
**CWE:** CWE-400 (Uncontrolled Resource Consumption)
**File:** `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts`, lines 56-79

**Description:**
The `ChannelRouter.route()` method dispatches to channels sequentially (`for...of` loop, line 56), not concurrently. If the webhook channel's retry logic blocks for up to 36 seconds (3 attempts at 1s + 5s + 30s), the email and push channels will not receive the notification until after the webhook completes.

This is partially mitigated by the `dispatchNotification()` function in `notification-dispatcher.ts` (line 113) which calls `channelRouter.route()` in a fire-and-forget manner. However, within a single route() call, channels block each other.

**Remediation:**
Consider dispatching to all channels concurrently using `Promise.allSettled()`:

```typescript
const results = await Promise.allSettled(
  this.channels.map(async (channel) => {
    // ... existing check + dispatch logic
  })
);
```

This would ensure that a slow webhook retry does not delay email or push delivery.

---

## Positive Security Observations

The following security measures are correctly implemented and deserve recognition:

1. **AES-256-GCM encryption** with per-record random salts (ADR-017) for SMTP passwords, VAPID private keys, webhook secrets, and push subscription keys.

2. **IDOR protection (ADR-015)** is consistently applied -- every Prisma query includes `userId` in the where clause across all server actions.

3. **SSRF validation** on SMTP hosts is comprehensive (RFC 1918, IMDS, link-local, CGN, IPv4-mapped IPv6, GCP metadata), and is re-validated on every dispatch.

4. **TLS enforcement** with `minVersion: "TLSv1.2"` and `rejectUnauthorized: true` prevents downgrade attacks and self-signed certificate acceptance.

5. **Service worker open-redirect prevention** (line 37 of sw-push.js) correctly blocks absolute URLs, protocol-relative URLs, and javascript: URIs.

6. **Rate limiting** is applied at multiple levels: per-channel dispatch limits, test action cooldowns, and the sliding window implementation is correct with proper cleanup.

7. **Password masking** in DTO responses -- only the last 4 characters are returned, the full password is never sent to the client.

8. **Credential encryption/decryption lifecycle** -- decrypted values are used within the dispatch scope and not persisted or returned to callers (with the exception of vapid.ts noted in SEC-S5B-13).

9. **`redirect: "manual"`** on webhook fetch calls prevents open redirect SSRF bypass.

10. **HTML escaping** in email templates via `escapeHtml()` prevents XSS in HTML email bodies.

11. **getCurrentUser() authentication** is consistently checked at the top of every server action before any data access.

---

## Summary Table

| ID | Severity | CWE | File(s) | Title |
|----|----------|-----|---------|-------|
| SEC-S5B-01 | HIGH | CWE-200 | channels/*.ts, channel-router.ts, notification-dispatcher.ts | Missing `import "server-only"` on all channel files |
| SEC-S5B-02 | CRITICAL | CWE-209 | push.actions.ts:237 | sendTestPush() sends raw i18n key as notification body |
| SEC-S5B-03 | HIGH | CWE-404 | push.channel.ts:166 | PushChannel deletes subscriptions on 401/403 |
| SEC-S5B-04 | MEDIUM | CWE-20 | smtp.actions.ts, push.actions.ts | No input length validation on SMTP/Push server actions |
| SEC-S5B-05 | MEDIUM | CWE-918 | smtp-validation.ts | SMTP host validation missing octal/hex IP bypass |
| SEC-S5B-06 | MEDIUM | CWE-79 | templates.ts:126 | Email plain-text body has no control-char sanitization |
| SEC-S5B-07 | MEDIUM | CWE-1041 | 4 files | resolveUserLocale() duplicated in four files |
| SEC-S5B-08 | LOW | CWE-770 | push.channel.ts:72 | Rate limit per-user not per-subscription (amplification) |
| SEC-S5B-09 | LOW | N/A | email.channel.ts:65 | Email recipient is user.email (spec clarification needed) |
| SEC-S5B-10 | LOW | CWE-319 | smtp.actions.ts:91 | Port 25 allowed without TLS warning |
| SEC-S5B-11 | LOW | CWE-918 | push.actions.ts:75 | Push endpoint not SSRF-validated |
| SEC-S5B-12 | LOW | CWE-233 | push.actions.ts:240 | Test push uses wrong NotificationType |
| SEC-S5B-13 | LOW | CWE-312 | vapid.ts:24 | getOrCreateVapidKeys returns decrypted private key |
| SEC-S5B-14 | LOW | CWE-20 | sw-push.js:20 | Service worker push data not schema-validated |
| SEC-S5B-15 | LOW | CWE-400 | channel-router.ts:56 | Sequential channel dispatch blocks on slow channels |

---

## Priority Remediation Order

1. **SEC-S5B-02** (CRITICAL) -- Fix sendTestPush() to translate the message. Immediate fix required.
2. **SEC-S5B-03** (HIGH) -- Stop deleting subscriptions on 401/403. Data loss risk.
3. **SEC-S5B-01** (HIGH) -- Add `import "server-only"` to all six files. Zero-risk defensive fix.
4. **SEC-S5B-04** (MEDIUM) -- Add input length validation. Defense-in-depth.
5. **SEC-S5B-05** (MEDIUM) -- Harden SMTP host validation. Defense-in-depth against IP encoding bypasses.
6. **SEC-S5B-07** (MEDIUM) -- Extract shared resolveUserLocale(). Reduces future security debt.
7. **SEC-S5B-06** (MEDIUM) -- Sanitize plain-text email body. Minor risk but easy fix.
8. Remaining LOWs can be addressed as part of regular maintenance.
