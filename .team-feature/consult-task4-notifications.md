# UX Consult — Notification Item 5W+H Redesign

**Consultant:** UI Design Agent (Interaction Design)
**Date:** 2026-04-09
**Scope:** NotificationBell, NotificationDropdown, NotificationItem, notification.model, notification-dispatcher, i18n/notifications
**Status:** Opinionated recommendations + ASCII sketch + model/i18n migration plan

---

## 1. Problem Analysis (Current State)

After reading the current code, the gaps against the Five Ws + H framework are:

- **Who is missing.** `Notification.message` is a flat string from the dispatcher. There is no `actorId` / `actorName` / `actorType`. The icon is a weak proxy (a briefcase means "vacancy"), not a real actor.
- **What is buried in a single sentence.** The entire message is one line, so "vacancy promoted" and "12 new vacancies staged from X" render with identical visual weight. There is no scanability.
- **When is partial.** `formatRelativeTime(createdAt, locale)` renders "5 minutes ago" but there is no `<time datetime>`, no absolute tooltip, no exact hover timestamp.
- **Where is fragile.** `getNotificationLink()` hard-codes two cases (`vacancy_promoted` → `/dashboard/myjobs/{jobId}`, fallback → `/dashboard/automations/{automationId}`). Every other type falls back to the automation page or to nothing. Staged vacancies do NOT deep-link to the staging queue. Module failures do NOT deep-link to settings or the module health page.
- **Why is absent.** `ModuleDeactivated`, `cb_escalation`, `consecutive_failures`, `auth_failure` all produce notifications, but the human-readable *reason* (which failure mode, which error message, which run) is only encoded in the `message` string as a flat sentence. There is no structured `reason`.
- **How (action) is a single `X` dismiss.** Currently the user has two affordances: "mark as read" (implicit on click) and "dismiss". There is no primary CTA per event type — no "Retry run", "Reactivate module", "View staging queue", "Investigate".

The current model forces the dispatcher to pre-compose a full sentence, which collapses Who/What/Why into a single `message`. This is the root cause. **We must split composition into structured fields and let the UI render them.**

---

## 2. Data Model Changes (Opinionated)

**Verdict: Add structured top-level fields, do NOT encode in `data` JSON.** The `data` blob is fine for payload-specific details (jobId, moduleId, count) but it is invisible to list renderers and cannot be type-checked. Actor, action, reason, and deep-link are now first-class concerns of every notification.

### Proposed schema (Prisma migration + `notification.model.ts`)

```ts
// src/models/notification.model.ts
export type NotificationActorType =
  | "system"       // Retention job, scheduler
  | "module"       // EURES, Arbeitsagentur, Logo.dev
  | "automation"   // A specific user automation run
  | "user"         // The user themselves (e.g., bulk action)
  | "enrichment";  // Enrichment orchestrator

export type NotificationSeverity = "info" | "success" | "warning" | "error";

export interface NotificationAction {
  /** Stable action identifier, used for i18n lookup + telemetry */
  id: string;              // "view_staging" | "view_automation" | "retry_run" | "reactivate_module" | "view_settings"
  /** Primary href for the action (internal routes only, SSRF-safe) */
  href: string;
  /** Is this the visually-primary CTA? (only one per notification) */
  primary: boolean;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  severity: NotificationSeverity;        // NEW — drives icon/color, decouple from type switch
  // Who
  actorType: NotificationActorType;      // NEW
  actorId: string | null;                // NEW (moduleId, automationId, null for system)
  actorLabel: string | null;             // NEW — resolved display name at dispatch time (e.g., "EURES EU")
  // What
  titleKey: string;                      // NEW — i18n key for the headline (e.g., "notifications.vacancyBatchStaged.title")
  titleParams: Record<string, string | number> | null; // NEW — {count: 12, name: "EURES Berlin"}
  // Why (optional)
  reasonKey: string | null;              // NEW — i18n key for contextual reason ("because CB tripped", "3 failed runs")
  reasonParams: Record<string, string | number> | null; // NEW
  // Where + How
  actions: NotificationAction[];         // NEW — 0..2 actions; first with primary:true is the CTA
  // Existing
  moduleId: string | null;
  automationId: string | null;
  data: Record<string, unknown> | null;  // keep for payload-specific details (retry tokens, runIds, etc.)
  read: boolean;
  createdAt: Date;
}
```

**Migration strategy:** Add columns nullable. Backfill existing rows with a deterministic resolver (`type` → `severity`, `type` → default `titleKey`, `moduleId`/`automationId` → default action). Then flip NOT NULL on `severity`, `actorType`, `titleKey` in a follow-up migration.

**Why not just `data` JSON?**
1. The list renderer cannot safely type-check keys in `data`. It already shows a try/catch + `parseNotificationData` in `NotificationItem.tsx` lines 53–71. That is a smell.
2. i18n keys must be enumerable for translation audits. Stuffing them in `data` defeats `bun run /tmp/test-dictionaries.ts`.
3. Actions have a clear contract (href, primary, labelKey) that should not be ad-hoc per notification type.
4. Actor is a cross-cutting display concern — every notification has one.

**Keep `data` for:** runId (for "Retry" action), jobId (for "View Job"), purgedCount (statistic), historyEntryId, enrichment dimension. These are payload details that may or may not be referenced depending on rendering state.

**Type-safety win:** the dispatcher no longer calls `t(locale, key).replace("{name}", ...)` — that string interpolation is fragile. The dispatcher stores `titleKey + titleParams` and the UI does the locale-aware ICU interpolation. This also means notifications render in the user's *current* locale, not the locale at dispatch time (fixes a latent bug: if the user switches languages, old notifications remain in the old language).

---

## 3. Deep-Link Mapping Table

The rule: **every notification must link SOMEWHERE, even if the link is just the automation detail page.** Silent notifications are user-hostile. Below is the opinionated mapping. The dispatcher builds the `actions[]` array at dispatch time using this table.

| Notification type | Primary action (CTA) | Secondary action | Fallback | Notes |
|---|---|---|---|---|
| `vacancy_batch_staged` | `View {count} staged` → `/dashboard/staging?automationId={id}` | — | `/dashboard/automations/{id}` | Filter the staging queue by the emitting run so the user sees exactly those vacancies. Do NOT link to individual staged item. |
| `vacancy_promoted` | `View job` → `/dashboard/myjobs/{jobId}` | — | `/dashboard/staging` | Already works; formalize it. |
| `bulk_action_completed` | `View affected` → `/dashboard/staging?filter={actionType}` or `/dashboard/myjobs` | — | `/dashboard/staging` | Depends on actionType; promote→myjobs, archive→staging(archived). |
| `retention_completed` | `View retention log` → `/dashboard/settings/retention` | — | — | Or suppress action if pure info toast. |
| `job_status_changed` | `View job` → `/dashboard/myjobs/{jobId}` | `View history` → `/dashboard/myjobs/{jobId}#history-{historyEntryId}` | — | Deep-link with anchor so the timeline scrolls to the new entry. |
| `module_deactivated` | `Reactivate module` → `/dashboard/settings/modules?highlight={moduleId}` | `View affected automations` → `/dashboard/automations?moduleId={moduleId}` | `/dashboard/settings/modules` | Two actions legitimate here. |
| `module_reactivated` | `Review paused automations` → `/dashboard/automations?status=paused&moduleId={moduleId}` | — | — | Remind user to manually resume. |
| `module_unreachable` | `View module health` → `/dashboard/settings/modules?highlight={moduleId}&tab=health` | `Test connection` → server action invoked from the notification (inline) | — | The inline retry is a nice-to-have; first release can link-only. |
| `cb_escalation` | `Review circuit breaker` → `/dashboard/settings/modules?highlight={moduleId}&tab=resilience` | `View last failing run` → `/dashboard/automations/{automationId}/runs/{runId}` | — | runId comes from `data.runId` — dispatcher must include it. |
| `consecutive_failures` | `Investigate automation` → `/dashboard/automations/{automationId}/runs` | `Pause/Resume` → settings | — | Default to the runs list so the user sees the failure pattern. |
| `auth_failure` | `Update credentials` → `/dashboard/settings/modules?highlight={moduleId}&tab=credentials` | — | — | The only correct destination. Must not link to the generic automation page. |
| `enrichment_failed` (future) | `View enrichment log` → `/dashboard/settings/enrichment` | — | (silent per spec) | Per CLAUDE.md: enrichment is best-effort, non-blocking. Do NOT notify users of enrichment failures unless a user explicitly opted in. |
| `AutomationRunCompleted` (future if notified) | `View run` → `/dashboard/automations/{automationId}/runs/{runId}` | `View staged` → `/dashboard/staging?runId={runId}` | `/dashboard/automations/{id}` | Only notify on non-empty runs (jobsSaved > 0) or on failure. |
| `AutomationPaused` (new suggested) | `Resume automation` → `/dashboard/automations/{id}` + anchor `#pause-reason` | `View reason` (same anchor) | — | A paused automation without a notification is a dead end. |

**Deep-link convention (opinionated):**
- Use query params for cross-cutting filters: `?automationId=X`, `?status=paused`, `?highlight=X`.
- Use `#hash-{id}` for anchor-within-page highlights (e.g., `#history-{historyEntryId}`).
- Never use locale-prefixed hrefs — let Next.js i18n middleware handle locale resolution.
- All hrefs must be internal routes; external URLs must never come from notifications (SSRF + phishing surface).

**Dispatcher implementation:** extract a pure function `buildNotificationActions(type, payload)` in `src/lib/notifications/actions-builder.ts`. Unit-test it with a table per type. This is the single source of truth for the mapping above, and it is easy to audit.

---

## 4. Visual Layout — ASCII Sketch

### 4a. Standard item (warning, single primary action)

```
+----------------------------------------------------------------------+
|                                                                       |
|  [!]  EURES Job Board                                 2 minutes ago •|   <- header row: icon + actor + time + unread dot
|  ----                                                    (Apr 9 10:32)|   (time shows absolute on hover)
|                                                                       |
|  Circuit breaker tripped — 4 automations paused                       |   <- headline (bold, 1-2 lines, 5W: What)
|                                                                       |
|  The EURES module has failed 3 times in the last 10 minutes.          |   <- reason (muted, optional, 5W: Why)
|  Last error: "503 Service Unavailable"                                |
|                                                                       |
|  [  Review circuit breaker  ]   View last run           [x Dismiss]   |   <- actions row: primary CTA + secondary + dismiss
|                                                                       |
+----------------------------------------------------------------------+
```

### 4b. Info / success item (no reason, single action)

```
+----------------------------------------------------------------------+
|  [i]  Automation "EURES Berlin"                       5 min ago    • |
|       12 new vacancies staged                                         |
|       [ View staged (12) ]                              [x]           |
+----------------------------------------------------------------------+
```

### 4c. Read item (dimmed)

```
+----------------------------------------------------------------------+
|  [i]  Automation "EURES Berlin"                       yesterday       |
|       12 new vacancies staged                                         |
|       View staged                                       [x]           |
+----------------------------------------------------------------------+
    (whole row at 60% opacity, no unread dot, CTA as text link not button)
```

### 4d. Grouped header

```
+----------------------------------------------------------------------+
|   Today                                             3 unread         |
+----------------------------------------------------------------------+
|  [item 1]                                                             |
|  [item 2]                                                             |
+----------------------------------------------------------------------+
|   Yesterday                                          1 unread         |
+----------------------------------------------------------------------+
|  [item 3]                                                             |
+----------------------------------------------------------------------+
```

### Anatomy breakdown (where does each W sit?)

| Slot | 5W+H element | Source field | Style |
|---|---|---|---|
| Top-left icon | severity (visual shorthand) | `severity` | 16px icon, colored per severity |
| Top-row label | **Who** (actor) | `actorLabel` | 12px, semibold, muted |
| Top-row right | **When** (relative + absolute tooltip) | `createdAt` | 11px, muted, `<time datetime="...">` |
| Top-row right | unread dot indicator | `!read` | 6px primary dot |
| Body headline | **What** | `t(titleKey, titleParams)` | 14px, medium-weight (unread) / regular (read) |
| Body subtitle | **Why** (optional) | `t(reasonKey, reasonParams)` | 12px, muted, 2 lines max, truncate |
| Footer row | **How** (primary) | `actions[0]` | Button, `variant="default" size="sm"` |
| Footer row | **How** (secondary, optional) | `actions[1]` | Button, `variant="ghost" size="sm"` |
| Footer far-right | Dismiss affordance | always-present | Icon button, hover-revealed on desktop, always-visible on mobile |
| Deep link (the whole item) | **Where** (fallback) | `actions[0].href` | Entire card is a nav target on click EXCEPT when clicking explicit buttons |

**Key interaction rule:** clicking the card background navigates to the primary action href AND marks as read. Clicking the primary CTA button does the same (but stops propagation). Clicking secondary or dismiss does NOT navigate. This gives power users a fast path (click anywhere) and careful users an explicit button.

---

## 5. i18n Strategy — One Parametric Key Per Event, Plus Shared Action Keys

**Decision: single parametric `titleKey` per event type, separate optional `reasonKey`, and a SHARED library of action label keys.** This keeps the dictionary small and predictable.

### Current state

`src/i18n/dictionaries/notifications.ts` has one key per type already (e.g., `notifications.batchStaged`), which is right. The problem is the dispatcher uses `.replace("{count}", ...)` on the resolved string and stores the *resolved* sentence in `Notification.message`. That is the bug.

### Proposed key structure

```ts
// src/i18n/dictionaries/notifications.ts (shape after refactor)

// Titles — one per type, ICU-style params.
"notifications.vacancyBatchStaged.title": "{count} new vacancies staged from {automationName}",
"notifications.moduleDeactivated.title": "Module {moduleName} deactivated",
"notifications.cbEscalation.title": "Circuit breaker tripped for {moduleName}",
"notifications.authFailure.title": "Authentication failed for {moduleName}",

// Reasons — one per reason (not per type), reusable across types
"notifications.reason.consecutiveFailures": "{failureCount} consecutive failed runs",
"notifications.reason.circuitBreakerOpen": "Circuit breaker opened {openCount} times",
"notifications.reason.authDenied": "Server returned {statusCode} on last authentication attempt",
"notifications.reason.affectedAutomations": "{count} automation(s) paused",

// Actions — shared vocabulary, NOT per-type
"notifications.action.viewStaged": "View staged ({count})",
"notifications.action.viewJob": "View job",
"notifications.action.viewAutomation": "View automation",
"notifications.action.viewRun": "View run",
"notifications.action.reactivateModule": "Reactivate module",
"notifications.action.updateCredentials": "Update credentials",
"notifications.action.reviewCircuitBreaker": "Review circuit breaker",
"notifications.action.investigate": "Investigate",
"notifications.action.viewHistory": "View history",

// Actor labels — only when the actor is a generic system concept.
// Module actors use the module's manifest-provided i18n name directly (no new keys).
"notifications.actor.system": "System",
"notifications.actor.enrichment": "Enrichment",
"notifications.actor.scheduler": "Scheduler",

// Group headers
"notifications.group.today": "Today",
"notifications.group.yesterday": "Yesterday",
"notifications.group.thisWeek": "This week",
"notifications.group.earlier": "Earlier",
```

**Count:** roughly 14 types × 1 title = 14 title keys, ~8 reason keys (shared), ~10 action keys (shared), ~4 actor keys, 4 group keys = **~40 keys per locale × 4 locales = ~160 strings total**. Compare to the naive 6-keys-per-type approach: 14 × 6 × 4 = 336 strings. The shared-action approach is ~50% less.

**Do NOT ship 6 separate keys per type** (Who-key, What-key, Why-key, etc.). That explodes the dictionary, duplicates translator work, and makes i18n consistency tests thrash. The actor field is fully data-driven (from manifest), the action vocabulary is shared, and reasons are shared across types that have the same root cause.

**Module names:** use the manifest's `i18n` field that already exists per-locale (see CLAUDE.md "Manifest-Driven UI"). The dispatcher resolves `manifest.i18n[locale].name` at render time — not dispatch time — so renaming a module in a future release updates historical notifications. **Store `actorId = moduleId`**, not `actorLabel`, so this late-binding works. (If the module is uninstalled, fall back to a muted "deleted module" label.)

**Rendering helper:** Add a small `renderNotification(notification, locale, t, moduleRegistry)` pure function in `src/lib/notifications/render.ts`. Unit-test it. This is the only place where `titleKey`/`reasonKey`/actor resolution happens. The UI component just calls it.

---

## 6. Accessibility

This is the part most notification lists get wrong. Here is the opinionated spec:

### List semantics

- **Container:** `role="feed"` with `aria-busy` during fetch. Not `role="list"`. A feed is the correct ARIA role for a reverse-chronological stream of items that supports lazy loading (ARIA 1.2 authoring practices §3.33).
- **Each item:** `role="article"` with `aria-posinset`, `aria-setsize`, `aria-labelledby` pointing to the headline element, and `aria-describedby` pointing to the reason (when present).
- **`aria-live`:** Do NOT put `aria-live="polite"` on the list itself (that would announce every existing item on mount). Instead, put a sibling visually-hidden live region (`<div class="sr-only" aria-live="polite" aria-atomic="true">`) and push announcements into it when new items arrive via SSE/poll. Announcement content: "New notification: {titleKey resolved}". Limit to 1 announcement per 3 seconds to avoid screen reader spam.
- **Unread state:** the unread dot is decorative. Add a visually-hidden span: `<span class="sr-only">Unread</span>` or `aria-label="Unread"` on the article.

### Time element

- Wrap relative time in `<time datetime="2026-04-09T10:32:15Z">2 minutes ago</time>`.
- Title attribute on the `<time>` should be the absolute localized timestamp: `title="April 9, 2026, 10:32:15 AM"`.
- Screen readers announce the `datetime` attribute parsed form, not the inner text — set the ISO string accurately.

### Keyboard

- Items are keyboard-reachable via Tab through the list.
- Each item is NOT a `role="button"` (the current code does this — anti-pattern for `feed`).
- Instead: make the headline a Next.js `<Link>` inside the article. Focus lands on the headline link. Enter navigates + marks as read.
- Dismiss button has `aria-label={t("notifications.dismiss")}` (already correct).
- Primary/secondary CTAs are real `<Link>`-wrapped `<Button>`s with proper focus rings.
- **Focus return after navigation:** when the user clicks a notification and Next.js navigates away, on back-nav we should restore focus to the dismiss button of the visited item (for rapid triage workflow). Implement with `useRestoreFocus` hook that reads `history.state`.
- **Escape** closes the dropdown (shadcn Popover does this already).
- **Shift+Tab** from the first item returns to the "Mark all read" button; **Tab** from last item cycles back or moves to a "View all" link in the footer.

### Clickable area vs explicit button

- The entire card has a clickable headline link + explicit buttons. **Do NOT wrap the entire card in a single click handler with `role="button"`** (current code does this on lines 114–128 of NotificationItem.tsx) — it's an anti-pattern when there are nested interactive children (link, buttons, dismiss). Screen readers can't distinguish the nested interactive elements. The whole card being "clickable" visually is fine as long as the DOM has one primary `<a>` (the headline) and the click handler on the card delegates to it.
- Mark-as-read happens as a side effect of both link clicks and explicit button presses. Never as a primary intent.

### Color & contrast

- Severity icons must meet 3:1 non-text contrast minimum.
- Unread bold weight must not be the only unread indicator (the dot + `aria-label="Unread"` provide non-visual cues — good).
- Severity colors must not rely on green-vs-red alone; the icon glyph differs too (CheckCircle, AlertTriangle, XCircle, Info).

---

## 7. Empty State + Grouping

**Grouping decision: yes, group by date, with sticky group headers.** The current flat list is fine for <10 items but degrades quickly.

### Groups

- `Today`, `Yesterday`, `This week`, `Earlier` — computed client-side from `createdAt`.
- Group headers are sticky at the top of the scroll area (CSS `position: sticky; top: 0`) so the user always knows what "time window" they are reading.
- Each group header shows the count of unread items in that group (not total) so the user can prioritize: `Today · 3 unread`.
- A group with zero unread items does NOT render the "unread" chip.
- An empty group does NOT render at all.
- **5W+H for group headers:** groups answer **When** at a higher level. Who/What/Why/Where/How do not apply to groups.

### Empty state

Current: a centered "No notifications" string. Too bland. Proposed:

```
+----------------------------------------------------------------------+
|                                                                      |
|                         [ bell-off icon ]                            |
|                                                                      |
|                       You are all caught up                          |
|                                                                      |
|       New notifications from your automations will appear here.      |
|                                                                      |
|            [ Manage notification settings -> /settings ]             |
|                                                                      |
+----------------------------------------------------------------------+
```

- The CTA to settings is valuable because empty is the best moment to discover preferences.
- i18n keys: `notifications.empty.title`, `notifications.empty.body`, `notifications.empty.ctaSettings`.

---

## 8. Action Affordance Visual Priority

**Rule: one primary CTA, one secondary CTA, one dismiss. Maximum three buttons total.**

Visual hierarchy (top to bottom):
1. **Primary CTA** (`variant="default" size="sm"`) — the "How" answer, always leftmost in the footer row. Uses `actions[0]` where `primary === true`. Every notification has one; if no semantic action fits, the primary is "View" pointing to the best-guess resource (never null).
2. **Secondary CTA** (`variant="ghost" size="sm"`) — an alternative route. Often "View history" or "View last run". Omitted for simple info notifications.
3. **Dismiss** (`variant="ghost" size="icon"` with `X` icon, aria-label="Dismiss") — always last, right-aligned. On desktop: hover/focus reveal. On mobile: always visible (no hover state on touch).

**Mark-as-read is NOT a button.** It happens implicitly on navigation or on explicit primary-click. Adding "Mark as read" as a third button clutters the footer. The "Mark all as read" button in the dropdown header covers the bulk case.

**Destructive actions** (e.g., "Delete module"): never put them in notifications. Notifications link to the settings page where destructive operations live behind proper confirmation dialogs.

**Inline actions vs navigation:** for v1, all actions navigate. In a future release, consider inline actions for ultra-common operations (`Retry run` without page change) via server actions invoked from the notification. This is a v2 concern — keep v1 link-only.

---

## 9. Mobile vs Desktop

**Decision: different container, same item structure.**

### Desktop (≥768px)

- **Container:** shadcn `Popover` dropdown from the bell button (current approach). Width: `w-96` (bumped from `w-80` to fit the new 2-action footer without horizontal overflow). Max-height: `80vh` with internal scroll.
- **Item footer buttons:** right-aligned, inline.
- **Dismiss:** hover-revealed (current pattern).

### Mobile (<768px)

- **Container:** shadcn `Sheet` sliding from the right edge, full-height, 90% width. Reasoning: the popover anchor becomes unreliable on small screens (might clip); a full-height sheet is the established mobile pattern for notification centers (iOS, Android, GMail).
- **Item footer buttons:** full-width stacked when the combined width exceeds the card. Primary on top, secondary below, dismiss as always-visible icon in the header row next to the time.
- **Dismiss:** always visible (no hover on touch). Place it in the top-right of the header row, not the footer.
- **Tap targets:** minimum 44×44 px for all interactive elements (WCAG 2.5.5 Target Size).

### Implementation

- Use a single `NotificationItem` component that takes a `variant: "popover" | "sheet"` prop. The variant shifts the dismiss-button position and footer-button layout via Tailwind classes. Avoid separate mobile/desktop components (DRY, a11y parity, single i18n source).
- Detect viewport with `useMediaQuery("(min-width: 768px)")` in `NotificationBell` and swap Popover for Sheet. shadcn provides both; wiring is straightforward.
- State lives in a shared `NotificationsContext` so the dropdown and the sheet share the same fetch/mark-read logic.

---

## 10. Implementation Roadmap (Suggested Phasing)

To land this without a 1000-line PR:

### Phase A — Data model (sequential, required first)
1. Prisma migration adding `severity`, `actorType`, `actorId`, `titleKey`, `titleParams`, `reasonKey`, `reasonParams`, `actions` (JSON column).
2. Backfill existing rows with a resolver script.
3. Update `notification.model.ts` + add `NotificationAction`, `NotificationSeverity`, `NotificationActorType`.
4. Update the In-App channel (`src/lib/notifications/channels/in-app.channel.ts`) to persist the new fields.

### Phase B — Dispatcher refactor (depends on A)
5. Extract `buildNotificationActions(type, payload)` → `src/lib/notifications/actions-builder.ts`.
6. Extract `buildNotificationTitle(type, payload)` → returns `{ titleKey, titleParams, reasonKey?, reasonParams?, severity, actorType, actorId }`.
7. Refactor each handler in `notification-dispatcher.ts` to stop calling `.replace()` and instead populate structured fields.
8. Keep `draft.message` populated (deprecation: fallback rendering) — compute it from `titleKey` resolution at dispatch time so email/webhook/push channels still work. **Migrate each channel to read structured fields in a follow-up.**

### Phase C — UI rendering (depends on A, parallel with B)
9. Add `renderNotification(notification, locale, t, moduleRegistry)` helper + tests.
10. Rewrite `NotificationItem.tsx` against the new layout. Delete `parseNotificationData` (no longer needed). Add proper ARIA (`role="article"`, `aria-posinset`, `<time datetime>`).
11. Update `NotificationDropdown.tsx` with `role="feed"`, date grouping, empty-state CTA, width bump.
12. Add `NotificationSheet.tsx` for mobile (or a variant of the dropdown).
13. Add `useMediaQuery` wiring in `NotificationBell.tsx`.

### Phase D — i18n (depends on C)
14. Add new keys: titles per type, reason library, action library, group headers, empty state CTA. 4 locales.
15. Delete old resolved-string keys (e.g., `notifications.moduleDeactivated`) once dispatcher no longer uses them.
16. Run `bun run /tmp/test-dictionaries.ts`.

### Phase E — Tests
17. Unit tests for `buildNotificationActions` (one table test per type).
18. Unit tests for `renderNotification` (locale switching, missing actor, missing reason).
19. Component tests for `NotificationItem` (primary action click, dismiss, unread dot, time semantics).
20. E2E test for the full flow: trigger an automation failure → observe notification → click CTA → land on settings page with correct `highlight` query param.
21. Accessibility test: axe-core run on the dropdown in both empty and populated states.

### Phase F — Documentation
22. Update `docs/adr/` with an ADR: "Notifications use structured fields (title + reason + actions) instead of pre-composed messages."
23. Update `specs/notification-dispatch.allium` to capture the new entity shape.
24. Update `docs/BUGS.md` if any latent issues are resolved (the locale-at-dispatch-time issue mentioned in §2 likely has a BUGS.md entry).

---

## 11. Opinionated Summary

**What to do now (tl;dr):**
1. **Add `severity`, `actorType`, `actorId`, `titleKey`, `titleParams`, `reasonKey`, `reasonParams`, `actions[]` as top-level Notification fields.** Stop encoding them in `data`.
2. **Dispatcher stores keys, not resolved sentences.** Late-bind i18n at render time via `renderNotification()` so locale changes and module renames update history.
3. **Every notification has at least one action, every action has a real href.** Build the mapping centrally in `actions-builder.ts` with a per-type table. No more `if (type === "vacancy_promoted")` branches in the item component.
4. **Layout:** header row (actor + time), body (title + optional reason), footer (primary CTA + optional secondary + dismiss). ASCII sketch above.
5. **i18n:** ~40 keys per locale. One parametric title per type, shared reason/action vocabulary. Module names come from manifest, not the dictionary.
6. **ARIA:** `role="feed"` + `role="article"` + `<time datetime>` + sr-only live region for new items. Not `role="button"` on the card.
7. **Group by Today/Yesterday/This week/Earlier.** Sticky headers. Per-group unread counts.
8. **Mobile: Sheet. Desktop: Popover.** Same `NotificationItem` with a `variant` prop. Dismiss always-visible on mobile.
9. **No "mark as read" button.** Mark-as-read is implicit on navigation. "Mark all as read" stays in the header.
10. **Empty state must have a CTA to notification settings.** Zero-state is the best teaching moment.

**What NOT to do:**
- Do not add a separate i18n key per W per type (336 strings is bloat).
- Do not add inline retry-style server actions in v1 (v2 concern).
- Do not link to external URLs from notifications (SSRF + phishing).
- Do not keep `role="button"` on the card.
- Do not rely on `data` JSON for rendering concerns (actor, action, title). Reserve `data` for payload details.
- Do not notify on enrichment failures unless the user opts in (CLAUDE.md: enrichment is best-effort, non-blocking).

---

## Files the Implementation Agents Will Touch

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add columns to `Notification` model |
| `src/models/notification.model.ts` | Add types; extend `Notification` interface |
| `src/lib/notifications/types.ts` | Extend `NotificationDraft` |
| `src/lib/notifications/actions-builder.ts` | NEW — per-type action mapping |
| `src/lib/notifications/render.ts` | NEW — `renderNotification()` helper |
| `src/lib/notifications/channels/in-app.channel.ts` | Persist new fields |
| `src/lib/notifications/channels/webhook.channel.ts` | Read new fields, include in payload |
| `src/lib/notifications/channels/email.channel.ts` | Read new fields, render in template |
| `src/lib/notifications/channels/push.channel.ts` | Read new fields, map to push payload |
| `src/lib/events/consumers/notification-dispatcher.ts` | Stop using `.replace()`, populate structured fields |
| `src/components/layout/NotificationBell.tsx` | Add `useMediaQuery` + Sheet variant |
| `src/components/layout/NotificationDropdown.tsx` | `role="feed"`, grouping, empty-state CTA |
| `src/components/layout/NotificationItem.tsx` | Full rewrite against new layout + ARIA |
| `src/components/layout/NotificationSheet.tsx` | NEW — mobile variant |
| `src/i18n/dictionaries/notifications.ts` | Add ~40 keys × 4 locales |
| `specs/notification-dispatch.allium` | Update entity shape |
| `docs/adr/ADR-XXX-notification-structure.md` | NEW ADR |
| `__tests__/notification-actions-builder.spec.ts` | NEW |
| `__tests__/notification-render.spec.ts` | NEW |
| `__tests__/notification-item.spec.tsx` | NEW |
| `e2e/crud/notifications.spec.ts` | NEW |

End of consult.
