# ADR-023: useDraggable over useSortable for Kanban Cards

**Date:** 2026-04-02
**Status:** Accepted
**Deciders:** @rorar, Claude Opus 4.6

## Context

The Kanban board used `@dnd-kit/sortable` (`SortableContext` + `useSortable`) for job cards, which provides drag-and-drop with within-column reordering. However, `handleDragEnd` in `KanbanBoard.tsx` returns early on same-column drops -- within-column reorder was never implemented. Users saw the drag animation suggesting reordering was possible, but drops within the same column did nothing. This was a UX mismatch identified as EDGE-5 during the S3 review.

The root cause is a primitives mismatch: `useSortable` combines dragging + sorting semantics, but the Kanban board only needs cross-column dragging (status transitions). Using a higher-level primitive than needed leaked false affordances into the UI.

## Decision

Replace `useSortable` from `@dnd-kit/sortable` with `useDraggable` from `@dnd-kit/core` in `KanbanCard.tsx`. Remove `SortableContext` from `KanbanColumn.tsx`. Columns use `useDroppable` as drop targets; cards are draggable between columns but not sortable within them.

### Why Not Just Implement Within-Column Reorder?

Within-column reorder would require a `position` or `order` field on the Job model, a migration, and server-side logic to persist sort order. The current domain model does not have a concept of manual job ordering within a status -- jobs are sorted by `updatedAt`. Adding positional sorting is a separate feature decision, not a side effect of fixing a DnD library choice.

## Consequences

### Positive
- No misleading reorder animation -- the drag behavior matches what the system actually supports (cross-column status transitions only)
- `@dnd-kit/sortable` is no longer imported in the kanban module, reducing the dependency surface for this feature area
- Cleaner mental model: `useDraggable` + `useDroppable` explicitly communicates "move between containers"

### Negative
- If within-column reorder is later wanted (e.g., manual priority ordering), `SortableContext` and `useSortable` must be re-added along with a `position` field on the Job model
- `KeyboardSensor` no longer has access to `sortableKeyboardCoordinates` -- default keyboard navigation strategy is used, which may be less precise for keyboard-only users

### Files Changed
- `src/components/kanban/KanbanCard.tsx` -- `useSortable` replaced with `useDraggable`
- `src/components/kanban/KanbanColumn.tsx` -- `SortableContext` wrapper removed
- `src/components/kanban/KanbanBoard.tsx` -- `SortableContext` imports removed, sensor coordinates updated
