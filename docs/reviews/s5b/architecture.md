# Phase 1b: Architectural Design Review -- S5b Email + Push Channel

**Reviewer:** Architecture Review (Phase 1b)
**Date:** 2026-04-05
**Scope:** Email Channel, Push Channel, Notification Infrastructure, Prisma Models
**Spec Reference:** `specs/notification-dispatch.allium`

---

## Executive Summary

The S5b notification channel implementation is architecturally sound. The ChannelRouter pattern (Strategy + Observer) is well-executed, channels are properly decoupled, and the code follows established patterns from the S5a Webhook channel implementation with good consistency. Security posture is strong: SSRF validation, AES encryption at rest, IDOR protection, and rate limiting are all present.

There are **0 Critical** and **1 High** severity findings. The high finding concerns a spec-to-implementation divergence on email recipient targeting. The remaining findings are Medium and Low and represent opportunities for structural improvement, code deduplication, and future-readiness.

**Findings Summary:**

| Severity | Count |
|----------|-------|
| Critical | 0     |
| High     | 1     |
| Medium   | 5     |
| Low      | 4     |

---

## 1. Component Boundaries & Module Cohesion

### F-01: Email recipient diverges from Allium spec [HIGH]

**Files:**
- `src/lib/notifications/channels/email.channel.ts` (lines 65-75, 126-129)
- `specs/notification-dispatch.allium` (line 508)

**Description:**
The Allium spec's EmailDelivery rule defines `to: config.fromAddress` -- the notification email is sent to the user's own configured SMTP fromAddress. The implementation instead resolves the recipient from `prisma.user.email` (the NextAuth account email). These may differ: the SMTP fromAddress is the address configured for sending, while `user.email` is the authentication identity.

Meanwhile, the test email in `smtp.actions.ts` line 314 correctly sends `to: config.fromAddress` -- matching the spec. This inconsistency means the dispatch channel and the test path target different recipients.

**Architectural Impact:** The user may configure SMTP with `noreply@corp.example.com` as fromAddress but their NextAuth email is `personal@gmail.com`. Notifications would go to gmail.com rather than the corp address. For a self-hosted app where users supply their own SMTP, the spec's design of sending to fromAddress is more predictable.

**Recommendation:** Align the dispatch path with the spec. Either:
- (a) Send to `config.fromAddress` as the spec dictates (simplest, self-consistent)
- (b) Add an explicit `recipientAddress` field to SmtpConfig if the team wants separation
- (c) Document the deliberate divergence and update the spec

### F-02: resolveUserLocale duplicated across 4 files [MEDIUM]

**Files:**
- `src/lib/events/consumers/notification-dispatcher.ts` (lines 86-97, as `resolveLocale`)
- `src/lib/notifications/channels/email.channel.ts` (lines 49-60)
- `src/lib/notifications/channels/webhook.channel.ts` (lines 153-162)
- `src/actions/smtp.actions.ts` (lines 64-75)

**Description:**
The same locale-resolution logic (Prisma lookup of UserSettings, JSON parse, validate locale, fallback to DEFAULT_LOCALE) is duplicated in four separate files with minor naming variations (`resolveLocale` vs `resolveUserLocale`). This violates DRY and the Single Responsibility Principle -- if the settings JSON shape changes, all four must be updated in lockstep.

**Architectural Impact:** Medium. No functional bug today, but each copy has subtle differences: the webhook channel hardcodes `"en"` instead of using `DEFAULT_LOCALE`, while the others use the imported constant. This is a maintenance hazard.

**Recommendation:** Extract to a shared utility:
```
src/lib/user-locale.ts  (with import "server-only")
export async function resolveUserLocale(userId: string): Promise<string>
```
All four files import from this single source. The notification dispatcher's `resolvePreferences` could live alongside it as `resolveNotificationPreferences`.

### F-03: Rate limiter implementation duplicated between email and push [MEDIUM]

**Files:**
- `src/lib/email-rate-limit.ts`
- `src/lib/push/rate-limit.ts`

**Description:**
These two files are structurally identical: both implement sliding-window rate limiting with globalThis singletons, periodic cleanup with `.unref()`, and the same `slidingWindowCheck` function. The only differences are the constant values (window size, max per window) and the globalThis key names.

**Architectural Impact:** Medium. Adding a fifth channel (e.g., SMS, Slack) would require yet another copy. The pattern is well-proven but should be consolidated.

**Recommendation:** Extract a generic `SlidingWindowRateLimiter` class into `src/lib/rate-limit/sliding-window.ts`:
```typescript
export class SlidingWindowRateLimiter {
  constructor(private config: {
    globalThisKey: string;
    windowMs: number;
    maxPerWindow: number;
    cleanupIntervalMs?: number;
  }) {}
  check(key: string): { allowed: boolean; retryAfterMs?: number }
  reset(): void
}
```
Both email and push rate limiters become thin wrappers instantiating this class with their respective constants.

---

## 2. Channel Pattern Analysis

### F-04: ChannelRouter dispatches sequentially, not in parallel [MEDIUM]

**File:** `src/lib/notifications/channel-router.ts` (lines 56-79)

**Description:**
The ChannelRouter iterates channels with a `for...of` loop, awaiting each channel's `isAvailable` and `dispatch` calls sequentially. The spec's ChannelRouting rule and the allium guidance say "error isolation: one channel failure does not block others" -- which IS respected via try/catch. However, the sequential execution means a slow SMTP send (up to 30s timeout) blocks push delivery.

The webhook channel internally uses `Promise.allSettled` for concurrent endpoint delivery. The push channel does the same for concurrent subscription delivery. But at the router level, channels execute one-by-one.

**Architectural Impact:** Medium. For Job Alerts (Roadmap 1.5) and CRM Reminders (5.4), notification volume will increase. A 30-second SMTP timeout blocking a 10-second push delivery means the user receives push 30+ seconds late.

**Recommendation:** Change the router to dispatch to all channels concurrently:
```typescript
const settled = await Promise.allSettled(
  eligibleChannels.map(async (channel) => {
    const result = await channel.dispatch(draft, draft.userId);
    return result;
  })
);
```
The preference/availability checks can remain sequential (they are fast DB reads), but dispatch should be concurrent. This matches how the webhook channel handles multiple endpoints.

### F-05: NotificationChannel interface missing `isEnabled` method [LOW]

**File:** `src/lib/notifications/types.ts` (lines 43-60)

**Description:**
The CLAUDE.md specification states the interface has three methods: `dispatch`, `isAvailable`, `isEnabled`. The actual interface only has `dispatch` and `isAvailable`. The `isEnabled` check is handled by `shouldNotify()` in the ChannelRouter via preference lookup, which is architecturally cleaner (channels should not need to know about user preferences). However, the documentation and spec are inconsistent with the implementation.

**Architectural Impact:** Low. The current design is arguably better -- channels check infrastructure, the router checks preferences. This is proper separation of concerns.

**Recommendation:** Update the CLAUDE.md documentation to accurately describe the two-method interface. No code change needed.

---

## 3. Data Model Assessment

### F-06: SmtpConfig uses findFirst but has @unique on userId [LOW]

**Files:**
- `src/actions/smtp.actions.ts` (lines 169, 236, 266, 341)
- `src/lib/notifications/channels/email.channel.ts` (line 97)
- `prisma/schema.prisma` (SmtpConfig model, `userId String @unique`)

**Description:**
SmtpConfig has `userId @unique` in the schema, meaning there can only be one config per user. Yet all queries use `prisma.smtpConfig.findFirst({ where: { userId } })` instead of `prisma.smtpConfig.findUnique({ where: { userId } })`. This is consistent with the ADR-015 pattern (findFirst over findUnique when adding userId), but since userId IS the unique constraint here, `findUnique` would be both correct and more efficient (Prisma can use the unique index directly).

The same applies to `VapidConfig` -- which correctly uses `findUnique` (push.channel.ts line 80, vapid.ts line 28). SmtpConfig should be consistent.

**Architectural Impact:** Low. No functional difference (findFirst on a unique field returns the same result), but findUnique communicates intent better and may yield slightly better query plans.

**Recommendation:** Change SmtpConfig lookups from `findFirst({ where: { userId } })` to `findUnique({ where: { userId } })`. The ADR-015 guidance for findFirst applies when adding userId as an additional filter to an id-based lookup, not when userId itself is the unique key.

### F-07: WebPushSubscription IV storage uses pipe-separated concatenation [LOW]

**Files:**
- `src/actions/push.actions.ts` (lines 104-105)
- `src/lib/notifications/channels/push.channel.ts` (lines 133-135)

**Description:**
The subscription stores two encrypted values (p256dh, auth) with their IVs concatenated as `"ivP256dh|ivAuth"` in a single `iv` column. The decryption side splits on pipe: `sub.iv.split("|")` with a fallback `ivParts[1] ?? ivParts[0]` for single-iv records.

This is a pragmatic approach, but the pipe-separated format is fragile -- if a base64 IV ever contained a pipe character (it cannot in standard base64, but URL-safe base64 variants use different character sets), parsing would break. More importantly, the fallback path (using the same IV for both p256dh and auth) would be a cryptographic weakness if ever triggered on real data.

**Architectural Impact:** Low. Base64 encoding never produces pipe characters, so this is safe in practice. The fallback path is defensive coding that should never execute for records created by the current `subscribePush` implementation.

**Recommendation:** No code change needed for correctness, but consider adding a comment explaining why the pipe separator is safe (base64 character set does not include `|`), and consider logging a warning if the fallback path is ever triggered, as it would indicate data corruption.

---

## 4. Security Architecture

### F-08: Email channel files lack `import "server-only"` guard [MEDIUM]

**Files:**
- `src/lib/notifications/channels/email.channel.ts`
- `src/lib/notifications/channels/push.channel.ts`

**Description:**
The email template file (`src/lib/email/templates.ts`) correctly has `import "server-only"`. The rate limiter files (`email-rate-limit.ts`, `push/rate-limit.ts`) correctly have `import "server-only"`. The SMTP validation (`smtp-validation.ts`) correctly has `import "server-only"`. The encryption module has `import "server-only"`.

However, the channel implementation files themselves do NOT have `import "server-only"`. Since these files import from `@/lib/db` (Prisma) and `@/lib/encryption` (which has server-only), they would fail at runtime if accidentally imported from a client component. But the `import "server-only"` guard is the project convention (CLAUDE.md: "Server-only barrel: has import 'server-only'"), and it provides a clear compile-time error rather than a confusing runtime error.

**Architectural Impact:** Medium. These files import `nodemailer` and `web-push` which are Node.js-only packages. If a client component ever imported a channel directly (unlikely but possible during refactoring), the error would be confusing. The `import "server-only"` directive provides fail-fast clarity.

**Recommendation:** Add `import "server-only";` to both channel files. The webhook channel (`webhook.channel.ts`) also lacks this guard -- all four channel files should have it for consistency.

### F-09: PushChannel deletes subscriptions on 401/403 in addition to 410/404 [MEDIUM]

**File:** `src/lib/notifications/channels/push.channel.ts` (lines 166-189)

**Description:**
The Allium spec's PushDelivery rule states: "if delivery returns 410 Gone: ensures subscription deleted (stale)". The implementation extends this to also delete subscriptions on 401 and 403 errors. While 404 and 410 clearly indicate the subscription is gone/stale, 401/403 typically indicate VAPID authentication problems -- the subscription itself may be valid, but the server's VAPID credentials are rejected.

Deleting subscriptions on 401/403 means that a temporary VAPID misconfiguration (e.g., key corruption) would wipe ALL user subscriptions, requiring manual re-subscription on every device. The spec deliberately limits auto-deletion to 410 Gone for this reason.

**Architectural Impact:** Medium. A VAPID auth failure is a server-side configuration issue, not a subscription staleness issue. Deleting subscriptions on 401/403 conflates two failure modes. If VAPID keys become temporarily invalid (corruption, rotation mid-flight), users lose all subscriptions permanently.

**Recommendation:** Remove subscription deletion for 401/403 status codes. Log these as VAPID auth errors but preserve the subscription. Only auto-delete on 404 (not found) and 410 (gone), which are definitive indicators that the push service no longer recognizes the subscription.

---

## 5. Spec Alignment

### F-10: Deduplication rule from spec is not implemented [LOW]

**File:** `specs/notification-dispatch.allium` (rule Deduplication, lines 311-338)

**Description:**
The Allium spec defines a Deduplication rule: "No duplicate notifications of same type+moduleId within 5 minutes." The `NoDuplicateWithinWindow` invariant reinforces this. However, the notification-dispatcher.ts has no deduplication logic -- every event that passes the preference check creates a notification.

The BatchSummary rule for VacancyStaged IS implemented (the buffer in notification-dispatcher.ts), but the general deduplication rule is absent.

**Architectural Impact:** Low for current usage. Module lifecycle events (deactivated, reactivated) are infrequent. However, for Job Alerts (Roadmap 1.5) with `job_status_changed` events, rapid status transitions could produce notification spam.

**Recommendation:** This appears to be a known gap (the spec defines it, but it may have been intentionally deferred). If deferred, add a comment in the dispatcher referencing the spec rule and noting it is not yet implemented. If it should be implemented, a simple in-memory map of `(userId, type, moduleId) -> lastNotifiedAt` with a 5-minute window would suffice.

---

## 6. Cross-Dependency Readiness

### Assessment for Roadmap 1.5 (Job Alerts) and 5.4 (CRM Reminders)

The architecture is well-positioned for these future features:

**Strengths:**
1. **Channel extensibility:** Adding notification types requires only: (a) extending the `NotificationType` union, (b) adding event handlers in the dispatcher, (c) adding i18n keys and email templates. No channel code changes needed.
2. **ChannelRouter is genuinely decoupled:** Channels have no knowledge of each other. The router's preference-gating means new channels can be added by implementing the interface and registering.
3. **Template system scales:** The email template's `buildNotificationMessage` maps any NotificationType to an i18n key. New types just need new entries in the map.
4. **Event Bus integration is clean:** The dispatcher subscribes to domain events and produces NotificationDrafts. New event types require new subscriptions but no structural changes.

**Gaps to address before 1.5/5.4:**
1. **Concurrent channel dispatch (F-04):** Job Alerts will produce higher notification volumes; sequential dispatch will become a bottleneck.
2. **Deduplication (F-10):** CRM Reminders may fire overlapping reminders; dedup prevents spam.
3. **Digest mode:** The spec defines `DigestMode` (immediate/hourly/daily) but it is aspirational. Job Alerts with many matches would benefit from daily digest support.

---

## 7. Architectural Consistency (vs Webhook Channel S5a)

The Email and Push channels follow the Webhook channel's established patterns with good fidelity:

| Pattern | Webhook (S5a) | Email (S5b) | Push (S5b) | Consistent? |
|---------|--------------|-------------|------------|-------------|
| Implements NotificationChannel | Yes | Yes | Yes | Yes |
| globalThis singleton (ChannelRouter) | Yes | Yes | Yes | Yes |
| Error isolation (try/catch in dispatch) | Yes | Yes | Yes | Yes |
| IDOR protection (userId in all queries) | Yes | Yes | Yes | Yes |
| Encrypted credentials at rest | HMAC secret | SMTP password | VAPID private key + subscription keys | Yes |
| Rate limiting | N/A (webhook is per-endpoint) | 10/min per user | 20/min per user | Yes |
| SSRF validation | validateWebhookUrl on dispatch | validateSmtpHost on dispatch | N/A (push service URLs are browser-managed) | Yes |
| _testHelpers export pattern | Yes | Yes | Yes | Yes |
| Concurrent delivery to multiple targets | Promise.allSettled | Single target | Promise.allSettled | Yes |
| ChannelResult return type | Yes | Yes | Yes | Yes |

The pattern adherence is strong. The main inconsistency is the `import "server-only"` guard (F-08) which is absent from ALL channel files including the webhook channel.

---

## 8. Design Pattern Assessment

### Strategy Pattern (Channels): Well-implemented
Each channel is a concrete strategy implementing the `NotificationChannel` interface. The ChannelRouter is the context that selects and invokes strategies based on user preferences. Classic Gang of Four Strategy pattern, correctly applied.

### Observer Pattern (Event Bus -> Dispatcher): Well-implemented
The notification-dispatcher subscribes to domain events via the EventBus. Event handlers are pure functions that transform events into NotificationDrafts. Clean observer implementation.

### Singleton Pattern (globalThis): Correctly applied
The ChannelRouter, rate limiter stores, and EventBus all use the `globalThis` pattern documented in CLAUDE.md for surviving HMR in development. Consistent across all new code.

### Repository Pattern (Server Actions): Correctly applied
`smtp.actions.ts` and `push.actions.ts` serve as repositories for their respective aggregates, returning `ActionResult<T>`. All actions resolve the user via `getCurrentUser()` and enforce IDOR protection.

---

## Findings Index

| ID | Severity | Category | Summary |
|----|----------|----------|---------|
| F-01 | HIGH | Spec Alignment | Email recipient diverges from Allium spec (user.email vs fromAddress) |
| F-02 | MEDIUM | DRY/Cohesion | resolveUserLocale duplicated across 4 files |
| F-03 | MEDIUM | DRY/Cohesion | Rate limiter implementation duplicated between email and push |
| F-04 | MEDIUM | Scalability | ChannelRouter dispatches sequentially, not concurrently |
| F-05 | LOW | Documentation | NotificationChannel interface docs mention isEnabled but it does not exist |
| F-06 | LOW | Data Model | SmtpConfig uses findFirst despite @unique constraint on userId |
| F-07 | LOW | Data Model | Pipe-separated IV concatenation for WebPushSubscription |
| F-08 | MEDIUM | Security | Channel files lack import "server-only" guard |
| F-09 | MEDIUM | Security/Spec | PushChannel deletes subscriptions on 401/403 (spec says only 410) |
| F-10 | LOW | Spec Alignment | Deduplication rule from spec is not implemented |
