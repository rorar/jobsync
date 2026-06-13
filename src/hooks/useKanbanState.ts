"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { JobResponse, JobStatus } from "@/models/job.model";
import { isValidStatusTransition } from "@/lib/crm/status-transition";

/**
 * Sort jobs within a column: by sortOrder ascending, then createdAt descending as fallback.
 * Jobs without a sortOrder (undefined/0) fall back to createdAt ordering.
 */
function sortByKanbanOrder(a: JobResponse, b: JobResponse): number {
  const aSortOrder = a.sortOrder ?? 0;
  const bSortOrder = b.sortOrder ?? 0;

  // If both have non-zero sortOrder, sort ascending
  if (aSortOrder !== 0 || bSortOrder !== 0) {
    if (aSortOrder !== bSortOrder) {
      return aSortOrder - bSortOrder;
    }
  }

  // Fallback: sort by createdAt desc
  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

/**
 * Compute the new sortOrder for a job being moved to a target index within a column.
 * Uses midpoint strategy between neighboring items to avoid reindexing the whole column.
 *
 * Drag direction semantics (dnd-kit closestCenter with useDraggable):
 * - Dragging DOWN (toIndex > fromIndex): place AFTER the card at toIndex
 * - Dragging UP (toIndex < fromIndex): place BEFORE the card at toIndex
 */
export function computeSortOrder(
  columnJobs: JobResponse[],
  fromIndex: number,
  toIndex: number,
): number {
  if (columnJobs.length <= 1) return 1;

  const draggingDown = toIndex > fromIndex;

  if (draggingDown) {
    // Place AFTER the card at toIndex
    const afterOrder = columnJobs[toIndex]?.sortOrder ?? 0;
    const belowIndex = toIndex + 1;
    if (belowIndex >= columnJobs.length || belowIndex === fromIndex) {
      // No card below (or only the dragged card) — place at end
      return afterOrder + 1;
    }
    // Skip the dragged card's own index if it's adjacent
    const nextIndex = belowIndex === fromIndex ? belowIndex + 1 : belowIndex;
    if (nextIndex >= columnJobs.length) {
      return afterOrder + 1;
    }
    const belowOrder = columnJobs[nextIndex]?.sortOrder ?? 0;
    return (afterOrder + belowOrder) / 2;
  } else {
    // Place BEFORE the card at toIndex
    const beforeOrder = columnJobs[toIndex]?.sortOrder ?? 0;
    const aboveIndex = toIndex - 1;
    if (aboveIndex < 0 || aboveIndex === fromIndex) {
      // No card above (or only the dragged card) — place at top
      return beforeOrder > 0 ? beforeOrder / 2 : beforeOrder - 1;
    }
    // Skip the dragged card's own index if it's adjacent
    const prevIndex = aboveIndex === fromIndex ? aboveIndex - 1 : aboveIndex;
    if (prevIndex < 0) {
      return beforeOrder > 0 ? beforeOrder / 2 : beforeOrder - 1;
    }
    const aboveOrder = columnJobs[prevIndex]?.sortOrder ?? 0;
    return (aboveOrder + beforeOrder) / 2;
  }
}

export type KanbanViewMode = "table" | "kanban";

const VIEW_MODE_STORAGE_KEY = "jobsync-myjobs-view-mode";
const COLLAPSED_STORAGE_KEY = "jobsync-kanban-collapsed";

export function getPersistedViewMode(): KanbanViewMode {
  if (typeof window === "undefined") return "kanban";
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "table" ? "table" : "kanban";
}

export function persistViewMode(mode: KanbanViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

/** Read the user's explicit collapse overrides from localStorage (null if none). */
function getStoredCollapsed(): Set<string> | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // fall through
  }
  return null;
}

function persistCollapsed(collapsed: Set<string>): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(Array.from(collapsed)));
}

interface UndoState {
  jobId: string;
  previousStatusId: string;
  previousStatusValue: string;
  timeout: ReturnType<typeof setTimeout>;
}

export interface KanbanColumn {
  status: JobStatus;
  jobs: JobResponse[];
  isCollapsed: boolean;
  /** Stage colour NAME (category.colour) — resolved to CSS by stage-colors. */
  colour: string;
}

export function useKanbanState(jobs: JobResponse[], statuses: JobStatus[]) {
  // Default collapse derives from each status' stage (category.defaultCollapsed),
  // not a hardcoded value list. Used until the user sets an explicit override.
  const defaultCollapsed = useMemo(() => {
    const s = new Set<string>();
    for (const st of statuses) if (st.category?.defaultCollapsed) s.add(st.value);
    return s;
  }, [statuses]);

  const [collapsedColumns, setCollapsedColumns] = useState<Set<string> | null>(null);
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [mounted, setMounted] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistic reorder: temporarily override the order for a specific column
  const [optimisticReorder, setOptimisticReorder] = useState<{
    statusValue: string;
    orderedJobIds: string[];
  } | null>(null);

  // Initialize collapsed state from localStorage on mount (explicit overrides win;
  // otherwise the per-stage default is applied in the column build below).
  useEffect(() => {
    setCollapsedColumns(getStoredCollapsed());
    setMounted(true);
  }, []);

  const toggleCollapse = useCallback(
    (statusValue: string) => {
      setCollapsedColumns((prev) => {
        const base = prev ?? new Set(defaultCollapsed);
        const next = new Set(base);
        if (next.has(statusValue)) next.delete(statusValue);
        else next.add(statusValue);
        persistCollapsed(next);
        return next;
      });
    },
    [defaultCollapsed],
  );

  // Build columns from jobs and statuses — ordered by (category.sortOrder,
  // status.sortOrder); colour + collapse derived from each status' stage. NO
  // hardcoded status list / colour map / collapse list (spec GetKanbanBoard).
  const columns: KanbanColumn[] = useMemo(() => {
    // Group jobs by status value
    const jobsByStatus = new Map<string, JobResponse[]>();
    for (const job of jobs) {
      const statusVal = job.Status?.value ?? "";
      const existing = jobsByStatus.get(statusVal) || [];
      existing.push(job);
      jobsByStatus.set(statusVal, existing);
    }

    const orderedStatuses = [...statuses].sort(
      (a, b) =>
        (a.category?.sortOrder ?? 0) - (b.category?.sortOrder ?? 0) ||
        (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
    );

    const result: KanbanColumn[] = [];
    const placedValues = new Set<string>();
    for (const status of orderedStatuses) {
      placedValues.add(status.value);
      let columnJobs = (jobsByStatus.get(status.value) || []).sort(sortByKanbanOrder);

      // Apply optimistic reorder if this column matches
      if (optimisticReorder && optimisticReorder.statusValue === status.value) {
        const jobLookup = new Map(columnJobs.map((j) => [j.id, j]));
        const reordered: JobResponse[] = [];
        for (const id of optimisticReorder.orderedJobIds) {
          const job = jobLookup.get(id);
          if (job) reordered.push(job);
        }
        for (const job of columnJobs) {
          if (!optimisticReorder.orderedJobIds.includes(job.id)) reordered.push(job);
        }
        columnJobs = reordered;
      }

      const isCollapsed = mounted
        ? (collapsedColumns ?? defaultCollapsed).has(status.value)
        : (status.category?.defaultCollapsed ?? false);

      result.push({
        status,
        jobs: columnJobs,
        isCollapsed,
        colour: status.category?.colour ?? "gray",
      });
    }

    // Jobs whose status is unknown to the current status set (should not occur
    // post-migration) collect into a single "Other" column so nothing is hidden.
    const orphanJobs: JobResponse[] = [];
    for (const [statusVal, statusJobs] of jobsByStatus) {
      if (!placedValues.has(statusVal)) orphanJobs.push(...statusJobs);
    }
    if (orphanJobs.length > 0) {
      // Real (neutral) category so any consumer reading column.status.category.*
      // gets a defined object, not undefined-via-cast. Sorts last, neutral grey,
      // never an applied/terminal stage.
      const otherStatus: JobStatus = {
        id: "__other__",
        value: "__other__",
        label: "Other",
        sortOrder: 0,
        isDefault: false,
        category: {
          id: "__other__",
          kind: "archived",
          label: "Other",
          colour: "gray",
          sortOrder: Number.MAX_SAFE_INTEGER,
          isAppliedStage: false,
          isTerminal: false,
          defaultCollapsed: false,
          allowsSelfTransition: false,
        },
      };
      result.push({
        status: otherStatus,
        jobs: orphanJobs.sort(sortByKanbanOrder),
        isCollapsed: false,
        colour: "gray",
      });
    }

    return result;
  }, [jobs, statuses, collapsedColumns, defaultCollapsed, mounted, optimisticReorder]);

  // Set undo with timeout (uses ref to avoid stale closure over undoState)
  const setUndoWithTimeout = useCallback((state: Omit<UndoState, "timeout">) => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
    }

    const timeout = setTimeout(() => {
      setUndoState(null);
      undoTimeoutRef.current = null;
    }, 5000);

    undoTimeoutRef.current = timeout;
    setUndoState({ ...state, timeout });
  }, []);

  const clearUndo = useCallback(() => {
    if (undoTimeoutRef.current) {
      clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
    setUndoState(null);
  }, []);

  /**
   * Apply an optimistic reorder to a specific column.
   * The column will render jobs in the given ID order until cleared.
   */
  const applyOptimisticReorder = useCallback(
    (statusValue: string, orderedJobIds: string[]) => {
      setOptimisticReorder({ statusValue, orderedJobIds });
    },
    [],
  );

  /**
   * Clear the optimistic reorder (after server confirms or on error revert).
   */
  const clearOptimisticReorder = useCallback(() => {
    setOptimisticReorder(null);
  }, []);

  return {
    columns,
    collapsedColumns: mounted ? (collapsedColumns ?? defaultCollapsed) : defaultCollapsed,
    toggleCollapse,
    isValidStatusTransition,
    undoState,
    setUndoWithTimeout,
    clearUndo,
    mounted,
    applyOptimisticReorder,
    clearOptimisticReorder,
  };
}
