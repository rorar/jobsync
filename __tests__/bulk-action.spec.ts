/**
 * Bulk Action Service Tests
 *
 * Tests:
 * 1. Partial-success: mix of valid/invalid items
 * 2. Each action type validates correctly
 * 3. BulkActionCompleted event is emitted
 * 4. UndoToken is created for the batch
 * 5. Empty itemIds returns early
 * 6. All items invalid returns zero succeeded
 *
 * Sprint 2 H-P-04: bulk-action.service.ts was refactored from a
 * per-item `findFirst` + `update` loop to a single `findMany` + single
 * `updateMany`/`deleteMany`. These tests mock the batched surface.
 *
 * Spec: specs/vacancy-pipeline.allium (rule BulkPartialSuccess,
 *       BatchUndoGranularity, BulkActionEvent)
 */

import { eventBus } from "@/lib/events/event-bus";
import { undoStore } from "@/lib/undo/undo-store";
import type { DomainEvent } from "@/lib/events/event-types";

// ---------------------------------------------------------------------------
// Mock Prisma — batched surface
// ---------------------------------------------------------------------------

const mockFindMany = jest.fn();
const mockUpdateMany = jest.fn();
const mockDeleteMany = jest.fn();
// The undo compensation path for single-row actions still uses update() —
// kept for backwards compatibility with existing undo test assertions.
const mockUpdate = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
      deleteMany: (...args: unknown[]) => mockDeleteMany(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

// Import after mocks
import { executeBulkAction } from "@/lib/vacancy-pipeline/bulk-action.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface MockRow {
  id: string;
  status: string;
  archivedAt: Date | null;
  trashedAt: Date | null;
}

function makeRow(overrides: Partial<MockRow> & { id: string }): MockRow {
  return {
    status: "staged",
    archivedAt: null,
    trashedAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BulkActionService", () => {
  const userId = "user-1";

  beforeEach(() => {
    jest.clearAllMocks();
    eventBus.reset();
    undoStore.reset();
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockDeleteMany.mockResolvedValue({ count: 0 });
    mockUpdate.mockResolvedValue({});
  });

  // ───────────────────────────────────────────────────────────────────────
  // Empty input
  // ───────────────────────────────────────────────────────────────────────

  describe("empty itemIds", () => {
    it("returns early with zero counts and no DB call", async () => {
      const result = await executeBulkAction(userId, "dismiss", []);

      expect(result.totalRequested).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.undoTokenId).toBeUndefined();
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Batched fetch semantics (H-P-04)
  // ───────────────────────────────────────────────────────────────────────

  describe("batched fetch (H-P-04)", () => {
    it("fetches all candidate rows in ONE findMany scoped by userId", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1" }),
        makeRow({ id: "sv-2" }),
        makeRow({ id: "sv-3" }),
      ]);

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(mockFindMany).toHaveBeenCalledTimes(1);
      const call = mockFindMany.mock.calls[0][0];
      expect(call.where).toEqual({
        id: { in: ["sv-1", "sv-2", "sv-3"] },
        userId,
      });
      // Only minimum-required fields are selected (reduces payload)
      expect(call.select).toEqual({
        id: true,
        status: true,
        archivedAt: true,
        trashedAt: true,
      });
    });

    it("issues ONE updateMany for eligible rows", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1" }),
        makeRow({ id: "sv-2" }),
        makeRow({ id: "sv-3" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 3 });

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1", "sv-2", "sv-3"] } },
        data: { status: "dismissed" },
      });
    });

    it("issues ONE deleteMany for hard-delete action", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: new Date() }),
        makeRow({ id: "sv-2", trashedAt: new Date() }),
      ]);
      mockDeleteMany.mockResolvedValueOnce({ count: 2 });

      await executeBulkAction(userId, "delete", ["sv-1", "sv-2"]);

      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1", "sv-2"] } },
      });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Partial success: mix of valid and invalid items
  // ───────────────────────────────────────────────────────────────────────

  describe("partial-success semantics", () => {
    it("succeeds for valid items, skips invalid items without rollback", async () => {
      // Item 1: valid (staged), Item 2: invalid (promoted), Item 3: not found
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "promoted" }),
        // sv-3 intentionally missing from the result set
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(result.totalRequested).toBe(3);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      // Error ordering follows the ORIGINAL requested order, not findMany order
      expect(result.errors[0]).toEqual({
        itemId: "sv-2",
        reason: "Can only dismiss staged or ready vacancies",
      });
      expect(result.errors[1]).toEqual({
        itemId: "sv-3",
        reason: "Vacancy not found",
      });

      // Only sv-1 was included in the updateMany call
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { status: "dismissed" },
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // All items invalid
  // ───────────────────────────────────────────────────────────────────────

  describe("all items invalid", () => {
    it("returns zero succeeded with all errors and no updateMany call", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "promoted" }),
        makeRow({ id: "sv-2", status: "promoted" }),
      ]);

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      expect(result.totalRequested).toBe(2);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.undoTokenId).toBeUndefined();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Dismiss action type
  // ───────────────────────────────────────────────────────────────────────

  describe("dismiss action", () => {
    it("dismisses staged vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { status: "dismissed" },
      });
    });

    it("dismisses ready vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "ready" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.succeeded).toBe(1);
    });

    it("rejects dismissed vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "dismissed" }),
      ]);

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Can only dismiss staged or ready");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Archive action type
  // ───────────────────────────────────────────────────────────────────────

  describe("archive action", () => {
    it("archives non-promoted vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "archive", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { archivedAt: expect.any(Date) },
      });
    });

    it("rejects promoted vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "promoted" }),
      ]);

      const result = await executeBulkAction(userId, "archive", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Cannot archive a promoted vacancy");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Trash action type
  // ───────────────────────────────────────────────────────────────────────

  describe("trash action", () => {
    it("trashes non-promoted vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "trash", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { trashedAt: expect.any(Date) },
      });
    });

    it("rejects promoted vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "promoted" }),
      ]);

      const result = await executeBulkAction(userId, "trash", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Cannot trash a promoted vacancy");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Restore action type
  // ───────────────────────────────────────────────────────────────────────

  describe("restore action", () => {
    it("restores dismissed vacancies to staged", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "dismissed" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "restore", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { status: "staged" },
      });
    });

    it("rejects non-dismissed vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
      ]);

      const result = await executeBulkAction(userId, "restore", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Can only restore dismissed");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // RestoreFromTrash action type
  // ───────────────────────────────────────────────────────────────────────

  describe("restoreFromTrash action", () => {
    it("restores trashed vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: new Date() }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "restoreFromTrash", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { trashedAt: null },
      });
    });

    it("rejects non-trashed vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: null }),
      ]);

      const result = await executeBulkAction(userId, "restoreFromTrash", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Vacancy is not in trash");
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Delete action type
  // ───────────────────────────────────────────────────────────────────────

  describe("delete action", () => {
    it("hard deletes trashed vacancies", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: new Date() }),
      ]);
      mockDeleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "delete", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
      });
    });

    it("rejects non-trashed vacancies (safety guard)", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: null }),
      ]);

      const result = await executeBulkAction(userId, "delete", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Can only permanently delete trashed");
    });

    it("does not create undo token for hard delete", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", trashedAt: new Date() }),
      ]);
      mockDeleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "delete", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(result.undoTokenId).toBeUndefined();
      expect(undoStore.size).toBe(0);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // BulkActionCompleted event
  // ───────────────────────────────────────────────────────────────────────

  describe("BulkActionCompleted event", () => {
    it("emits ONE event per batch (not per item)", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("BulkActionCompleted", (event) => {
        received.push(event);
      });

      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "staged" }),
        makeRow({ id: "sv-3", status: "staged" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 3 });

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      // emitEvent is fire-and-forget, wait a tick for async processing
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      expect(received[0].type).toBe("BulkActionCompleted");
      expect(received[0].payload).toEqual({
        actionType: "dismiss",
        itemIds: ["sv-1", "sv-2", "sv-3"],
        userId,
        succeeded: 3,
        failed: 0,
      });
    });

    it("includes correct counts for partial success", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("BulkActionCompleted", (event) => {
        received.push(event);
      });

      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        // sv-2 missing → "Vacancy not found"
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual(
        expect.objectContaining({
          succeeded: 1,
          failed: 1,
        }),
      );
    });

    it("does emit event when all items fail (for audit/notification purposes)", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("BulkActionCompleted", (event) => {
        received.push(event);
      });

      // All items missing from findMany → all fail with "Vacancy not found"
      mockFindMany.mockResolvedValueOnce([]);

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(received).toHaveLength(1);
      expect(received[0].payload).toEqual(
        expect.objectContaining({
          succeeded: 0,
          failed: 2,
        }),
      );
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // UndoToken creation
  // ───────────────────────────────────────────────────────────────────────

  describe("UndoToken creation", () => {
    it("creates ONE undo token per batch", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "staged" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      expect(result.undoTokenId).toBeDefined();
      expect(undoStore.size).toBe(1);

      const entry = undoStore.get(result.undoTokenId!);
      expect(entry).toBeDefined();
      expect(entry!.actionLabel).toBe("bulk_dismiss");
      expect(entry!.itemIds).toEqual(["sv-1", "sv-2"]);
    });

    it("undo token compensation reverses the batch via updateMany groups", async () => {
      // sv-1 was in `staged`, sv-2 was in `ready` — compensation groups by
      // previous status and issues ONE updateMany per group.
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "ready" }),
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      // Clear the forward-dismiss call and run undo
      mockUpdateMany.mockClear();
      mockUpdateMany.mockResolvedValue({ count: 1 });

      const undoResult = await undoStore.undoById(result.undoTokenId!);
      expect(undoResult.success).toBe(true);

      // Two groups → two updateMany calls, one for each previous status
      expect(mockUpdateMany).toHaveBeenCalledTimes(2);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-1"] } },
        data: { status: "staged" },
      });
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ["sv-2"] } },
        data: { status: "ready" },
      });
    });

    it("does not create undo token when no items succeeded", async () => {
      // Empty findMany → sv-1 reported as not found → nothing succeeds
      mockFindMany.mockResolvedValueOnce([]);

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.undoTokenId).toBeUndefined();
      expect(undoStore.size).toBe(0);
    });

    it("only includes succeeded items in undo token", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "promoted" }), // fails
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      const entry = undoStore.get(result.undoTokenId!);
      expect(entry!.itemIds).toEqual(["sv-1"]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Error handling
  // ───────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("reports a DB-level findMany failure per item", async () => {
      mockFindMany.mockRejectedValueOnce(new Error("DB connection lost"));

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(3);
      expect(result.errors).toHaveLength(3);
      for (const err of result.errors) {
        expect(err.reason).toBe("DB connection lost");
      }
    });

    it("reports a DB-level updateMany failure for every eligible item", async () => {
      mockFindMany.mockResolvedValueOnce([
        makeRow({ id: "sv-1", status: "staged" }),
        makeRow({ id: "sv-2", status: "promoted" }), // pre-filtered error
        makeRow({ id: "sv-3", status: "staged" }),
      ]);
      mockUpdateMany.mockRejectedValueOnce(new Error("write failed"));

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(result.succeeded).toBe(0);
      // sv-1 and sv-3 failed from updateMany rejection; sv-2 failed from validation
      expect(result.failed).toBe(3);

      const reasons = result.errors.map((e) => e.reason).sort();
      expect(reasons).toEqual(
        [
          "Can only dismiss staged or ready vacancies", // sv-2
          "write failed", // sv-1
          "write failed", // sv-3
        ].sort(),
      );

      // No undo token because no item actually committed
      expect(result.undoTokenId).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Performance regression guard (H-P-04)
  // ───────────────────────────────────────────────────────────────────────

  describe("H-P-04 regression guard: query count does not scale with N", () => {
    it("uses exactly 1 findMany + 1 updateMany for N=100 items", async () => {
      const ids = Array.from({ length: 100 }, (_, i) => `sv-${i}`);
      const rows = ids.map((id) => makeRow({ id, status: "staged" }));

      mockFindMany.mockResolvedValueOnce(rows);
      mockUpdateMany.mockResolvedValueOnce({ count: 100 });

      const result = await executeBulkAction(userId, "dismiss", ids);

      expect(result.succeeded).toBe(100);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    });

    it("uses exactly 1 findMany + 1 deleteMany for a N=1000 hard delete", async () => {
      const ids = Array.from({ length: 1000 }, (_, i) => `sv-${i}`);
      const rows = ids.map((id) => makeRow({ id, trashedAt: new Date() }));

      mockFindMany.mockResolvedValueOnce(rows);
      mockDeleteMany.mockResolvedValueOnce({ count: 1000 });

      const result = await executeBulkAction(userId, "delete", ids);

      expect(result.succeeded).toBe(1000);
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });
});
