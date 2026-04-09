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
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

const mockCompanyBlacklist = db.companyBlacklist as unknown as {
  findMany: jest.Mock;
  findFirst: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
  deleteMany: jest.Mock;
};

const mockTransaction = (db as unknown as { $transaction: jest.Mock }).$transaction;

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

describe("CompanyBlacklist Actions", () => {
  const mockUser = { id: "user-1" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  describe("getBlacklistEntries", () => {
    it("returns entries for authenticated user", async () => {
      const mockEntries = [
        { id: "e1", userId: "user-1", pattern: "Acme", matchType: "contains", reason: null, createdAt: new Date(), updatedAt: new Date() },
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
      id: "e1", userId: "user-1", pattern: "Acme", matchType: "contains",
      reason: "Bad reviews", createdAt: new Date(), updatedAt: new Date(),
    };

    beforeEach(() => {
      // $transaction executes the array of promises and returns their results
      mockTransaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    });

    it("creates entry and trashes matching staged vacancies in transaction", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);
      (db as unknown as { stagedVacancy: { updateMany: jest.Mock } }).stagedVacancy.updateMany
        .mockResolvedValue({ count: 3 });

      const result = await addBlacklistEntry("Acme", "contains", "Bad reviews");

      expect(result.success).toBe(true);
      expect(result.data!.pattern).toBe("Acme");
      expect(result.data!.trashedCount).toBe(3);
      expect(mockTransaction).toHaveBeenCalled();
    });

    it("uses contains filter for contains match type", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);
      const mockUpdateMany = (db as unknown as { stagedVacancy: { updateMany: jest.Mock } })
        .stagedVacancy.updateMany;
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await addBlacklistEntry("Acme", "contains");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { contains: "Acme" },
            userId: "user-1",
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          }),
        }),
      );
    });

    it("uses startsWith filter for starts_with match type", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue({
        ...mockEntry, matchType: "starts_with",
      });
      const mockUpdateMany = (db as unknown as { stagedVacancy: { updateMany: jest.Mock } })
        .stagedVacancy.updateMany;
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await addBlacklistEntry("Acme", "starts_with");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { startsWith: "Acme" },
          }),
        }),
      );
    });

    it("uses equals filter for exact match type", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue({
        ...mockEntry, matchType: "exact",
      });
      const mockUpdateMany = (db as unknown as { stagedVacancy: { updateMany: jest.Mock } })
        .stagedVacancy.updateMany;
      mockUpdateMany.mockResolvedValue({ count: 0 });

      await addBlacklistEntry("Acme Corp", "exact");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            employerName: { equals: "Acme Corp" },
          }),
        }),
      );
    });

    it("only trashes non-promoted non-archived non-trashed vacancies", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);
      const mockUpdateMany = (db as unknown as { stagedVacancy: { updateMany: jest.Mock } })
        .stagedVacancy.updateMany;
      mockUpdateMany.mockResolvedValue({ count: 2 });

      await addBlacklistEntry("Acme", "contains");

      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          }),
          data: { trashedAt: expect.any(Date) },
        }),
      );
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
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.notAuthenticated");
      expect(mockTransaction).not.toHaveBeenCalled();
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
