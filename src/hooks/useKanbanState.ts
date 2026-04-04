"use client";

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type { JobResponse, JobStatus } from "@/models/job.model";
import {
  isValidTransition,
  STATUS_ORDER,
  COLLAPSED_BY_DEFAULT,
} from "@/lib/crm/status-machine";

// Re-export from the single source of truth (status-machine.ts)
export { isValidTransition, STATUS_ORDER };

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

const DEFAULT_COLLAPSED = COLLAPSED_BY_DEFAULT;

/** Status color Tailwind classes for column headers, card borders, etc. */
export const STATUS_COLORS: Record<string, {
  bg: string;
  border: string;
  text: string;
  darkBg: string;
  darkBorder: string;
  headerBg: string;
}> = {
  bookmarked: { bg: "bg-blue-50", border: "border-l-blue-500", text: "text-blue-700", darkBg: "dark:bg-blue-950/30", darkBorder: "dark:border-l-blue-400", headerBg: "bg-blue-100 dark:bg-blue-950/50" },
  draft:      { bg: "bg-blue-50", border: "border-l-blue-500", text: "text-blue-700", darkBg: "dark:bg-blue-950/30", darkBorder: "dark:border-l-blue-400", headerBg: "bg-blue-100 dark:bg-blue-950/50" },
  applied:    { bg: "bg-indigo-50", border: "border-l-indigo-500", text: "text-indigo-700", darkBg: "dark:bg-indigo-950/30", darkBorder: "dark:border-l-indigo-400", headerBg: "bg-indigo-100 dark:bg-indigo-950/50" },
  interview:  { bg: "bg-purple-50", border: "border-l-purple-500", text: "text-purple-700", darkBg: "dark:bg-purple-950/30", darkBorder: "dark:border-l-purple-400", headerBg: "bg-purple-100 dark:bg-purple-950/50" },
  offer:      { bg: "bg-green-50", border: "border-l-green-500", text: "text-green-700", darkBg: "dark:bg-green-950/30", darkBorder: "dark:border-l-green-400", headerBg: "bg-green-100 dark:bg-green-950/50" },
  accepted:   { bg: "bg-emerald-50", border: "border-l-emerald-600", text: "text-emerald-700", darkBg: "dark:bg-emerald-950/30", darkBorder: "dark:border-l-emerald-400", headerBg: "bg-emerald-100 dark:bg-emerald-950/50" },
  rejected:   { bg: "bg-red-50", border: "border-l-red-500", text: "text-red-700", darkBg: "dark:bg-red-950/30", darkBorder: "dark:border-l-red-400", headerBg: "bg-red-100 dark:bg-red-950/50" },
  archived:   { bg: "bg-gray-50", border: "border-l-gray-400", text: "text-gray-600", darkBg: "dark:bg-gray-900/30", darkBorder: "dark:border-l-gray-500", headerBg: "bg-gray-100 dark:bg-gray-800/50" },
};

export function getPersistedViewMode(): KanbanViewMode {
  if (typeof window === "undefined") return "kanban";
  const stored = localStorage.getItem(VIEW_MODE_STORAGE_KEY);
  return stored === "table" ? "table" : "kanban";
}

export function persistViewMode(mode: KanbanViewMode): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
}

function getPersistedCollapsed(): Set<string> {
  if (typeof window === "undefined") return new Set(DEFAULT_COLLAPSED);
  try {
    const stored = localStorage.getItem(COLLAPSED_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) return new Set(parsed);
    }
  } catch {
    // fall through
  }
  return new Set(DEFAULT_COLLAPSED);
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
  color: (typeof STATUS_COLORS)[string];
}

export function useKanbanState(jobs: JobResponse[], statuses: JobStatus[]) {
  const [collapsedColumns, setCollapsedColumns] = useState<Set<string>>(new Set(DEFAULT_COLLAPSED));
  const [undoState, setUndoState] = useState<UndoState | null>(null);
  const [mounted, setMounted] = useState(false);
  const undoTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Optimistic reorder: temporarily override the order for a specific column
  const [optimisticReorder, setOptimisticReorder] = useState<{
    statusValue: string;
    orderedJobIds: string[];
  } | null>(null);

  // Initialize collapsed state from localStorage
  useEffect(() => {
    setCollapsedColumns(getPersistedCollapsed());
    setMounted(true);
  }, []);

  const toggleCollapse = useCallback((statusValue: string) => {
    setCollapsedColumns(prev => {
      const next = new Set(prev);
      if (next.has(statusValue)) {
        next.delete(statusValue);
      } else {
        next.add(statusValue);
      }
      persistCollapsed(next);
      return next;
    });
  }, []);

  // Build columns from jobs and statuses
  const columns: KanbanColumn[] = useMemo(() => {
    const statusMap = new Map<string, JobStatus>();
    for (const s of statuses) {
      statusMap.set(s.value, s);
    }

    // Group jobs by status value
    const jobsByStatus = new Map<string, JobResponse[]>();
    for (const job of jobs) {
      const statusVal = job.Status?.value ?? "draft";
      const existing = jobsByStatus.get(statusVal) || [];
      existing.push(job);
      jobsByStatus.set(statusVal, existing);
    }

    // Build columns in STATUS_ORDER, only for statuses that exist in the database
    const result: KanbanColumn[] = [];
    for (const statusValue of STATUS_ORDER) {
      const status = statusMap.get(statusValue);
      if (!status) continue; // skip statuses not in the database

      let columnJobs = (jobsByStatus.get(statusValue) || []).sort(sortByKanbanOrder);

      // Apply optimistic reorder if this column matches
      if (optimisticReorder && optimisticReorder.statusValue === statusValue) {
        const jobLookup = new Map(columnJobs.map(j => [j.id, j]));
        const reordered: JobResponse[] = [];
        for (const id of optimisticReorder.orderedJobIds) {
          const job = jobLookup.get(id);
          if (job) reordered.push(job);
        }
        // Append any jobs not in the optimistic list (safety net)
        for (const job of columnJobs) {
          if (!optimisticReorder.orderedJobIds.includes(job.id)) {
            reordered.push(job);
          }
        }
        columnJobs = reordered;
      }

      result.push({
        status,
        jobs: columnJobs,
        isCollapsed: mounted ? collapsedColumns.has(statusValue) : DEFAULT_COLLAPSED.includes(statusValue),
        color: STATUS_COLORS[statusValue] ?? STATUS_COLORS.draft,
      });
    }

    // Collect jobs with statuses not covered by STATUS_ORDER
    const placedStatusValues = new Set(STATUS_ORDER);
    const orphanJobs: JobResponse[] = [];
    for (const [statusVal, statusJobs] of jobsByStatus) {
      if (!placedStatusValues.has(statusVal)) {
        orphanJobs.push(...statusJobs);
      }
    }
    if (orphanJobs.length > 0) {
      const otherStatus = {
        id: "__other__",
        value: "__other__",
        label: "Other",
      } as JobStatus;
      result.push({
        status: otherStatus,
        jobs: orphanJobs.sort(sortByKanbanOrder),
        isCollapsed: false,
        color: STATUS_COLORS.archived ?? STATUS_COLORS.draft,
      });
    }

    return result;
  }, [jobs, statuses, collapsedColumns, mounted, optimisticReorder]);

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
    collapsedColumns: mounted ? collapsedColumns : new Set(DEFAULT_COLLAPSED),
    toggleCollapse,
    isValidTransition,
    undoState,
    setUndoWithTimeout,
    clearUndo,
    mounted,
    applyOptimisticReorder,
    clearOptimisticReorder,
  };
}
