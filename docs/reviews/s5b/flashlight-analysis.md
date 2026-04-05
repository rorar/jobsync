# Flashlight Analysis -- S5b Systemic Pattern Search

**Date:** 2026-04-05
**Scope:** Project-wide search for patterns similar to S5b findings (SSRF, rate limiting, encryption, TLS, server-only gaps)

---

## 1. SSRF: URL Fields Needing Validation

### Methodology
Searched all `fetch()` calls in `src/lib/` and `src/app/api/` to verify each validates its URL against SSRF when the URL derives from user input.

### Findings

**PASS -- Properly Validated:**

| Location | URL Source | Validation |
|---|---|---|
| `webhook.channel.ts:74` | User-configured endpoint URL | `validateWebhookUrl()` on create + on dispatch, `redirect: "manual"` |
| `health-monitor.ts:175` | Manifest healthCheck endpoint | `isBlockedHealthCheckUrl()` before fetch |
| `meta-parser/index.ts:306` | Enrichment URL (from job listing) | `isValidExternalUrl()` before fetch + on each redirect hop, `redirect: "manual"` |
| `clearbit/index.ts:57` | Constructed from domain | `DOMAIN_REGEX` validation, `redirect: "manual"` |
| `ollama/index.ts:21,49` | User-configured Ollama base URL | `validateOllamaUrl()` in `resolveBaseUrl()` |
| `api/ai/ollama/generate/route.ts:25` | Via `getOllamaBaseUrl()` | `validateOllamaUrl()` inside `getOllamaBaseUrl()` |
| `api/ai/ollama/tags/route.ts:13` | Via `getOllamaBaseUrl()` | Same |
| `api/ai/ollama/ps/route.ts:13` | Via `getOllamaBaseUrl()` | Same |
| `api/settings/api-keys/verify/route.ts:76` | User-submitted Ollama URL | `validateOllamaUrl()` before fetch |
| `api/esco/details/route.ts:47` | Hardcoded ESCO API + user-supplied URI | URI validated: `uri.startsWith("http://data.europa.eu/esco/")` |

**PASS -- Hardcoded Targets (No User-Controlled URL):**

| Location | Target |
|---|---|
| `deepseek/index.ts:29,82` | Hardcoded `https://api.deepseek.com` |
| `openai/index.ts:29,82` | Hardcoded `https://api.openai.com` |
| `api/ai/deepseek/models/route.ts:23` | Hardcoded `https://api.deepseek.com/models` |
| `api/settings/api-keys/verify/route.ts:23` | Hardcoded `https://api.openai.com/v1/models` |
| `api/settings/api-keys/verify/route.ts:36` | Hardcoded `https://api.deepseek.com/models` |
| `api/settings/api-keys/verify/route.ts:49` | Hardcoded `https://jsearch.p.rapidapi.com/search` |
| `api/eures/occupations/route.ts:68` | Hardcoded EURES autocomplete URL |
| `api/eures/locations/route.ts:28,104` | Hardcoded Eurostat/EURES URLs |
| `api/esco/search/route.ts:51` | Hardcoded ESCO search URL |
| Job Discovery modules (EURES, Arbeitsagentur, JSearch) | Hardcoded API base URLs via `resilientFetch` |

**LOW -- Minor Gap:**

| Location | Issue | Risk |
|---|---|---|
| `google-favicon/index.ts:45` | No `redirect: "manual"` on fetch to `https://www.google.com/s2/favicons?domain=...` | LOW: target is always Google's own domain; `domain` is `encodeURIComponent`-escaped. Google would need to redirect to an internal host for exploitation. No domain format regex like Clearbit has (Clearbit uses `DOMAIN_REGEX`), but risk is negligible since the URL host is always `www.google.com`. |
| `meta-parser/index.ts` `isPrivateIP()` | Missing: Carrier-Grade NAT (100.64.0.0/10), Benchmarking (198.18.0.0/15), Reserved (240.0.0.0/4), IPv4-mapped IPv6. `validateWebhookUrl()` covers all of these. | LOW: meta-parser is enrichment-only (best-effort, non-blocking). An attacker would need to control a job listing URL that redirects to these obscure ranges. The primary checks (RFC 1918, loopback, IMDS, link-local) are present. |
| `resilience.ts:127` `resilientFetch()` | No built-in URL validation. | LOW: All callers pass hardcoded API base URLs constructed within module code. Never receives user-controlled URLs directly. |

### Verdict: CLEAN. All user-controlled URL paths are validated. Two LOW-risk gaps noted for hardening.

---

## 2. Rate Limits: Server Actions Without Throttling

### Methodology
Identified all `"use server"` action files. For each, checked for rate limiting (`rateLimit`, `throttle`, `cooldown`).

### Findings

**Rate-limited server actions (3 of 28):**
- `enrichment.actions.ts` -- `checkRateLimit()` on triggerEnrichment/refreshEnrichment
- `push.actions.ts` -- `checkTestPushRateLimit()` on sendTestPush
- `smtp.actions.ts` -- `checkTestEmailRateLimit()` on testSmtpConnection

**Server actions WITHOUT rate limiting (25 of 28):**

| File | Risk Assessment |
|---|---|
| `auth.actions.ts` | **MEDIUM**: `signup()` has no rate limit. `authenticate()` has only a 1s `delay()` -- not a real rate limit. Brute-force login and signup spam are possible. NextAuth may provide some protection, but server actions are directly callable. |
| `webhook.actions.ts` | LOW: Has per-user max (10 endpoints), but no request rate limit on create/update/delete. |
| `publicApiKey.actions.ts` | LOW: Has per-user max (10 keys), but no request rate limit on create. |
| `apiKey.actions.ts` | LOW: Module API key save. Protected by session auth. |
| `job.actions.ts` | LOW: CRUD operations behind session auth. |
| `automation.actions.ts` | LOW: Automation CRUD behind session auth. |
| `note.actions.ts` | LOW: Note CRUD behind session auth. |
| `task.actions.ts` | LOW: Task CRUD behind session auth. |
| `activity.actions.ts` | LOW: Activity CRUD behind session auth. |
| `company.actions.ts` | LOW: Company CRUD behind session auth. |
| `companyBlacklist.actions.ts` | LOW: Blacklist CRUD behind session auth. |
| `tag.actions.ts` | LOW: Tag CRUD behind session auth. |
| `question.actions.ts` | LOW: Question CRUD behind session auth. |
| `profile.actions.ts` | LOW: Profile CRUD behind session auth. |
| `contactInfo.actions.ts` | LOW: Contact info CRUD behind session auth. |
| `jobtitle.actions.ts` | LOW: JobTitle CRUD behind session auth. |
| `jobLocation.actions.ts` | LOW: Location CRUD behind session auth. |
| `jobSource.actions.ts` | LOW: JobSource CRUD behind session auth. |
| `stagedVacancy.actions.ts` | LOW: Staged vacancy operations behind session auth. |
| `notification.actions.ts` | LOW: Notification reads behind session auth. |
| `module.actions.ts` | LOW: Module activation behind session auth. |
| `userSettings.actions.ts` | LOW: Settings CRUD behind session auth. |
| `undo.actions.ts` | LOW: Undo operations behind session auth. |
| `mock.actions.ts` | LOW: Mock data generation behind session auth. |

### Verdict: 1 MEDIUM finding.

**MEDIUM -- `auth.actions.ts`:** `signup()` and `authenticate()` lack proper rate limiting. The `delay(1000)` in `authenticate` is a fixed delay, not a progressive rate limiter. A determined attacker can still brute-force at ~1 req/sec. Self-hosted context reduces risk (no public registration by default), but this should be addressed. Recommend: add IP-based rate limiting similar to `withApiAuth()` pre-auth pattern.

All other actions are behind `getCurrentUser()` session auth, making unauthenticated abuse impossible. For a self-hosted single-user app, per-session rate limiting on CRUD operations is LOW priority.

---

## 3. Encryption: Credentials at Rest

### Methodology
Read `prisma/schema.prisma` for all fields named password, secret, key, token, auth. Verified each is encrypted or hashed.

### Findings

| Model | Field(s) | Protection | Status |
|---|---|---|---|
| `User` | `password` | bcrypt hash (salt round 10) via `bcryptjs` | PASS |
| `ApiKey` (Module) | `encryptedKey`, `iv` | AES encryption via `src/lib/encryption.ts` | PASS |
| `WebhookEndpoint` | `secret` | AES encryption, comment confirms | PASS |
| `VapidConfig` | `privateKey` | AES encryption, comment confirms | PASS |
| `WebPushSubscription` | `p256dh`, `auth` (via shared `iv`) | AES encryption, comment confirms | PASS |
| `SmtpConfig` | `password` | AES encryption, comment confirms | PASS |
| `PublicApiKey` | `keyHash` | SHA-256 hash (not reversible, by design) | PASS |
| `DedupHash` | `hash` | Content hash for deduplication (not a credential) | N/A |

### Verdict: CLEAN. All credentials are either encrypted (AES) or hashed (bcrypt/SHA-256). No plaintext secrets in the database.

---

## 4. TLS: HTTP Clients Without TLS Enforcement

### Methodology
Searched for `rejectUnauthorized` (should be `true` everywhere) and `NODE_TLS_REJECT_UNAUTHORIZED` (should not exist).

### Findings

**`rejectUnauthorized: true` found in:**
- `email.channel.ts:149` -- nodemailer SMTP transport
- `smtp.actions.ts:303` -- SMTP test connection

**`NODE_TLS_REJECT_UNAUTHORIZED`:** Not found anywhere. PASS.

**SMTP TLS configuration:**
- `SmtpConfig` model has a `tlsRequired` field (user can configure)
- Both `email.channel.ts` and `smtp.actions.ts` enforce `rejectUnauthorized: true` regardless of user setting
- TLS minimum version is set to `TLSv1.2` in the email channel

### Verdict: CLEAN. TLS is properly enforced. No `NODE_TLS_REJECT_UNAUTHORIZED` bypass. SMTP always rejects self-signed certificates.

---

## 5. `import "server-only"` Gaps

### Methodology
Identified all `src/lib/**/*.ts` files that import `@/lib/db` or `@/lib/encryption`. For each, checked whether `import "server-only"` is present.

### Files WITH `import "server-only"` (correctly guarded):

| File | Imports |
|---|---|
| `src/lib/encryption.ts` | Self (defines encrypt/decrypt) |
| `src/lib/locale.ts` | `@/lib/db` |
| `src/lib/locale-resolver.ts` | (indirect) |
| `src/lib/blacklist-query.ts` | `@/lib/db` |
| `src/lib/api-key-resolver.ts` | `@/lib/db`, `@/lib/encryption` |
| `src/lib/connector/health-monitor.ts` | `@/lib/db` |
| `src/lib/connector/degradation.ts` | `@/lib/db` |
| `src/lib/connector/credential-resolver.ts` | `@/lib/db`, `@/lib/encryption` |
| `src/lib/connector/job-discovery/promoter.ts` | `@/lib/db` |
| `src/lib/vacancy-pipeline/retention.service.ts` | `@/lib/db` |
| `src/lib/push/vapid.ts` | `@/lib/db`, `@/lib/encryption` |
| `src/lib/email/templates.ts` | (server-only) |
| `src/lib/smtp-validation.ts` | (server-only) |
| `src/lib/email-rate-limit.ts` | (server-only) |
| `src/lib/push/rate-limit.ts` | (server-only) |
| `src/lib/connector/health-scheduler.ts` | (server-only) |

### Files MISSING `import "server-only"`:

| File | Imports | Risk |
|---|---|---|
| `src/lib/notifications/channels/webhook.channel.ts` | `@/lib/db`, `@/lib/encryption` | **MEDIUM**: Decrypts webhook secrets. Should be server-only. |
| `src/lib/notifications/channels/email.channel.ts` | `@/lib/db`, `@/lib/encryption` | **MEDIUM**: Decrypts SMTP passwords. Should be server-only. |
| `src/lib/notifications/channels/push.channel.ts` | `@/lib/db`, `@/lib/encryption` | **MEDIUM**: Decrypts VAPID keys and push subscription auth. Should be server-only. |
| `src/lib/notifications/channels/in-app.channel.ts` | `@/lib/db` | LOW: No encryption, but uses Prisma. Should be server-only. |
| `src/lib/notifications/channel-router.ts` | Imports channels (transitively: db + encryption) | **MEDIUM**: Transitive exposure. Should be server-only. |
| `src/lib/events/consumers/enrichment-trigger.ts` | `@/lib/db` | LOW: No encryption. Should be server-only for consistency. |
| `src/lib/events/consumers/audit-logger.ts` | (no db/encryption) | N/A: No sensitive imports. |
| `src/lib/events/consumers/degradation-coordinator.ts` | (no db/encryption) | N/A: No sensitive imports. |
| `src/lib/connector/job-discovery/runner.ts` | `@/lib/db` | LOW: Server-only by context (only imported by scheduler). Should have guard for defense-in-depth. |
| `src/lib/connector/job-discovery/reference-data.ts` | `@/lib/db` | LOW: Server-only by context. |
| `src/lib/connector/data-enrichment/orchestrator.ts` | `@/lib/db` | LOW: Server-only by context. |
| `src/lib/scheduler/index.ts` | `@/lib/db` | LOW: Server-only by context. |
| `src/lib/vacancy-pipeline/bulk-action.service.ts` | `@/lib/db` | LOW: Server-only by context. |
| `src/lib/api/helpers.ts` | `@/lib/db` | LOW: Only used by API route handlers. |
| `src/lib/api/auth.ts` | `@/lib/db` | LOW: Only used by API route handlers. |

**Note on practical risk:** Next.js `import "server-only"` prevents accidental import into client components. The MEDIUM-rated files (`webhook.channel.ts`, `email.channel.ts`, `push.channel.ts`, `channel-router.ts`) handle credential decryption. While they are unlikely to be imported into client components in practice (they are notification infrastructure), the `server-only` guard is defense-in-depth and should be added.

### Also noted:

`src/actions/dashboard.actions.ts` has neither `"use server"` nor `import "server-only"`. It is imported by a server component (`app/dashboard/page.tsx`) and by a client component (`TopActivitiesCard.tsx`, type-only import). Since Next.js erases type imports during bundling, this is not a runtime leak, but adding `import "server-only"` would be a good safeguard.

### Verdict: 4 MEDIUM findings (notification channels + router missing `server-only` while handling credential decryption), 11 LOW findings (db-importing files without `server-only` as defense-in-depth).

---

## Summary

| Category | Status | Findings |
|---|---|---|
| **1. SSRF** | CLEAN | 2 LOW (google-favicon no `redirect: "manual"`, meta-parser `isPrivateIP` misses some ranges) |
| **2. Rate Limits** | 1 MEDIUM | `auth.actions.ts` signup/login lack proper rate limiting |
| **3. Encryption** | CLEAN | All credentials encrypted or hashed |
| **4. TLS** | CLEAN | TLS enforced everywhere, no bypass |
| **5. server-only** | 4 MEDIUM, 11 LOW | Notification channels decrypt credentials without `server-only` guard |

### Recommended Actions (Priority Order)

1. **MEDIUM** -- Add `import "server-only"` to `webhook.channel.ts`, `email.channel.ts`, `push.channel.ts`, `channel-router.ts` (credential decryption files)
2. **MEDIUM** -- Add rate limiting to `auth.actions.ts` (`signup` and `authenticate`) -- IP-based, similar to API pre-auth pattern
3. **LOW** -- Add `import "server-only"` to remaining 11 `src/lib/` files that import `@/lib/db` for defense-in-depth
4. **LOW** -- Add domain format regex to `google-favicon` module (matching Clearbit's `DOMAIN_REGEX` pattern)
5. **LOW** -- Extend `meta-parser/isPrivateIP()` to cover Carrier-Grade NAT, Benchmarking, and Reserved ranges (align with `validateWebhookUrl()`)
