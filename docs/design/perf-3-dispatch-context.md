# PERF-3 DispatchContext — Data Access Pattern Design

**Status:** Implemented (2026-05-10). Architecture now documented in `CLAUDE.md` § "Notification Dispatch Context (PERF-3)".
**Scope:** Refactoring only — no Prisma schema changes
**Goal:** Consolidate 11-13 individual Prisma queries per notification dispatch into 6 parallel queries executed once, then thread the result through all channels as a read-only context object.

---

## 1. Current Query Inventory

Every notification dispatch currently triggers the following Prisma reads across the dispatcher and four channels. Queries marked REDUNDANT re-fetch data already fetched earlier in the same dispatch cycle.

| # | Query | Caller | Purpose |
|---|---|---|---|
| 1 | `userSettings.findUnique({ where: { userId } })` | `notification-dispatcher.ts` `resolveUserSettings()` | Resolve preferences + locale for the event handler |
| 2 | `notification.create(...)` | `InAppChannel.dispatch()` | **WRITE** — persist in-app notification |
| 3 | `webhookEndpoint.count({ where: { userId, active: true } })` | `WebhookChannel.isAvailable()` | Check webhook infrastructure (cached 30s) |
| 4 | `webhookEndpoint.findMany({ where: { userId, active: true } })` | `WebhookChannel.dispatch()` | Load active endpoints for delivery |
| 5 | `userSettings.findUnique({ where: { userId } })` | `resolveUserLocale()` via `notifyDeliveryFailed()` / `notifyEndpointDeactivated()` | **REDUNDANT** — locale for failure in-app notification |
| 6 | `smtpConfig.count({ where: { userId, active: true } })` | `EmailChannel.isAvailable()` | Check email infrastructure (cached 30s) |
| 7 | `smtpConfig.findFirst({ where: { userId, active: true } })` | `EmailChannel.dispatch()` | Load SMTP config for sending — **REDUNDANT** with #6 (superset) |
| 8 | `userSettings.findUnique({ where: { userId } })` | `resolveUserLocale()` via `EmailChannel.dispatch()` | **REDUNDANT** — locale for email template |
| 9 | `user.findUnique({ where: { id: userId }, select: { email } })` | `EmailChannel.resolveRecipientEmail()` | Recipient address for email delivery |
| 10a | `vapidConfig.findUnique({ where: { userId } })` | `PushChannel.isAvailable()` | Check VAPID keys exist (cached 30s) |
| 10b | `webPushSubscription.count({ where: { userId } })` | `PushChannel.isAvailable()` | Check at least one subscription exists (cached 30s) |
| 11 | `vapidConfig.findUnique({ where: { userId } })` | `PushChannel.dispatch()` | **REDUNDANT** — load VAPID keys for sending |
| 12 | `webPushSubscription.findMany({ where: { userId } })` | `PushChannel.dispatch()` | Load all subscriptions for concurrent delivery |
| 13 | `smtpConfig.findFirst({ where: { userId, active: true } })` | `resolveVapidSubject()` via `PushChannel.dispatch()` | **REDUNDANT** — derive VAPID `mailto:` subject from SMTP fromAddress |

**Total reads per dispatch:** 11-13 (depending on cache hits for isAvailable and whether webhook failure notifications fire).
**Redundant reads:** 5 (queries #5, #7/#6, #8, #11, #13).

---

## 2. DispatchContext Interface

The context is a **read-only snapshot** of all user-scoped data needed by any channel during a single dispatch cycle. It is built once, passed by reference, and never mutated by channels.

```typescript
import type { NotificationPreferences } from "@/models/notification.model";

/**
 * Pre-fetched user context for a single notification dispatch cycle.
 *
 * Built once by `buildDispatchContext(userId)` via 6 parallel Prisma
 * queries. Passed to the ChannelRouter and threaded into every channel's
 * `dispatch()` and availability derivation. Channels MUST NOT issue
 * their own Prisma reads for data available on this context.
 *
 * All fields are nullable to handle the "user has not configured X"
 * case gracefully — channels check for null and return early with a
 * descriptive error in their ChannelResult.
 */
export interface DispatchContext {
  readonly userId: string;

  // --- From UserSettings (query 1) ---
  /** Resolved notification preferences. Falls back to DEFAULT_NOTIFICATION_PREFERENCES. */
  readonly preferences: NotificationPreferences;
  /** Resolved display locale (e.g. "de", "en"). Falls back to DEFAULT_LOCALE. */
  readonly locale: string;

  // --- From User (query 2) ---
  /** User's account email address. Null if user record somehow missing. */
  readonly userEmail: string | null;

  // --- From SmtpConfig (query 3) ---
  /** Active SMTP configuration. Null if user has no active SMTP config. */
  readonly smtp: SmtpConfigSnapshot | null;

  // --- From VapidConfig (query 4) ---
  /** VAPID key pair for web push. Null if user has not enabled push. */
  readonly vapid: VapidConfigSnapshot | null;

  // --- From WebPushSubscription (query 5) ---
  /** All push subscriptions for the user. Empty array if none. */
  readonly pushSubscriptions: PushSubscriptionSnapshot[];

  // --- From WebhookEndpoint (query 6) ---
  /** All active webhook endpoints for the user. Empty array if none. */
  readonly webhookEndpoints: WebhookEndpointSnapshot[];

  // --- Derived availability flags (computed from the above, not separate queries) ---
  /** True when smtp is non-null. Replaces EmailChannel.isAvailable(). */
  readonly emailAvailable: boolean;
  /** True when vapid is non-null AND pushSubscriptions.length > 0. Replaces PushChannel.isAvailable(). */
  readonly pushAvailable: boolean;
  /** True when webhookEndpoints.length > 0. Replaces WebhookChannel.isAvailable(). */
  readonly webhookAvailable: boolean;
  /** Always true. InAppChannel only needs the DB to be reachable. */
  readonly inAppAvailable: true;

  // --- Derived convenience fields ---
  /** VAPID subject (mailto: URI). Derived from smtp.fromAddress if available, else default. */
  readonly vapidSubject: string;
}
```

### Snapshot Sub-Types

These are plain readonly interfaces — NOT Prisma model types. They carry only the columns channels actually read.

```typescript
/**
 * Snapshot of an active SmtpConfig row. Contains only the fields needed
 * by EmailChannel.dispatch() and the VAPID subject derivation.
 */
export interface SmtpConfigSnapshot {
  readonly id: string;
  readonly host: string;
  readonly port: number;
  readonly username: string;
  /** AES-encrypted password — decrypted at send time inside EmailChannel. */
  readonly password: string;
  /** IV for AES decryption of password. */
  readonly iv: string;
  readonly fromAddress: string;
  readonly tlsRequired: boolean;
}

/**
 * Snapshot of a VapidConfig row. Contains fields needed by PushChannel.dispatch().
 */
export interface VapidConfigSnapshot {
  readonly publicKey: string;
  /** AES-encrypted private key — decrypted at send time inside PushChannel. */
  readonly privateKey: string;
  /** IV for AES decryption of privateKey. */
  readonly iv: string;
}

/**
 * Snapshot of a WebPushSubscription row. Contains fields needed by PushChannel.dispatch().
 */
export interface PushSubscriptionSnapshot {
  readonly id: string;
  readonly endpoint: string;
  /** AES-encrypted p256dh key. */
  readonly p256dh: string;
  /** AES-encrypted auth key. */
  readonly auth: string;
  /** IV for AES decryption (format: "ivP256dh|ivAuth"). */
  readonly iv: string;
}

/**
 * Snapshot of an active WebhookEndpoint row. Contains fields needed by WebhookChannel.dispatch().
 */
export interface WebhookEndpointSnapshot {
  readonly id: string;
  readonly url: string;
  /** AES-encrypted HMAC secret. */
  readonly secret: string;
  /** IV for AES decryption of secret. */
  readonly iv: string;
  /** JSON-serialized array of NotificationType values. */
  readonly events: string;
  readonly failureCount: number;
}
```

---

## 3. buildDispatchContext() — The 6 Parallel Queries

```typescript
import prisma from "@/lib/db";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  type NotificationPreferences,
} from "@/models/notification.model";
import type { UserSettingsData } from "@/models/userSettings.model";

const DEFAULT_VAPID_SUBJECT = "mailto:noreply@jobsync.local";

export async function buildDispatchContext(
  userId: string,
): Promise<DispatchContext> {
  const [settingsRow, userRow, smtpRow, vapidRow, subRows, webhookRows] =
    await Promise.all([
      // Query 1: UserSettings (preferences + locale)
      prisma.userSettings.findUnique({
        where: { userId },
        select: { settings: true },
      }),

      // Query 2: User (email for EmailChannel recipient)
      prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
      }),

      // Query 3: SmtpConfig (email dispatch + VAPID subject derivation)
      prisma.smtpConfig.findFirst({
        where: { userId, active: true },
        select: {
          id: true,
          host: true,
          port: true,
          username: true,
          password: true,
          iv: true,
          fromAddress: true,
          tlsRequired: true,
        },
      }),

      // Query 4: VapidConfig (push dispatch)
      prisma.vapidConfig.findUnique({
        where: { userId },
        select: {
          publicKey: true,
          privateKey: true,
          iv: true,
        },
      }),

      // Query 5: WebPushSubscription (push dispatch)
      prisma.webPushSubscription.findMany({
        where: { userId },
        select: {
          id: true,
          endpoint: true,
          p256dh: true,
          auth: true,
          iv: true,
        },
      }),

      // Query 6: WebhookEndpoint (webhook dispatch)
      prisma.webhookEndpoint.findMany({
        where: { userId, active: true },
        select: {
          id: true,
          url: true,
          secret: true,
          iv: true,
          events: true,
          failureCount: true,
        },
      }),
    ]);

  // --- Resolve preferences + locale from UserSettings JSON ---
  let preferences: NotificationPreferences = DEFAULT_NOTIFICATION_PREFERENCES;
  let locale: string = DEFAULT_LOCALE;

  if (settingsRow) {
    try {
      const parsed: UserSettingsData = JSON.parse(settingsRow.settings);
      preferences = parsed.notifications ?? DEFAULT_NOTIFICATION_PREFERENCES;
      const rawLocale = parsed.display?.locale;
      locale =
        rawLocale && isValidLocale(rawLocale) ? rawLocale : DEFAULT_LOCALE;
    } catch {
      // Malformed JSON — use defaults (fail-open)
    }
  }

  // --- Build snapshots ---
  const smtp: SmtpConfigSnapshot | null = smtpRow
    ? {
        id: smtpRow.id,
        host: smtpRow.host,
        port: smtpRow.port,
        username: smtpRow.username,
        password: smtpRow.password,
        iv: smtpRow.iv,
        fromAddress: smtpRow.fromAddress,
        tlsRequired: smtpRow.tlsRequired,
      }
    : null;

  const vapid: VapidConfigSnapshot | null = vapidRow
    ? {
        publicKey: vapidRow.publicKey,
        privateKey: vapidRow.privateKey,
        iv: vapidRow.iv,
      }
    : null;

  // --- Derive VAPID subject ---
  const vapidSubject = smtp?.fromAddress
    ? `mailto:${smtp.fromAddress}`
    : DEFAULT_VAPID_SUBJECT;

  // --- Derive availability flags ---
  const emailAvailable = smtp !== null;
  const pushAvailable = vapid !== null && subRows.length > 0;
  const webhookAvailable = webhookRows.length > 0;

  return {
    userId,
    preferences,
    locale,
    userEmail: userRow?.email ?? null,
    smtp,
    vapid,
    pushSubscriptions: subRows,
    webhookEndpoints: webhookRows,
    emailAvailable,
    pushAvailable,
    webhookAvailable,
    inAppAvailable: true,
    vapidSubject,
  };
}
```

### Select Shape Rationale

Each query uses an explicit `select` to minimize data transfer over the SQLite wire protocol.

| Query | Model | Selected Columns | Excluded Columns (reason) |
|---|---|---|---|
| 1 | UserSettings | `settings` | `id`, `userId`, `createdAt`, `updatedAt` (not needed) |
| 2 | User | `email` | `id`, `name`, `password`, `createdAt` (only email needed) |
| 3 | SmtpConfig | `id`, `host`, `port`, `username`, `password`, `iv`, `fromAddress`, `tlsRequired` | `userId`, `active`, `createdAt`, `updatedAt` (known from where clause / not needed) |
| 4 | VapidConfig | `publicKey`, `privateKey`, `iv` | `id`, `userId`, `createdAt`, `updatedAt` (not needed by send logic) |
| 5 | WebPushSubscription | `id`, `endpoint`, `p256dh`, `auth`, `iv` | `userId`, `expirationTime`, `createdAt`, `updatedAt` (not needed). `id` is needed for stale subscription cleanup on 410. |
| 6 | WebhookEndpoint | `id`, `url`, `secret`, `iv`, `events`, `failureCount` | `userId`, `active`, `createdAt`, `updatedAt` (known / not needed). `id` + `failureCount` needed for failure count update + auto-deactivation. |

---

## 4. Channel Availability Derivation

The current architecture has each channel implement `isAvailable(userId): Promise<boolean>` as a separate DB query, cached for 30 seconds by the ChannelRouter. With DispatchContext, availability is derived from the pre-fetched data with zero additional I/O.

### Before (current)

```
ChannelRouter.route()
  for each channel:
    checkAvailabilityCached(channel, userId)   // DB query on cache miss
      channel.isAvailable(userId)              // 1-2 Prisma queries per channel
    if available:
      channel.dispatch(draft, userId)          // 2-5 more Prisma queries
```

### After (with DispatchContext)

```
buildDispatchContext(userId)                   // 6 parallel queries, once
ChannelRouter.route(draft, ctx)
  for each channel:
    ctx.[channelName]Available                 // boolean field lookup, 0 queries
    if available:
      channel.dispatch(draft, ctx)             // 0 read queries (all data on ctx)
```

### Availability Mapping

| Channel | Current `isAvailable()` implementation | DispatchContext derivation |
|---|---|---|
| InApp | `return true` | `ctx.inAppAvailable` (always `true`) |
| Webhook | `webhookEndpoint.count({ userId, active: true }) > 0` | `ctx.webhookEndpoints.length > 0` |
| Email | `smtpConfig.count({ userId, active: true }) > 0` | `ctx.smtp !== null` |
| Push | `vapidConfig.findUnique({ userId }) !== null && webPushSubscription.count({ userId }) > 0` | `ctx.vapid !== null && ctx.pushSubscriptions.length > 0` |

### Impact on the isAvailable Cache

The 30-second `availabilityCache` in `ChannelRouter` becomes **unnecessary** for the dispatch path because availability is derived from the context built at the start of each dispatch. However:

- **Keep the `invalidateAvailability()` API** — it is called by server actions (smtp.actions, webhook.actions, push.actions) when users mutate channel infrastructure. With DispatchContext, each dispatch builds a fresh context anyway, so the invalidation is implicitly handled. The API can be retained as a no-op or removed in a follow-up.
- **Remove `checkAvailabilityCached()`** — the router reads `ctx.emailAvailable` etc. directly.
- **Keep `onSubscriptionPurged` callback** — PushChannel still deletes stale subscriptions during dispatch (410 cleanup). After a deletion, the callback can be retained as a signal to invalidate any external cache layer (or become a no-op if no external cache exists).

---

## 5. Channel Interface Changes

### NotificationChannel Interface Evolution

```typescript
// CURRENT
export interface NotificationChannel {
  readonly name: string;
  dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult>;
  isAvailable(userId: string): Promise<boolean>;
}

// PROPOSED (PERF-3)
export interface NotificationChannel {
  readonly name: string;
  dispatch(notification: NotificationDraft, ctx: DispatchContext): Promise<ChannelResult>;
  isAvailable(ctx: DispatchContext): boolean;  // sync — pure field check
}
```

Key changes:
1. `dispatch` receives `DispatchContext` instead of bare `userId`. Channels read all user data from the context.
2. `isAvailable` becomes **synchronous** — it is a pure field check on the context object.
3. The `userId` parameter is removed from both methods — it lives on `ctx.userId`.

### ChannelRouter.route() Signature Change

```typescript
// CURRENT
async route(draft: NotificationDraft, prefs: NotificationPreferences): Promise<ChannelRouterResult>

// PROPOSED (PERF-3)
async route(draft: NotificationDraft, ctx: DispatchContext): Promise<ChannelRouterResult>
```

The router reads `ctx.preferences` instead of receiving a separate `prefs` parameter.

### Per-Channel Dispatch Changes

#### InAppChannel

No read queries before or after. The only DB interaction is the `notification.create` write, which stays.

```typescript
// dispatch(draft, ctx) — uses ctx.userId only
// isAvailable(ctx) — return true
```

#### WebhookChannel

```typescript
// dispatch(draft, ctx):
//   endpoints = ctx.webhookEndpoints  (was: prisma.webhookEndpoint.findMany)
//   ... filter by event type, decrypt secrets, deliver with retry ...
//   failure helpers use ctx.locale (was: resolveUserLocale query)
//
// isAvailable(ctx):
//   return ctx.webhookAvailable  (was: prisma.webhookEndpoint.count)
```

#### EmailChannel

```typescript
// dispatch(draft, ctx):
//   config = ctx.smtp  (was: prisma.smtpConfig.findFirst)
//   locale = ctx.locale  (was: resolveUserLocale query)
//   recipientEmail = ctx.userEmail  (was: prisma.user.findUnique)
//   ... decrypt password, validate host, render template, send ...
//
// isAvailable(ctx):
//   return ctx.emailAvailable  (was: prisma.smtpConfig.count)
```

#### PushChannel

```typescript
// dispatch(draft, ctx):
//   vapidConfig = ctx.vapid  (was: prisma.vapidConfig.findUnique)
//   subscriptions = ctx.pushSubscriptions  (was: prisma.webPushSubscription.findMany)
//   vapidSubject = ctx.vapidSubject  (was: resolveVapidSubject -> prisma.smtpConfig.findFirst)
//   ... decrypt keys, send to all subscriptions ...
//
// isAvailable(ctx):
//   return ctx.pushAvailable  (was: vapidConfig + subscription count)
```

---

## 6. Write Operations (Unchanged)

These DB writes happen DURING dispatch and are NOT moved into the context. They are mutations triggered by channel-specific logic and must remain in the channel implementations.

| Write | Channel | When | Stays Where |
|---|---|---|---|
| `notification.create(...)` | InApp | Every dispatch | `InAppChannel.dispatch()` |
| `webhookEndpoint.update({ failureCount: { increment: 1 } })` | Webhook | After failed delivery | `WebhookChannel.dispatch()` |
| `webhookEndpoint.update({ failureCount: 0 })` | Webhook | After successful delivery (reset) | `WebhookChannel.dispatch()` |
| `webhookEndpoint.update({ active: false })` | Webhook | Auto-deactivation after 5 failures | `WebhookChannel.dispatch()` |
| `notification.create(...)` | Webhook | Failure/deactivation in-app notification | `notifyDeliveryFailed()` / `notifyEndpointDeactivated()` |
| `webPushSubscription.delete(...)` | Push | Stale subscription cleanup (410/404) | `PushChannel.dispatch()` |

**Important:** The webhook failure notification helpers (`notifyDeliveryFailed`, `notifyEndpointDeactivated`) currently call `resolveUserLocale(userId)` which issues its own `userSettings.findUnique`. After PERF-3, these helpers receive the `DispatchContext` (or at minimum `ctx.locale`) and skip the query.

---

## 7. Dispatcher Integration

### Current Flow

```
Event handler (e.g. handleVacancyPromoted)
  1. resolveUserSettings(userId)                    // query #1
  2. Build NotificationDraft
  3. dispatchNotification(draft, preferences)
       ChannelRouter.route(draft, preferences)
         for each channel:
           channel.isAvailable(userId)              // queries #3, #6, #10a+10b (cached)
           channel.dispatch(draft, userId)          // queries #2, #4, #5, #7, #8, #9, #11, #12, #13
```

### Proposed Flow

```
Event handler (e.g. handleVacancyPromoted)
  1. buildDispatchContext(userId)                    // 6 parallel queries, once
  2. Build NotificationDraft (using ctx.locale for message)
  3. dispatchNotification(draft, ctx)
       ChannelRouter.route(draft, ctx)
         for each channel:
           channel.isAvailable(ctx)                 // 0 queries (sync field check)
           channel.dispatch(draft, ctx)             // 0 read queries (writes only)
```

### dispatchNotification Changes

```typescript
// CURRENT
async function dispatchNotification(
  draft: NotificationDraft,
  preferences?: NotificationPreferences,
): Promise<void> {
  const resolved =
    preferences ?? (await resolveUserSettings(draft.userId)).preferences;
  channelRouter.route(draft, resolved).catch(...);
}

// PROPOSED
async function dispatchNotification(
  draft: NotificationDraft,
  ctx: DispatchContext,
): Promise<void> {
  channelRouter.route(draft, ctx).catch(...);
}
```

### Event Handler Changes (Example)

```typescript
// CURRENT
async function handleVacancyPromoted(event): Promise<void> {
  const { preferences, locale } = await resolveUserSettings(payload.userId);
  const message = t(locale, "notifications.vacancyPromoted");
  await dispatchNotification({ userId, type, message, ... }, preferences);
}

// PROPOSED
async function handleVacancyPromoted(event): Promise<void> {
  const ctx = await buildDispatchContext(payload.userId);
  const message = t(ctx.locale, "notifications.vacancyPromoted");
  await dispatchNotification({ userId, type, message, ... }, ctx);
}
```

The `resolveUserSettings()` and `resolvePreferences()` functions in the dispatcher become unused and can be removed (or retained for the `_testHelpers` export with a deprecation comment).

---

## 8. Edge Cases

### 8.1 UserSettings Does Not Exist

**Current:** `resolveUserSettings` returns `DEFAULT_NOTIFICATION_PREFERENCES` + `DEFAULT_LOCALE`.
**After:** `buildDispatchContext` does the same. `settingsRow` is null, defaults are used. Notifications still dispatch with default preferences (all channels except webhook/email/push).

### 8.2 User Has No SMTP Configuration

**Current:** `EmailChannel.isAvailable()` returns false (count === 0). `EmailChannel.dispatch()` returns early with "No active SMTP configuration".
**After:** `ctx.smtp` is null. `ctx.emailAvailable` is false. Router skips EmailChannel. If somehow called anyway, dispatch checks `ctx.smtp` for null and returns early.

### 8.3 User Has No VAPID Keys

**Current:** `PushChannel.isAvailable()` returns false (vapid is null).
**After:** `ctx.vapid` is null. `ctx.pushAvailable` is false. Router skips PushChannel.

### 8.4 User Has VAPID Keys But No Subscriptions

**Current:** `PushChannel.isAvailable()` returns false (subCount === 0).
**After:** `ctx.pushAvailable` is `ctx.vapid !== null && ctx.pushSubscriptions.length > 0` = false. Router skips PushChannel.

### 8.5 User Has No Webhook Endpoints

**Current:** `WebhookChannel.isAvailable()` returns false (count === 0). `WebhookChannel.dispatch()` returns `{ success: true }` (no endpoints = nothing to deliver = not an error).
**After:** `ctx.webhookAvailable` is false. Router skips WebhookChannel.

### 8.6 User Record Does Not Exist (Deleted Account / Race)

**Current:** `resolveRecipientEmail()` returns null. EmailChannel returns "No recipient email" error.
**After:** `ctx.userEmail` is null. EmailChannel checks and returns same error. Other channels unaffected (they don't need the user's email).

### 8.7 buildDispatchContext() Query Failure (DB Unreachable)

**Current:** Each channel independently catches DB errors and returns `ChannelResult { success: false }`.
**After:** `Promise.all` rejects if ANY of the 6 queries fails. The caller (`dispatchNotification`) wraps the call in try/catch and logs the error. This is a **behavioral change** but the correct one: if we cannot read basic user data, no channel can function, and the fire-and-forget `.catch()` in the dispatcher already handles this path.

**Mitigation:** Wrap `Promise.all` in a try/catch inside `buildDispatchContext` that returns a "degraded context" with all-null channel data and default preferences. This preserves InAppChannel functionality (it only needs userId) even when other queries fail.

```typescript
// Resilient variant — ensures InApp can always fire
try {
  const [...] = await Promise.all([...]);
  // ... build full context
} catch (err) {
  console.error("[buildDispatchContext] Partial failure, degraded context:", err);
  return {
    userId,
    preferences: DEFAULT_NOTIFICATION_PREFERENCES,
    locale: DEFAULT_LOCALE,
    userEmail: null,
    smtp: null,
    vapid: null,
    pushSubscriptions: [],
    webhookEndpoints: [],
    emailAvailable: false,
    pushAvailable: false,
    webhookAvailable: false,
    inAppAvailable: true,
    vapidSubject: DEFAULT_VAPID_SUBJECT,
  };
}
```

### 8.8 Stale Data During Long Dispatch (Webhook Retry)

Webhook delivery retries for up to 36 seconds (3 attempts at 1s + 5s + 30s). During this window, the user could delete a webhook endpoint or change their SMTP config. The context snapshot becomes stale.

**Current behavior is identical:** the current code fetches endpoints once at the start of `WebhookChannel.dispatch()` and iterates over the snapshot. If an endpoint is deleted mid-retry, the `webhookEndpoint.update` for failureCount will fail silently (the `where: { id, userId }` won't match). This is the correct behavior and does not change with DispatchContext.

### 8.9 Webhook Failure Notification Locale

The `notifyDeliveryFailed()` and `notifyEndpointDeactivated()` helpers in `webhook.channel.ts` currently call `resolveUserLocale(userId)` — a redundant query. After PERF-3, they receive `ctx.locale` from the dispatch context, eliminating the query.

### 8.10 flushStagedBuffer() and buildDispatchContext

`flushStagedBuffer()` currently calls `resolveUserSettings()` separately. After PERF-3, it calls `buildDispatchContext(userId)` instead, getting both preferences and locale in the same batch with all channel data.

### 8.11 Enforced Writer Sites (degradation.ts, webhook.channel.ts)

The 5 direct-writer sites in `degradation.ts` (x3) and `webhook.channel.ts` (x2) use `prepareEnforcedNotification()` which internally calls `resolvePreferencesForEnforcer()` — yet another `userSettings.findUnique`. These sites are NOT part of the normal dispatch flow (they write in-app notifications outside the ChannelRouter). They are **out of scope** for PERF-3 — their queries are only triggered on error paths (delivery failure, circuit breaker, auth failure) and are not on the hot path. A follow-up could thread the DispatchContext into these helpers, but the ROI is low.

---

## 9. Query Count Comparison

| Scenario | Before | After |
|---|---|---|
| Dispatch to all 4 channels (cold cache) | 13 queries | 6 reads + 1 write = 7 |
| Dispatch to all 4 channels (warm cache) | 9 queries (3 isAvailable cached) | 6 reads + 1 write = 7 |
| Dispatch to InApp only (user has no other channels) | 3 queries | 6 reads + 1 write = 7 |
| Dispatch to InApp + Email (no webhook/push) | 7 queries | 6 reads + 1 write = 7 |

**Note:** For the "InApp only" case, the new approach issues more queries (6 vs 3) because it speculatively loads all channel data. However, this is offset by:
1. All 6 queries run in parallel (wall-clock time ~ slowest single query, not sum).
2. SQLite in WAL mode handles concurrent reads efficiently.
3. The "InApp only" user who has default preferences is the minority case — most active users will have at least webhook or email configured.

For the "all channels" case, the improvement is substantial: 13 sequential-ish queries reduced to 6 parallel queries, with the wall-clock time dominated by a single round-trip rather than 13.

---

## 10. File Change Map

| File | Change Type | Description |
|---|---|---|
| `src/lib/notifications/types.ts` | Add types | `DispatchContext`, snapshot interfaces |
| `src/lib/notifications/dispatch-context.ts` | **New file** | `buildDispatchContext()` function |
| `src/lib/notifications/channel-router.ts` | Modify | `route()` accepts `DispatchContext`, availability from context, remove `availabilityCache` |
| `src/lib/notifications/channels/in-app.channel.ts` | Modify | `dispatch(draft, ctx)` — trivial (use `ctx.userId`) |
| `src/lib/notifications/channels/webhook.channel.ts` | Modify | `dispatch(draft, ctx)` — read endpoints from `ctx`, locale from `ctx.locale` |
| `src/lib/notifications/channels/email.channel.ts` | Modify | `dispatch(draft, ctx)` — read smtp/email/locale from `ctx` |
| `src/lib/notifications/channels/push.channel.ts` | Modify | `dispatch(draft, ctx)` — read vapid/subs/subject from `ctx` |
| `src/lib/events/consumers/notification-dispatcher.ts` | Modify | Event handlers call `buildDispatchContext()`, remove `resolveUserSettings()` |
| `src/lib/locale-resolver.ts` | No change | Retained for non-dispatch callers (server actions, enforced-writer) |
| `src/lib/push/vapid.ts` | No change | `resolveVapidSubject()` retained for non-dispatch callers |

---

## 11. Migration Strategy

This refactoring should be done in a single atomic commit (or at most 2-3 tightly coupled commits) because the `NotificationChannel` interface change is a breaking contract change that affects all 4 channel implementations simultaneously.

**Suggested order:**
1. Add `DispatchContext` types and `buildDispatchContext()` (additive, no breakage).
2. Update `NotificationChannel` interface + `ChannelRouter.route()` signature.
3. Update all 4 channel implementations to accept `DispatchContext`.
4. Update `notification-dispatcher.ts` event handlers to call `buildDispatchContext()`.
5. Remove `resolveUserSettings()` and `resolvePreferences()` from dispatcher (or deprecate for test helpers).
6. Remove `availabilityCache` from ChannelRouter (or mark as dead code for removal in follow-up).
7. Update all test files to construct/mock `DispatchContext` instead of individual queries.

Step 7 is the largest portion of the work — there are extensive test suites for each channel and the dispatcher that mock individual Prisma calls.
