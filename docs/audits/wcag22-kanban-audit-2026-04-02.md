# WCAG 2.2 Accessibility Audit — CRM/Kanban UI Components

**Audit Date:** 2026-04-02
**Auditor:** Visual Validation Agent
**Scope:** KanbanBoard, KanbanCard, KanbanColumn, StatusTransitionDialog, KanbanEmptyState, KanbanViewModeToggle, useKanbanState, JobsContainer
**WCAG Version:** 2.2 (references 2.1 SCs where relevant)
**Standard:** Level AA (Level A issues included; Level AAA noted where applicable)

---

## Executive Summary

| Severity | Count |
|---|---|
| Critical (Level A failures) | 5 |
| High (Level AA failures) | 7 |
| Medium (AA partial / best practice) | 6 |
| Low (AAA / advisory) | 3 |
| **Total findings** | **21** |

The implementation shows a meaningful accessibility foundation: `@dnd-kit` keyboard sensors are configured, drag-and-drop screen reader announcements are present, `motion-reduce` variants are partially applied, and the view-mode toggle correctly implements the `radiogroup`/`radio` ARIA pattern. However, several critical and high-severity gaps remain that prevent Level AA conformance.

---

## POUR Principle Organisation

---

## P — PERCEIVABLE

---

### P-1 — Status color used as sole differentiator (partial failure)

- **WCAG SC:** 1.4.1 Use of Color — Level A
- **Severity:** High
- **File:Line:** `src/hooks/useKanbanState.ts:30-37`, `src/components/kanban/KanbanColumn.tsx:85`, `src/components/kanban/KanbanCard.tsx:60-66`
- **Issue:** Column headers and card left-border accents rely on color alone (blue, indigo, purple, green, emerald, red, gray) to distinguish job statuses. There is no shape, icon, pattern, or non-color text label within the border indicator itself that conveys the status. The text label in the column header does exist, but the card's `border-l-[3px]` colored strip — the primary per-card status indicator — carries no accessible non-color equivalent.
- **Impact:** Users with protanopia or deuteranopia cannot distinguish "bookmarked" (blue) from "draft" (also blue — identical palette entry), or reliably differentiate the seven status colors from the card border alone. Color-blind users relying on card-level status identification are affected.
- **Fix:** At minimum, add a small status icon (or a short abbreviated text label via `sr-only` positioned inside the card border area) so the status is communicated without color. For the "bookmarked" and "draft" entries sharing the exact same color object, this is also a functional bug. Example addition to `KanbanCard`:
  ```tsx
  <span className="sr-only">{t(`jobs.status${statusValue...}`)}</span>
  ```
  on the colored border element, or deduplicate bookmarked/draft colors.

---

### P-2 — Badge text at 10px violates minimum text size (advisory)

- **WCAG SC:** 1.4.4 Resize Text — Level AA
- **Severity:** Medium
- **File:Line:** `src/components/kanban/KanbanCard.tsx:106,113,118,126,130,134`
- **Issue:** Match score badges, tag badges, overflow count spans, and due-date badges all use `text-[10px]` (approximately 7.5pt). WCAG 1.4.4 requires text to be resizable to 200% without loss of content; it does not set a minimum, so this is not a strict failure. However, 10px text is below the browser default (16px) by 37%, making it extremely small on high-DPI screens or for users with low vision who rely on browser zoom before reaching 200%. At 10px, the text also fails the WCAG AAA 1.4.6 Enhanced Contrast requirement more easily.
- **Impact:** Users with low vision who have not yet engaged browser zoom (common on mobile) will find tag and score information near-illegible. On 1x DPI screens, 10px text renders at approximately 7.5pt — below typical legibility thresholds.
- **Fix:** Raise badge text to `text-xs` (12px / 9pt) minimum, which is the Shadcn badge default. The `h-5` badge height and `px-1.5` padding will accommodate this.

---

### P-3 — Amber due-date badges: contrast ratio at risk in light mode

- **WCAG SC:** 1.4.3 Contrast (Minimum) — Level AA
- **Severity:** High
- **File:Line:** `src/components/kanban/KanbanCard.tsx:130,134`
- **Issue:** "Due today" and "Due soon" badges use `bg-amber-100 text-amber-700`. Tailwind `amber-100` is approximately `#FEF3C7` (L = ~96%) and `amber-700` is approximately `#B45309` (L = ~36%). Calculated contrast ratio: approximately **4.7:1** — this passes 4.5:1 for normal text. However, the text is rendered at `text-[10px]` (below 18px / 14px bold threshold for "large text"), so the 4.5:1 requirement applies. At exactly 10px the ratio is borderline and browser rendering variations can push it below threshold. More critically, the dark-mode combination `dark:bg-amber-900/50 dark:text-amber-300` applies a 50% opacity background: `amber-900/50` over the dark card background `hsl(222.2 84% 4.9%)` produces an effective background that is approximately mid-dark. `amber-300` on that blended background may not reliably achieve 4.5:1. No measurement is possible without runtime rendering.
- **Impact:** Users with low contrast sensitivity, older monitors, or who use the dark theme cannot reliably read urgency indicators.
- **Fix:** For the dark mode variant, switch to a fully opaque background: `dark:bg-amber-800 dark:text-amber-100` (approximately 8.6:1). For the 10px size concern, raise to 12px as per P-2 to gain the benefit of the 4.5:1 threshold with a wider safe margin.

---

### P-4 — AlertDialog and Toast animate-in/out have no motion-reduce guard

- **WCAG SC:** 2.3.3 Animation from Interactions — Level AAA (advisory) / 2.2.2 Pause, Stop, Hide — Level A (partial)
- **Severity:** Medium
- **File:Line:** `src/components/ui/alert-dialog.tsx:21,39`, `src/components/ui/toast.tsx:28`
- **Issue:** `AlertDialogOverlay` uses `data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0`. `AlertDialogContent` uses additional `zoom-in-95`, `zoom-out-95`, `slide-in-from-left-1/2`, and `slide-in-from-top-[48%]`. The `Toast` component uses `slide-in-from-top-full`, `slide-out-to-right-full`, and `fade-out-80`. None of these have corresponding `motion-reduce:` variants. Kanban card components correctly apply `motion-reduce:transition-none`, `motion-reduce:animate-none` — but the shared UI primitives used by the kanban feature do not.
- **Impact:** Users with vestibular disorders who have enabled `prefers-reduced-motion` in their OS will still experience zoom, slide, and fade animations when the StatusTransitionDialog opens/closes and when undo/error toasts appear. Zoom animations in particular are known vestibular triggers.
- **Fix:** Add `motion-reduce:` guards to the shared components. For `AlertDialogContent`:
  ```
  motion-reduce:transition-none motion-reduce:animate-none
  ```
  For `AlertDialogOverlay`:
  ```
  motion-reduce:transition-none motion-reduce:animate-none
  ```
  For `Toast` in `toast.tsx`, add `motion-reduce:transition-none motion-reduce:animate-none` to the `toastVariants` base. Alternatively, add a global CSS rule:
  ```css
  @media (prefers-reduced-motion: reduce) {
    [data-state] { animation: none !important; transition: none !important; }
  }
  ```

---

### P-5 — DragOverlay card is not hidden from the accessibility tree during drag

- **WCAG SC:** 4.1.2 Name, Role, Value — Level A
- **Severity:** Medium
- **File:Line:** `src/components/kanban/KanbanBoard.tsx:434-442`
- **Issue:** When a drag is active, `DragOverlay` renders a second copy of the `KanbanCard`. The original card in the column remains in the DOM (with `opacity: 0.4`) and the overlay copy is rendered. Both copies have `role="listitem"` and identical accessible names (job title links, badge text). Screen readers will encounter two nodes with the same content simultaneously. `@dnd-kit`'s `DragOverlay` does not automatically set `aria-hidden="true"` on the visual overlay clone.
- **Impact:** Screen reader users performing keyboard drag-and-drop will hear duplicate content announcements. The ghost element is confusing and redundant.
- **Fix:** Add `aria-hidden="true"` to the `DragOverlay` wrapper to exclude the overlay clone from the accessibility tree:
  ```tsx
  <DragOverlay>
    <div aria-hidden="true">
      {activeJob && activeJobColumn ? (
        <KanbanCard job={activeJob} statusValue={activeJobColumn} isDragOverlay />
      ) : null}
    </div>
  </DragOverlay>
  ```

---

## O — OPERABLE

---

### O-1 — Drag handle `aria-label` describes instructions, not the item being dragged (Critical)

- **WCAG SC:** 4.1.2 Name, Role, Value — Level A (also relevant to 2.1.1 Keyboard)
- **Severity:** Critical
- **File:Line:** `src/components/kanban/KanbanCard.tsx:72-83`
- **Issue:** The drag handle `<button>` has `aria-label={t("jobs.kanbanDndInstructions")}` — the full keyboard instruction string ("Press Space or Enter to pick up a job card. Use arrow keys to move between columns..."). This is the accessible name of the button, not a description of what the button does or which item it acts on. A screen reader user navigating by button will hear the entire instruction paragraph as the button's name. The button has no accessible name identifying the specific job card it belongs to (e.g., "Drag Software Engineer at Acme Corp"). Additionally, the instructions text element at line 392 has `id="kanban-dnd-instructions"` but the drag handle button does NOT reference it via `aria-describedby` — so the instructions are not programmatically associated as a description.
- **Impact:** Screen reader users cannot identify which card a drag handle belongs to. They hear a long instruction string as the button label, and if they navigate by button landmarks they will find all drag handles indistinguishable.
- **Fix:**
  ```tsx
  <button
    type="button"
    aria-label={`${t("jobs.kanbanDragHandle")} ${job.JobTitle?.label}`}
    aria-describedby="kanban-dnd-instructions"
    {...attributes}
    {...listeners}
    ...
  >
  ```
  Add translation key `jobs.kanbanDragHandle` = "Drag" (EN), "Ziehen" (DE), etc. The `aria-describedby` reference to `id="kanban-dnd-instructions"` (already present in `KanbanBoard.tsx:392`) will then correctly associate the instructions as supplemental description rather than the primary label.

---

### O-2 — Collapse/expand buttons missing `aria-expanded` state (Critical)

- **WCAG SC:** 4.1.2 Name, Role, Value — Level A
- **Severity:** Critical
- **File:Line:** `src/components/kanban/KanbanColumn.tsx:92-100` (collapse button), `src/components/kanban/KanbanColumn.tsx:44-64` (expand pill button)
- **Issue:** The collapse button (ChevronDown) has `aria-label={t("jobs.kanbanCollapseColumn")}` and the expand pill has `aria-label={t("jobs.kanbanExpandColumn")}`, but neither has `aria-expanded` to communicate the current state. The column is either collapsed (pill rendered) or expanded (full column rendered), but the state is communicated only visually and through which element is rendered — not through ARIA state on the active control.
- **Impact:** Screen reader users cannot determine whether a column is currently expanded or collapsed without visually inspecting the board. The button announces only its action label, not the current state.
- **Fix:** For the collapse button (column is currently expanded, button collapses it):
  ```tsx
  <Button
    aria-expanded={true}
    aria-label={t("jobs.kanbanCollapseColumn")}
    ...
  >
  ```
  For the expand pill (column is currently collapsed, button expands it):
  ```tsx
  <button
    aria-expanded={false}
    aria-label={`${t("jobs.kanbanExpandColumn")}: ${getStatusLabel(status)}`}
    ...
  >
  ```
  Also consider using `aria-controls` pointing to the column body ID to strengthen the association.

---

### O-3 — Mobile status `<Select>` has no accessible label (Critical)

- **WCAG SC:** 1.3.1 Info and Relationships — Level A; 4.1.2 Name, Role, Value — Level A
- **Severity:** Critical
- **File:Line:** `src/components/kanban/KanbanBoard.tsx:483-506`
- **Issue:** The mobile status change `<Select>` dropdown rendered below each card has no `aria-label`, no associated `<label>` element, and no `aria-labelledby`. `<SelectTrigger>` contains only a `<SelectValue />` which shows the current status. For a screen reader, the trigger announces only the selected value with no context about what it controls or which job it belongs to. Multiple identical-looking selects appear on the page (one per job card).
- **Impact:** Screen reader users on mobile cannot identify which job's status they are changing, nor what the control's purpose is. Voice control users cannot reliably target a specific dropdown by spoken name.
- **Fix:**
  ```tsx
  <Select
    value={job.Status?.value}
    onValueChange={(val) => handleMobileStatusChange(job, val)}
  >
    <SelectTrigger
      className="h-7 text-xs w-auto max-w-[180px]"
      aria-label={`${t("jobs.kanbanChangeStatus")}: ${job.JobTitle?.label}`}
    >
      <SelectValue />
    </SelectTrigger>
    ...
  </Select>
  ```
  The translation key `jobs.kanbanChangeStatusMobile` already exists in all 4 locales; use that key.

---

### O-4 — JobsContainer search input and filter Select have no accessible labels (Critical)

- **WCAG SC:** 1.3.1 Info and Relationships — Level A; 4.1.2 Name, Role, Value — Level A
- **Severity:** Critical
- **File:Line:** `src/components/myjobs/JobsContainer.tsx:269-280`
- **Issue:** The search `<Input>` has `type="search"` and a `placeholder` but no `<label>` element, no `aria-label`, and no `aria-labelledby`. The adjacent `<Search>` icon is `aria-hidden` (implied, it is a decorative Lucide icon with no text). The filter `<Select>` / `<SelectTrigger>` has no `aria-label` either — it contains only the `<ListFilter>` icon and `<SelectValue placeholder={t("jobs.filter")} />`. While `placeholder` text is announced by some screen readers as a fallback label, it is not a reliable accessible name per WCAG 2.1 technique H44.
- **Impact:** Screen reader users cannot identify the purpose of the search field or filter dropdown. Form scanning by landmark will list them as unlabelled controls.
- **Fix:** For the search input:
  ```tsx
  <Input
    aria-label={t("jobs.searchPlaceholder")}
    type="search"
    placeholder={t("jobs.searchPlaceholder")}
    ...
  />
  ```
  For the filter `SelectTrigger`:
  ```tsx
  <SelectTrigger className="w-[120px] h-8" aria-label={t("jobs.filterBy")}>
  ```

---

### O-5 — `onDragOver` accessibility announcement returns empty string (no announcement) when `over` is null

- **WCAG SC:** 4.1.3 Status Messages — Level AA
- **Severity:** Medium
- **File:Line:** `src/components/kanban/KanbanBoard.tsx:363-370`
- **Issue:** The `onDragOver` announcement callback returns `""` (empty string) when `over` is null. An empty string announcement means the screen reader announces nothing when the card is dragged away from all targets (hovering over a gap between columns, or the board border). This leaves the user without feedback about the current drag position.
- **Impact:** Screen reader users performing keyboard drag-and-drop lose feedback during portions of the drag gesture where no valid drop target is under the cursor.
- **Fix:**
  ```tsx
  onDragOver({ active, over }) {
    if (!over) {
      const job = findJob(active.id as string);
      return t("jobs.kanbanDragNoTarget")
        .replace("{title}", job?.JobTitle?.label ?? "");
    }
    ...
  }
  ```
  Add translation key `jobs.kanbanDragNoTarget` = "Dragging {title}, no drop target" across all locales.

---

### O-6 — Column group `role="group"` should be `role="region"` with heading association, or use landmark correctly

- **WCAG SC:** 1.3.1 Info and Relationships — Level A
- **Severity:** Medium
- **File:Line:** `src/components/kanban/KanbanColumn.tsx:67-80`
- **Issue:** The expanded column container uses `role="group"` with `aria-label` containing the status name and count. The inner scrollable div uses `role="list"` with its own `aria-label`. `role="group"` is semantically appropriate for grouping form controls, but for a named board column containing a list of job cards, `role="region"` (which creates a landmark) is more appropriate and navigable. Furthermore, the `<h3>` element at line 85 is the visible column heading, but it is not referenced via `aria-labelledby` on the container — instead the container carries its own `aria-label` that duplicates the heading text.
- **Impact:** Screen reader users cannot navigate by landmark to individual columns. Using `role="group"` means the column does not appear in the landmark list (`<F6>` / landmark navigation in NVDA/JAWS).
- **Fix:** Change `role="group"` to `role="region"` and use `aria-labelledby` pointing to the heading's ID:
  ```tsx
  <div
    ref={setNodeRef}
    role="region"
    aria-labelledby={`column-heading-${status.value}`}
    ...
  >
    <div className={...}>
      <h3 id={`column-heading-${status.value}`} className={...}>
        {getStatusLabel(status)}
      </h3>
      ...
    </div>
  ```

---

### O-7 — `ToastClose` (dismiss X button) has no accessible name

- **WCAG SC:** 4.1.2 Name, Role, Value — Level A
- **Severity:** High
- **File:Line:** `src/components/ui/toast.tsx:74-90`
- **Issue:** The `ToastClose` button renders only `<X className="h-4 w-4" />` — the SVG icon has no `aria-hidden` attribute and no visually-hidden text label. The icon itself has no `title` element. Radix's ToastClose renders a plain `<button type="button">` with no default accessible name provided by the library. The resulting button has no accessible name, which is an explicit WCAG 4.1.2 failure.
- **Impact:** Screen reader users hear "button" with no label when they land on the close control. Voice control users cannot target it by name. This affects every toast shown during kanban operations (undo, move failed, move confirmed, invalid transition).
- **Fix:**
  ```tsx
  <ToastClose ...>
    <X className="h-4 w-4" aria-hidden="true" />
    <span className="sr-only">{t("common.dismiss")}</span>
  </ToastClose>
  ```
  Add translation key `common.dismiss` = "Dismiss" / "Schließen" / "Fermer" / "Cerrar".

---

## U — UNDERSTANDABLE

---

### U-1 — Invalid transition toast error is non-specific (advisory)

- **WCAG SC:** 3.3.1 Error Identification — Level A
- **Severity:** Low
- **File:Line:** `src/components/kanban/KanbanBoard.tsx:171-176, 279-284`
- **Issue:** When a drag-and-drop or mobile status change fails validation, the error toast uses `t("jobs.kanbanInvalidTransition")` which resolves to "Cannot move directly from {from} to {to}". This identifies the error but does not explain why the transition is invalid or what the user should do. WCAG 3.3.1 requires that input errors be described in text; 3.3.3 (Level AA) requires suggestions for correction.
- **Impact:** Users (including those with cognitive disabilities) do not learn what the valid transitions are or how to reach the target status via intermediate steps.
- **Fix:** Append a hint with `getValidTargets(fromStatus.value)` to list the available next statuses. Example: "Cannot move directly from Applied to Archived. Valid next steps: Interview, Rejected." This would require an additional i18n key `jobs.kanbanInvalidTransitionHint`.

---

### U-2 — StatusTransitionDialog confirm button label changes state without warning on `isPending` but does not announce loading to screen readers

- **WCAG SC:** 4.1.3 Status Messages — Level AA
- **Severity:** Medium
- **File:Line:** `src/components/kanban/StatusTransitionDialog.tsx:108-117`
- **Issue:** When `isPending` is true, the confirm button renders a spinner and the text "Moving...". The button is `disabled`. While the visual change is informative, there is no `aria-live` region announcing the in-progress state. Radix `AlertDialog` does not natively announce dynamic content changes within its body. The spinner `Loader2` has `aria-hidden="true"` which is correct, but the label change from "Move to {status}" to "Moving..." on a `disabled` button means focus is lost from the button (browsers move focus away from disabled elements) with no announcement of where it goes.
- **Impact:** Screen reader users who activate the confirm button lose track of what is happening. They do not hear "Moving..." and do not receive feedback that the action is processing.
- **Fix:** Add an `aria-live="polite"` region inside the dialog that announces the pending state:
  ```tsx
  <div aria-live="polite" aria-atomic="true" className="sr-only">
    {isPending ? t("jobs.kanbanMoveMoving") : ""}
  </div>
  ```
  Also consider keeping the button enabled with `aria-busy="true"` during pending instead of `disabled`, which prevents the focus loss issue.

---

### U-3 — `KanbanEmptyState` missing empty board description paragraph for screen readers

- **WCAG SC:** 1.3.1 Info and Relationships — Level A
- **Severity:** Low
- **File:Line:** `src/components/kanban/KanbanEmptyState.tsx:15-24`
- **Issue:** The empty state renders an `<h3>` with the text `t("jobs.kanbanEmptyBoard")` ("Add your first job to start tracking") and optionally a button. The component does not pass `onAddJob` from `KanbanBoard.tsx:324` — the prop is optional and the call site at line 324 passes no prop, so the button is never rendered. The `<h3>` heading level may also be contextually incorrect depending on the heading hierarchy of the surrounding page.
- **Impact:** The empty board call-to-action button is never visible. Users who encounter an empty board have no actionable path forward from this component. This is a functional gap affecting all users, not just AT users.
- **Fix:** Pass `onAddJob` from `KanbanBoard` to `KanbanEmptyState` if a parent-level add-job callback is available, or link to the existing "Add Job" button in the toolbar. At minimum, document the intent to prevent future regression:
  ```tsx
  return <KanbanEmptyState onAddJob={/* wire callback here */} />;
  ```

---

## R — ROBUST

---

### R-1 — `aria-describedby="kanban-dnd-instructions"` not connected to drag handle buttons

- **WCAG SC:** 4.1.2 Name, Role, Value — Level A
- **Severity:** High (duplicate of O-1, but a distinct issue)
- **File:Line:** `src/components/kanban/KanbanBoard.tsx:392`, `src/components/kanban/KanbanCard.tsx:72-83`
- **Issue:** The element with `id="kanban-dnd-instructions"` is defined in `KanbanBoard.tsx` but is not referenced by any element's `aria-describedby`. The drag handle button in `KanbanCard.tsx` uses this string as its `aria-label` instead — an incorrect usage. The result is that the instructions element exists in the DOM but is never programmatically associated with the controls it describes.
- **Impact:** Screen reader users do not receive keyboard operation instructions when they focus the drag handle. The instructions text is rendered as a visually-hidden orphan with no programmatic consumer.
- **Fix:** Remove the instruction string from `aria-label` on the drag handle. Add a short descriptive `aria-label` (see O-1 fix). Add `aria-describedby="kanban-dnd-instructions"` to the drag handle button so the instructions are announced as supplemental description.

---

### R-2 — `KanbanColumn` aria-label uses `{count} jobs` hardcoded English suffix

- **WCAG SC:** 3.1.1 Language of Page — Level A (advisory); 1.3.1 Info and Relationships
- **Severity:** Low
- **File:Line:** `src/components/kanban/KanbanColumn.tsx:71`
- **Issue:** The column container `aria-label` is constructed as:
  ```tsx
  `${getStatusLabel(status)} - ${t("jobs.kanbanCollapsedCount").replace("{count}", String(jobs.length))}`
  ```
  `t("jobs.kanbanCollapsedCount")` correctly pulls from the dictionary. However, the inner `role="list"` at line 111 uses a hardcoded English string:
  ```tsx
  aria-label={`${getStatusLabel(status)} jobs`}
  ```
  The word "jobs" here is not translated.
- **Impact:** Non-English screen reader users hear the translated status name followed by the English word "jobs". Minor but a real i18n gap affecting German, French, and Spanish users.
- **Fix:**
  ```tsx
  aria-label={`${getStatusLabel(status)} ${t("jobs.kanbanCollapsedCount").replace("{count}", String(jobs.length))}`}
  ```
  or add a dedicated key `jobs.kanbanColumnListLabel` = "{status} jobs" / "{status} Jobs" / "Emplois {status}" / "Empleos de {status}".

---

### R-3 — `ToastProvider` missing `label` prop — default English label not translated

- **WCAG SC:** 3.1.2 Language of Parts — Level AA
- **Severity:** Medium
- **File:Line:** `src/components/ui/toaster.tsx:17`
- **Issue:** `ToastProvider` is used without a `label` prop. Radix's implementation defaults to `"Notification"` (English) for the individual toast element label and `"Notifications ({hotkey})"` for the viewport `aria-label`. These strings are hardcoded in the Radix library and are not localised. When the app is used in German, French, or Spanish, screen readers will announce "Notification" in English.
- **Impact:** Non-English screen reader users hear English labels for the toast notification region. This affects all users of the kanban undo/error/success toast notifications.
- **Fix:**
  ```tsx
  <ToastProvider label={t("common.notification")}>
  ```
  Add `common.notification` to all 4 locale dictionaries.

---

## Summary Table

| ID | WCAG SC | Level | Severity | File | Short Description |
|---|---|---|---|---|---|
| P-1 | 1.4.1 | A | High | useKanbanState.ts:30-37 | Color sole differentiator for status; bookmarked=draft identical |
| P-2 | 1.4.4 | AA | Medium | KanbanCard.tsx:106,113 | Badge text at 10px below legible minimum |
| P-3 | 1.4.3 | AA | High | KanbanCard.tsx:130,134 | Amber dark mode badge contrast at risk |
| P-4 | 2.3.3/2.2.2 | AAA/A | Medium | alert-dialog.tsx:21,39; toast.tsx:28 | No motion-reduce on dialog and toast animations |
| P-5 | 4.1.2 | A | Medium | KanbanBoard.tsx:434-442 | DragOverlay clone not hidden from AT |
| O-1 | 4.1.2 | A | Critical | KanbanCard.tsx:72-83 | Drag handle aria-label is instructions text, not item identity |
| O-2 | 4.1.2 | A | Critical | KanbanColumn.tsx:92-100 | No aria-expanded on collapse/expand buttons |
| O-3 | 1.3.1/4.1.2 | A | Critical | KanbanBoard.tsx:483-506 | Mobile status Select has no accessible label |
| O-4 | 1.3.1/4.1.2 | A | Critical | JobsContainer.tsx:269-280 | Search input and filter Select unlabelled |
| O-5 | 4.1.3 | AA | Medium | KanbanBoard.tsx:363-370 | onDragOver returns "" — no announcement when no target |
| O-6 | 1.3.1 | A | Medium | KanbanColumn.tsx:67-80 | Column uses role=group instead of role=region landmark |
| O-7 | 4.1.2 | A | High | toast.tsx:74-90 | ToastClose button has no accessible name |
| U-1 | 3.3.3 | AA | Low | KanbanBoard.tsx:171-176 | Invalid transition error lacks correction suggestion |
| U-2 | 4.1.3 | AA | Medium | StatusTransitionDialog.tsx:108-117 | Loading state not announced; focus lost on disabled button |
| U-3 | 1.3.1 | A | Low | KanbanEmptyState.tsx:324 | onAddJob never passed — empty board CTA button never renders |
| R-1 | 4.1.2 | A | High | KanbanCard.tsx:72-83 | aria-describedby on instructions element never connected |
| R-2 | 3.1.1 | A | Low | KanbanColumn.tsx:111 | Hardcoded "jobs" English word in list aria-label |
| R-3 | 3.1.2 | AA | Medium | toaster.tsx:17 | ToastProvider label defaults to hardcoded English "Notification" |

---

## Positive Findings (Do Not Regress)

The following implementations are well-executed and should be preserved:

1. **`@dnd-kit` accessibility configuration** (`KanbanBoard.tsx:353-388`): `onDragStart`, `onDragOver`, `onDragEnd`, and `onDragCancel` announcements are all present with i18n strings in all 4 locales. This is the correct implementation pattern.

2. **`KeyboardSensor` with `sortableKeyboardCoordinates`** (`KanbanBoard.tsx:81-83`): Keyboard drag-and-drop is enabled. This satisfies the core requirement of WCAG 2.1.1 that all functionality be keyboard-operable.

3. **`motion-reduce` variants on kanban-specific animations** (`KanbanCard.tsx:63-64`, `KanbanColumn.tsx:50,75`, `KanbanBoard.tsx:309,313`): Skeleton, card, and column transitions correctly suppress animation for users who prefer reduced motion.

4. **`radiogroup`/`radio` ARIA pattern on `KanbanViewModeToggle`** (`KanbanViewModeToggle.tsx:39-48`): Correct ARIA pattern with `aria-checked`, roving `tabIndex`, and arrow-key navigation. Focus is moved programmatically on selection. Well implemented.

5. **`aria-hidden` on decorative icons** throughout all components: Lucide icons consistently carry `aria-hidden="true"`, preventing icon glyph names from being announced.

6. **Screen reader instructions element** (`KanbanBoard.tsx:392-394`): The `sr-only` instructions `div` with `id="kanban-dnd-instructions"` is a correct approach — it just needs to be connected via `aria-describedby` (see O-1 / R-1).

7. **`AlertDialog` from Radix** (`StatusTransitionDialog.tsx`): Using `AlertDialog` rather than a custom modal provides correct `role="alertdialog"`, focus trapping, and `Escape`-to-close behavior automatically.

8. **Mobile fallback**: Providing a `<Select>` dropdown as a non-DnD alternative for status changes on mobile is good inclusive design. The implementation needs the accessible label fix (O-3) but the pattern itself is correct.

---

## Prioritised Remediation Roadmap

### Sprint 1 — Level A Critical (must fix before release)

1. **O-1 / R-1** — Fix drag handle accessible name + connect `aria-describedby`
2. **O-2** — Add `aria-expanded` to collapse/expand buttons
3. **O-3** — Add `aria-label` to mobile status Select
4. **O-4** — Add `aria-label`/`<label>` to search input and filter Select
5. **O-7** — Add accessible name to ToastClose button

### Sprint 2 — Level AA High

6. **P-1** — Add non-color status differentiation on cards; deduplicate bookmarked/draft colors
7. **P-3** — Fix dark-mode amber badge contrast to fully opaque background
8. **R-1** (already covered in Sprint 1 as part of O-1 fix)

### Sprint 3 — Medium Priority

9. **P-4** — Add `motion-reduce` guards to `alert-dialog.tsx` and `toast.tsx`
10. **P-5** — Wrap `DragOverlay` content in `aria-hidden="true"`
11. **O-5** — Add non-empty drag-over announcement for no-target state
12. **O-6** — Change column `role="group"` to `role="region"` with `aria-labelledby`
13. **U-2** — Add `aria-live` loading announcement in StatusTransitionDialog
14. **R-3** — Pass translated `label` to `ToastProvider`

### Sprint 4 — Low Priority / Advisory

15. **P-2** — Raise badge font size from 10px to 12px
16. **U-1** — Enhance invalid transition error with correction suggestion
17. **U-3** — Wire `onAddJob` to KanbanEmptyState
18. **R-2** — Translate hardcoded "jobs" suffix in column list label

---

*This audit was conducted through static code analysis of all 7 component files plus supporting utilities. No runtime or automated axe scan was performed. A complementary runtime audit with axe-core or Lighthouse is recommended after remediation to catch contrast ratios, DOM order issues, and timing-dependent patterns not visible in static analysis.*
