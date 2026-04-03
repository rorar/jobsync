/**
 * Clearbit Logo Module — Unit Tests
 *
 * Tests the Clearbit Logo enrichment connector with mocked fetch.
 * No real network calls are made.
 */

import { createClearbitModule } from "@/lib/connector/data-enrichment/modules/clearbit";
import { ENRICHMENT_CONFIG } from "@/lib/connector/data-enrichment/types";
import type { EnrichmentInput } from "@/lib/connector/data-enrichment/types";

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

describe("ClearbitLogoModule", () => {
  const module = createClearbitModule();

  describe("successful enrichment", () => {
    it("returns logo URL when Clearbit responds with 200", async () => {
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
          logoUrl: "https://logo.clearbit.com/github.com",
          width: 128,
          format: "png",
        },
        source: "clearbit",
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
        "https://logo.clearbit.com/example.com",
        expect.objectContaining({ method: "HEAD" }),
      );
    });

    it("encodes special characters in the domain", async () => {
      mockFetch().mockResolvedValueOnce({ ok: true, status: 200 });

      await module.enrich({
        dimension: "logo",
        companyDomain: "ex ample.com",
      });

      expect(mockFetch()).toHaveBeenCalledWith(
        "https://logo.clearbit.com/ex%20ample.com",
        expect.anything(),
      );
    });
  });

  describe("not-found response", () => {
    it("returns not_found when Clearbit responds with 404", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 404 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "nonexistent-domain-xyz.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "not_found",
        data: {},
        source: "clearbit",
        ttl: 0,
      });
    });

    it("returns not_found when Clearbit responds with 500", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result.status).toBe("not_found");
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
        source: "clearbit",
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
        source: "clearbit",
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
        source: "clearbit",
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
        source: "clearbit",
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
