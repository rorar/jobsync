import {
  addToBlocklist,
  removeFromBlocklist,
  getBlocklist,
  isHandleBlocked,
} from "@/actions/crmBlocklist.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    crmBlocklist: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db", () => {
  const { PrismaClient } = jest.requireMock("@prisma/client");
  return new PrismaClient();
});
jest.mock("@/models/person.model", () => ({
  CRM_CONFIG: { maxBlocklistEntries: 1000 },
}));

const prisma = new PrismaClient();

const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

describe("crmBlocklist.actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // addToBlocklist
  // ---------------------------------------------------------------------------

  describe("addToBlocklist", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await addToBlocklist("spammer@example.com", "email");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("rejects empty handle", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const result = await addToBlocklist("   ", "email");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.handleRequired");
    });

    it("rejects invalid type", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      // Cast to bypass TypeScript — we are testing the runtime guard
      const result = await addToBlocklist("bad@example.com", "fax" as "email");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.invalidBlocklistType");
    });

    it("rejects when limit (1000) reached", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.count as jest.Mock).mockResolvedValue(1000);

      const result = await addToBlocklist("spammer@example.com", "email");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.blocklistLimitReached");
    });

    it("rejects duplicate handle", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.count as jest.Mock).mockResolvedValue(0);
      (prisma.crmBlocklist.findUnique as jest.Mock).mockResolvedValue({ id: "existing-1" });

      const result = await addToBlocklist("spammer@example.com", "email");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.handleAlreadyBlocked");
    });

    it("creates entry with trimmed and lowercased handle", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.count as jest.Mock).mockResolvedValue(0);
      (prisma.crmBlocklist.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.crmBlocklist.create as jest.Mock).mockResolvedValue({ id: "entry-1" });

      const result = await addToBlocklist("  SPAM@EXAMPLE.COM  ", "email", "Unsolicited contact");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "entry-1" });
      expect(prisma.crmBlocklist.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            handle: "spam@example.com",
            type: "email",
            reason: "Unsolicited contact",
          }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // removeFromBlocklist
  // ---------------------------------------------------------------------------

  describe("removeFromBlocklist", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await removeFromBlocklist("entry-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when entry does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await removeFromBlocklist("entry-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.blocklistEntryNotFound");
    });

    it("removes successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.findFirst as jest.Mock).mockResolvedValue({ id: "entry-1", userId: mockUser.id });
      (prisma.crmBlocklist.delete as jest.Mock).mockResolvedValue({});

      const result = await removeFromBlocklist("entry-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "entry-1" });
      expect(prisma.crmBlocklist.delete).toHaveBeenCalledWith({ where: { id: "entry-1" } });
    });
  });

  // ---------------------------------------------------------------------------
  // getBlocklist
  // ---------------------------------------------------------------------------

  describe("getBlocklist", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getBlocklist();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns all entries for the user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const entries = [
        { id: "entry-1", handle: "spam@example.com", type: "email" },
        { id: "entry-2", handle: "spammy.io", type: "domain" },
      ];
      (prisma.crmBlocklist.findMany as jest.Mock).mockResolvedValue(entries);

      const result = await getBlocklist();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(entries);
      expect(prisma.crmBlocklist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id }),
        }),
      );
    });

    it("filters by type", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.findMany as jest.Mock).mockResolvedValue([]);

      await getBlocklist({ type: "domain" });

      expect(prisma.crmBlocklist.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id, type: "domain" }),
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // isHandleBlocked
  // ---------------------------------------------------------------------------

  describe("isHandleBlocked", () => {
    it("returns false for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await isHandleBlocked("spam@example.com");

      expect(result).toBe(false);
    });

    it("returns false for a non-blocked handle", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.findUnique as jest.Mock).mockResolvedValue(null);

      const result = await isHandleBlocked("clean@example.com");

      expect(result).toBe(false);
      expect(prisma.crmBlocklist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_handle: { userId: mockUser.id, handle: "clean@example.com" } },
        }),
      );
    });

    it("returns true for a blocked handle", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmBlocklist.findUnique as jest.Mock).mockResolvedValue({ id: "entry-1" });

      const result = await isHandleBlocked("SPAM@EXAMPLE.COM");

      expect(result).toBe(true);
      // Verify the handle is normalized (trimmed + lowercased) before lookup
      expect(prisma.crmBlocklist.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_handle: { userId: mockUser.id, handle: "spam@example.com" } },
        }),
      );
    });
  });
});
