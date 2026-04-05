# S5a Test Coverage Gap Analysis

**Scope:** S5a session — Webhook Notification Channel, ChannelRouter, shouldNotify, Kanban reorder, Dashboard widgets
**Date:** 2026-04-04
**Analyst:** Test Automation Agent (Claude Sonnet 4.6)
**Method:** Direct source read — all 9 test files and 7 source files read in full

---

## Executive Summary

The S5a test suite is unusually thorough for a first-pass implementation. The `webhook.channel.ts` and `notification.model.ts` tests in particular cover nearly all spec-mandated paths. Four genuine gaps remain — three in the `ChannelRouter` (which has **no unit test file of its own**) and one in `webhook.actions.ts` (the server action layer). The remaining items are minor or low-risk.

**Risk rating key:** HIGH = spec-mandated path untested, MEDIUM = observable regression risk, LOW = nice-to-have

---

## 1. webhook.channel.ts (384 LOC)

### Covered
- HMAC-SHA256 signature correctness and format
- POST headers: Content-Type, X-Webhook-Signature, X-Webhook-Event, User-Agent
- WebhookPayload envelope structure (event, timestamp, data)
- Event-type filtering (endpoint only receives matching events)
- No endpoints → success without fetch
- No matching endpoints → success without fetch
- Failure count reset to 0 on success; skip update when count already 0
- Prisma query shape includes `userId` and `active: true` (IDOR guard)
- SSRF re-validation blocks delivery per endpoint
- SSRF failure on one endpoint does not block others
- 3-attempt retry with fake timers
- Early stop on first success
- In-app notification after retry exhaustion
- Atomic `{ increment: 1 }` update for failureCount (M3)
- Auto-deactivation when `failureCount >= 5`
- Deactivation notification created
- No deactivation when count is below threshold
- `_testHelpers` constants: RETRY_BACKOFFS_MS, MAX_ATTEMPTS, FETCH_TIMEOUT_MS, AUTO_DEACTIVATE_THRESHOLD
- AbortError handled without throw
- `redirect: "manual"` is passed to fetch
- 301, 302, 307 responses treated as failures (triggers retry)
- Concurrent delivery via Promise.allSettled (both endpoints called)
- Prisma failure returns error result without throwing
- Malformed events JSON skips endpoint
- `isAvailable` returns true/false based on active endpoint count
- Multiple endpoints delivered independently

### Gap 1 — `resolveUserLocale` fallback paths not tested [MEDIUM]

**Location:** `webhook.channel.ts` lines 153–162, exposed as `_testHelpers.resolveUserLocale`

`resolveUserLocale` has three paths: (a) no settings row → `"en"`, (b) settings row with `display.locale` set → locale value, (c) JSON parse error or DB error → `"en"`. The tests mock `t()` to return translation strings unconditionally. None of the webhook-channel tests call `_testHelpers.resolveUserLocale` directly.

**Risk:** The locale-aware failure notification text is silently wrong if `resolveUserLocale` regresses. The function is exported via `_testHelpers` so it is directly testable.

**Suggested tests:**
```
_testHelpers.resolveUserLocale — returns "en" when no settings row
_testHelpers.resolveUserLocale — returns locale from display.locale setting
_testHelpers.resolveUserLocale — returns "en" on DB error
_testHelpers.resolveUserLocale — returns "en" on malformed settings JSON
```

### Gap 2 — `notifyDeliveryFailed` and `notifyEndpointDeactivated` locale path not tested [LOW]

The tests for retry exhaustion and auto-deactivation assert on `mockNotificationCreate` call arguments. They do not assert that the message was formed using the resolved locale. The i18n mock in `webhook-channel.spec.ts` returns static strings regardless of locale argument — a regression where `resolveUserLocale` returns `"de"` but `t()` still falls back to `"en"` would not be caught.

**Suggested tests:**
```
notifyDeliveryFailed — uses resolved locale in message template
notifyDeliveryFailed — falls back gracefully when notification.create throws
notifyEndpointDeactivated — falls back gracefully when notification.create throws
```

The last two are "best-effort" paths: the source has `try/catch` with `console.error`. Confirming they do not rethrow is a meaningful contract test. Both helpers are exported via `_testHelpers`.

### Gap 3 — Mixed success/failure across multiple endpoints [MEDIUM]

**Location:** `webhook.channel.ts` lines 326–351 — the `anySuccess || errors.length === 0` aggregation logic

Current multi-endpoint tests cover: both succeed, SSRF failure + success. There is no test for the case where endpoint A succeeds but endpoint B fails (non-SSRF). In that scenario `anySuccess` is `true`, so the channel returns `{ success: true }`. This is intentional but untested.

**Suggested test:**
```
multiple endpoints — returns success when at least one endpoint succeeds even if another fails
```

### Gap 4 — `isAvailable` DB error path [LOW]

`isAvailable` calls `prisma.webhookEndpoint.count`. If Prisma throws, the promise rejects, which the ChannelRouter catches via its `try/catch`. The `isAvailable` method itself has no error handling — it would throw up to the router. This path is untested.

**Suggested test:**
```
isAvailable — throws on Prisma error (router isolates this)
```

---

## 2. channel-router.ts (111 LOC)

### Status: NO UNIT TEST FILE EXISTS

The ChannelRouter class is exercised only indirectly through `notification-dispatcher.spec.ts`, which uses the real `channelRouter` singleton with an `InAppChannel`-backed call path. **There is no `channel-router.spec.ts`.**

This is the most significant gap in the S5a suite.

### Gap 5 — Duplicate registration guard not tested [MEDIUM]

**Location:** `channel-router.ts` lines 39–44

`register()` silently skips duplicate channel names with a `console.warn`. The dispatcher imports ensure the real singleton is only registered once, but this guard is important for correctness in test environments that reset the bus but not the router. No test exercises the warning path.

**Suggested test:**
```
ChannelRouter.register — skips duplicate channel name and warns
ChannelRouter.register — channelCount stays at 1 after duplicate registration
ChannelRouter.channelNames — returns names in registration order
```

### Gap 6 — `route` skips channels based on `shouldNotify` per-channel [HIGH]

**Location:** `channel-router.ts` lines 59–61

The router calls `shouldNotify(prefs, draft.type, channelId)` for each channel. If this returns `false`, the channel is skipped entirely (no `isAvailable` call, no `dispatch` call). This is the critical "inApp disabled but webhook enabled" path mentioned in the CLAUDE.md spec.

The `notification-preferences.spec.ts` tests `shouldNotify` in isolation. The `notification-dispatcher.spec.ts` tests the full dispatcher-to-InApp path with default prefs. **Neither tests the router's per-channel gating in combination** — e.g., inApp disabled, webhook enabled → only webhook is called.

**Suggested tests:**
```
ChannelRouter.route — skips inApp channel when prefs.channels.inApp is false
ChannelRouter.route — skips webhook channel when prefs.channels.webhook is false
ChannelRouter.route — dispatches to webhook when inApp disabled but webhook enabled
ChannelRouter.route — anySuccess is false when all channels are skipped
```

### Gap 7 — `isAvailable` returning false skips dispatch [MEDIUM]

**Location:** `channel-router.ts` lines 64–67

When `channel.isAvailable()` returns `false`, the channel is silently skipped. No test verifies this path in isolation. The WebhookChannel `isAvailable` tests verify the return value but not that the router acts on it.

**Suggested tests:**
```
ChannelRouter.route — does not call dispatch when isAvailable returns false
ChannelRouter.route — anySuccess is false when isAvailable returns false for all channels
```

### Gap 8 — Error isolation: channel throws → other channels still run [HIGH]

**Location:** `channel-router.ts` lines 73–78

The `try/catch` around each channel dispatch ensures one channel throwing does not block subsequent channels. This is stated as a design goal in the file header and is critical for reliability. It is never tested.

**Suggested tests:**
```
ChannelRouter.route — catches thrown error from channel A, still dispatches to channel B
ChannelRouter.route — returns error ChannelResult for the throwing channel
ChannelRouter.route — anySuccess reflects channel B's result when channel A throws
```

### Gap 9 — `anySuccess` computed correctly [MEDIUM]

**Location:** `channel-router.ts` line 82

`anySuccess: results.some((r) => r.success)` is computed over the results array. No test verifies this computation directly with multiple channels in mixed success/failure states.

---

## 3. in-app.channel.ts

### Covered (via notification-dispatcher.spec.ts)
- Creates Prisma notification record with correct shape for all event types
- Optional fields `moduleId` and `automationId` are conditionally included (via dispatcher test shapes)

### Gap 10 — `dispatch` error path not tested directly [LOW]

**Location:** `in-app.channel.ts` lines 28–33

`dispatch` has a `try/catch` that returns `{ success: false, channel: "inApp", error }` without throwing. No test exercises this path by making `prisma.notification.create` reject inside `InAppChannel.dispatch` specifically. The `notification-dispatcher.spec.ts` "Error isolation" test makes `mockCreate` reject at the dispatcher level — but that tests dispatcher crash isolation, not the InAppChannel's own error return contract.

**Suggested test:**
```
InAppChannel.dispatch — returns { success: false } when prisma.create throws
InAppChannel.isAvailable — always returns true (trivial but documents the contract)
```

---

## 4. url-validation.ts (validateWebhookUrl section)

### Covered
All 35+ test cases in `webhook-ssrf.spec.ts` provide comprehensive coverage of the implemented IP ranges, protocols, credential embeds, and IPv6 mapping paths.

### Gap 11 — `validateWebhookUrl` called recursively for IPv4-mapped detection [LOW]

**Location:** `url-validation.ts` line 126

The recursive self-call `validateWebhookUrl("http://${mappedIpv4}/")` is the mechanism for IPv4-mapped IPv6 blocking. The existing tests verify the output, but there are no tests for public IPv4-mapped addresses (e.g., `::ffff:203.0.113.1`) with port numbers, or for malformed hex pairs that would cause `parseInt` to produce `NaN`. The test for `::ffff:8.8.8.8` covers the valid public case; no test exercises a malformed hex pair like `::ffff:gggg:0001`.

**Risk:** Malformed input would produce `NaN` in the inner arithmetic, causing the recursive validation to receive `NaN.NaN.NaN.NaN` as the IPv4, which would not match any block regex and would pass as valid — a potential bypass. LOW risk because the URL parser rejects most such inputs before they reach this code.

---

## 5. webhook.actions.ts

### Covered (via WebhookSettings.spec.tsx — UI level only)
- `listWebhookEndpoints` called on mount, retry on failure
- `createWebhookEndpoint` called with URL and selected events
- `updateWebhookEndpoint` called for active toggle
- `deleteWebhookEndpoint` called after confirmation

### Gap 12 — No unit tests for server action validation logic [HIGH]

`webhook.actions.ts` contains substantial validation logic that is never unit-tested at the action level:

- `validateEvents()` — rejects empty array, rejects unknown event types
- Max endpoints limit check (`count >= MAX_ENDPOINTS_PER_USER`)
- `updateWebhookEndpoint` URL re-validation when URL changes
- `updateWebhookEndpoint` failure count reset when re-activating (`active: true`)
- `toDTO()` — JSON parse failure falls back to empty events array
- `getWebhookEndpoint` — NOT_FOUND when endpoint belongs to another user (IDOR check)
- `updateWebhookEndpoint` — NOT_FOUND path (IDOR guard)
- `deleteWebhookEndpoint` — NOT_FOUND path (IDOR guard)
- Unauthenticated access (`getCurrentUser()` returns null) for all 5 actions

**Risk:** The IDOR ownership checks (ADR-015) and the endpoint limit enforcement are never verified by any test. The UI-level mock bypasses all server action logic. This is the highest-risk gap in the suite.

**Suggested tests (new file: `__tests__/webhook-actions.spec.ts`):**
```
createWebhookEndpoint — returns unauthorized when no session
createWebhookEndpoint — returns error for SSRF URL
createWebhookEndpoint — returns error for empty events array
createWebhookEndpoint — returns error for unknown event type
createWebhookEndpoint — returns error when endpoint limit is reached (count >= 10)
createWebhookEndpoint — creates endpoint and returns plaintext secret once
listWebhookEndpoints — returns empty array for user with no endpoints
listWebhookEndpoints — does not return endpoints belonging to other users
getWebhookEndpoint — returns NOT_FOUND for endpoint belonging to another user (IDOR)
updateWebhookEndpoint — returns NOT_FOUND for endpoint belonging to another user (IDOR)
updateWebhookEndpoint — re-validates URL with SSRF check when URL changes
updateWebhookEndpoint — resets failureCount to 0 when re-activating
deleteWebhookEndpoint — returns NOT_FOUND for endpoint belonging to another user (IDOR)
toDTO — handles malformed events JSON by returning empty array
maskSecret — returns "whsec_****" for secrets shorter than 10 characters
```

---

## 6. notification.model.ts (shouldNotify changes)

### Covered
All major paths in `shouldNotify` are tested in `notification-preferences.spec.ts`:
- Global kill switch
- All channels disabled
- Specific channel gating
- Any-channel-enabled fallback
- Per-type override (enabled/disabled)
- Quiet hours: overnight range, same-day range, disabled flag, invalid timezone

### Gap 13 — webhook channel explicitly enabled, shouldNotify returns true [LOW]

The test at line 88 verifies `shouldNotify` returns `true` when `inApp: false, webhook: true` with no channel specified (any-channel-enabled path). No test calls `shouldNotify(prefs, type, "webhook")` with `webhook: true` explicitly to verify the channel-specific path. This is logically covered by the structure of the function but has no direct assertion.

**Suggested test:**
```
shouldNotify — returns true when webhook channel is explicitly enabled and requested
```

---

## 7. notification-dispatcher.ts (ChannelRouter integration)

### Covered
- VacancyStaged buffering: no immediate notification, batch after flush
- Manual staging (no automationId) is ignored
- Buffer cleared after flush
- All 5 event types (VacancyPromoted, BulkActionCompleted, RetentionCompleted, ModuleDeactivated, ModuleReactivated) create InApp notifications via the real InAppChannel
- `resolvePreferences` returns defaults, stored prefs, or defaults on error
- `flushStagedBuffer` respects global and per-type preference gates

### Gap 14 — Dispatcher does not test webhook channel path end-to-end [MEDIUM]

The dispatcher tests use the real `channelRouter` singleton with real channel instances, but `mockFindMany` always returns `[]` (no webhook endpoints), and `mockCount` returns `0`. This means `WebhookChannel.isAvailable` always returns `false`, so the webhook path is never exercised at the dispatcher integration level.

**Risk:** If the dispatcher's channel registration call order changes, or if a future code path bypasses the router, the webhook dispatch path would be silently skipped with no test failure.

**Suggested tests:**
```
NotificationDispatcher — routes to WebhookChannel when endpoint is active and subscribed
NotificationDispatcher — respects webhook channel preference gate
```

### Gap 15 — VacancyStaged timer reset on second event not tested [LOW]

The `handleVacancyStaged` handler resets the flush timer when a second event arrives for the same `automationId` (line 137–140). The test verifies that 3 events accumulate to `count: 3`, but does not verify that the timer was reset (i.e., that `clearTimeout` was called and a new timer was set). This edge case matters for the debounce behavior.

---

## 8. kanban-reorder.spec.ts (computeSortOrder)

Full analysis: the 22 test cases cover the complete bidirectional sort strategy including edge cases (zero sortOrders, fractional values, large numbers, negative insertion, all-zero columns). **No gaps identified.** The coverage is exemplary for a pure utility function.

---

## 9. StatusFunnelWidget.spec.tsx and StatusHistoryTimeline.spec.tsx

Both widgets have thorough coverage of loading, empty, error, retry, and data states. The Timeline additionally covers the paginated "Show all / Show less" toggle with exact item counts.

### Minor gap — StatusFunnelWidget biggest drop-off when multiple stages have equal drops [LOW]

The test at line 378 verifies that `icon-trending-down` appears when bookmarked→applied is the largest drop. No test verifies behavior when two stages have equal drop sizes (tie-breaking), or when all stages have equal drop (no highlighting expected vs. first-stage highlighted).

---

## Summary Table

| # | Gap | Source File | Risk | Test File Needed |
|---|-----|-------------|------|-----------------|
| 1 | `resolveUserLocale` fallback paths | webhook.channel.ts | MEDIUM | webhook-channel.spec.ts |
| 2 | `notifyDeliveryFailed` / `notifyEndpointDeactivated` locale + error path | webhook.channel.ts | LOW | webhook-channel.spec.ts |
| 3 | Mixed endpoint success/failure aggregation | webhook.channel.ts | MEDIUM | webhook-channel.spec.ts |
| 4 | `isAvailable` Prisma error path | webhook.channel.ts | LOW | webhook-channel.spec.ts |
| **5** | **ChannelRouter duplicate registration guard** | **channel-router.ts** | **MEDIUM** | **channel-router.spec.ts (NEW)** |
| **6** | **ChannelRouter per-channel shouldNotify gating** | **channel-router.ts** | **HIGH** | **channel-router.spec.ts (NEW)** |
| **7** | **ChannelRouter isAvailable=false skips dispatch** | **channel-router.ts** | **MEDIUM** | **channel-router.spec.ts (NEW)** |
| **8** | **ChannelRouter error isolation across channels** | **channel-router.ts** | **HIGH** | **channel-router.spec.ts (NEW)** |
| 9 | ChannelRouter anySuccess computation | channel-router.ts | MEDIUM | channel-router.spec.ts (NEW) |
| 10 | InAppChannel dispatch error return | in-app.channel.ts | LOW | channel-router.spec.ts or inline |
| 11 | IPv4-mapped malformed hex bypass risk | url-validation.ts | LOW | webhook-ssrf.spec.ts |
| **12** | **webhook.actions.ts IDOR + validation logic** | **webhook.actions.ts** | **HIGH** | **webhook-actions.spec.ts (NEW)** |
| 13 | shouldNotify webhook channel explicit | notification.model.ts | LOW | notification-preferences.spec.ts |
| 14 | Dispatcher webhook end-to-end path | notification-dispatcher.ts | MEDIUM | notification-dispatcher.spec.ts |
| 15 | VacancyStaged timer reset verification | notification-dispatcher.ts | LOW | notification-dispatcher.spec.ts |

**HIGH-risk gaps: 3** (gaps 6, 8, 12)
**MEDIUM-risk gaps: 6** (gaps 1, 3, 5, 7, 9, 14)
**LOW-risk gaps: 6** (gaps 2, 4, 10, 11, 13, 15)

---

## Prioritized Action Plan

### Priority 1 — Create `__tests__/channel-router.spec.ts` (gaps 5–10)

`ChannelRouter` is the shared dispatch backbone for all channels. It has 111 LOC and **zero tests**. Gaps 6 and 8 are HIGH severity: the per-channel preference gate and error isolation are the two most important contracts of this class.

Minimum viable test file: mock two channels (mockChannelA, mockChannelB), test `register`, `route` with prefs combinations, `isAvailable` skip, error isolation, `anySuccess` aggregation. No Prisma mock required — all dependencies are injected via the `NotificationChannel` interface.

### Priority 2 — Create `__tests__/webhook-actions.spec.ts` (gap 12)

Server actions with IDOR ownership checks have no unit tests. The ADR-015 guarantee — "all Prisma reads/writes MUST include userId" — cannot be verified by UI-level mocks alone. Mock `@/lib/db`, `@/utils/user.utils`, and `@/lib/encryption` to test validation, limit enforcement, and ownership paths in isolation.

### Priority 3 — Extend `__tests__/webhook-channel.spec.ts` (gaps 1, 3)

Add `_testHelpers.resolveUserLocale` unit tests and a multi-endpoint mixed success/failure test. These can be appended to the existing file without structural changes.

### Priority 4 — Extend `__tests__/notification-dispatcher.spec.ts` (gap 14)

Configure `mockFindMany` to return one active webhook endpoint and `mockCount` to return 1 to exercise the webhook channel path. This verifies the full dispatcher → ChannelRouter → WebhookChannel → Prisma path.
