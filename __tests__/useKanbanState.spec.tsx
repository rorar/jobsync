/**
 * useKanbanState (Welle 4, Phase 5): Kanban columns derive from the user's
 * statuses ordered by (category.sortOrder, status.sortOrder), with colour +
 * default-collapse from each status' stage — NO hardcoded status list.
 */
import "@testing-library/jest-dom";
import { renderHook } from "@testing-library/react";
import { useKanbanState } from "@/hooks/useKanbanState";
import type { JobResponse, JobStatus } from "@/models/job.model";

const cat = (id: string, kind: string, sortOrder: number, colour: string, defaultCollapsed = false) => ({
  id, kind, label: kind, colour, sortOrder,
  isAppliedStage: ["applied", "interviewing", "offer", "won"].includes(kind),
  isTerminal: kind === "won",
  defaultCollapsed,
  allowsSelfTransition: kind === "interviewing",
});

const status = (id: string, value: string, label: string, category: ReturnType<typeof cat>, sortOrder = 0): JobStatus =>
  ({ id, value, label, sortOrder, isDefault: false, category });

const job = (id: string, statusValue: string): JobResponse =>
  ({
    id, userId: "u", JobTitle: { id: "", label: "T", value: "", createdBy: "" },
    Company: { id: "", label: "C", value: "", createdBy: "" },
    Status: { id: "", label: statusValue, value: statusValue },
    Location: null, jobType: "", createdAt: new Date(), appliedDate: null, dueDate: null,
    salaryRange: null, jobUrl: null, applied: false, matchScore: null, sortOrder: 0, tags: [],
  }) as unknown as JobResponse;

beforeEach(() => localStorage.clear());

const LEAD = cat("c-lead", "lead", 0, "blue");
const APPLIED = cat("c-applied", "applied", 1, "indigo");
const LOST = cat("c-lost", "lost", 5, "red", true);

describe("useKanbanState dynamic columns", () => {
  it("orders columns by (category.sortOrder, status.sortOrder)", () => {
    const statuses = [
      status("s-lost", "rejected", "Rejected", LOST),
      status("s-lead", "bookmarked", "Bookmarked", LEAD),
      status("s-applied", "applied", "Applied", APPLIED),
    ];
    const { result } = renderHook(() => useKanbanState([], statuses));
    expect(result.current.columns.map((c) => c.status.value)).toEqual([
      "bookmarked",
      "applied",
      "rejected",
    ]);
  });

  it("derives column colour from the status' stage", () => {
    const statuses = [status("s-applied", "applied", "Applied", APPLIED)];
    const { result } = renderHook(() => useKanbanState([], statuses));
    expect(result.current.columns[0].colour).toBe("indigo");
  });

  it("collapses by default the stages whose category.defaultCollapsed is true", () => {
    const statuses = [
      status("s-lead", "bookmarked", "Bookmarked", LEAD),
      status("s-lost", "rejected", "Rejected", LOST),
    ];
    const { result } = renderHook(() => useKanbanState([], statuses));
    const byValue = Object.fromEntries(result.current.columns.map((c) => [c.status.value, c.isCollapsed]));
    expect(byValue["bookmarked"]).toBe(false);
    expect(byValue["rejected"]).toBe(true);
  });

  it("renders a column for a user-created CUSTOM status (no hardcoded list)", () => {
    const PHONE = status("s-phone", "phone-screen", "Phone Screen", cat("c-int", "interviewing", 2, "purple"));
    const statuses = [status("s-lead", "bookmarked", "Bookmarked", LEAD), PHONE];
    const jobs = [job("j1", "phone-screen")];
    const { result } = renderHook(() => useKanbanState(jobs, statuses));
    const phoneCol = result.current.columns.find((c) => c.status.value === "phone-screen");
    expect(phoneCol).toBeDefined();
    expect(phoneCol!.jobs).toHaveLength(1);
    expect(phoneCol!.colour).toBe("purple");
  });
});
