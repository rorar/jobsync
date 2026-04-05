# S5a-Resume Interaction Design Review

**Date:** 2026-04-04
**Reviewer:** UI Design Agent (interaction-design)
**Scope:** S5a UI components -- loading transitions, scroll behavior, animation, user feedback
**Severity scale:** CRITICAL / HIGH / MEDIUM / LOW / NOTE

---

## Summary

Reviewed 8 components across CRM, dashboard, settings, enrichment, and developer areas.
The components are well-structured with consistent loading/error/empty state patterns.
Accessibility fundamentals (ARIA roles, labels, motion-reduce) are present in most places.
The main gaps are in animation transitions, focus management after state changes,
dark mode coverage, and the toast auto-dismiss timing which is set to an unusable value.

**Finding count:** 7 CRITICAL, 5 HIGH, 9 MEDIUM, 5 LOW, 4 NOTE

---

## 1. StatusHistoryTimeline

**File:** `src/components/crm/StatusHistoryTimeline.tsx`

### Loading States -- GOOD
- Skeleton loader (`TimelineSkeleton`) renders 3 placeholder items with correct structure
  (dot + line + text bars).
- `motion-reduce:animate-none` on all pulse animations respects user preferences.
- `role="status"` and `aria-label="Loading"` on the skeleton container.

### Empty States -- GOOD
- Centered icon + translated message. No CTA to create history -- reasonable since history
  is auto-generated, not user-created.

### Error States -- GOOD
- `role="alert"` on the error container.
- Destructive icon, translated error message, retry button with icon + text.
- Retry button has `aria-label` for screen readers.

### Transitions -- MEDIUM | ID-01
**No entry appearance animation.** When data loads, the timeline items appear instantly
without any fade-in or stagger. After the skeleton disappears, the content snaps in,
creating a jarring shift. A simple `animate-in fade-in` on each list item or a CSS
`@starting-style` transition would smooth this.

### Scroll Behavior -- HIGH | ID-02
**Fixed `max-h-80` (320px) is too small for the 20-item default limit.** Each timeline
entry is approximately 60-80px tall (badges + timestamp + note + spacing). At 20 entries,
the content is approximately 1200-1600px, meaning users must scroll through a small
viewport to see 75% of the visible entries. The `overflow-y-auto` container has no
scroll indicators (no gradient fade, no "scroll for more" hint). Users on touch devices
may not realize the container is scrollable.

**Recommendation:** Add a top/bottom gradient fade on the scroll container when content
overflows, or increase `max-h` to `max-h-[32rem]` (512px). Consider adding
`scrollbar-thin` utility for narrower scrollbar on desktop.

### Scroll Behavior -- MEDIUM | ID-03
**No scroll-to-latest behavior.** When "Show all" is toggled on and the timeline expands,
the viewport does not scroll. If the user clicked "Show all" from the bottom of the card,
the newly revealed entries appear above the fold and require manual scrolling.

### Pagination / Virtualization -- LOW | ID-04
**No virtualization for 200+ entries.** The component caps at `DEFAULT_VISIBLE_LIMIT = 20`
with a "Show all" toggle. Clicking "Show all" renders ALL entries into the DOM at once.
For a job with 200+ status changes, this creates 200+ DOM nodes. Acceptable for now since
200+ status changes per job is an extreme edge case, but worth noting for future scale.

### Focus Management -- MEDIUM | ID-05
**No focus management after "Show all" toggle.** Clicking the button reveals more items
but does not move focus to the first newly visible item. Screen reader users will not
know that content appeared below.

### Dark Mode -- HIGH | ID-06
**Status badge colors use hardcoded `text-white` regardless of theme.** The `getStatusColor`
function returns classes like `bg-cyan-500 text-white`. In dark mode with a dark card
background, these badges will look fine, but in light mode the `text-white` on a `bg-slate-400`
badge (draft status) has a contrast ratio of approximately 2.5:1, which fails WCAG AA.
The badge colors should use Tailwind's dark: variant or semantic tokens.

### Keyboard -- GOOD
- "Show all" toggle is a `<Button>` -- natively keyboard accessible.
- Timeline items use `role="list"` and `role="listitem"` -- correct semantics.

### Mobile (375px+) -- MEDIUM | ID-07
**Badge wrapping on narrow screens.** The entry row uses `flex-wrap` on the badge container,
but the arrow icon between "previous" and "new" status badges does not hide or adapt. On
a 375px screen with two long status labels, the arrow may sit awkwardly between wrapped lines.

---

## 2. StatusFunnelWidget

**File:** `src/components/dashboard/StatusFunnelWidget.tsx`

### Loading States -- GOOD
- `SkeletonBars` renders 5 progressively narrowing bars matching the funnel shape.
- `aria-busy="true"` and `aria-label` present on the skeleton container.

### Loading States -- MEDIUM | ID-08
**No `motion-reduce:animate-none` on skeleton bars.** The `SkeletonBars` component uses
`animate-pulse` without `motion-reduce:animate-none`, unlike every other skeleton in
the codebase. This is inconsistent and violates `prefers-reduced-motion` for users who
need it.

### Empty States -- GOOD
- Centered icon + motivational message via `EmptyState` sub-component.

### Error States -- GOOD
- Destructive text + retry button. Error messages are i18n-translated.

### Transitions -- GOOD
- Bar widths use `transition-all duration-500 ease-out` -- smooth width animation when
  data loads.

### Hover / Focus Interaction -- HIGH | ID-09
**No tooltip on hover or focus.** The funnel bars show a count number inside each bar,
but there is no hover tooltip showing the exact count, percentage of total, or label.
The conversion percentage arrows between stages are text-only (10px font size). There
is no `title` attribute, no Tooltip component, and no `aria-describedby` linking the
bar to its conversion percentage. On mobile, the 10px conversion text is below the
recommended 12px minimum for readability.

### Keyboard -- MEDIUM | ID-10
**Bars have `role="meter"` but are not focusable.** The `role="meter"` on each bar
is semantically correct and includes `aria-valuenow`, `aria-valuemin`, `aria-valuemax`,
and `aria-label`. However, the bars are `<div>` elements without `tabIndex={0}`, so
keyboard users cannot navigate to individual bars to hear their values. Adding
`tabIndex={0}` and a `Tooltip` on focus would resolve this.

### Biggest Drop-off Indicator -- GOOD
- Visual ring highlight (`ring-2 ring-orange-400`) and colored text on the conversion
  percentage. `TrendingDown` icon adds visual clarity.

### Mobile (375px+) -- MEDIUM | ID-11
**Label column is fixed at `w-20` (80px).** On 375px screens, this leaves approximately
250px for the bar area after padding. The 80px label can truncate longer translated
strings (e.g., German "Vorstellungsgesprach" is clipped). Consider using `min-w-20` with
`shrink` behavior, or abbreviating labels on small screens.

### Dark Mode -- GOOD
- Bar colors (`bg-blue-500`, etc.) work in both themes.
- Text colors use explicit `dark:` variants (`text-blue-700 dark:text-blue-300`).

---

## 3. WebhookSettings

**File:** `src/components/settings/WebhookSettings.tsx`

### Loading States -- MEDIUM | ID-12
**Spinner-only loading state, no skeleton.** Unlike other components in the codebase that
use skeleton loaders matching the final layout shape, WebhookSettings shows only a
`Loader2` spinner with text "Loading...". This causes a noticeable layout shift when the
content appears -- the create form and endpoint list pop in at once. A skeleton matching
the card structure would provide better perceived performance.

### Empty States -- GOOD
- Dedicated empty card with webhook icon, title, and description text.
- Properly directs users to the "Add endpoint" form above.

### Error States -- GOOD
- Error state with retry button. Consistent with project patterns.

### CRUD Flow -- GOOD
- Create: URL input + event checkboxes + submit button. Clear disabled states during
  creation. Form resets after successful creation.
- The create button shows `Loader2` spinner during submission. `Plus` icon in default state.
- Limit warning shown when 10 endpoints reached. Button disables correctly.

### Secret Dialog -- GOOD
- Dialog appears immediately after successful endpoint creation.
- Secret displayed in `<code>` with monospace font and `break-all` for long secrets.
- Copy button with clipboard fallback for non-secure contexts.
- Warning with `AlertTriangle` icon and descriptive text.
- `aria-describedby="webhook-secret-warning"` links the code display to the warning.
- Dialog cleanup on close: `setNewSecret(null)` prevents stale secret persistence.

### Secret Dialog -- LOW | ID-13
**No auto-copy or visual countdown.** The secret is shown in a dialog, but there is no
indication that it will disappear forever after closing. While the warning text says so,
a more assertive design would auto-select the text in the code block, or show a brief
"Copied!" confirmation if the user clicks the copy button (currently shows only a toast,
which may be missed since toasts have a long dismiss timeout -- see ID-19).

### Active Toggle Feedback -- GOOD
- Switch component with per-endpoint loading state (`toggling`).
- Toast confirmation on success and destructive toast on failure.
- `aria-label` toggles between "Active" and "Inactive" based on state.

### Delete Confirmation -- GOOD
- AlertDialog with title, description, cancel, and confirm buttons.
- Delete button shows spinner during deletion (`deleting` state).

### URL Validation -- GOOD
- Client-side validation on change after first meaningful input.
- Protocol check (http/https only).
- Error displayed inline below the input with `aria-invalid` and `aria-describedby`.
- NOTE: The client-side validation is UX-only (comment says so). Server validates with
  full SSRF checks. This is the correct pattern.

### URL Validation -- LOW | ID-14
**No specific SSRF feedback on the client side.** The client-side validator only checks
protocol. If a user enters `https://169.254.169.254/metadata`, it passes client
validation but will be rejected server-side with a generic "createFailed" toast. A
proactive client-side check for IMDS IPs and private ranges would improve UX by giving
instant feedback. The full `validateWebhookUrl()` from `src/lib/url-validation.ts` could
be imported (it runs no I/O), but this is a judgment call on bundle size.

### Expanded Details Transition -- HIGH | ID-15
**No animation on expand/collapse.** The endpoint details section (`isExpanded && (...)`)
appears and disappears with a hard cut. There is no height transition, no fade, no
Collapsible component wrapping. The content jumps in, shifting the layout below. This
is the most jarring interaction in the component.

**Recommendation:** Wrap the expanded section in Radix `Collapsible` (already available
in shadcn/ui) or use a CSS `grid-template-rows: 0fr` to `1fr` transition pattern.

### Focus Management -- MEDIUM | ID-16
**No focus management after dialog close.** When the secret dialog is dismissed, focus
does not return to the create button or the newly created endpoint row. Radix Dialog
handles focus return to the trigger by default, but since the dialog is opened
programmatically (not via a trigger element), the focus return point is undefined.

### Keyboard -- GOOD
- All interactive elements are native HTML elements or Radix primitives (Button, Switch,
  AlertDialog, Dialog, checkboxes). Keyboard accessible by default.
- Event checkboxes use `<label>` wrapping `<input type="checkbox">` -- correct pattern.

### Mobile (375px+) -- MEDIUM | ID-17
**Endpoint row action buttons crowd on narrow screens.** The compact row has Switch +
expand button + delete button in a row. On 375px, this creates approximately 140px of
controls next to the URL text, leaving only about 190px for the URL display. The URL
truncation at 50 chars may still overflow. The created-at date is hidden on mobile
(`hidden sm:block`) which is good.

---

## 4. ApiKeySettings (Health Check)

**File:** `src/components/settings/ApiKeySettings.tsx`

### Health Check Button -- GOOD
- "Check Now" button shows `Loader2` spinner during check (`checking` state).
- Button text changes to "Running..." during check.
- Button disables when module is inactive (`module.status !== "active"`).
- Toast shows result with module name, health status (translated), and response time.

### Health Check Result -- NOTE | ID-18
**Result is shown only via toast, not inline.** After the health check completes, the
health status dot updates in the card header (green/yellow/red/gray), and a toast appears
with the result. However, the toast is the only place showing the response time. If the
user misses the toast or dismisses it, the response time information is lost. An inline
result display (e.g., a temporary badge or a small status line below the button saying
"Healthy -- 120ms" that fades after 5 seconds) would reinforce the feedback.

### Loading States -- GOOD
- Spinner + "Loading keys" text during initial load.

### Dark Mode -- GOOD
- Health status dot uses universal colors (`bg-green-500`, `bg-red-500`).
- Active/inactive text uses explicit dark variants.
- API key badge uses explicit dark variants.

---

## 5. EnrichmentStatusPanel

**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`

### Loading States -- GOOD
- `EnrichmentStatusSkeleton` renders 2 rows matching the result list structure.
- `motion-reduce:animate-none` on all skeleton elements.
- `role="status"` and `aria-label="Loading"` on the skeleton.

### Empty States -- GOOD
- Icon + primary message + secondary hint text + CTA button to trigger enrichment.
- Button shows spinner during triggering.

### Error States -- GOOD
- `role="alert"` on error container.
- Destructive icon + translated message + retry button.

### Refresh Button -- GOOD
- Per-result refresh button with spinner state (`refreshingId`).
- Button text toggles between "Refresh" and "Refreshing...".
- `sr-only sm:not-sr-only` pattern hides button text on mobile, shows on larger screens.
- Toast feedback on success and failure.

### Module Attribution -- GOOD
- "Source: clearbit" text shown per result.
- Last updated timestamp shown (hidden on mobile via `hidden sm:inline`).

### Transitions -- MEDIUM | ID-20
**No animation on result list changes.** When an enrichment result is refreshed and the
status changes (e.g., "pending" to "found"), the badge and icon swap instantly. A brief
color transition on the status badge or a subtle pulse on the updated row would signal
that something changed.

### Focus Management -- LOW | ID-21
**Refresh button focus is correct.** Since the refresh button remains in the DOM during
the operation (only its content changes), focus is preserved. Good.

### Dark Mode -- GOOD
- Status icons use semantic colors (`text-green-600 dark:text-green-400` for success).
- Hover state uses `hover:bg-accent/50` which adapts to the theme.

---

## 6. CompanyLogo

**File:** `src/components/ui/company-logo.tsx`

### Loading States -- GOOD
- Three-state machine: loading -> loaded | error.
- Skeleton pulse while image loads (`animate-pulse` with `motion-reduce:animate-none`).
- Smooth opacity transition on image load (`opacity-0` to `opacity-100`).
- `loading="lazy"` for performance.
- `referrerPolicy="no-referrer"` for privacy.

### Error / Fallback -- GOOD
- Initials avatar as graceful degradation.
- Initials extraction handles single-word and multi-word company names.
- `role="img"` with `aria-label` on the fallback.

### Reactivity -- GOOD
- `useEffect` resets `imageState` when `logoUrl` prop changes (e.g., after enrichment
  writeback). This is the correct pattern for handling prop-driven state.

---

## 7. GlobalUndoListener (Ctrl+Z)

**File:** `src/components/GlobalUndoListener.tsx`
**Hook:** `src/hooks/useGlobalUndo.ts`

### Toast Feedback -- GOOD
- Three distinct toast messages: success ("Action undone"), nothing to undo, and
  failure ("Undo failed").
- Uses appropriate toast variants (success, default, destructive).

### Input Guard -- GOOD
- Correctly skips undo when focus is in input, textarea, or contenteditable.
- Prevents double-execution with `pendingRef`.

### Toast Feedback -- NOTE | ID-22
**Success toast variant does not auto-dismiss.** See global finding ID-19. The undo
success toast will persist until manually closed, which is excessive for a confirmation
that the user explicitly triggered.

---

## 8. RetentionCleanupCard

**File:** `src/components/developer/DeveloperContainer.tsx` (RetentionCleanupCard export)

### Confirmation Flow -- GOOD
- AlertDialog with title and warning description before running cleanup.
- Cancel and confirm buttons in the dialog footer.

### Loading State -- GOOD
- Button shows `Loader2` spinner + "Running..." text during cleanup.
- Button disables during execution.

### Result Feedback -- GOOD
- Toast with purged count and hashes count.
- Last result persisted in local state and displayed below the card header.

### Dark Mode -- HIGH | ID-23
**`StatusBanner` component uses hardcoded light-theme colors without dark variants.**
The banner uses `border-red-200 bg-red-50 text-red-900` and `border-green-200 bg-green-50
text-green-900`. In dark mode, `bg-red-50` renders as almost-white and `text-red-900`
as very dark red, both of which are unreadable against a dark card background. Every
other component in the codebase that uses colored backgrounds provides dark variants.

**Fix:** Add dark variants, e.g.:
```
border-red-200 bg-red-50 text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200
border-green-200 bg-green-50 text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200
```

### Motion Reduce -- LOW | ID-24
**Inconsistent `motion-reduce` on spinners.** The `RetentionCleanupCard` has
`motion-reduce:animate-none` on its spinner, but `MockActivitiesCard`, `ClearAllMockDataCard`,
`ClearE2ETestDataCard`, and `MockProfileCard` in the same file use `animate-spin` without
`motion-reduce:animate-none`. This is inconsistent within a single file.

---

## Cross-Cutting Findings

### CRITICAL | ID-19: Toast Auto-Dismiss is Effectively Disabled

**File:** `src/components/ui/use-toast.ts` line 12
```ts
const TOAST_REMOVE_DELAY = 1000000
```

This sets the toast removal delay to 1,000,000 milliseconds (approximately 16.7 minutes).
This means toasts never auto-dismiss in any practical sense. Every toast in the application
-- success confirmations, error messages, undo feedback, health check results -- will
persist on screen until the user manually closes them.

**Impact:** HIGH. This affects every component reviewed:
- Webhook CRUD toasts pile up during rapid operations (toggle 3 endpoints = 3 stacked toasts).
- Undo success toast blocks the bottom-right viewport area permanently.
- Health check result toast persists long after it is useful.
- With `TOAST_LIMIT = 1`, only 1 toast shows at a time, but it never leaves.

**Recommendation:** Set `TOAST_REMOVE_DELAY` to a reasonable value (5000ms for success,
8000ms for errors, or use the Radix `duration` prop per-toast). The Radix ToastProvider
accepts a `duration` prop that controls auto-close per-instance.

### CRITICAL | ID-25: No `aria-live` Regions for Async State Changes

None of the reviewed components use `aria-live` regions to announce state changes
to screen readers. When data loads, errors occur, or actions complete, the DOM changes
but screen readers are not notified. Specific instances:

- StatusHistoryTimeline: Loading -> data appears -- no announcement.
- StatusFunnelWidget: SkeletonBars has `aria-busy="true"` (good), but removing it does
  not announce the loaded content.
- WebhookSettings: Toggle active/inactive updates the list -- no announcement.
- EnrichmentStatusPanel: Refresh changes status badge -- no announcement.

**Recommendation:** Wrap the main content area of each component in an `aria-live="polite"`
region, or use the toast system (which does have aria-live via Radix) as the sole
announcement channel and ensure toasts auto-dismiss at a reasonable interval.

### CRITICAL | ID-26: Funnel Widget Has No Interactive Data Exploration

The StatusFunnelWidget renders as a static visualization. There is no way to:
- Click a bar to filter the job list by that status.
- Hover to see a tooltip with count and percentage.
- Access bar details via keyboard.

For a dashboard widget, this is a significant missed opportunity. Comparable dashboard
widgets in the project (e.g., activity charts) are interactive. The funnel should at
minimum support hover tooltips and keyboard focus on each bar.

### CRITICAL | ID-27: Webhook Endpoint Expanded Section Has No Transition

As detailed in ID-15, the expand/collapse of endpoint details uses a conditional render
(`isExpanded && (...)`) with no animation. This is the most visually jarring interaction
pattern found in the review. It affects every endpoint row and is triggered frequently
when users inspect their webhook configurations.

### CRITICAL | ID-28: Timeline Status Badge Contrast Failure (WCAG)

As detailed in ID-06, the `getStatusColor()` function returns `bg-slate-400 text-white`
for the "draft" status. Slate-400 (#94a3b8) with white text has a contrast ratio of
approximately 2.5:1, failing both WCAG AA (4.5:1 for normal text) and WCAG AAA (7:1).
Similarly, `bg-yellow-500 text-white` for "bookmarked" has approximately 1.9:1 contrast.

**Fix:** Use darker background variants or dark text for light backgrounds:
```
"draft" => "bg-slate-500 text-white"      // 4.6:1 ratio
"bookmarked" => "bg-yellow-600 text-white" // 3.6:1, or "bg-yellow-500 text-yellow-950"
```

### CRITICAL | ID-29: DeveloperContainer StatusBanner Dark Mode Failure

As detailed in ID-23, the StatusBanner uses hardcoded light-theme colors that become
unreadable in dark mode. This component is used across 5 developer tool cards.

### CRITICAL | ID-30: ToastProvider Missing `duration` Prop

The `Toaster` component renders `<ToastProvider>` without a `duration` prop. Radix
Toast's default duration is 5 seconds, but the `TOAST_REMOVE_DELAY` in `use-toast.ts`
overrides the internal cleanup. Neither mechanism is set to a usable value. The
ToastProvider should pass `duration={5000}` to enable Radix's built-in auto-dismiss
timer, which is the standard approach in shadcn/ui installations.

---

## Prioritized Action Items

### Must Fix (CRITICAL)

1. **ID-19 + ID-30: Toast auto-dismiss.** Set `TOAST_REMOVE_DELAY` to 5000-8000ms
   and/or add `duration={5000}` to `<ToastProvider>`. This is a single-line fix that
   improves every component in the application.

2. **ID-28: Badge contrast ratios.** Update `getStatusColor()` in StatusHistoryTimeline
   to use accessible color combinations. Test all 9 status values against WCAG AA.

3. **ID-29 + ID-23: StatusBanner dark mode.** Add `dark:` variants to the StatusBanner
   in DeveloperContainer.

4. **ID-25: aria-live regions.** Add `aria-live="polite"` to the content area of
   StatusHistoryTimeline, StatusFunnelWidget, and EnrichmentStatusPanel.

5. **ID-27 + ID-15: Webhook expand animation.** Wrap the expanded details in a
   Collapsible or CSS height transition.

### Should Fix (HIGH)

6. **ID-02: Timeline scroll UX.** Increase max-height, add scroll fade indicators.

7. **ID-06: Timeline badge dark mode.** Audit all `getStatusColor` values for both
   light and dark themes.

8. **ID-09: Funnel bar tooltips.** Add Tooltip component on hover/focus for each bar
   showing count, percentage, and label.

### Nice to Have (MEDIUM / LOW)

9. **ID-08: Funnel skeleton motion-reduce.** Add `motion-reduce:animate-none`.
10. **ID-01: Timeline entry animation.** Add fade-in on load.
11. **ID-12: Webhook skeleton loader.** Replace spinner with skeleton cards.
12. **ID-10: Funnel bars keyboard navigation.** Add `tabIndex={0}`.
13. **ID-24: Developer container motion-reduce consistency.** Add to all spinners.
14. **ID-11: Funnel label width on mobile.** Use flexible width.
15. **ID-07: Timeline badge wrapping on mobile.** Test with long status names.
16. **ID-17: Webhook endpoint row mobile layout.** Test on 375px.

---

## Appendix: Component State Coverage Matrix

| Component | Loading | Empty | Error | Transition | Feedback | Mobile | Dark | Keyboard | Focus Mgmt |
|---|---|---|---|---|---|---|---|---|---|
| StatusHistoryTimeline | OK | OK | OK | MISS | OK | WARN | FAIL | OK | MISS |
| StatusFunnelWidget | WARN | OK | OK | OK | MISS | WARN | OK | WARN | N/A |
| WebhookSettings | WARN | OK | OK | FAIL | OK | WARN | OK | OK | MISS |
| ApiKeySettings | OK | N/A | OK | OK | OK | OK | OK | OK | OK |
| EnrichmentStatusPanel | OK | OK | OK | WARN | OK | OK | OK | OK | OK |
| CompanyLogo | OK | OK | OK | OK | N/A | OK | OK | OK | N/A |
| GlobalUndoListener | N/A | N/A | OK | N/A | OK | N/A | N/A | OK | N/A |
| RetentionCleanupCard | N/A | N/A | OK | N/A | OK | OK | FAIL | OK | OK |

**Legend:** OK = adequate, WARN = minor issue, MISS = missing entirely, FAIL = broken/inaccessible
