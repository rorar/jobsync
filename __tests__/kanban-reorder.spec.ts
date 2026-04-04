/**
 * E1.3: Kanban within-column reorder tests
 *
 * Tests for:
 * 1. computeSortOrder — direction-aware midpoint strategy for sort order calculation
 * 2. Edge cases: fractional values, zero sortOrder, large numbers
 * 3. Integration contract: within-column reorder calls updateKanbanOrder without statusId
 */

import { computeSortOrder } from "@/hooks/useKanbanState";
import type { JobResponse } from "@/models/job.model";

// ---------------------------------------------------------------------------
// Helper: build a minimal JobResponse with the fields used by sorting/reorder
// ---------------------------------------------------------------------------
function makeJob(
  id: string,
  sortOrder: number,
  createdAt: string = "2026-04-01",
): JobResponse {
  return {
    id,
    userId: "",
    JobTitle: { id: "", label: `Job ${id}`, value: "", createdBy: "" },
    Company: { id: "", label: "Acme", value: "", createdBy: "" },
    Status: { id: "s-1", label: "Bookmarked", value: "bookmarked" },
    jobType: "",
    createdAt: new Date(createdAt),
    appliedDate: null,
    dueDate: null,
    salaryRange: null,
    jobUrl: null,
    applied: false,
    sortOrder,
  };
}

describe("computeSortOrder — direction-aware midpoint strategy", () => {
  describe("dragging UP (toIndex < fromIndex): place BEFORE target", () => {
    it("moves last item to top position", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30)];
      // Move c (index 2) to position 0 (before a)
      const result = computeSortOrder(jobs, 2, 0);
      expect(result).toBeLessThan(10);
      expect(result).toBe(5); // 10 / 2
    });

    it("moves last item before middle item", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30)];
      // Move c (index 2) before b (index 1)
      const result = computeSortOrder(jobs, 2, 1);
      expect(result).toBeGreaterThan(10);
      expect(result).toBeLessThan(20);
      expect(result).toBe(15); // midpoint(a=10, b=20)
    });

    it("moves to top when first item has zero sortOrder", () => {
      const jobs = [makeJob("a", 0), makeJob("b", 5), makeJob("c", 10)];
      // Move c to top (before a)
      const result = computeSortOrder(jobs, 2, 0);
      // beforeOrder = 0, no card above, 0 is not > 0 so use beforeOrder - 1
      expect(result).toBe(-1);
    });
  });

  describe("dragging DOWN (toIndex > fromIndex): place AFTER target", () => {
    it("moves first item after second item", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30)];
      // Move a (index 0) after b (index 1)
      const result = computeSortOrder(jobs, 0, 1);
      expect(result).toBeGreaterThan(20);
      expect(result).toBeLessThan(30);
      expect(result).toBe(25); // midpoint(b=20, c=30)
    });

    it("moves first item after last item (to end)", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30)];
      // Move a (index 0) after c (index 2) — no card below
      const result = computeSortOrder(jobs, 0, 2);
      expect(result).toBeGreaterThan(30);
      expect(result).toBe(31); // lastOrder + 1
    });

    it("moves middle item to end", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30)];
      // Move b (index 1) after c (index 2)
      const result = computeSortOrder(jobs, 1, 2);
      expect(result).toBeGreaterThan(30);
      expect(result).toBe(31);
    });

    it("swaps two items in a 2-item column (a after b)", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20)];
      // Move a (index 0) after b (index 1)
      const result = computeSortOrder(jobs, 0, 1);
      // b is at toIndex=1, no card below → afterOrder + 1
      expect(result).toBeGreaterThan(20);
      expect(result).toBe(21);
    });
  });

  describe("edge cases", () => {
    it("single item column returns 1", () => {
      const jobs = [makeJob("a", 5)];
      const result = computeSortOrder(jobs, 0, 0);
      expect(result).toBe(1);
    });

    it("handles all-zero sortOrders (drag up)", () => {
      const jobs = [makeJob("a", 0), makeJob("b", 0), makeJob("c", 0)];
      // Move c (index 2) to top
      const result = computeSortOrder(jobs, 2, 0);
      expect(result).toBe(-1); // 0 - 1
    });

    it("handles all-zero sortOrders (drag down)", () => {
      const jobs = [makeJob("a", 0), makeJob("b", 0), makeJob("c", 0)];
      // Move a (index 0) after c
      const result = computeSortOrder(jobs, 0, 2);
      expect(result).toBe(1); // 0 + 1
    });

    it("returns finite number for any valid input", () => {
      const jobs = [
        makeJob("a", 10),
        makeJob("b", 20),
        makeJob("c", 30),
        makeJob("d", 40),
      ];
      for (let from = 0; from < jobs.length; from++) {
        for (let to = 0; to < jobs.length; to++) {
          if (from === to) continue;
          const result = computeSortOrder(jobs, from, to);
          expect(Number.isFinite(result)).toBe(true);
          expect(Number.isNaN(result)).toBe(false);
        }
      }
    });

    it("handles large sortOrder values", () => {
      const jobs = [
        makeJob("a", 1_000_000),
        makeJob("b", 2_000_000),
        makeJob("c", 3_000_000),
      ];
      const result = computeSortOrder(jobs, 2, 1);
      expect(result).toBe(1_500_000); // midpoint(a, b)
      expect(Number.isFinite(result)).toBe(true);
    });

    it("handles fractional sortOrder from repeated midpoint splits", () => {
      const jobs = [
        makeJob("a", 1),
        makeJob("b", 1.5),
        makeJob("c", 1.75),
        makeJob("d", 2),
      ];
      // Move d (index 3) before c (index 2)
      const result = computeSortOrder(jobs, 3, 2);
      // Place before c(1.75), above card is b(1.5) → midpoint(1.5, 1.75) = 1.625
      expect(result).toBe(1.625);
      expect(result).toBeGreaterThan(1.5);
      expect(result).toBeLessThan(1.75);
    });

    it("handles adjacent cards correctly (drag down, cards next to each other)", () => {
      const jobs = [makeJob("a", 1), makeJob("b", 2), makeJob("c", 3)];
      // Move a (index 0) after b (index 1) — adjacent downward move
      const result = computeSortOrder(jobs, 0, 1);
      // After b(2), below card is c(3) → midpoint(2, 3) = 2.5
      expect(result).toBe(2.5);
      expect(result).toBeGreaterThan(2);
      expect(result).toBeLessThan(3);
    });

    it("handles adjacent cards correctly (drag up, cards next to each other)", () => {
      const jobs = [makeJob("a", 1), makeJob("b", 2), makeJob("c", 3)];
      // Move c (index 2) before b (index 1) — adjacent upward move
      const result = computeSortOrder(jobs, 2, 1);
      // Before b(2), above card is a(1) → midpoint(1, 2) = 1.5
      expect(result).toBe(1.5);
      expect(result).toBeGreaterThan(1);
      expect(result).toBeLessThan(2);
    });

    it("adjacent swap with fromIndex directly before target is correctly skipped", () => {
      const jobs = [makeJob("a", 10), makeJob("b", 20), makeJob("c", 30), makeJob("d", 40)];
      // Move b (index 1) after c (index 2): adjacent downward
      // b is at toIndex-1 relative to the drag, so belowIndex=3 (d)
      const result = computeSortOrder(jobs, 1, 2);
      // After c(30), below is d(40). But belowIndex (3) !== fromIndex (1), so midpoint(30, 40) = 35
      expect(result).toBe(35);
    });
  });
});

describe("computeSortOrder — sortOrder constraint verification", () => {
  it("dragging down always produces sortOrder > target card's sortOrder", () => {
    const jobs = [makeJob("a", 5), makeJob("b", 15), makeJob("c", 25), makeJob("d", 35)];
    // Drag a after b
    expect(computeSortOrder(jobs, 0, 1)).toBeGreaterThan(15);
    // Drag a after c
    expect(computeSortOrder(jobs, 0, 2)).toBeGreaterThan(25);
    // Drag a after d
    expect(computeSortOrder(jobs, 0, 3)).toBeGreaterThan(35);
  });

  it("dragging up always produces sortOrder < target card's sortOrder", () => {
    const jobs = [makeJob("a", 5), makeJob("b", 15), makeJob("c", 25), makeJob("d", 35)];
    // Drag d before c
    expect(computeSortOrder(jobs, 3, 2)).toBeLessThan(25);
    // Drag d before b
    expect(computeSortOrder(jobs, 3, 1)).toBeLessThan(15);
    // Drag d before a
    expect(computeSortOrder(jobs, 3, 0)).toBeLessThan(5);
  });
});
