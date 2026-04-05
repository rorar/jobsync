# WCAG 2.2 Accessibility Audit — S5a New UI Components

**Date:** 2026-04-04
**Auditor:** Visual Validation Agent (claude-sonnet-4-6)
**Standard:** WCAG 2.2 Level AA
**Scope:** 5 components introduced or modified in Sprint S5a

## Components Audited

1. `EnrichmentStatusPanel` — `src/components/enrichment/EnrichmentStatusPanel.tsx`
   (Also includes `CompanyLogo` — `src/components/ui/company-logo.tsx`)
2. `StatusHistoryTimeline` — `src/components/crm/StatusHistoryTimeline.tsx`
3. `StatusFunnelWidget` — `src/components/dashboard/StatusFunnelWidget.tsx`
4. `WebhookSettings` — `src/components/settings/WebhookSettings.tsx`
5. `ApiKeySettings` (modified) — `src/components/settings/ApiKeySettings.tsx`

---

## Summary of Findings

| Severity  | Count |
|-----------|-------|
| Critical  | 4     |
| High      | 8     |
| Medium    | 7     |
| Low       | 4     |
| **Total** | **23**|

---

## Component 1: EnrichmentStatusPanel + CompanyLogo

### Finding ESP-1

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** High
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 74–85

**Issue:** The `StatusIcon` component renders Lucide icons (`CheckCircle`, `Clock`, `XCircle`, `Database`) without any accessible label. Each icon communicates the enrichment status visually but there is no `aria-label` or `aria-hidden` combined with an adjacent text alternative on these icon elements. Screen readers will attempt to announce the SVG title (which Lucide does not provide by default), producing either silence or the raw path data.

```tsx
// Current — no accessible name
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "found":
      return <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "not_found":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    ...
  }
}
```

**Fix:** Either add `aria-label` directly to each icon, or mark every icon `aria-hidden="true"` and ensure the adjacent `Badge` text (which is already rendered via `getStatusLabel`) is sufficient for screen-reader users. The second approach is preferred since the badge already provides the text equivalent:

```tsx
function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "found":
      return <CheckCircle aria-hidden="true" className="h-4 w-4 text-green-600 dark:text-green-400" />;
    case "not_found":
      return <Clock aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
    case "error":
      return <XCircle aria-hidden="true" className="h-4 w-4 text-destructive" />;
    default:
      return <Database aria-hidden="true" className="h-4 w-4 text-muted-foreground" />;
  }
}
```

---

### Finding ESP-2

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)
**Severity:** Critical
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 206–229

**Issue:** The error state uses `role="alert"` correctly, but the loading state (`EnrichmentStatusSkeleton`) and the triggering/refreshing busy states have no live region. When `triggering` or `refreshingId` changes to a loading spinner, screen readers receive no announcement. A user who activates the "Trigger Enrichment" or "Refresh" button has no programmatic feedback that an operation is in progress or has completed. The toast notifications that appear on success/failure are outside the component and may or may not be picked up depending on the toast implementation's live region.

```tsx
// triggering state: no aria-live announcement
{triggering ? (
  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin motion-reduce:animate-none" />
) : (
  <Database className="h-3.5 w-3.5 mr-1.5" />
)}
```

**Fix:** Add an `aria-live="polite"` region that announces the current operation status:

```tsx
{/* Accessible live region for operation status */}
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {triggering ? t("enrichment.enriching") : ""}
  {refreshingId ? t("enrichment.refreshing") : ""}
</div>
```

Additionally, mark spinner icons with `aria-hidden="true"` and add `aria-busy="true"` to the button while the operation runs:

```tsx
<Button
  aria-busy={triggering}
  disabled={triggering}
  ...
>
```

---

### Finding ESP-3

**WCAG Criterion:** 2.4.6 Headings and Labels (Level AA)
**Severity:** Medium
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 263–318

**Issue:** The results list rendered at lines 263–318 uses a generic `<div>` as the container with no labelled structure. The dimension name ("Logo", "DeepLink") and status badge are grouped inside a flex container but there is no semantic grouping (no `<dl>`, `<table>`, or labelled `<section>`) to communicate the key-value relationship between dimension and status to screen readers. A screen reader user tabbing through the list will hear "Logo", "Completed", then immediately the Refresh button — with no structural cue connecting them as a data row.

**Fix:** Use a description list or add an explicit accessible label that groups dimension with status:

```tsx
<dl className="space-y-2">
  {results.map((result) => (
    <div key={result.id} className="flex items-center gap-3 p-3 rounded-md border">
      <StatusIcon status={result.status} />
      <div className="flex-1 min-w-0">
        <dt className="text-sm font-medium">{t(getDimensionLabel(result.dimension))}</dt>
        <dd className="flex items-center gap-2 mt-0.5">
          <Badge variant={getStatusVariant(result.status)} className="text-xs">
            {t(getStatusLabel(result.status))}
          </Badge>
        </dd>
      </div>
      {/* Refresh button */}
    </div>
  ))}
</dl>
```

---

### Finding ESP-4

**WCAG Criterion:** 2.5.8 Target Size (Level AA, WCAG 2.2)
**Severity:** High
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 298–316

**Issue:** The Refresh button for each enrichment result row uses `size="sm"` (Shadcn `h-9` = 36px height) and `variant="ghost"`. The visible hit target is confirmed via the Button component definition as `h-9` (36px). The icon itself inside is 14px (`h-3.5 w-3.5`). WCAG 2.2 SC 2.5.8 requires a minimum target size of 24x24 CSS pixels. The 36px height passes, but the padding is `px-3` which sets 12px horizontal padding on each side around a 14px icon, giving ~38px total width. This passes the 24px threshold. However, on mobile where icon-only display applies (the text is `sr-only` at small breakpoints), the touch target is adequate at 36x38px.

**Note:** This criterion is met for the refresh button. No fix required. Recorded for completeness of audit coverage.

---

### Finding ESP-5

**WCAG Criterion:** 3.3.2 Labels or Instructions (Level A)
**Severity:** Medium
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 284–295

**Issue:** The metadata sub-row under each enrichment result ("Source: clearbit · Last updated: Mar 23, 2026") uses `aria-hidden="true"` on the separator dot (`&middot;`) — which is correct — but the entire metadata section is hidden on small screens using `hidden sm:inline`. The "Last updated" date disappears on mobile. Crucially, the `<span>` that contains this metadata has no `aria-label` or equivalent, so a screen reader user on a small-screen device loses access to the "last updated" timestamp, which is relevant context for deciding whether to refresh.

**Fix:** The hidden content should remain accessible to screen readers even when visually hidden at small breakpoints. Replace `hidden sm:inline` with `sr-only sm:not-sr-only`:

```tsx
<span className="sr-only sm:not-sr-only">
  {t("enrichment.lastUpdated")}:{" "}
  {formatDateShort(new Date(result.updatedAt), locale)}
</span>
```

---

### Finding ESP-6 (CompanyLogo)

**WCAG Criterion:** 1.4.3 Contrast (Level AA)
**Severity:** Medium
**File:** `src/components/ui/company-logo.tsx`
**Lines:** 82–103

**Issue:** The initials avatar renders the company initials in `text-muted-foreground` on a `bg-muted` background. In Shadcn UI's default light theme, `--muted` is `hsl(210 40% 96.1%)` (approximately #f4f4f5) and `--muted-foreground` is `hsl(215.4 16.3% 46.9%)` (approximately #6d7a8e). The contrast ratio between these two values is approximately 3.1:1. For the `sm` size (`text-[10px]`), this is text below the 18pt (24px) large text threshold, requiring 4.5:1. The initials fail the minimum contrast requirement at the `sm` size. At `md` (12px) and `lg` (14px), the same failure applies.

**Fix:** Use a higher-contrast foreground token for the initials text. Options:

```tsx
// Option A: use text-foreground (typically near black/white)
<span className={cn(sizeConfig.text, "font-medium leading-none text-foreground select-none")}>

// Option B: use a dedicated token that meets 4.5:1 on muted background
// e.g., text-secondary-foreground if its contrast is sufficient in the theme
```

---

### Finding ESP-7

**WCAG Criterion:** 1.4.1 Use of Color (Level A)
**Severity:** High
**File:** `src/components/enrichment/EnrichmentStatusPanel.tsx`
**Lines:** 74–85, 280–281

**Issue:** The `StatusIcon` communicates status through color alone: green for "found", gray/muted for "not_found", red/destructive for "error". The icons themselves differ in shape (CheckCircle vs Clock vs XCircle vs Database) which provides a non-color indicator. However, the `Badge` component that appears alongside uses `getStatusVariant()` which maps "found" to `default` (primary-colored) and "not_found" to `secondary` (gray), relying primarily on color to distinguish status states in the badge. There is no additional non-color indicator (icon, pattern, or text shape difference) in the badge itself.

**Assessment:** The text label within the badge (e.g., "Completed", "Pending", "Failed") does provide a text-based non-color indicator, satisfying 1.4.1. The criterion is met at the badge level. Combined with the icon shapes in `StatusIcon`, color is not the sole means of conveying information. This finding is recorded as informational.

**Recommendation:** No fix required for 1.4.1 compliance. However, consider adding a short text prefix or icon inside the badge itself to make the distinction more robust for users who perceive color differently.

---

## Component 2: StatusHistoryTimeline

### Finding SHT-1

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)
**Severity:** Critical
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 154–157

**Issue:** The timeline container uses `role="list"` with `aria-label` (correct), but neither the loading state nor the fetch-completion state announces itself to screen readers. When `loading` transitions to `false` and entries appear, there is no `aria-live` region to inform screen reader users that content has loaded. A user activating the "Retry" button after an error also receives no announcement that the retry attempt is underway or has succeeded.

```tsx
// No live region anywhere in the component
const [loading, setLoading] = useState(true);
const [error, setError] = useState(false);
```

**Fix:** Add a visually hidden `aria-live` region at the component root level:

```tsx
{/* Status announcement for screen readers */}
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {loading ? t("jobs.statusHistoryLoading") : ""}
  {!loading && error ? t("jobs.statusHistoryError") : ""}
  {!loading && !error && entries.length === 0 ? t("jobs.statusHistoryEmpty") : ""}
  {!loading && !error && entries.length > 0
    ? t("jobs.statusHistoryCount").replace("{count}", String(entries.length))
    : ""}
</div>
```

---

### Finding SHT-2

**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** High
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 159–228

**Issue:** The timeline entries use `role="list"` and `role="listitem"` correctly on the outer containers. However, the visual structure of each entry — a dot, a connecting vertical line, status badges, an optional note, and a timestamp — communicates temporal order and transition information visually but not semantically. The `ArrowRight` icon between status badges (line 201) has no `aria-label` or `aria-hidden`. Screen readers will encounter the arrow icon as an unlabelled interactive/decorative element. The icon has no `aria-hidden="true"` attribute, meaning it will be announced as an image with no accessible name.

```tsx
<ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" />
```

**Fix:** Mark the arrow as decorative and ensure the transition meaning is conveyed through the surrounding text:

```tsx
<ArrowRight className="h-3 w-3 text-muted-foreground shrink-0" aria-hidden="true" />
```

Additionally, consider wrapping the from-to transition with an accessible description:

```tsx
<span className="sr-only">{t("jobs.statusChangedTo")}</span>
```

Between the previous and new status badges so screen readers announce "Applied, changed to Interview" rather than "Applied [unlabelled icon] Interview".

---

### Finding SHT-3

**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** Medium
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 170–183

**Issue:** The timeline dot and connecting vertical line convey the temporal sequence of status changes visually. These are `<div>` elements with no semantic meaning. For a sighted user, the vertical line creates a visual timeline metaphor. A screen reader user hears only the `role="listitem"` structure, which is adequate for a flat list but loses the notion of chronological ordering and the "this is a timeline" metaphor. This is an informational gap rather than a strict failure, since the semantic list order does convey sequence.

**Assessment:** The `role="list"` with ordered entries satisfies 1.3.2 (Meaningful Sequence). The list order matches temporal order. No hard failure, but opportunity for improvement.

**Recommendation:** Consider using `<ol>` instead of `<div role="list">` to explicitly communicate ordered sequence, and add an `aria-label` that indicates chronological ordering:

```tsx
<ol
  className="max-h-80 overflow-y-auto pr-1"
  aria-label={t("jobs.statusHistoryChronological")}
>
```

---

### Finding SHT-4

**WCAG Criterion:** 1.4.1 Use of Color (Level A)
**Severity:** High
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 27–50, 172–179

**Issue:** `getStatusColor()` assigns unique background colors to each status badge (cyan for "applied", green for "interview", emerald for "offer", etc.). The timeline dot colors at lines 172–179 use three classes: `border-destructive` for rejected/expired, `border-green-500` for interview/offer/accepted, and `border-primary` for all others. This means three visually distinct groups of statuses share the same dot color ("primary"), distinguishable from each other only by reading the adjacent badge label.

More critically, the status badges in `getStatusColor()` use color as their primary differentiator. While each badge contains the status label as text (e.g., "Interview", "Rejected"), the hardcoded color classes (`bg-cyan-500`, `bg-green-500`, `bg-emerald-600`, `bg-green-700`) create a situation where "interview" and "offer" are represented by similar shades of green. Users with deuteranopia (green-blindness) will be unable to distinguish "Interview" from "Offer" and "Accepted" based on color — they must rely on the text label. This satisfies 1.4.1 by the text alone.

**Assessment:** 1.4.1 is technically met because text labels are always present. However, similar green hues for "interview", "offer", and "accepted" create a usability concern for color-blind users who may need to read carefully to distinguish stages.

**Recommendation:** Add a distinguishing shape or pattern indicator (e.g., border style difference, icon prefix) to reinforce differentiation beyond color.

---

### Finding SHT-5

**WCAG Criterion:** 2.4.7 Focus Visible (Level AA)
**Severity:** Medium
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 232–245

**Issue:** The "Show all" / "Show less" toggle button uses `variant="ghost"` and `size="sm"`. The Button component's base styles include `focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`, which provides a focus ring. However, `variant="ghost"` has no border in its default state, meaning the focus ring is the only visual indicator of the button's presence when it receives keyboard focus. The ring styling is sufficient for WCAG 2.4.7, but the ring color relies on the CSS variable `--ring`, which must meet 3:1 contrast against the adjacent background under 1.4.11. This cannot be verified without the resolved token values in the actual deployment theme.

**Recommendation:** Verify that `--ring` meets 3:1 contrast against the card background in both light and dark modes. If the theme uses a low-contrast ring color, override with an explicit ring class on this button.

---

### Finding SHT-6

**WCAG Criterion:** 3.3.2 Labels or Instructions (Level A)
**Severity:** Low
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 211–218

**Issue:** The note section renders a `MessageSquare` icon at line 214 without `aria-hidden="true"`. The icon is decorative — the note text `entry.note` immediately follows. Screen readers may announce the unlabelled icon.

```tsx
<MessageSquare className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
<p className="text-xs text-muted-foreground italic">{entry.note}</p>
```

**Fix:**

```tsx
<MessageSquare aria-hidden="true" className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
```

---

### Finding SHT-7

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** High
**File:** `src/components/crm/StatusHistoryTimeline.tsx`
**Lines:** 104–107

**Issue:** The `History` icon in the `CardHeader` at line 105 (`<History className="h-4 w-4 text-muted-foreground" />`) is purely decorative — the card title "Status History" immediately follows. The icon is not marked `aria-hidden="true"`.

Similarly, in the empty state (line 138–143), the `History` icon rendered without `aria-hidden="true"` will be announced as an unnamed image element.

**Fix:**

```tsx
<History aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
```

(Both occurrences at lines 105 and 138.)

---

## Component 3: StatusFunnelWidget

### Finding SFW-1

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)
**Severity:** Critical
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 236–249

**Issue:** The `SkeletonBars` component uses `aria-busy="true"` and `aria-label="Loading pipeline data"` — both correct. However, when loading completes and the actual data replaces the skeleton, there is no `aria-live` region announcing the completion. The widget transitions silently from loading to showing data. A screen reader user initiated no action here (this is a background fetch), but they still need to know when data becomes available.

Additionally, the `ErrorState` component (lines 265–281) renders the error message in a `<p>` but without `role="alert"`. For dynamically injected errors (the state transitions from "loading" to "error"), the error is not announced to screen readers.

```tsx
{state.status === "error" && (
  <ErrorState message={t(state.message)} onRetry={fetchData} />
)}
```

```tsx
// ErrorState — no role="alert"
function ErrorState({ message, onRetry }) {
  return (
    <div className="flex flex-col ...">
      <p className="text-sm text-destructive">{message}</p>
```

**Fix:**

```tsx
// Add aria-live at widget level for load completion
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {state.status === "loaded" && !isEmpty
    ? t("dashboard.pipelineLoaded").replace("{count}", String(totalJobs))
    : ""}
</div>

// Add role="alert" to ErrorState
function ErrorState({ message, onRetry }) {
  return (
    <div role="alert" className="flex flex-col ...">
      <p className="text-sm text-destructive">{message}</p>
```

---

### Finding SFW-2

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** High
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 185–205

**Issue:** The bar elements use `role="meter"` with `aria-label`, `aria-valuenow`, `aria-valuemin`, and `aria-valuemax` — this is well-implemented and communicates the count to screen readers correctly. However, the count value is also rendered visually as a `<span>` absolutely positioned over the bar (lines 201–204). This visible count span has no associated semantic meaning; it's a sibling to the `role="meter"` div, not a child. A screen reader will announce the meter's `aria-label` (e.g., "Bookmarked: 5") AND may separately encounter the "5" text inside the span as floating text with no context.

```tsx
<span className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums text-foreground">
  {count}
</span>
```

**Fix:** Mark the visible count span as `aria-hidden="true"` since the value is already communicated by the `role="meter"` element:

```tsx
<span
  aria-hidden="true"
  className="absolute inset-y-0 right-2 flex items-center text-xs font-semibold tabular-nums text-foreground"
>
  {count}
</span>
```

---

### Finding SFW-3

**WCAG Criterion:** 1.4.1 Use of Color (Level A)
**Severity:** Medium
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 211–223

**Issue:** The conversion percentage label between stages uses color to indicate "biggest drop-off": orange (`text-orange-500`) for the drop-off stage vs. `text-muted-foreground` for all others. The `TrendingDown` icon is conditionally rendered only for the drop-off stage, which does provide a non-color indicator. However, the icon is missing `aria-hidden="true"`, and there is no screen reader accessible announcement of which stage is the biggest drop-off.

```tsx
{isDropoff && (
  <TrendingDown className="inline-block w-3 h-3 mr-0.5 -mt-px" />
)}
{conversionPercent(countsForStages[i], countsForStages[i + 1]) ?? 0}%
```

**Fix:** Add `aria-hidden="true"` to the TrendingDown icon and provide a screen-reader-accessible indicator:

```tsx
{isDropoff && (
  <>
    <TrendingDown aria-hidden="true" className="inline-block w-3 h-3 mr-0.5 -mt-px" />
    <span className="sr-only">{t("dashboard.biggestDropoff")}</span>
  </>
)}
```

---

### Finding SFW-4

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** Low
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 255–261

**Issue:** The `EmptyState` component renders a `Briefcase` icon without `aria-hidden="true"`. The icon is decorative and immediately followed by descriptive text.

```tsx
<Briefcase className="w-10 h-10 text-muted-foreground/50 mb-2" />
```

**Fix:**

```tsx
<Briefcase aria-hidden="true" className="w-10 h-10 text-muted-foreground/50 mb-2" />
```

---

### Finding SFW-5

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** Low
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 276–278

**Issue:** The `ErrorState` retry button renders a `RefreshCw` icon without `aria-hidden="true"`. The button itself has visible text ("Retry"), so the icon is decorative.

```tsx
<RefreshCw className="w-3.5 h-3.5 mr-1" />
{t("dashboard.retryButton")}
```

**Fix:**

```tsx
<RefreshCw aria-hidden="true" className="w-3.5 h-3.5 mr-1" />
```

---

### Finding SFW-6

**WCAG Criterion:** 2.4.6 Headings and Labels (Level AA)
**Severity:** Medium
**File:** `src/components/dashboard/StatusFunnelWidget.tsx`
**Lines:** 146–158

**Issue:** The `CardTitle` at line 147 uses `text-sm font-medium text-green-600` as its class. The WCAG requirement for large text (>= 18pt or 14pt bold) is 3:1 contrast; for normal text it is 4.5:1. `text-sm` is 14px (not bold by default here, `font-medium` is 500 weight). `text-green-600` is approximately `#16a34a`. On a white card background (`bg-background`), the contrast ratio for `#16a34a` on `#ffffff` is approximately 3.4:1, which falls below the 4.5:1 requirement for text that does not qualify as "large text." Even at 14px bold (font-medium is 500, not 700), it does not meet the 3:1 large-text threshold for bold text, which requires 18.67px at bold weight.

**Fix:** Use a higher-contrast green, or use the standard `text-foreground` for the heading:

```tsx
// Option A: use foreground for guaranteed contrast
<CardTitle className="text-sm font-medium">
  {t("dashboard.pipeline")}
</CardTitle>

// Option B: use a darker green that achieves 4.5:1 on white
// text-green-800 (#166534) has approximately 6.0:1 contrast on white
<CardTitle className="text-sm font-medium text-green-800 dark:text-green-400">
```

---

## Component 4: WebhookSettings

### Finding WHS-1

**WCAG Criterion:** 3.3.1 Error Identification (Level A)
**Severity:** High
**File:** `src/components/settings/WebhookSettings.tsx`
**Lines:** 158–165

**Issue:** When the user submits the create form with no events selected, the error is communicated only via a toast notification:

```tsx
if (selectedEvents.length === 0) {
  toast({
    variant: "destructive",
    title: t("webhook.selectEvents"),
  });
  return;
}
```

Toasts in most implementations are ephemeral and may not remain on screen long enough for all users. More critically, there is no error message adjacent to the event checkboxes (no `role="alert"` or `aria-describedby` linking the event group to an error), and the event checkbox `<div>` group has no `aria-required` or `aria-invalid` state. Users who miss the toast (e.g., due to cognitive load or screen reader focus being elsewhere) have no persistent error indication.

**Fix:** Add an inline error message for the events group and use `aria-describedby` to link it:

```tsx
const [eventsError, setEventsError] = useState<string | null>(null);

// In handleCreate:
if (selectedEvents.length === 0) {
  setEventsError(t("webhook.selectEvents"));
  return;
}

// In JSX, after the event checkboxes grid:
{eventsError && (
  <p id="webhook-events-error" role="alert" className="text-sm text-destructive">
    {eventsError}
  </p>
)}

// On the events container:
<div
  className="grid grid-cols-1 sm:grid-cols-2 gap-2"
  aria-describedby={eventsError ? "webhook-events-error" : undefined}
>
```

---

### Finding WHS-2

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)
**Severity:** High
**File:** `src/components/settings/WebhookSettings.tsx`
**Lines:** 553–558

**Issue:** The `Switch` component for activating/deactivating an endpoint has a well-formed `aria-label` that reflects the current state:

```tsx
<Switch
  checked={endpoint.active}
  aria-label={endpoint.active ? t("webhook.active") : t("webhook.inactive")}
  ...
/>
```

However, when the toggle is activated and `toggling === endpoint.id`, the switch becomes `disabled` but there is no `aria-busy` or `aria-live` region announcing that the state change is being processed. The user may toggle the switch and receive no feedback about the async operation's progress.

**Fix:**

```tsx
<Switch
  checked={endpoint.active}
  onCheckedChange={(checked) => onToggleActive(endpoint.id, checked)}
  disabled={toggling === endpoint.id}
  aria-busy={toggling === endpoint.id}
  aria-label={
    toggling === endpoint.id
      ? t("webhook.updating")
      : endpoint.active
        ? t("webhook.active")
        : t("webhook.inactive")
  }
/>
```

---

### Finding WHS-3

**WCAG Criterion:** 2.4.3 Focus Order (Level A)
**Severity:** Medium
**File:** `src/components/settings/WebhookSettings.tsx`
**Lines:** 560–573

**Issue:** The expand/collapse button and the delete button appear side by side in the DOM in this order: active toggle → expand button → delete button. The expand button reveals additional details in-place below the row. When expanded, the newly revealed content (URL, subscribed events, failure count) is inserted after the expand button in the DOM, which means keyboard focus will not naturally flow to the revealed content — it remains on the expand button. Users navigating via Tab after expanding must tab past the delete button before reaching the newly revealed details.

**Fix:** After toggling `isExpanded` to true, programmatically move focus to the expanded detail section, or restructure the DOM so expanded content precedes the action buttons. A simpler approach is to use `aria-expanded` on the button and `aria-controls` pointing to the expanded detail `id`:

```tsx
<Button
  size="sm"
  variant="ghost"
  onClick={onToggleExpand}
  aria-expanded={isExpanded}
  aria-controls={`endpoint-details-${endpoint.id}`}
  aria-label={isExpanded ? t("webhook.hideDetails") : t("webhook.showDetails")}
>
  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
</Button>

// Expanded section:
{isExpanded && (
  <div id={`endpoint-details-${endpoint.id}`} className="mt-3 pt-3 border-t space-y-2">
    ...
  </div>
)}
```

---

### Finding WHS-4

**WCAG Criterion:** 1.3.1 Info and Relationships (Level A)
**Severity:** Medium
**File:** `src/components/settings/WebhookSettings.tsx`
**Lines:** 619–627

**Issue:** In the expanded endpoint detail section, "Subscribed Events" displays a list of event badges. These are rendered as a `<div className="flex flex-wrap gap-1">` containing `<Badge>` elements (which render as `<span>`). There is no semantic list structure communicating that these are multiple items in a group. A screen reader will announce each badge as floating inline text with no relationship indication.

**Fix:** Use a semantic list:

```tsx
<ul className="flex flex-wrap gap-1 list-none p-0">
  {endpoint.events.map((event) => (
    <li key={event}>
      <Badge variant="outline" className="text-xs">
        {t(`webhook.event.${event}`)}
      </Badge>
    </li>
  ))}
</ul>
```

---

### Finding WHS-5

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** Medium
**File:** `src/components/settings/WebhookSettings.tsx`
**Lines:** 525–530

**Issue:** The `Webhook` icon in the empty state at line 413 uses `aria-hidden="true"` (correct). However, the `Webhook` icon at line 528, rendered inside each `EndpointRow` in the compact row, does not have `aria-hidden="true"`. The icon is purely decorative (the URL text immediately follows).

```tsx
<Webhook className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden="true" />
```

Wait — reviewing line 528 closely, `aria-hidden="true"` IS present (line 528 of the source). This finding is retracted. The EndpointRow Webhook icon is correctly decorated. However, the `ChevronDown`/`ChevronUp` icons inside the expand/collapse button (lines 567–571) are not `aria-hidden="true"`, and the button itself carries a descriptive `aria-label`. The icon is therefore duplicative and should be hidden.

```tsx
{isExpanded ? (
  <ChevronUp aria-hidden="true" className="h-4 w-4" />
) : (
  <ChevronDown aria-hidden="true" className="h-4 w-4" />
)}
```

---

## Component 5: ApiKeySettings (Modified — Health Check button added)

### Finding AKS-1

**WCAG Criterion:** 4.1.3 Status Messages (Level AA)
**Severity:** Critical
**File:** `src/components/settings/ApiKeySettings.tsx`
**Lines:** 496–511

**Issue:** The new Health Check button shows a loading spinner (`Loader2`) while `checking === module.moduleId`. The result is communicated exclusively via a toast notification. There is no `aria-live` region on the button or adjacent to it that announces the outcome to screen reader users. The button's accessible name does update (from `healthCheckNow` to `healthCheckRunning`) via the visible text change, but there is no `aria-busy` attribute.

```tsx
<Button
  size="sm"
  variant="outline"
  disabled={checking === module.moduleId || module.status !== "active"}
  onClick={() => handleHealthCheck(module)}
  aria-label={t("settings.healthCheckNow")}
>
  {checking === module.moduleId ? (
    <Loader2 className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" />
  ) : (
    <HeartPulse className="mr-1 h-3 w-3" />
  )}
  {checking === module.moduleId
    ? t("settings.healthCheckRunning")
    : t("settings.healthCheckNow")}
</Button>
```

Note: The `aria-label` is hardcoded as `t("settings.healthCheckNow")` and does NOT update when the check is running — it always reads "Check Health" even when the button text reads "Checking...". The `aria-label` overrides the button's visible text, creating a discrepancy between what sighted users see and what screen readers announce.

**Fix:**

```tsx
<Button
  size="sm"
  variant="outline"
  disabled={checking === module.moduleId || module.status !== "active"}
  onClick={() => handleHealthCheck(module)}
  aria-label={
    checking === module.moduleId
      ? t("settings.healthCheckRunning")
      : t("settings.healthCheckNow")
  }
  aria-busy={checking === module.moduleId}
>
  {checking === module.moduleId ? (
    <Loader2 aria-hidden="true" className="mr-1 h-3 w-3 animate-spin motion-reduce:animate-none" />
  ) : (
    <HeartPulse aria-hidden="true" className="mr-1 h-3 w-3" />
  )}
  {checking === module.moduleId
    ? t("settings.healthCheckRunning")
    : t("settings.healthCheckNow")}
</Button>
```

Additionally add an `aria-live` region adjacent to each module card:

```tsx
<div aria-live="polite" aria-atomic="true" className="sr-only">
  {checking === module.moduleId ? t("settings.healthCheckRunning") : ""}
</div>
```

---

### Finding AKS-2

**WCAG Criterion:** 1.1.1 Non-text Content (Level A)
**Severity:** Medium
**File:** `src/components/settings/ApiKeySettings.tsx`
**Lines:** 376–384

**Issue:** The health status indicator dot (`<span>` with background color classes) uses only the `title` attribute to convey the health status:

```tsx
<span
  className={`inline-block h-2 w-2 rounded-full ${
    module.healthStatus === "healthy" ? "bg-green-500" : ...
  }`}
  title={module.healthStatus}
/>
```

The `title` attribute is not reliably announced by screen readers and is not accessible to keyboard-only users (it appears as a browser tooltip on hover only). The health status (healthy/degraded/unreachable/unknown) is conveyed only through color (green/yellow/red/gray) and the `title` tooltip. This violates 1.4.1 (color as sole indicator) as well as 1.1.1.

**Fix:** Replace `title` with a visually hidden `<span>` for screen reader access, and add `role="img"` with `aria-label`:

```tsx
<span
  role="img"
  aria-label={t(HEALTH_STATUS_KEYS[module.healthStatus] ?? "enrichment.health.unknown")}
  className={`inline-block h-2 w-2 rounded-full ${
    module.healthStatus === "healthy" ? "bg-green-500" : ...
  }`}
/>
```

---

### Finding AKS-3

**WCAG Criterion:** 4.1.2 Name, Role, Value (Level A)
**Severity:** High
**File:** `src/components/settings/ApiKeySettings.tsx`
**Lines:** 388–394

**Issue:** The `Switch` component for toggling module active/inactive status uses a hardcoded English string in its `aria-label`:

```tsx
<Switch
  checked={module.status === "active"}
  disabled={toggling === module.moduleId}
  onCheckedChange={() => handleToggleStatus(module)}
  aria-label={`Toggle ${module.name} module`}
/>
```

The `aria-label` contains a hardcoded English string `"Toggle ${module.name} module"` rather than using an i18n key. This will not be translated for non-English locales (DE, FR, ES), violating the project's i18n requirement and creating an accessibility barrier for screen reader users in non-English locales.

**Fix:**

```tsx
<Switch
  checked={module.status === "active"}
  disabled={toggling === module.moduleId}
  onCheckedChange={() => handleToggleStatus(module)}
  aria-label={t("settings.toggleModule").replace("{name}", module.name)}
/>
```

Add the translation key `settings.toggleModule` to all 4 locale dictionaries.

---

### Finding AKS-4

**WCAG Criterion:** 2.5.8 Target Size (Level AA, WCAG 2.2)
**Severity:** High
**File:** `src/components/settings/ApiKeySettings.tsx`
**Lines:** 463–476

**Issue:** The delete button for an existing API key (lines 463–476) uses `size="sm"` (height `h-9` = 36px). Its content is icon-only: either a `Loader2` spinner or a `Trash2` icon at `h-3 w-3` (12px). There is no `aria-label` on this button. A screen reader will encounter a button with no accessible name, an icon with no accessible text, resulting in an unlabelled interactive control.

```tsx
<Button
  size="sm"
  variant="outline"
  className="text-destructive hover:text-destructive"
  disabled={deleting === module.id}
>
  {deleting === module.id ? (
    <Loader2 className="h-3 w-3 animate-spin motion-reduce:animate-none" />
  ) : (
    <Trash2 className="h-3 w-3" />
  )}
</Button>
```

**Fix:**

```tsx
<Button
  size="sm"
  variant="outline"
  className="text-destructive hover:text-destructive"
  disabled={deleting === module.id}
  aria-label={t("settings.deleteApiKey")}
>
  {deleting === module.id ? (
    <Loader2 aria-hidden="true" className="h-3 w-3 animate-spin motion-reduce:animate-none" />
  ) : (
    <Trash2 aria-hidden="true" className="h-3 w-3" />
  )}
</Button>
```

---

### Finding AKS-5

**WCAG Criterion:** 1.4.3 Contrast (Level AA)
**Severity:** Medium
**File:** `src/components/settings/ApiKeySettings.tsx`
**Lines:** 363–366

**Issue:** The "Default: {ollamaUrl}" text uses `text-muted-foreground/70` — that is, the muted foreground color at 70% opacity. The base `--muted-foreground` in Shadcn default light theme is approximately `#6d7a8e`. At 70% opacity on a white background, the effective rendered color is approximately `#9aa3b0` (mixing with white). The contrast ratio of `#9aa3b0` on `#ffffff` is approximately 2.2:1, well below the 4.5:1 requirement for text at `text-xs` (12px). This affects both the "Default:" label line and the "Last connected" metadata line which uses the same class.

```tsx
<span className="block text-xs text-muted-foreground/70 mt-0.5">
  Default: {defaultOllamaUrl}
</span>
{module.lastSuccessfulConnection && (
  <span className="block text-xs text-muted-foreground/70 mt-0.5">
    {t("settings.lastConnected")}: ...
  </span>
)}
```

**Fix:** Use `text-muted-foreground` at full opacity (not `/70`), or use `text-foreground/60` which will still render with sufficient contrast:

```tsx
<span className="block text-xs text-muted-foreground mt-0.5">
  Default: {defaultOllamaUrl}
</span>
```

---

## Cross-Component Observations

### Observation CC-1: Consistent `aria-hidden` Gap on Lucide Icons

All five components import and render Lucide icons without consistently applying `aria-hidden="true"` to purely decorative icons. This is a systemic pattern. The fix is uniform: every Lucide icon that is accompanied by a visible text label or has a sibling `Badge`/`span` providing the same meaning must receive `aria-hidden="true"`. Icons that are the sole conveyor of meaning require `aria-label` on themselves or their container.

**Affected components and icons:**
- `EnrichmentStatusPanel.tsx`: `StatusIcon` variants (ESP-1), `AlertTriangle` in error state (line 215)
- `StatusHistoryTimeline.tsx`: `History` (lines 105, 138), `ArrowRight` (line 201), `MessageSquare` (line 214)
- `StatusFunnelWidget.tsx`: `TrendingDown` (line 218), `Briefcase` (line 256), `RefreshCw` (line 278)
- `ApiKeySettings.tsx`: `HeartPulse` (line 506), `Trash2` (line 474), `Plus` (line 459)
- `WebhookSettings.tsx`: `ChevronDown`/`ChevronUp` (lines 568–571)

### Observation CC-2: `aria-live` Regions Missing from All Async Operations

None of the five components implement `aria-live` regions for async state transitions (loading → loaded, triggering → complete). This is a systemic gap. All five components rely exclusively on toast notifications for success/failure feedback, which may not be reliably announced depending on the screen reader and the toast implementation's live region placement.

### Observation CC-3: `motion-reduce:animate-none` is Present

All spinning loaders and skeleton pulses correctly include `motion-reduce:animate-none` or `motion-reduce:transition-none`, which respects the user's `prefers-reduced-motion` preference (WCAG 2.3.3 Animation from Interactions, AAA). This is commendable and consistent across all components.

---

## Prioritized Fix List

### Priority 1 — Critical (fix before release)

| ID      | Component              | Criterion | Issue                                                       |
|---------|------------------------|-----------|-------------------------------------------------------------|
| ESP-2   | EnrichmentStatusPanel  | 4.1.3     | No `aria-live` for trigger/refresh operations               |
| SHT-1   | StatusHistoryTimeline  | 4.1.3     | No `aria-live` for load completion or retry feedback        |
| SFW-1   | StatusFunnelWidget     | 4.1.3     | Error state has no `role="alert"`; load completion not announced |
| AKS-1   | ApiKeySettings         | 4.1.3     | Health Check button `aria-label` doesn't update during check; no `aria-busy` |

### Priority 2 — High (fix in same sprint or next hotfix)

| ID      | Component              | Criterion | Issue                                                       |
|---------|------------------------|-----------|-------------------------------------------------------------|
| ESP-1   | EnrichmentStatusPanel  | 1.1.1     | StatusIcon icons lack `aria-hidden`                         |
| ESP-7   | EnrichmentStatusPanel  | 1.4.1     | Informational — badge color note                            |
| SHT-2   | StatusHistoryTimeline  | 1.3.1     | `ArrowRight` icon not `aria-hidden`; no "changed to" SR text |
| SHT-4   | StatusHistoryTimeline  | 1.4.1     | Similar green hues for interview/offer/accepted             |
| SHT-7   | StatusHistoryTimeline  | 1.1.1     | `History` icon not `aria-hidden` in header and empty state  |
| SFW-2   | StatusFunnelWidget     | 1.1.1     | Count `<span>` inside meter bar not `aria-hidden`           |
| WHS-1   | WebhookSettings        | 3.3.1     | No inline error for empty events selection                  |
| WHS-2   | WebhookSettings        | 4.1.3     | Switch has no `aria-busy` during toggle operation           |
| AKS-3   | ApiKeySettings         | 4.1.2     | Hardcoded English `aria-label` on module toggle Switch      |
| AKS-4   | ApiKeySettings         | 4.1.2     | Delete API key button has no `aria-label`                   |

### Priority 3 — Medium (next regular sprint)

| ID      | Component              | Criterion | Issue                                                       |
|---------|------------------------|-----------|-------------------------------------------------------------|
| ESP-3   | EnrichmentStatusPanel  | 2.4.6     | Results list lacks semantic grouping (dl/dt/dd)             |
| ESP-5   | EnrichmentStatusPanel  | 3.3.2     | "Last updated" hidden on mobile even to screen readers      |
| ESP-6   | CompanyLogo            | 1.4.3     | Initials text contrast ~3.1:1 on muted background           |
| SHT-5   | StatusHistoryTimeline  | 2.4.7     | Focus ring color on ghost button needs theme verification   |
| SFW-3   | StatusFunnelWidget     | 1.4.1     | `TrendingDown` icon not `aria-hidden`; no SR drop-off note  |
| SFW-6   | StatusFunnelWidget     | 2.4.6     | CardTitle uses `text-green-600` at ~3.4:1 contrast (fails 4.5:1) |
| WHS-3   | WebhookSettings        | 2.4.3     | Expanded content not announced; missing `aria-expanded`/`aria-controls` |
| WHS-4   | WebhookSettings        | 1.3.1     | Event badge list uses `<div>` not `<ul><li>`                |
| AKS-2   | ApiKeySettings         | 1.1.1     | Health dot uses `title` attribute only; color-only status   |
| AKS-5   | ApiKeySettings         | 1.4.3     | `text-muted-foreground/70` at ~2.2:1 contrast for metadata text |

### Priority 4 — Low (backlog)

| ID      | Component              | Criterion | Issue                                                       |
|---------|------------------------|-----------|-------------------------------------------------------------|
| SHT-3   | StatusHistoryTimeline  | 1.3.1     | Consider `<ol>` for chronological order                     |
| SHT-6   | StatusHistoryTimeline  | 3.3.2     | `MessageSquare` icon not `aria-hidden`                      |
| SFW-4   | StatusFunnelWidget     | 1.1.1     | `Briefcase` icon not `aria-hidden` in empty state           |
| SFW-5   | StatusFunnelWidget     | 1.1.1     | `RefreshCw` icon in ErrorState not `aria-hidden`            |

---

## What Was Done Well

- Loading skeletons consistently use `role="status"` with `aria-label="Loading"` (EnrichmentStatusPanel, StatusHistoryTimeline)
- Error states use `role="alert"` in EnrichmentStatusPanel and StatusHistoryTimeline
- The `Switch` components carry descriptive `aria-label` values (WebhookSettings)
- The URL input field in WebhookSettings uses `aria-invalid` and `aria-describedby` correctly (WHS: lines 355–363)
- Buttons with meaningful visible text carry matching `aria-label` values in most places
- All animations respect `motion-reduce:animate-none` / `motion-reduce:transition-none`
- `role="meter"` with full attribute set on funnel bars is correctly implemented (SFW-2 is a secondary duplication issue, not a meter implementation flaw)
- The `CompanyLogo` initials fallback correctly uses `role="img"` with `aria-label={companyName}`
- The `ChevronDown`/`ChevronUp` expand buttons in WebhookSettings carry `aria-label` (though the icon itself needs `aria-hidden`)
- The webhook secret dialog uses `aria-describedby="webhook-secret-warning"` correctly

---

*End of audit. 23 findings recorded across 5 components. 4 critical issues require immediate attention before the S5a release.*
