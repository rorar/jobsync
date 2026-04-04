# 3-Stage Analysis: Blind Spots, DAU/BDU, Edge Cases

**Sprint:** S5a
**Date:** 2026-04-04
**Scope:** All files changed in S5a (53 files)

---

## Summary

| Category | CRITICAL | HIGH | MEDIUM | LOW | Total |
|---|---|---|---|---|---|
| Blind Spot | 1 | 3 | 4 | 1 | 9 |
| DAU/BDU | 0 | 2 | 3 | 1 | 6 |
| Edge Case | 1 | 2 | 3 | 1 | 7 |
| **Total** | **2** | **7** | **10** | **3** | **22** |

---

## Stage 1: Blind Spots -- Silent Failures

### BS-1: WebhookChannel is never registered in ChannelRouter (CRITICAL)

- **Severity:** CRITICAL
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:41`
- **Description:** The `notification-dispatcher.ts` registers `new InAppChannel()` on the channel router, but `WebhookChannel` is never registered anywhere in production code. The only place `new WebhookChannel()` appears is in test files. This means webhooks will never fire for any domain event -- the entire webhook delivery pipeline is dead code in production.
- **Fix:** Add `import { WebhookChannel } from "@/lib/notifications/channels/webhook.channel";` and `channelRouter.register(new WebhookChannel());` in `notification-dispatcher.ts` alongside the InAppChannel registration (line 41).

### BS-2: StatusFunnelWidget fetchData has no try-catch (HIGH)

- **Severity:** HIGH
- **File:** `src/components/dashboard/StatusFunnelWidget.tsx:93-104`
- **Description:** The `fetchData` callback calls `await getStatusDistribution()` without a try-catch. If the server action throws (e.g., network error, Prisma connection lost), the promise rejection is unhandled. The component stays stuck in loading state forever because `setState` in the error branch is never reached.
- **Fix:** Wrap the `await getStatusDistribution()` call in try-catch. In the catch block, set `setState({ status: "error", message: "errors.fetchStatusDistribution" })`.

### BS-3: Webhook serial delivery blocks on slow endpoints (HIGH)

- **Severity:** HIGH
- **File:** `src/lib/notifications/channels/webhook.channel.ts:234`
- **Description:** The `for (const endpoint of matchingEndpoints)` loop delivers to endpoints sequentially. Each delivery includes up to 3 retries with backoffs of 1s, 5s, 30s. With 10 endpoints, if all are slow/failing, a single dispatch call could block for up to 10 x (10s timeout x 3 attempts + 36s backoff) = 460 seconds total. This blocks the event bus consumer and stalls all subsequent notifications.
- **Fix:** Use `Promise.allSettled()` to deliver to endpoints in parallel, or at minimum add a per-endpoint total timeout (e.g., 45s). Consider moving webhook delivery to a background queue.

### BS-4: Webhook failure count race condition (HIGH)

- **Severity:** HIGH
- **File:** `src/lib/notifications/channels/webhook.channel.ts:272-289`
- **Description:** The failure count increment reads `endpoint.failureCount` from the initial query (line 192), increments in memory, and writes back. If two concurrent notifications dispatch to the same endpoint and both fail, they both read the same `failureCount`, both increment to the same value, and one increment is lost. This means auto-deactivation at threshold 5 may not trigger until attempt 6-10.
- **Fix:** Use Prisma `update` with `increment` instead of read-then-write: `data: { failureCount: { increment: 1 } }`. Then query the updated count with a `select` to check the threshold.

### BS-5: StagedBuffer timers leak on server restart (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/lib/events/consumers/notification-dispatcher.ts:56`
- **Description:** The `stagedBuffers` Map holds `setTimeout` references in memory. If the process restarts (HMR in dev, deployment in prod) while buffers are active, the buffered vacancy counts are silently lost. No notification is ever sent for those vacancies.
- **Fix:** Accept as known limitation for in-memory architecture. Document that staged vacancy notifications may be lost during server restarts. For production resilience, consider persisting buffer state to the database before flush.

### BS-6: Enrichment sourceModuleId rendered without validation (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/components/enrichment/EnrichmentStatusPanel.tsx:286`
- **Description:** `{result.sourceModuleId}` is rendered directly into the DOM. React escapes HTML by default, so there is no script injection risk. However, the `sourceModuleId` comes from the database and could contain unexpected characters if a module registration bug writes garbage. This would produce confusing UI.
- **Fix:** Validate `sourceModuleId` against a known list of module IDs, or at minimum truncate to a reasonable length before display.

### BS-7: Kanban optimistic reorder not cleared on refresh (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/components/kanban/KanbanBoard.tsx:200-201`
- **Description:** After a successful reorder, the code calls `onRefresh()` which fetches fresh data from the server. But `clearOptimisticReorder()` is never called on success -- only on failure. The optimistic state persists until the next render where `jobs` prop changes. If `onRefresh()` returns the same data (e.g., the server update was applied but the returned sort matches the optimistic order), the optimistic override stays active indefinitely, potentially causing stale ordering on subsequent operations.
- **Fix:** Call `clearOptimisticReorder()` immediately after `onRefresh()` on the success path (line 201), or in a `.then()` after the refresh completes.

### BS-8: ChannelRouter returns anySuccess=false when all channels skip (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/lib/notifications/channel-router.ts:81`
- **Description:** If all channels skip due to preferences (`shouldNotify` returns false) or unavailability, the results array is empty and `anySuccess` is `results.some(r => r.success)` which is `false`. The caller (`dispatchNotification`) ignores this return value, but any future code that checks `anySuccess` to determine if a notification was "delivered" will incorrectly treat preference-suppressed notifications as failures.
- **Fix:** Return `anySuccess: true` when `results.length === 0` (all channels were intentionally skipped), or add a `skipped: boolean` field to `ChannelRouterResult`.

### BS-9: useGlobalUndo does not check for select elements (LOW)

- **Severity:** LOW
- **File:** `src/hooks/useGlobalUndo.ts:50-56`
- **Description:** The global undo handler skips `<input>` and `<textarea>` elements, but does not exclude `<select>`. Pressing Ctrl+Z while a `<select>` is focused triggers the global undo. In practice this is unlikely to cause issues since `<select>` has no native undo, but it is inconsistent.
- **Fix:** Consider also excluding `<select>` elements and elements within rich text editors, if any are added in the future.

---

## Stage 2: DAU/BDU (Brain Dead User)

### DAU-1: Rapid "Refresh Logo" clicking bypasses client-side debounce (HIGH)

- **Severity:** HIGH
- **File:** `src/components/enrichment/EnrichmentStatusPanel.tsx:137-163`
- **Description:** The refresh button uses `refreshingId` state to disable the button while one refresh is in progress. But `refreshingId` is only set for one result at a time. Clicking "Trigger Enrichment" and then immediately a "Refresh" button are not mutually exclusive -- the `triggering` flag does not disable refresh buttons, and vice versa. The server-side rate limit (10/min) is the only real guard.
- **Fix:** Add a single `isProcessing` flag that disables ALL enrichment action buttons (both trigger and refresh) while any enrichment operation is in flight.

### DAU-2: Webhook URL field accepts non-URL text client-side (HIGH)

- **Severity:** HIGH
- **File:** `src/components/settings/WebhookSettings.tsx:312`
- **Description:** The URL input uses `type="url"` which provides browser-level validation, but the create button is only disabled when `!url.trim()` (line 355). If the user types "not-a-url" and clicks create, it passes the client check and hits the server, which returns an error. There is no client-side URL format validation before the server round-trip. The `type="url"` attribute alone does not prevent form submission via `onClick`.
- **Fix:** Add client-side URL validation using `new URL(url)` try-catch before calling `createWebhookEndpoint`, or validate with a regex like `/^https?:\/\/.+/`. Show an inline error message.

### DAU-3: 500 jobs in Kanban -- no virtualization (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/components/kanban/KanbanBoard.tsx`
- **Description:** The Kanban board renders all jobs in all columns. With 500 jobs, this means 500 `KanbanCard` components are mounted simultaneously. On a mid-range device, this could cause visible jank during initial render and during drag operations. The `useMemo` on jobMap/jobColumnMap helps with lookups, but does not reduce DOM node count.
- **Fix:** For now, document as a known limitation. For future: add windowed rendering (react-virtuoso) for columns with >50 cards, or paginate within columns.

### DAU-4: Settings sidebar not navigable on mobile 375px (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/components/settings/SettingsSidebar.tsx:66` + `src/app/dashboard/settings/page.tsx:25`
- **Description:** The settings page uses `<div className="flex gap-6">` with a `w-48 shrink-0` sidebar. On a 375px screen, the sidebar takes 192px + 24px gap, leaving only 159px for the content panel. The sidebar has no responsive breakpoint -- it does not collapse into a horizontal tab bar or drawer on mobile.
- **Fix:** Add responsive classes: make the sidebar `hidden md:flex` on mobile and add a mobile-friendly section selector (e.g., horizontal scroll tabs or a `<Select>` dropdown) that shows on `md:hidden`.

### DAU-5: Ctrl+Z with no undo stack shows repeated toasts (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/hooks/useGlobalUndo.ts:28-30`
- **Description:** When the user presses Ctrl+Z and the undo store is empty, `undoLastAction()` returns `{ success: false }` and the toast shows "Nothing to undo" with `variant: "default"`. The toast fires on every Ctrl+Z press without rate limiting. A user who habitually presses Ctrl+Z multiple times will see a stack of toast notifications.
- **Fix:** Add a debounce timer (e.g., 1s) so repeated Ctrl+Z presses within the window do not spawn additional "Nothing to undo" toasts.

### DAU-6: Double-click "Run Cleanup" guarded by AlertDialog (LOW)

- **Severity:** LOW
- **File:** `src/components/developer/DeveloperContainer.tsx:410-442`
- **Description:** The retention cleanup button is wrapped in an `AlertDialog`, so the user must confirm before execution. Additionally, `isRunning` disables the trigger button during execution. The double-click scenario is well-guarded.
- **Fix:** No fix needed -- the existing guards are sufficient.

---

## Stage 3: Edge Cases + Extremes

### EC-1: SSRF validation only checks IP format, not DNS resolution (CRITICAL)

- **Severity:** CRITICAL
- **File:** `src/lib/url-validation.ts:32-111`
- **Description:** The `validateWebhookUrl()` function checks the hostname string against patterns like `127.x.x.x`, `10.x.x.x`, `192.168.x.x`. However, it does NOT resolve the hostname via DNS. An attacker can register a domain (e.g., `evil.example.com`) that resolves to `127.0.0.1` or `169.254.169.254` and pass all string-based checks. This is a classic DNS rebinding / TOCTOU SSRF bypass. The webhook channel re-validates on dispatch (good), but uses the same string-based check.
- **Fix:** After the string check passes, resolve the hostname to an IP address using `dns.resolve4()` / `dns.resolve6()` and re-validate the resolved IP against the blocked ranges. Alternatively, use the Node.js `net` module to check `net.isIP()` and block accordingly. This is the standard mitigation for SSRF via DNS.

### EC-2: Webhook 30-second timeout not enforced per-delivery-cycle (HIGH)

- **Severity:** HIGH
- **File:** `src/lib/notifications/channels/webhook.channel.ts:36,69`
- **Description:** `FETCH_TIMEOUT_MS` is set to 10 seconds per attempt. With 3 attempts and backoffs (1s + 5s + 30s = 36s), a single endpoint can take up to 10x3 + 36 = 66 seconds before failing. There is no overall timeout for the entire delivery process to one endpoint. Combined with BS-3 (serial delivery), this compounds into extreme blocking.
- **Fix:** Add an `AbortController` with a total timeout per endpoint (e.g., 45 seconds) that cancels all remaining retries. Use `Promise.race()` with the total timeout.

### EC-3: 200 status transitions in timeline -- no pagination or virtualization (HIGH)

- **Severity:** HIGH
- **File:** `src/components/crm/StatusHistoryTimeline.tsx:143-144`
- **Description:** The timeline has a `max-h-80 overflow-y-auto` container, which handles visual scrolling. However, it renders all entries as DOM nodes. With 200 entries, this means 200+ DOM elements with badges, icons, dates, and notes. The server action `getJobStatusHistory()` returns all entries with no limit or pagination. For very active jobs, this could return thousands of entries over time.
- **Fix:** Add server-side pagination (e.g., `take: 50` in the Prisma query) with a "Load more" button at the bottom of the timeline. Alternatively, use cursor-based pagination with an `after` parameter.

### EC-4: Float precision exhaustion in sortOrder midpoint strategy (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/hooks/useKanbanState.ts:41-81`
- **Description:** The `computeSortOrder()` function computes midpoints between adjacent `sortOrder` values. After approximately 52 repeated adjacent reorders (always moving item A between items B and C), IEEE 754 double-precision loses distinction -- two adjacent items get the same `sortOrder` value. The Prisma schema stores `sortOrder` as `Float` (schema.prisma line 306), which maps to SQLite REAL (64-bit IEEE 754). After exhaustion, the column order becomes unstable.
- **Fix:** Add a "rebalance" heuristic: when `|newSortOrder - neighborSortOrder| < 1e-10`, trigger a column-wide reindex that sets sortOrder to 1, 2, 3, ... for all items. This can be a server action that updates all jobs in the column.

### EC-5: All webhook endpoints deactivated -- silent no-op (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/lib/notifications/channels/webhook.channel.ts:192-205`
- **Description:** When all endpoints are deactivated (either manually or via auto-deactivation), `isAvailable()` returns false and the ChannelRouter silently skips the webhook channel. The user has no UI indication that webhooks are not being delivered because all endpoints are inactive. They may think webhooks are working when they are not.
- **Fix:** Show a warning banner in the WebhookSettings UI when all endpoints are inactive. Consider adding a "webhook health" indicator to the notification preferences panel.

### EC-6: 100 simultaneous webhook endpoint deliveries (MEDIUM)

- **Severity:** MEDIUM
- **File:** `src/lib/notifications/channels/webhook.channel.ts:234`
- **Description:** While MAX_ENDPOINTS_PER_USER is 10, in a multi-user deployment with 10 users having 10 endpoints each, a system-wide event (like module deactivation which affects all users) would trigger 100 sequential HTTP requests. Combined with the serial delivery model, this creates a massive blocking queue.
- **Fix:** For multi-user scenarios, the notification dispatcher already resolves preferences per-user. But the webhook channel's serial per-user delivery is still problematic. Adding `Promise.allSettled()` for per-user parallel delivery (BS-3 fix) resolves the single-user case. For multi-user scaling, consider a background job queue.

### EC-7: Empty dashboard funnel with zero jobs (LOW)

- **Severity:** LOW
- **File:** `src/components/dashboard/StatusFunnelWidget.tsx:122-123`
- **Description:** When `countsForStages` is empty (no jobs), `Math.max(...countsForStages, 1)` evaluates `Math.max(...[], 1)` which is `Math.max(1)` = 1. `totalJobs` = 0, and `isEmpty` = true, triggering the `EmptyState` component. This is handled correctly.
- **Fix:** No fix needed -- the empty state is properly rendered.

---

## Priority Remediation Order

1. **BS-1 (CRITICAL):** WebhookChannel never registered -- entire feature is dead code
2. **EC-1 (CRITICAL):** DNS rebinding bypasses SSRF validation
3. **BS-3 (HIGH):** Serial webhook delivery blocks event bus
4. **BS-4 (HIGH):** Failure count race condition
5. **BS-2 (HIGH):** StatusFunnelWidget missing try-catch
6. **DAU-1 (HIGH):** Rapid enrichment button clicks
7. **DAU-2 (HIGH):** No client-side URL validation
8. **EC-2 (HIGH):** No total timeout per endpoint delivery
9. **EC-3 (HIGH):** Timeline has no pagination
10. All MEDIUM and LOW items
