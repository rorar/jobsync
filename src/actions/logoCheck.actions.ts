"use server";

import { getCurrentUser } from "@/utils/user.utils";

const IMAGE_CONTENT_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
];

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
    const data = await response.json();

    const pages = data?.query?.pages;
    if (!pages) return null;

    // Pages is an object keyed by page ID; get the first one
    const page = Object.values(pages)[0] as {
      imageinfo?: { url: string }[];
    };
    return page?.imageinfo?.[0]?.url ?? null;
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

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { isImage: false, contentType: null };
    }

    // Try to resolve Wikipedia media page URLs first
    const wikimediaUrl = await resolveWikimediaUrl(url);
    if (wikimediaUrl) {
      return { isImage: true, contentType: "image/svg+xml", resolvedUrl: wikimediaUrl };
    }

    const response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: AbortSignal.timeout(5000),
    });

    const contentType = response.headers.get("content-type")?.split(";")[0]?.trim() ?? null;
    const isImage = contentType !== null && IMAGE_CONTENT_TYPES.some((t) => contentType.startsWith(t));

    return { isImage, contentType };
  } catch {
    return { isImage: false, contentType: null };
  }
}
