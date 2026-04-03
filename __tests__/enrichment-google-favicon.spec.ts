/**
 * Google Favicon Module — Unit Tests
 *
 * Tests the Google Favicon enrichment connector with mocked fetch.
 * No real network calls are made.
 */

import { createGoogleFaviconModule } from "@/lib/connector/data-enrichment/modules/google-favicon";
import { ENRICHMENT_CONFIG } from "@/lib/connector/data-enrichment/types";
import type { EnrichmentInput } from "@/lib/connector/data-enrichment/types";

// Mock the resilience policy to pass-through (unit tests focus on module logic, not Cockatiel)
jest.mock("@/lib/connector/data-enrichment/modules/google-favicon/resilience", () => ({
  googleFaviconPolicy: {
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

describe("GoogleFaviconModule", () => {
  const module = createGoogleFaviconModule();

  describe("successful enrichment", () => {
    it("returns favicon URL when Google responds with 200", async () => {
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
          logoUrl:
            "https://www.google.com/s2/favicons?domain=github.com&sz=128",
          format: "png",
        },
        source: "google_favicon",
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
        "https://www.google.com/s2/favicons?domain=example.com&sz=128",
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
        "https://www.google.com/s2/favicons?domain=ex%20ample.com&sz=128",
        expect.anything(),
      );
    });
  });

  describe("not-found response", () => {
    it("returns not_found when Google responds with non-OK status", async () => {
      mockFetch().mockResolvedValueOnce({ ok: false, status: 500 });

      const result = await module.enrich({
        dimension: "logo",
        companyDomain: "example.com",
      });

      expect(result).toEqual({
        dimension: "logo",
        status: "not_found",
        data: {},
        source: "google_favicon",
        ttl: 0,
      });
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
        source: "google_favicon",
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
        source: "google_favicon",
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
        source: "google_favicon",
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
        source: "google_favicon",
        ttl: 0,
      });
    });
  });

  describe("TTL values", () => {
    it("uses 30-day TTL for found favicons", async () => {
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
