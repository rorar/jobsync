/**
 * Health Monitor Auth Escalation Tests (BS-G2b-2)
 *
 * Verifies that health checks detecting 401/403 trigger handleAuthFailure()
 * to pause affected automations per Allium spec AuthFailureEscalation.
 */

// Mock degradation BEFORE imports
const mockHandleAuthFailure = jest.fn().mockResolvedValue({ pausedCount: 0 });
jest.mock("@/lib/connector/degradation", () => ({
  handleAuthFailure: (...args: unknown[]) => mockHandleAuthFailure(...args),
}));

// Mock DB
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    moduleRegistration: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  },
}));

// Mock url-validation
jest.mock("@/lib/url-validation", () => ({
  isBlockedHealthCheckUrl: jest.fn(() => false),
}));

// Mock registry
const mockRegistryGet = jest.fn();
const mockRegistryUpdateHealth = jest.fn();
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    get: (...args: unknown[]) => mockRegistryGet(...args),
    updateHealth: (...args: unknown[]) => mockRegistryUpdateHealth(...args),
  },
}));

// Mock server-only
jest.mock("server-only", () => ({}));

import { checkModuleHealth } from "@/lib/connector/health-monitor";
import { HealthStatus, ModuleStatus, CredentialType } from "@/lib/connector/manifest";

function makeRegistered(overrides: Record<string, unknown> = {}) {
  return {
    manifest: {
      id: "openai",
      connectorType: "ai_provider",
      credential: { type: CredentialType.API_KEY, required: true, envFallback: "OPENAI_API_KEY" },
      healthCheck: { endpoint: "https://api.openai.com/v1/models", timeoutMs: 5000 },
      dependencies: [],
      ...((overrides.manifest as Record<string, unknown>) ?? {}),
    },
    status: ModuleStatus.ACTIVE,
    healthStatus: HealthStatus.HEALTHY,
    consecutiveFailures: 0,
    ...overrides,
  };
}

describe("Health Monitor Auth Escalation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Set env var so health check doesn't skip
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  it("calls handleAuthFailure when health check returns 401", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
    expect(mockHandleAuthFailure).toHaveBeenCalledWith(
      "openai",
      expect.stringContaining("401"),
    );
  });

  it("calls handleAuthFailure when health check returns 403", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(mockHandleAuthFailure).toHaveBeenCalledWith(
      "openai",
      expect.stringContaining("403"),
    );
  });

  it("does NOT call handleAuthFailure for non-auth failures (500)", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure for successful health check", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(true);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure for network errors", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("swallows handleAuthFailure errors (fire-and-forget)", async () => {
    mockHandleAuthFailure.mockRejectedValueOnce(new Error("DB down"));
    mockRegistryGet.mockReturnValue(makeRegistered());
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as jest.Mock;

    // Should not throw despite handleAuthFailure rejecting
    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    // Give fire-and-forget time to settle
    await new Promise((r) => setTimeout(r, 50));
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("handleAuthFailure failed"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("sets health status to DEGRADED on first auth failure", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
    expect(mockRegistryUpdateHealth).toHaveBeenCalledWith(
      "openai",
      HealthStatus.DEGRADED,
      expect.any(Date),
      undefined,
      1,
    );
  });
});
