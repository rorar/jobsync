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

/** Maximum HTML size to parse (100KB) to prevent memory issues */
const MAX_HTML_SIZE = 100_000;

/**
 * Validates that a URL is safe for server-side fetching.
 *
 * Blocks:
 * - Non-HTTP protocols (file://, ftp://, javascript:, data:, etc.)
 * - Private/internal IP ranges (10.x, 172.16-31.x, 192.168.x)
 * - Loopback addresses (127.x, localhost, ::1)
 * - Link-local addresses (169.254.x, fe80::)
 * - Cloud metadata endpoints (169.254.169.254, metadata.google.internal)
 * - URLs with embedded credentials
 */
export function isValidExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    // Only allow http and https protocols
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return false;
    }

    // Block URLs with embedded credentials
    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Block localhost and loopback
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "::1" ||
      hostname === "[::1]" ||
      hostname === "0.0.0.0"
    ) {
      return false;
    }

    // Block cloud metadata endpoints
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal"
    ) {
      return false;
    }

    // Block private IP ranges
    if (isPrivateIP(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Checks if a hostname is a private/reserved IP address.
 */
function isPrivateIP(hostname: string): boolean {
  // IPv4 private ranges
  const ipv4Match = hostname.match(
    /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/,
  );
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number);

    // 10.0.0.0/8
    if (a === 10) return true;

    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) return true;

    // 192.168.0.0/16
    if (a === 192 && b === 168) return true;

    // 127.0.0.0/8 (loopback)
    if (a === 127) return true;

    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) return true;

    // 0.0.0.0/8
    if (a === 0) return true;
  }

  // IPv6 link-local
  if (hostname.startsWith("fe80:") || hostname.startsWith("[fe80:")) {
    return true;
  }

  // IPv6 private (fc00::/7)
  if (
    hostname.startsWith("fc") ||
    hostname.startsWith("fd") ||
    hostname.startsWith("[fc") ||
    hostname.startsWith("[fd")
  ) {
    return true;
  }

  return false;
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

  return {
    title: ogTitle || undefined,
    description: ogDesc || undefined,
    image: ogImage || undefined,
    siteName: ogSiteName || undefined,
    favicon: favicon || undefined,
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

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        ENRICHMENT_CONFIG.CHAIN_TIMEOUT_MS,
      );

      try {
        const response = await fetch(url, {
          headers: { "User-Agent": "JobSync/1.0 (Link Preview)" },
          signal: controller.signal,
          redirect: "follow",
        });

        if (!response.ok) {
          return {
            dimension: "deep_link",
            status: "not_found",
            data: {},
            source: "meta_parser",
            ttl: 0,
          };
        }

        const html = await response.text();
        // Only parse first 100KB to prevent memory issues
        const truncatedHtml = html.slice(0, MAX_HTML_SIZE);

        const data = parseMetaTags(truncatedHtml);

        if (!data.title && !data.description && !data.image) {
          return {
            dimension: "deep_link",
            status: "not_found",
            data: {},
            source: "meta_parser",
            ttl: 0,
          };
        }

        return {
          dimension: "deep_link",
          status: "found",
          data: data as unknown as Record<string, unknown>,
          source: "meta_parser",
          ttl: ENRICHMENT_CONFIG.DEEP_LINK_TTL_SECONDS,
        };
      } catch {
        return {
          dimension: "deep_link",
          status: "error",
          data: {},
          source: "meta_parser",
          ttl: 0,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
