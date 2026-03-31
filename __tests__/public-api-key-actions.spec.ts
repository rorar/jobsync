/**
 * Unit tests for Public API Key CRUD server actions.
 */
import {
  createPublicApiKey,
  listPublicApiKeys,
  revokePublicApiKey,
  deletePublicApiKey,
} from "@/actions/publicApiKey.actions";
import { getCurrentUser } from "@/utils/user.utils";

jest.mock("@/lib/db", () => ({
  publicApiKey: {
    create: jest.fn(),
    findMany: jest.fn(),
    findFirst: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/utils", () => ({
  handleError: jest.fn((_error: unknown, msg: string) => ({
    success: false,
    message: msg,
  })),
}));

jest.mock("@/lib/api/auth", () => ({
  generateApiKey: jest.fn(() => "pk_live_test1234567890abcdef1234567890abcdef"),
  hashApiKey: jest.fn((key: string) => `hash-of-${key}`),
  getKeyPrefix: jest.fn((key: string) => key.slice(0, 12)),
}));

const db = require("@/lib/db");

describe("createPublicApiKey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("creates a key and returns the plaintext key once", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.create.mockResolvedValue({
      id: "key-1",
      name: "Test Key",
      keyPrefix: "pk_live_test",
      keyHash: "hash-of-pk_live_test1234567890abcdef1234567890abcdef",
    });

    const result = await createPublicApiKey("Test Key");

    expect(result.success).toBe(true);
    expect(result.data?.key).toBe("pk_live_test1234567890abcdef1234567890abcdef");
    expect(result.data?.name).toBe("Test Key");
    expect(result.data?.keyPrefix).toBe("pk_live_test");
    expect(db.publicApiKey.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user-1",
        name: "Test Key",
        keyHash: "hash-of-pk_live_test1234567890abcdef1234567890abcdef",
        keyPrefix: "pk_live_test",
        permissions: "[]",
      }),
    });
  });

  it("rejects empty names", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    const result = await createPublicApiKey("   ");
    expect(result.success).toBe(false);
  });

  it("rejects names over 100 characters", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    const result = await createPublicApiKey("a".repeat(101));
    expect(result.success).toBe(false);
  });

  it("fails when not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const result = await createPublicApiKey("Test");
    expect(result.success).toBe(false);
  });
});

describe("listPublicApiKeys", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns keys without exposing keyHash", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findMany.mockResolvedValue([
      {
        id: "key-1",
        name: "My Key",
        keyPrefix: "pk_live_abcd",
        permissions: '["read"]',
        lastUsedAt: null,
        createdAt: new Date("2026-01-01"),
        revokedAt: null,
      },
    ]);

    const result = await listPublicApiKeys();

    expect(result.success).toBe(true);
    expect(result.data).toHaveLength(1);
    expect(result.data![0].permissions).toEqual(["read"]);
    // Verify keyHash is NOT in the select
    expect(db.publicApiKey.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ keyHash: true }),
      }),
    );
  });

  it("fails when not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const result = await listPublicApiKeys();
    expect(result.success).toBe(false);
  });
});

describe("revokePublicApiKey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sets revokedAt on the key", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findFirst.mockResolvedValue({
      id: "key-1",
      revokedAt: null,
    });
    db.publicApiKey.update.mockResolvedValue({});

    const result = await revokePublicApiKey("key-1");

    expect(result.success).toBe(true);
    expect(db.publicApiKey.update).toHaveBeenCalledWith({
      where: { id: "key-1" },
      data: { revokedAt: expect.any(Date) },
    });
  });

  it("fails if key is already revoked", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findFirst.mockResolvedValue({
      id: "key-1",
      revokedAt: new Date(),
    });

    const result = await revokePublicApiKey("key-1");
    expect(result.success).toBe(false);
  });

  it("fails if key not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findFirst.mockResolvedValue(null);

    const result = await revokePublicApiKey("nonexistent");
    expect(result.success).toBe(false);
  });
});

describe("deletePublicApiKey", () => {
  beforeEach(() => jest.clearAllMocks());

  it("permanently deletes the key", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findFirst.mockResolvedValue({
      id: "key-1",
      revokedAt: new Date(),
    });
    db.publicApiKey.delete.mockResolvedValue({});

    const result = await deletePublicApiKey("key-1");

    expect(result.success).toBe(true);
    expect(db.publicApiKey.delete).toHaveBeenCalledWith({
      where: { id: "key-1" },
    });
  });

  it("fails if key not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue({ id: "user-1" });
    db.publicApiKey.findFirst.mockResolvedValue(null);

    const result = await deletePublicApiKey("nonexistent");
    expect(result.success).toBe(false);
  });
});
