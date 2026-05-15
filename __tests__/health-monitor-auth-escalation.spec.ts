/**
 * Health Monitor Tests — Auth Detection + Escalation Boundary
 *
 * CR-1 FIX: Health probes detect 401/403 (isAuthFailure diagnostic) but
 * do NOT call handleAuthFailure. Spec: HealthStatusEscalation is
 * notification-only. AuthFailureEscalation fires on actual operations.
 *
 * Also covers: HM-2 (UNREACHABLE threshold), HM-3 (missing credential),
 * HM-4 (module not found/active), HM-5 (blocked URL), HM-6 (DB failure).
 */

// Mock degradation BEFORE imports
const mockHandleAuthFailure = jest.fn().mockResolvedValue({ pausedCount: 0 });
jest.mock("@/lib/connector/degradation", () => ({
  handleAuthFailure: (...args: unknown[]) => mockHandleAuthFailure(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    moduleRegistration: {
      upsert: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/url-validation", () => ({
  isBlockedHealthCheckUrl: jest.fn(() => false),
}));

const mockRegistryGet = jest.fn();
const mockRegistryUpdateHealth = jest.fn();
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: {
    get: (...args: unknown[]) => mockRegistryGet(...args),
    updateHealth: (...args: unknown[]) => mockRegistryUpdateHealth(...args),
  },
}));

jest.mock("server-only", () => ({}));

import { checkModuleHealth } from "@/lib/connector/health-monitor";
import { HealthStatus, ModuleStatus, CredentialType } from "@/lib/connector/manifest";
import prisma from "@/lib/db";

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

describe("Health Monitor — Auth Detection Boundary", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    delete process.env.OPENAI_API_KEY;
  });

  // ── CR-1: Health probes do NOT trigger handleAuthFailure ───────────

  it("does NOT call handleAuthFailure on 401 (spec: HealthStatusEscalation is notification-only)", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401, statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(result.error).toContain("401");
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure on 403", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 403, statusText: "Forbidden",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure on 500", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, statusText: "Internal Server Error",
    }) as jest.Mock;

    await checkModuleHealth("openai");
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure on success (200)", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
    }) as jest.Mock;

    await checkModuleHealth("openai");
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("does NOT call handleAuthFailure on network error", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockRejectedValue(new Error("ECONNREFUSED")) as jest.Mock;

    await checkModuleHealth("openai");
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  // ── Health status transitions ─────────────────────────────────────

  it("sets DEGRADED on first auth failure (401)", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 401, statusText: "Unauthorized",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
    expect(mockRegistryUpdateHealth).toHaveBeenCalledWith(
      "openai", HealthStatus.DEGRADED, expect.any(Date), undefined, 1,
    );
  });

  // ── HM-2: UNREACHABLE threshold boundary ──────────────────────────

  it("stays DEGRADED below MAX_FAILURES_BEFORE_UNREACHABLE threshold", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered({
      healthStatus: HealthStatus.DEGRADED,
      consecutiveFailures: 1,
    }));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, statusText: "Server Error",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.healthStatus).toBe(HealthStatus.DEGRADED);
  });

  it("transitions to UNREACHABLE at MAX_FAILURES_BEFORE_UNREACHABLE (3)", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered({
      healthStatus: HealthStatus.DEGRADED,
      consecutiveFailures: 2,
    }));
    global.fetch = jest.fn().mockResolvedValue({
      ok: false, status: 500, statusText: "Server Error",
    }) as jest.Mock;

    const result = await checkModuleHealth("openai");

    expect(result.healthStatus).toBe(HealthStatus.UNREACHABLE);
  });

  // ── HM-3: Missing credential early return ─────────────────────────

  it("returns UNKNOWN and skips probe when env credential is missing", async () => {
    delete process.env.OPENAI_API_KEY;
    mockRegistryGet.mockReturnValue(makeRegistered());

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
    expect(result.error).toContain("No credential configured");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  // ── HM-4: Module not found / not active ───────────────────────────

  it("returns UNKNOWN when module is not registered", async () => {
    mockRegistryGet.mockReturnValue(undefined);

    const result = await checkModuleHealth("nonexistent");

    expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  it("returns UNKNOWN when module is not ACTIVE", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered({ status: ModuleStatus.INACTIVE }));

    const result = await checkModuleHealth("openai");

    expect(result.healthStatus).toBe(HealthStatus.UNKNOWN);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  // ── HM-5: Blocked health check URL ────────────────────────────────

  it("does NOT call handleAuthFailure when health check URL is blocked", async () => {
    const { isBlockedHealthCheckUrl } = jest.requireMock("@/lib/url-validation");
    (isBlockedHealthCheckUrl as jest.Mock).mockReturnValueOnce(true);
    mockRegistryGet.mockReturnValue(makeRegistered());

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(false);
    expect(mockHandleAuthFailure).not.toHaveBeenCalled();
  });

  // ── HM-6: DB persistence failure swallowed ────────────────────────

  it("returns result even when DB upsert fails", async () => {
    mockRegistryGet.mockReturnValue(makeRegistered());
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, statusText: "OK",
    }) as jest.Mock;
    (prisma.moduleRegistration.upsert as jest.Mock).mockRejectedValueOnce(new Error("DB down"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    const result = await checkModuleHealth("openai");

    expect(result.success).toBe(true);
    expect(result.healthStatus).toBe(HealthStatus.HEALTHY);
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Failed to persist health status"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });
});
