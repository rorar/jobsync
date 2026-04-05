# ADR-026: Multi-Channel Notification Architecture via ChannelRouter

**Date:** 2026-04-04
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

JobSync's notification system was originally a hardcoded in-app dispatcher. The `NotificationDispatcher` (an EventBus consumer) mapped domain events to `prisma.notification.create()` calls directly -- every notification was an in-app database record, and no other delivery mechanism existed.

When the Webhook notification channel was introduced (Roadmap 0.6 Phase 2), this design became untenable for three reasons:

1. **Single delivery path**: Adding webhook delivery meant either duplicating the dispatch logic (direct Prisma for in-app + HTTP POST for webhook) or nesting `if/else` branches per channel inside each event handler. Both approaches scale linearly with the number of channels and event types.
2. **Preference coupling**: The `shouldNotify()` function checked whether a notification type was enabled, but had no concept of per-channel gating. A user who disabled in-app notifications for a type would also lose webhook delivery, even though they might want one but not the other.
3. **Future channel expansion**: Email (D2) and browser push (D3) are on the roadmap. A hardcoded approach would require modifying every event handler for each new channel.

The system needed an extensible routing layer where channels are pluggable implementations behind a shared interface, and the dispatcher delegates to all enabled channels without knowing their internals.

## Decision

Introduce a **ChannelRouter** that implements a multi-channel dispatch pattern with a `NotificationChannel` interface. The dispatcher creates a `NotificationDraft` and hands it to the router; the router iterates registered channels and dispatches independently to each.

### Architecture

```
Domain Events (EventBus)
  |
  v
NotificationDispatcher (event consumer)
  - Maps DomainEvent -> NotificationDraft
  - Resolves user NotificationPreferences (once per dispatch)
  - Delegates to ChannelRouter.route(draft, prefs)
  |
  v
ChannelRouter (singleton on globalThis)
  - Iterates registered channels in registration order
  - Per channel:
    1. shouldNotify(prefs, type, channel.name) -- preference gate
    2. channel.isAvailable(userId) -- infrastructure gate
    3. channel.dispatch(draft, userId) -- delivery
  - Error isolation: one channel failure does not block others
  - Returns aggregated ChannelRouterResult
  |
  v
NotificationChannel implementations
  - InAppChannel: creates Prisma Notification record
  - WebhookChannel: HMAC-signed HTTP POST with retry + auto-deactivation
  - [Future] EmailChannel, PushChannel
```

### NotificationChannel Interface

```typescript
interface NotificationChannel {
  readonly name: string;
  dispatch(notification: NotificationDraft, userId: string): Promise<ChannelResult>;
  isAvailable(userId: string): Promise<boolean>;
}
```

Three contracts:
- `name` -- unique identifier, must match a key in `NotificationPreferences.channels` for preference gating
- `dispatch` -- must not throw; returns `ChannelResult` with error details on failure
- `isAvailable` -- checks infrastructure readiness (e.g., webhook has active endpoints, email has SMTP configured), not user preferences (handled by router)

### Two-Level Gating

The `shouldNotify()` function was extended with an optional `channel` parameter to enable channel-aware preference checking:

- **Without channel** (called by dispatcher): returns `true` if ANY channel is enabled -- used to decide whether to build a `NotificationDraft` at all
- **With channel** (called by router per channel): returns `true` only if that specific channel is enabled in `prefs.channels`

This two-level design avoids constructing drafts when all channels are disabled, while still allowing independent per-channel control.

### Key Design Decisions

1. **Router as separate class** (not on the dispatcher) -- SRP: the dispatcher maps events to drafts; the router handles channel iteration and error isolation. The router is reusable by any future draft source.

2. **Channel registration** (not discovery) -- channels are explicitly registered via `channelRouter.register(new InAppChannel())` in the dispatcher module. This keeps the dependency graph explicit and avoids module-scanning magic.

3. **Sequential channel iteration** (not parallel) -- channels are dispatched in registration order via a `for...of` loop. Within a channel, operations may be parallel (WebhookChannel uses `Promise.allSettled` across endpoints), but cross-channel ordering is deterministic. This simplifies reasoning about dispatch behavior.

4. **globalThis singleton** -- the ChannelRouter survives HMR in development, matching the pattern established by RunCoordinator (ADR-014), EventBus, and EnrichmentOrchestrator (ADR-025).

5. **NotificationDraft as intermediate type** -- decouples the dispatcher's event-mapping concern from channel-specific payload construction. InAppChannel uses `message`; WebhookChannel uses `data` for structured JSON payloads. Each channel selects what it needs from the draft.

6. **Error isolation per channel** -- a `try/catch` around each channel's dispatch ensures that a webhook timeout does not prevent in-app notification creation.

### Webhook Channel Specifics

The WebhookChannel (`src/lib/notifications/channels/webhook.channel.ts`) implements delivery hardening within the channel abstraction:

- **HMAC-SHA256 signing** with AES-encrypted secrets (decrypted per-dispatch)
- **SSRF re-validation** on every dispatch via `validateWebhookUrl()` (DNS rebinding defense)
- **Retry with backoff**: 3 attempts at 1s/5s/30s delays, 10s timeout per attempt
- **Failure tracking**: atomic `failureCount` increment, in-app notification on exhaustion
- **Auto-deactivation**: endpoint disabled after 5 consecutive failures, with in-app notification
- **Concurrent endpoint delivery**: `Promise.allSettled` across matching endpoints (independent failures)

All of this complexity is encapsulated within the channel -- the router sees only `dispatch()` returning a `ChannelResult`.

### Alternatives Considered

**Alternative A: Direct webhook calls in dispatcher event handlers** -- Add `if (webhookEnabled) { postToWebhook() }` in each handler alongside the existing `prisma.notification.create()`. Rejected because:
- Duplicates preference checking and error handling per event handler
- Each new channel requires modifying every handler (N events x M channels)
- No error isolation between channels
- Tightly couples event-mapping logic with delivery transport

**Alternative B: Strategy pattern on the dispatcher** -- Make the dispatcher itself pluggable with interchangeable delivery strategies. Rejected because:
- Strategy pattern implies one active strategy at a time; we need multiple channels active simultaneously
- Still requires the dispatcher to understand channel-specific concerns (strategy selection, preference checking per channel)
- Does not cleanly separate "what to notify" from "how to deliver"

**Alternative C: Observer/pub-sub for channel dispatch** -- Channels subscribe to a local notification topic; dispatcher publishes drafts. Rejected because:
- Adds indirection without benefit (we already have the EventBus for domain events; a second pub-sub layer for delivery is over-engineering)
- Loses the ability to aggregate results (ChannelRouterResult.anySuccess)
- Makes the preference-gating flow harder to follow

## Consequences

### Positive

- **Open/Closed for channels**: new channels (Email, Push) require only a `NotificationChannel` implementation + one `register()` call. No changes to the router, dispatcher, or existing channels
- **Independently testable**: each channel can be unit-tested in isolation with a mock draft. The router can be tested with mock channels. No Prisma or HTTP needed for router tests
- **Channel-independent preference model**: `shouldNotify(prefs, type, channel)` allows users to enable webhook for a type while disabling in-app, or vice versa. No cross-channel coupling
- **Error-resilient**: a webhook endpoint timing out does not prevent the in-app notification from being created. Users always get at least one delivery path
- **Audit-friendly**: `ChannelRouterResult` provides per-channel success/failure details for debugging

### Negative

- **More files**: the notification system now spans 5 files (`types.ts`, `channel-router.ts`, `in-app.channel.ts`, `webhook.channel.ts`, plus the dispatcher) instead of the original 1. Developers must understand the indirection layer
- **Registration order matters**: channels dispatch in registration order. If a future channel has side effects that depend on another channel's result, the current design does not support cross-channel coordination
- **Another globalThis singleton**: adds to the growing list of HMR-safe singletons (EventBus, RunCoordinator, EnrichmentOrchestrator, ChannelRouter). No conflicts observed, but the pattern accumulates
- **Two-level gating complexity**: the `shouldNotify()` function's optional `channel` parameter has subtle semantics (any-channel vs specific-channel). Misuse could lead to notifications being incorrectly suppressed or delivered

### Risks

- **Channel explosion**: if many channels are added, the sequential dispatch loop could introduce latency. Mitigation: channels that involve network I/O (webhook) already handle timeouts internally; a future parallel dispatch mode could be added to the router without changing the interface
- **Preference schema growth**: each new channel adds a boolean to `ChannelConfig` and potentially per-type channel overrides. The JSON settings column in `UserSettings` may grow complex. Mitigation: `DEFAULT_NOTIFICATION_PREFERENCES` provides sane defaults; explicit preferences are opt-in

## Cross-References

- `specs/notification-dispatch.allium` -- authoritative specification (rules: ChannelRouting, WebhookDelivery, WebhookRetryExhaustion, WebhookAutoDeactivation)
- ADR-004 / ADR-010 -- ACL Connector-Module pattern (ChannelRouter follows the same "shared interface, pluggable implementations" principle)
- ADR-014 -- RunCoordinator (globalThis singleton pattern precedent)
- ADR-015 -- IDOR ownership enforcement (webhook endpoint queries include `userId` in all `where` clauses)
- ADR-025 -- Data Enrichment Connector (fallback chain pattern; ChannelRouter's "iterate and dispatch" is analogous to the orchestrator's "iterate and try")

## Files

### New
- `src/lib/notifications/types.ts` -- NotificationChannel interface, NotificationDraft, ChannelResult, webhook-specific types
- `src/lib/notifications/channel-router.ts` -- ChannelRouter singleton (register + route)
- `src/lib/notifications/channels/in-app.channel.ts` -- InAppChannel implementation
- `src/lib/notifications/channels/webhook.channel.ts` -- WebhookChannel implementation (HMAC, retry, auto-deactivation)

### Modified
- `src/lib/events/consumers/notification-dispatcher.ts` -- refactored from direct `prisma.notification.create()` to `channelRouter.route(draft, prefs)`
- `src/models/notification.model.ts` -- `shouldNotify()` extended with optional `channel` parameter for per-channel gating
- `specs/notification-dispatch.allium` -- expanded with ChannelRouting rule, WebhookDelivery/RetryExhaustion/AutoDeactivation rules, WebhookEndpoint entity
