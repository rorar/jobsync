# Data Storytelling Review — Notification Channel Implementation (S5b)

**Reviewer:** Business Analytics Perspective
**Date:** 2026-04-05
**Scope:** Multi-channel notification system (InApp, Webhook, Email, Push)
**Files reviewed:**
- `src/lib/notifications/channel-router.ts`
- `src/lib/notifications/types.ts`
- `src/models/notification.model.ts`
- `src/components/settings/SmtpSettings.tsx`
- `src/components/settings/PushSettings.tsx`
- `src/components/settings/WebhookSettings.tsx`
- `src/components/settings/NotificationSettings.tsx`
- `src/components/settings/SettingsSidebar.tsx`
- `src/lib/notifications/channels/webhook.channel.ts`

---

## Executive Summary

The notification system implements a technically sound multi-channel architecture with proper error isolation, HMAC security, and retry logic. From a data storytelling and business analytics perspective, however, the user is operating almost entirely blind. Channel health, delivery outcomes, and channel coverage are invisible. The system records failure counts on webhook endpoints and emits in-app notifications for deactivations, but these data points are scattered, not aggregated, and carry no trend context. A user who opens Settings today cannot answer three basic questions:

1. Which of my channels are actually working right now?
2. How many notifications have I missed because a channel was down or disabled?
3. Is my notification coverage getting better or worse over time?

---

## 1. Channel Coverage

### 1.1 Unified Channel Status Overview

**Current state.** Channel configuration is split across four separate Settings sidebar entries ("Notifications", "Webhooks", "Email", "Push"). There is no single view that shows all four channels and their current operational state simultaneously. The `NotificationSettings` component controls the global kill switch and the inApp toggle, but it contains no reference to whether email, webhook, or push is configured. The sidebar itself carries no health indicator except the error-log badge.

**Gap.** A user who has just configured SMTP and enabled push on one device cannot tell — without visiting four separate pages — whether all channels are ready. There is no cross-channel summary. The channel toggles in `NotificationPreferences.channels` (webhook, email, push) are not even surfaced in `NotificationSettings.tsx`; only `inApp` is. This means a user who has SMTP configured but the email channel toggle set to `false` receives no visual cue that email delivery is suppressed at the preference level rather than the infrastructure level.

**Recommendation.** Add a "Channel Coverage Card" at the top of the Notifications settings section. It should render one status row per channel (in-app, email, webhook, push) showing: configured/not configured, enabled/disabled at the preference level, and operational status (last test result or failure count). Four rows, each with a coloured status dot (green / amber / red / grey), are sufficient. This is a read-only summary that links to the detailed section for each channel.

**Priority: P1** — This is the single highest-impact storytelling gap. Without it, the multi-channel architecture is invisible to the user.

---

### 1.2 The Missing Webhook/Email/Push Channel Toggles in NotificationSettings

**Current state.** `NotificationSettings.tsx` renders a toggle for `channels.inApp` only (line 214–230). The `ChannelConfig` type in `types.ts` defines `webhook`, `email`, and `push` boolean fields, and `shouldNotify()` in `notification.model.ts` gates each channel on `prefs.channels[channel]`. The `DEFAULT_NOTIFICATION_PREFERENCES` sets webhook, email, and push all to `false`.

**Gap.** There is no UI to enable the webhook, email, or push channel toggle in preferences. A user who configures SMTP and expects email delivery will find it silently suppressed unless some other code path sets `channels.email = true` at account creation or SMTP setup time. The `saveSmtpConfig()` server action was not reviewed here but this risk warrants verification. This is a functional gap, not just a storytelling gap, but its invisibility makes it a data storytelling failure too.

**Recommendation.** Either (a) auto-enable the channel preference when the user saves a configuration (SMTP save sets `channels.email = true`, push subscribe sets `channels.push = true`), or (b) surface all four channel toggles in `NotificationSettings.tsx` with contextual descriptions of what "enabled" means for each. Option (a) is the stronger user experience but requires a verified audit of each save action. If (a) is adopted, the Channel Coverage Card from 1.1 should still show the inferred state clearly.

**Priority: P0** — This is a potential silent delivery failure. Users who configure email/push and receive nothing will not understand why.

---

### 1.3 Visibility of Suppressed Notifications

**Current state.** The `shouldNotify()` function returns `false` for quiet hours, disabled channel, disabled per-type toggle, and disabled global switch. When a notification is suppressed, there is no record of the suppression. `ChannelRouterResult` returns `anySuccess: false` with an empty `results` array (the channel is simply skipped, not added to results), and nothing is persisted.

**Gap.** A user with quiet hours enabled from 22:00–07:00 may miss a critical `auth_failure` or `consecutive_failures` notification during that window. They have no way to see: "3 notifications were suppressed overnight due to quiet hours." The current model treats suppression as equivalent to the notification not existing.

**Recommendation.** For per-type and quiet-hours suppression, the in-app channel should still receive the notification regardless of quiet hours (quiet hours should gate external channels only — email, push, webhook). If this requires a model change, at minimum add a "Suppressed notifications: N since last login" count to the channel coverage card. A 30-day suppression log is not necessary; a rolling 7-day counter per suppression reason (quiet hours, disabled channel, disabled type) would give the user sufficient signal.

**Priority: P2** — Quiet hours suppression of `auth_failure` is the concrete harm case. The broader suppression visibility is a storytelling improvement.

---

## 2. Delivery Success

### 2.1 Webhook Delivery Failures

**Current state.** The `WebhookChannel` tracks `failureCount` per endpoint and writes it to the `WebhookEndpoint` model. When `failureCount >= 3` it fires an in-app notification "Webhook delivery failed". When it reaches 5, it auto-deactivates the endpoint and fires another in-app notification. The `EndpointRow` component in `WebhookSettings.tsx` shows `failureCount` as a red destructive badge (line 551–555) and in the expanded detail view. This is the strongest delivery-feedback story in the entire system.

**Gap.** The `failureCount` is a cumulative counter that resets to zero on any success. It is not a rate or a trend. A user looking at "Failure count: 2" cannot tell whether those two failures happened 5 minutes ago or 3 weeks ago. There is no timestamp on when the last failure occurred. The "last delivery success" date is also absent — a user has no confirmation that the endpoint has successfully delivered anything recently. Additionally, the failure notification in-app uses `type: "module_unreachable"` which is semantically wrong (this is a webhook delivery failure, not a module health event) and makes it indistinguishable from automation-related failures in the notification feed.

**Recommendation.**
- Add `lastDeliveredAt: DateTime?` and `lastFailedAt: DateTime?` to the `WebhookEndpoint` Prisma model. Surface both in `WebhookEndpointDTO` and in the expanded endpoint row.
- Display "Last delivery: {date}" in green text when `lastDeliveredAt` is recent, amber when stale (>7 days), absent when never delivered.
- Use a dedicated notification type `webhook_delivery_failed` instead of `module_unreachable` to allow per-type filtering.
- Show a small sparkline or failure rate badge (e.g., "2 of last 5 failed") if delivery history is stored.

**Priority: P1** — Users with failing webhooks need temporal context to diagnose. The current badge says something broke but not when.

---

### 2.2 Email Delivery Feedback

**Current state.** `SmtpSettings.tsx` provides a "Test Email" button with a 60-second cooldown. The test either succeeds (toast) or fails (toast with error). There is no persistent record of the last test result. The `SmtpConfig` Prisma model (per CLAUDE.md) has an `active` boolean but no delivery history fields. Production delivery outcomes (from `EmailChannel`) are not visible to the user at all.

**Gap.** A user who configured SMTP 2 weeks ago and has not tested since has no indication whether email delivery is still working. If the SMTP provider rotates credentials, or the host changes TLS requirements, delivery fails silently. The system has no persistent delivery health record for email.

**Recommendation.**
- Add `lastTestedAt: DateTime?` and `lastTestResult: String?` (success / error message) to `SmtpConfig`. Display "Last tested: {date} — OK" or "Last tested: {date} — Failed: {reason}" in the settings card.
- For production delivery, track a rolling `emailDeliveryFailCount` analogous to `webhookFailureCount`. After 3 consecutive email delivery failures, surface a warning banner in the Email settings card.
- Show a health status indicator (green dot, amber warning, red error) in the settings sidebar next to the "Email" entry — following the same pattern as the error-log badge already implemented.

**Priority: P1** — Silent SMTP failure is the most common real-world failure mode for self-hosted mail configurations.

---

### 2.3 Push Delivery Feedback

**Current state.** `PushSettings.tsx` shows `deviceCount` (number of active subscriptions) and a "Test Push" button with a 60-second cooldown. Stale subscriptions (410 Gone, 404 Not Found) are deleted silently. There is no visible indication that a subscription was deleted, nor any delivery success/failure history.

**Gap.** A user who last used JobSync on a given device 3 months ago does not know that subscription was cleaned up. They see "2 devices" but one may be a stale cleaned-up subscription from a device they no longer own. More critically, there is no feedback that a push delivery attempt failed on a specific device — the failure is swallowed in `PushChannel` after the stale subscription is removed.

**Recommendation.**
- Show device subscription details: browser/device agent, date subscribed, date of last successful delivery. This transforms the opaque "2 devices" count into actionable information.
- Add a "subscription cleaned up" in-app notification when a 410/404 causes a subscription deletion, so users understand why their device count decreased.
- Display a health badge ("Active", "Stale — last delivery >7 days ago") per subscription.

**Priority: P2** — The current device count is decorative. Per-subscription health information is the useful version.

---

### 2.4 Multi-Channel Delivery Confirmation

**Current state.** `ChannelRouterResult` returns `anySuccess: boolean` and `results: ChannelResult[]`. These results are not persisted anywhere. The calling code (the dispatcher) receives them but there is no audit trail of which channels delivered a specific notification.

**Gap.** A user cannot look at a notification in the notification feed and see "This was delivered via in-app + email but webhook failed." There is no multi-channel delivery receipt. For debugging ("I got the in-app notification but not the email"), users have no self-service diagnostic tool.

**Recommendation.**
- Persist `ChannelRouterResult` as a JSON column on the `Notification` model (e.g., `channelResults: String?`). This is a low-schema-cost addition.
- In the notification detail view or notification list tooltip, show a small channel delivery indicator: icons for each channel (in-app, email, push, webhook) with green check or red X.
- This also enables a future "Notification Delivery History" table in Developer settings.

**Priority: P3** — This is valuable for power users and developers but not required for core usability.

---

## 3. Channel Adoption

### 3.1 Guidance Toward Additional Channels

**Current state.** Each channel settings card presents its configuration form in isolation. There is no cross-selling or progressive disclosure between channels. The sidebar lists "Notifications", "Webhooks", "Email", "Push" as equal-weight entries. A new user who sets up JobSync and opens the notification settings sees the global toggle and the in-app channel toggle with no prompt to explore additional channels.

**Gap.** The four channels each serve distinct use cases that are not articulated in the UI:
- In-app: requires active browser session
- Email: asynchronous, persistent, good for daily summaries
- Push: instant, device-native, no browser tab required
- Webhook: integrations with external tools (Slack, Zapier, n8n)

None of this is communicated. The empty state for SMTP (`smtpNoConfigDesc`) and the empty state for Push (`pushDescription`) exist, but they describe mechanics, not benefits.

**Recommendation.**
- On the Channel Coverage Card (from 1.1), add a one-sentence value proposition per unconfigured channel: "Email — receive notifications even when JobSync is not open" with a "Set up" deep-link button.
- In `NotificationSettings.tsx`, below the in-app channel toggle, add a collapsed "More channels" section that lists the three external channels with their current configured/not-configured status and a direct link. This surfaces the multi-channel capability without cluttering the primary flow.
- Change the empty-state descriptions in SMTP and Push to lead with the user benefit, not the technical description.

**Priority: P2** — Low-effort high-clarity improvement. The architecture supports four channels but most users will only discover them by exploring the sidebar.

---

### 3.2 Channel Readiness vs. Channel Enabled Confusion

**Current state.** Two orthogonal concepts control whether a channel delivers: (a) infrastructure readiness (SMTP configured, push subscribed, webhook endpoint exists) and (b) preference-level enabled toggle in `NotificationPreferences.channels`. These are managed on separate pages with no visual link between them.

**Gap.** A user can have SMTP configured (infrastructure ready) but `channels.email = false` (preference disabled), and receive nothing, with no indication why. The inverse is also possible: `channels.email = true` but no SMTP config, causing the `isAvailable()` check to fail silently. Neither failure mode produces a user-visible warning.

**Recommendation.**
- Introduce a clear visual distinction in the UI between "configured" (infrastructure exists) and "enabled" (will receive notifications). A two-part indicator per channel — e.g., a grey infrastructure icon and a green/grey delivery icon — communicates both states independently.
- When infrastructure is ready but the preference toggle is off, show: "Email is configured but delivery is disabled. Enable it in Notification Preferences."
- When the preference toggle is on but infrastructure is missing, show: "Email delivery is enabled but no SMTP server is configured. Set up SMTP to receive email notifications."

**Priority: P1** — This confusion leads directly to silent notification failures. It is the most actionable UX gap in the current system.

---

## 4. Data Visualization Opportunities

### 4.1 Notification Health Widget (Dashboard)

**Current state.** The dashboard contains several well-implemented widgets: `StatusFunnelWidget`, `ActivityCalendar`, `WeeklyBarChartToggle`, `TopActivitiesCard`. None of these reference notification system health.

**Gap.** The notification system is a core reliability layer for automation monitoring. An automation that enters a degraded state and fires a `consecutive_failures` notification is meaningless if the user never receives it. There is no dashboard-level signal about notification health.

**Recommendation.** Add a compact "Notification Health" widget to the dashboard. It should be a single-row card, not a prominent widget, showing:

```
Notifications [green dot] All channels active | 23 delivered today
```

When any channel is degraded:

```
Notifications [amber dot] Email delivery failing | 3 missed (SMTP error)
```

The widget links to the Notifications settings section. It requires only the data that already exists (failureCount, configured status) plus a daily delivery count which could be added to the `Notification` model as a simple count query. This widget follows the same pattern as the `NumberCard` component already in the dashboard.

**Priority: P2** — High visibility for a low-cost addition. The data already exists in the schema.

---

### 4.2 Webhook Failure Trend in EndpointRow

**Current state.** The `EndpointRow` shows a static `failureCount` integer. The amber `AlertTriangle` icon exists in the import list of `WebhookSettings.tsx` but is not used in the endpoint list.

**Gap.** The failure count carries no temporal information. A count of 2 could mean "two failures in the last hour" or "two failures over the past six months". There is no mini-chart, no timestamp, no trend.

**Recommendation.** Replace the raw failure count badge with a structured health indicator:
- Green badge "Healthy" when `failureCount === 0` and `lastDeliveredAt` is within 7 days
- Amber badge "Degraded" when `failureCount > 0` but below the deactivation threshold, with the `lastFailedAt` timestamp
- Red badge "Deactivated" when `active === false`, with reason text "Auto-deactivated after 5 failures"

The `AlertTriangle` icon that is already imported but unused should appear in the Degraded and Deactivated states. This is a purely CSS/component change with no new data required if `lastFailedAt` is added to the model.

**Priority: P1** — The visual affordance (`AlertTriangle` imported but unused) suggests this was intended but not completed.

---

### 4.3 Settings Sidebar Health Badges

**Current state.** The `SettingsSidebar` shows a destructive badge with error count on the "Error Log" entry only (lines 92–99 in `SettingsSidebar.tsx`). The pattern is already established. The sidebar imports `AlertTriangle` and uses it for the error-log icon.

**Gap.** Channel health issues (failing SMTP, auto-deactivated webhook, stale push subscription) are buried inside their respective settings pages. A user who navigates to Settings for another reason (e.g., API keys) will not notice a failing email channel unless they happen to click "Email".

**Recommendation.** Extend the sidebar badge pattern to notification-adjacent entries:
- "Email" sidebar entry: amber badge when SMTP is configured but `lastTestResult` indicates failure or `emailDeliveryFailCount > 0`
- "Webhooks" sidebar entry: amber badge when any endpoint has `failureCount > 0`, red badge when any endpoint was auto-deactivated
- "Push" sidebar entry: amber badge when `deviceCount === 0` but the channel is preference-enabled

This requires a shared hook (e.g., `useNotificationChannelHealth()`) that fetches lightweight health indicators. The query cost is minimal — three count queries with basic where-clause filters.

**Priority: P2** — The sidebar badge pattern has already been proven valuable for the error log. Extending it to channels is a natural, low-cost improvement with high discoverability value.

---

### 4.4 Delivery Rate Metrics: What Could Be Shown

If delivery history were persisted (see recommendation 2.4), the following metrics become available with no additional infrastructure:

| Metric | Definition | Display Format |
|---|---|---|
| Delivery rate (7 days) | Successful dispatches / total dispatches per channel | Percentage badge or sparkline |
| Average delivery latency | Time from event to first successful delivery | e.g., "avg 1.2s" |
| Notifications per day | Count of `Notification` records grouped by date | 7-day mini bar chart |
| Channel mix | What % of notifications reached each channel | Small horizontal stacked bar |
| Top notification types | Which `NotificationType` values fired most | Simple ranked list |

None of these require external analytics. All data is either already in the `Notification` table or would be with a `channelResults` column and a `deliveredAt` timestamp.

The most immediately useful metric for the Settings page is delivery rate per channel. A single sentence — "Email: 94% delivery rate (last 7 days)" — transforms a static configuration panel into a living health indicator.

**Priority: P3** — These metrics require schema additions and a data retention policy. They are the right long-term direction but not blocking for the current release.

---

## 5. Priority Summary

| ID | Finding | Component | Priority |
|---|---|---|---|
| 1.2 | Channel preference toggles for email/push/webhook missing from NotificationSettings | `NotificationSettings.tsx` | P0 |
| 1.1 | No unified channel coverage card showing all 4 channels | Settings — Notifications section | P1 |
| 3.2 | No visual distinction between "configured" and "enabled" states | SmtpSettings, PushSettings | P1 |
| 2.1 | Webhook failureCount has no temporal context; AlertTriangle unused | `WebhookSettings.tsx`, `WebhookEndpoint` model | P1 |
| 2.2 | Email delivery has no persistent health record | `SmtpConfig` model, `SmtpSettings.tsx` | P1 |
| 1.3 | Notifications suppressed by quiet hours leave no record | `channel-router.ts`, notification model | P2 |
| 2.3 | Push device count is opaque; stale subscription removal is invisible | `PushSettings.tsx` | P2 |
| 3.1 | No cross-channel adoption guidance or value proposition | `NotificationSettings.tsx` | P2 |
| 4.1 | No Notification Health widget on dashboard | `src/components/dashboard/` | P2 |
| 4.3 | Sidebar health badges not extended to channel entries | `SettingsSidebar.tsx` | P2 |
| 4.2 | WebhookEndpointRow AlertTriangle imported but unused; no health states | `WebhookSettings.tsx` | P1 |
| 2.4 | No multi-channel delivery receipt on individual notifications | `Notification` model, channel-router | P3 |
| 4.4 | No delivery rate metrics or trend data | Schema, Settings, Dashboard | P3 |

---

## 6. Model Changes Required

The following database/type changes would unlock the highest-priority recommendations without requiring new infrastructure:

**WebhookEndpoint model additions:**
- `lastDeliveredAt DateTime?` — timestamp of last successful delivery
- `lastFailedAt DateTime?` — timestamp of most recent failure

**SmtpConfig model additions:**
- `lastTestedAt DateTime?` — timestamp of last test send
- `lastTestResult String?` — "ok" or error message truncated to 255 chars
- `deliveryFailCount Int @default(0)` — rolling consecutive failure counter

**WebPushSubscription model additions:**
- `lastDeliveredAt DateTime?` — timestamp of last successful push to this subscription

**Notification model additions:**
- `channelResults String?` — JSON serialization of `ChannelResult[]` from router
- `deliveredAt DateTime?` — timestamp when routing completed (distinct from `createdAt`)

These are all nullable additions and introduce no breaking changes to existing queries. The most valuable single addition is `lastDeliveredAt` on `WebhookEndpoint` because it transforms the static failure count into a temporal health signal.

---

## 7. Relationship to Existing Patterns

The dashboard already demonstrates good data storytelling patterns:

- `StatusFunnelWidget` shows a pipeline with quantified drop-offs — the right mental model for channel delivery rates
- The `NumberCard` component with percentage change indicators is the right building block for per-channel delivery metrics
- The error-log sidebar badge is the right pattern for surfacing channel health without adding visual noise

The notification system should adopt these patterns rather than invent new ones. The existing visual language — badges, colored status dots, compact single-row cards — is sufficient for the P0/P1 recommendations without introducing new UI dependencies.

---

*Review methodology: static code analysis of the 9 files listed in scope. No runtime data was collected. All gap assessments are based on the absence of data persistence, the absence of cross-component state sharing, and the absence of contextual UI cues visible in the component render paths.*
