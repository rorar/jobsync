# S5a Webhook Notification System — Performance Analysis

**Date:** 2026-04-04
**Scope:** Webhook notification delivery, channel routing, EventBus dispatch, SSRF validation, dashboard widgets
**Reviewer:** Performance Engineering Agent

---

## Executive Summary

The S5a webhook delivery system is well-structured for a self-hosted single-user application. Most design choices are sound. Three issues warrant attention before load increases: the EventBus serializes all handlers sequentially (making webhook retry latency directly visible to the caller), per-failure DB write volume is higher than necessary, and `resolveUserLocale` is called redundantly on every failed delivery. The dashboard widgets (`StatusFunnelWidget`, `StatusHistoryTimeline`) have acceptable query patterns but one missing server-side limit creates an unbounded data fetch.

---

## Finding 1 — EventBus Blocks on Full Webhook Retry Duration

**Impact:** Critical — up to 36s worst-case hold on the EventBus dispatch loop

**Location:** `/home/pascal/projekte/jobsync/src/lib/events/event-bus.ts` lines 22–37, `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts` lines 53–85

**Issue:**

The EventBus `publish()` method awaits every handler in a sequential `for...of` loop. The `NotificationDispatcher` handler calls `channelRouter.route()`, which itself awaits each channel in a sequential `for...of` loop. The `WebhookChannel.dispatch()` delivers to all endpoints concurrently via `Promise.allSettled`, but the internal per-endpoint retry loop is entirely sequential with blocking `await delay()`.

Worst-case timing for a single notification with 10 endpoints all failing all 3 attempts:

```
Per endpoint:
  Attempt 1: 10s timeout + 1s backoff  = 11s
  Attempt 2: 10s timeout + 5s backoff  = 15s
  Attempt 3: 10s timeout (no backoff)  = 10s
  Total per endpoint: 36s

With Promise.allSettled (all 10 in parallel): still 36s wall-clock
```

The entire 36s is held inside the EventBus `publish()` await. Any other event published while this is running will queue behind it if the caller awaits publish. Whether this matters depends on where `publish()` is called from:

- If called from a background scheduler run, 36s delays the next scheduling decision but does not block a user-facing request.
- If called from a Server Action (e.g., bulk action completing), the Server Action hangs for 36s from the user's perspective.

The VacancyStaged flush timer (`setTimeout → flushStagedBuffer`) fires asynchronously and is not in the hot path — that is fine. The concern applies to all direct `eventBus.publish()` calls that originate in synchronous Server Action boundaries.

**Fix (fire-and-forget delivery):**

The EventBus handler for notifications should detach delivery from the publishing callsite using an unhandled promise. Error isolation is preserved by the existing try/catch inside the dispatcher.

In `notification-dispatcher.ts`, change `dispatchNotification` to return void without awaiting the channel route when the caller does not need the result:

```typescript
// In event handlers that do not need delivery confirmation:
async function handleVacancyPromoted(event) {
  const draft = { ... };
  // Fire and forget — delivery errors are caught inside dispatchNotification
  dispatchNotification(draft).catch((err) =>
    console.error("[NotificationDispatcher] Unhandled delivery error:", err)
  );
}
```

Alternatively, make the EventBus itself support a `publishAsync` mode that does not await handlers — though that changes the global contract. The per-handler fire-and-forget approach is more surgical.

**Tradeoff:** Delivery failures are no longer propagated back to the event publisher. For notification delivery this is intentional (best-effort semantics), so there is no real loss. Unit tests that await `dispatchNotification` directly are unaffected.

---

## Finding 2 — Retry Backoff Is Correctly Non-Blocking (No Issue)

**Impact:** None — confirmed correct

**Location:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` lines 57–59

**Issue:** N/A — the `delay()` helper uses `setTimeout` wrapped in a Promise, which is the correct non-blocking pattern within an async chain:

```typescript
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
```

`setTimeout` yields the JS event loop while waiting; no thread is blocked. The async chain itself suspends on `await delay(...)`, but the Node.js event loop remains free to process other I/O. This is correct and does not need to change.

The only concern is the cumulative wall-clock time of the retry sequence as described in Finding 1.

---

## Finding 3 — Redundant `resolveUserLocale` DB Reads on Every Failed Delivery

**Impact:** High — up to 30 redundant DB reads per worst-case notification event

**Location:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` lines 153–162, 167–213

**Issue:**

On every delivery failure, two `notifyDeliveryFailed` / `notifyEndpointDeactivated` calls each trigger `resolveUserLocale(userId)`, which does a `prisma.userSettings.findUnique`. With 10 endpoints all failing, this is:

- 10 × `notifyDeliveryFailed` calls → 10 × DB reads for locale
- Up to 10 × `notifyEndpointDeactivated` calls (if all hit threshold) → 10 × DB reads for locale

The locale for a given userId does not change during a single dispatch cycle. The `dispatch()` method already has `userId` in scope — it should resolve the locale once at the top of dispatch and pass it down.

Additionally, the `resolveUserLocale` function in `webhook.channel.ts` is a duplicate of locale resolution logic already in `notification-dispatcher.ts` (`resolvePreferences`). Both query `UserSettings` separately.

**Fix:**

Resolve locale once at the top of `WebhookChannel.dispatch()` and pass it to the notification helpers:

```typescript
async dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult> {
  // Resolve locale once for all failure notifications in this dispatch cycle
  const locale = await resolveUserLocale(userId);

  // ... existing endpoint fetch and loop ...

  // Pass locale to helpers instead of re-resolving:
  await notifyDeliveryFailed(userId, endpoint.url, notification.type, locale);
  await notifyEndpointDeactivated(userId, endpoint.url, locale);
}
```

Update `notifyDeliveryFailed` and `notifyEndpointDeactivated` to accept a pre-resolved `locale: string` parameter instead of calling `resolveUserLocale` internally.

**Tradeoff:** Minor code change, no correctness concern. Locale is stable within a single notification dispatch.

---

## Finding 4 — DB Write Volume on Retry Exhaustion Is Acceptable But Suboptimal

**Impact:** Medium — up to 30 writes per notification event at max scale

**Location:** `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` lines 304–319

**Issue:**

When delivery fails for an endpoint, the following writes occur per failed endpoint:
1. `prisma.webhookEndpoint.update` — atomic `failureCount` increment (correct, prevents race)
2. `prisma.notification.create` — in-app failure notification
3. Optionally: second `prisma.webhookEndpoint.update` — deactivate + `prisma.notification.create` — deactivation notification

With 10 endpoints all exhausting retries, this produces: 10 + 10 + (0–10) + (0–10) = 20–40 individual DB writes. For SQLite on a self-hosted instance with a single user, 40 sequential writes is measurable but not a bottleneck (SQLite can handle thousands of writes/second on NVMe). This becomes relevant only if the user base scales to multiple concurrent users with high-frequency events.

The more actionable concern is that `notifyDeliveryFailed` and `notifyEndpointDeactivated` each first call `resolveUserLocale` (addressed in Finding 3), then call `prisma.notification.create`. If locale resolution is batched as in Finding 3, the DB touch count remains but the extra round-trips are eliminated.

For the current single-user self-hosted use case, this is acceptable. Document it as a future optimization if multi-tenant hosting is introduced.

**Fix (future, if multi-tenant):** Batch the failure notifications into a single `prisma.notification.createMany` call after the `Promise.allSettled` settles. This would require collecting failure context across all endpoints before writing.

**Tradeoff:** Batching complicates the per-endpoint logic. Defer until multi-tenant scaling is needed.

---

## Finding 5 — `isAvailable` Makes a Redundant DB Count Before `dispatch` Reads Endpoints

**Impact:** Medium — 1 extra DB query per notification event per channel

**Location:** `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts` lines 64–66, `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` lines 360–366

**Issue:**

`ChannelRouter.route()` calls `channel.isAvailable(draft.userId)` before `channel.dispatch()`. For `WebhookChannel`, `isAvailable` does a `prisma.webhookEndpoint.count` query. Then `dispatch()` immediately does a `prisma.webhookEndpoint.findMany` for the same user. This means two DB queries when there is at least one active endpoint — both reading from the same table for the same user.

```typescript
// isAvailable — query 1:
const count = await prisma.webhookEndpoint.count({ where: { userId, active: true } });

// dispatch — query 2 (always immediately follows if count > 0):
const endpoints = await prisma.webhookEndpoint.findMany({ where: { userId, active: true }, ... });
```

For SQLite with a 10-row `WebhookEndpoint` table per user, the absolute cost is low. But the pattern is architecturally wasteful.

**Fix:**

Option A (preferred): Remove `isAvailable` from the router loop and let `dispatch` handle the empty-endpoint case itself (it already returns `{ success: true }` when `endpoints.length === 0`). Remove `isAvailable` from the `NotificationChannel` interface entirely or make it optional.

Option B: Cache the `findMany` result inside `dispatch` and expose it so `isAvailable` can reuse it via a shared context object passed to both calls. This is more complex and not warranted for the current scale.

**Tradeoff:** Removing `isAvailable` reduces the abstraction's expressiveness slightly. The `InAppChannel.isAvailable` checks `shouldNotify` which is a pure function and has no DB cost — so removing `isAvailable` for just `WebhookChannel` is asymmetric. The cleanest solution is Option A with `isAvailable` becoming a synchronous no-op that always returns `true`, delegating the "is there anything to dispatch?" check entirely into `dispatch`.

---

## Finding 6 — SSRF Regex Patterns Have No ReDoS Risk

**Impact:** None — confirmed safe

**Location:** `/home/pascal/projekte/jobsync/src/lib/url-validation.ts` lines 75–102

**Issue:** N/A — all regexes used in `validateWebhookUrl` are anchored and use only simple character classes and alternation with no nested quantifiers. None of them can exhibit catastrophic backtracking:

- `/^127\./` — anchored prefix, O(1)
- `/^169\.254\./` — anchored prefix, O(1)
- `/^10\./` — anchored prefix, O(1)
- `/^172\.(1[6-9]|2\d|3[01])\./` — anchored, bounded alternation, O(1)
- `/^192\.168\./` — anchored prefix, O(1)
- `/^f[cd]/i` — anchored 2-char check, O(1)
- `/^fe[89ab]/i` — anchored 2-char check, O(1)
- `/^::ffff:(\d{1,3}\.\d{1,3}...)/i` — anchored with bounded `{1,3}` quantifiers, O(1)
- `/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i` — anchored with bounded quantifiers, O(1)

The recursive call `validateWebhookUrl(`http://${mappedIpv4}/`)` for IPv4-mapped IPv6 addresses adds one extra call frame but the recursion depth is exactly 1 (the inner call cannot produce another IPv4-mapped address). No ReDoS risk exists.

The `new URL(url)` parse at the top handles malformed inputs before any regex is applied, providing a natural first-line defense against pathological strings.

---

## Finding 7 — `ChannelRouter.route()` Dispatches Channels Sequentially

**Impact:** Medium — adds InApp channel latency in front of webhook latency

**Location:** `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts` lines 56–79

**Issue:**

Channels are dispatched with `for...of` + `await`, meaning channels execute sequentially. `InAppChannel` (which does a `prisma.notification.create`) must complete before `WebhookChannel.dispatch()` starts. For the current two-channel setup this adds a few milliseconds. With future Email (D2) and Push (D3) channels that may have their own network I/O, sequential dispatch compounds latency.

**Fix:**

Replace sequential dispatch with `Promise.allSettled` for channels that are independent:

```typescript
async route(draft, prefs): Promise<ChannelRouterResult> {
  const dispatches = this.channels
    .filter((channel) => {
      const channelId = channel.name as NotificationChannelId;
      return shouldNotify(prefs, draft.type, channelId);
    })
    .map(async (channel) => {
      try {
        const available = await channel.isAvailable(draft.userId);
        if (!available) return null;
        return await channel.dispatch(draft, draft.userId);
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Unknown error";
        console.error(`[ChannelRouter] Channel "${channel.name}" threw:`, error);
        return { success: false, channel: channel.name, error: msg } as ChannelResult;
      }
    });

  const settled = await Promise.allSettled(dispatches);
  const results = settled
    .filter((r): r is PromiseFulfilledResult<ChannelResult | null> => r.status === "fulfilled")
    .map((r) => r.value)
    .filter((r): r is ChannelResult => r !== null);

  return { anySuccess: results.some((r) => r.success), results };
}
```

**Tradeoff:** Channel ordering guarantees are lost. For notification delivery (where channels are independent by design) this is not a correctness concern. Tests that assert specific delivery order would need updating.

---

## Finding 8 — `StatusHistoryTimeline` Fetches All Rows Unbounded Server-Side

**Impact:** Low — unbounded query fetch, display-layer truncation only

**Location:** `/home/pascal/projekte/jobsync/src/actions/job.actions.ts` lines 1044–1051, `/home/pascal/projekte/jobsync/src/components/crm/StatusHistoryTimeline.tsx` line 20

**Issue:**

`getJobStatusHistory` fetches all `JobStatusHistory` rows for a job with no `take` limit. For a long-lived job with 200+ status transitions, the full dataset is transferred to the component, which then slices to `DEFAULT_VISIBLE_LIMIT = 20` for initial display.

The SQLite query itself is efficient — the `@@index([jobId, changedAt])` index covers the `where { jobId, userId }` + `orderBy { changedAt: "asc" }` access pattern. The overhead is in serialization and network transfer of the full result set.

At 200 rows with ~5 fields each, the serialized payload is approximately 20–40KB — not harmful, but unnecessary given that the UI never renders more than 20 rows without an explicit user action.

**Fix:**

Apply a server-side `take` with a generous limit and return a `hasMore` flag:

```typescript
const HISTORY_FETCH_LIMIT = 100;

const history = await prisma.jobStatusHistory.findMany({
  where: { jobId, userId: user.id },
  include: { ... },
  orderBy: { changedAt: "asc" },
  take: HISTORY_FETCH_LIMIT,
});
```

If "Show all" is clicked, a second fetch with `skip` retrieves the remainder. This is only worth implementing if user testing shows jobs routinely exceeding 100 status transitions, which is unlikely in practice.

**Tradeoff:** Requires a pagination API if > 100 entries must be shown. For typical usage (fewer than 20 transitions per job) this finding is low priority.

---

## Finding 9 — `getStatusDistribution` Issues Two Sequential Queries (N+1-adjacent)

**Impact:** Low — two queries where one would suffice

**Location:** `/home/pascal/projekte/jobsync/src/actions/job.actions.ts` lines 1082–1090

**Issue:**

```typescript
const jobs = await prisma.job.groupBy({
  by: ["statusId"],
  where: { userId: user.id },
  _count: { id: true },
});

const allStatuses = await prisma.jobStatus.findMany();  // unbounded, no userId filter
```

The `groupBy` aggregation is correct and O(log n) via the `@@index([userId, statusId, sortOrder])` index. The follow-up `findMany` on `JobStatus` fetches all statuses regardless of whether they appear in the user's data. `JobStatus` is a small lookup table (typically 10–15 rows), so this is not a performance problem.

However, `prisma.jobStatus.findMany()` has no `where` clause, making it a full table scan. While the table is small and SQLite caches it in memory after the first access, a future migration that adds many more status types could make this more expensive.

**Fix:**

Scope the status fetch to only the IDs returned by the `groupBy`:

```typescript
const statusIds = jobs.map((g) => g.statusId);
const statuses = await prisma.jobStatus.findMany({
  where: { id: { in: statusIds } },
});
```

Alternatively, Prisma's `groupBy` with `_count` does not support `include`, so the two-query pattern is unavoidable with the current ORM. The scoped `where: { id: { in: statusIds } }` is strictly better.

**Tradeoff:** None. This is a pure improvement.

---

## Finding 10 — `updateWebhookEndpoint` Uses Read-then-Write Pattern (No Atomic Update)

**Impact:** Low — theoretical TOCTOU race, negligible in single-user context

**Location:** `/home/pascal/projekte/jobsync/src/actions/webhook.actions.ts` lines 230–267

**Issue:**

`updateWebhookEndpoint` first does `findFirst` to verify ownership, then does `updateMany` with the same `{ id, userId }` condition. This is the correct IDOR-safe pattern (ADR-015) because Prisma does not support compound unique constraints on `[id, userId]` without a `@@unique` declaration.

In a multi-user concurrent environment there is a TOCTOU window between the `findFirst` and `updateMany`, but for SQLite this is effectively serialized by the WAL lock. No fix needed.

---

## Performance Summary

| # | Finding | Impact | Priority |
|---|---------|--------|----------|
| 1 | EventBus blocks caller for full retry duration (up to 36s) | Critical | P1 |
| 3 | Redundant `resolveUserLocale` DB reads per failed delivery | High | P2 |
| 7 | Sequential channel dispatch in ChannelRouter | Medium | P3 |
| 5 | `isAvailable` + `dispatch` both query the same table | Medium | P4 |
| 4 | DB write volume on retry exhaustion | Medium | P5 |
| 8 | `StatusHistoryTimeline` fetches unbounded rows | Low | P6 |
| 9 | `getStatusDistribution` fetches all statuses unscoped | Low | P7 |
| 2 | Retry backoff delay implementation | None | No action |
| 6 | SSRF regex ReDoS risk | None | No action |
| 10 | Read-then-write in updateWebhookEndpoint | None | No action |

---

## Top 3 Priority Optimizations

**P1 — Fire-and-forget webhook delivery from EventBus handlers**

Apply `.catch()` to `dispatchNotification()` calls inside event handlers. This decouples webhook retry latency (up to 36s worst-case) from the EventBus dispatch loop and any Server Action that triggered the event. This is the single highest-impact change: it converts a potential 36s user-visible hang into a background operation.

Files: `/home/pascal/projekte/jobsync/src/lib/events/consumers/notification-dispatcher.ts`

**P2 — Hoist `resolveUserLocale` to dispatch scope**

Resolve locale once at the top of `WebhookChannel.dispatch()` and pass it to `notifyDeliveryFailed` / `notifyEndpointDeactivated`. Eliminates up to 30 redundant `UserSettings` DB reads in the worst-case delivery failure scenario.

Files: `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts`

**P3 — Parallel channel dispatch in ChannelRouter**

Replace the sequential `for...of` loop with `Promise.allSettled` across all channels. Makes the router O(max channel latency) instead of O(sum of channel latencies). This becomes more important as Email (D2) and Push (D3) channels are added.

Files: `/home/pascal/projekte/jobsync/src/lib/notifications/channel-router.ts`

---

## Recommended SLOs for the Webhook Notification Feature

| Metric | Target | Rationale |
|--------|--------|-----------|
| Notification dispatch latency (P50) | < 50ms | InApp channel only, no webhook failures |
| Notification dispatch latency (P99, webhook success) | < 500ms | Single endpoint, single attempt, 10s timeout |
| Webhook retry total duration (worst-case, all fail) | 36s (background) | Must not block caller after P1 fix |
| `getStatusDistribution` query | < 20ms | Covered by index on `[userId, statusId, sortOrder]` |
| `getJobStatusHistory` query (< 100 rows) | < 10ms | Covered by `[jobId, changedAt]` index |
| DB writes per notification (10 endpoints, all fail) | <= 40 | Acceptable for self-hosted SQLite |
| `validateWebhookUrl` execution time | < 1ms | All regexes are O(1); URL parse is bounded |

---

## Notes on Scale Assumptions

This analysis assumes the documented constraint of max 10 active webhook endpoints per user and a self-hosted single-user SQLite deployment. If multi-tenant hosting is introduced:

- Finding 4 (DB write volume) becomes a P1: batch `notification.createMany` to avoid N writes per event.
- Finding 5 (double query on isAvailable/dispatch) becomes more expensive and the `isAvailable` abstraction should be removed.
- The in-memory `stagedBuffers` Map in the dispatcher becomes a shared-state problem across multiple Node.js instances; it would need to move to Redis or a persistent queue.
- The in-memory `ChannelRouter` singleton works correctly in single-process Next.js but would need evaluation under a multi-process deployment (PM2 cluster mode).
