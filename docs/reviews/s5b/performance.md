# Phase 2b: Performance & Scalability Analysis

**Scope:** S5b Email + Push Notification Channels
**Date:** 2026-04-05
**Reviewer:** Performance Engineering Analysis

---

## Executive Summary

The S5b implementation has solid architectural separation and good error isolation between channels. However, several performance bottlenecks exist that would become critical as usage scales. The most impactful issues are: (1) sequential channel dispatch in the ChannelRouter blocking fast channels behind slow SMTP, (2) excessive PBKDF2 key derivation calls during push delivery, and (3) redundant database queries across the dispatch pipeline where a single notification event triggers 8-12 separate DB round-trips.

**Finding Counts:** 3 Critical, 4 High, 6 Medium, 4 Low

---

## F-01: Sequential Channel Dispatch in ChannelRouter (Critical)

**File:** `src/lib/notifications/channel-router.ts`, lines 56-79
**Impact:** A slow SMTP server (30s timeout) blocks push delivery for the same notification event. All 4 channels execute in serial `for...of` loop.

### Analysis

The `route()` method iterates channels sequentially:

```typescript
for (const channel of this.channels) {
  // ...
  const available = await channel.isAvailable(draft.userId);  // DB query
  // ...
  const result = await channel.dispatch(draft, draft.userId); // up to 30s for SMTP
  // ...
}
```

Channel registration order is: InApp, Webhook, Email, Push. If SMTP is misconfigured and times out at 30s, the push channel waits 30s before it even starts. Webhook retries (up to 36s with backoff) compound this further. Worst case: push delivery is delayed 66+ seconds.

The `dispatchNotification()` function in the dispatcher fires the router as fire-and-forget (`channelRouter.route(draft, prefs).catch(...)`) which prevents blocking the event bus, but the channels still block each other within a single route call.

### Recommendation

Dispatch channels concurrently using `Promise.allSettled`. Each channel already has error isolation (try/catch returning ChannelResult), so concurrent execution is safe:

```typescript
async route(draft: NotificationDraft, prefs: NotificationPreferences): Promise<ChannelRouterResult> {
  // Pre-filter eligible channels
  const eligible: NotificationChannel[] = [];
  for (const channel of this.channels) {
    const channelId = channel.name as NotificationChannelId;
    if (shouldNotify(prefs, draft.type, channelId)) {
      eligible.push(channel);
    }
  }

  // Check availability + dispatch concurrently
  const settled = await Promise.allSettled(
    eligible.map(async (channel) => {
      const available = await channel.isAvailable(draft.userId);
      if (!available) return null;
      return channel.dispatch(draft, draft.userId);
    }),
  );

  const results: ChannelResult[] = [];
  for (const s of settled) {
    if (s.status === "fulfilled" && s.value) {
      results.push(s.value);
    } else if (s.status === "rejected") {
      results.push({ success: false, channel: "unknown", error: s.reason?.message });
    }
  }

  return {
    anySuccess: results.some((r) => r.success),
    results,
  };
}
```

**Estimated improvement:** Push delivery latency drops from 30-66s (SMTP timeout) to ~2-5s (independent network round-trip). Email and webhook failures no longer cascade to other channels.

---

## F-02: Excessive PBKDF2 Key Derivation on Every Decrypt (Critical)

**File:** `src/lib/encryption.ts`, line 21
**Impact:** Each `decrypt()` call runs 100,000 PBKDF2 iterations synchronously, blocking the Node.js event loop. A single push dispatch to N subscriptions triggers N*2+1 PBKDF2 calls (2 per subscription for p256dh + auth, plus 1 for the VAPID private key).

### Analysis

The `deriveKey()` function uses `pbkdf2Sync` (synchronous) with 100,000 iterations:

```typescript
function deriveKey(secret: string, salt: Buffer | string): Buffer {
  return pbkdf2Sync(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}
```

For a user with 10 push subscriptions, a single push dispatch performs:
- 1x decrypt VAPID private key = 1 PBKDF2 call
- 10x decrypt p256dh + 10x decrypt auth = 20 PBKDF2 calls
- Total: **21 synchronous PBKDF2 calls** (~5-10ms each = 105-210ms of event-loop blocking)

For the email channel, each dispatch decrypts the SMTP password (1 PBKDF2 call). The `toDTO()` function in `smtp.actions.ts` also decrypts just to show last 4 chars (another PBKDF2 call per settings page load).

Combined across all channels for a single notification:
- InApp: 0 PBKDF2
- Webhook: 1 per endpoint (decrypt HMAC secret)
- Email: 1 (decrypt SMTP password)
- Push (10 subs): 21 PBKDF2 calls
- **Total: ~23 synchronous PBKDF2 calls per notification**

### Recommendation

Two-tier fix:

**Tier 1 (Immediate): Use async pbkdf2 instead of pbkdf2Sync**

```typescript
import { pbkdf2 } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);

async function deriveKeyAsync(secret: string, salt: Buffer | string): Promise<Buffer> {
  return pbkdf2Async(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
}
```

This unblocks the event loop during key derivation. All callers (`encrypt`, `decrypt`) would become async (they are already used in async contexts).

**Tier 2 (High impact): Cache derived keys per salt**

```typescript
const keyCache = new Map<string, { key: Buffer; usedAt: number }>();
const KEY_CACHE_TTL_MS = 5 * 60_000; // 5 minutes

async function deriveKeyCached(secret: string, salt: Buffer | string): Promise<Buffer> {
  const cacheKey = typeof salt === "string" ? salt : salt.toString("hex");
  const cached = keyCache.get(cacheKey);
  if (cached && Date.now() - cached.usedAt < KEY_CACHE_TTL_MS) {
    cached.usedAt = Date.now();
    return cached.key;
  }
  const key = await pbkdf2Async(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");
  keyCache.set(cacheKey, { key, usedAt: Date.now() });
  return key;
}
```

Since the ENCRYPTION_KEY env var does not change at runtime, derived keys for the same salt are deterministic and safe to cache.

**Estimated improvement:** Tier 1 prevents event-loop blocking. Tier 2 reduces 21 PBKDF2 calls to 1 (cache hit for subsequent decrypts with same salt within window). Push dispatch for 10 subs drops from ~200ms CPU to ~10ms.

---

## F-03: Redundant DB Queries Across Dispatch Pipeline (Critical)

**File:** Multiple files in the dispatch chain
**Impact:** A single notification event triggers 8-12 separate database round-trips for the same user data.

### Analysis

Tracing a single notification from event handler through all 4 channels:

**In notification-dispatcher.ts (event handler):**
1. `resolveLocale(userId)` -- `prisma.userSettings.findUnique` (line 88)
2. `dispatchNotification()` -> `resolvePreferences(userId)` -- `prisma.userSettings.findUnique` (line 73)

**In ChannelRouter -> InAppChannel:**
3. `isAvailable()` -- returns true (no DB)
4. `dispatch()` -- `prisma.notification.create` (line 19) -- needed

**In ChannelRouter -> WebhookChannel:**
5. `isAvailable()` -- `prisma.webhookEndpoint.count` (line 362)
6. `dispatch()` -- `prisma.webhookEndpoint.findMany` (line 228) -- partially redundant with #5
7. On failure: `resolveUserLocale()` -- `prisma.userSettings.findUnique` (line 155) -- 3rd read of same row

**In ChannelRouter -> EmailChannel:**
8. `isAvailable()` -- `prisma.smtpConfig.count` (line 185)
9. `dispatch()` -- `prisma.smtpConfig.findFirst` (line 97) -- redundant with #8
10. `resolveUserLocale()` -- `prisma.userSettings.findUnique` (line 51) -- 4th read of same row
11. `resolveRecipientEmail()` -- `prisma.user.findUnique` (line 67)

**In ChannelRouter -> PushChannel:**
12. `isAvailable()` -- `prisma.vapidConfig.findUnique` + `prisma.webPushSubscription.count` (lines 246-247)
13. `dispatch()` -- `prisma.vapidConfig.findUnique` (line 80) -- redundant with #12
14. `dispatch()` -- `prisma.webPushSubscription.findMany` (line 88) -- supersedes count from #12
15. `resolveVapidSubject()` -- `prisma.smtpConfig.findFirst` (line 47) -- redundant with #8/#9

**Total: 15 DB queries, of which at least 7 are redundant.**

The `userSettings` row is read 4 times. The `smtpConfig` is read 3 times. The `vapidConfig` is read 2 times. The `webhookEndpoint` table is queried 2 times.

### Recommendation

Introduce a `DispatchContext` that pre-fetches all needed data once and passes it through the chain:

```typescript
interface DispatchContext {
  userId: string;
  locale: string;
  prefs: NotificationPreferences;
  recipientEmail: string | null;
  smtpConfig: SmtpConfig | null;
  vapidConfig: VapidConfig | null;
  subscriptionCount: number;
  webhookEndpointCount: number;
}

async function buildDispatchContext(userId: string): Promise<DispatchContext> {
  const [settings, user, smtp, vapid, subCount, webhookCount] = await Promise.all([
    prisma.userSettings.findUnique({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { email: true } }),
    prisma.smtpConfig.findFirst({ where: { userId, active: true } }),
    prisma.vapidConfig.findUnique({ where: { userId } }),
    prisma.webPushSubscription.count({ where: { userId } }),
    prisma.webhookEndpoint.count({ where: { userId, active: true } }),
  ]);

  const parsed = settings ? JSON.parse(settings.settings) : {};
  return {
    userId,
    locale: parsed.display?.locale ?? DEFAULT_LOCALE,
    prefs: parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
    recipientEmail: user?.email ?? null,
    smtpConfig: smtp,
    vapidConfig: vapid,
    subscriptionCount: subCount,
    webhookEndpointCount: webhookCount,
  };
}
```

This reduces 15 queries to 6 parallel queries executed once, then passed to all channels. The `isAvailable` checks become simple field checks on the context object rather than separate DB calls.

**Estimated improvement:** DB round-trips reduced from ~15 sequential to 6 parallel. At 2-5ms per SQLite query, this saves 18-45ms per notification and reduces DB connection contention.

---

## F-04: No SMTP Connection Pooling (High)

**File:** `src/lib/notifications/channels/email.channel.ts`, lines 140-171
**Impact:** Every email dispatch creates a new TCP connection, performs TLS handshake, authenticates, sends, then closes. For burst notifications (e.g., 10 module deactivation events affecting multiple automations), this means 10 separate SMTP handshakes.

### Analysis

```typescript
const transporter = nodemailer.createTransport({ ... });
try {
  await transporter.sendMail({ ... });
} finally {
  transporter.close();
}
```

A nodemailer transporter is created and immediately destroyed for each email. SMTP connection setup involves DNS resolution + TCP connect + TLS negotiation + AUTH command, typically 200-500ms per connection to external providers. With the 30s timeout on each phase, a slow SMTP server compounds the problem.

### Recommendation

Cache transporters per user with idle timeout. Nodemailer transporters support connection pooling natively:

```typescript
const transporterCache = new Map<string, {
  transporter: nodemailer.Transporter;
  createdAt: number;
}>();
const TRANSPORTER_TTL_MS = 5 * 60_000; // 5 minutes idle

function getOrCreateTransporter(userId: string, config: SmtpConfig, password: string): nodemailer.Transporter {
  const cached = transporterCache.get(userId);
  if (cached && Date.now() - cached.createdAt < TRANSPORTER_TTL_MS) {
    return cached.transporter;
  }

  // Close old transporter if exists
  if (cached) {
    cached.transporter.close();
    transporterCache.delete(userId);
  }

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.username, pass: password },
    tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
    requireTLS: config.tlsRequired,
    pool: true,          // Enable connection pooling
    maxConnections: 3,   // Max concurrent connections
    maxMessages: 50,     // Messages per connection before reconnect
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });

  transporterCache.set(userId, { transporter, createdAt: Date.now() });
  return transporter;
}
```

**Estimated improvement:** Burst email delivery (e.g., 5 emails in 1 minute) goes from 5 x 300ms handshake = 1.5s overhead to 1 x 300ms + 4 x ~10ms = ~340ms. An 80% reduction in SMTP connection overhead.

---

## F-05: toDTO Decrypts Full Password for Last-4-Char Mask (High)

**File:** `src/actions/smtp.actions.ts`, lines 116-150
**Impact:** Every `getSmtpConfig()` call (Settings page load) performs a full AES decrypt + 100,000-iteration PBKDF2 just to extract the last 4 characters of the password.

### Analysis

```typescript
function toDTO(config: { ... }): SmtpConfigDTO {
  let passwordMask = "****";
  try {
    const decrypted = decrypt(config.password, config.iv);
    passwordMask = `****${getLast4(decrypted)}`;
  } catch {
    // If decryption fails, show generic mask
  }
  // ...
}
```

The `decrypt()` function runs `pbkdf2Sync` with 100,000 iterations, taking 5-10ms of synchronous CPU time. This is called every time the Settings page loads the SMTP configuration.

### Recommendation

Store the password hint (last 4 chars) as a separate non-encrypted column at creation time, or compute and cache it on save:

```typescript
// In saveSmtpConfig, compute mask at save time:
const { encrypted, iv } = encrypt(input.password);
const passwordHint = input.password.slice(-4);

await prisma.smtpConfig.create({
  data: {
    ...baseData,
    password: encrypted,
    iv,
    passwordHint, // New column: stores last 4 chars (not security-sensitive)
    userId: user.id,
  },
});
```

If adding a schema column is undesirable, at minimum cache the mask in-memory after first computation for the session.

**Estimated improvement:** Eliminates 5-10ms synchronous CPU block on every Settings page load. Removes one PBKDF2 call that has zero security value.

---

## F-06: Duplicate resolveUserLocale Functions (High)

**File:** `email.channel.ts` (line 49), `webhook.channel.ts` (line 153), `notification-dispatcher.ts` (lines 71, 86), `smtp.actions.ts` (line 64)
**Impact:** Five independent copies of the same function, each making a separate DB query for the same `userSettings` row. No caching, no sharing.

### Analysis

The locale resolution pattern is duplicated across 5 files:

1. `notification-dispatcher.ts` -- `resolveLocale()` (used by every event handler)
2. `notification-dispatcher.ts` -- `resolvePreferences()` (reads same row for different field)
3. `email.channel.ts` -- `resolveUserLocale()` (used in email dispatch)
4. `webhook.channel.ts` -- `resolveUserLocale()` (used in webhook failure notifications)
5. `smtp.actions.ts` -- `resolveUserLocale()` (used for test email)

Functions #1 and #2 read the same `userSettings` row but extract different fields. They are called sequentially in the same code path, resulting in 2 DB queries where 1 would suffice.

### Recommendation

Extract a single `resolveUserContext()` utility that returns both locale and preferences:

```typescript
// src/lib/notifications/resolve-user-context.ts
import "server-only";

export interface UserContext {
  locale: string;
  preferences: NotificationPreferences;
}

export async function resolveUserContext(userId: string): Promise<UserContext> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return { locale: DEFAULT_LOCALE, preferences: DEFAULT_NOTIFICATION_PREFERENCES };
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return {
      locale: parsed.display?.locale && isValidLocale(parsed.display.locale)
        ? parsed.display.locale
        : DEFAULT_LOCALE,
      preferences: parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES,
    };
  } catch {
    return { locale: DEFAULT_LOCALE, preferences: DEFAULT_NOTIFICATION_PREFERENCES };
  }
}
```

**Estimated improvement:** Eliminates 3-4 redundant DB queries per notification dispatch. Reduces code duplication from 5 copies to 1.

---

## F-07: messageKeyMap Recreated on Every buildNotificationMessage Call (High)

**File:** `src/lib/email/templates.ts`, lines 162-174
**Impact:** A static Record literal is allocated on every invocation. While V8 optimizes small object literals, the redundant allocation is wasteful and the function contains a double-replacement bug.

### Analysis

```typescript
function buildNotificationMessage(type, data, locale) {
  const messageKeyMap: Record<NotificationType, string> = {
    module_deactivated: "notifications.moduleDeactivated",
    // ... 10 more entries
  };
  const key = messageKeyMap[type];
  let message = t(locale, key);

  // Generic replacement pass
  for (const [k, v] of Object.entries(data)) {
    message = message.replace(`{${k}}`, String(v ?? ""));
  }

  // Then ANOTHER replacement pass with hardcoded field names
  if (data.moduleId) {
    message = message.replace("{name}", String(data.moduleId));
  }
  // ...more replacements
}
```

Problems:
1. `messageKeyMap` is a constant that should be module-level
2. The generic `for...of` loop already replaces all data keys, then the subsequent `if` blocks try to replace specific keys that may have already been replaced (or not, depending on whether the data keys match the template placeholders exactly). This is both redundant and fragile.

### Recommendation

Hoist the map to module scope and unify the replacement logic:

```typescript
const MESSAGE_KEY_MAP: Record<NotificationType, string> = {
  module_deactivated: "notifications.moduleDeactivated",
  // ...
};

// Mapping from data field names to template placeholder names
const PLACEHOLDER_ALIASES: Record<string, string> = {
  moduleId: "name",
  affectedAutomationCount: "automationCount",
  pausedAutomationCount: "automationCount",
  purgedCount: "count",
};

function buildNotificationMessage(type: NotificationType, data: Record<string, unknown>, locale: string): string {
  const key = MESSAGE_KEY_MAP[type];
  let message = t(locale, key);

  // Single-pass replacement with alias support
  for (const [k, v] of Object.entries(data)) {
    const value = String(v ?? "");
    message = message.replace(`{${k}}`, value);
    const alias = PLACEHOLDER_ALIASES[k];
    if (alias) {
      message = message.replace(`{${alias}}`, value);
    }
  }

  return message;
}
```

**Estimated improvement:** Eliminates per-call object allocation and reduces string scan passes from 2 to 1. Minor but measurable at high notification volumes.

---

## F-08: Push Delivery Decrypts Per-Subscription Without Batching (Medium)

**File:** `src/lib/notifications/channels/push.channel.ts`, lines 129-201
**Impact:** For N subscriptions, performs 2N decrypt operations. Each decrypt involves PBKDF2 with 100K iterations (see F-02). With 10 subscriptions, that is 20 synchronous PBKDF2 calls.

### Analysis

Inside the `Promise.allSettled` map:

```typescript
subscriptions.map(async (sub) => {
  const ivParts = sub.iv.split("|");
  let p256dh = decrypt(sub.p256dh, ivParts[0]);  // PBKDF2 x 100K
  let auth = decrypt(sub.auth, ivParts[1]);        // PBKDF2 x 100K
  // ...send push
});
```

Even though the subscriptions are dispatched concurrently via `Promise.allSettled`, the `decrypt` calls within each are synchronous and block the event loop sequentially (JavaScript is single-threaded). Ten subscriptions = 20 blocking PBKDF2 calls in sequence despite the appearance of concurrency.

### Recommendation

This is resolved by F-02's key caching recommendation. Additionally, decrypt all subscription keys before entering the concurrent dispatch:

```typescript
// Pre-decrypt all keys (benefits from key cache after first call)
const decryptedSubs = await Promise.all(
  subscriptions.map(async (sub) => {
    const ivParts = sub.iv.split("|");
    return {
      ...sub,
      decryptedP256dh: await decryptAsync(sub.p256dh, ivParts[0]),
      decryptedAuth: await decryptAsync(sub.auth, ivParts[1] ?? ivParts[0]),
    };
  }),
);

// Then dispatch concurrently (no crypto in the hot path)
const deliveryResults = await Promise.allSettled(
  decryptedSubs.map(async (sub) => {
    // Use pre-decrypted keys
  }),
);
```

**Estimated improvement:** With F-02 key caching, reduces from 20 PBKDF2 calls to 1 (all subscriptions share the same ENCRYPTION_KEY; salts differ but would hit cache). Without caching, separating decrypt from dispatch at least provides clearer profiling boundaries.

---

## F-09: Rate Limiter Maps Grow Unbounded Between Cleanups (Medium)

**File:** `src/lib/email-rate-limit.ts`, `src/lib/push/rate-limit.ts`
**Impact:** Under sustained load, rate limiter Maps can accumulate entries for all active users. Cleanup runs every 5 minutes and stops itself when empty, requiring re-initialization on next request.

### Analysis

The sliding window implementation stores timestamps per user:

```typescript
entry.timestamps.push(now);
```

For email (10/min limit), each active user can have up to 10 timestamps. For push (20/min), up to 20. With 1000 active users, the maps hold 10,000-20,000 entries. This is manageable.

However, the cleanup pattern has a subtle issue:

```typescript
if (emailStore.size === 0 && testEmailStore.size === 0 && g.__emailRateLimitCleanup) {
  clearInterval(g.__emailRateLimitCleanup);
  g.__emailRateLimitCleanup = null;
}
```

When cleanup clears all entries and stops itself, the next `ensureCleanup()` call restarts it. This start/stop cycle creates unnecessary timer churn. Additionally, the cleanup iterates all entries in both maps even if only one map has stale data.

### Recommendation

Use a simpler approach: do not self-stop the cleanup timer. The `unref()` call already prevents it from keeping the process alive. Remove the self-stop logic:

```typescript
function ensureCleanup(): void {
  if (g.__emailRateLimitCleanup) return;
  g.__emailRateLimitCleanup = setInterval(() => {
    const now = Date.now();
    for (const store of [emailStore, testEmailStore]) {
      for (const [key, entry] of store) {
        entry.timestamps = entry.timestamps.filter((ts) => now - ts < EMAIL_WINDOW_MS);
        if (entry.timestamps.length === 0) store.delete(key);
      }
    }
    // Do NOT self-stop: the timer is unref'd and has negligible cost
  }, CLEANUP_INTERVAL_MS);
  // ...unref...
}
```

Also consider using a more memory-efficient counter-based approach instead of storing individual timestamps (if exact sliding window semantics are not strictly required):

```typescript
interface RateLimitEntry {
  count: number;
  windowStart: number;
}
```

**Estimated improvement:** Eliminates timer churn. Memory impact is negligible for this application's scale (self-hosted, small user base).

---

## F-10: isAvailable + dispatch Double-Query Pattern (Medium)

**File:** `channel-router.ts` (line 65) calling `isAvailable`, then `dispatch` on same channel
**Impact:** Each channel's `isAvailable()` makes a DB query, then `dispatch()` re-queries the same data. This doubles DB round-trips for every channel.

### Analysis

```typescript
// ChannelRouter.route():
const available = await channel.isAvailable(draft.userId);  // DB query
if (!available) continue;
const result = await channel.dispatch(draft, draft.userId); // Same DB query again
```

Specific duplications:
- **EmailChannel**: `isAvailable()` does `smtpConfig.count({userId, active})`, then `dispatch()` does `smtpConfig.findFirst({userId, active})`
- **PushChannel**: `isAvailable()` does `vapidConfig.findUnique` + `webPushSubscription.count`, then `dispatch()` does `vapidConfig.findUnique` + `webPushSubscription.findMany`
- **WebhookChannel**: `isAvailable()` does `webhookEndpoint.count({userId, active})`, then `dispatch()` does `webhookEndpoint.findMany({userId, active})`

### Recommendation

This is largely solved by F-03's `DispatchContext` approach. Alternatively, modify the channel interface to combine availability check and dispatch:

```typescript
interface NotificationChannel {
  readonly name: string;
  /** Returns null if not available, ChannelResult if dispatched */
  tryDispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult | null>;
}
```

Channels internally check availability and return `null` (skipped) or a `ChannelResult`. This eliminates the double-query pattern at the interface level.

**Estimated improvement:** Eliminates 3-4 redundant DB queries per notification (one per channel with infrastructure).

---

## F-11: PushChannel.resolveVapidSubject Queries SmtpConfig Unnecessarily (Medium)

**File:** `src/lib/notifications/channels/push.channel.ts`, lines 45-58
**Impact:** Every push dispatch queries SmtpConfig to derive a VAPID subject (mailto: URI). This is a cross-concern dependency that adds latency and creates coupling between push and email infrastructure.

### Analysis

```typescript
async function resolveVapidSubject(userId: string): Promise<string> {
  const smtp = await prisma.smtpConfig.findFirst({
    where: { userId, active: true },
    select: { fromAddress: true },
  });
  if (smtp?.fromAddress) return `mailto:${smtp.fromAddress}`;
  return DEFAULT_VAPID_SUBJECT;
}
```

The VAPID subject rarely changes (it is the user's email). Querying SmtpConfig on every push dispatch is wasteful. Additionally, if the user has no SMTP configured, this query always returns null and falls back to the default.

### Recommendation

Store the VAPID subject on the VapidConfig record itself, set at key generation time. Or cache it in-memory per user:

```typescript
const vapidSubjectCache = new Map<string, { subject: string; expiresAt: number }>();
const CACHE_TTL = 10 * 60_000; // 10 minutes

async function resolveVapidSubject(userId: string): Promise<string> {
  const cached = vapidSubjectCache.get(userId);
  if (cached && Date.now() < cached.expiresAt) return cached.subject;

  const smtp = await prisma.smtpConfig.findFirst({
    where: { userId, active: true },
    select: { fromAddress: true },
  });
  const subject = smtp?.fromAddress ? `mailto:${smtp.fromAddress}` : DEFAULT_VAPID_SUBJECT;
  vapidSubjectCache.set(userId, { subject, expiresAt: Date.now() + CACHE_TTL });
  return subject;
}
```

**Estimated improvement:** Eliminates 1 DB query per push dispatch after first call. Minor but compounds with F-03.

---

## F-12: escapeHtml Uses 5 Sequential Regex Replacements (Medium)

**File:** `src/lib/email/templates.ts`, lines 85-92
**Impact:** Each `escapeHtml()` call scans the string 5 times. Called 5+ times per template render (header, body, footer, greeting, message).

### Analysis

```typescript
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
```

Five chained `.replace()` calls, each creating a new string and scanning the entire input.

### Recommendation

Use a single-pass replacement:

```typescript
const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(str: string): string {
  return str.replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch]);
}
```

**Estimated improvement:** 5x fewer string allocations per call. At 5 calls per template with short strings, saves ~microseconds. Relevant only at very high volumes (1000+ emails/minute).

---

## F-13: No Backpressure on Concurrent Push Deliveries (Medium)

**File:** `src/lib/notifications/channels/push.channel.ts`, lines 128-202
**Impact:** All subscriptions fire `webpush.sendNotification` concurrently without any concurrency limit. With 10 subscriptions (the max), this creates 10 simultaneous outbound HTTPS connections.

### Analysis

```typescript
const deliveryResults = await Promise.allSettled(
  subscriptions.map(async (sub) => {
    // decrypt + send
    await webpush.sendNotification(pushSubscription, payload, { ... });
  }),
);
```

With the current limit of 10 subscriptions per user, 10 concurrent connections is acceptable. However, if the limit increases or if multiple users' push notifications are dispatched simultaneously (e.g., module deactivation affecting all users), the server could open hundreds of outbound connections simultaneously.

### Recommendation

Add a concurrency limiter for outbound push connections:

```typescript
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = [];
  const executing = new Set<Promise<void>>();

  for (const item of items) {
    const p = fn(item)
      .then((v) => results.push({ status: "fulfilled", value: v }))
      .catch((e) => results.push({ status: "rejected", reason: e }))
      .then(() => executing.delete(p));
    executing.add(p);
    if (executing.size >= concurrency) await Promise.race(executing);
  }
  await Promise.all(executing);
  return results;
}

// Usage: max 5 concurrent push deliveries
const deliveryResults = await mapWithConcurrency(subscriptions, 5, async (sub) => { ... });
```

**Estimated improvement:** Prevents connection exhaustion under burst conditions. Current 10-sub limit means this is preventive rather than immediately necessary.

---

## F-14: Stale Subscription Cleanup Creates N Individual DELETE Queries (Low)

**File:** `src/lib/notifications/channels/push.channel.ts`, lines 174-179
**Impact:** Each stale subscription (410 Gone, 404) triggers an individual `prisma.webPushSubscription.delete()` call. In a pathological case where all 10 subscriptions are stale (e.g., after VAPID key rotation without proper cleanup), this is 10 sequential DELETE queries.

### Analysis

```typescript
if (err.statusCode === 410 || err.statusCode === 404) {
  await prisma.webPushSubscription
    .delete({ where: { id: sub.id, userId } })
    .catch(() => { /* ignore */ });
}
```

### Recommendation

Collect stale subscription IDs and batch-delete after all deliveries complete:

```typescript
const staleIds: string[] = [];

// In delivery loop:
if (err.statusCode === 410 || err.statusCode === 404) {
  staleIds.push(sub.id);
}

// After Promise.allSettled:
if (staleIds.length > 0) {
  await prisma.webPushSubscription.deleteMany({
    where: { id: { in: staleIds }, userId },
  });
}
```

**Estimated improvement:** Reduces N DELETE queries to 1 batch DELETE. Minor impact since stale subscriptions are an edge case.

---

## F-15: sendTestPush Creates New PushChannel Instance (Low)

**File:** `src/actions/push.actions.ts`, lines 230-231
**Impact:** `new PushChannel()` is instantiated for every test push call. The class has no initialization cost, but this bypasses the singleton channel registered in the ChannelRouter.

### Analysis

```typescript
const channel = new PushChannel();
const available = await channel.isAvailable(user.id);  // 2 DB queries
// ...
const result = await channel.dispatch(notification, user.id);  // re-queries everything
```

This creates a fresh instance that has no connection to the registered channel. While functionally correct, it means test pushes do not benefit from any future caching or pooling added to the singleton.

### Recommendation

Export the singleton PushChannel instance from the channel registration, or use the channelRouter to dispatch test notifications.

**Estimated improvement:** Negligible. Code hygiene improvement.

---

## F-16: SMTP Validation Compiles Regex on Every Call (Low)

**File:** `src/lib/smtp-validation.ts`, lines 51-88
**Impact:** Multiple regex literals are compiled on every `validateSmtpHost()` call. V8 optimizes literal regex, but pre-compilation makes intent clearer.

### Analysis

```typescript
if (/^127\./.test(stripped)) { ... }
if (/^169\.254\./.test(stripped)) { ... }
if (/^10\./.test(stripped)) { ... }
// etc.
```

### Recommendation

Pre-compile regex patterns as module-level constants:

```typescript
const RE_LOOPBACK = /^127\./;
const RE_LINK_LOCAL = /^169\.254\./;
const RE_PRIVATE_10 = /^10\./;
// etc.
```

**Estimated improvement:** V8 already optimizes regex literals in hot functions. This is a readability/maintainability improvement with negligible performance benefit.

---

## F-17: Webhook Channel events Field Parsed as JSON on Every Dispatch (Low)

**File:** `src/lib/notifications/channels/webhook.channel.ts`, lines 246-252
**Impact:** Each webhook endpoint's `events` field (stored as JSON string) is parsed with `JSON.parse()` for every notification to check event type matching.

### Analysis

```typescript
const matchingEndpoints = endpoints.filter((ep) => {
  try {
    const events: string[] = JSON.parse(ep.events);
    return events.includes(notification.type);
  } catch {
    return false;
  }
});
```

For a user with 10 webhook endpoints receiving 50 notifications/hour, this is 500 `JSON.parse()` calls per hour.

### Recommendation

Store events as a structured column or cache parsed events. Since this is SQLite and the events column is a JSON string, the parse is unavoidable at the Prisma level. A minor optimization would be to use `String.includes()` as a pre-filter:

```typescript
const matchingEndpoints = endpoints.filter((ep) => {
  // Quick string check before full parse
  if (!ep.events.includes(notification.type)) return false;
  try {
    const events: string[] = JSON.parse(ep.events);
    return events.includes(notification.type);
  } catch {
    return false;
  }
});
```

**Estimated improvement:** Avoids JSON.parse for non-matching endpoints. Negligible at current scale.

---

## Scalability Projections

### Scenario: 100 Push Subscriptions per User

With the current 10-subscription limit this is not possible, but if raised:
- 100 decrypt calls x 2 (p256dh + auth) = 200 PBKDF2 calls = **1-2 seconds of event-loop blocking** (without F-02 fix)
- 100 concurrent outbound HTTPS connections (without F-13 fix)
- Recommendation: Apply F-02 (key caching) and F-13 (concurrency limiter) before raising the limit

### Scenario: 1000 Notifications per Minute

With all 4 channels active:
- 1000 x 15 DB queries = **15,000 DB queries/minute** (without F-03 fix)
- 1000 x ~23 PBKDF2 calls = **23,000 synchronous crypto operations/minute** (without F-02 fix)
- 1000 x 1 SMTP connection = **1000 TCP handshakes/minute** (without F-04 fix)
- Recommendation: F-03 (DispatchContext) reduces to 6,000 queries. F-02 (key cache) reduces to ~1,000 PBKDF2. F-04 (pooling) reduces to ~50 TCP handshakes.

### Scenario: Many SMTP Timeouts

If SMTP server is unresponsive:
- Each email dispatch blocks for 30s (3 timeout phases)
- With sequential dispatch (current): blocks push/webhook for 30s per notification
- With F-01 fix (concurrent): only email channel is affected, others deliver instantly
- SMTP transporter has no circuit breaker; will retry every notification
- Recommendation: Add simple circuit breaker or exponential backoff for SMTP failures per user

---

## Priority Matrix

| ID | Severity | Effort | Impact | Recommendation |
|----|----------|--------|--------|----------------|
| F-01 | Critical | Low | High | Convert ChannelRouter.route() to Promise.allSettled |
| F-02 | Critical | Medium | High | Async PBKDF2 + derived key caching |
| F-03 | Critical | Medium | High | Introduce DispatchContext with batched queries |
| F-04 | High | Low | Medium | Nodemailer connection pooling per user |
| F-05 | High | Low | Low | Store password hint at save time |
| F-06 | High | Low | Medium | Extract shared resolveUserContext utility |
| F-07 | High | Low | Low | Hoist messageKeyMap + unify replacement |
| F-08 | Medium | Low | Medium | Pre-decrypt subscription keys before concurrent dispatch |
| F-09 | Medium | Low | Low | Remove cleanup timer self-stop logic |
| F-10 | Medium | Medium | Medium | Combine isAvailable + dispatch into tryDispatch |
| F-11 | Medium | Low | Low | Cache VAPID subject in-memory |
| F-12 | Medium | Low | Low | Single-pass HTML escaping |
| F-13 | Medium | Low | Low | Add concurrency limiter for push delivery |
| F-14 | Low | Low | Low | Batch stale subscription deletes |
| F-15 | Low | Low | Low | Reuse singleton PushChannel for tests |
| F-16 | Low | Low | Low | Pre-compile regex patterns |
| F-17 | Low | Low | Low | Pre-filter webhook events with string check |

---

## Summary of Phase 1 Context Items

| Phase 1 ID | Status | Covered By |
|------------|--------|------------|
| F-04 (sequential dispatch) | Confirmed, detailed analysis | F-01 |
| M-3 (2 DB calls for same user row) | Confirmed, expanded to 4+ reads | F-03, F-06 |
| H-4 (messageKeyMap recreation) | Confirmed, plus double-replacement bug | F-07 |
| M-6 (full password decrypt for mask) | Confirmed | F-05 |
