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

      result.push({
        status,
        jobs: (jobsByStatus.get(statusValue) || []).sort((a, b) => {
          // Sort by createdAt desc within each column
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }),
        isCollapsed: mounted ? collapsedColumns.has(statusValue) : DEFAULT_COLLAPSED.includes(statusValue),
        color: STATUS_COLORS[statusValue] ?? STATUS_COLORS.draft,
      });
    }

    return result;
  }, [jobs, statuses, collapsedColumns, mounted]);

  // Set undo with timeout
  const setUndoWithTimeout = useCallback((state: Omit<UndoState, "timeout">) => {
    // Clear existing undo
    if (undoState) {
      clearTimeout(undoState.timeout);
    }

    const timeout = setTimeout(() => {
      setUndoState(null);
    }, 5000);

    setUndoState({ ...state, timeout });
  }, [undoState]);

  const clearUndo = useCallback(() => {
    if (undoState) {
      clearTimeout(undoState.timeout);
      setUndoState(null);
    }
  }, [undoState]);

  return {
    columns,
    collapsedColumns: mounted ? collapsedColumns : new Set(DEFAULT_COLLAPSED),
    toggleCollapse,
    isValidTransition,
    undoState,
    setUndoWithTimeout,
    clearUndo,
    mounted,
  };
}
