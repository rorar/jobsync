import {
  getBlacklistEntries,
  addBlacklistEntry,
  removeBlacklistEntry,
} from "@/actions/companyBlacklist.actions";
import { getBlacklistEntriesForUser } from "@/lib/blacklist-query";
import { getCurrentUser } from "@/utils/user.utils";
import db from "@/lib/db";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    companyBlacklist: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
      deleteMany: jest.fn(),
    },
    stagedVacancy: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

// Event bus mock: capture emissions so assertions can verify the H-A-05 seam.
jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
  createEvent: jest.fn((type: string, payload: unknown) => ({
    type,
    payload,
    timestamp: new Date(),
  })),
}));

import { emitEvent } from "@/lib/events";

const mockEmitEvent = emitEvent as jest.MockedFunction<typeof emitEvent>;

const mockCompanyBlacklist = db.companyBlacklist as unknown as {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
};

const mockStagedVacancy = db.stagedVacancy as unknown as {
  findMany: jest.Mock;
  updateMany: jest.Mock;
};

const mockTransaction = (db as unknown as { $transaction: jest.Mock }).$transaction;

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

/**
 * Wire the $transaction mock to execute the callback against the mocked
 * Prisma client. This matches the callback form used by the refactored
 * addBlacklistEntry implementation.
 */
function wireTransactionCallback(): void {
  mockTransaction.mockImplementation(
    async (arg: unknown) => {
      if (typeof arg === "function") {
        // Callback form: pass the mocked client as the tx object
        return (arg as (tx: typeof db) => Promise<unknown>)(db);
      }
      // Array form (legacy): execute in order
      return Promise.all(arg as Promise<unknown>[]);
    },
  );
}

describe("CompanyBlacklist Actions", () => {
  const mockUser = { id: "user-1" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  describe("getBlacklistEntries", () => {
    it("returns entries for authenticated user", async () => {
      const mockEntries = [
        {
          id: "e1",
          userId: "user-1",
          pattern: "Acme",
          matchType: "contains",
          reason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockCompanyBlacklist.findMany.mockResolvedValue(mockEntries);

      const result = await getBlacklistEntries();

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(result.data![0].pattern).toBe("Acme");
      expect(mockCompanyBlacklist.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        orderBy: { createdAt: "desc" },
        take: 500,
      });
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getBlacklistEntries();

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.notAuthenticated");
    });
  });

  describe("addBlacklistEntry", () => {
    const mockEntry = {
      id: "e1",
      userId: "user-1",
      pattern: "Acme",
      matchType: "contains",
      reason: "Bad reviews",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      wireTransactionCallback();
      // Default: findUnique returns null (no duplicate)
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      // Default: create returns the mock entry
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);
      // Default: no matching staged vacancies
      mockStagedVacancy.findMany.mockResolvedValue([]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 0 });
    });

    it("creates entry and trashes matching staged vacancies in transaction", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([
        { id: "sv-1" },
        { id: "sv-2" },
        { id: "sv-3" },
      ]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 3 });

      const result = await addBlacklistEntry("Acme", "contains", "Bad reviews");

      expect(result.success).toBe(true);
      expect(result.data!.pattern).toBe("Acme");
      expect(result.data!.trashedCount).toBe(3);
      expect(mockTransaction).toHaveBeenCalled();
      // Pre-flight findMany with select: { id: true }
      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ select: { id: true } }),
      );
    });

    it("uses contains filter for contains match type", async () => {
      await addBlacklistEntry("Acme", "contains");

      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            employerName: { contains: "Acme" },
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          }),
          select: { id: true },
        }),
      );
    });

    it("uses startsWith filter for starts_with match type", async () => {
      mockCompanyBlacklist.create.mockResolvedValue({
        ...mockEntry,
        matchType: "starts_with",
      });

      await addBlacklistEntry("Acme", "starts_with");

      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { startsWith: "Acme" },
          }),
        }),
      );
    });

    it("uses equals filter for exact match type", async () => {
      mockCompanyBlacklist.create.mockResolvedValue({
        ...mockEntry,
        matchType: "exact",
      });

      await addBlacklistEntry("Acme Corp", "exact");

      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { equals: "Acme Corp" },
          }),
        }),
      );
    });

    it("uses endsWith filter for ends_with match type", async () => {
      mockCompanyBlacklist.create.mockResolvedValue({
        ...mockEntry,
        matchType: "ends_with",
      });

      await addBlacklistEntry("Corp", "ends_with");

      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { endsWith: "Corp" },
          }),
        }),
      );
    });

    it("only trashes non-promoted non-archived non-trashed vacancies", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([{ id: "sv-1" }, { id: "sv-2" }]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 2 });

      await addBlacklistEntry("Acme", "contains");

      // Pre-flight filter
      expect(mockStagedVacancy.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          }),
        }),
      );
      // updateMany uses id IN (...) shape with defense-in-depth userId + lifecycle guards
      expect(mockStagedVacancy.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: "user-1",
            id: { in: ["sv-1", "sv-2"] },
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          }),
          data: { trashedAt: expect.any(Date) },
        }),
      );
    });

    it("skips updateMany entirely when pre-flight returns zero matches", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([]);

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(true);
      expect(result.data!.trashedCount).toBe(0);
      expect(mockStagedVacancy.updateMany).not.toHaveBeenCalled();
    });

    it("rejects empty pattern", async () => {
      const result = await addBlacklistEntry("  ", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.patternRequired");
    });

    it("rejects duplicate pattern without trashing vacancies", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue({ id: "existing" });

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.alreadyExists");
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockStagedVacancy.findMany).not.toHaveBeenCalled();
      expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.notAuthenticated");
      expect(mockTransaction).not.toHaveBeenCalled();
      expect(mockEmitEvent).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // H-A-05 regression guard: domain-event seam
  // -------------------------------------------------------------------------
  describe("addBlacklistEntry — domain event emission (H-A-05)", () => {
    const mockEntry = {
      id: "e1",
      userId: "user-1",
      pattern: "Acme",
      matchType: "contains",
      reason: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    beforeEach(() => {
      wireTransactionCallback();
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);
    });

    it("emits one VacancyTrashed event per retroactively trashed row", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([
        { id: "sv-1" },
        { id: "sv-2" },
        { id: "sv-3" },
      ]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 3 });

      await addBlacklistEntry("Acme", "contains");

      const vacancyTrashedCalls = mockEmitEvent.mock.calls.filter(
        ([ev]) => (ev as { type: string }).type === "VacancyTrashed",
      );
      expect(vacancyTrashedCalls).toHaveLength(3);

      const trashedIds = vacancyTrashedCalls.map(
        ([ev]) =>
          (ev as { payload: { stagedVacancyId: string } }).payload.stagedVacancyId,
      );
      expect(trashedIds).toEqual(["sv-1", "sv-2", "sv-3"]);

      // Each payload carries the correct userId
      for (const [ev] of vacancyTrashedCalls) {
        expect((ev as { payload: { userId: string } }).payload.userId).toBe("user-1");
      }
    });

    it("emits a BulkActionCompleted envelope with actionType 'blacklist_trash'", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([
        { id: "sv-1" },
        { id: "sv-2" },
      ]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 2 });

      await addBlacklistEntry("Acme", "contains");

      const bulkCalls = mockEmitEvent.mock.calls.filter(
        ([ev]) => (ev as { type: string }).type === "BulkActionCompleted",
      );
      expect(bulkCalls).toHaveLength(1);

      const bulkEvent = bulkCalls[0][0] as {
        type: string;
        payload: {
          actionType: string;
          itemIds: string[];
          userId: string;
          succeeded: number;
          failed: number;
        };
      };
      expect(bulkEvent.payload).toEqual({
        actionType: "blacklist_trash",
        itemIds: ["sv-1", "sv-2"],
        userId: "user-1",
        succeeded: 2,
        failed: 0,
      });
    });

    it("emits NO VacancyTrashed events when no rows match (empty retroactive sweep)", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 0 });

      await addBlacklistEntry("NoMatch", "contains");

      const vacancyTrashedCalls = mockEmitEvent.mock.calls.filter(
        ([ev]) => (ev as { type: string }).type === "VacancyTrashed",
      );
      expect(vacancyTrashedCalls).toHaveLength(0);

      const bulkCalls = mockEmitEvent.mock.calls.filter(
        ([ev]) => (ev as { type: string }).type === "BulkActionCompleted",
      );
      // BulkActionCompleted is ONLY emitted when at least one row is trashed —
      // a zero-match blacklist add is silent on the bus.
      expect(bulkCalls).toHaveLength(0);
    });

    it("emits NO events when the duplicate-entry short-circuit fires", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue({ id: "existing" });

      await addBlacklistEntry("Acme", "contains");

      expect(mockEmitEvent).not.toHaveBeenCalled();
    });

    it("emits events AFTER the transaction commits (causal ordering)", async () => {
      mockStagedVacancy.findMany.mockResolvedValue([{ id: "sv-1" }]);
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 1 });

      // Track the interleaving: emitEvent must never be called before
      // $transaction resolves.
      const callOrder: string[] = [];
      mockTransaction.mockImplementation(async (arg: unknown) => {
        callOrder.push("tx:start");
        let result: unknown;
        if (typeof arg === "function") {
          result = await (arg as (tx: typeof db) => Promise<unknown>)(db);
        }
        callOrder.push("tx:end");
        return result;
      });
      mockEmitEvent.mockImplementation(() => {
        callOrder.push("emit");
      });

      await addBlacklistEntry("Acme", "contains");

      const txEndIdx = callOrder.indexOf("tx:end");
      const firstEmitIdx = callOrder.indexOf("emit");
      expect(txEndIdx).toBeGreaterThanOrEqual(0);
      expect(firstEmitIdx).toBeGreaterThan(txEndIdx);
    });

    it("emits exactly one BulkActionCompleted regardless of row count", async () => {
      mockStagedVacancy.findMany.mockResolvedValue(
        Array.from({ length: 12 }, (_, i) => ({ id: `sv-${i}` })),
      );
      mockStagedVacancy.updateMany.mockResolvedValue({ count: 12 });

      await addBlacklistEntry("Acme", "contains");

      const bulkCalls = mockEmitEvent.mock.calls.filter(
        ([ev]) => (ev as { type: string }).type === "BulkActionCompleted",
      );
      expect(bulkCalls).toHaveLength(1);
      const bulkEvent = bulkCalls[0][0] as {
        payload: { itemIds: string[]; succeeded: number };
      };
      expect(bulkEvent.payload.itemIds).toHaveLength(12);
      expect(bulkEvent.payload.succeeded).toBe(12);
    });
  });

  describe("removeBlacklistEntry", () => {
    it("removes entry owned by user (atomic deleteMany)", async () => {
      mockCompanyBlacklist.deleteMany.mockResolvedValue({ count: 1 });

      const result = await removeBlacklistEntry("e1");

      expect(result.success).toBe(true);
      expect(mockCompanyBlacklist.deleteMany).toHaveBeenCalledWith({
        where: { id: "e1", userId: "user-1" },
      });
    });

    it("rejects removal of entry owned by another user", async () => {
      // With atomic deleteMany + userId, another user's entry returns count: 0
      mockCompanyBlacklist.deleteMany.mockResolvedValue({ count: 0 });

      const result = await removeBlacklistEntry("e1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.entryNotFound");
    });

    it("rejects removal of non-existent entry", async () => {
      mockCompanyBlacklist.deleteMany.mockResolvedValue({ count: 0 });

      const result = await removeBlacklistEntry("non-existent");

      expect(result.success).toBe(false);
    });
  });

  describe("getBlacklistEntriesForUser", () => {
    it("returns pattern and matchType for runner use", async () => {
      const mockEntries = [
        { pattern: "Acme", matchType: "exact" },
        { pattern: "Staffing", matchType: "contains" },
      ];
      mockCompanyBlacklist.findMany.mockResolvedValue(mockEntries);

      const result = await getBlacklistEntriesForUser("user-1");

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({ pattern: "Acme", matchType: "exact" });
      expect(mockCompanyBlacklist.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1" },
        select: { pattern: true, matchType: true },
      });
    });
  });
});
