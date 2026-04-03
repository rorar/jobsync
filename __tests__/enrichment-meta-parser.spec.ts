/**
 * Meta/OpenGraph Parser Module — Unit Tests
 *
 * Tests the Meta Parser enrichment connector with mocked fetch.
 * No real network calls are made. Includes SSRF protection tests.
 */

import {
  createMetaParserModule,
  isValidExternalUrl,
} from "@/lib/connector/data-enrichment/modules/meta-parser";
import { ENRICHMENT_CONFIG } from "@/lib/connector/data-enrichment/types";

// Mock the resilience policy to pass-through (unit tests focus on module logic, not Cockatiel)
jest.mock("@/lib/connector/data-enrichment/modules/meta-parser/resilience", () => ({
  metaParserPolicy: {
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

// Helper to create a ReadableStream from a string (for incremental body reading)
function stringToReadableStream(str: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const encoded = encoder.encode(str);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

// Helper to create a mock fetch response with HTML body
function htmlResponse(html: string, ok = true, status = 200) {
  return {
    ok,
    status,
    headers: new Headers(),
    body: stringToReadableStream(html),
  };
}

describe("MetaParserModule", () => {
  const module = createMetaParserModule();

  describe("successful enrichment", () => {
    it("extracts OpenGraph tags from a well-formed page", async () => {
      const html = `
        <html>
        <head>
          <meta property="og:title" content="Software Engineer at Acme Corp">
          <meta property="og:description" content="Join our team building amazing products">
          <meta property="og:image" content="https://acme.com/og-image.png">
          <meta property="og:site_name" content="Acme Careers">
          <title>Software Engineer - Acme Corp</title>
        </head>
        <body></body>
        </html>
      `;

      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://acme.com/jobs/123",
      });

      expect(result.status).toBe("found");
      expect(result.dimension).toBe("deep_link");
      expect(result.source).toBe("meta_parser");
      expect(result.data).toEqual(
        expect.objectContaining({
          title: "Software Engineer at Acme Corp",
          description: "Join our team building amazing products",
          image: "https://acme.com/og-image.png",
          siteName: "Acme Careers",
        }),
      );
    });

    it("falls back to standard meta tags when OG tags are absent", async () => {
      const html = `
        <html>
        <head>
          <title>Job Listing - MyCompany</title>
          <meta name="description" content="A great job opportunity">
        </head>
        <body></body>
        </html>
      `;

      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://mycompany.com/job",
      });

      expect(result.status).toBe("found");
      expect(result.data).toEqual(
        expect.objectContaining({
          title: "Job Listing - MyCompany",
          description: "A great job opportunity",
        }),
      );
    });

    it("extracts favicon from link tags", async () => {
      const html = `
        <html>
        <head>
          <title>Test Page</title>
          <link rel="icon" href="/favicon.ico">
        </head>
        <body></body>
        </html>
      `;

      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/page",
      });

      expect(result.status).toBe("found");
      expect(result.data).toEqual(
        expect.objectContaining({
          title: "Test Page",
          favicon: "/favicon.ico",
        }),
      );
    });

    it("handles meta tags with content attribute before property", async () => {
      const html = `
        <html>
        <head>
          <meta content="Reversed Order Title" property="og:title">
          <meta content="Reversed description" property="og:description">
        </head>
        <body></body>
        </html>
      `;

      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/reversed",
      });

      expect(result.status).toBe("found");
      expect(result.data).toEqual(
        expect.objectContaining({
          title: "Reversed Order Title",
          description: "Reversed description",
        }),
      );
    });

    it("sends correct headers including User-Agent", async () => {
      const html =
        '<html><head><title>Test</title></head><body></body></html>';
      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/page",
      });

      expect(mockFetch()).toHaveBeenCalledWith(
        "https://example.com/page",
        expect.objectContaining({
          headers: { "User-Agent": "JobSync/1.0 (Link Preview)" },
          redirect: "manual",
        }),
      );
    });
  });

  describe("not-found response", () => {
    it("returns not_found when server responds with 404", async () => {
      mockFetch().mockResolvedValueOnce(htmlResponse("", false, 404));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/missing",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "not_found",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });
    });

    it("returns not_found when page has no extractable meta tags", async () => {
      const html =
        "<html><head></head><body>No meta tags here</body></html>";
      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/empty",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "not_found",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });
    });

    it("returns not_found when server responds with 500", async () => {
      mockFetch().mockResolvedValueOnce(htmlResponse("", false, 500));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/error",
      });

      expect(result.status).toBe("not_found");
    });
  });

  describe("error handling", () => {
    it("returns error when URL is undefined", async () => {
      const result = await module.enrich({
        dimension: "deep_link",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "error",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });

      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error when URL is empty string", async () => {
      const result = await module.enrich({
        dimension: "deep_link",
        url: "",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "error",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });

      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error when fetch throws a network error", async () => {
      mockFetch().mockRejectedValueOnce(new Error("Network error"));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/page",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "error",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });
    });

    it("returns error when fetch times out", async () => {
      mockFetch().mockRejectedValueOnce(
        new DOMException("Aborted", "AbortError"),
      );

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://slow-site.com/page",
      });

      expect(result).toEqual({
        dimension: "deep_link",
        status: "error",
        data: {},
        source: "meta_parser",
        ttl: 0,
      });
    });

    it("returns error for SSRF attempt (internal IP)", async () => {
      const result = await module.enrich({
        dimension: "deep_link",
        url: "http://192.168.1.1/admin",
      });

      expect(result.status).toBe("error");
      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error for SSRF attempt (localhost)", async () => {
      const result = await module.enrich({
        dimension: "deep_link",
        url: "http://localhost/admin",
      });

      expect(result.status).toBe("error");
      expect(mockFetch()).not.toHaveBeenCalled();
    });

    it("returns error for non-HTTP protocol", async () => {
      const result = await module.enrich({
        dimension: "deep_link",
        url: "file:///etc/passwd",
      });

      expect(result.status).toBe("error");
      expect(mockFetch()).not.toHaveBeenCalled();
    });
  });

  describe("HTML truncation", () => {
    it("only parses the first 100KB of HTML", async () => {
      // Create HTML where the OG title is in the first 100KB
      // and another tag is beyond 100KB
      const earlyMeta =
        '<html><head><meta property="og:title" content="Early Title">';
      const padding = "x".repeat(110_000);
      const lateMeta =
        '<meta property="og:description" content="Late Description"></head><body></body></html>';
      const html = earlyMeta + padding + lateMeta;

      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/large-page",
      });

      expect(result.status).toBe("found");
      // The early title should be found
      expect(result.data).toEqual(
        expect.objectContaining({
          title: "Early Title",
        }),
      );
      // The late description should NOT be found (truncated beyond 100KB)
      expect(
        (result.data as Record<string, unknown>).description,
      ).toBeUndefined();
    });
  });

  describe("TTL values", () => {
    it("uses 7-day TTL for found results", async () => {
      const html =
        '<html><head><title>Test</title></head><body></body></html>';
      mockFetch().mockResolvedValueOnce(htmlResponse(html));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/page",
      });

      expect(result.ttl).toBe(7 * 24 * 60 * 60);
    });

    it("uses 0 TTL for not-found results", async () => {
      mockFetch().mockResolvedValueOnce(htmlResponse("", false, 404));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/missing",
      });

      expect(result.ttl).toBe(0);
    });

    it("uses 0 TTL for error results", async () => {
      mockFetch().mockRejectedValueOnce(new Error("fail"));

      const result = await module.enrich({
        dimension: "deep_link",
        url: "https://example.com/page",
      });

      expect(result.ttl).toBe(0);
    });
  });
});

describe("isValidExternalUrl — SSRF protection", () => {
  describe("allowed URLs", () => {
    it("allows standard HTTPS URLs", () => {
      expect(isValidExternalUrl("https://example.com/jobs/123")).toBe(true);
    });

    it("allows standard HTTP URLs", () => {
      expect(isValidExternalUrl("http://example.com/page")).toBe(true);
    });

    it("allows URLs with ports", () => {
      expect(isValidExternalUrl("https://example.com:8080/path")).toBe(true);
    });

    it("allows URLs with query params", () => {
      expect(isValidExternalUrl("https://example.com?q=test")).toBe(true);
    });

    it("allows URLs with subdomains", () => {
      expect(isValidExternalUrl("https://careers.acme.com/job/123")).toBe(
        true,
      );
    });
  });

  describe("blocked protocols", () => {
    it("blocks file:// protocol", () => {
      expect(isValidExternalUrl("file:///etc/passwd")).toBe(false);
    });

    it("blocks ftp:// protocol", () => {
      expect(isValidExternalUrl("ftp://internal.server/file")).toBe(false);
    });

    it("blocks javascript: protocol", () => {
      expect(isValidExternalUrl("javascript:alert(1)")).toBe(false);
    });

    it("blocks data: URI", () => {
      expect(isValidExternalUrl("data:text/html,<h1>SSRF</h1>")).toBe(false);
    });

    it("blocks gopher: protocol", () => {
      expect(isValidExternalUrl("gopher://evil.com")).toBe(false);
    });
  });

  describe("blocked private/internal IPs", () => {
    it("blocks localhost", () => {
      expect(isValidExternalUrl("http://localhost/admin")).toBe(false);
    });

    it("blocks 127.0.0.1", () => {
      expect(isValidExternalUrl("http://127.0.0.1/admin")).toBe(false);
    });

    it("blocks ::1 (IPv6 loopback)", () => {
      expect(isValidExternalUrl("http://[::1]/admin")).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(isValidExternalUrl("http://0.0.0.0/admin")).toBe(false);
    });

    it("blocks 10.x.x.x (private range)", () => {
      expect(isValidExternalUrl("http://10.0.0.1/internal")).toBe(false);
    });

    it("blocks 10.255.255.255 (private range end)", () => {
      expect(isValidExternalUrl("http://10.255.255.255/internal")).toBe(false);
    });

    it("blocks 172.16.x.x (private range)", () => {
      expect(isValidExternalUrl("http://172.16.0.1/internal")).toBe(false);
    });

    it("blocks 172.31.x.x (private range end)", () => {
      expect(isValidExternalUrl("http://172.31.255.255/internal")).toBe(false);
    });

    it("allows 172.15.x.x (not private)", () => {
      expect(isValidExternalUrl("http://172.15.0.1/page")).toBe(true);
    });

    it("allows 172.32.x.x (not private)", () => {
      expect(isValidExternalUrl("http://172.32.0.1/page")).toBe(true);
    });

    it("blocks 192.168.x.x (private range)", () => {
      expect(isValidExternalUrl("http://192.168.1.1/admin")).toBe(false);
    });

    it("blocks 169.254.x.x (link-local)", () => {
      expect(isValidExternalUrl("http://169.254.1.1/metadata")).toBe(false);
    });
  });

  describe("blocked cloud metadata endpoints", () => {
    it("blocks AWS/Azure IMDS (169.254.169.254)", () => {
      expect(
        isValidExternalUrl("http://169.254.169.254/latest/meta-data/"),
      ).toBe(false);
    });

    it("blocks GCP metadata server", () => {
      expect(
        isValidExternalUrl(
          "http://metadata.google.internal/computeMetadata/v1/",
        ),
      ).toBe(false);
    });
  });

  describe("blocked credentials in URL", () => {
    it("blocks URLs with username and password", () => {
      expect(isValidExternalUrl("http://user:pass@example.com")).toBe(false);
    });

    it("blocks URLs with username only", () => {
      expect(isValidExternalUrl("http://admin@example.com")).toBe(false);
    });
  });

  describe("invalid URLs", () => {
    it("rejects malformed URLs", () => {
      expect(isValidExternalUrl("not-a-url")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(isValidExternalUrl("")).toBe(false);
    });
  });
});
