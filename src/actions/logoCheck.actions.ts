"use server";

import { getCurrentUser } from "@/utils/user.utils";
import { validateWebhookUrl } from "@/lib/url-validation";
import { checkRateLimit } from "@/lib/api/rate-limit";

// M-S-04: Global cap (all callers combined) to bound total outbound HEAD
// requests regardless of how many authenticated users fire concurrently.
// 200/min global is ~3× the per-user limit (20/min × reasonable concurrency)
// while still bounding the server's outbound request rate.
const GLOBAL_LOGO_CHECK_LIMIT = 200;
const GLOBAL_LOGO_CHECK_WINDOW_MS = 60_000;

const IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

const MAX_REDIRECTS = 3;

/**
 * Wikipedia media page URL pattern.
 * Matches URLs like:
 *   https://de.wikipedia.org/wiki/Niederegger#/media/Datei:Niederegger_Logo.svg
 *   https://en.wikipedia.org/wiki/Example#/media/File:Example.png
 *
 * The fragment contains the filename after "File:" or locale variants
 * (Datei, Fichier, Archivo, etc.).
 */
const WIKIPEDIA_MEDIA_PATTERN =
  /^https?:\/\/[a-z]{2,}\.wikipedia\.org\/wiki\/.+#\/media\/(?:File|Datei|Fichier|Archivo|Bestand|Fil|Tiedosto):(.+)$/i;

/**
 * Resolve a Wikipedia media page URL to a direct Wikimedia Commons image URL.
 * Uses the public Wikimedia API (no auth needed).
 *
 * M-S-08 fixes applied:
 * 1. response.ok guard — non-2xx responses are rejected before JSON parse.
 * 2. Wikimedia domain validation — resolved URL must end with .wikimedia.org
 *    to prevent the API from returning an attacker-controlled redirect target.
 */
async function resolveWikimediaUrl(url: string): Promise<string | null> {
  const match = url.match(WIKIPEDIA_MEDIA_PATTERN);
  if (!match) return null;

  const filename = decodeURIComponent(match[1]);

  try {
    const apiUrl = new URL("https://commons.wikimedia.org/w/api.php");
    apiUrl.searchParams.set("action", "query");
    apiUrl.searchParams.set("titles", `File:${filename}`);
    apiUrl.searchParams.set("prop", "imageinfo");
    apiUrl.searchParams.set("iiprop", "url");
    apiUrl.searchParams.set("format", "json");

    const response = await fetch(apiUrl.toString(), {
      signal: AbortSignal.timeout(5000),
    });

    // M-S-08 fix 1: reject non-2xx before attempting JSON parse
    if (!response.ok) return null;

    const data = await response.json();

    const pages = data?.query?.pages;
    if (!pages) return null;

    const page = Object.values(pages)[0] as {
      imageinfo?: { url: string }[];
    };
    const resolvedUrl = page?.imageinfo?.[0]?.url ?? null;

    if (resolvedUrl) {
      // M-S-08 fix 2: validate the resolved URL is on a Wikimedia-owned domain
      // before passing it downstream. This prevents the API from returning an
      // attacker-controlled URL (e.g. via a future API compromise or redirect).
      try {
        const parsed = new URL(resolvedUrl);
        if (!parsed.hostname.endsWith(".wikimedia.org")) {
          return null;
        }
      } catch {
        return null;
      }

      const ssrfCheck = validateWebhookUrl(resolvedUrl);
      if (!ssrfCheck.valid) return null;
    }

    return resolvedUrl;
  } catch {
    return null;
  }
}

/**
 * Check if a URL serves an image by doing a HEAD request.
 * Returns the content type so the UI can show a specific error message.
 * Also resolves Wikipedia media page URLs to direct Wikimedia image URLs.
 */
export async function checkLogoUrl(
  url: string,
): Promise<{
  isImage: boolean;
  contentType: string | null;
  resolvedUrl?: string;
}> {
  const user = await getCurrentUser();
  if (!user) return { isImage: false, contentType: null };

  // M-S-04: Global cap checked BEFORE per-user cap. An authenticated attacker
  // who creates many sessions could still exhaust outbound request capacity
  // with only per-user limits. The global cap bounds total server-side
  // outbound HEAD/fetch requests regardless of how many users fire at once.
  const globalResult = checkRateLimit(
    "logoCheck:global",
    GLOBAL_LOGO_CHECK_LIMIT,
    GLOBAL_LOGO_CHECK_WINDOW_MS,
  );
  if (!globalResult.allowed) return { isImage: false, contentType: null };

  // Per-user cap: 20/min — unchanged.
  const rateResult = checkRateLimit(`logoCheck:${user.id}`, 20, 60_000);
  if (!rateResult.allowed) return { isImage: false, contentType: null };

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { isImage: false, contentType: null };
    }

    const ssrfCheck = validateWebhookUrl(url);
    if (!ssrfCheck.valid) return { isImage: false, contentType: null };

    // Try to resolve Wikipedia media page URLs first
    const wikimediaUrl = await resolveWikimediaUrl(url);
    if (wikimediaUrl) {
      return { isImage: true, contentType: "image/svg+xml", resolvedUrl: wikimediaUrl };
    }

    // Follow redirects manually with SSRF validation on each hop
    let currentUrl = url;
    for (let i = 0; i <= MAX_REDIRECTS; i++) {
      const response = await fetch(currentUrl, {
        method: "HEAD",
        redirect: "manual",
        signal: AbortSignal.timeout(5000),
      });

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) break;

        const redirectUrl = new URL(location, currentUrl).toString();
        const redirectCheck = validateWebhookUrl(redirectUrl);
        if (!redirectCheck.valid) return { isImage: false, contentType: null };

        currentUrl = redirectUrl;
        continue;
      }

      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
      const isImage = contentType !== null && IMAGE_CONTENT_TYPES.some((t) => contentType.startsWith(t));
      return { isImage, contentType };
    }

    return { isImage: false, contentType: null };
  } catch {
    return { isImage: false, contentType: null };
  }
}
