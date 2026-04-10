/**
 * Meta/OpenGraph Parser Module — Connector Implementation
 *
 * Fetches a URL server-side and extracts OpenGraph + standard meta tags
 * to produce structured DeepLinkData. Includes SSRF protection to block
 * internal/private IP addresses and non-HTTP protocols.
 *
 * Security: Only allows http:// and https:// protocols. Blocks private IPs,
 * loopback addresses, link-local addresses, and cloud metadata endpoints.
 */

import type {
  DataEnrichmentConnector,
  EnrichmentInput,
  EnrichmentOutput,
  DeepLinkData,
} from "../../types";
import { ENRICHMENT_CONFIG } from "../../types";
import { metaParserPolicy } from "./resilience";
import { moduleRegistry } from "@/lib/connector/registry";
import { metaParserManifest } from "./manifest";
import { validateWebhookUrl } from "@/lib/url-validation";

/** Maximum HTML size to parse (100KB) to prevent memory issues */
const MAX_HTML_SIZE = 100_000;

/**
 * Validates that a URL is safe for server-side fetching.
 *
 * Delegates to validateWebhookUrl — the canonical SSRF validator in
 * src/lib/url-validation.ts — so both functions always cover the same
 * blocked ranges. Previously this file maintained a divergent local
 * allowlist that was missing: CGNAT (100.64.0.0/10), 192.0.0.0/24,
 * 198.18.0.0/15, 240.0.0.0/4, IPv4-mapped IPv6 (::ffff:*), and the
 * full 127.0.0.0/8 range (only blocked 127.0.0.1 exactly).
 *
 * Blocks (per validateWebhookUrl):
 * - Non-HTTP protocols (file://, ftp://, javascript:, data:, etc.)
 * - Private/internal IP ranges (10.x, 172.16-31.x, 192.168.x)
 * - Loopback addresses (127.x/8, localhost, ::1)
 * - Link-local addresses (169.254.x, fe80::/10)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 * - CGNAT (100.64.0.0/10, RFC 6598)
 * - IETF Protocol Assignments (192.0.0.0/24, RFC 6890)
 * - Benchmarking (198.18.0.0/15, RFC 2544)
 * - Reserved/Future (240.0.0.0/4, RFC 1112)
 * - IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
 * - IPv6 unique-local (fc00::/7) and link-local (fe80::/10)
 * - URLs with embedded credentials
 */
export function isValidExternalUrl(url: string): boolean {
  return validateWebhookUrl(url).valid;
}

/**
 * Maximum number of redirects to follow manually (SSRF: Fix 1).
 * Prevents redirect loops while still supporting standard redirect chains.
 */
const MAX_REDIRECTS = 5;

/**
 * Sanitizes a meta tag value to prevent XSS.
 * Strips HTML tags, javascript: URIs, and event handlers.
 */
function sanitizeMetaValue(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")       // Strip HTML tags
    .replace(/javascript:/gi, "")   // Remove javascript: URIs
    .replace(/on\w+=/gi, "")        // Remove event handlers
    .trim()
    .slice(0, 1000);                // Max length
}

/**
 * Validates that an image/favicon URL is safe.
 * Allows http://, https://, and relative paths (starting with /).
 * Blocks javascript:, data:, and other dangerous protocols.
 */
function isValidImageUrl(url: string): boolean {
  // Allow relative paths (common for favicons)
  if (url.startsWith("/") && !url.startsWith("//")) {
    return true;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Reads the response body incrementally up to MAX_HTML_SIZE bytes.
 * Aborts the stream once the limit is reached to prevent memory DoS.
 */
async function readBodyWithLimit(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let html = "";
  try {
    while (html.length < MAX_HTML_SIZE) {
      const { done, value } = await reader.read();
      if (done) break;
      html += decoder.decode(value, { stream: true });
    }
  } finally {
    reader.cancel();
  }
  return html.slice(0, MAX_HTML_SIZE);
}

/**
 * Extracts a meta tag content value from HTML.
 *
 * Handles both `content="value"` before and after the attribute selector.
 * Example: `<meta property="og:title" content="My Page">`
 * Example: `<meta content="My Page" property="og:title">`
 */
function extractMeta(html: string, attr: string): string | null {
  // Pattern 1: attr comes before content
  const regex1 = new RegExp(
    `<meta[^>]*${attr}[^>]*content=["']([^"']*)["']`,
    "i",
  );
  const match1 = html.match(regex1);
  if (match1?.[1]) return match1[1];

  // Pattern 2: content comes before attr
  const regex2 = new RegExp(
    `<meta[^>]*content=["']([^"']*?)["'][^>]*${attr}`,
    "i",
  );
  const match2 = html.match(regex2);
  return match2?.[1] || null;
}

/**
 * Extracts the text content of an HTML tag.
 * Example: `<title>My Page</title>` -> "My Page"
 */
function extractTag(html: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i");
  const match = html.match(regex);
  return match?.[1]?.trim() || null;
}

/**
 * Parses OpenGraph and standard meta tags from HTML.
 */
function parseMetaTags(html: string): DeepLinkData {
  const ogTitle =
    extractMeta(html, 'property="og:title"') || extractTag(html, "title");
  const ogDesc =
    extractMeta(html, 'property="og:description"') ||
    extractMeta(html, 'name="description"');
  const ogImage = extractMeta(html, 'property="og:image"');
  const ogSiteName = extractMeta(html, 'property="og:site_name"');
  const favicon = extractFavicon(html);

  // Sanitize all extracted values to prevent XSS (Fix 7)
  const sanitizedImage = ogImage ? sanitizeMetaValue(ogImage) : undefined;
  const sanitizedFavicon = favicon ? sanitizeMetaValue(favicon) : undefined;

  return {
    title: ogTitle ? sanitizeMetaValue(ogTitle) : undefined,
    description: ogDesc ? sanitizeMetaValue(ogDesc) : undefined,
    image: sanitizedImage && isValidImageUrl(sanitizedImage) ? sanitizedImage : undefined,
    siteName: ogSiteName ? sanitizeMetaValue(ogSiteName) : undefined,
    favicon: sanitizedFavicon && isValidImageUrl(sanitizedFavicon) ? sanitizedFavicon : undefined,
  };
}

/**
 * Extracts the favicon URL from HTML link tags.
 * Looks for `<link rel="icon" href="...">` or `<link rel="shortcut icon" href="...">`.
 */
function extractFavicon(html: string): string | null {
  const regex =
    /<link[^>]*rel=["'](?:shortcut )?icon["'][^>]*href=["']([^"']*)["']/i;
  const match = html.match(regex);
  if (match?.[1]) return match[1];

  // Reverse order: href before rel
  const regex2 =
    /<link[^>]*href=["']([^"']*?)["'][^>]*rel=["'](?:shortcut )?icon["']/i;
  const match2 = html.match(regex2);
  return match2?.[1] || null;
}

/**
 * Creates a Meta/OpenGraph Parser enrichment connector.
 *
 * Fetches a URL, parses OpenGraph + standard meta tags, and returns
 * structured DeepLinkData. Includes SSRF protection.
 */
export function createMetaParserModule(): DataEnrichmentConnector {
  return {
    async enrich(input: EnrichmentInput): Promise<EnrichmentOutput> {
      const url = input.url;

      if (!url) {
        return {
          dimension: "deep_link",
          status: "error",
          data: {},
          source: "meta_parser",
          ttl: 0,
        };
      }

      // SSRF protection: validate URL before fetching
      if (!isValidExternalUrl(url)) {
        return {
          dimension: "deep_link",
          status: "error",
          data: {},
          source: "meta_parser",
          ttl: 0,
        };
      }

      try {
        return await metaParserPolicy.execute(async ({ signal }) => {
          // Manual redirect following with SSRF validation on each hop (Fix 1)
          let currentUrl = url;
          let response: Response | null = null;

          for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount++) {
            response = await fetch(currentUrl, {
              headers: { "User-Agent": "JobSync/1.0 (Link Preview)" },
              signal,
              redirect: "manual",
            });

            // Handle redirects: validate the target URL before following
            if (response.status >= 300 && response.status < 400) {
              const location = response.headers.get("location");
              if (!location) break;

              // Resolve relative URLs against current URL
              const resolvedUrl = new URL(location, currentUrl).toString();

              // Validate redirect target against SSRF rules
              if (!isValidExternalUrl(resolvedUrl)) {
                // M-S-05: Cancel body before returning to avoid leaking the
                // connection. Errors are swallowed — cancel is best-effort.
                await response.body?.cancel().catch(() => {});
                return {
                  dimension: "deep_link" as const,
                  status: "error" as const,
                  data: {},
                  source: "meta_parser",
                  ttl: 0,
                };
              }

              // M-S-05: Cancel the redirect response body before following
              // the next hop so the underlying TCP connection is released.
              // Without this, each redirect hop leaks an unconsumed body
              // reader, holding the connection open until GC.
              await response.body?.cancel().catch(() => {});
              currentUrl = resolvedUrl;
              continue;
            }

            break;
          }

          if (!response || !response.ok) {
            return {
              dimension: "deep_link" as const,
              status: "not_found" as const,
              data: {},
              source: "meta_parser",
              ttl: 0,
            };
          }

          // Read body incrementally to prevent memory DoS (Fix 2)
          const truncatedHtml = await readBodyWithLimit(response);

          const data = parseMetaTags(truncatedHtml);

          if (!data.title && !data.description && !data.image) {
            return {
              dimension: "deep_link" as const,
              status: "not_found" as const,
              data: {},
              source: "meta_parser",
              ttl: 0,
            };
          }

          return {
            dimension: "deep_link" as const,
            status: "found" as const,
            data: data as unknown as Record<string, unknown>,
            source: "meta_parser",
            ttl: ENRICHMENT_CONFIG.DEEP_LINK_TTL_SECONDS,
          };
        });
      } catch {
        return {
          dimension: "deep_link",
          status: "error",
          data: {},
          source: "meta_parser",
          ttl: 0,
        };
      }
    },
  };
}

// Self-registration
moduleRegistry.register(metaParserManifest, createMetaParserModule);
