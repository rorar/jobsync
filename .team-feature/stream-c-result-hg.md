# Stream C — Degradation Dispatcher Routing (Honesty-Gate)

## Option chosen: **B — inline `data.*` late-binding population**

### Why Option B over Option A

Option A (emit a domain event so `notification-dispatcher.ts` handles late
binding) was considered but rejected for this stream because:

1. **No suitable domain event exists.** `AutomationDegraded` is already
   emitted and is consumed by `degradation-coordinator.ts` for the
   RunCoordinator bridge. Repurposing it for notifications would mean
   both consumers fire for every degradation, and the payload
   (`{ automationId, userId, reason }`) lacks the module-level context
   (`moduleId`, `moduleName`, `failureCount`) the UI needs.
2. **Creating a new event requires editing shared files.** A new event
   like `ModuleDegraded`/`AuthFailureEscalated` would need changes to
   `src/lib/events/event-types.ts` and a new handler in
   `src/lib/events/consumers/notification-dispatcher.ts`. Neither file
   is in Stream C's ownership boundary, so that path is blocked.
3. **Fan-out shape is wrong for an event.** `degradation.ts` fans out
   one notification per affected automation (N rows per trigger). The
   dispatcher handlers create one notification per event. Converting
   N rows to N events would add ordering, batching, and idempotency
   concerns without fixing the locale-freeze bug any better than
   inlining the structured data.
4. **Option B fully fixes the bug.** The stored notification now
   carries `data.titleKey + titleParams + actorType + actorId +
   reasonKey + severity`, which is exactly what the in-app UI
   (`NotificationItem.tsx` via `formatNotificationTitle()`,
   `formatNotificationActor()`, `formatNotificationReason()`,
   `resolveNotificationSeverity()`) reads at render time to produce
   the correct locale. The `message` field is kept as an English
   fallback for backward compat (matching the dispatcher pattern for
   email/webhook channels and older clients).

The same reasoning applies to the webhook.channel.ts scope expansion
(see below) — no suitable event exists, the fan-out is per-endpoint,
and Option B aligns with the existing dispatcher pattern there too.

## Files modified

### 1. `/home/pascal/projekte/jobsync/src/lib/connector/degradation.ts`

Refactored all three direct notification writers so that each row now
persists late-binding metadata in `data.*`:

- Added `NotificationDataExtended` type import from
  `@/models/notification.model`.
- Introduced module-local `truncate()` helper + `NAME_TRUNCATION_LENGTH`
  constant to replace the scattered `.slice(0, 200)` calls.
- `handleAuthFailure()` — notifications now carry:
  - `titleKey: "notifications.authFailure.title"` (no params),
  - `actorType: "module"`, `actorId: moduleId`,
  - `reasonKey: "notifications.reason.authExpired"`,
  - `severity: "error"`,
  - contextual fields (`moduleId`, `moduleName`, `automationId`,
    `automationName`) for webhook/email consumers.
  - `message` preserved as English fallback.
- `checkConsecutiveRunFailures()` — notification now carries:
  - `titleKey: "notifications.consecutiveFailures.title"` with
    `titleParams: { count: 5 }`,
  - `actorType: "automation"`, `actorId: automationId`,
  - `severity: "warning"`,
  - no `reasonKey` (no matching key exists in i18n dictionaries and
    those are not in Stream C ownership).
  - `message` preserved as English fallback.
- `handleCircuitBreakerTrip()` — notifications now carry:
  - `titleKey: "notifications.cbEscalation.title"` (no params),
  - `actorType: "module"`, `actorId: moduleId`,
  - `reasonKey: "notifications.reason.circuitBreaker"`,
  - `severity: "warning"`,
  - contextual fields including `failureCount: newFailureCount`.
  - `message` preserved as English fallback.
- Added file-level JSDoc block documenting the i18n late-binding
  pattern and referencing the dispatcher.

All three i18n title keys and both reason keys already exist in
`src/i18n/dictionaries/notifications.ts` for all 4 locales (en/de/fr/es)
— no new translation work required.

### 2. `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts` (scope expansion)

Blind-spot finding: `notifyDeliveryFailed()` (line 166) and
`notifyEndpointDeactivated()` (line 190) suffered the same
dispatch-time-locale freeze bug. They resolved `message` using
`resolveUserLocale(userId)` at write time but stored no
structured data for late re-rendering if the user later changes
their locale preference.

- Added `NotificationDataExtended` type import.
- `notifyDeliveryFailed()` — now also writes:
  - `titleKey: "webhook.deliveryFailed"`,
  - `titleParams: { eventType, url: endpointUrl }`,
  - `actorType: "system"`,
  - `actorNameKey: "notifications.actor.system"`,
  - `severity: "error"`,
  - `endpointUrl` + `eventType` contextual fields.
  - `message` preserved exactly as before (still resolved via
    `resolveUserLocale()` + `t()`) for backward compatibility.
- `notifyEndpointDeactivated()` — analogous fix:
  - `titleKey: "webhook.endpointDeactivated"`,
  - `titleParams: { url: endpointUrl }`,
  - `actorType: "system"`,
  - `severity: "warning"`.
  - `message` preserved as-is.
- Added JSDoc blocks documenting the late-binding rationale.

The existing `webhook.deliveryFailed` and `webhook.endpointDeactivated`
keys already contain the full sentence template in all 4 locales — they
are reused as `titleKey`s, which `formatNotificationTitle()` resolves
via `t()` + `substituteParams()` at render time.

**No shared files required modification.** `event-types.ts` was
**not** touched. No new domain events were created.

## Tests updated

### `/home/pascal/projekte/jobsync/__tests__/degradation.spec.ts`

Added three new tests — one per degradation rule — asserting that
the late-binding metadata is populated correctly:

- `handleAuthFailure > should populate data.titleKey + 5W+H metadata for late-bound i18n`
- `checkConsecutiveRunFailures > should populate data.titleKey + 5W+H metadata for late-bound i18n`
- `handleCircuitBreakerTrip > should populate data.titleKey + 5W+H metadata for late-bound i18n`

Each test verifies:
- The correct `titleKey` (+ `titleParams` where applicable)
- `actorType` / `actorId`
- `reasonKey` (where set)
- `severity`
- Contextual fields (`moduleId`, `moduleName`, `automationId`,
  `automationName`, `failureCount`)
- The `message` backward-compat fallback is still populated and
  non-empty

Existing tests (notification `createMany`/`create` shape, `pausedCount`
return values, auto-deactivation flow, CB state transitions, TOCTOU
guards) were all left intact and still pass — the added fields flow
through the existing `expect.objectContaining()` assertions without
breaking them.

### `/home/pascal/projekte/jobsync/__tests__/webhook-channel.spec.ts`

Added two new tests:

- `retry logic > populates data.titleKey + 5W+H metadata for late-bound i18n on delivery failure`
- `auto-deactivation > populates data.titleKey + 5W+H metadata for late-bound i18n on auto-deactivation`

Each verifies the new `data.*` structure and that the `message`
fallback remains populated. Existing webhook-channel tests (HMAC,
retry, backoff, SSRF, concurrent delivery, error isolation) all
still pass — the added fields do not disturb the existing
`expect.objectContaining({ userId, type, message })` assertions.

## Verification

### TypeScript

```
$ npx tsc --noEmit
EXIT=0
```

Clean — no type errors introduced. (Note: the existing
`toast-vacancy-hook` and other unrelated files compile cleanly;
no pre-existing errors were in scope.)

### Targeted Jest runs

**degradation.spec.ts:**
```
Test Suites: 1 passed, 1 total
Tests:       29 passed, 29 total
Time:        0.988 s
```

All 29 tests pass — the original 26 plus the 3 new late-binding tests.

**webhook-channel.spec.ts:**
```
Test Suites: 1 passed, 1 total
Tests:       37 passed, 37 total
Time:        1.691 s
```

All 37 tests pass — the original 35 plus the 2 new late-binding tests.
The console.warn/console.error noise in the log comes from pre-existing
SSRF and error-isolation tests that deliberately exercise the error
paths.

**degradation-coordinator.spec.ts** (spot check — no ownership, but
verifying no collateral damage via the shared `AutomationDegraded`
event):
```
Test Suites: 1 passed, 1 total
Tests:       10 passed, 10 total
Time:        1.044 s
```

Per task constraint, the full Jest suite was **not** run (other
streams in flight).

### Backward compatibility

- **`message` field** — still populated for both in-app and
  webhook/email downstream consumers. Old clients that don't read
  `data.titleKey` continue to render the English/user-locale message
  exactly as before.
- **Notification shape** — no Prisma column additions. `data` is an
  existing `Json?` column; only the content of the JSON blob changed.
- **`AutomationDegraded` event** — still emitted for the
  `degradation-coordinator.ts` bridge (RunCoordinator's
  `acknowledgeExternalStop()`). Event bus contract unchanged.
- **Notification preferences / `shouldNotify()`** — unchanged. The
  `NotificationType` values written (`auth_failure`,
  `consecutive_failures`, `cb_escalation`, `module_unreachable`) are
  identical to before, so per-type user preferences continue to gate
  correctly.
- **Webhook payload envelope** — the outbound webhook `data` field
  for webhook-subscribed consumers is unchanged (it flows through
  `WebhookChannel.dispatch()`, which uses `notification.data` from the
  `NotificationDraft` — not the persisted in-app notification row).

## Files

- `/home/pascal/projekte/jobsync/src/lib/connector/degradation.ts`
- `/home/pascal/projekte/jobsync/src/lib/notifications/channels/webhook.channel.ts`
- `/home/pascal/projekte/jobsync/__tests__/degradation.spec.ts`
- `/home/pascal/projekte/jobsync/__tests__/webhook-channel.spec.ts`
- `/home/pascal/projekte/jobsync/.team-feature/stream-c-result-hg.md` (this file)
