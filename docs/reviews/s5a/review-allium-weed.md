# Allium Weed: Spec-Code Alignment Review

**Date:** 2026-04-04
**Reviewer:** Claude Opus 4.6

---

## 1. `specs/notification-dispatch.allium`

### Checked Against:
- `src/lib/events/consumers/notification-dispatcher.ts`
- `src/lib/notifications/channel-router.ts`
- `src/lib/notifications/channels/webhook.channel.ts`
- `src/lib/notifications/channels/in-app.channel.ts`
- `src/models/notification.model.ts`
- `src/lib/notifications/types.ts`
- `prisma/schema.prisma` (Notification + WebhookEndpoint models)

---

### Spec->Code Missing

1. **Deduplication rule not implemented.**
   The spec defines `rule Deduplication` (lines 250-277): "No duplicate notifications of same type+moduleId within 5 minutes." The code has zero deduplication logic. Neither the `notification-dispatcher.ts` nor the `channel-router.ts` nor the `shouldNotify()` function perform any dedup check against recent Notification records. The `DEDUP_WINDOW_MINUTES` config constant does not exist anywhere in the codebase.

2. **`mapEventToNotification()` contract method not implemented as a separate function.**
   The spec contract `NotificationDispatcher` (line 188) declares `mapEventToNotification(event, userId): Notification?` as a pure mapping function separate from dispatch. The code has individual `handleX` functions that both map AND dispatch in one step. There is no standalone pure mapping function. This is a minor structural divergence; the behavior is equivalent.

3. **Spec config `MAX_NOTIFICATIONS_DISPLAYED` (line 74) and `NOTIFICATION_RETENTION_DAYS` (line 76-77) have no code counterparts.**
   These two config values are declared in the spec but have no implementation in the notification code. Notification display limits and auto-deletion are not implemented.

4. **Spec invariant `QuietHoursRespected` (line 492-496) says "Notifications during quiet hours are delayed, not dropped."**
   The code drops notifications during quiet hours (returns `false` from `shouldNotify()`). The invariant text contradicts the `rule QuietHours` guidance (line 237: "Notifications are dropped, not queued. This is the MVP behavior.") The invariant says "delayed" but the rule guidance says "dropped." The code matches the rule guidance but contradicts the invariant.

5. **WebhookChannel is not registered in the dispatcher.**
   The `notification-dispatcher.ts` only registers `InAppChannel`:
   ```
   channelRouter.register(new InAppChannel());
   ```
   The spec's `rule ChannelRouting` (line 302) says webhook delivery should occur for the webhook channel. The `WebhookChannel` class exists and is fully implemented but is never instantiated or registered with the `channelRouter`. This means webhooks will never fire at runtime.

6. **Spec `surface NotificationBell` (lines 511-542) has no corresponding implementation checked.**
   The bell UI surface is defined in the spec but was not part of the files under review. This is not necessarily missing (it may exist elsewhere) but was not verified.

7. **Spec `surface NotificationPreferencesPanel` (lines 544-566) has no corresponding implementation checked.**
   Same as above.

### Code->Spec Missing

1. **`NotificationDraft.data` field not in spec.**
   The code's `NotificationDraft` interface (in `types.ts`, line 27) has a `data?: Record<string, unknown>` field used for structured webhook payload data. The spec's `Notification` entity (lines 94-107) does not mention a `data` field. The spec's webhook payload (line 366) constructs `data: notificationData` but this comes from the event, not from an explicit draft field.

2. **`FLUSH_DELAY_MS = 5_000` constant in notification-dispatcher.ts.**
   The spec's `rule BatchSummary` guidance mentions "a configurable flush interval (e.g., 30 seconds)" but the code uses 5 seconds. The spec does not define this as a config constant.

3. **`WebhookEndpointDTO` type in `types.ts` (lines 92-102).**
   The code defines a `WebhookEndpointDTO` with a `secretMask` field for API responses. The spec does not mention this DTO or masking pattern.

4. **`ChannelRouterResult` return type.**
   The `channel-router.ts` returns `ChannelRouterResult` with `{ anySuccess, results }`. The spec's `rule ChannelRouting` does not define a return type for routing.

5. **`CONFIGURABLE_NOTIFICATION_TYPES` array excludes several types.**
   The code's `CONFIGURABLE_NOTIFICATION_TYPES` in `notification.model.ts` lists: `auth_failure`, `consecutive_failures`, `cb_escalation`, `module_deactivated`, `vacancy_promoted`, `bulk_action_completed`, `retention_completed`. Missing from the configurable list: `module_reactivated`, `module_unreachable`, `vacancy_batch_staged`. The spec does not define which types should be user-configurable (it implies all in `perType` map).

### Field Mismatch

1. **`WebhookEndpoint.failureCount` type.**
   Spec says `failureCount: Integer = 0` (line 162). Prisma schema says `failureCount Int @default(0)` (line 675). Code treats it as `number`. **No actual mismatch** -- Integer maps to Int/number correctly.

2. **`VacancyStagedPayload.automationId` nullability.**
   Spec (line 94): `automationId: String?` (nullable). Code (event-types.ts line 67): `automationId: string | null`. **Match** -- these are equivalent.

### Behavior Mismatch

1. **Quiet hours invariant vs. rule vs. code: "delayed" vs. "dropped".**
   - Spec invariant `QuietHoursRespected` (line 493-494): "no Notification is created during quiet hours unless it was queued before quiet hours started" + note: "delayed, not dropped"
   - Spec rule `QuietHours` guidance (line 237): "Notifications are dropped, not queued. This is the MVP behavior."
   - Code: `shouldNotify()` returns `false` during quiet hours (notification dropped).
   **Internal spec contradiction.** Code matches the rule guidance, contradicts the invariant note.

2. **BatchSummary flush trigger differs from spec guidance.**
   Spec guidance (lines 346-353): "buffers events by automationId. When a configurable flush interval passes (e.g., 30 seconds)..." Code uses 5 seconds of inactivity (idle-timer pattern, not wall-clock interval). The mechanism is slightly different: the spec suggests a fixed interval, the code uses an idle-timeout that resets on each new event.

---

## 2. `specs/event-bus.allium`

### Checked Against:
- `src/lib/events/event-types.ts`
- `src/lib/events/event-bus.ts`
- `src/lib/events/index.ts`

---

### Spec->Code Missing

None found. All spec entities, payloads, contracts, rules, and invariants have corresponding code.

### Code->Spec Missing

1. **`createEvent()` convenience constructor not in spec.**
   The code (event-types.ts, line 239) exports `createEvent<T>(type, payload)` which creates a frozen `DomainEvent`. The spec does not mention this factory function. It is a convenience wrapper, not a behavioral gap.

2. **`EventPayloadMap` interface not in spec.**
   The code defines `EventPayloadMap` (lines 192-213) as a lookup type for payload mapping. The spec achieves this via the `EventPayload<T>` generic notation (line 72) but does not name a map type. This is an implementation detail for TypeScript's type system.

3. **Re-export barrel `src/lib/events/index.ts` not in spec.**
   The code has a barrel file that re-exports types and provides the `emitEvent()` backward-compatible wrapper. The spec's `rule StubMigration` (line 370) covers the `emitEvent` migration but does not describe the barrel file structure.

4. **`DomainEventTypes` alias export.**
   The barrel exports `DomainEventType as DomainEventTypes` (plural alias). Not in spec, purely a code convenience.

### Field Mismatch

1. **`AutomationRunCompletedPayload.status` type.**
   Spec (line 170): `status: String`. Code (event-types.ts line 143): `status: AutomationRunStatus` (union type `"running" | "completed" | "failed"`). **Stricter in code** -- spec says String, code narrows to a union. This is a positive divergence (code is more type-safe).

2. **`AutomationDegradedPayload.reason` type.**
   Spec (line 180): `reason: String` with comment listing possible values. Code (event-types.ts line 151): `reason: "auth_failure" | "cb_escalation" | "consecutive_failures"` (string literal union). **Stricter in code** -- same positive divergence.

### Behavior Mismatch

1. **`emitEvent()` is fire-and-forget, spec says `publish()` returns after all handlers complete.**
   Spec `contract EventBus.publish()` (line 240-245): "Returns after all handlers have been invoked (or failed safely)." The `emitEvent()` wrapper in `index.ts` (line 54-58) calls `eventBus.publish().catch(...)` without awaiting -- it is fire-and-forget. Direct `eventBus.publish()` calls DO await as the spec requires. The `emitEvent()` wrapper violates the spec's return-after-completion guarantee. This is documented in the code comment as "Fire-and-forget" (line 55).

2. **ImmutableEvents invariant: only `createEvent()` freezes; direct construction does not.**
   Spec invariant `ImmutableEvents` (line 404-408): "DomainEvent instances are not mutated after creation. Implementation: Object.freeze() or readonly TypeScript types." The `createEvent()` function uses `Object.freeze()` (line 243), but nothing prevents consumers from constructing `DomainEvent` objects directly without freezing. The TypeScript `readonly` modifiers on `DomainEvent` fields (line 220-222) provide compile-time protection but not runtime immutability.

---

## Summary

| Category | notification-dispatch.allium | event-bus.allium | Total |
|---|---|---|---|
| Spec->Code Missing | 5 substantive + 2 UI surfaces | 0 | 5 |
| Code->Spec Missing | 5 | 4 | 9 |
| Field Mismatch | 0 | 2 (positive: stricter) | 2 |
| Behavior Mismatch | 2 | 2 | 4 |
| **Total Divergences** | **12** | **8** | **20** |

### Critical Items (require action):

1. **Deduplication not implemented** (notification-dispatch.allium, rule Deduplication) -- spam risk
2. **WebhookChannel never registered** -- webhooks silently non-functional at runtime
3. **Quiet hours invariant contradicts rule guidance** -- spec internal inconsistency to resolve
4. **`emitEvent()` fire-and-forget** violates spec's completion guarantee -- may cause race conditions in tests
