# Test Fixture Analysis — Flashlight Report (2026-05-14)

## Overview

10 test files use DispatchContext objects. 6 duplicated fixture construction inline. Analysis performed to extract shared factories.

## DispatchContext Test File Inventory

| # | File | Pattern | Migrated? |
|---|------|---------|-----------|
| 1 | `webhook-channel.spec.ts` | Local `makeTestContext()` + `makeEndpoint()` | **YES** (`be21908`) |
| 2 | `email-channel.spec.ts` | Local `makeTestContext()` + `SMTP_SNAPSHOT` const | **YES** |
| 3 | `push-channel.spec.ts` | Local `makeTestContext()` + `VAPID/SUBSCRIPTION` consts | **YES** |
| 4 | `channel-router.spec.ts` | Local `makeTestContext()` + `makeMockChannel()` + `makeDraft()` | **YES** |
| 5 | `channel-router-integration.spec.ts` | Local `makeContext()` with nested prefs override | **YES** |
| 6 | `invalidate-availability-hooks.spec.ts` | Local `makePushTestContext()` | **YES** |
| 7 | `dispatch-context.spec.ts` | Tests `buildDispatchContext()` itself — mocks Prisma | No (tests builder) |
| 8 | `notification-dispatcher.spec.ts` | Mocks Prisma tables, not DispatchContext | No (indirect) |
| 9 | `notification-dispatcher-prefs.spec.ts` | Uses `_testHelpers.buildDispatchContext()` | No (uses real builder) |
| 10 | `notification-dispatcher-staged-buffers-hmr.spec.ts` | No DispatchContext usage | No (irrelevant) |

## Shared Factories (in `src/lib/data/testFixtures.ts`)

### Snapshot Factories (leaf level)

| Factory | Returns | Default Values |
|---------|---------|---------------|
| `makeSmtpSnapshot(overrides?)` | `SmtpConfigSnapshot` | host=smtp.example.com, port=587, tlsRequired=true |
| `makeVapidSnapshot(overrides?)` | `VapidConfigSnapshot` | publicKey=BPublicKeyBase64 |
| `makePushSubscription(overrides?)` | `PushSubscriptionSnapshot` | endpoint=push.example.com/sub1 |
| `makeWebhookEndpoint(overrides?)` | `WebhookEndpointSnapshot` | url=example.com/webhook, failureCount=0 |

### Composite Factories

| Factory | Returns | Notes |
|---------|---------|-------|
| `makeTestDispatchContext(overrides?)` | `DispatchContext` | All channels unavailable by default, inApp=true |
| `makeTestNotificationDraft(overrides?)` | `NotificationDraft` | type=vacancy_promoted |
| `makeMockChannel(name, overrides?)` | `NotificationChannel & { dispatch: jest.Mock }` | Extracted from channel-router.spec.ts reference |

### Usage Pattern

```typescript
// Email channel test:
const ctx = makeTestDispatchContext({ smtp: makeSmtpSnapshot(), emailAvailable: true });

// Push channel test with 2 subscriptions:
const ctx = makeTestDispatchContext({
  vapid: makeVapidSnapshot(),
  pushSubscriptions: [makePushSubscription(), makePushSubscription({ id: "sub-2" })],
  pushAvailable: true,
});
```

## Additional Discovery: Unused Type Imports

During migration, found `NotificationChannel` imported but unused in `channel-router.spec.ts` after `makeMockChannel` extraction. Left as-is (TS warning, not error).

## Duplication Eliminated

- **6× `makeTestContext()` implementations** → 1 `makeTestDispatchContext()`
- **5× `SMTP_SNAPSHOT` consts** → 1 `makeSmtpSnapshot()`
- **3× `VAPID_SNAPSHOT` consts** → 1 `makeVapidSnapshot()`
- **~150 lines total** across 6 files

## Cross-References

- DispatchContext interface: `src/lib/notifications/dispatch-context.ts:71-85`
- Existing test fixtures: `src/lib/data/testFixtures.ts` (40+ fixtures before, 47+ after)
- Deferred item resolved: `project_deferred_sprints_for_future_sessions.md` § "Shared test helpers"
