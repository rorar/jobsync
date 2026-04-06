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
 * Check if a URL serves an image by doing a HEAD request.
 * Returns the content type so the UI can show a specific error message.
 */
export async function checkLogoUrl(
  url: string,
): Promise<{ isImage: boolean; contentType: string | null }> {
  const user = await getCurrentUser();
  if (!user) return { isImage: false, contentType: null };

  try {
    const parsed = new URL(url);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { isImage: false, contentType: null };
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
