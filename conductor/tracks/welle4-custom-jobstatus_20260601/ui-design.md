# Welle 4 — UI Design (Phases 2.4 / 3 / 5)

Design produced via `ui-design:create-component` discipline, grounded in the existing
codebase patterns (CompanyBlacklistSettings, WebhookSettings, Combobox/cmdk,
KanbanColumn/Card, EuresLocationCombobox a11y). All product decisions are FROZEN in
`design-review-findings.md` — this doc maps them to concrete component structure.
Stack: React 19 / Next 15, Tailwind + Shadcn, react-hook-form, dnd-kit (already used by
KanbanBoard), cmdk. Tests: Jest + Testing Library.

## Cross-cutting tokens — stage colour

`category.colour` is a design-token NAME (blue/indigo/purple/green/emerald/red/gray), NOT a
status value. New leaf `src/lib/crm/stage-colors.ts`:

```
STAGE_COLOR_TOKENS: Record<string, { swatch: string; text: string; headerBg: string; border: string }>
resolveStageColor(colourName) -> tokens   // falls back to "gray"
stageColorVar(colourName) -> { ['--stage-color']: <hex> }  // for CSS custom property
```

Keyed by colour-name (finite design tokens) — satisfies "no hardcoded status→colour map".
Colour is NEVER the sole differentiator: every column/badge/row keeps its text label + the
stage label (WCAG 1.4.1).

---

## 1. JobStatusSettings (Phase 2.4) — Settings → "Statuses"

New file `src/components/settings/JobStatusSettings.tsx`. Registered in SettingsSidebar as
section `statuses` (icon `ListChecks`), rendered by settings/page.tsx. i18n namespace
`jobStatus.*` (new dictionary file). Card/list pattern mirrors CompanyBlacklistSettings.

### Structure (top → bottom)
- Header: `h3` title + muted description.
- Soft-cap banner: when `statuses.length > 12` (config.soft_status_count_warning) show a
  non-blocking `Alert` (`jobStatus.softCapWarning`).
- "Add status" row: `Input` (label) + stage `Select` (the 7 categories, localized
  `jobStatus.stage.<kind>`) + Add `Button` (Plus). Enter submits. Disabled when label blank.
- Grouped list: one section per stage (category.sortOrder order). Section header = stage
  label + a colour swatch (`<span aria-hidden style={stageColorVar}>` + sr text). Under it,
  the stage's statuses ordered by sortOrder, each a row:
  - drag handle (44×44 hit area, dnd-kit, `GripVertical`) — reorder WITHIN a stage.
  - status label (read-only text; `value` is NEVER shown).
  - default badge if `isDefault`.
  - row actions (right): up/down icon-buttons (keyboard reorder fallback, 44×44, disabled at
    ends), "Set default" (Star, hidden/disabled when already default), Edit (Pencil → opens
    edit dialog), Delete (Trash, destructive).
- Empty stage: subtle muted "—" placeholder so all 7 stages stay visible as drop context.

### State (local, no global store)
`statuses: JobStatusView[]`, `categories: JobStatusCategoryView[]`, `loading`, `error`,
`saving`, dialog state objects: `editTarget`, `deleteTarget`, `reassignTo`, `pendingStageMove`.
Loads via `getJobStatuses()` + `getJobStatusCategories()` on mount; reloads after each mutation.

### Interactions
- **Create** → `createJobStatus(categoryId, label)`; optimistic-free (reload). Toast.
- **Reorder** (drag or up/down) → compute new sortOrder (sibling-midpoint, same util idea as
  Kanban) → `reorderJobStatus(id, newSortOrder)`. dnd-kit restricted to within-stage; cross-
  stage drag is NOT a reorder — moving stage happens via the Edit dialog (explicit, because it
  has applied-impact semantics).
- **Edit dialog** (`Dialog`): label `Input` + stage `Select`. On save:
  - if new stage `isAppliedStage` differs from old AND status has jobs → show inline
    **impact warning** ("Moving '{label}' to {stage} will mark {N} jobs as submitted
    applications.") BEFORE the confirm button commits. (jobs count via a small count probe —
    add `jobCount` to JobStatusView, see below.) Confirm → `renameJobStatus(id,label,categoryId)`.
- **Set default** → `setDefaultJobStatus(id)`. The previous default's Set-default control
  re-enables; new default's Delete becomes disabled with tooltip `jobStatus.cannotDeleteDefault`.
- **Delete**:
  - status with `jobCount === 0` AND not referenced by history AND not default/last →
    `AlertDialog` simple confirm → `deleteJobStatus(id)`.
  - in-use (jobCount>0 or history) → `Dialog` "Move N jobs and delete" with a reassign
    `Select`/Combobox (other statuses, grouped by stage) → `deleteJobStatus(id, reassignTo)`.
    Confirm disabled until a target chosen.
  - default or last status → Delete button rendered DISABLED with tooltip (not hidden) —
    `jobStatus.cannotDeleteDefault` / `jobStatus.cannotDeleteLast`.

### Repository addition needed
`getJobStatuses()` JobStatusView gains `jobCount: number` (for delete-flow + impact warning).
Cheap: `_count` of jobs per status, userId-scoped. (Add to STATUS_SELECT via `_count`.)

### a11y
- All icon-buttons have `aria-label` + are ≥44×44 (wrap glyph like KanbanCard drag handle).
- dnd-kit announcements (reuse Kanban announcement pattern) + up/down keyboard fallback.
- `aria-live="polite"` region announces create/reorder/default/delete outcomes.
- Stage colour swatch is decorative (`aria-hidden`); the stage label carries meaning.
- Edit/Delete dialogs: focus trap (Shadcn Dialog), labelled title + description.

---

## 2. StatusStageCombobox (Phase 3, F-AJ-02) — grouped picker + applied-merge

New file `src/components/myjobs/StatusStageCombobox.tsx`. Built on Popover + cmdk `Command`
(same primitives as `Combobox`), but **grouped by stage** with `CommandGroup` per category and
the stage label as `heading`. Used in AddJob for the `status` field; REPLACES the separate
`applied` Switch.

### Props
```
options: JobStatusView[]      // statuses with category (kind, isAppliedStage, colour, sortOrder)
value: string                 // selected statusId (RHF field.value)
onChange: (statusId: string) => void
disabled?: boolean
```

### Structure
- Trigger `Button role="combobox"`: selected status label + a small stage dot
  (`stageColorVar`, aria-hidden) + a "marks applied" inline `Badge` when the selected status'
  category `isAppliedStage`. ChevronsUpDown.
- Popover → `Command` (`shouldFilter={false}` + manual filter on label), `CommandInput`
  search, then one `CommandGroup heading={stageLabel}` per category (category.sortOrder order),
  each listing its statuses (sortOrder). Each `CommandItem`: Check (selected) + label + stage
  dot (aria-hidden) + per-item "marks applied" hint text for applied-stage statuses.
- `aria-live` sr-only region announces the selection ("Selected {label} — marks applied").

### applied-merge behaviour (in AddJob, not the combobox)
The combobox only reports the chosen statusId. AddJob derives `applied` from the chosen
status' category:
- on status change: `applied = chosenStatus.category.isAppliedStage`. If it flips false→true
  and `dateApplied` empty → set `dateApplied = now` (overridable). Flipping true→false does
  NOT clear dateApplied (mirrors server immutability) — but the DatePicker re-enables only
  when applied is true; keep the value retained.
- The old `applied` Switch + `jobAppliedChange` index-hack (`jobStatuses[0]/[1]`) is REMOVED.
- A small read-only "Applied" indicator (Badge/checkmark) replaces the Switch, derived from the
  selected status, so the user still sees applied-state but cannot desync it from the status.
- `dateApplied` DatePicker stays, `isEnabled={appliedDerived}`, value overridable.

### a11y
- Trigger ≥44px tall; `aria-expanded`, `aria-label` from field label.
- Colour dots decorative; "marks applied" is TEXT, so applied-ness is never colour-only.
- aria-live selection announcement (EuresLocationCombobox pattern); `inputValue` reset on close.

---

## 3. Dynamic Kanban (Phase 5) — derivation notes (no new component)

- `JobStatus` model gains optional `category?: { kind, colour, sortOrder, isAppliedStage,
  isTerminal, defaultCollapsed, allowsSelfTransition, label }`. `getStatusList` + getKanbanBoard
  include it.
- `useKanbanState`: columns derived from `statuses` ordered by (category.sortOrder,
  status.sortOrder) — drop STATUS_ORDER. Collapse default from `category.defaultCollapsed`
  (localStorage override unchanged, keyed by status.value). Colour from `resolveStageColor(
  category.colour)` applied via `--stage-color` custom property — drop STATUS_COLORS.
- Transition validity client+server via `isValidCategoryTransition(fromSemantics, toSemantics)`
  using `categorySemanticsForKind(category.kind)` — drop isValidTransition/VALID_TRANSITIONS.
- KanbanCard/Column/TransitionDialog: colour via CSS var, not STATUS_COLORS map.
- StatusFunnelWidget: stages derived from progression categories (lead→applied→interviewing→
  offer→won), counts aggregated per stage from distribution+category — drop hardcoded
  PIPELINE_STAGES values.
- StatusHistoryTimeline / JobDetails / MyJobsTable: semantic checks via `category.kind` /
  `isAppliedStage`, not value-string equality. (JobDetails/MyJobsTable read `Status.category`.)

## Test plan (TDD, per phase)
- 2.4: JobStatusSettings.spec.tsx — render groups, create, reorder up/down, set-default,
  delete simple, delete-in-use reassign dialog, default/last delete disabled+tooltip, stage-move
  impact warning, soft-cap banner. stage-colors.spec.ts.
- 3: StatusStageCombobox.spec.tsx — grouped render, select drives onChange, applied hint shown
  for applied-stage. AddJob.spec (applied derived from status, Switch gone). Server: changeJobStatus
  /updateJob/updateKanbanOrder category-transition + applied side-effect specs.
- 5: useKanbanState.spec — dynamic columns/colour/collapse from category, custom status column
  appears. status-transition (category) spec. funnel-from-stages spec. E2E create→set→see column.
