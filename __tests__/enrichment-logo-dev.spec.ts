/**
 * Logo.dev Module — Unit Tests
 *
 * Tests the Logo.dev enrichment connector with mocked fetch.
 * No real network calls are made.
 */

import { createLogoDevModule } from "@/lib/connector/data-enrichment/modules/logo-dev";
import { ENRICHMENT_CONFIG } from "@/lib/connector/data-enrichment/types";
import type { EnrichmentInput } from "@/lib/connector/data-enrichment/types";

// Mock the resilience policy to pass-through (unit tests focus on module logic, not Cockatiel)
jest.mock("@/lib/connector/data-enrichment/modules/logo-dev/resilience", () => ({
  logoDevPolicy: {
    execute: <T>(fn: (ctx: { signal: AbortSignal }) => Promise<T>) =>
      fn({ signal: new AbortController().signal }),
  },
}));

const originalFetch = globalThis.fetch;

beforeEach(() => {
  globalThis.fetch = jest.fn();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function mockFetch() {
  return globalThis.fetch as jest.Mock;
}

describe("LogoDevModule", () => {
  const apiKey = "test-logo-dev-key";
  const module = createLogoDevModule(apiKey);

  describe("successful enrichment", () => {
    it("returns logo URL when Logo.dev responds with 200", async () => {
      mockFetch().mockResolvedValueOnce({ ok: true, status: 200 });

      const input: EnrichmentInput = {
        dimension: "logo",
        companyDomain: "github.com",
      };

      const result = await module.enrich(input);

      expect(result).toEqual({
        dimension: "logo",
        status: "found",
        data: {
          logoUrl: "https://img.logo.dev/github.com?format=png",
          format: "png",
        },
        source: "logo_dev",
        ttl: ENRICHMENT_CONFIG.LOGO_TTL_SECONDS,
      });
    });

    it("sends a HEAD request to the correct URL", async () => {
      mockFetch().mockResolvedValueOnce({ ok: true, status: 200 });

      await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(mockFetch()).toHaveBeenCalledTimes(1);
      expect(mockFetch()).toHaveBeenCalledWith(
        `https://img.logo.dev/example.com?token=${apiKey}&format=png`,
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("rejects domains with special characters via domain validation", async () => {
      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "ex ample.com",
      });

      expect(result.status).toBe("not_found");
      expect(mockFetch()).not.toHaveBeenCalled();
    });
  });

  describe("without apiKey", () => {
    it("returns not_found when no API key is provided", async () => {
      const noKeyModule = createLogoDevModule();

      const result = await noKeyModule.enrich({
        dimension: "logo",
        companyDomain: "github.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "not_found",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });

      expect(mockFetch()).not.toHaveBeenCalled();
    });
  });

  describe("not-found response", () => {
    it("returns not_found when Logo.dev responds with 404", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "nonexistent-domain-xyz.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "not_found",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });
    });

    it("returns not_found when Logo.dev responds with 500", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.status).toBe("not_found");
    });

    it("returns not_found when Logo.dev responds with 401", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 401 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.status).toBe("not_found");
      expect(result.source).toBe("logo_dev");
    });

    it("returns not_found when Logo.dev responds with 403", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 403 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.status).toBe("not_found");
      expect(result.source).toBe("logo_dev");
    });
  });

  describe("error handling", () => {
    it("returns error when domain is undefined", async () => {
      const result = await module.enrich({
        dimension: "logo",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "error",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });

      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error when domain is empty string", async () => {
      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "error",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });

      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error when fetch throws a network error", async () => {
      mockFetch().mockRejectedValueOnce(new Error("Network error"));

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "error",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });
    });

    it("returns error when fetch times out", async () => {
      mockFetch().mockRejectedValueOnce(
        new DOMException("Aborted", "AbortError"),
      );

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "slow-domain.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "error",
        data: {},
        source: "logo_dev",
        ttl: 0,
      });
    });
  });

  describe("TTL values", () => {
    it("uses 30-day TTL for found logos", async () => {
      mockFetch().mockResolvedValueOnce({ ok: true, status: 200 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.ttl).toBe(30 * 24 * 60 * 60);
    });

    it("uses 0 TTL for not-found results", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.ttl).toBe(0);
    });

    it("uses 0 TTL for error results", async () => {
      mockFetch().mockRejectedValueOnce(new Error("fail"));

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.ttl).toBe(0);
    });
  });
});
