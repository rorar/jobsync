/**
 * Dependency Health Degradation — Unit Tests
 *
 * Spec: module-lifecycle.allium, rule DependencyHealthDegradation
 * "A failed dependency can degrade the parent but NEVER make it unreachable"
 */

import { checkDependencyHealth } from "@/lib/connector/health-monitor";
import { HealthStatus, type DependencyHealthCheck } from "@/lib/connector/manifest";

// Polyfill AbortSignal.timeout for jsdom test environment
if (typeof AbortSignal.timeout !== "function") {
  (AbortSignal as unknown as Record<string, unknown>).timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  };
}

// Mock server-only (health-monitor imports it)
jest.mock("server-only", () => ({}));

// Mock prisma (health-monitor imports it)
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {},
}));

// Mock registry (health-monitor imports it)
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { get: jest.fn(), updateHealth: jest.fn() },
}));

// Mock url-validation (health-monitor imports it)
jest.mock("@/lib/url-validation", () => ({
  isBlockedHealthCheckUrl: jest.fn().mockReturnValue(false),
}));

// Mock fetch globally — reassign in beforeEach to ensure clean state
const mockFetch = jest.fn();
beforeAll(() => {
  global.fetch = mockFetch as unknown as typeof fetch;
});

const deps: DependencyHealthCheck[] = [
  {
    id: "esco_classification",
    name: "ESCO",
    endpoint: "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
    timeoutMs: 5000,
    required: false,
    usedFor: "test",
  },
  {
    id: "eurostat_nuts",
    name: "Eurostat",
    endpoint: "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
    timeoutMs: 5000,
    required: false,
    usedFor: "test",
  },
];

describe("checkDependencyHealth", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns healthy when all dependencies respond OK", async () => {
    mockFetch.mockResolvedValue({ ok: true });

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.results).toHaveLength(2);
    expect(result.results.every((r) => r.success)).toBe(true);
  });

  it("returns degraded when one dependency fails", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, status: 503, statusText: "Unavailable" });

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.results[0].success).toBe(true);
    expect(result.results[1].success).toBe(false);
  });

  it("returns degraded when all dependencies fail — never unreachable", async () => {
    mockFetch.mockResolvedValue({ ok: false, status: 500, statusText: "Error" });

    const result = await checkDependencyHealth(deps);

    // Still DEGRADED, never UNREACHABLE — spec rule
    expect(result.status).toBe(HealthStatus.DEGRADED);
    expect(result.status).not.toBe(HealthStatus.UNREACHABLE);
  });

  it("returns healthy when dependencies array is empty", async () => {
    const result = await checkDependencyHealth([]);

    expect(result.status).toBe(HealthStatus.HEALTHY);
    expect(result.results).toHaveLength(0);
  });

  it("handles fetch timeout as failure", async () => {
    mockFetch.mockRejectedValue(new Error("AbortError"));

    const result = await checkDependencyHealth(deps);

    expect(result.status).toBe(HealthStatus.DEGRADED);
  });

  it("returns per-dependency results with id and error", async () => {
    mockFetch
      .mockResolvedValueOnce({ ok: true })
      .mockRejectedValueOnce(new Error("Network error"));

    const result = await checkDependencyHealth(deps);

    expect(result.results[0]).toMatchObject({ id: "esco_classification", success: true });
    expect(result.results[1]).toMatchObject({ id: "eurostat_nuts", success: false, error: "Network error" });
  });
});
