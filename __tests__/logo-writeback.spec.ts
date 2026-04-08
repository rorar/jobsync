import { applyLogoWriteback } from "@/lib/connector/data-enrichment/logo-writeback";
import type { EnrichmentOutput } from "@/lib/connector/data-enrichment/types";

// Mock Prisma client
const mockUpdateMany = jest.fn();
const mockDb = {
  company: {
    updateMany: mockUpdateMany,
  },
} as any;

describe("applyLogoWriteback", () => {
  const userId = "user-1";
  const companyId = "company-1";

  beforeEach(() => {
    jest.clearAllMocks();
  });

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

  it("writes logoUrl when data is an object with logoUrl", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://img.logo.dev/example.com" },
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
      data: { logoUrl: "https://img.logo.dev/example.com" },
    });
  });

  it("writes logoUrl when data is a JSON string", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: JSON.stringify({ logoUrl: "https://img.logo.dev/example.com" }) as unknown as Record<string, unknown>,
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
      data: { logoUrl: "https://img.logo.dev/example.com" },
    });
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

  it("uses IDOR protection (createdBy: userId, logoUrl: null guard)", async () => {
    const output: EnrichmentOutput = {
      dimension: "logo",
      status: "found",
      data: { logoUrl: "https://img.logo.dev/example.com" },
      source: "logo_dev",
      ttl: 86400,
    };

    await applyLogoWriteback(mockDb, userId, companyId, output);

    expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    const callArgs = mockUpdateMany.mock.calls[0][0];
    // Verify IDOR: createdBy must match userId
    expect(callArgs.where.createdBy).toBe(userId);
    // Verify null guard: only update if logoUrl is currently null
    expect(callArgs.where.logoUrl).toBeNull();
  });
});
