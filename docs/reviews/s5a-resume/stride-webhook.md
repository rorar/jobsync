# STRIDE Threat Analysis: Webhook Notification Channel

**Date:** 2026-04-04
**Scope:** S5a Webhook implementation (notification-dispatch.allium Phase D1)
**Analyst:** Security Audit (Claude Opus 4.6)
**Status:** Complete

## Files Analyzed

| File | Purpose |
|---|---|
| `src/lib/notifications/channels/webhook.channel.ts` | Webhook delivery engine (HMAC, retry, auto-deactivation) |
| `src/actions/webhook.actions.ts` | Webhook endpoint CRUD server actions |
| `src/lib/url-validation.ts` | `validateWebhookUrl()` SSRF validator |
| `src/components/settings/WebhookSettings.tsx` | Webhook settings UI |
| `src/lib/notifications/channel-router.ts` | Multi-channel notification router |
| `src/lib/encryption.ts` | AES-256-GCM encryption for webhook secrets |
| `src/lib/events/consumers/notification-dispatcher.ts` | Event-to-notification mapping |
| `prisma/schema.prisma` | WebhookEndpoint model definition |

---

## S -- Spoofing

### S-1: Cross-User Endpoint Creation -- MITIGATED

**Threat:** An attacker creates webhook endpoints bound to another user's account, receiving that user's notifications.

**Assessment:** All five CRUD actions in `webhook.actions.ts` call `getCurrentUser()` at the top and use `user.id` exclusively. The `userId` is never accepted from client input. The `createWebhookEndpoint()` function hardcodes `userId: user.id` in the Prisma `create` call (line 130). This follows ADR-015 correctly.

**Verdict:** No finding. Properly implemented.

### S-2: HMAC Signature Forgery -- MITIGATED

**Threat:** An attacker intercepts a webhook delivery and forges a valid HMAC-SHA256 signature to inject fabricated events into the receiver.

**Assessment:** The HMAC secret is 256-bit random (`randomBytes(32)`) with a `whsec_` prefix (line 39 of actions). The signature uses `createHmac("sha256", secret).update(payload).digest("hex")` which is cryptographically sound. The secret is encrypted at rest with AES-256-GCM and only shown once at creation time.

To forge a signature, the attacker would need the plaintext secret, which requires either:
- Compromising the ENCRYPTION_KEY environment variable
- Compromising the database AND the ENCRYPTION_KEY
- Intercepting the single secret display at creation time

**Verdict:** No finding. Standard HMAC-SHA256 with strong key material.

### S-3: Unauthenticated CRUD Access -- MITIGATED

**Threat:** An unauthenticated attacker calls webhook server actions directly.

**Assessment:** All exported functions in `webhook.actions.ts` are in a `"use server"` file and each one gates on `getCurrentUser()`, returning `{ success: false, message: "errors.unauthorized" }` if the session is absent. The helper functions (`generateSecret`, `maskSecret`, `validateEvents`, `toDTO`) are not exported and therefore not callable as server actions.

**Verdict:** No finding. Authentication gate is consistent across all five actions.

### S-4: Webhook Receiver Cannot Verify Event Origin -- LOW RISK (Informational)

**Threat:** A webhook receiver has no way to verify that an event truly originated from this JobSync instance (versus a replay or third-party spoof), beyond HMAC verification.

**Assessment:** The current headers include `X-Webhook-Signature` (HMAC) and `X-Webhook-Event` (event type), but do not include a delivery ID or a timestamp in the signed headers. The payload itself contains a `timestamp` field, but since it is inside the signed body, this is acceptable. However, there is no unique delivery ID that receivers could use for idempotency deduplication.

**Recommendation:** Consider adding an `X-Webhook-Delivery-Id` header (UUID) to allow receivers to deduplicate retried deliveries. This is a best-practice improvement, not a vulnerability.

**Severity:** Informational

---

## T -- Tampering

### T-1: Payload Tampering in Transit -- ACCEPTABLE RISK

**Threat:** An attacker performing a man-in-the-middle attack modifies the webhook payload between JobSync and the receiver.

**Assessment:** The HMAC signature covers the full JSON payload body. Any modification of the payload would invalidate the signature, detectable by the receiver. However, the HMAC does NOT cover the HTTP headers (`X-Webhook-Event`, `User-Agent`). An attacker could theoretically modify the `X-Webhook-Event` header while leaving the payload intact.

The system allows both HTTP and HTTPS webhook URLs. Over HTTP, the entire request (headers, body, signature) is transmitted in plaintext, making MITM trivial.

**Recommendation:** The `X-Webhook-Event` header value is also present in the payload body as `event`, so receivers should use the body field for routing decisions, not the header. Consider logging a warning or requiring HTTPS-only for webhook endpoints to protect against MITM.

**Severity:** Low (HMAC protects payload integrity; HTTPS enforcement is the receiver's responsibility)

### T-2: Secret Modification via Update Endpoint -- MITIGATED

**Threat:** An attacker modifies the webhook secret to a known value, then forges future signatures.

**Assessment:** The `updateWebhookEndpoint()` action (line 221) accepts `{ url?, events?, active? }` but NOT `secret`. There is no server action to rotate or change the secret. The only way to get a new secret is to delete and recreate the endpoint. The encrypted secret and IV columns are never included in the update data.

**Verdict:** No finding. Secret is immutable after creation.

### T-3: AES Encryption Implementation -- MITIGATED

**Threat:** Weaknesses in the encryption implementation allow secret recovery.

**Assessment:** The encryption module (`src/lib/encryption.ts`) uses:
- AES-256-GCM (authenticated encryption)
- Random 12-byte IV per encryption
- Random 16-byte salt per encryption (PBKDF2 key derivation)
- 100,000 PBKDF2 iterations with SHA-256
- GCM authentication tag prevents ciphertext tampering

The salt is embedded in the ciphertext format (`salt:<hex>:<base64-payload>`), allowing per-record unique keys derived from the master ENCRYPTION_KEY. Legacy records use a hardcoded salt but new records use random salts (ADR-017).

**Verdict:** No finding. Encryption is properly implemented with authenticated encryption and per-record salts.

### T-4: Failure Count Manipulation -- MITIGATED

**Threat:** An attacker manipulates the failure count to prevent auto-deactivation or trigger premature deactivation.

**Assessment:** The `failureCount` is managed server-side only. The `updateWebhookEndpoint()` action resets `failureCount` to 0 only when `active` is set to `true` (re-activation, line 259). The delivery engine uses atomic `{ increment: 1 }` (line 306 of webhook.channel.ts) to prevent read-then-write races. The `failureCount` field is not accepted in the update data from the client.

**Verdict:** No finding. Failure count is server-controlled with atomic updates.

---

## R -- Repudiation

### R-1: No Persistent Delivery Audit Trail -- MEDIUM RISK

**Threat:** A user disputes that a webhook delivery occurred or claims missed notifications. There is no evidence to prove or disprove delivery.

**Assessment:** The current implementation has NO persistent delivery log. The only trace of webhook activity is:
- `failureCount` on the endpoint (cumulative, no per-event detail)
- In-app notifications on failure/deactivation
- `console.error` / `console.warn` statements (ephemeral, not structured)

There is no `WebhookDeliveryLog` table or equivalent. Once a delivery succeeds, no record exists. If a delivery fails and retries succeed, the intermediate failures are lost. The `updatedAt` timestamp on the endpoint changes on any update, not specifically on delivery.

**Recommendation:** Add a `WebhookDeliveryLog` table recording: `endpointId`, `eventType`, `attemptCount`, `statusCode`, `success`, `error`, `createdAt`. This enables:
- Delivery proof for dispute resolution
- Debugging intermittent failures
- Metrics on delivery latency and success rates
- Compliance evidence for data processing notifications

**Severity:** Medium -- operational blind spot for troubleshooting and compliance

### R-2: Auto-Deactivation Audit -- PARTIAL

**Threat:** An endpoint is auto-deactivated and the user has no way to understand why or when it happened.

**Assessment:** When an endpoint is auto-deactivated (line 314-319 of webhook.channel.ts), an in-app notification is created (`notifyEndpointDeactivated`). This provides some audit trail, but:
- The notification only says the URL was deactivated, not the specific failure details
- The notification is ephemeral (can be dismissed/deleted by the user)
- There is no separate admin log of deactivation events

The `updatedAt` field changes on deactivation, and `active` flips to `false`, but there is no `deactivatedAt` or `deactivationReason` field.

**Recommendation:** Include the last error message in the deactivation notification. Consider adding `lastFailureAt` and `lastFailureReason` fields to the WebhookEndpoint model.

**Severity:** Low -- notifications exist but lack detail

---

## I -- Information Disclosure

### I-1: Secret Masking in API Responses -- MITIGATED

**Threat:** Webhook HMAC secrets are leaked in API responses, logs, or error messages.

**Assessment:** The `toDTO()` function (line 60-85 of webhook.actions.ts) always returns `secretMask: "whsec_****"`. The Prisma `select` clauses in `listWebhookEndpoints` and `getWebhookEndpoint` explicitly exclude `secret` and `iv` columns. The `listWebhookEndpoints` select (line 162-172) does not include `secret` or `iv`.

However, there is a discrepancy: the `toDTO` function accepts any object matching the shape and always returns a static mask `"whsec_****"`. The `maskSecret()` helper function (line 42-46) that would show the last 4 characters is defined but NEVER CALLED. The DTO always shows the same static mask regardless of the actual secret. This is arguably MORE secure (no partial information leakage) but means the `maskSecret` function is dead code.

**Verdict:** No vulnerability. Secrets are never in responses. The `maskSecret` helper is dead code that could be removed.

### I-2: Endpoint URL Logged in Console Warnings -- LOW RISK

**Threat:** Webhook endpoint URLs (which may contain path-based tokens or API keys) are logged to the server console.

**Assessment:** Three locations log the endpoint URL:
- Line 273: `console.warn(...SSRF blocked for endpoint ${endpoint.id}: ${urlCheck.error}...)` -- logs endpoint ID, not URL
- Line 275: `return { success: false, error: \`SSRF blocked: ${endpoint.url}\` }` -- includes URL in return value
- Line 322: `return { success: false, error: \`Delivery failed to ${endpoint.url}\` }` -- includes URL in error

The return values from the per-endpoint map function flow into `errors[]` which is joined and returned as `ChannelResult.error`. This error string propagates to the `ChannelRouter` but is only logged at the WebhookChannel level (line 355: `console.error`). It is NOT sent to the user via the UI.

**Recommendation:** Sanitize URLs in error messages to omit path/query components. Log only the hostname or endpoint ID for troubleshooting.

**Severity:** Low -- server-side logs only, but URLs with embedded tokens could leak

### I-3: Webhook Payload Data Exposure -- ACCEPTABLE RISK

**Threat:** Webhook payloads expose sensitive internal data to external HTTP endpoints.

**Assessment:** The webhook payload structure is `{ event, timestamp, data }` where `data` comes from `notification.data` in the dispatcher. Reviewing the dispatcher, the data fields sent are:

| Event Type | Data Fields |
|---|---|
| `vacancy_promoted` | `stagedVacancyId`, `jobId` |
| `vacancy_batch_staged` | `count`, `automationId` |
| `bulk_action_completed` | `actionType`, `succeeded`, `failed`, `itemCount` |
| `module_deactivated` | `moduleId`, `affectedAutomationCount` |
| `module_reactivated` | `moduleId`, `pausedAutomationCount` |
| `retention_completed` | `purgedCount`, `hashesCreated` |

These are operational IDs and counts -- no PII, no credentials, no email addresses, no job titles, no company names. The `userId` from the `NotificationDraft` is NOT included in the webhook payload (only `event`, `timestamp`, `data` are in the `WebhookPayload` type).

**Verdict:** No finding. Payload data is minimal and non-sensitive. The `userId` is correctly excluded from the external payload.

### I-4: SSRF Bypass -- Internal Network Topology Probing -- MITIGATED WITH CAVEATS

**Threat:** An attacker uses webhook creation to probe the internal network by observing response timing or error messages.

**Assessment:** The `validateWebhookUrl()` function blocks:
- Localhost (127.x, ::1, 0.0.0.0, localhost)
- Link-local (169.254.x -- IMDS)
- RFC 1918 (10.x, 172.16-31.x, 192.168.x)
- IPv6 private (fc00::/7, fe80::/10)
- IPv4-mapped IPv6 (::ffff:*)
- GCP metadata server
- Embedded credentials
- Non-http(s) protocols

**Remaining gaps:**

1. **DNS rebinding:** The URL is validated against the hostname string, but DNS resolution happens at `fetch()` time. An attacker could register a domain that initially resolves to a public IP (passing validation) and then rebinds to 169.254.169.254 or 10.x.x.x at delivery time. The re-validation on dispatch (line 269-275) checks the URL string again but NOT the resolved IP. This is a known limitation of string-based SSRF validation.

2. **Decimal/Octal IP encoding:** The regex-based checks match standard dotted-decimal notation. Browsers and some HTTP clients also accept octal (`0177.0.0.1`), decimal (`2130706433`), and hex (`0x7f000001`) IP representations. The `new URL()` parser normalizes some of these, but not all Node.js fetch implementations do. For example, `http://0x7f000001/` may bypass the regex check.

3. **IPv6 scoped addresses:** The check for `[::]` uses the literal string match but `[::0]`, `[0:0:0:0:0:0:0:0]`, and other zero-address representations could bypass the localhost check.

**Recommendation:** Consider using a DNS resolution step that validates the resolved IP address against the blocklist AFTER resolution but BEFORE the HTTP connection. This is the only reliable defense against DNS rebinding. Alternatively, use `dns.lookup()` and validate the IP, or use a proxy/firewall rule to block outbound connections to RFC 1918 ranges.

**Severity:** Medium -- DNS rebinding is a real attack vector for self-hosted applications on internal networks

---

## D -- Denial of Service

### D-1: Endpoint Creation Rate Limiting -- PARTIAL MITIGATION

**Threat:** An attacker creates and deletes webhook endpoints rapidly to exhaust database resources or generate excessive I/O.

**Assessment:** The per-user limit of 10 endpoints (`MAX_ENDPOINTS_PER_USER`, line 17) prevents unbounded creation. However, there is NO rate limit on the CRUD operations themselves. An authenticated user could:
- Create 10 endpoints, delete all 10, create 10 more, in a tight loop
- Call `listWebhookEndpoints()` thousands of times per second
- Call `updateWebhookEndpoint()` in a tight loop to generate database writes

The webhook server actions are `"use server"` functions but do NOT use any rate limiting middleware (unlike the Public API v1 which has `withApiAuth()` rate limiting).

**Recommendation:** Apply rate limiting to webhook CRUD actions, either via middleware or an in-action rate limiter. Even a modest limit (e.g., 30 operations/minute) would prevent abuse.

**Severity:** Low -- the 10-endpoint cap limits the blast radius, and this requires an authenticated session

### D-2: Slow Webhook Endpoints Blocking Notifications -- MITIGATED

**Threat:** A webhook endpoint that responds slowly (or not at all) blocks other notification channels or other webhooks.

**Assessment:** The implementation correctly handles this:
- Each endpoint has a 10-second timeout via `AbortController` (line 71)
- Endpoints are delivered to concurrently via `Promise.allSettled()` (line 267)
- Retry delays are 1s/5s/30s with 3 maximum attempts (line 36-37)
- The InApp channel dispatches independently before or after webhooks (ChannelRouter iterates sequentially per channel, but within WebhookChannel, endpoints are parallel)

However, the WORST CASE for a single notification dispatch is: 3 attempts * (10s timeout + 30s backoff) = ~123 seconds per endpoint. With 10 endpoints all timing out, the total wall time for the webhook channel is ~123 seconds (parallel), but the ChannelRouter processes channels SEQUENTIALLY (line 56: `for...of`).

If InApp is registered first (it is -- line 42 of dispatcher), InApp completes quickly, then WebhookChannel blocks for up to ~123 seconds. This blocks the entire `dispatchNotification()` call, which blocks the event handler. If events arrive faster than delivery completes, the event bus could back up.

**Recommendation:** The sequential channel iteration in `ChannelRouter.route()` means a slow webhook blocks any channels registered AFTER it. Consider: (a) dispatching channels in parallel via `Promise.allSettled()`, or (b) dispatching webhook delivery in a non-blocking fire-and-forget manner with its own error handling.

**Severity:** Medium -- under normal conditions timeouts prevent indefinite blocking, but cascading timeouts across 10 endpoints with 3 retries each could delay event processing significantly

### D-3: Retry Amplification -- LOW RISK

**Threat:** An attacker configures webhook endpoints to a server they control that always returns 500, causing JobSync to perform 3x the HTTP requests.

**Assessment:** With 10 endpoints all returning errors: 10 endpoints * 3 attempts = 30 outbound HTTP requests per notification event. The retry backoffs (1s, 5s, 30s) provide some natural rate limiting. Each failed attempt also triggers an in-app notification (`notifyDeliveryFailed`), which adds 10 Prisma writes per event.

After 5 consecutive failures per endpoint, auto-deactivation kicks in, which limits the long-term amplification.

**Recommendation:** Consider suppressing the per-attempt failure notification and only notifying on final failure (after all retries exhausted) or on auto-deactivation. Currently, every failed delivery attempt creates a notification, which could flood the in-app notification list.

**Severity:** Low -- auto-deactivation bounds the amplification, but notification flooding is a UX concern

### D-4: Large Payload Construction -- NOT APPLICABLE

**Threat:** An attacker crafts events with extremely large `data` payloads to cause memory/network exhaustion.

**Assessment:** The `data` field in notification drafts is constructed server-side by the notification dispatcher (not from user input). The payloads are small fixed-structure objects (counts, IDs). There is no user-controlled path to inject arbitrary data into webhook payloads.

**Verdict:** No finding. Payloads are server-constructed with bounded fields.

---

## E -- Elevation of Privilege

### E-1: IDOR on Webhook CRUD -- MITIGATED

**Threat:** A regular user accesses or modifies another user's webhook endpoints by guessing endpoint IDs.

**Assessment:** All five CRUD actions enforce ownership via ADR-015 patterns:
- `createWebhookEndpoint`: uses `userId: user.id` in create (line 130)
- `listWebhookEndpoints`: `where: { userId: user.id }` (line 161)
- `getWebhookEndpoint`: `findFirst({ where: { id, userId: user.id } })` (line 194)
- `updateWebhookEndpoint`: ownership pre-check + `updateMany({ where: { id, userId: user.id } })` (line 264)
- `deleteWebhookEndpoint`: ownership pre-check + `deleteMany({ where: { id, userId: user.id } })` (line 312)

**Verdict:** No finding. IDOR protection is comprehensive and consistent.

### E-2: SSRF to Internal Services (IMDS, Internal APIs) -- PARTIALLY MITIGATED

**Threat:** An attacker uses the webhook delivery mechanism to reach internal services, cloud metadata endpoints, or other infrastructure.

**Assessment:** This is covered in detail under I-4. The string-based URL validation blocks known patterns but is vulnerable to DNS rebinding. The `redirect: "manual"` setting (line 84 of webhook.channel.ts) prevents open redirect exploitation. The response body is never read, which limits the usefulness of SSRF for data exfiltration (blind SSRF only).

However, blind SSRF can still be used for:
- Port scanning (timing differences between open/closed/filtered ports)
- Triggering side effects on internal services (e.g., `/admin/restart`)
- Cloud IMDS credential theft if DNS rebinding succeeds (even without reading the response, some IMDS endpoints have side effects)

**Recommendation:** Same as I-4 -- implement DNS resolution validation.

**Severity:** Medium (same as I-4)

### E-3: Webhook Channel as Side-Channel for Privilege Probing -- NOT APPLICABLE

**Threat:** A user uses webhook delivery errors to determine whether other internal resources exist.

**Assessment:** The webhook delivery errors are generic (`HTTP 404`, `HTTP 500`, `timeout`) and do not reveal internal implementation details. The `handleError()` utility replaces Prisma errors with generic messages. The error strings returned by `attemptDelivery()` only include the HTTP status code or the error message, not response bodies.

**Verdict:** No finding. Error messages are sufficiently generic.

---

## Summary of Findings

| ID | Category | Finding | Severity | Status |
|---|---|---|---|---|
| S-4 | Spoofing | No delivery ID for receiver-side idempotency | Informational | Recommendation |
| T-1 | Tampering | HTTP webhook URLs allow MITM; `X-Webhook-Event` header not signed | Low | Acceptable Risk |
| R-1 | Repudiation | No persistent webhook delivery audit trail | Medium | **Action Recommended** |
| R-2 | Repudiation | Auto-deactivation notification lacks failure detail | Low | Recommendation |
| I-2 | Information Disclosure | Endpoint URLs in error return values (server-side only) | Low | Recommendation |
| I-4 | Information Disclosure | DNS rebinding can bypass string-based SSRF validation | Medium | **Action Recommended** |
| D-1 | Denial of Service | No rate limiting on webhook CRUD server actions | Low | Recommendation |
| D-2 | Denial of Service | Sequential channel routing can block on slow webhook retries | Medium | **Action Recommended** |
| D-3 | Denial of Service | Per-attempt failure notifications may flood in-app list | Low | Recommendation |

### Strengths Identified

The webhook implementation demonstrates strong security practices in several areas:

1. **IDOR protection** -- Consistent `userId` filtering across all CRUD operations and delivery (ADR-015)
2. **HMAC implementation** -- Standard HMAC-SHA256 with 256-bit random secrets
3. **Encryption at rest** -- AES-256-GCM with per-record random salts and PBKDF2 key derivation
4. **Secret lifecycle** -- Show-once pattern; secrets never returned in list/get responses
5. **SSRF defense in depth** -- Validation on create AND dispatch, `redirect: "manual"`, comprehensive private IP blocklist
6. **Atomic failure counting** -- Prisma `{ increment: 1 }` prevents race conditions
7. **Response body ignored** -- Delivery does not read response bodies, limiting SSRF data exfiltration
8. **Concurrent delivery** -- `Promise.allSettled()` isolates per-endpoint failures
9. **Auto-deactivation** -- 5-failure threshold with user notification prevents runaway retries

### Priority Recommendations

**P1 -- DNS Rebinding Protection (I-4 / E-2):**
Implement post-resolution IP validation using `dns.lookup()` to validate the resolved IP against the SSRF blocklist before allowing the HTTP connection. This is the most impactful security improvement for self-hosted deployments on internal networks.

**P2 -- Delivery Audit Log (R-1):**
Add a `WebhookDeliveryLog` model to record delivery attempts with outcome, latency, and error details. This enables debugging, compliance evidence, and dispute resolution.

**P3 -- Non-Blocking Webhook Dispatch (D-2):**
Change `ChannelRouter.route()` to dispatch channels concurrently via `Promise.allSettled()`, or make webhook delivery fire-and-forget to prevent slow endpoints from blocking event processing.

---

## Appendix: Attack Surface Map

```
User (Browser)
  |
  | Server Actions (authenticated via NextAuth session)
  |
  v
webhook.actions.ts -----> validateWebhookUrl() -----> SSRF blocklist (string-based)
  |                                                    - No DNS resolution check
  | Prisma CRUD (userId-scoped)
  |
  v
WebhookEndpoint (SQLite)
  |  secret: AES-256-GCM encrypted
  |  iv: per-record
  |  events: JSON string
  |  failureCount: atomic increment
  |
  v
notification-dispatcher.ts -----> ChannelRouter.route() [sequential channels]
  |
  v
WebhookChannel.dispatch()
  |  1. Query active endpoints (userId-scoped)
  |  2. Filter by event subscription
  |  3. Re-validate URL (SSRF) <-- string-only, no DNS check
  |  4. Decrypt secret
  |  5. HMAC-SHA256 sign payload
  |  6. deliverWithRetry() [3 attempts, backoff]
  |     - 10s timeout per attempt
  |     - redirect: "manual"
  |     - Response body NOT read
  |  7. Atomic failureCount update
  |  8. Auto-deactivate at threshold 5
  |
  v
External Webhook Endpoint (attacker-controlled or legitimate)
```
