import {
  triggerEnrichment,
  getEnrichmentStatus,
  getEnrichmentResult,
  refreshEnrichment,
} from "@/actions/enrichment.actions";
import { getCurrentUser } from "@/utils/user.utils";
import db from "@/lib/db";
import { checkRateLimit } from "@/lib/api/rate-limit";
import { enrichmentOrchestrator, getChainForDimension } from "@/lib/connector/data-enrichment/orchestrator";
import { ENRICHMENT_CONFIG } from "@/lib/connector/data-enrichment/types";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    company: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    enrichmentResult: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: jest.fn().mockReturnValue({ allowed: true, remaining: 9, limit: 10, resetAt: 0 }),
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/connector/data-enrichment/orchestrator", () => ({
  enrichmentOrchestrator: {
    execute: jest.fn(),
  },
  getChainForDimension: jest.fn(),
}));

const mockDb = db as unknown as {
  company: { findFirst: jest.Mock; updateMany: jest.Mock };
  enrichmentResult: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};

const mockOrchestrator = enrichmentOrchestrator as unknown as {
  execute: jest.Mock;
};

const mockGetChain = getChainForDimension as jest.Mock;
const mockCheckRateLimit = checkRateLimit as jest.Mock;

describe("Enrichment Actions", () => {
  const mockUser = { id: "user-1", name: "Test", email: "test@test.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
  });

  // =========================================================================
  // triggerEnrichment
  // =========================================================================
  describe("triggerEnrichment", () => {
    it("returns enrichment result on success", async () => {
      const mockCompany = { id: "company-1", label: "Acme Corp" };
      const mockChain = {
        dimension: "logo",
        entries: [{ moduleId: "logo_dev", priority: 1 }],
      };
      const mockOutput = {
        dimension: "logo",
        status: "found",
        data: { logoUrl: "https://img.logo.dev/acme.com" },
        source: "logo_dev",
        ttl: 86400,
      };
      const mockResult = {
        id: "result-1",
        userId: "user-1",
        dimension: "logo",
        domainKey: "acme.com",
        companyId: null,
        status: "found",
        data: JSON.stringify({ logoUrl: "https://img.logo.dev/acme.com" }),
        sourceModuleId: "logo_dev",
        ttlSeconds: 86400,
        expiresAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockDb.company.findFirst.mockResolvedValue(mockCompany);
      mockGetChain.mockReturnValue(mockChain);
      mockOrchestrator.execute.mockResolvedValue(mockOutput);
      mockDb.enrichmentResult.findFirst.mockResolvedValue(mockResult);
      mockDb.enrichmentResult.updateMany.mockResolvedValue({ count: 1 });

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
      // Verify IDOR: company ownership checked with userId
      expect(mockDb.company.findFirst).toHaveBeenCalledWith({
        where: { id: "company-1", createdBy: "user-1" },
        select: { id: true, label: true },
      });
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.notAuthenticated");
    });

    it("returns error for invalid dimension", async () => {
      const result = await triggerEnrichment("company-1", "invalid" as any);

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.invalidDimension");
    });

    it("returns NOT_FOUND for company owned by another user (IDOR)", async () => {
      mockDb.company.findFirst.mockResolvedValue(null);

      const result = await triggerEnrichment("company-other", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.companyNotFound");
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("returns error when no chain available", async () => {
      mockDb.company.findFirst.mockResolvedValue({ id: "company-1", label: "Test" });
      mockGetChain.mockReturnValue(undefined);

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.noChainAvailable");
    });

    it("returns error when all modules fail", async () => {
      mockDb.company.findFirst.mockResolvedValue({ id: "company-1", label: "Test" });
      mockGetChain.mockReturnValue({
        dimension: "logo",
        entries: [{ moduleId: "logo_dev", priority: 1 }],
      });
      mockOrchestrator.execute.mockResolvedValue(null);

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.allModulesFailed");
    });

    it("returns rate limited error when rate limit exceeded", async () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, limit: 10, resetAt: 0 });

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.rateLimited");
      // Orchestrator should NOT have been called
      expect(mockOrchestrator.execute).not.toHaveBeenCalled();
    });

    it("returns concurrency error when max concurrent reached", async () => {
      // Fill the inflight map to max capacity for user-1
      const gInflight = globalThis as unknown as { __enrichmentInflight?: Map<string, number> };
      gInflight.__enrichmentInflight ??= new Map<string, number>();
      gInflight.__enrichmentInflight.set("user-1", ENRICHMENT_CONFIG.MAX_CONCURRENT_PER_USER);

      const result = await triggerEnrichment("company-1", "logo");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.tooManyConcurrent");
      // Orchestrator should NOT have been called
      expect(mockOrchestrator.execute).not.toHaveBeenCalled();

      // Clean up: remove inflight entry
      gInflight.__enrichmentInflight.delete("user-1");
    });
  });

  // =========================================================================
  // getEnrichmentStatus
  // =========================================================================
  describe("getEnrichmentStatus", () => {
    it("returns results for authenticated user's company", async () => {
      const mockResults = [
        {
          id: "r1", userId: "user-1", dimension: "logo", domainKey: "acme.com",
          companyId: "company-1", status: "found", data: "{}", sourceModuleId: "logo_dev",
          ttlSeconds: 86400, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
        },
      ];

      mockDb.company.findFirst.mockResolvedValue({ id: "company-1" });
      mockDb.enrichmentResult.findMany.mockResolvedValue(mockResults);

      const result = await getEnrichmentStatus("company-1");

      expect(result.success).toBe(true);
      expect(result.data).toHaveLength(1);
      expect(mockDb.enrichmentResult.findMany).toHaveBeenCalledWith({
        where: { userId: "user-1", companyId: "company-1" },
        orderBy: { updatedAt: "desc" },
      });
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getEnrichmentStatus("company-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.notAuthenticated");
    });

    it("returns NOT_FOUND for company owned by another user (IDOR)", async () => {
      mockDb.company.findFirst.mockResolvedValue(null);

      const result = await getEnrichmentStatus("company-other");

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });
  });

  // =========================================================================
  // getEnrichmentResult
  // =========================================================================
  describe("getEnrichmentResult", () => {
    it("returns result for authenticated user", async () => {
      const mockResult = {
        id: "r1", userId: "user-1", dimension: "logo", domainKey: "acme.com",
        companyId: "company-1", status: "found", data: "{}", sourceModuleId: "logo_dev",
        ttlSeconds: 86400, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      };
      mockDb.enrichmentResult.findFirst.mockResolvedValue(mockResult);

      const result = await getEnrichmentResult("logo", "acme.com");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockResult);
      // Verify userId is in query
      expect(mockDb.enrichmentResult.findFirst).toHaveBeenCalledWith({
        where: { userId: "user-1", dimension: "logo", domainKey: "acme.com" },
      });
    });

    it("returns null when no result exists", async () => {
      mockDb.enrichmentResult.findFirst.mockResolvedValue(null);

      const result = await getEnrichmentResult("logo", "unknown.com");

      expect(result.success).toBe(true);
      expect(result.data).toBeNull();
    });

    it("returns error for invalid dimension", async () => {
      const result = await getEnrichmentResult("bad_dim" as any, "acme.com");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.invalidDimension");
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getEnrichmentResult("logo", "acme.com");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.notAuthenticated");
    });
  });

  // =========================================================================
  // refreshEnrichment
  // =========================================================================
  describe("refreshEnrichment", () => {
    it("refreshes an existing result", async () => {
      const existingResult = {
        id: "r1", userId: "user-1", dimension: "logo", domainKey: "acme.com",
        companyId: "company-1", status: "found", data: "{}", sourceModuleId: "logo_dev",
        ttlSeconds: 86400, expiresAt: new Date(), createdAt: new Date(), updatedAt: new Date(),
      };
      const refreshedResult = { ...existingResult, updatedAt: new Date() };

      mockDb.enrichmentResult.findFirst
        .mockResolvedValueOnce(existingResult) // first call: existing
        .mockResolvedValueOnce(refreshedResult); // second call: refreshed
      mockGetChain.mockReturnValue({
        dimension: "logo",
        entries: [{ moduleId: "logo_dev", priority: 1 }],
      });
      mockOrchestrator.execute.mockResolvedValue({
        dimension: "logo", status: "found",
        data: { logoUrl: "https://new.logo" }, source: "logo_dev", ttl: 86400,
      });

      const result = await refreshEnrichment("r1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual(refreshedResult);
      // Verify IDOR: ownership checked
      expect(mockDb.enrichmentResult.findFirst).toHaveBeenCalledWith({
        where: { id: "r1", userId: "user-1" },
      });
    });

    it("returns NOT_FOUND for result owned by another user (IDOR)", async () => {
      mockDb.enrichmentResult.findFirst.mockResolvedValue(null);

      const result = await refreshEnrichment("r-other");

      expect(result.success).toBe(false);
      expect(result.errorCode).toBe("NOT_FOUND");
    });

    it("returns error for unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await refreshEnrichment("r1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.notAuthenticated");
    });

    it("respects rate limiting", async () => {
      mockCheckRateLimit.mockReturnValueOnce({ allowed: false, remaining: 0, limit: 10, resetAt: 0 });

      const result = await refreshEnrichment("r1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("enrichment.rateLimited");
      // DB lookup should NOT have happened (rate check is before DB query)
      expect(mockDb.enrichmentResult.findFirst).not.toHaveBeenCalled();
      // Orchestrator should NOT have been called
      expect(mockOrchestrator.execute).not.toHaveBeenCalled();
    });
  });
});
