# UX 10-Point Checklist Audit -- S5a-Resume Components

**Date:** 2026-04-04
**Scope:** 8 S5a UI surfaces (4 new components + 4 supplementary checks)
**Auditor:** Claude Opus 4.6

---

## Summary

| Component | PASS | PARTIAL | FAIL | Score |
|---|---|---|---|---|
| 1. StatusHistoryTimeline | 8 | 1 | 1 | 8/10 |
| 2. StatusFunnelWidget | 7 | 1 | 2 | 7/10 |
| 3. WebhookSettings | 9 | 1 | 0 | 9/10 |
| 4. ApiKeySettings (Health Check) | 8 | 1 | 1 | 8/10 |
| 5. EnrichmentStatusPanel | 9 | 1 | 0 | 9/10 |
| 6. DeveloperContainer (Retention) | 7 | 1 | 2 | 7/10 |
| 7. Global Undo Listener | 8 | 1 | 1 | 8/10 |
| 8. Sidebar (Staging link) | 10 | 0 | 0 | 10/10 |

**Overall: 66/80 total points across 8 components.**

Critical findings:
- **F1 (StatusFunnelWidget):** `errors.fetchStatusDistribution` i18n key does not exist in any dictionary -- will render raw key string to user.
- **F2 (DeveloperContainer):** `confirm()` used for 4 destructive actions instead of AlertDialog -- breaks keyboard nav, dark mode, i18n rendering.
- **F3 (StatusHistoryTimeline):** Badge colors use hardcoded `bg-*-500 text-white` without `dark:` variants -- reduced contrast in some dark themes.
- **F4 (DeveloperContainer):** `lastResult.timestamp.toLocaleTimeString()` violates project i18n rule -- should use `formatDateShort()` with locale.
- **F5 (DeveloperContainer):** StatusBanner uses `bg-red-50`/`bg-green-50` without dark mode variants -- invisible in dark theme.

---

## 1. StatusHistoryTimeline

**File:** `src/components/crm/StatusHistoryTimeline.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | `TimelineSkeleton` renders 3 animated pulse placeholders with `role="status"` and `aria-label="Loading"`. `motion-reduce:animate-none` respected. |
| 2 | Empty State | PASS | Shows `History` icon + translated `t("jobs.statusHistoryEmpty")` when `entries.length === 0`. |
| 3 | Error State | PASS | Shows `AlertTriangle` icon + `role="alert"` + translated error message + Retry button with `aria-label`. |
| 4 | Mobile (375px+) | PASS | Timeline uses flex layout with `gap-3`. Badges wrap via `flex-wrap`. No fixed widths that would overflow. `max-h-80 overflow-y-auto` constrains height. |
| 5 | Keyboard Nav | PASS | Retry button is a native `<Button>`, Show all/less is also a `<Button>`. Timeline container uses `role="list"` / `role="listitem"` for screen readers. Tab order follows DOM order. |
| 6 | Dark Mode | FAIL | `getStatusColor()` uses hardcoded `bg-cyan-500 text-white`, `bg-green-500 text-white`, etc. without `dark:` variants. While `text-white` on solid backgrounds is generally fine, the dot indicators on L172-178 use `border-destructive bg-destructive/20` and `border-primary bg-primary/20` which do use theme tokens -- but the badge colors do not. On themes where the solid colors shift in dark mode, contrast may degrade. **Severity: Low** -- the `text-white` on saturated backgrounds is acceptable in most dark themes, but is inconsistent with project practice of explicitly declaring `dark:` variants. |
| 7 | i18n | PASS | All strings use `t()`. Keys verified in 4 locales (en/de/fr/es) in `jobs.ts`. Date uses `formatDateShort(new Date(entry.changedAt), locale)`. |
| 8 | Confirmation Dialogs | PASS | N/A -- no destructive actions in this component (read-only timeline). |
| 9 | Visual Feedback | PASS | Loading skeleton while fetching. Error + Retry on failure. Toast not needed (display component). |
| 10 | Focus Management | PARTIAL | After Retry button triggers re-fetch, focus remains on the button (correct). However, when toggling Show all/Show less, focus stays on the button but the scroll area may jump. No `scrollIntoView` or focus-trap issue, but scroll position is not explicitly managed. |

---

## 2. StatusFunnelWidget

**File:** `src/components/dashboard/StatusFunnelWidget.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | `SkeletonBars` renders 5 animated pulse bars with `aria-busy="true"` and `aria-label="Loading pipeline data"`. |
| 2 | Empty State | PASS | `EmptyState` shows `Briefcase` icon + translated `t("dashboard.noPipeline")`. |
| 3 | Error State | PASS | `ErrorState` shows destructive-colored message + Retry button with `RefreshCw` icon. |
| 4 | Mobile (375px+) | PARTIAL | Stage label width is fixed at `w-20` which may truncate long labels (e.g., "Vorstellungsgesprach" in DE is 20 chars). The `truncate` class prevents overflow but hides content. **Recommendation:** Test with DE locale at 375px; consider `w-24` or responsive `sm:w-20 w-16` with tooltip. |
| 5 | Keyboard Nav | PASS | Retry button is a standard `<Button>`. Bars use `role="list"` / `role="listitem"` and `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and `aria-label`. |
| 6 | Dark Mode | PASS | `PIPELINE_STAGES` explicitly declares dark variants: `text-blue-700 dark:text-blue-300`, etc. Background bars use `bg-muted`. Ring on dropoff uses `ring-orange-400` which is visible in both themes. |
| 7 | i18n | FAIL | **`errors.fetchStatusDistribution`** is used as fallback error key on L102 and L109 but does NOT exist in any i18n dictionary. If `getStatusDistribution()` returns `success: false` without a message, the raw key string `"errors.fetchStatusDistribution"` will render as the error message to the user. All 4 locales affected. |
| 8 | Confirmation Dialogs | PASS | N/A -- no destructive actions (read-only widget). |
| 9 | Visual Feedback | PASS | Loading skeleton during fetch. Error state with retry. Conversion percentages and drop-off highlighting provide dynamic visual insight. |
| 10 | Focus Management | FAIL | The `CardTitle` uses hardcoded `text-green-600` without a `dark:` variant. In dark mode, green-600 on dark backgrounds has poor contrast. **Update:** This is strictly a dark mode contrast issue, not focus management. **Focus management itself is fine** -- Retry button retains focus after re-fetch. Reclassifying: PASS for focus management. **Revised to PASS.** |

**Revised score after reclassification:** 8/10 (1 FAIL: i18n key missing, 1 PARTIAL: mobile truncation).

---

## 3. WebhookSettings

**File:** `src/components/settings/WebhookSettings.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | Shows `Loader2` spinner with `motion-reduce:animate-none` + translated `t("common.loading")` text. |
| 2 | Empty State | PASS | Shows `Webhook` icon + `t("webhook.noEndpoints")` heading + `t("webhook.noEndpointsDesc")` description. |
| 3 | Error State | PASS | Shows `text-destructive` colored `t("webhook.loadFailed")` + Retry button. All action failures show destructive toast with translated message. |
| 4 | Mobile (375px+) | PASS | Event checkboxes use `grid-cols-1 sm:grid-cols-2`. Endpoint rows use `flex-wrap` patterns. Created date hidden on mobile (`hidden sm:block`). URL truncated at 50 chars with `title` tooltip for full URL. Buttons use `size="sm"`. |
| 5 | Keyboard Nav | PASS | All interactive elements are native HTML or Shadcn components. URL input has `aria-invalid` and `aria-describedby` for error linking. Checkboxes are native `<input type="checkbox">`. Switch, Button, AlertDialog all have keyboard support built in. `aria-label` on toggle and expand/collapse buttons. |
| 6 | Dark Mode | PASS | Uses Shadcn theme tokens (`text-destructive`, `text-muted-foreground`, `bg-muted`). Limit warning uses `text-amber-700 dark:text-amber-400`. Secret warning uses `text-orange-700 dark:text-amber-400`. All covered. |
| 7 | i18n | PASS | All strings use `t()`. `webhook.ts` dictionary verified with all 4 locales (en/de/fr/es). Event labels use dynamic `t(`webhook.event.${event}`)`. Date uses `formatDateCompact()` with locale. |
| 8 | Confirmation Dialogs | PASS | Delete uses `AlertDialog` with title, description, Cancel/Delete buttons. Secret dialog uses `Dialog` with dismissable overlay. |
| 9 | Visual Feedback | PASS | Create: spinner on button + secret dialog on success + destructive toast on failure. Toggle: toast on success/failure. Delete: spinner on delete button + toast on success/failure. Copy secret: success toast. |
| 10 | Focus Management | PARTIAL | After AlertDialog closes (delete confirmation), focus should return to the trigger button (AlertDialog does this natively). After secret Dialog closes, focus returns to DOM -- but the create form was already reset, so the "Add Endpoint" button is the next focusable element. No explicit `focusRef` after dialog close. **Severity: Low** -- Shadcn AlertDialog handles focus restoration; the secret Dialog also handles it via Radix. Minor: after endpoint deletion, the deleted row disappears and focus falls to body rather than the next endpoint. |

---

## 4. ApiKeySettings (Health Check Button)

**File:** `src/components/settings/ApiKeySettings.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | Shows `Loader2` spinner + `t("settings.loadingKeys")` text during initial fetch. Health check button shows spinner + `t("settings.healthCheckRunning")` while checking. |
| 2 | Empty State | PASS | Each module card shows `Badge variant="secondary"` with `t("settings.notConfigured")` when no key exists. |
| 3 | Error State | PASS | Save failure: destructive toast with `t("settings.saveFailed")`. Verification failure: destructive toast with description. Health check failure: destructive toast with `t("settings.healthCheckFailed")`. |
| 4 | Mobile (375px+) | PARTIAL | Module card header packs status indicator + active/inactive label + Switch + Badge into a single row. On 375px viewport, this row may become cramped. The health check button, add/update button, and delete button are all in a single `flex gap-2` row -- on narrow screens with long translated labels (e.g., DE "Jetzt prufen"), buttons may wrap or truncate. **Recommendation:** Consider stacking controls vertically on mobile (`flex-wrap` or `sm:flex-row flex-col`). |
| 5 | Keyboard Nav | PASS | All buttons, switches, inputs, and AlertDialogs use native Shadcn components with built-in keyboard support. Health check button has `aria-label={t("settings.healthCheckNow")}`. Module toggle has `aria-label`. |
| 6 | Dark Mode | PASS | Health status dot uses `bg-green-500`, `bg-yellow-500`, `bg-red-500`, `bg-gray-400` -- visible in both themes. Active label uses `text-green-700 dark:text-green-400`. Key badge uses `dark:bg-green-900 dark:text-green-200`. |
| 7 | i18n | PASS | All strings use `t()`. Health check keys verified in 4 locales. `HEALTH_STATUS_KEYS` map to enrichment health keys. Date uses `formatDateCompact()` with locale. |
| 8 | Confirmation Dialogs | PASS | Delete key uses `AlertDialog` with title + description + Cancel/Delete. |
| 9 | Visual Feedback | PASS | Save: spinner on button + success/error toast. Delete: spinner on delete button + success/error toast. Toggle: optimistic local state update + toast. Health check: spinner + running text on button + success/error toast with status and latency. |
| 10 | Focus Management | FAIL | When `handleCancel()` is called (editing mode exits), focus is not explicitly moved. The input disappears and focus falls to the document body. **Recommendation:** After cancel, focus the "Add/Update Key" button for the same module. Similarly, after verify+save succeeds, focus should return to the module card. |

---

## 5. EnrichmentStatusPanel

**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | `EnrichmentStatusSkeleton` renders 2 animated pulse rows with `role="status"` and `aria-label="Loading"`. `motion-reduce:animate-none` respected. |
| 2 | Empty State | PASS | Shows `Database` icon + `t("enrichment.noData")` + hint text `t("enrichment.noDataHint")` + CTA button "Enrich Company Data". |
| 3 | Error State | PASS | Shows `AlertTriangle` + `role="alert"` + `t("enrichment.errorLoading")` + Retry button with `aria-label`. Toast shown on action failures. |
| 4 | Mobile (375px+) | PASS | Uses flex layout with `flex-wrap` on badge row. Refresh button uses `sr-only sm:not-sr-only sm:ml-1.5` for responsive label (icon-only on mobile, icon+text on desktop). Last-updated metadata hidden on mobile (`hidden sm:inline`). |
| 5 | Keyboard Nav | PASS | All buttons are Shadcn `<Button>` with `aria-label`. Refresh and trigger buttons have disabled states. Screen reader text via `sr-only`. |
| 6 | Dark Mode | PASS | Uses Shadcn theme tokens (`text-destructive`, `text-muted-foreground`). `StatusIcon` uses `text-green-600 dark:text-green-400` for found status. Result rows use `hover:bg-accent/50`. |
| 7 | i18n | PASS | All strings use `t()`. Keys verified in 4 locales (en/de/fr/es) in `enrichment.ts`. Date uses `formatDateShort()` with locale. |
| 8 | Confirmation Dialogs | PASS | N/A -- Refresh and Trigger are non-destructive enrichment operations. No data loss risk. |
| 9 | Visual Feedback | PASS | Refresh: spinner on button + success/error toast. Trigger: spinner on button + text change to "Enriching..." + toast. Loading skeleton during fetch. |
| 10 | Focus Management | PARTIAL | After refresh completes, focus stays on refresh button (correct). After trigger from empty state, the view transitions from empty to results list -- the trigger button disappears and focus falls to body. **Recommendation:** After trigger success, focus the first result row or the card header. |

---

## 6. DeveloperContainer (RetentionCleanupCard)

**File:** `src/components/developer/DeveloperContainer.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | Retention card: spinner on button + `t("developer.cleanupRunning")` text. All mock cards: spinner on button + "Generating..."/"Clearing..." text. |
| 2 | Empty State | PASS | N/A -- developer tools are always actionable. Cards always show their action buttons. |
| 3 | Error State | PASS | Retention: destructive toast on failure. Mock cards: `StatusBanner` with error styling + error message. |
| 4 | Mobile (375px+) | PASS | All buttons use `className="w-full"` for full-width on any screen size. Cards use standard Shadcn Card layout. No horizontal overflow risk. |
| 5 | Keyboard Nav | FAIL | **MockActivitiesCard, ClearAllMockDataCard, ClearE2ETestDataCard, and MockProfileCard use native `confirm()` dialogs** for destructive confirmations (lines 85, 158, 214, 279). `confirm()` is: (a) not styleable for dark mode, (b) not translatable by the i18n system (though the message IS passed through `t()`), (c) not keyboard-accessible in the same way as AlertDialog, (d) blocks the main thread. **Only RetentionCleanupCard correctly uses AlertDialog.** The 4 mock-data cards should be migrated to AlertDialog for consistency. |
| 6 | Dark Mode | FAIL | `StatusBanner` uses hardcoded `border-red-200 bg-red-50 text-red-900` and `border-green-200 bg-green-50 text-green-900` WITHOUT `dark:` variants. In dark mode, `bg-red-50` (near-white) and `text-red-900` (near-black) will produce an extremely bright box that clashes with the dark theme. **Must add dark mode classes** (e.g., `dark:border-red-800 dark:bg-red-950 dark:text-red-200`). |
| 7 | i18n | PARTIAL | All strings use `t()`. Keys verified in 4 locales. **However**, `lastResult.timestamp.toLocaleTimeString()` on line 404 does NOT use the project's locale-aware formatter. Per project rules, this should use `formatDateShort()` or `formatDateCompact()` with the user's locale. |
| 8 | Confirmation Dialogs | PASS | RetentionCleanupCard correctly uses AlertDialog with title, description, Cancel, and action button. (The 4 mock cards use `confirm()` -- already flagged under #5.) |
| 9 | Visual Feedback | PASS | All actions show spinner on button + text change during execution. Success: toast (retention) or StatusBanner (mock). Error: destructive toast or error StatusBanner. |
| 10 | Focus Management | PASS | AlertDialog (retention) handles focus restoration natively. `confirm()` dialogs return focus to the triggering button natively (browser behavior). StatusBanner renders inline -- no focus disruption. |

---

## 7. Global Undo Listener

**Files:** `src/components/GlobalUndoListener.tsx`, `src/hooks/useGlobalUndo.ts`, `src/app/dashboard/layout.tsx`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | N/A -- keyboard listener, no data to load. `pendingRef` prevents double-execution during async undo. |
| 2 | Empty State | PASS | When nothing to undo, shows `t("undo.nothingToUndo")` toast with default variant (not destructive). |
| 3 | Error State | PASS | Catch block shows `t("undo.undoFailed")` with destructive toast variant. |
| 4 | Mobile (375px+) | PASS | N/A -- no visual UI. Keyboard shortcut is desktop-only by nature. Mobile users would need alternative undo surface (e.g., toast action button), but this is a known design limitation of keyboard-based undo. |
| 5 | Keyboard Nav | PASS | Correctly detects `(e.ctrlKey || e.metaKey) && e.key === "z" && !e.shiftKey`. Correctly skips when focus is on `<input>`, `<textarea>`, or `contenteditable` to avoid conflicting with native text undo. |
| 6 | Dark Mode | PASS | N/A -- renders `null`. Toast component handles its own dark mode styling. |
| 7 | i18n | PASS | All 3 toast messages use `t()`. Keys `undo.actionUndone`, `undo.nothingToUndo`, `undo.undoFailed` verified in all 4 locales in `dictionaries.ts`. |
| 8 | Confirmation Dialogs | FAIL | Undo executes immediately on Ctrl+Z without any confirmation. For destructive undos (e.g., un-deleting or reverting a status change), a confirmation step or at minimum a toast with an "undo the undo" option would prevent accidental triggers. Accidental Ctrl+Z presses (common when users think they're in a text field) could silently revert important actions. |
| 9 | Visual Feedback | PASS | Success: toast "Action undone". Nothing to undo: toast "Nothing to undo". Error: destructive toast "Undo failed". All three states covered. |
| 10 | Focus Management | PARTIAL | After undo, focus remains wherever it was (no DOM changes). However, if the undo reverts a visual state change (e.g., a job status change), there is no focus indication to help the user identify WHAT was undone. The toast only says "Action undone" without specifying the action. **Recommendation:** Include the undone action description in the toast (e.g., "Status change reverted: Applied -> Bookmarked"). |

---

## 8. Sidebar (Staging Link)

**File:** `src/lib/constants.ts`

| # | Criterion | Status | Issue (if any) |
|---|-----------|--------|----------------|
| 1 | Loading State | PASS | N/A -- static constant array, no loading. |
| 2 | Empty State | PASS | N/A -- always visible in sidebar. |
| 3 | Error State | PASS | N/A -- static route definition. |
| 4 | Mobile (375px+) | PASS | Sidebar handles responsiveness (`sm:pl-14` in layout). Staging link uses standard `Inbox` icon + `labelKey: "nav.stagingQueue"` translated label. |
| 5 | Keyboard Nav | PASS | Standard sidebar link, handled by Sidebar component. |
| 6 | Dark Mode | PASS | Sidebar component handles dark mode globally. |
| 7 | i18n | PASS | Uses `labelKey: "nav.stagingQueue"` translation key. |
| 8 | Confirmation Dialogs | PASS | N/A -- navigation link. |
| 9 | Visual Feedback | PASS | Sidebar highlights active route (handled globally). |
| 10 | Focus Management | PASS | Standard Next.js route navigation. |

---

## Action Items (Prioritized)

### P0 -- Must Fix (user-facing bugs)

| ID | Component | Issue | Effort |
|---|---|---|---|
| **F1** | StatusFunnelWidget | Add `errors.fetchStatusDistribution` key to all 4 locales in `dashboard.ts` | S |
| **F5** | DeveloperContainer | Add `dark:` variants to StatusBanner (`dark:border-red-800 dark:bg-red-950 dark:text-red-200` / `dark:border-green-800 dark:bg-green-950 dark:text-green-200`) | S |

### P1 -- Should Fix (UX quality)

| ID | Component | Issue | Effort |
|---|---|---|---|
| **F2** | DeveloperContainer | Replace `confirm()` with AlertDialog in MockActivitiesCard, ClearAllMockDataCard, ClearE2ETestDataCard, MockProfileCard (4 occurrences) | M |
| **F4** | DeveloperContainer | Replace `toLocaleTimeString()` with `formatDateCompact()` using user locale | S |
| **F6** | ApiKeySettings | Add focus restoration after cancel (focus the "Add/Update Key" button) | S |

### P2 -- Nice to Have

| ID | Component | Issue | Effort |
|---|---|---|---|
| **F3** | StatusHistoryTimeline | Add `dark:` variant awareness to badge colors (or use Shadcn badge variants) | S |
| **F7** | StatusFunnelWidget | `CardTitle` uses `text-green-600` without `dark:` variant | S |
| **F8** | StatusFunnelWidget | Test `w-20` label width at 375px with DE locale; consider `w-24` | S |
| **F9** | EnrichmentStatusPanel | Focus first result after trigger from empty state | S |
| **F10** | GlobalUndo | Include action description in undo toast | M |
| **F11** | GlobalUndo | Consider confirmation for destructive undos | M |

**Effort key:** S = small (< 30 min), M = medium (30-60 min), L = large (> 1 hour)
