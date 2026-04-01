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
      findUnique: jest.fn(),
      create: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

const mockCompanyBlacklist = db.companyBlacklist as unknown as {
  findMany: jest.Mock;
  findUnique: jest.Mock;
  create: jest.Mock;
  delete: jest.Mock;
};

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
      });
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getBlacklistEntries();

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not authenticated");
    });
  });

  describe("addBlacklistEntry", () => {
    it("creates a new entry", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      const mockEntry = {
        id: "e1", userId: "user-1", pattern: "Acme", matchType: "contains",
        reason: "Bad reviews", createdAt: new Date(), updatedAt: new Date(),
      };
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);

      const result = await addBlacklistEntry("Acme", "contains", "Bad reviews");

      expect(result.success).toBe(true);
      expect(result.data!.pattern).toBe("Acme");
      expect(mockCompanyBlacklist.create).toHaveBeenCalledWith({
        data: {
          userId: "user-1",
          pattern: "Acme",
          matchType: "contains",
          reason: "Bad reviews",
        },
      });
    });

    it("rejects empty pattern", async () => {
      const result = await addBlacklistEntry("  ", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.patternRequired");
    });

    it("rejects duplicate pattern", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue({ id: "existing" });

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("blacklist.alreadyExists");
    });

    it("trims pattern whitespace", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);
      const mockEntry = {
        id: "e1", userId: "user-1", pattern: "Acme", matchType: "exact",
        reason: null, createdAt: new Date(), updatedAt: new Date(),
      };
      mockCompanyBlacklist.create.mockResolvedValue(mockEntry);

      await addBlacklistEntry("  Acme  ", "exact");

      expect(mockCompanyBlacklist.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ pattern: "Acme" }),
      });
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await addBlacklistEntry("Acme", "contains");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not authenticated");
    });
  });

  describe("removeBlacklistEntry", () => {
    it("removes entry owned by user", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue({
        id: "e1", userId: "user-1",
      });
      mockCompanyBlacklist.delete.mockResolvedValue({});

      const result = await removeBlacklistEntry("e1");

      expect(result.success).toBe(true);
      expect(mockCompanyBlacklist.delete).toHaveBeenCalledWith({ where: { id: "e1" } });
    });

    it("rejects removal of entry owned by another user", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue({
        id: "e1", userId: "other-user",
      });

      const result = await removeBlacklistEntry("e1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Entry not found");
    });

    it("rejects removal of non-existent entry", async () => {
      mockCompanyBlacklist.findUnique.mockResolvedValue(null);

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
