/**
 * Tests for validateApiKey — Public API authentication gate.
 * TG-1/TG-3: Critical test gap for the security perimeter.
 *
 * Separated from public-api-auth.spec.ts to avoid jest.mock hoisting conflicts.
 */

const mockFindUnique = jest.fn();
const mockUpdate = jest.fn().mockReturnValue({ catch: jest.fn() });

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    publicApiKey: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      update: (...args: unknown[]) => mockUpdate(...args),
    },
  },
}));

jest.mock("@/lib/api/last-used-throttle", () => ({
  shouldWriteLastUsedAt: jest.fn().mockReturnValue(false),
}));

import { validateApiKey, hashApiKey } from "@/lib/api/auth";

function makeRequest(headers: Record<string, string>) {
  return {
    headers: {
      get: (name: string) => headers[name.toLowerCase()] ?? null,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("validateApiKey", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockUpdate.mockReset().mockReturnValue({ catch: jest.fn() });
  });

  it("returns null when no auth header is present", async () => {
    const result = await validateApiKey(makeRequest({}));
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("extracts key from Authorization: Bearer header", async () => {
    const key = "pk_live_testbearer1234567890abcdef1234";
    const hash = hashApiKey(key);
    mockFindUnique.mockResolvedValue({
      id: "k1", userId: "u1", keyHash: hash, revokedAt: null,
    });

    const result = await validateApiKey(makeRequest({ authorization: `Bearer ${key}` }));
    expect(result).toEqual({ userId: "u1", keyHash: hash });
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { keyHash: hash },
      select: { id: true, userId: true, keyHash: true, revokedAt: true },
    });
  });

  it("extracts key from X-API-Key header", async () => {
    const key = "pk_live_xapitest1234567890abcdef12345";
    const hash = hashApiKey(key);
    mockFindUnique.mockResolvedValue({
      id: "k2", userId: "u2", keyHash: hash, revokedAt: null,
    });

    const result = await validateApiKey(makeRequest({ "x-api-key": key }));
    expect(result).toEqual({ userId: "u2", keyHash: hash });
  });

  it("prefers Authorization header over X-API-Key", async () => {
    const bearerKey = "pk_live_bearer1234567890abcdef12345";
    const hash = hashApiKey(bearerKey);
    mockFindUnique.mockResolvedValue({
      id: "k3", userId: "u3", keyHash: hash, revokedAt: null,
    });

    const result = await validateApiKey(makeRequest({
      authorization: `Bearer ${bearerKey}`,
      "x-api-key": "pk_live_other01234567890abcdef123456",
    }));
    expect(result).toEqual({ userId: "u3", keyHash: hash });
    // Should use bearerKey hash, not the x-api-key
    expect(mockFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { keyHash: hash } }),
    );
  });

  it("returns null for non-existent key", async () => {
    mockFindUnique.mockResolvedValue(null);
    const result = await validateApiKey(makeRequest({
      authorization: "Bearer pk_live_nonexistent1234567890abcdef12",
    }));
    expect(result).toBeNull();
  });

  it("returns null for revoked key", async () => {
    const key = "pk_live_revoked01234567890abcdef1234";
    mockFindUnique.mockResolvedValue({
      id: "k4", userId: "u4", keyHash: hashApiKey(key),
      revokedAt: new Date("2026-01-01"),
    });

    const result = await validateApiKey(makeRequest({ authorization: `Bearer ${key}` }));
    expect(result).toBeNull();
  });

  it("returns null for malformed Authorization header (Basic)", async () => {
    const result = await validateApiKey(makeRequest({
      authorization: "Basic dXNlcjpwYXNz",
    }));
    expect(result).toBeNull();
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("returns null for empty Bearer token", async () => {
    const result = await validateApiKey(makeRequest({
      authorization: "Bearer ",
    }));
    // "Bearer " with trailing space but no token — regex won't match
    expect(result).toBeNull();
  });

  it("is case-insensitive for Bearer prefix", async () => {
    const key = "pk_live_casetest1234567890abcdef1234";
    const hash = hashApiKey(key);
    mockFindUnique.mockResolvedValue({
      id: "k5", userId: "u5", keyHash: hash, revokedAt: null,
    });

    const result = await validateApiKey(makeRequest({
      authorization: `bearer ${key}`,
    }));
    expect(result).toEqual({ userId: "u5", keyHash: hash });
  });
});
