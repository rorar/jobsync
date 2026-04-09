# Stream E — Notifications 5W+H Rework (Task 4)

**Status:** Complete
**TypeScript:** `npx tsc --noEmit` clean (0 errors)
**Tests:** 122/122 notification-related tests pass; 315/315 i18n/layout tests pass
**Consult reference:** `/home/pascal/projekte/jobsync/.team-feature/consult-task4-notifications.md`

---

## Files Created

1. **`src/lib/notifications/deep-links.ts`** — centralized 5W+H helpers
   - `buildNotificationActions(type, data)` — per-type deep-link table, returns `{ url, labelKey, variant }[]`
   - `formatNotificationTitle(data, fallback, t)` — late-bound i18n title resolution
   - `formatNotificationReason(data, t)` — optional context sentence
   - `formatNotificationActor(data, t)` — actor display name with fallback chain
   - `resolveNotificationSeverity(type, data)` — severity from data or derived from type

2. **`__tests__/notification-deep-links.spec.ts`** — 17 cases covering:
   - Every notification type in the mapping table
   - Graceful fallback when contextual ids (automationId/jobId) are missing
   - URL-encoding of user-supplied ids (anti-injection)
   - Unknown-type safety
   - Severity derivation (data override + type default)

3. **`__tests__/notification-format.spec.ts`** — 17 cases covering:
   - `formatNotificationTitle` with params, multi-param, missing params (no crash)
   - Fallback to legacy `message` when `titleKey` is absent
   - `formatNotificationReason` with reasonKey / null
   - `formatNotificationActor` with actorNameKey / actorId / actorType fallback chain

## Files Edited

1. **`src/models/notification.model.ts`** — added:
   - `NotificationSeverity` type (`"info" | "success" | "warning" | "error"`)
   - `NotificationActorType` type (`"system" | "module" | "automation" | "user" | "enrichment"`)
   - `NotificationDataExtended` interface — typed extension of the JSON `data` blob carrying the 5W+H late-binding fields (runtime-only, no schema migration)

2. **`src/lib/events/consumers/notification-dispatcher.ts`** — **BUG FIX**: i18n late-binding. All 7 handlers now populate `data.titleKey + titleParams` (resolved in UI at render time) alongside the legacy pre-composed `message` (still dispatched for email/webhook/push fallback):
   - `flushStagedBuffer` (VacancyStaged batch) → `titleKey: "notifications.vacancyBatchStaged.title"`, actorType `"automation"`
   - `handleVacancyPromoted` → `titleKey: "notifications.vacancyPromoted.title"`, actorType `"system"`, severity `"success"`
   - `handleBulkActionCompleted` → `titleKey: "notifications.bulkActionCompleted.title"`, actorType `"user"`, dynamic severity
   - `handleModuleDeactivated` → `titleKey: "notifications.moduleDeactivated.title"`, actorType `"module"`, reasonKey, severity `"warning"`
   - `handleModuleReactivated` → `titleKey: "notifications.moduleReactivated.title"`, actorType `"module"`, severity `"success"`
   - `handleRetentionCompleted` → `titleKey: "notifications.retentionCompleted.title"`, actorType `"system"`, severity `"success"`
   - `handleJobStatusChanged` → `titleKey: "notifications.jobStatusChanged.title"`, actorType `"user"`, severity `"info"`

3. **`src/components/layout/NotificationItem.tsx`** — full rewrite to 5W+H layout:
   - `role="article"` (no more `role="button"` anti-pattern)
   - `aria-labelledby` → title id, `aria-describedby` → reason id
   - `aria-posinset` / `aria-setsize` from dropdown-provided props
   - `<time dateTime={ISO}>` with `title={absolute}` tooltip
   - Header row: actor + relative time + unread dot
   - Body: title (late-bound) + optional reason paragraph
   - Footer: action buttons from `buildNotificationActions` (variant-driven)
   - Dismiss button: always visible on touch, hover-revealed on `md+`
   - Unread marker: left border (`border-l-primary`) + dot
   - Severity icon switched from type-based to severity-based (cleaner decoupling)

4. **`src/components/layout/NotificationDropdown.tsx`** — grouping + feed semantics:
   - Groups notifications into `Today` / `Yesterday` / `This week` / `Earlier` (empty groups omitted)
   - Sticky group headers with localized labels + per-group unread count
   - `role="feed"` + `aria-busy={loading}` on the list container
   - Passes `positionInSet` / `setSize` to each `NotificationItem` with a running index across groups
   - Bumped `max-h-80` → `max-h-96` for two-action footers

5. **`src/components/layout/NotificationBell.tsx`** — responsive container switch:
   - `useMediaQuery("(min-width: 768px)")` selects Popover on desktop, Sheet on mobile
   - Sheet side `right`, 90vw with max-md cap, sr-only SheetTitle for a11y
   - Popover width bumped `w-80` → `w-96` to fit the new two-action footer

6. **`src/i18n/dictionaries/notifications.ts`** — added 28 new keys per locale × 4 locales = **112 new strings**:
   - 11 parametric `title` keys (one per notification type)
   - 4 shared `reason` keys (moduleTimeout, authExpired, circuitBreaker, manualDeactivation)
   - 8 shared `action` keys (viewStaged, openJob, viewStaging, openModules, openAutomation, openApiKeys, viewSettings, dismiss)
   - 5 `group` keys (today, yesterday, thisWeek, earlier, unreadCount)
   - 3 generic `actor` keys (system, automation, user)
   - Existing legacy keys preserved for backward compatibility with old notifications
   - Parity verified: all 4 locales have exactly 48 keys

7. **`__tests__/NotificationItem.spec.tsx`** — rewritten for the new layout:
   - 17 cases covering legacy fallback, titleKey resolution, param substitution, action rendering, `role="article"` presence, `<time datetime>` semantics, actor label rendering, dismiss isolation, JSON parsing, unread styling

8. **`__tests__/NotificationBell.spec.tsx`** — added `useMediaQuery` + Sheet mocks (required because the component now branches on media query; default mock returns `true` for desktop/Popover path to preserve existing test expectations)

9. **`__tests__/notification-dispatcher.spec.ts`** — relaxed the VacancyPromoted assertion to use `expect.objectContaining` on the nested `data` object (the dispatcher now adds `titleKey`, `actorType`, `severity` alongside the existing `stagedVacancyId` / `jobId` fields)

## i18n Key Count Summary

| Locale | Existing keys | New keys (5W+H) | Total |
|---|---|---|---|
| en | 20 | 28 | 48 |
| de | 20 | 28 | 48 |
| fr | 20 | 28 | 48 |
| es | 20 | 28 | 48 |

**Parity check:** 48/48/48/48 — passes.

## Dispatcher Bug Fix Summary

### Before
```typescript
// handleModuleDeactivated — lines ~225-227
const message = t(locale, "notifications.moduleDeactivated")
  .replace("{name}", payload.moduleId)
  .replace("{automationCount}", String(payload.affectedAutomationIds.length));

await dispatchNotification({
  message,               // resolved string — locked to dispatch-time locale
  data: { moduleId, affectedAutomationCount },
});
```

**Problem:** When the user switches locale (e.g., from English to German), historical notifications still render in English because the message was resolved at dispatch time.

### After
```typescript
// handleModuleDeactivated — late-bound titleKey pattern
const message = t(locale, "notifications.moduleDeactivated")  // legacy fallback still populated
  .replace("{name}", payload.moduleId)
  .replace("{automationCount}", String(payload.affectedAutomationIds.length));

const extendedData: NotificationDataExtended = {
  moduleId: payload.moduleId,
  affectedAutomationCount: payload.affectedAutomationIds.length,
  titleKey: "notifications.moduleDeactivated.title",          // i18n key, not resolved text
  titleParams: { moduleName: payload.moduleId },              // params for late substitution
  actorType: "module",
  actorId: payload.moduleId,
  reasonKey: "notifications.reason.manualDeactivation",
  severity: "warning",
};

await dispatchNotification({
  message,               // kept for email/webhook/push channels + legacy clients
  data: extendedData,    // UI uses titleKey via formatNotificationTitle()
});
```

The UI calls `formatNotificationTitle(data, notification.message, t)` at render time, so:
1. The current user locale is applied.
2. Historical notifications update when the user switches language.
3. Legacy notifications (created before this change) fall back to `notification.message` cleanly.

## Deep-Link Mapping Coverage

All 11 notification types in `NotificationType` are mapped in `buildNotificationActions`:

| Type | Action URL | Fallback when ids missing |
|---|---|---|
| `vacancy_batch_staged` | `/dashboard/staging?automationId={id}` | `/dashboard/staging` |
| `vacancy_promoted` | `/dashboard/myjobs/{jobId}` | no action (empty array) |
| `bulk_action_completed` | `/dashboard/staging` | — |
| `module_deactivated` | `/dashboard/settings?section=modules` | — |
| `module_reactivated` | `/dashboard/settings?section=modules` | — |
| `module_unreachable` | `/dashboard/settings?section=modules` | — |
| `cb_escalation` | `/dashboard/automations/{id}` | no action |
| `consecutive_failures` | `/dashboard/automations/{id}` | no action |
| `auth_failure` | `/dashboard/settings?section=api-keys` | — |
| `retention_completed` | `/dashboard/settings?section=retention` | — |
| `job_status_changed` | `/dashboard/myjobs/{jobId}` | no action |

All URLs are internal routes; user-supplied ids are `encodeURIComponent`'d to prevent injection.

## Accessibility Wins (vs. previous implementation)

| Concern | Before | After |
|---|---|---|
| Card role | `role="button"` on a div wrapping nested `<Link>` (a11y anti-pattern) | `role="article"` with `aria-labelledby` / `aria-describedby` |
| Time element | `<span>` with `formatRelativeTime` only | `<time dateTime={ISO}>` with `title={absolute}` tooltip |
| Feed role | `<div className="divide-y">` | `<div role="feed" aria-busy={loading}>` |
| Position info | — | `aria-posinset` / `aria-setsize` per item |
| Action affordance | Single arrow link + text | Full `<Button asChild><Link>` with proper focus rings |
| Dismiss on touch | Hover-only (broken on mobile) | Always visible on `< md`, hover-revealed on `md+` |
| Title-action separation | Whole card click handler competed with nested links | Dismiss and actions are separate buttons; no ambiguous click target |
| Unread indicator | Dot only (visual) | Dot + left border + sr-only marker |

## Mobile vs. Desktop

- **Desktop (`>= 768px`):** Popover (`w-96`, anchored to bell trigger)
- **Mobile (`< 768px`):** Sheet (`side="right"`, 90vw max-md, sr-only SheetTitle)
- Same `NotificationItem` renders in both; Tailwind `md:` modifiers handle the dismiss-visibility swap

Uses the pre-existing `src/hooks/use-media-query.ts` hook (shared with `StagedVacancyDetailSheet`). No new hook file created — assumption in task spec held.

## Grouping

The dropdown groups notifications into time buckets computed client-side from `createdAt`:
- **Today** — same calendar day as `now`
- **Yesterday** — one calendar day before `now`
- **This week** — 2-6 days before `now`
- **Earlier** — 7+ days before `now`

Empty groups are omitted. Each group header is sticky (`position: sticky; top: 0`) and shows a per-group unread count when > 0.

## Deferred Work (for follow-up tasks)

The consultation proposed a full Prisma migration adding `severity`, `titleKey`, `titleParams`, `reasonKey`, `reasonParams`, `actorType`, `actorId`, `actions[]` as top-level columns. This is the right long-term shape but was **out of scope** for this sprint (too large + VM constraints on running migrations in-session). Deferred items:

1. **Prisma schema migration** — promote `NotificationDataExtended` fields to real columns. Requires:
   - `prisma migrate dev --name add_notification_5wh_fields`
   - Backfill script for existing rows (`type → severity`, `type → default titleKey`, etc.)
   - Update `InAppChannel.dispatch()` to write structured columns
   - Update `WebhookChannel` / `EmailChannel` / `PushChannel` payload builders
   - Flip NOT NULL in a second migration

2. **`degradation.ts` notifications** — `src/lib/connector/degradation.ts` creates `auth_failure`, `consecutive_failures`, and `cb_escalation` notifications directly via `prisma.notification.create()`, bypassing the dispatcher. This file is **not** in Stream E's file ownership, so the late-binding fix was not applied there. A follow-up task should:
   - Route these notifications through `dispatchNotification()` (or extract a `buildDraft()` helper)
   - Populate the same `titleKey + titleParams + actorType + reasonKey + severity` structured data
   - Alternatively, wait until the Prisma migration lands and update once structurally

3. **Manifest-driven actor names** — current implementation uses the raw `moduleId` as the actor label (e.g., "eures"). Per consultation §5, these should resolve via `manifest.i18n[locale].name` at render time. Deferred until the `ModuleRegistry` exposes a client-safe name lookup.

4. **Dismiss on mobile in the header row** — consultation §9 recommends moving the dismiss icon next to the time on mobile (instead of the current right-side position). Cosmetic refinement, not shipped in v1.

5. **Focus return after navigation** (`useRestoreFocus`) — consultation §6 recommends focusing the dismiss button on back-nav. Nice-to-have, deferred.

6. **Inline retry actions** (v2) — consultation §8 marks inline server actions as out of scope for v1.

7. **Axe-core a11y test** — consultation §10 Phase E item 21. Not run here; recommended for follow-up full review.

## Integration Points for Other Streams

- **Stream A (Sidebar):** no shared files — safe
- **Stream B (Badge):** no shared files — safe
- **Streams C/D/F (Staging):** Stream C uses `useMediaQuery` from the same shared hook `src/hooks/use-media-query.ts` — no conflict, same import path
- **Orchestrator:** Stream E mocked `@/hooks/use-media-query` in `NotificationBell.spec.tsx` following the existing `StagedVacancyDetailSheet.spec.tsx` precedent — merge-compatible with any Stream C test updates

## Verification Commands

```bash
# TypeScript (clean)
npx tsc --noEmit

# Targeted test suites (all pass)
node --experimental-vm-modules node_modules/.bin/jest \
  --testPathPattern="notification|Notification" --no-coverage
# → 9 suites, 122 tests pass

# i18n/layout regression (no side effects)
node --experimental-vm-modules node_modules/.bin/jest \
  --testPathPattern="dictionar|i18n|formatters|Sidebar|StagedVacancyDetailSheet" --no-coverage
# → 6 suites, 315 tests pass
```

## Summary

- **Bug fixed:** i18n late-binding — notifications now render in the user's *current* locale, not dispatch-time locale
- **5W+H layout:** Who (actor) · When (time) / What (title) / Why (reason) / How+Where (action buttons)
- **A11y:** `role="article"` + `role="feed"`, `<time datetime>`, proper button semantics, non-hover dismiss on mobile
- **Mobile:** Sheet container, always-visible dismiss, shared `NotificationItem` code
- **Grouping:** Today / Yesterday / This week / Earlier with sticky headers and per-group unread counts
- **Zero schema migration:** all new fields carried in the existing `data: Json` column via the typed `NotificationDataExtended` interface
- **Backward compatible:** legacy notifications (no `titleKey`) fall back to `notification.message` cleanly
- **All tests pass** (TypeScript clean, 122 notification tests pass, 315 regression tests pass)
