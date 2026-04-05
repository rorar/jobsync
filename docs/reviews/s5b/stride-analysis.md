# STRIDE Threat Analysis: SMTP Credentials & Push Subscriptions

**Scope:** SMTP credential lifecycle and browser push subscription management in the JobSync notification system.

**Date:** 2026-04-05

**Files analyzed:**
- `src/actions/smtp.actions.ts`
- `src/actions/push.actions.ts`
- `src/lib/encryption.ts`
- `src/lib/notifications/channels/email.channel.ts`
- `src/lib/notifications/channels/push.channel.ts`
- `src/lib/push/vapid.ts`
- `src/lib/smtp-validation.ts`
- `src/lib/email-rate-limit.ts`
- `src/lib/push/rate-limit.ts`
- `src/lib/notifications/channel-router.ts`
- `src/lib/notifications/types.ts`
- `src/utils/user.utils.ts`
- `prisma/schema.prisma` (SmtpConfig, VapidConfig, WebPushSubscription models)

**Methodology:** Each finding is categorized by STRIDE category, assigned a severity (CRITICAL / HIGH / MEDIUM / LOW / INFORMATIONAL), described with an attack scenario, and assessed for mitigation status.

---

## 1. Spoofing

### S-01: All SMTP server actions are session-gated
- **Severity:** MITIGATED
- **Attack scenario:** An unauthenticated attacker calls `saveSmtpConfig()`, `getSmtpConfig()`, `testSmtpConnection()`, or `deleteSmtpConfig()` directly via the Next.js Server Action HTTP endpoint.
- **Analysis:** Every exported function in `smtp.actions.ts` calls `getCurrentUser()` as its first operation and returns `{ success: false, message: "errors.unauthorized" }` if the session is null. `getCurrentUser()` is backed by NextAuth `auth()` with `import "server-only"`, ensuring the session cannot be forged from the client.
- **Mitigation status:** MITIGATED.

### S-02: All push server actions are session-gated
- **Severity:** MITIGATED
- **Attack scenario:** An unauthenticated attacker calls `subscribePush()`, `unsubscribePush()`, `rotateVapidKeysAction()`, or `sendTestPush()`.
- **Analysis:** All six exported functions in `push.actions.ts` (`getVapidPublicKeyAction`, `subscribePush`, `unsubscribePush`, `getSubscriptionCount`, `rotateVapidKeysAction`, `sendTestPush`) call `getCurrentUser()` first and reject unauthorized requests.
- **Mitigation status:** MITIGATED.

### S-03: vapid.ts accepts raw userId but is behind `import "server-only"`
- **Severity:** MITIGATED
- **Attack scenario:** An attacker calls `getOrCreateVapidKeys(victimUserId)` or `rotateVapidKeys(victimUserId)` directly from the browser.
- **Analysis:** `src/lib/push/vapid.ts` has `import "server-only"` at line 1, which causes a build-time error if any client component imports it. The file is NOT a `"use server"` file, so its exports are not exposed as callable Server Actions. It is only imported by `push.actions.ts`, which performs its own session check before passing `user.id`. This follows ADR-019 Pattern A.
- **Mitigation status:** MITIGATED.

### S-04: EmailChannel and PushChannel accept raw userId in dispatch()
- **Severity:** LOW
- **Attack scenario:** An internal code path passes the wrong userId to `channel.dispatch(draft, userId)`, causing notifications to be sent through another user's SMTP server or push subscriptions.
- **Analysis:** `EmailChannel.dispatch()` and `PushChannel.dispatch()` receive userId as a parameter and use it to look up SmtpConfig and VapidConfig/WebPushSubscription respectively. These are NOT `"use server"` exports; they are called only by `ChannelRouter.route()`, which receives the userId from the `NotificationDraft`. The call chain originates from the notification dispatcher, which resolves userId from the domain event. There is no direct browser invocation path.
- **Mitigation status:** MITIGATED. The trust boundary is correct: internal-only code, not exposed as Server Actions.

---

## 2. Tampering

### T-01: IDOR protection on SMTP config CRUD
- **Severity:** MITIGATED
- **Attack scenario:** User A attempts to modify or read User B's SMTP configuration by manipulating request parameters.
- **Analysis:** All Prisma queries in `smtp.actions.ts` include `userId: user.id` in the `where` clause. The SmtpConfig model has `userId @unique`, so `findFirst({ where: { userId: user.id } })` correctly limits access. The `update` uses `where: { userId: user.id }`, and `deleteMany` also includes `userId`. No resource ID from the client is used in isolation.
- **Mitigation status:** MITIGATED.

### T-02: IDOR protection on push subscription CRUD
- **Severity:** MITIGATED
- **Attack scenario:** User A attempts to register a push subscription under User B's account, or delete User B's subscriptions.
- **Analysis:** `subscribePush()` uses `user.id` from the session for all queries. The upsert uses the composite unique key `userId_endpoint` with `userId: user.id`. `unsubscribePush()` deletes by the same composite key. `getSubscriptionCount()` filters by `userId: user.id`. No client-supplied userId is trusted.
- **Mitigation status:** MITIGATED.

### T-03: IDOR protection on VAPID key management
- **Severity:** MITIGATED
- **Attack scenario:** User A triggers VAPID key rotation for User B, invalidating all of User B's push subscriptions.
- **Analysis:** `rotateVapidKeysAction()` calls `getCurrentUser()` and passes `user.id` to `rotateVapidKeys()`. The `rotateVapidKeys()` function uses `userId` in all Prisma queries (`deleteMany({ where: { userId } })`, `deleteMany({ where: { userId } })`).
- **Mitigation status:** MITIGATED.

### T-04: AES-GCM authentication tag prevents ciphertext tampering
- **Severity:** MITIGATED
- **Attack scenario:** An attacker with database access modifies the encrypted SMTP password or VAPID private key ciphertext to inject a controlled value.
- **Analysis:** `encryption.ts` uses AES-256-GCM, which includes a 16-byte authentication tag appended to the ciphertext. The `decrypt()` function calls `decipher.setAuthTag(authTag)`, and `decipher.final()` will throw if the auth tag does not match. Any tampered ciphertext will be rejected. The salt is embedded in the format `salt:<hex>:<payload>`, so tampering with the salt also causes decryption failure.
- **Mitigation status:** MITIGATED.

### T-05: SMTP host SSRF re-validation on every dispatch
- **Severity:** MITIGATED
- **Attack scenario:** An attacker saves a legitimate SMTP host, then somehow the DNS resolution changes to point to an internal IP (DNS rebinding). The email channel connects to an internal service.
- **Analysis:** `EmailChannel.dispatch()` (line 114) calls `validateSmtpHost(config.host)` on every dispatch, not just on save. `testSmtpConnection()` (line 281) also re-validates. The validation blocks all private IP ranges, IMDS, localhost, Carrier-Grade NAT, reserved ranges, and IPv4-mapped IPv6 addresses. However, the validation operates on the hostname string, not the resolved IP. If DNS resolves `legit-host.com` to a private IP, the string-level check would pass.
- **Mitigation status:** PARTIALLY MITIGATED. The hostname-level SSRF check is strong but does not cover DNS rebinding attacks where a legitimate hostname resolves to a private IP after validation. This is a known limitation shared with the webhook URL validator. See finding T-05a below.

### T-05a: DNS rebinding gap in SMTP host validation
- **Severity:** MEDIUM
- **Attack scenario:** Attacker configures SMTP host as `attacker.com` which initially resolves to a public IP (passes validation), then changes DNS to resolve to `169.254.169.254` (IMDS) or `10.0.0.1`. When the email channel dispatches, nodemailer connects to the internal IP.
- **Analysis:** `validateSmtpHost()` checks the hostname string against known private patterns but does not resolve DNS and check the resulting IP. This is a time-of-check-to-time-of-use (TOCTOU) issue. The same gap exists in `validateWebhookUrl()`. For SMTP, the practical risk is lower because the attacker would need the internal service to speak SMTP protocol, which limits exploitation.
- **Mitigation status:** UNMITIGATED (accepted risk). Full mitigation would require DNS resolution at validation time and a custom socket connect hook in nodemailer to verify the resolved IP, which is nontrivial.

---

## 3. Repudiation

### R-01: No audit logging for SMTP credential changes
- **Severity:** MEDIUM
- **Attack scenario:** A user (or an attacker who compromised a session) modifies the SMTP configuration to redirect emails to a malicious server. There is no audit trail to determine when the change happened or what the previous configuration was.
- **Analysis:** `saveSmtpConfig()` performs a direct Prisma `create` or `update` without recording the change in any audit log table. The only evidence is the `updatedAt` timestamp on the SmtpConfig record itself, which shows the last modification time but not the history of changes or who made them. `deleteSmtpConfig()` also has no audit trail.
- **Mitigation status:** UNMITIGATED. No credential change audit log exists. The `updatedAt` field provides minimal forensic value.

### R-02: No audit logging for push subscription changes
- **Severity:** LOW
- **Attack scenario:** An attacker registers a rogue push subscription endpoint under a user's account, then removes it after receiving sensitive notifications, leaving no evidence.
- **Analysis:** `subscribePush()` and `unsubscribePush()` perform direct Prisma operations without any audit trail. `rotateVapidKeys()` deletes all subscriptions in a transaction with no logging of what was deleted.
- **Mitigation status:** UNMITIGATED. No subscription change log exists.

### R-03: No audit logging for VAPID key rotation
- **Severity:** LOW
- **Attack scenario:** An attacker rotates a user's VAPID keys, invalidating all existing push subscriptions. There is no log of when this happened.
- **Analysis:** `rotateVapidKeys()` performs a `$transaction` that deletes all subscriptions and the old VapidConfig, then creates new keys. No audit record is created.
- **Mitigation status:** UNMITIGATED.

### R-04: Test SMTP connection failure logged with raw error
- **Severity:** INFORMATIONAL
- **Attack scenario:** Not a direct repudiation threat, but relevant: `testSmtpConnection()` at line 327 logs `console.error("[smtp.actions] Test SMTP connection failed:", error)` which may include SMTP server error messages containing internal hostnames or auth failure details. This provides some operational logging but is not structured audit data.
- **Analysis:** The log line provides some forensic value for debugging but does not constitute a formal audit trail. The raw error object may include sensitive SMTP protocol details.
- **Mitigation status:** PARTIALLY MITIGATED. Operational logging exists but is not a proper audit mechanism.

---

## 4. Information Disclosure

### I-01: SMTP password masked correctly in DTO responses
- **Severity:** MITIGATED
- **Attack scenario:** An attacker calls `getSmtpConfig()` to exfiltrate the full SMTP password.
- **Analysis:** The `toDTO()` function (line 116-150) decrypts the password only to extract the last 4 characters via `getLast4()`, then returns `****` + last 4 chars as `passwordMask`. The full decrypted password is in a local variable that goes out of scope. The DTO never includes the raw `password` or `iv` fields from the database.
- **Mitigation status:** MITIGATED.

### I-02: SMTP password decrypted and held in local variable during dispatch
- **Severity:** LOW
- **Attack scenario:** A memory dump or heap inspection reveals the decrypted SMTP password.
- **Analysis:** In `EmailChannel.dispatch()` (line 105-107), the decrypted password is stored in `decryptedPassword` and used at line 146 to create the nodemailer transporter. The variable remains in scope until the outer try block completes. In `testSmtpConnection()` (line 274), the same pattern holds. There is no explicit zeroing of the variable after use. In JavaScript/Node.js, strings are immutable and cannot be reliably zeroed from memory. Garbage collection will eventually reclaim the memory, but the timing is nondeterministic.
- **Mitigation status:** PARTIALLY MITIGATED. This is an inherent limitation of the JavaScript runtime. The decrypted value is scoped to the function and not stored in any persistent data structure, which is the best practice achievable in this environment.

### I-03: VAPID private key decrypted and held in scope during push dispatch
- **Severity:** LOW
- **Attack scenario:** Same as I-02 but for the VAPID private key.
- **Analysis:** In `PushChannel.dispatch()` (line 104-106), `vapidPrivateKey` is decrypted and then passed to every `webpush.sendNotification()` call at line 160. It remains in scope for the entire dispatch loop across all subscriptions. The web-push library may also hold references to it internally during the signing process.
- **Mitigation status:** PARTIALLY MITIGATED. Same JavaScript runtime limitation as I-02. The key is not persisted beyond the function scope.

### I-04: Push subscription keys (p256dh, auth) decrypted per-subscription
- **Severity:** MITIGATED
- **Attack scenario:** Subscription keys leak from the dispatch path.
- **Analysis:** In `PushChannel.dispatch()` (lines 137-141), `p256dh` and `auth` are decrypted inside the `subscriptions.map()` callback, scoped to each individual subscription's async closure. They are used immediately in the `webpush.sendNotification()` call and go out of scope when the callback completes. This is a good pattern: decrypt late, use immediately, discard early.
- **Mitigation status:** MITIGATED.

### I-05: console.error may log decryption errors with sensitive context
- **Severity:** MEDIUM
- **Attack scenario:** A decryption failure causes the error object to be logged. Depending on the Node.js crypto module's error formatting, the log line may include partial plaintext, the encryption key, or other sensitive material.
- **Analysis:** Two instances found:
  - `email.channel.ts:109`: `console.error("[EmailChannel] Failed to decrypt SMTP password:", err)` -- logs the raw error from `decrypt()`. The crypto module's `decipher.final()` throws errors like "Unsupported state or unable to authenticate data" which do not typically contain key material. However, if the error is from a different code path (e.g., Buffer parsing), it could include partial data.
  - `push.channel.ts:108`: `console.error("[PushChannel] Failed to decrypt VAPID private key:", err)` -- same pattern.
  - `push.channel.ts:144`: `console.error("[PushChannel] Failed to decrypt subscription keys for ${sub.id}:", err)` -- includes the subscription ID, which is acceptable, but also the raw error.
- **Mitigation status:** PARTIALLY MITIGATED. The crypto errors from AES-GCM typically do not contain key material, but logging raw error objects is risky. Best practice would be to log only `err.message`, not the full error object.

### I-06: `getOrCreateVapidKeys()` returns decrypted private key unnecessarily
- **Severity:** MEDIUM
- **Attack scenario:** The `getOrCreateVapidKeys()` function (vapid.ts:24-53) always returns `{ publicKey, privateKey }` with the privateKey decrypted. The only caller that needs the private key is `PushChannel.dispatch()`, which decrypts it separately by reading VapidConfig directly from Prisma. The `getVapidPublicKeyAction()` server action only uses the `publicKey` from the result (push.actions.ts:55) but the private key is still decrypted and returned.
- **Analysis:** When `getVapidPublicKeyAction()` is called, `getOrCreateVapidKeys()` decrypts the private key even though only the public key is needed. The private key value sits in memory (in the ActionResult response processing chain) longer than necessary. The server action correctly returns only `{ publicKey: keys.publicKey }` to the client, so the private key does not leak to the browser.
- **Mitigation status:** PARTIALLY MITIGATED. The private key does not reach the client, but it is decrypted unnecessarily in the `getVapidPublicKeyAction` code path. A dedicated `getOrCreateVapidPublicKey()` that skips decryption would be cleaner.

### I-07: VAPID public key is inherently public
- **Severity:** INFORMATIONAL
- **Attack scenario:** An attacker obtains the VAPID public key from `getVapidPublicKeyAction()`.
- **Analysis:** The VAPID public key is designed to be shared with browsers for push subscription. It is not a secret. The `publicKey` field in VapidConfig is stored in plaintext, which is correct. No information disclosure issue.
- **Mitigation status:** N/A (not a vulnerability).

### I-08: Push subscription endpoints are stored in plaintext
- **Severity:** LOW
- **Attack scenario:** Database access reveals all push subscription endpoint URLs, which are controlled by push service providers (FCM, Mozilla Push, etc.) and include an opaque subscription identifier.
- **Analysis:** The `endpoint` field in WebPushSubscription is stored in plaintext. Push endpoints are semi-sensitive: knowing an endpoint alone is not sufficient to send push notifications (requires VAPID signing + p256dh/auth keys), but it reveals which push service the user's browser uses and could be used for targeted denial-of-service against the push service. The `p256dh` and `auth` fields are properly encrypted.
- **Mitigation status:** PARTIALLY MITIGATED. The cryptographic keys are encrypted, but the endpoint URL is not. This is an accepted trade-off because the endpoint is needed for the `@@unique([userId, endpoint])` constraint and upsert lookups.

---

## 5. Denial of Service

### D-01: Email dispatch rate limiting
- **Severity:** MITIGATED
- **Attack scenario:** An attacker with a valid session triggers a flood of email notifications to exhaust the user's SMTP server quota or cause the application to consume resources creating SMTP connections.
- **Analysis:** `EmailChannel.dispatch()` checks `checkEmailRateLimit(userId)` which enforces 10 emails per minute per user via a sliding window. `testSmtpConnection()` has a separate limit of 1 test per 60 seconds. Both use in-memory stores on `globalThis`. SMTP operations have a 30-second timeout (`SEND_TIMEOUT_MS`).
- **Mitigation status:** MITIGATED.

### D-02: Push dispatch rate limiting
- **Severity:** MITIGATED
- **Attack scenario:** An attacker triggers a flood of push notifications to overwhelm the push service or consume server resources.
- **Analysis:** `PushChannel.dispatch()` checks `checkPushDispatchRateLimit(userId)` which enforces 20 pushes per minute per user. `sendTestPush()` has a separate limit of 1 test per 60 seconds. Push sends have a 10-second timeout (`PUSH_TIMEOUT_MS`). Delivery uses `Promise.allSettled()` which prevents one slow subscription from blocking others.
- **Mitigation status:** MITIGATED.

### D-03: In-memory rate limiters do not survive process restart
- **Severity:** LOW
- **Attack scenario:** An attacker discovers the application restarts (e.g., during deployment) and times their abuse to coincide with restarts, resetting all rate limit counters.
- **Analysis:** Both `email-rate-limit.ts` and `push/rate-limit.ts` use in-memory `Map` stores on `globalThis`. These survive HMR in development but are lost on full process restart. In a self-hosted single-instance deployment (which JobSync targets), this means rate limits reset on every deployment or crash. The window is small (restart takes seconds) and the attacker would need to be actively watching.
- **Mitigation status:** PARTIALLY MITIGATED. Acceptable for a single-process self-hosted application. Document SEC-16 acknowledges this limitation.

### D-04: No input length validation on push subscription fields
- **Severity:** MEDIUM
- **Attack scenario:** An attacker calls `subscribePush()` with an extremely long `endpoint` string (e.g., 10MB) or very long `keys.p256dh`/`keys.auth` values. The endpoint is stored in plaintext; the keys are passed to `encrypt()` which processes them through AES-GCM. While AES-GCM handles arbitrary-length plaintext, the PBKDF2 key derivation and buffer allocations for very large inputs could consume significant memory.
- **Analysis:** `subscribePush()` validates that `endpoint` starts with `"https://"` and that `keys.p256dh` and `keys.auth` are truthy strings, but does not check their length. Standard push endpoints are around 200 characters, and p256dh/auth keys are base64-encoded 65-byte and 16-byte values respectively. A legitimate p256dh is ~88 characters and auth is ~24 characters. No upper bound is enforced.
- **Mitigation status:** UNMITIGATED. Input length validation should be added for `endpoint` (max ~2048 chars), `keys.p256dh` (max ~128 chars), and `keys.auth` (max ~64 chars).

### D-05: No input length validation on SMTP config fields
- **Severity:** MEDIUM
- **Attack scenario:** An attacker calls `saveSmtpConfig()` with an extremely long `password`, `username`, or `host` value. The password is passed to `encrypt()` which processes it through PBKDF2 + AES-GCM. While PBKDF2 handles arbitrary-length input, very large inputs increase memory usage.
- **Analysis:** `validateInput()` checks that fields are non-empty and validates email format and port range, but does not enforce maximum lengths. Standard SMTP passwords are under 256 characters. Hosts are validated by `validateSmtpHost()` which operates on the string but does not check length. A 10MB hostname string would pass the regex checks (none of the private IP patterns would match a very long string).
- **Mitigation status:** UNMITIGATED. Input length validation should be added for `host` (max ~253 chars per DNS spec), `username` (max ~256 chars), `password` (max ~1024 chars), and `fromAddress` (max ~254 chars per RFC 5321).

### D-06: Max 10 push subscriptions per user
- **Severity:** MITIGATED
- **Attack scenario:** An attacker registers thousands of push subscriptions to cause the dispatch loop to consume excessive time and resources.
- **Analysis:** `subscribePush()` enforces `MAX_SUBSCRIPTIONS_PER_USER = 10` (line 38). The count check at line 87-98 correctly handles the upsert case (allows re-subscription to existing endpoint even at the limit). Each subscription dispatch has a 10-second timeout. Worst case: 10 subscriptions x 10s timeout = 100 seconds total, bounded by `Promise.allSettled()`.
- **Mitigation status:** MITIGATED.

### D-07: SMTP connection timeout
- **Severity:** MITIGATED
- **Attack scenario:** A malicious SMTP server accepts the connection but never responds, tying up the server thread.
- **Analysis:** nodemailer is configured with `connectionTimeout`, `greetingTimeout`, and `socketTimeout` all set to 30 seconds. The `transporter.close()` is called in a `finally` block, ensuring the connection is released even on error.
- **Mitigation status:** MITIGATED.

---

## 6. Elevation of Privilege

### E-01: Server Action exports do not accept raw userId
- **Severity:** MITIGATED
- **Attack scenario:** An attacker crafts a Server Action call with a victim's userId to operate on their resources.
- **Analysis:** No server action in `smtp.actions.ts` or `push.actions.ts` accepts `userId` as a parameter. All actions derive the userId from `getCurrentUser()` which reads the authenticated session. This follows ADR-019: functions accepting raw userId must NOT be in `"use server"` files.
- **Mitigation status:** MITIGATED.

### E-02: vapid.ts functions accept raw userId but are not Server Actions
- **Severity:** MITIGATED
- **Attack scenario:** An attacker calls `getOrCreateVapidKeys(victimId)` from the browser.
- **Analysis:** `vapid.ts` has `import "server-only"` (not `"use server"`), so its exports cannot be invoked from the browser. They are library functions, not Server Actions. The only call path is through `push.actions.ts` which performs session validation first. This correctly follows ADR-019 Pattern A.
- **Mitigation status:** MITIGATED.

### E-03: encryption.ts functions are server-only
- **Severity:** MITIGATED
- **Attack scenario:** An attacker imports `decrypt()` in a client component to access the encryption key.
- **Analysis:** `encryption.ts` has `import "server-only"` at line 1. Any attempt to import it in a client component will fail at build time. The `ENCRYPTION_KEY` environment variable is only accessible on the server.
- **Mitigation status:** MITIGATED.

### E-04: PushChannel.dispatch() userId parameter is not re-validated
- **Severity:** LOW
- **Attack scenario:** If a bug in the notification dispatcher passes the wrong userId to `channel.dispatch()`, the PushChannel would load another user's VAPID keys and subscriptions.
- **Analysis:** `PushChannel.dispatch()` trusts the `userId` parameter without re-validating it against a session. This is by design: channels are internal components, not exposed to the browser. The `ChannelRouter.route()` passes `draft.userId` from the `NotificationDraft`, which is constructed by trusted internal code (notification dispatcher listening to domain events). There is no direct attack vector, but a programming error could cause cross-user notification delivery.
- **Mitigation status:** MITIGATED (accepted design). Channels are internal components behind the ChannelRouter trust boundary.

### E-05: SmtpConfig update does not require password re-entry for non-password fields
- **Severity:** LOW
- **Attack scenario:** An attacker who hijacks an active session can change the SMTP host to point to a malicious server without knowing the SMTP password. The existing encrypted password is preserved. When the next email is dispatched, it connects to the attacker's server with the victim's credentials.
- **Analysis:** `saveSmtpConfig()` allows updating `host`, `port`, `username`, `fromAddress`, `tlsRequired`, and `active` without requiring the current password to be re-entered (password is optional on update, line 196). An attacker with session access could redirect email delivery to a malicious SMTP server, which would receive the decrypted password during the SMTP AUTH exchange. The SMTP host SSRF validation blocks private IPs but allows any public hostname.
- **Mitigation status:** PARTIALLY MITIGATED. SSRF validation blocks internal targets, but the core issue is that the SMTP host can be changed without credential re-verification. This is a session-hijack amplification risk: a compromised session normally has limited damage, but this allows exfiltrating the SMTP password by redirecting the connection.

---

## Summary Table

| ID | Category | Severity | Status | Description |
|----|----------|----------|--------|-------------|
| S-01 | Spoofing | -- | MITIGATED | SMTP actions session-gated |
| S-02 | Spoofing | -- | MITIGATED | Push actions session-gated |
| S-03 | Spoofing | -- | MITIGATED | vapid.ts `import "server-only"` |
| S-04 | Spoofing | LOW | MITIGATED | Channel dispatch userId trust boundary |
| T-01 | Tampering | -- | MITIGATED | SMTP IDOR protection |
| T-02 | Tampering | -- | MITIGATED | Push subscription IDOR protection |
| T-03 | Tampering | -- | MITIGATED | VAPID key IDOR protection |
| T-04 | Tampering | -- | MITIGATED | AES-GCM auth tag prevents tampering |
| T-05 | Tampering | -- | MITIGATED | SMTP host SSRF re-validation on dispatch |
| T-05a | Tampering | MEDIUM | UNMITIGATED | DNS rebinding gap in SMTP host validation |
| R-01 | Repudiation | MEDIUM | UNMITIGATED | No audit log for SMTP credential changes |
| R-02 | Repudiation | LOW | UNMITIGATED | No audit log for push subscription changes |
| R-03 | Repudiation | LOW | UNMITIGATED | No audit log for VAPID key rotation |
| R-04 | Repudiation | INFO | PARTIAL | Test SMTP failure logged with raw error |
| I-01 | Info Disclosure | -- | MITIGATED | SMTP password masked in DTO |
| I-02 | Info Disclosure | LOW | PARTIAL | Decrypted SMTP password in memory during dispatch |
| I-03 | Info Disclosure | LOW | PARTIAL | Decrypted VAPID private key in memory during dispatch |
| I-04 | Info Disclosure | -- | MITIGATED | Subscription keys decrypted per-closure |
| I-05 | Info Disclosure | MEDIUM | PARTIAL | console.error may log sensitive crypto errors |
| I-06 | Info Disclosure | MEDIUM | PARTIAL | getOrCreateVapidKeys decrypts private key unnecessarily |
| I-07 | Info Disclosure | INFO | N/A | VAPID public key is inherently public |
| I-08 | Info Disclosure | LOW | PARTIAL | Push endpoints stored in plaintext |
| D-01 | Denial of Service | -- | MITIGATED | Email dispatch rate limiting |
| D-02 | Denial of Service | -- | MITIGATED | Push dispatch rate limiting |
| D-03 | Denial of Service | LOW | PARTIAL | Rate limiters reset on process restart |
| D-04 | Denial of Service | MEDIUM | UNMITIGATED | No input length validation on push subscription fields |
| D-05 | Denial of Service | MEDIUM | UNMITIGATED | No input length validation on SMTP config fields |
| D-06 | Denial of Service | -- | MITIGATED | Max 10 push subscriptions per user |
| D-07 | Denial of Service | -- | MITIGATED | SMTP connection timeout |
| E-01 | Elev. of Privilege | -- | MITIGATED | Server actions do not accept raw userId |
| E-02 | Elev. of Privilege | -- | MITIGATED | vapid.ts not a Server Action file |
| E-03 | Elev. of Privilege | -- | MITIGATED | encryption.ts server-only |
| E-04 | Elev. of Privilege | LOW | MITIGATED | Channel dispatch userId not re-validated (by design) |
| E-05 | Elev. of Privilege | LOW | PARTIAL | SMTP host change without password re-entry |

---

## Prioritized Recommendations

### Priority 1 -- Address in next sprint

1. **D-04 / D-05: Add input length validation.** Add maximum length checks in `subscribePush()` for `endpoint` (2048), `keys.p256dh` (128), `keys.auth` (64). Add maximum length checks in `validateInput()` for `host` (253), `username` (256), `password` (1024), `fromAddress` (254). These are low-effort changes that close a real DoS vector.

2. **I-05: Sanitize crypto error logging.** Change the three `console.error` calls that log decryption failures to log only `err instanceof Error ? err.message : "Decryption error"` instead of the full error object. This prevents any edge-case leakage of crypto internals.

### Priority 2 -- Address in upcoming milestone

3. **I-06: Add `getOrCreateVapidPublicKey()` function.** Create a variant that returns only the public key without decrypting the private key. Use it in `getVapidPublicKeyAction()`. This follows the principle of least privilege for cryptographic material.

4. **R-01: Implement credential change audit log.** Add an `AuditLog` table (or extend the existing event system) to record SMTP config create/update/delete operations with timestamp, userId, and change type (but NOT the credential values). This provides forensic capability for investigating compromised accounts.

### Priority 3 -- Track as known risks

5. **T-05a: DNS rebinding.** Document as an accepted risk in the security threat model. Full mitigation would require a custom DNS resolver + socket connect hook, which is disproportionate for a self-hosted application. If the deployment environment supports it, recommend network-level egress filtering.

6. **E-05: SMTP host change without credential re-entry.** Consider requiring the current SMTP password when changing the host field. This prevents a session-hijack from being amplified into an SMTP credential theft. Alternatively, document this as an accepted risk given that session hijack already grants broad access.

7. **R-02 / R-03: Push subscription and VAPID audit logging.** Lower priority than R-01 because push subscription data is less sensitive than SMTP credentials. Can be addressed together with R-01 when an audit log infrastructure is built.

---

## Threat Model Diagram: Data Flow

```
Browser (Client)
  |
  | Server Action call (Next.js HTTP)
  |
  v
[Session Check: getCurrentUser()]
  |
  |-- SMTP Actions (smtp.actions.ts) ----------> [validateInput()] --> [validateSmtpHost()] --> [encrypt()] --> Prisma SmtpConfig
  |                                                                                                              |
  |-- Push Actions (push.actions.ts) ----------> [endpoint validation] --> [encrypt()] --> Prisma WebPushSubscription
  |                                              [getOrCreateVapidKeys()] --> [encrypt()] --> Prisma VapidConfig
  |
  v
[ChannelRouter.route()] -- internal trust boundary --
  |
  |-- EmailChannel.dispatch()
  |     |-- checkEmailRateLimit(userId)
  |     |-- Prisma SmtpConfig { where: { userId } }
  |     |-- decrypt(password) --> nodemailer --> SMTP Server
  |     |-- validateSmtpHost() [re-check on dispatch]
  |
  |-- PushChannel.dispatch()
        |-- checkPushDispatchRateLimit(userId)
        |-- Prisma VapidConfig { where: { userId } }
        |-- Prisma WebPushSubscription { where: { userId } }
        |-- decrypt(privateKey) --> webpush.sendNotification() --> Push Service (FCM/Mozilla)
        |-- decrypt(p256dh, auth) per subscription
```

**Trust boundaries:**
1. Browser to Server Action: authenticated via NextAuth session
2. Server Action to Library functions: `import "server-only"` prevents browser access
3. ChannelRouter to Channels: internal-only, userId passed by trusted code
4. Channels to External Services: SSRF validation, TLS enforcement, timeouts
