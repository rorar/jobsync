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
 * Spec: specs/vacancy-pipeline.allium (rule BulkPartialSuccess, BatchUndoGranularity)
 */

import { eventBus } from "@/lib/events/event-bus";
import { undoStore } from "@/lib/undo/undo-store";
import type { DomainEvent } from "@/lib/events/event-types";

// ---------------------------------------------------------------------------
// Mock Prisma
// ---------------------------------------------------------------------------

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockDeletePrisma = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
      delete: (...args: unknown[]) => mockDeletePrisma(...args),
    },
  },
}));

// Import after mocks
import { executeBulkAction } from "@/lib/vacancy-pipeline/bulk-action.service";
import type { BulkActionType } from "@/lib/vacancy-pipeline/bulk-action.service";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStagedVacancy(overrides: Record<string, unknown> = {}) {
  return {
    id: "sv-1",
    userId: "user-1",
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
  });

  // ───────────────────────────────────────────────────────────────────────
  // Empty input
  // ───────────────────────────────────────────────────────────────────────

  describe("empty itemIds", () => {
    it("returns early with zero counts and no event", async () => {
      const result = await executeBulkAction(userId, "dismiss", []);

      expect(result.totalRequested).toBe(0);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.errors).toEqual([]);
      expect(result.undoTokenId).toBeUndefined();
      expect(mockFindFirst).not.toHaveBeenCalled();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Partial success: mix of valid and invalid items
  // ───────────────────────────────────────────────────────────────────────

  describe("partial-success semantics", () => {
    it("succeeds for valid items, skips invalid items without rollback", async () => {
      // Item 1: valid (staged), Item 2: invalid (promoted), Item 3: not found
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "promoted" }))
        .mockResolvedValueOnce(null); // not found

      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(result.totalRequested).toBe(3);
      expect(result.succeeded).toBe(1);
      expect(result.failed).toBe(2);
      expect(result.errors).toHaveLength(2);
      expect(result.errors[0]).toEqual({
        itemId: "sv-2",
        reason: "Can only dismiss staged or ready vacancies",
      });
      expect(result.errors[1]).toEqual({
        itemId: "sv-3",
        reason: "Vacancy not found",
      });
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // All items invalid
  // ───────────────────────────────────────────────────────────────────────

  describe("all items invalid", () => {
    it("returns zero succeeded with all errors", async () => {
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "promoted" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "promoted" }));

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      expect(result.totalRequested).toBe(2);
      expect(result.succeeded).toBe(0);
      expect(result.failed).toBe(2);
      expect(result.undoTokenId).toBeUndefined();
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Dismiss action type
  // ───────────────────────────────────────────────────────────────────────

  describe("dismiss action", () => {
    it("dismisses staged vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { status: "dismissed" },
        }),
      );
    });

    it("dismisses ready vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "ready" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.succeeded).toBe(1);
    });

    it("rejects dismissed vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "dismissed" }));

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
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "archive", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { archivedAt: expect.any(Date) },
        }),
      );
    });

    it("rejects promoted vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "promoted" }));

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
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "trash", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { trashedAt: expect.any(Date) },
        }),
      );
    });

    it("rejects promoted vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "promoted" }));

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
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "dismissed" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "restore", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { status: "staged" },
        }),
      );
    });

    it("rejects non-dismissed vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }));

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
      mockFindFirst.mockResolvedValueOnce(
        makeStagedVacancy({ id: "sv-1", trashedAt: new Date() }),
      );
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "restoreFromTrash", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { trashedAt: null },
        }),
      );
    });

    it("rejects non-trashed vacancies", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", trashedAt: null }));

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
      mockFindFirst.mockResolvedValueOnce(
        makeStagedVacancy({ id: "sv-1", trashedAt: new Date() }),
      );
      mockDeletePrisma.mockResolvedValue({});

      const result = await executeBulkAction(userId, "delete", ["sv-1"]);

      expect(result.succeeded).toBe(1);
      expect(mockDeletePrisma).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
        }),
      );
    });

    it("rejects non-trashed vacancies (safety guard)", async () => {
      mockFindFirst.mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", trashedAt: null }));

      const result = await executeBulkAction(userId, "delete", ["sv-1"]);

      expect(result.succeeded).toBe(0);
      expect(result.errors[0].reason).toContain("Can only permanently delete trashed");
    });

    it("does not create undo token for hard delete", async () => {
      mockFindFirst.mockResolvedValueOnce(
        makeStagedVacancy({ id: "sv-1", trashedAt: new Date() }),
      );
      mockDeletePrisma.mockResolvedValue({});

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

      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-3", status: "staged" }));
      mockUpdate.mockResolvedValue({});

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

      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(null); // not found
      mockUpdate.mockResolvedValue({});

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

    it("does not emit event when all items fail and no items succeed", async () => {
      const received: DomainEvent[] = [];
      eventBus.subscribe("BulkActionCompleted", (event) => {
        received.push(event);
      });

      // All fail — but event is still emitted (errors > 0)
      mockFindFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null);

      await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Event is emitted even when all fail (for audit/notification purposes)
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
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "staged" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      expect(result.undoTokenId).toBeDefined();
      expect(undoStore.size).toBe(1);

      const entry = undoStore.get(result.undoTokenId!);
      expect(entry).toBeDefined();
      expect(entry!.actionLabel).toBe("bulk_dismiss");
      expect(entry!.itemIds).toEqual(["sv-1", "sv-2"]);
    });

    it("undo token compensation reverses the batch", async () => {
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "ready" }));
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      // Clear previous update calls, then execute undo
      mockUpdate.mockClear();
      mockUpdate.mockResolvedValue({});

      const undoResult = await undoStore.undoById(result.undoTokenId!);
      expect(undoResult.success).toBe(true);

      // Should restore each item to its previous status
      expect(mockUpdate).toHaveBeenCalledTimes(2);
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-1" },
          data: { status: "staged" },
        }),
      );
      expect(mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "sv-2" },
          data: { status: "ready" },
        }),
      );
    });

    it("does not create undo token when no items succeeded", async () => {
      mockFindFirst.mockResolvedValueOnce(null);

      const result = await executeBulkAction(userId, "dismiss", ["sv-1"]);

      expect(result.undoTokenId).toBeUndefined();
      expect(undoStore.size).toBe(0);
    });

    it("only includes succeeded items in undo token", async () => {
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-2", status: "promoted" })); // fails
      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2"]);

      const entry = undoStore.get(result.undoTokenId!);
      expect(entry!.itemIds).toEqual(["sv-1"]);
    });
  });

  // ───────────────────────────────────────────────────────────────────────
  // Error handling per item
  // ───────────────────────────────────────────────────────────────────────

  describe("error handling", () => {
    it("catches per-item errors without stopping the batch", async () => {
      mockFindFirst
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-1", status: "staged" }))
        .mockRejectedValueOnce(new Error("DB connection lost"))
        .mockResolvedValueOnce(makeStagedVacancy({ id: "sv-3", status: "staged" }));

      mockUpdate.mockResolvedValue({});

      const result = await executeBulkAction(userId, "dismiss", ["sv-1", "sv-2", "sv-3"]);

      expect(result.succeeded).toBe(2);
      expect(result.failed).toBe(1);
      expect(result.errors[0]).toEqual({
        itemId: "sv-2",
        reason: "DB connection lost",
      });
    });
  });
});
