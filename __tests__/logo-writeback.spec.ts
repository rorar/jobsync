/**
 * applyLogoWriteback Tests
 *
 * Tests: guard conditions (status/logoUrl), IDOR protection, JSON string data,
 * and — most critically — credential stripping before writing to Company.logoUrl.
 *
 * H-S-03 regression guard: every logo URL MUST be stripped of credential
 * parameters before reaching the database, regardless of whether the upstream
 * enrichment module pre-cleaned it.
 */

// mock logo-asset-service which has `import "server-only"` at module scope
jest.mock("server-only", () => ({}));

// Provide a real inline implementation of stripCredentialsFromUrl that mirrors
// the production code — we do NOT want to mock the stripping logic itself,
// we want to verify the integration between applyLogoWriteback and the stripper.
jest.mock("@/lib/assets/logo-asset-service", () => {
  const DEFAULT_CREDENTIAL_PARAMS = [
    "token",
    "key",
    "api_key",
    "apiKey",
    "access_token",
    "sig",
    "signature",
    "X-Amz-Signature",
    "X-Amz-Security-Token",
    "auth",
    "secret",
  ];
  return {
    stripCredentialsFromUrl: (url: string, extra: string[] = []) => {
      try {
        const parsed = new URL(url);
        for (const name of [...DEFAULT_CREDENTIAL_PARAMS, ...extra]) {
          parsed.searchParams.delete(name);
        }
        return parsed.toString();
      } catch {
        return url;
      }
    },
    // logoAssetService singleton stub (needed so the module import doesn't fail)
    logoAssetService: {},
  };
});

// ---------------------------------------------------------------------------
// Prisma mock
// ---------------------------------------------------------------------------

const mockUpdateMany = jest.fn();
const mockDb = {
  company: {
    updateMany: mockUpdateMany,
  },
} as unknown as import("@prisma/client").PrismaClient;

// ---------------------------------------------------------------------------
// Import under test (after all mocks)
// ---------------------------------------------------------------------------

import { applyLogoWriteback } from "@/lib/connector/data-enrichment/logo-writeback";
import type { EnrichmentOutput } from "@/lib/connector/data-enrichment/types";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("applyLogoWriteback", () => {
  const userId = "user-1";
  const companyId = "company-1";

  beforeEach(() => {
    jest.clearAllMocks();
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  // -------------------------------------------------------------------------
  // Guard conditions
  // -------------------------------------------------------------------------

  it("does not write when status is not 'found'", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "not_found",
      data: {},
      source: "logo_dev",
      ttl: 86400,
    };

    await applyLogoWriteback(mockDb, userId, companyId, output);

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("does not write when logoUrl is missing from data", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: {},
      source: "logo_dev",
      ttl: 86400,
    };

    await applyLogoWriteback(mockDb, userId, companyId, output);

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  it("does not write when logoUrl is empty string", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: { logoUrl: "" },
      source: "logo_dev",
      ttl: 86400,
    };

    await applyLogoWriteback(mockDb, userId, companyId, output);

    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // H-S-03: Credential stripping (REGRESSION GUARD — must never be removed)
  // -------------------------------------------------------------------------

  describe("credential stripping — H-S-03 defense-in-depth", () => {
    it("strips 'token' parameter before writing (Logo.dev pk_ key pattern)", async () => {
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: "https://img.logo.dev/acme.com?format=png&token=pk_abc123" },
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("token=pk_abc123");
      expect(data.logoUrl).toContain("format=png");
      expect(data.logoUrl).toContain("img.logo.dev");
    });

    it("strips 'key' parameter (Google APIs pattern)", async () => {
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: "https://maps.googleapis.com/logo?key=AIzaSy_secret&format=png" },
        source: "google_favicon",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("key=AIzaSy_secret");
      expect(data.logoUrl).toContain("format=png");
    });

    it("strips 'api_key' parameter", async () => {
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: "https://api.example.com/logo?api_key=secret&size=64" },
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("api_key=secret");
      expect(data.logoUrl).toContain("size=64");
    });

    it("strips 'access_token' parameter (OAuth bearer-in-URL pattern)", async () => {
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: "https://api.example.com/logo?access_token=bearer_xyz&v=2" },
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("access_token=bearer_xyz");
      expect(data.logoUrl).toContain("v=2");
    });

    it("strips 'X-Amz-Signature' (AWS presigned URL pattern)", async () => {
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: {
          logoUrl:
            "https://bucket.s3.amazonaws.com/logo.png?X-Amz-Signature=abcdef&X-Amz-Expires=3600",
        },
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("X-Amz-Signature=abcdef");
      expect(data.logoUrl).toContain("X-Amz-Expires=3600");
    });

    it("preserves clean URL without modification", async () => {
      const cleanUrl = "https://img.logo.dev/example.com?format=png";
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: cleanUrl },
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: {
          id: companyId,
          createdBy: userId,
          logoUrl: null,
        },
        data: { logoUrl: cleanUrl },
      });
    });

    it("strips credentials when data is a JSON string payload", async () => {
      // logo-dev module stores data as plain object but the type allows JSON string
      const output: EnrichmentOutput = {
        dimension: "logo",
        status: "found",
        data: JSON.stringify({
          logoUrl: "https://img.logo.dev/acme.com?format=png&token=pk_secret",
        }) as unknown as Record<string, unknown>,
        source: "logo_dev",
        ttl: 86400,
      };

      await applyLogoWriteback(mockDb, userId, companyId, output);

      const { data } = mockUpdateMany.mock.calls[0][0];
      expect(data.logoUrl).not.toContain("token=pk_secret");
      expect(data.logoUrl).toContain("img.logo.dev");
    });
  });

  // -------------------------------------------------------------------------
  // IDOR + DB interaction
  // -------------------------------------------------------------------------

  it("uses IDOR protection (createdBy: userId, logoUrl: null guard)", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://img.logo.dev/example.com?format=png" },
      source: "logo_dev",
      ttl: 86400,
    };

    await applyLogoWriteback(mockDb, userId, companyId, output);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const callArgs = mockUpdateMany.mock.calls[0][0];
    expect(callArgs.where.createdBy).toBe(userId);
    expect(callArgs.where.logoUrl).toBeNull();
    expect(callArgs.where.id).toBe(companyId);
  });
});
