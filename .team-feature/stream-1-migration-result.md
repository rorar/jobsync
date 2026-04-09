# Stream 1 — Prisma Notification Migration Result

**Date:** 2026-04-09
**Scope:** Promote 7 structured 5W+H notification fields from `Notification.data` JSON to first-class Prisma columns (ADR-030 Decision B follow-up).
**Status:** Done. All targeted test suites pass; TypeScript clean; migration applied.

## 1. Migration

**Path:** `/home/pascal/projekte/jobsync/prisma/migrations/20260409135116_add_notification_structured_fields/migration.sql`

**SQL summary** (SQLite dialect, idempotent via Prisma's migration tracker):

```sql
ALTER TABLE "Notification" ADD COLUMN "severity" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actorType" TEXT;
ALTER TABLE "Notification" ADD COLUMN "actorId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "titleKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "titleParams" JSONB;
ALTER TABLE "Notification" ADD COLUMN "reasonKey" TEXT;
ALTER TABLE "Notification" ADD COLUMN "reasonParams" JSONB;
```

All columns are **nullable** so pre-migration rows remain valid and the
domain model keeps reading them via the legacy `data.*` fallback path.

**Applied via:** `bun run prisma migrate deploy` (migration recorded in
`_prisma_migrations` table by Prisma; re-runs are no-ops).

**Verified in DB** (`.schema Notification`): all 7 columns present.

## 2. Schema diff

### `prisma/schema.prisma` — `Notification` model

Before:

```prisma
model Notification {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  type         String
  message      String
  moduleId     String?
  automationId String?
  data         Json?
  read         Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([userId, read])
  @@index([userId, createdAt])
}
```

After:

```prisma
model Notification {
  id           String   @id @default(uuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  type         String
  message      String
  moduleId     String?
  automationId String?
  data         Json?
  // 5W+H structured notification fields (ADR-030)
  // Promoted from Notification.data JSON during the Prisma migration sprint.
  // Legacy `data.*` writers continue to work during rollout via fallback.
  severity     String?
  actorType    String?
  actorId      String?
  titleKey     String?
  titleParams  Json?
  reasonKey    String?
  reasonParams Json?
  read         Boolean  @default(false)
  createdAt    DateTime @default(now())

  @@index([userId, read])
  @@index([userId, createdAt])
}
```

## 3. Files modified

### Schema + migration
- `prisma/schema.prisma` — 7 new nullable columns on `Notification`.
- `prisma/migrations/20260409135116_add_notification_structured_fields/migration.sql` — new.

### Model type
- `src/models/notification.model.ts` —
  - `Notification` now carries the 7 top-level nullable fields alongside the legacy `data` blob.
  - Added `hasStructuredFields()` type guard.
  - Rewrote `NotificationDataExtended` doc comment to clarify its role as the legacy fallback shape.

### Writers (dual-write during rollout)
- `src/lib/notifications/types.ts` — extended `NotificationDraft` with 7 top-level 5W+H fields (mirrors columns).
- `src/lib/notifications/channels/in-app.channel.ts` — persists both `data: {...}` and the 7 new columns when creating rows.
- `src/lib/events/consumers/notification-dispatcher.ts` — every event handler (`VacancyPromoted`, `VacancyStaged` batch flush, `BulkActionCompleted`, `ModuleDeactivated`, `ModuleReactivated`, `RetentionCompleted`, `JobStatusChanged`) populates both the draft's top-level fields AND the legacy `data.*` blob with identical values.
- `src/lib/connector/degradation.ts` — all 3 direct writers (`handleAuthFailure`, `checkConsecutiveRunFailures`, `handleCircuitBreakerTrip`) dual-write top-level columns + legacy `data.*`.
- `src/lib/notifications/channels/webhook.channel.ts` — both direct writers (`notifyDeliveryFailed`, `notifyEndpointDeactivated`) dual-write top-level columns + legacy `data.*`.
- `src/actions/notification.actions.ts` — doc comment notes that Prisma returns every scalar column by default, so no explicit `select` is needed to surface the new columns (avoids breaking the adjacent `notification.actions.spec.ts` test not in this stream's ownership).

### Readers (prefer columns, fall back to `data.*`)
- `src/lib/notifications/deep-links.ts` — formatters (`formatNotificationTitle`, `formatNotificationReason`, `formatNotificationActor`, `resolveNotificationSeverity`) now accept either:
  1. A `NotificationFormatSource` (new shape: explicit column-shaped fields + optional `data` blob), or
  2. A legacy `NotificationDataExtended` blob (old call-site signature).
  The internal `toSource()` + `resolveStringField()` / `resolveParamsField()` helpers centralize the "prefer column, fall back to blob" precedence rule. Added convenience export `notificationFormatSource(notification)` for UI consumers.
- `src/components/layout/NotificationItem.tsx` — builds a `NotificationFormatSource` from the full notification row (top-level columns + parsed legacy `data` blob) and passes it to the formatters. `buildNotificationActions` still receives the legacy `data` blob because it carries contextual ids (`jobId`, `automationId`, `stagedVacancyId`) that were NOT promoted to columns.

### Tests
- `__tests__/NotificationItem.spec.tsx` — updated `makeNotification()` fixture to include the 7 new nullable fields (default `null`, so legacy-fallback tests still exercise the old path). Added 4 ADR-030 tests asserting top-level column precedence, legacy fallback, and dual-source coverage.
- `__tests__/notification-format.spec.ts` — added an `ADR-030 top-level column vs legacy fallback` describe block with 7 tests covering title/reason/actor/severity precedence and the backward-compat legacy-blob path.
- `__tests__/notification-deep-links.spec.ts` — added 2 tests to `resolveNotificationSeverity` asserting top-level column precedence and legacy fallback.
- `__tests__/notification-dispatcher.spec.ts` — added 2 dual-write assertions (VacancyPromoted, ModuleDeactivated) + 1 batch-staging dual-write assertion.
- `__tests__/degradation.spec.ts` — extended the 3 existing "5W+H metadata" assertions to also check the top-level columns (dual-write).
- `__tests__/webhook-channel.spec.ts` — extended the 2 existing "5W+H metadata" assertions (delivery failure + auto-deactivation) to also check the top-level columns (dual-write).

### NOT touched (out of scope / ownership)
- `src/actions/module.actions.ts` — also has a direct `prisma.notification.createMany` writer (`deactivateModule`) that was NOT listed in Stream 1's ownership. Its rows will land with `null` in the new columns and still render correctly via legacy `data.*` fallback (no regression), but this writer is NOT dual-writing yet. See **Deferred work** below.
- `__tests__/security-sprint-c.spec.ts` — no notification writes; unaffected.
- `__tests__/notification.actions.spec.ts` — not in ownership; left untouched. The action layer was deliberately kept without an explicit `select` so this spec's `findMany` assertion shape remains valid.
- `src/lib/events/event-types.ts` — read-only per stream instructions.

## 4. Dual-write rollout strategy

**Invariant:** every notification writer populates BOTH the top-level
columns and the legacy `data.*` blob with identical values during the
rollout. Readers prefer the top-level columns and fall back to `data.*`
only when a column is null (pre-migration rows or un-migrated writers).

**Why dual-write:**

1. **Pre-migration rows** already exist in production DBs. They have `null`
   top-level columns but a populated `data.*` blob. The reader fallback
   keeps them rendering correctly without a backfill.
2. **Un-migrated writers** (e.g. `module.actions.ts`, future callers that
   forget the new columns) continue to produce renderable notifications
   via the `data.*` path — no silent breakage, just a gap that a follow-up
   cleans up.
3. **Test parity** between the old and new paths — the dispatcher test
   suite asserts both shapes for the same notification, so regressions
   in either direction fail loudly.

**Precedence rule** (centralized in `src/lib/notifications/deep-links.ts`):

| Field | Precedence |
|---|---|
| `titleKey`, `titleParams` | top-level column → legacy `data.titleKey` → `notification.message` |
| `reasonKey`, `reasonParams` | top-level column → legacy `data.reasonKey` → null (UI hides) |
| `severity` | top-level column → legacy `data.severity` → type-based default |
| `actorType`, `actorId`, `actorNameKey` | top-level column → legacy `data.*` → generic label per actorType → empty string |

**Rollout exit criteria** (not part of this stream): once a backfill
migration copies `data.*` fields into the columns for pre-migration rows
AND all writers are confirmed dual-writing, the `data.*` blob can become
read-only (or the structured fields removed from it). Tracked as deferred
work.

## 5. Test results (targeted suites)

All targeted suites pass with single-worker execution.

```
bash scripts/test.sh --no-coverage --workers=1 \
  __tests__/notification-dispatcher.spec.ts \
  __tests__/NotificationItem.spec.tsx \
  __tests__/NotificationBell.spec.tsx \
  __tests__/notification-deep-links.spec.ts \
  __tests__/notification-format.spec.ts \
  __tests__/degradation.spec.ts \
  __tests__/webhook-channel.spec.ts

Test Suites: 7 passed, 7 total
Tests:       146 passed, 146 total
```

Extended run over the full notification + adjacent surface area:

```
bash scripts/test.sh --no-coverage --workers=1 \
  __tests__/notification __tests__/NotificationBell.spec.tsx \
  __tests__/NotificationItem.spec.tsx __tests__/degradation.spec.ts \
  __tests__/webhook-channel.spec.ts

Test Suites: 11 passed, 11 total
Tests:       203 passed, 203 total
```

**TypeScript:** `bun run tsc --noEmit` → exit 0 (zero errors).
**Prisma:** `bun run prisma validate` → schema valid. `prisma migrate status` → up to date.

## 6. Deferred work

1. **`src/actions/module.actions.ts` `deactivateModule()` dual-write** — this
   writer was not in Stream 1's ownership. Its `module_deactivated`
   notifications currently land with null top-level columns but render
   correctly via the legacy `data.*` path (no UI regression because the
   dispatcher also emits a `ModuleDeactivated` domain event). A small
   follow-up can dual-write this path for consistency, or the direct write
   can be removed entirely in favor of the event-driven path.

2. **Backfill migration** — pre-migration rows have null top-level columns.
   A one-shot backfill that copies `data.titleKey → titleKey`, etc. would
   let us eventually drop the legacy `data.*` fallback. Not required for
   this sprint; the reader precedence rule keeps everything working.

3. **Drop legacy `data.*` fields** — once the backfill is complete and all
   writers are confirmed dual-writing, the structured fields can be
   removed from `NotificationDataExtended` / the `data` JSON blob, leaving
   `data` for contextual ids only (jobId, stagedVacancyId, automationId,
   endpointUrl, ...). Tracked as a separate cleanup sprint.

4. **Event-emission refactor for degradation + webhook.channel** — ADR-030
   flags these as "direct writers" that should ideally flow through the
   ChannelRouter via domain events. Not changed in this stream; the
   dual-write keeps them correct.

5. **ESLint rule forbidding direct `prisma.notification.create` outside
   the notification module** — mentioned in ADR-030 as a safeguard against
   new bypass sites. Not implemented in Stream 1.

## 7. Notes for reviewers

- The `toSource()` detection in `deep-links.ts` uses the presence of a
  `data` key (null or object) to distinguish a `NotificationFormatSource`
  from a legacy `NotificationDataExtended` blob. All current call sites
  fall cleanly on one side of this boundary — legacy tests pass raw
  blobs (no `data` key), UI code passes full sources (explicit `data: ...`).
- Writers always set both paths with **identical values** — the dispatcher
  assigns to local `const titleKey = ...` and reuses it in both places so
  drift is impossible within a handler.
- No changes to the `NotificationType` union or `NotificationDraft`
  backward-compat surface — all new fields are optional.
- The `formatNotificationSource()` helper is exported but not yet used in
  `NotificationItem.tsx` (the component builds its source inline to keep
  the fallback `data` parsing local). It's available for any future
  reader that wants a clean one-liner.
