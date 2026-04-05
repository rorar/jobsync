# Allium Weed: Spec-Code Divergence Audit (S5a-Resume)

**Date:** 2026-04-04
**Reviewer:** Claude Opus 4.6 (1M context)
**Purpose:** Verify the 20 divergences reported by the S5a session and classify each as S5a-caused, pre-existing, or aspirational.

---

## Methodology

1. Read both specs (`notification-dispatch.allium`, `event-bus.allium`) line-by-line
2. Read all corresponding implementation files
3. Used `git diff 985c642~1..289b14b` to determine exactly what S5a changed
4. Checked intermediate commits (75fe1fd, 21c5119, 503502b, 289b14b) to trace when changes appeared
5. Compared pre-S5a state vs post-S5a state vs spec for each divergence

## Key Finding: Previous Report Accuracy

The S5a review (`docs/reviews/s5a/review-allium-weed.md`) found 20 divergences and labeled them all as generic findings without classifying origin. **One critical finding was factually wrong** at time of writing:

- **Finding #5 ("WebhookChannel never registered"):** The review was written based on code at commit 21c5119, but commit 289b14b (`fix(review)`) added `channelRouter.register(new WebhookChannel())`. The fix was committed BEFORE the review report (547c33c) was finalized -- the reviewer did not re-check the code after the fix commit. **This is NOT a divergence.**

---

## Spec 1: `specs/notification-dispatch.allium`

### Checked Against:
- `src/lib/events/consumers/notification-dispatcher.ts`
- `src/lib/notifications/channel-router.ts`
- `src/lib/notifications/channels/webhook.channel.ts`
- `src/lib/notifications/channels/in-app.channel.ts`
- `src/models/notification.model.ts`
- `src/lib/notifications/types.ts`
- `src/actions/webhook.actions.ts`
- `src/lib/url-validation.ts`
- `prisma/schema.prisma`

---

### D1: Deduplication rule not implemented

**Spec:** `rule Deduplication` (lines 250-277) -- "No duplicate notifications of same type+moduleId within 5 minutes." Defines `DEDUP_WINDOW_MINUTES: Integer = 5` in config.

**Code:** Zero deduplication logic in `notification-dispatcher.ts`, `channel-router.ts`, or `shouldNotify()`. No `DEDUP_WINDOW_MINUTES` constant anywhere.

**Classification: Pre-existing.** The Deduplication rule was in the spec before S5a (spec created in S3 era). S5a did not touch dedup logic. It was always unimplemented.

**Risk:** Low-medium. Rapid-fire identical events (e.g., multiple CB trips for same module) can produce duplicate notifications.

---

### D2: `mapEventToNotification()` not a standalone function

**Spec:** Contract `NotificationDispatcher` (line 188) declares `mapEventToNotification(event, userId): Notification?` as a pure mapping function.

**Code:** Individual `handleX()` functions combine mapping and dispatch. The `dispatchNotification()` helper takes a pre-built `NotificationDraft`.

**Classification: Pre-existing.** The handler pattern existed before S5a. S5a refactored handlers to use `dispatchNotification()` instead of direct Prisma calls, but did not change the mapping approach. The behavior is functionally equivalent.

---

### D3: `MAX_NOTIFICATIONS_DISPLAYED` and `NOTIFICATION_RETENTION_DAYS` not implemented

**Spec:** Config section (lines 74-77) declares these two constants.

**Code:** No implementation. The NotificationBell component fetches notifications but has no explicit limit matching the spec constant.

**Classification: Pre-existing / Aspirational.** These were in the spec before S5a and represent planned behavior.

---

### D4: Quiet hours invariant contradicts rule guidance

**Spec invariant** `QuietHoursRespected` (line 493-496): "Notifications during quiet hours are delayed, not dropped."
**Spec rule** `QuietHours` guidance (line 237): "Notifications are dropped, not queued. This is the MVP behavior."
**Code:** `shouldNotify()` returns false during quiet hours (notifications dropped).

**Classification: Pre-existing.** This internal spec contradiction existed before S5a. Code matches the rule guidance (dropped), which contradicts the invariant note (delayed). S5a did not touch `isWithinQuietHours()`.

---

### D5: `shouldNotify()` channel parameter -- VERIFIED CORRECT

**Spec:** `rule ChannelRouting` (lines 289, 314-318) requires `shouldNotify(prefs, type, channel.name)` with optional channel parameter.

**Code:** `shouldNotify()` accepts `channel?: NotificationChannelId` parameter (line 80). When channel is provided, checks that specific channel. When omitted, checks if ANY channel is enabled.

**Classification: No divergence.** S5a correctly added the `channel` parameter in commit 985c642. The ChannelRouter calls `shouldNotify(prefs, draft.type, channelId)` in `channel-router.ts` line 60.

---

### D6: `ChannelRouter.isAvailable()` per channel -- VERIFIED CORRECT

**Spec:** `rule ChannelRouting` (line 291) requires `channel.isAvailable(userId) = true`.

**Code:** `NotificationChannel` interface defines `isAvailable(userId: string): Promise<boolean>`. InAppChannel returns `true` always. WebhookChannel checks `prisma.webhookEndpoint.count({ where: { userId, active: true } }) > 0`. ChannelRouter calls `channel.isAvailable(draft.userId)` at line 65.

**Classification: No divergence.** Correctly implemented by S5a.

---

### D7: WebhookChannel registration -- VERIFIED CORRECT

**Previous report claimed:** "WebhookChannel never registered."

**Actual code** (post-289b14b, line 43): `channelRouter.register(new WebhookChannel());`

**Classification: Not a divergence.** The previous report was based on pre-fix code. Commit 289b14b fixed this.

---

### D8: WebhookDelivery retry backoff (1s, 5s, 30s) -- VERIFIED CORRECT

**Spec:** Config `WEBHOOK_RETRY_BACKOFFS_MS: Integer[] = [1000, 5000, 30000]` (line 84).

**Code:** `const RETRY_BACKOFFS_MS = [1_000, 5_000, 30_000];` in `webhook.channel.ts` line 36.

**Classification: No divergence.** Exact match.

---

### D9: Atomic failureCount increment -- VERIFIED CORRECT

**Spec:** `rule WebhookRetryExhaustion` (line 394) -- "endpoint.failureCount incremented by 1".

**Code:** `prisma.webhookEndpoint.update({ ..., data: { failureCount: { increment: 1 } } })` at `webhook.channel.ts` line 306.

**Classification: No divergence.** Uses Prisma atomic increment, preventing read-then-write race.

---

### D10: SSRF re-validation on dispatch -- VERIFIED CORRECT

**Spec:** `rule WebhookDelivery` (line 363) -- "validateWebhookUrl(endpoint.url) = valid" on each dispatch.

**Code:** `validateWebhookUrl(endpoint.url)` called at `webhook.channel.ts` line 270 inside the dispatch loop.

**Classification: No divergence.**

---

### D11: Webhook auto-deactivation threshold

**Spec:** Config `WEBHOOK_AUTO_DEACTIVATE_THRESHOLD: Integer = 5` (line 87). Rule `WebhookAutoDeactivation` (line 409): "endpoint.failureCount >= 5".

**Code:** `const AUTO_DEACTIVATE_THRESHOLD = 5;` (line 39). Check: `updated.failureCount >= AUTO_DEACTIVATE_THRESHOLD` (line 314).

**Classification: No divergence.** Exact match.

---

### D12: `NotificationDraft.data` field not in spec

**Code:** `NotificationDraft` interface has `data?: Record<string, unknown>` for webhook payload enrichment.

**Spec:** No `data` field on the Notification entity. The webhook payload rule (line 366) constructs `data: notificationData` from the event.

**Classification: S5a-caused (acceptable).** S5a introduced the `data` field on `NotificationDraft` (new file `types.ts`). This is an implementation detail that enables richer webhook payloads. The spec should be updated to document it, but it is not a behavioral problem.

---

### D13: FLUSH_DELAY_MS differs from spec suggestion

**Spec guidance** (line 347): "configurable flush interval (e.g., 30 seconds)"
**Code:** `FLUSH_DELAY_MS = 5_000` (5 seconds idle timeout).

**Classification: Pre-existing.** This constant existed before S5a. The spec says "e.g., 30 seconds" as a suggestion, not a requirement. The idle-timeout pattern (reset on each new event) is sensible.

---

### D14: `WebhookEndpointDTO` and masking not in spec

**Code:** `WebhookEndpointDTO` type with `secretMask` field.

**Classification: S5a-caused (acceptable).** This is an implementation detail for the Settings UI. The spec does not need to describe API response shapes.

---

### D15: `CONFIGURABLE_NOTIFICATION_TYPES` excludes some types

**Code array:** `auth_failure`, `consecutive_failures`, `cb_escalation`, `module_deactivated`, `vacancy_promoted`, `bulk_action_completed`, `retention_completed`.

**Missing from configurable list:** `module_reactivated`, `module_unreachable`, `vacancy_batch_staged`.

**Spec:** Implies all types in `perType` map (line 120-122) but does not define which are configurable.

**Classification: Pre-existing.** The `CONFIGURABLE_NOTIFICATION_TYPES` array existed before S5a without the three missing types. S5a did not modify it.

---

### D16: Notification delivery failure uses `module_unreachable` type

**Spec:** `rule WebhookRetryExhaustion` (line 398) and `rule WebhookAutoDeactivation` (line 412) both use `type: "module_unreachable"` for webhook failure notifications.

**Code:** `webhook.channel.ts` uses `type: "module_unreachable" satisfies NotificationType` at lines 182 and 204.

**Classification: No divergence.** Matches spec exactly.

---

### D17: WebhookEndpoint model matches spec entity

**Spec entity** (lines 151-165): id, userId, url, secret, iv, events, active, failureCount, createdAt, updatedAt.

**Prisma model** (lines 666-680): All fields present with matching types and defaults.

**Classification: No divergence.**

---

## Spec 2: `specs/event-bus.allium`

### Checked Against:
- `src/lib/events/event-types.ts`
- `src/lib/events/event-bus.ts`
- `src/lib/events/index.ts`
- `src/lib/events/consumers/index.ts`

---

### D18: All 4 events from S5a spec update present in code

**S5a added to spec** (commit 503502b): `JobStatusChanged`, `CompanyCreated`, `EnrichmentCompleted`, `EnrichmentFailed`.

**Code `event-types.ts`:** All 4 present in `DomainEventType` object (lines 39-43) with full typed payloads and `EventPayloadMap` entries.

**Classification: No divergence.** However, the S5a spec update (503502b) added these to `event-bus.allium`, but the code already had them from S4 (Data Enrichment) and S3 (CRM). The spec was catching up to code, not the other way around.

---

### D19: `emitEvent()` fire-and-forget vs spec completion guarantee

**Spec:** `contract EventBus.publish()` (line 240-245): "Returns after all handlers have been invoked."

**Code:** `emitEvent()` in `index.ts` line 56: `eventBus.publish(event).catch(...)` -- fire-and-forget, does not await.

**Direct `eventBus.publish()` calls** DO await as spec requires.

**Classification: Pre-existing.** The `emitEvent()` wrapper was created before S5a and was always fire-and-forget. S5a did not modify `src/lib/events/index.ts` or `event-bus.ts`. This is by design -- callers use `emitEvent()` when they intentionally want fire-and-forget semantics.

---

### D20: ImmutableEvents invariant -- only `createEvent()` freezes

**Spec invariant** `ImmutableEvents` (line 404-408): "DomainEvent instances are not mutated after creation. Implementation: Object.freeze() or readonly TypeScript types."

**Code:** `createEvent()` uses `Object.freeze()` (line 243). The `DomainEvent` interface has `readonly` fields (lines 220-222). But nothing prevents direct object construction without freezing.

**Classification: Pre-existing.** The `createEvent()` function and `readonly` fields existed before S5a. S5a did not modify these files.

---

### D21: `AutomationRunCompletedPayload.status` stricter in code

**Spec:** `status: String` (line 170).
**Code:** `status: AutomationRunStatus` (union type, line 143).

**Classification: Pre-existing (positive).** Code is more type-safe than spec. Not a problem.

---

### D22: `AutomationDegradedPayload.reason` stricter in code

**Spec:** `reason: String` with comment listing values (line 180).
**Code:** `reason: "auth_failure" | "cb_escalation" | "consecutive_failures"` (line 151).

**Classification: Pre-existing (positive).** Same as D21.

---

### D23: ConsumerRegistration order

**Spec:** `rule ConsumerRegistration` (lines 360-361): "NotificationDispatcher.registered(EventBus)" and "AuditLogger.registered(EventBus)".

**Code:** `consumers/index.ts` registers: AuditLogger, NotificationDispatcher, DegradationCoordinator, EnrichmentTrigger. The last two are not in the spec.

**Classification: Pre-existing.** The DegradationCoordinator was added in S2, EnrichmentTrigger in S4. The spec has not been updated to list them.

---

## Summary Table

| ID | Divergence | Classification | Action |
|----|-----------|---------------|--------|
| D1 | Deduplication rule not implemented | Pre-existing | Document |
| D2 | `mapEventToNotification()` not standalone | Pre-existing | Document |
| D3 | `MAX_NOTIFICATIONS_DISPLAYED` / retention not implemented | Pre-existing / Aspirational | Document |
| D4 | Quiet hours invariant vs rule contradiction | Pre-existing | Document |
| D5 | `shouldNotify()` channel parameter | No divergence | -- |
| D6 | `isAvailable()` per channel | No divergence | -- |
| D7 | WebhookChannel registration | No divergence (previous report wrong) | -- |
| D8 | Retry backoff [1s, 5s, 30s] | No divergence | -- |
| D9 | Atomic failureCount increment | No divergence | -- |
| D10 | SSRF re-validation on dispatch | No divergence | -- |
| D11 | Auto-deactivation threshold = 5 | No divergence | -- |
| D12 | `NotificationDraft.data` not in spec | S5a-caused (acceptable) | No fix needed |
| D13 | FLUSH_DELAY_MS 5s vs spec 30s suggestion | Pre-existing | Document |
| D14 | `WebhookEndpointDTO` not in spec | S5a-caused (acceptable) | No fix needed |
| D15 | `CONFIGURABLE_NOTIFICATION_TYPES` missing 3 types | Pre-existing | Document |
| D16 | Failure notification type `module_unreachable` | No divergence | -- |
| D17 | WebhookEndpoint model | No divergence | -- |
| D18 | 4 domain events in spec and code | No divergence | -- |
| D19 | `emitEvent()` fire-and-forget | Pre-existing | Document |
| D20 | ImmutableEvents only via `createEvent()` | Pre-existing | Document |
| D21 | Payload status stricter in code | Pre-existing (positive) | Document |
| D22 | Payload reason stricter in code | Pre-existing (positive) | Document |
| D23 | ConsumerRegistration missing 2 consumers | Pre-existing | Document |

---

## Verdicts

### S5a-Caused Divergences: 2

Both are acceptable implementation details that do not require code fixes:

1. **D12** (`NotificationDraft.data` field) -- enriches webhook payloads beyond what the spec entity describes. The spec could be updated to reflect this.
2. **D14** (`WebhookEndpointDTO`) -- standard API response DTO pattern, not spec-level concern.

**No S5a-caused divergences require code fixes.**

### Pre-Existing Divergences: 11

| ID | Risk | Notes |
|----|------|-------|
| D1 | Medium | Dedup could prevent notification spam from rapid-fire events |
| D2 | Low | Structural, functionally equivalent |
| D3 | Low | Aspirational config values |
| D4 | Low | Internal spec contradiction; code matches rule guidance |
| D13 | Low | 5s vs 30s is a tuning parameter |
| D15 | Low | UI-only; missing types still work for webhook events |
| D19 | Low | By-design fire-and-forget; direct publish() awaits correctly |
| D20 | Low | TypeScript readonly provides compile-time safety |
| D21 | None | Positive -- code is stricter |
| D22 | None | Positive -- code is stricter |
| D23 | Low | Additional consumers not reflected in spec |

### No Divergence (verified correct): 10

D5, D6, D7, D8, D9, D10, D11, D16, D17, D18 -- all correctly implemented.

### Previous Report Errors: 1

**D7 ("WebhookChannel never registered")** was factually wrong. The registration was added in commit 289b14b which was part of the S5a session. The reviewer checked stale code.

---

## Conclusion

The S5a session implemented the webhook notification channel correctly. All critical spec requirements are met:

- `shouldNotify()` accepts channel parameter
- `ChannelRouter` checks `isAvailable()` per channel
- All 4 domain events present in `event-types.ts`
- WebhookChannel implements exact retry backoff (1s, 5s, 30s)
- `failureCount` atomically incremented via Prisma `{ increment: 1 }`
- WebhookChannel IS registered in the dispatcher
- SSRF validation on create AND dispatch
- HMAC-SHA256 signing with correct headers

No code changes required from this audit.
