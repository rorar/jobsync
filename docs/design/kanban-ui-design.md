# Kanban Board & Job Status Workflow -- UI Design Document

**Roadmap:** 5.6 Kanban Board
**Status:** Design
**Date:** 2026-04-02

---

## 1. Wireframes

### 1.1 Desktop Layout (>= 1024px)

```
+--[Sidebar 56px]--+--[Content Area — full width]-----------------------------------------------+
|                  |                                                                             |
|  (collapsed)     |  [Header: "My Jobs"  ][Search][Filter][Export][Add Job][ Table | Kanban ]   |
|                  |                                                                             |
|                  |  +-- Kanban Board (horizontal scroll if needed) --------------------------+ |
|                  |  |                                                                        | |
|                  |  | +--Draft------+ +--Applied-----+ +--Interview--+ +--Offer------+ [...] | |
|                  |  | | Draft   (4) | | Applied  (7) | | Interview(2)| | Offer   (1) |       | |
|                  |  | |    [v]      | |    [v]       | |    [v]      | |    [v]      |       | |
|                  |  | +-------------+ +--------------+ +-------------+ +-------------+       | |
|                  |  | | +---------+ | | +----------+ | | +---------+ | | +---------+ |       | |
|                  |  | | |##|Title | | | |##|Title  | | | |##|Title | | | |##|Title | |       | |
|                  |  | | |  |Comp. | | | |  |Comp.  | | | |  |Comp. | | | |  |Comp. | |       | |
|                  |  | | |  |85% T | | | |  |72% T  | | | |  |-- T  | | | |  |91% T | |       | |
|                  |  | | +---------+ | | +----------+ | | +---------+ | | +---------+ |       | |
|                  |  | | +---------+ | | +----------+ | | +---------+ | |             |       | |
|                  |  | | |##|Title | | | |##|Title  | | | |##|Title | | |  No more    |       | |
|                  |  | | |  |Comp. | | | |  |Comp.  | | | |  |Comp. | | |  jobs here  |       | |
|                  |  | | |  |-- T  | | | |  |90% T  | | | |  |67% T | | |             |       | |
|                  |  | | +---------+ | | +----------+ | | +---------+ | |             |       | |
|                  |  | |      :      | |      :       | |             | |             |       | |
|                  |  | | (scrollable)| | (scrollable) | |             | |             |       | |
|                  |  | +-------------+ +--------------+ +-------------+ +-------------+       | |
|                  |  |                                                                        | |
|                  |  | [>Rejected (3)]  [>Archived (12)]  [>Expired (5)]  -- collapsed cols   | |
|                  |  +------------------------------------------------------------------------+ |
|                  |                                                                             |
+------------------+-----------------------------------------------------------------------------+

Legend:
  ## = drag handle (grip dots)
  T  = tags row
  [v] = collapse/expand chevron
  [>Name (n)] = collapsed column pill
  85% = match score badge
```

### 1.2 Job Card Detail (Desktop)

```
+--[colored-left-border 3px]-------------------------------+
| [::] Senior Frontend Engineer                            |
|      Acme Corp                                           |
|      [85%] [React] [TypeScript]                          |
|      Due: Apr 15  (amber if < 3 days, red if overdue)    |
+----------------------------------------------------------+

[::] = drag handle (GripVertical icon)
[85%] = circular match score indicator
[React] [TypeScript] = tag badges (max 2 shown, +N overflow)
```

### 1.3 Mobile Layout -- Option B: Tab-Based (375px)

```
+------------------------------------------------------+
| [<] My Jobs                    [ Table | Kanban ]     |
+------------------------------------------------------+
| [Draft] [Applied] [Interview] [Offer] [+3]           |
|  ~~~~~~                                               |
| (active tab underline indicator)                      |
+------------------------------------------------------+
|                                                       |
| +--------------------------------------------------+ |
| | [::] Senior Frontend Engineer                     | |
| |     Acme Corp                                     | |
| |     [85%] [React] [TypeScript]                    | |
| |     Due: Apr 15                                   | |
| +--------------------------------------------------+ |
|                                                       |
| +--------------------------------------------------+ |
| | [::] Junior Backend Developer                     | |
| |     TechStart GmbH                                | |
| |     [72%] [Node.js]                               | |
| +--------------------------------------------------+ |
|                                                       |
|              (scroll for more cards)                  |
|                                                       |
+------------------------------------------------------+

Swipe left/right on content area = switch tabs.
[+3] pill opens a popover with collapsed statuses:
  Rejected (3)  |  Archived (12)  |  Expired (5)
```

### 1.4 Transition Dialog

```
+----------------------------------------------------+
|  Move Job                                     [X]  |
|----------------------------------------------------|
|                                                    |
|  Move "Senior Frontend Engineer"                   |
|  from Applied --> Interview?                       |
|                                                    |
|  +----------------------------------------------+ |
|  | Add a note about this change (optional)       | |
|  |                                               | |
|  |                                               | |
|  +----------------------------------------------+ |
|                                                    |
|                       [Cancel]  [Move to Interview]|
+----------------------------------------------------+
```

### 1.5 Skeleton Loading State

```
+--Kanban Board----------------------------------------------+
| +-----------+ +-----------+ +-----------+ +-----------+    |
| | ~~~ (##)  | | ~~~ (##)  | | ~~~ (##)  | | ~~~ (##)  |   |
| +-----------+ +-----------+ +-----------+ +-----------+    |
| | +-------+ | | +-------+ | | +-------+ | | +-------+ |   |
| | |~~~~~~~| | | |~~~~~~~| | | |~~~~~~~| | | |~~~~~~~| |   |
| | |~~~~~  | | | |~~~~~  | | | |~~~~~  | | | |~~~~~  | |   |
| | |~~ ~~  | | | |~~ ~~  | | | |~~ ~~  | | | |~~ ~~  | |   |
| | +-------+ | | +-------+ | | +-------+ | | +-------+ |   |
| | +-------+ | | +-------+ | | +-------+ | |           |   |
| | |~~~~~~~| | | |~~~~~~~| | | |~~~~~~~| | |           |   |
| | |~~~~~  | | | |~~~~~  | | | |~~~~~  | | |           |   |
| | |~~ ~~  | | | |~~ ~~  | | | |~~ ~~  | | |           |   |
| | +-------+ | | +-------+ | | +-------+ | |           |   |
| | +-------+ | | +-------+ | |           | |           |   |
| | |~~~~~~~| | | |~~~~~~~| | |           | |           |   |
| | |~~~~~  | | | |~~~~~  | |           | |           |   |
| | |~~ ~~  | | | |~~ ~~  | |           | |           |   |
| | +-------+ | | +-------+ | |           | |           |   |
| +-----------+ +-----------+ +-----------+ +-----------+    |
+------------------------------------------------------------+

~~~ = shimmer pulse placeholder
(##) = placeholder count badge
```

---

## 2. Component Hierarchy

```
JobsContainer (existing — augmented with view mode toggle)
  |
  +-- KanbanViewModeToggle          (table | kanban toggle)
  |     Props: value: ViewMode, onChange: (mode) => void
  |
  +-- [if viewMode === "table"]
  |     MyJobsTable                 (existing, unchanged)
  |
  +-- [if viewMode === "kanban"]
        KanbanBoard
          |
          +-- KanbanBoardHeader       (search, filter, add job — shared with table)
          |
          +-- DndContext              (@dnd-kit/core)
          |   SortableContext         (@dnd-kit/sortable, one per column)
          |   |
          |   +-- KanbanColumn[]      (one per visible status)
          |   |     Props: status, jobs, isCollapsed, onToggleCollapse
          |   |     |
          |   |     +-- KanbanColumnHeader
          |   |     |     Props: status, count, isCollapsed, onToggle
          |   |     |
          |   |     +-- KanbanColumnBody (scrollable)
          |   |     |     |
          |   |     |     +-- SortableJobCard[]
          |   |     |           Props: job, statusColor
          |   |     |           |
          |   |     |           +-- JobCardContent
          |   |     |                 Props: job, statusColor
          |   |     |
          |   |     +-- KanbanColumnEmpty
          |   |           Props: statusLabel
          |   |
          |   +-- CollapsedColumnPill[] (collapsed statuses)
          |   |     Props: status, count, onExpand
          |   |
          |   +-- DragOverlay          (@dnd-kit DragOverlay)
          |         |
          |         +-- JobCardContent  (preview of dragged card)
          |
          +-- TransitionDialog        (confirm status change)
          |     Props: open, job, fromStatus, toStatus, onConfirm, onCancel
          |
          +-- KanbanEmptyBoard        (when zero jobs exist)
                Props: onAddJob

--- Mobile-specific ---

KanbanMobileView (renders at < 768px)
  |
  +-- KanbanMobileTabBar            (horizontal scrollable tabs)
  |     Props: statuses, activeStatus, counts, onTabChange
  |
  +-- KanbanMobileColumn            (single visible column)
  |     Props: status, jobs
  |     |
  |     +-- SortableJobCard[]
  |
  +-- MobileOverflowMenu            (collapsed statuses popover)
        Props: collapsedStatuses, counts, onSelect
```

### 2.1 Component File Locations

| Component | File |
|---|---|
| `KanbanBoard` | `src/components/myjobs/kanban/KanbanBoard.tsx` |
| `KanbanColumn` | `src/components/myjobs/kanban/KanbanColumn.tsx` |
| `KanbanColumnHeader` | `src/components/myjobs/kanban/KanbanColumnHeader.tsx` |
| `SortableJobCard` | `src/components/myjobs/kanban/SortableJobCard.tsx` |
| `JobCardContent` | `src/components/myjobs/kanban/JobCardContent.tsx` |
| `TransitionDialog` | `src/components/myjobs/kanban/TransitionDialog.tsx` |
| `KanbanEmptyBoard` | `src/components/myjobs/kanban/KanbanEmptyBoard.tsx` |
| `KanbanMobileView` | `src/components/myjobs/kanban/KanbanMobileView.tsx` |
| `KanbanMobileTabBar` | `src/components/myjobs/kanban/KanbanMobileTabBar.tsx` |
| `KanbanViewModeToggle` | `src/components/myjobs/kanban/KanbanViewModeToggle.tsx` |
| `useKanbanState` | `src/hooks/useKanbanState.ts` |
| `useKanbanDnd` | `src/hooks/useKanbanDnd.ts` |

### 2.2 Key Props and Interfaces

```typescript
// --- Domain types (extend existing models) ---

/** Column definition derived from JobStatus + Kanban config */
interface KanbanColumnDef {
  status: JobStatus;              // from job.model.ts
  color: string;                  // tailwind color class
  defaultCollapsed: boolean;      // true for rejected/archived/expired
  sortOrder: number;              // column display order
}

/** Card position within a column (for reordering) */
interface CardPosition {
  jobId: string;
  columnStatusValue: string;
  sortIndex: number;
}

// --- Component Props ---

interface KanbanBoardProps {
  jobs: JobResponse[];
  statuses: JobStatus[];
  onStatusChange: (jobId: string, newStatus: JobStatus, note?: string) => Promise<void>;
  onReorder: (positions: CardPosition[]) => void;
  loading: boolean;
}

interface KanbanColumnProps {
  status: JobStatus;
  jobs: JobResponse[];
  color: string;
  isCollapsed: boolean;
  isDropTarget: boolean;         // highlight when dragging over
  isInvalidTarget: boolean;      // dim when invalid transition
  onToggleCollapse: () => void;
}

interface SortableJobCardProps {
  job: JobResponse;
  statusColor: string;
  isDragging: boolean;
}

interface JobCardContentProps {
  job: JobResponse;
  statusColor: string;
  isOverdue: boolean;
  isDueSoon: boolean;            // within 3 days
}

interface TransitionDialogProps {
  open: boolean;
  job: JobResponse | null;
  fromStatus: JobStatus | null;
  toStatus: JobStatus | null;
  onConfirm: (note?: string) => void;
  onCancel: () => void;
  isPending: boolean;
}
```

---

## 3. Interaction Patterns

### 3.1 Drag and Drop (via @dnd-kit/core + @dnd-kit/sortable)

**Why @dnd-kit:** Most accessible React DnD library. Built-in keyboard sensor, screen reader announcements, and touch support. Actively maintained. Do NOT use react-beautiful-dnd (deprecated, unmaintained).

**Packages required:**
- `@dnd-kit/core` -- DndContext, DragOverlay, useDraggable, useDroppable
- `@dnd-kit/sortable` -- SortableContext, useSortable, arrayMove
- `@dnd-kit/utilities` -- CSS utility
- `@dnd-kit/modifiers` -- restrictToWindowEdges

**Drag lifecycle:**

1. **onDragStart** -- Store active card ID. Render DragOverlay with card preview. Add `cursor: grabbing` to body. Set source column highlight.

2. **onDragOver** -- Determine target column. If same column, show insertion indicator (reorder). If different column, check transition validity. Valid: highlight column in status color. Invalid: dim column, show forbidden cursor.

3. **onDragEnd** -- If dropped on same column (reorder): update local sort order optimistically. If dropped on different column (status change): open TransitionDialog. If dropped on invalid target or cancelled: snap back with spring animation.

4. **onDragCancel** -- Reset all state. Snap card back to original position.

**Sensors configuration:**

```typescript
const sensors = useSensors(
  useSensor(PointerSensor, {
    activationConstraint: { distance: 8 },  // 8px dead zone
  }),
  useSensor(KeyboardSensor, {
    coordinateGetter: sortableKeyboardCoordinates,
  }),
  useSensor(TouchSensor, {
    activationConstraint: { delay: 200, tolerance: 5 },
  }),
);
```

**Collision detection:** `closestCenter` for within-column sorting, `rectIntersection` for cross-column moves. Use a composite strategy that checks column droppables first, then card positions within the target column.

### 3.2 Status Transition Rules

The current `JobStatus` model has no transition constraints in the database. The Kanban board introduces **UI-level soft constraints** (visual guidance, not hard enforcement) with the option to promote them to server-side validation later.

**Recommended transitions (forward flow):**

```
Draft --> Applied --> Interview --> Offer --> Accepted
                                         \-> Rejected
                 \-> Rejected
          \-> Archived
Draft --> Archived
Any --> Archived  (always valid)
Any --> Rejected  (always valid)
```

**Transition validity map:**

```typescript
const VALID_TRANSITIONS: Record<string, string[]> = {
  draft:     ["applied", "archived"],
  applied:   ["interview", "rejected", "archived"],
  interview: ["offer", "rejected", "archived"],
  offer:     ["accepted", "rejected", "archived"],
  accepted:  ["archived"],
  rejected:  ["draft", "applied", "archived"],   // allow re-entry
  archived:  ["draft"],                           // allow un-archive
  expired:   ["draft", "archived"],               // allow revival
};
```

**Invalid transition UX:**
- Column appears dimmed (opacity-40) during drag
- Drop zone border changes to dashed gray
- Cursor changes to `not-allowed`
- If user manages to drop anyway (keyboard): show tooltip "Cannot move directly from [X] to [Y]. Try moving to [intermediate status] first."
- Card snaps back to original position with ease-out animation

### 3.3 Transition Confirmation Flow

1. User drops card on valid target column
2. TransitionDialog opens (Shadcn Dialog)
3. Dialog shows: job title, from-status badge, arrow, to-status badge
4. Optional textarea for transition note
5. "Move" button triggers server action
6. On success: close dialog, show toast with "Undo" action button
7. On error: show error in dialog, keep dialog open
8. Undo toast persists for 5 seconds. On click: revert to previous status via server action

### 3.4 Undo Mechanism

```typescript
// After successful status change:
toast({
  title: t("jobs.kanbanMoved"),           // "Job moved to Interview"
  description: job.JobTitle?.label,
  action: (
    <ToastAction altText={t("jobs.kanbanUndo")} onClick={() => undoMove(job.id, previousStatus)}>
      {t("jobs.kanbanUndo")}
    </ToastAction>
  ),
  duration: 5000,
});
```

The undo calls `updateJobStatus(jobId, previousStatus)` and reverts the local Kanban state optimistically.

### 3.5 Card Click vs. Drag Disambiguation

- Pointer down + move > 8px within 200ms = drag intent
- Pointer down + up without significant movement = click --> navigate to `/dashboard/myjobs/{jobId}`
- This is handled by @dnd-kit's `activationConstraint: { distance: 8 }` on the PointerSensor

### 3.6 Column Collapse/Expand

- Collapsed columns render as vertical pills: `[> Rejected (3)]`
- Click or Enter on pill expands the column
- Collapse state is persisted in localStorage per-user: `jobsync-kanban-collapsed: ["rejected","archived","expired"]`
- Default collapsed: `rejected`, `archived`, `expired`

### 3.7 Within-Column Reordering

- Cards within a column can be reordered via drag
- Sort order is stored in localStorage: `jobsync-kanban-sort: { "draft": ["id1","id2",...], ... }`
- No server persistence for card order in Phase 1 (avoids schema changes)
- Phase 2 consideration: add `kanbanSortIndex` field to Job model

---

## 4. State Management

### 4.1 Data Flow

```
Server (Prisma)                     Client (React)
     |                                    |
     |  getJobsList() --SSR/CSR-->       |
     |                              useKanbanState()
     |                                    |
     |                              Derive columns from jobs + statuses
     |                              Store: collapsedColumns (localStorage)
     |                              Store: cardOrder (localStorage)
     |                              Store: pendingTransition (React state)
     |                                    |
     |  updateJobStatus() <---           |  (optimistic update)
     |                                    |
     |  <-- ActionResult --------        |  (confirm or rollback)
```

### 4.2 useKanbanState Hook

```typescript
interface UseKanbanStateReturn {
  /** Jobs grouped by status value */
  columns: Map<string, JobResponse[]>;
  /** Which columns are collapsed */
  collapsedColumns: Set<string>;
  /** Toggle collapse for a column */
  toggleCollapse: (statusValue: string) => void;
  /** Move a job optimistically, returns rollback function */
  moveJob: (jobId: string, toStatusValue: string) => () => void;
  /** Reorder within a column */
  reorderColumn: (statusValue: string, fromIndex: number, toIndex: number) => void;
  /** Whether a transition is valid */
  isValidTransition: (fromStatus: string, toStatus: string) => boolean;
}
```

### 4.3 Optimistic Updates

1. On drop (valid target): immediately move card to target column in local state
2. Open TransitionDialog (card already appears in new column)
3. On "Move" confirm: fire server action `updateJobStatus()`
4. On success: state is already correct, show undo toast
5. On cancel (dialog dismissed): rollback -- move card back to original column
6. On server error: rollback + show error toast

This pattern ensures the UI feels instant while maintaining data consistency.

### 4.4 Server Actions Integration

The Kanban board reuses existing server actions from `src/actions/job.actions.ts`:

| Action | Usage |
|---|---|
| `getJobsList()` | Initial data load (all jobs, no pagination for Kanban) |
| `updateJobStatus()` | Status transition on drop + confirm |
| `getStatusList()` | Column definitions |

**New action needed for Kanban-specific queries:**

```typescript
// src/actions/job.actions.ts — add:
export async function getJobsByStatus(): Promise<ActionResult<Record<string, JobResponse[]>>> {
  // Returns all jobs grouped by status value
  // No pagination — Kanban needs all jobs visible
  // Sorted by createdAt desc within each status
}
```

**Performance note:** Kanban loads ALL jobs for the user (no server-side pagination). For users with 500+ jobs, add client-side virtualization in Phase 2 using `@tanstack/react-virtual`. For Phase 1, the `getJobsList` approach with a high page size (e.g., 1000) is acceptable given typical user volumes.

---

## 5. Accessibility Specification (WCAG 2.2 AA)

### 5.1 Semantic Structure

```html
<!-- Board container -->
<div role="region" aria-label="[t('jobs.kanbanBoard')]">

  <!-- Each column -->
  <div role="group" aria-label="[t('jobs.statusApplied')] - 7 jobs">
    <h3>[Status Name] <span aria-label="7 jobs">(7)</span></h3>

    <!-- Card list within column -->
    <div role="listbox" aria-label="[t('jobs.statusApplied')] jobs">

      <!-- Each card -->
      <div role="option"
           aria-selected="false"
           aria-roledescription="sortable job card"
           aria-describedby="dnd-instructions"
           tabindex="0">
        ...card content...
      </div>
    </div>
  </div>
</div>

<!-- Hidden instructions for screen readers -->
<div id="dnd-instructions" class="sr-only">
  [t('jobs.kanbanDndInstructions')]
  <!-- "Press Space or Enter to pick up. Use arrow keys to move between
       columns. Press Space or Enter to drop. Press Escape to cancel." -->
</div>
```

### 5.2 Keyboard Navigation

| Key | Context | Action |
|---|---|---|
| `Tab` | Board | Move focus between columns |
| `Arrow Down` | Within column | Move focus to next card |
| `Arrow Up` | Within column | Move focus to previous card |
| `Enter` / `Space` | On focused card | Pick up card for moving |
| `Arrow Left/Right` | Card picked up | Move card to adjacent column |
| `Arrow Up/Down` | Card picked up | Reorder within column |
| `Enter` / `Space` | Card picked up | Drop card at current position |
| `Escape` | Card picked up | Cancel move, return to original |
| `Enter` | On card (not picked up) | Navigate to job detail page |
| `Enter` | On collapsed pill | Expand column |

### 5.3 Live Regions

```html
<!-- Announce drag state changes -->
<div aria-live="assertive" aria-atomic="true" class="sr-only">
  <!-- Dynamically updated: -->
  <!-- "Picked up Senior Frontend Engineer from Applied column" -->
  <!-- "Moved over Interview column, position 1 of 2" -->
  <!-- "Dropped Senior Frontend Engineer in Interview column" -->
  <!-- "Move cancelled, returned to Applied column" -->
</div>
```

@dnd-kit provides built-in `announcements` prop on DndContext for these:

```typescript
const announcements: Announcements = {
  onDragStart({ active }) {
    const job = findJob(active.id);
    return t("jobs.kanbanDragStart", { title: job.JobTitle?.label, status: job.Status.label });
  },
  onDragOver({ active, over }) {
    if (!over) return;
    const job = findJob(active.id);
    const targetStatus = findStatusByColumnId(over.id);
    return t("jobs.kanbanDragOver", { title: job.JobTitle?.label, status: targetStatus.label });
  },
  onDragEnd({ active, over }) {
    const job = findJob(active.id);
    if (over) {
      const targetStatus = findStatusByColumnId(over.id);
      return t("jobs.kanbanDragEnd", { title: job.JobTitle?.label, status: targetStatus.label });
    }
    return t("jobs.kanbanDragCancel", { title: job.JobTitle?.label });
  },
  onDragCancel({ active }) {
    const job = findJob(active.id);
    return t("jobs.kanbanDragCancel", { title: job.JobTitle?.label });
  },
};
```

### 5.4 Focus Management

- After drop + transition dialog confirm: focus returns to the moved card in its new column
- After dialog cancel: focus returns to the card in its original column
- After undo (via toast): focus moves to the card in its restored column
- Column collapse: focus moves to the next visible column
- Column expand: focus moves to the first card in the expanded column

### 5.5 Color Contrast

All status colors (Section 7) meet WCAG AA contrast ratio (4.5:1) against their respective backgrounds. Status meaning is never conveyed by color alone -- each column has a text label and count badge.

### 5.6 Touch Targets

- Job cards: minimum 44x44px tap target (the full card surface)
- Drag handle: 44x44px (oversized grip icon area)
- Column collapse toggle: 44x44px
- Collapsed column pill: minimum 44px height

---

## 6. Mobile Responsive Specification

### 6.1 Breakpoint Behavior

| Breakpoint | Layout | Columns Visible | DnD Support |
|---|---|---|---|
| >= 1280px (xl) | Full Kanban | 4 expanded + collapsed pills | Full drag-and-drop |
| 1024-1279px (lg) | Full Kanban | 3-4 expanded + collapsed pills | Full drag-and-drop |
| 768-1023px (md) | Compact Kanban | 2-3 narrower columns | Touch drag enabled |
| < 768px (sm) | Tab-based mobile | 1 column at a time | Status dropdown (no DnD) |

### 6.2 Mobile Tab-Based View (< 768px)

**Rationale for Option B (tabs):** Small screens cannot accommodate multi-column drag interactions reliably. Horizontal scroll with snap (Option A) makes it hard to distinguish between scrolling and dragging. The tab-based approach mirrors the existing StagingContainer pattern and provides a clearer mental model.

**Tab bar:**
- Horizontal scrollable bar using `overflow-x-auto` with `-webkit-overflow-scrolling: touch`
- Each tab: status name + count badge
- Active tab: underline indicator in status color
- Collapsed statuses appear at the end with a `[+N]` overflow pill
- Swiping the content area left/right switches tabs (via touch event handlers, not @dnd-kit)

**Status changes on mobile:**
- No drag-and-drop on < 768px
- Each card shows a status dropdown button (compact)
- Tapping the dropdown opens a bottom sheet (Shadcn Drawer) with status options
- Invalid transitions appear disabled with explanatory text
- Same transition dialog flow (as sheet/drawer, not centered dialog)

### 6.3 Column Width Calculations

```css
/* Desktop: equal distribution */
.kanban-column {
  flex: 1 1 0;
  min-width: 280px;
  max-width: 360px;
}

/* Tablet: narrower columns */
@media (min-width: 768px) and (max-width: 1023px) {
  .kanban-column {
    min-width: 240px;
    max-width: 300px;
  }
}

/* Mobile: full width, one at a time */
@media (max-width: 767px) {
  .kanban-column {
    width: 100%;
  }
}
```

### 6.4 Column Height

- Columns use `max-h-[calc(100vh-220px)]` to fit within the dashboard content area
- The 220px offset accounts for: header (56px) + card header (52px) + column header (48px) + padding (64px)
- Column body scrolls independently via `overflow-y-auto`
- Scrollbar is styled thin on desktop, hidden on mobile (touch scroll)

---

## 7. Color and Theme Tokens

### 7.1 Status Color Map

These colors are used for column headers, card left-border accents, and tab indicators.

| Status | Light Mode | Dark Mode | CSS Variable Name |
|---|---|---|---|
| Draft | `blue-500` (#3b82f6) | `blue-400` (#60a5fa) | `--status-draft` |
| Applied | `indigo-500` (#6366f1) | `indigo-400` (#818cf8) | `--status-applied` |
| Interview | `purple-500` (#a855f7) | `purple-400` (#c084fc) | `--status-interview` |
| Offer | `green-500` (#22c55e) | `green-400` (#4ade80) | `--status-offer` |
| Accepted | `emerald-600` (#059669) | `emerald-400` (#34d399) | `--status-accepted` |
| Rejected | `red-500` (#ef4444) | `red-400` (#f87171) | `--status-rejected` |
| Archived | `gray-400` (#9ca3af) | `gray-500` (#6b7280) | `--status-archived` |
| Expired | `amber-500` (#f59e0b) | `amber-400` (#fbbf24) | `--status-expired` |

### 7.2 Implementation

Define as a constant map in a shared utility (NOT in Tailwind config to keep it lean):

```typescript
// src/components/myjobs/kanban/status-colors.ts
export const STATUS_COLORS: Record<string, { bg: string; border: string; text: string; darkBg: string; darkBorder: string }> = {
  draft:     { bg: "bg-blue-50",    border: "border-l-blue-500",    text: "text-blue-700",    darkBg: "dark:bg-blue-950/30",    darkBorder: "dark:border-l-blue-400" },
  applied:   { bg: "bg-indigo-50",  border: "border-l-indigo-500",  text: "text-indigo-700",  darkBg: "dark:bg-indigo-950/30",  darkBorder: "dark:border-l-indigo-400" },
  interview: { bg: "bg-purple-50",  border: "border-l-purple-500",  text: "text-purple-700",  darkBg: "dark:bg-purple-950/30",  darkBorder: "dark:border-l-purple-400" },
  offer:     { bg: "bg-green-50",   border: "border-l-green-500",   text: "text-green-700",   darkBg: "dark:bg-green-950/30",   darkBorder: "dark:border-l-green-400" },
  accepted:  { bg: "bg-emerald-50", border: "border-l-emerald-600", text: "text-emerald-700", darkBg: "dark:bg-emerald-950/30", darkBorder: "dark:border-l-emerald-400" },
  rejected:  { bg: "bg-red-50",     border: "border-l-red-500",     text: "text-red-700",     darkBg: "dark:bg-red-950/30",     darkBorder: "dark:border-l-red-400" },
  archived:  { bg: "bg-gray-50",    border: "border-l-gray-400",    text: "text-gray-600",    darkBg: "dark:bg-gray-900/30",    darkBorder: "dark:border-l-gray-500" },
  expired:   { bg: "bg-amber-50",   border: "border-l-amber-500",   text: "text-amber-700",   darkBg: "dark:bg-amber-950/30",   darkBorder: "dark:border-l-amber-400" },
};
```

### 7.3 Card Theme Tokens

Cards use existing Shadcn tokens for consistency with the rest of the UI:

| Element | Light | Dark |
|---|---|---|
| Card background | `bg-card` (white) | `bg-card` (dark surface) |
| Card text | `text-card-foreground` | `text-card-foreground` |
| Card border | `border` (neutral) | `border` (neutral) |
| Card hover | `hover:bg-accent/50` | `hover:bg-accent/50` |
| Card shadow (resting) | `shadow-sm` | `shadow-sm` |
| Card shadow (dragging) | `shadow-lg` | `shadow-lg` |
| Drag placeholder | `bg-muted/50 border-dashed` | `bg-muted/50 border-dashed` |

### 7.4 Due Date Colors

| Condition | Badge Class |
|---|---|
| Overdue (past due) | `bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300` |
| Due within 3 days | `bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300` |
| Due > 3 days | `text-muted-foreground` (no badge, plain text) |
| No due date | Not rendered |

---

## 8. Animation Specifications

### 8.1 Drag Animations

| Animation | Duration | Easing | Reduced Motion Alternative |
|---|---|---|---|
| Card lift on grab | 150ms | `ease-out` | Instant opacity change (0.9) |
| Card shadow grow on grab | 150ms | `ease-out` | No shadow change |
| Card follow cursor | 0ms (real-time) | linear | Same (no animation to reduce) |
| Placeholder insertion | 200ms | `ease-in-out` | Instant appear |
| Card settle on drop | 250ms | `cubic-bezier(0.2, 0, 0, 1)` | Instant position |
| Snap-back on cancel | 300ms | `cubic-bezier(0.2, 0, 0, 1)` | Instant return |
| Column highlight fade-in | 150ms | `ease-out` | Instant border change |

### 8.2 UI Animations

| Animation | Duration | Easing | Reduced Motion Alternative |
|---|---|---|---|
| Column collapse/expand | 200ms | `ease-in-out` | Instant show/hide |
| Card enter (initial load) | 0ms (no stagger) | -- | Same |
| Dialog open | 200ms | Shadcn default | Same (Radix handles this) |
| Toast slide-in | 200ms | Shadcn default | Same (Radix handles this) |
| Skeleton shimmer | 1500ms loop | linear | `animation: none` (static gray) |
| Tab switch (mobile) | 150ms | `ease-out` | Instant swap |

### 8.3 CSS Implementation

```css
/* Apply motion preferences via Tailwind's motion-reduce variant */

.kanban-card-dragging {
  @apply shadow-lg scale-[1.02] opacity-95 rotate-[1deg] z-50;
  @apply motion-reduce:shadow-sm motion-reduce:scale-100 motion-reduce:rotate-0;
  transition: box-shadow 150ms ease-out, transform 150ms ease-out;
}

.kanban-card-dropping {
  transition: transform 250ms cubic-bezier(0.2, 0, 0, 1);
}

@media (prefers-reduced-motion: reduce) {
  .kanban-card-dropping {
    transition: none;
  }
}

.kanban-placeholder {
  @apply border-2 border-dashed border-muted-foreground/30 rounded-lg bg-muted/30;
  @apply motion-safe:animate-pulse;
}
```

### 8.4 @dnd-kit Animation Config

```typescript
const dropAnimation: DropAnimation = {
  sideEffects: defaultDropAnimationSideEffects({
    styles: { active: { opacity: '0.5' } },
  }),
  // Respect reduced motion:
  duration: prefersReducedMotion ? 0 : 250,
  easing: 'cubic-bezier(0.2, 0, 0, 1)',
};
```

Use `useReducedMotion()` hook (custom, checks `window.matchMedia('(prefers-reduced-motion: reduce)')`) to set duration to 0 when reduced motion is preferred.

---

## 9. i18n Requirements

### 9.1 New Translation Keys

All keys go in `src/i18n/dictionaries/jobs.ts` under the existing `jobs` namespace. Add to all 4 locales (en, de, fr, es).

```typescript
// --- Kanban Board ---
"jobs.kanbanBoard":              "Kanban Board"
"jobs.kanbanViewTable":          "Table"
"jobs.kanbanViewKanban":         "Kanban"
"jobs.kanbanViewModeLabel":      "View mode"
"jobs.kanbanNoJobs":             "No jobs in this status"
"jobs.kanbanEmptyBoard":         "Add your first job to start tracking"
"jobs.kanbanEmptyBoardAction":   "Add Job"
"jobs.kanbanCollapsedCount":     "{count} jobs"

// --- Drag and Drop Announcements (screen reader) ---
"jobs.kanbanDragStart":          "Picked up {title} from {status} column"
"jobs.kanbanDragOver":           "Moved over {status} column"
"jobs.kanbanDragEnd":            "Dropped {title} in {status} column"
"jobs.kanbanDragCancel":         "Movement cancelled, {title} returned to original position"
"jobs.kanbanDndInstructions":    "Press Space or Enter to pick up a job card. Use arrow keys to move between columns. Press Space or Enter to drop. Press Escape to cancel."

// --- Transition Dialog ---
"jobs.kanbanMoveTitle":          "Move Job"
"jobs.kanbanMoveConfirm":        "Move \"{title}\" from {from} to {to}?"
"jobs.kanbanMoveNote":           "Add a note about this change (optional)"
"jobs.kanbanMoveNotePlaceholder":"e.g., Scheduled interview for next week"
"jobs.kanbanMoveButton":         "Move to {status}"
"jobs.kanbanMoveMoving":         "Moving..."
"jobs.kanbanMoved":              "Job moved to {status}"
"jobs.kanbanMoveFailed":         "Failed to move job"
"jobs.kanbanUndo":               "Undo"
"jobs.kanbanUndone":             "Move undone"
"jobs.kanbanUndoFailed":         "Failed to undo move"

// --- Invalid Transition ---
"jobs.kanbanInvalidTransition":  "Cannot move directly from {from} to {to}"

// --- Column Actions ---
"jobs.kanbanCollapseColumn":     "Collapse column"
"jobs.kanbanExpandColumn":       "Expand column"

// --- Status names for Kanban columns (reuse existing where possible) ---
// Already exist: jobs.statusDraft, jobs.statusApplied, jobs.statusInterview,
//                jobs.statusOffer, jobs.statusRejected, jobs.statusArchived,
//                jobs.statusExpired

// New status (not in current seed data but needed for Kanban):
"jobs.statusAccepted":           "Accepted"

// --- Mobile ---
"jobs.kanbanMoreStatuses":       "{count} more"
"jobs.kanbanChangeStatusMobile": "Change status"

// --- Match Score ---
"jobs.kanbanMatchScore":         "{score}% match"

// --- Due Date ---
"jobs.kanbanOverdue":            "Overdue"
"jobs.kanbanDueSoon":            "Due in {days} days"
"jobs.kanbanDueToday":           "Due today"
```

### 9.2 Translation Key Count

| Category | New Keys |
|---|---|
| Kanban Board UI | 8 |
| DnD Announcements | 5 |
| Transition Dialog | 10 |
| Invalid Transitions | 1 |
| Column Actions | 2 |
| Status Names | 1 (accepted) |
| Mobile | 2 |
| Match/Due Date | 4 |
| **Total** | **33** |

### 9.3 Interpolation Pattern

Keys with `{variable}` placeholders use the existing `t()` interpolation:

```typescript
t("jobs.kanbanMoveConfirm", {
  title: job.JobTitle?.label,
  from: t(`jobs.status${capitalize(fromStatus)}`),
  to: t(`jobs.status${capitalize(toStatus)}`),
})
```

### 9.4 Existing Keys Reused

These existing keys are already translated and will be reused without duplication:

- `jobs.title` ("My Jobs")
- `jobs.addJob` ("Add Job")
- `jobs.status` ("Status")
- `jobs.company` ("Company")
- `jobs.match` ("Match")
- `jobs.dueDate` ("Due Date")
- `jobs.statusDraft` / `statusApplied` / `statusInterview` / `statusOffer` / `statusRejected` / `statusArchived` / `statusExpired`
- `common.cancel`
- `common.loading`
- `jobs.changeStatus`

---

## 10. Existing Pattern Alignment

### 10.1 View Mode Toggle

The Kanban view mode toggle follows the exact pattern established in `src/components/staging/ViewModeToggle.tsx`:

- Same visual style: `role="radiogroup"` with two `role="radio"` buttons
- Same persistence: `localStorage.setItem("jobsync-myjobs-view-mode", mode)`
- Same keyboard: arrow keys switch modes within the radiogroup
- Different key name to avoid collision with staging's `jobsync-staging-view-mode`
- Default for new users: `"kanban"` (opposite of staging which defaults to `"list"`)

### 10.2 Card Design Consistency

Job cards in the Kanban reuse the same information hierarchy as MyJobsTable rows:
- Title (primary, font-medium, linked)
- Company (secondary)
- Tags (Badge component, variant="secondary")
- Match score (percentage, same format as table's matchScore column)
- Due date (same `formatDateShort(date, locale)` formatter)

### 10.3 Status Badge Colors

The existing MyJobsTable uses ad-hoc color classes (`bg-cyan-500` for applied, `bg-green-500` for interview). The Kanban board introduces a centralized `STATUS_COLORS` map (Section 7.2) that should retroactively replace these hardcoded classes in MyJobsTable for consistency.

### 10.4 Data Loading

The Kanban board loads data through the same `getJobsList()` action as the table view. The `JobsContainer` component remains the orchestrator -- it passes data down to either `MyJobsTable` or `KanbanBoard` based on the active view mode.

---

## 11. Open Questions for Implementation

1. **"Accepted" status:** The current seed data does not include an "Accepted" status (`prisma/seed.ts`). Need a migration to add `{ label: "Accepted", value: "accepted" }` to JobStatus, or make the Kanban columns data-driven from whatever statuses exist.

2. **Card sort order persistence:** Phase 1 uses localStorage. Should Phase 2 add a `kanbanSortIndex` column to the Job model, or a separate `KanbanCardOrder` table?

3. **Transition rules enforcement:** Currently UI-only soft constraints. Should the server action `updateJobStatus()` validate transitions and reject invalid ones, or remain permissive?

4. **Column configuration:** Should users be able to reorder columns, hide columns, or customize which statuses appear? (Likely Phase 2+.)

5. **Performance threshold:** At what job count should we switch from rendering all cards to virtualizing columns? Recommend: add virtualization when any column exceeds 50 cards.

---

## 12. Dependencies

| Package | Version | Purpose |
|---|---|---|
| `@dnd-kit/core` | ^6.x | DnD context, sensors, collision detection |
| `@dnd-kit/sortable` | ^8.x | Sortable lists within columns |
| `@dnd-kit/utilities` | ^3.x | CSS transform utility |
| `@dnd-kit/modifiers` | ^7.x | Restrict drag to window edges |

No other new dependencies. All UI components use existing Shadcn primitives (Card, Badge, Dialog, Button, Tooltip, DropdownMenu).

---

## 13. Test Strategy

### 13.1 Unit Tests

| Test | File |
|---|---|
| `useKanbanState` hook -- column grouping | `__tests__/hooks/useKanbanState.spec.ts` |
| `useKanbanState` -- collapse/expand persistence | `__tests__/hooks/useKanbanState.spec.ts` |
| `VALID_TRANSITIONS` map correctness | `__tests__/components/kanban/transitions.spec.ts` |
| `STATUS_COLORS` -- all statuses covered | `__tests__/components/kanban/status-colors.spec.ts` |
| Due date warning logic | `__tests__/components/kanban/due-date.spec.ts` |

### 13.2 Component Tests

| Test | File |
|---|---|
| `JobCardContent` renders title, company, tags | `__tests__/components/kanban/JobCardContent.spec.tsx` |
| `KanbanColumnHeader` shows count badge | `__tests__/components/kanban/KanbanColumnHeader.spec.tsx` |
| `TransitionDialog` confirm/cancel flow | `__tests__/components/kanban/TransitionDialog.spec.tsx` |
| `KanbanViewModeToggle` keyboard navigation | `__tests__/components/kanban/KanbanViewModeToggle.spec.tsx` |
| `KanbanEmptyBoard` CTA rendering | `__tests__/components/kanban/KanbanEmptyBoard.spec.tsx` |

### 13.3 E2E Tests

Per `e2e/CONVENTIONS.md`, Kanban tests go in the existing `e2e/crud/job-crud.spec.ts` (one spec per aggregate). Add a new describe block:

```typescript
test.describe("Kanban Board", () => {
  test("should toggle between table and kanban view", async ({ page }) => { ... });
  test("should display jobs in correct status columns", async ({ page }) => { ... });
  test("should move a job between columns via drag and drop", async ({ page }) => { ... });
  test("should show transition dialog on column change", async ({ page }) => { ... });
  test("should undo a status change via toast action", async ({ page }) => { ... });
  test("should collapse and expand columns", async ({ page }) => { ... });
});
```

**Note:** E2E drag-and-drop testing with Playwright requires `page.dragAndDrop()` or manual mouse event sequences. @dnd-kit's keyboard mode may be more reliable for E2E testing -- test moves via keyboard (Space to pick up, Arrow to move, Space to drop).
