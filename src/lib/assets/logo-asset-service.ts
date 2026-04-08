import "server-only";

/**
 * LogoAssetService — Download Pipeline Singleton
 *
 * Downloads, validates, sanitizes, and stores company logo images locally.
 * Triggered by EnrichmentCompleted events and manual URL changes.
 *
 * Security: SSRF validation, magic byte check, SVG sanitization, 1MB body limit.
 * Storage: /data/logos/{userId}/{companyId}/logo.{ext}
 *
 * Singleton on globalThis (survives HMR, follows enrichment-trigger.ts pattern).
 */

import { validateWebhookUrl } from "@/lib/url-validation";
import { validateMagicBytes, ACCEPTED_MIME_TYPES } from "./magic-bytes";
import { sanitizeSvg } from "./svg-sanitizer";
import { getImageDimensions } from "./image-processor";
import { defaultLogoAssetConfig } from "@/models/userSettings.model";
import type { LogoAssetConfig, UserSettingsData } from "@/models/userSettings.model";
import db from "@/lib/db";
import fs from "fs/promises";
import path from "path";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Hard ceiling for download body — prevents memory exhaustion */
const MAX_DOWNLOAD_BYTES = 1_048_576; // 1MB

/** Maximum number of redirect hops to follow */
const MAX_REDIRECTS = 3;

/** Fetch timeout in milliseconds */
const FETCH_TIMEOUT_MS = 10_000;

/** Map MIME type to file extension */
const MIME_TO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/x-icon": "ico",
  "image/vnd.microsoft.icon": "ico",
};

// ---------------------------------------------------------------------------
// Storage Base
// ---------------------------------------------------------------------------

/**
 * Determine storage base directory.
 * Docker: /data/ (persistent volume)
 * Dev: ./data/ (local)
 */
const STORAGE_BASE = (() => {
  try {
    // Check if /data/ exists (Docker volume mount) — once at init time
    const fss = require("fs");
    if (fss.statSync("/data").isDirectory()) return "/data";
  } catch {
    // Not in Docker — use project-local data directory
  }
  return path.resolve("./data");
})();

function getStorageBase(): string {
  return STORAGE_BASE;
}

/**
 * Build the file path for a logo asset.
 * Path is constructed from UUIDs only — never user input.
 */
function buildFilePath(
  userId: string,
  companyId: string,
  mimeType: string,
): string {
  const ext = MIME_TO_EXT[mimeType.toLowerCase()] ?? "bin";
  const base = getStorageBase();
  return path.join(base, "logos", userId, companyId, `logo.${ext}`);
}

// ---------------------------------------------------------------------------
// User Config Helper
// ---------------------------------------------------------------------------

async function getLogoAssetConfig(userId: string): Promise<LogoAssetConfig> {
  try {
    const row = await db.userSettings.findUnique({ where: { userId } });
    if (!row) return defaultLogoAssetConfig;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    return { ...defaultLogoAssetConfig, ...parsed.logoAsset };
  } catch {
    return defaultLogoAssetConfig;
  }
}

// ---------------------------------------------------------------------------
// URL Sanitization
// ---------------------------------------------------------------------------

/**
 * Strip embedded API tokens from a logo URL before storing as fallback.
 * Preserves the URL structure so it can still serve as an external fallback
 * (per Allium spec), but removes sensitive credentials like Logo.dev pk_ keys.
 */
function stripTokenFromUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.searchParams.delete("token");
    return parsed.toString();
  } catch {
    return url;
  }
}

// ---------------------------------------------------------------------------
// Download Pipeline
// ---------------------------------------------------------------------------

class LogoAssetService {
  /**
   * Download, validate, sanitize, and store a logo image.
   *
   * Pipeline: SSRF validate -> fetch (redirect:manual) -> safe redirect following ->
   * content-type check -> stream body (1MB limit) -> magic bytes -> SVG sanitize /
   * store raster -> mkdir -p -> write file -> upsert LogoAsset(ready) -> update Company.logoAssetId
   *
   * All failures result in LogoAsset status=failed with errorMessage (silent to user).
   */
  async downloadAndProcess(
    sourceUrl: string,
    userId: string,
    companyId: string,
  ): Promise<void> {
    // Create/upsert a pending LogoAsset record
    let logoAsset;
    try {
      logoAsset = await db.logoAsset.upsert({
        where: { userId_companyId: { userId, companyId } },
        create: {
          userId,
          companyId,
          sourceUrl,
          filePath: "",
          mimeType: "",
          fileSize: 0,
          status: "pending",
        },
        update: {
          sourceUrl,
          status: "pending",
          errorMessage: null,
        },
      });
    } catch (error) {
      console.error("[LogoAssetService] Failed to upsert LogoAsset:", error);
      return;
    }

    try {
      // Step 1: SSRF validate the source URL
      const ssrfResult = validateWebhookUrl(sourceUrl);
      if (!ssrfResult.valid) {
        throw new Error(`SSRF blocked: ${ssrfResult.error}`);
      }

      // Step 2: Fetch with redirect:manual and safe redirect following
      const { response, finalUrl } = await this.safeFetch(sourceUrl);

      // Step 3: Content-Type check
      const contentType = response.headers.get("content-type") ?? "";
      const mimeType = contentType.split(";")[0].trim().toLowerCase();

      if (!ACCEPTED_MIME_TYPES.has(mimeType)) {
        throw new Error(`Unsupported content type: ${mimeType}`);
      }

      // Step 4: Stream body with size limit
      const buffer = await this.readBodyWithLimit(response);

      // Step 5: Magic byte validation
      const magicResult = validateMagicBytes(buffer, mimeType);
      if (!magicResult.valid) {
        throw new Error(
          `MIME mismatch: declared ${mimeType}, detected ${magicResult.detectedMime ?? "unknown"}`,
        );
      }

      // Step 6: Read user config
      const config = await getLogoAssetConfig(userId);

      // Step 7: Process based on type
      let processedBuffer: Buffer;
      let dimensions: { width: number; height: number } | null = null;

      if (mimeType === "image/svg+xml") {
        // SVG: sanitize, no resize
        processedBuffer = sanitizeSvg(buffer);
      } else {
        // Raster: read dimensions (no actual resize in this phase)
        dimensions = getImageDimensions(buffer, mimeType);
        processedBuffer = buffer;
      }

      // Step 8: Check file size against user config
      if (processedBuffer.length > config.maxFileSize) {
        throw new Error(
          `File size ${processedBuffer.length} exceeds limit ${config.maxFileSize}`,
        );
      }

      // Step 9: Write to disk
      const filePath = buildFilePath(userId, companyId, mimeType);
      const dir = path.dirname(filePath);
      await fs.mkdir(dir, { recursive: true });
      await fs.writeFile(filePath, processedBuffer);

      // Step 10: Update LogoAsset to ready
      const updatedAsset = await db.logoAsset.update({
        where: { id: logoAsset.id },
        data: {
          status: "ready",
          filePath,
          mimeType,
          fileSize: processedBuffer.length,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
          sourceUrl: finalUrl,
          errorMessage: null,
        },
      });

      // Step 11: Set Company.logoAssetId and preserve external logoUrl as fallback
      // The external URL is kept as a spec-compliant fallback (Allium: logo-asset-cache),
      // but any embedded API tokens (e.g. Logo.dev pk_ key) are stripped for security.
      await db.company.updateMany({
        where: { id: companyId, createdBy: userId },
        data: { logoAssetId: updatedAsset.id, logoUrl: stripTokenFromUrl(sourceUrl) },
      });

      console.debug(
        `[LogoAssetService] Logo cached for company ${companyId}: ${mimeType}, ${processedBuffer.length} bytes`,
      );
    } catch (error) {
      // Set status to failed with error message
      const errorMessage =
        error instanceof Error ? error.message : "Unknown download error";

      console.error(
        `[LogoAssetService] Download failed for company ${companyId}:`,
        errorMessage,
      );

      try {
        await db.logoAsset.update({
          where: { id: logoAsset.id },
          data: {
            status: "failed",
            errorMessage,
          },
        });
      } catch {
        // Swallow — best effort error recording
      }
    }
  }

  /**
   * Delete a logo asset (file + DB record).
   */
  async deleteAsset(logoAssetId: string, userId: string): Promise<void> {
    // Find the asset (IDOR: userId in query)
    const asset = await db.logoAsset.findFirst({
      where: { id: logoAssetId, userId },
    });

    if (!asset) return;

    // Clear Company.logoAssetId
    await db.company.updateMany({
      where: { id: asset.companyId, createdBy: userId, logoAssetId },
      data: { logoAssetId: null },
    });

    // Delete file from disk
    if (asset.filePath) {
      try {
        await fs.unlink(asset.filePath);
        // Try to remove empty directory (company-level, then user-level)
        const companyDir = path.dirname(asset.filePath);
        try {
          await fs.rmdir(companyDir);
          const userDir = path.dirname(companyDir);
          await fs.rmdir(userDir);
        } catch {
          // Directory not empty or doesn't exist — expected
        }
      } catch {
        // File already gone — proceed with DB cleanup
      }
    }

    // Delete DB record
    await db.logoAsset.deleteMany({ where: { id: logoAssetId, userId } });
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  /**
   * Fetch with redirect:manual and safe redirect following.
   * Re-validates each Location header against SSRF rules.
   * Max 3 redirect hops.
   */
  private async safeFetch(
    url: string,
  ): Promise<{ response: Response; finalUrl: string }> {
    let currentUrl = url;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await fetch(currentUrl, {
        redirect: "manual",
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        headers: {
          "User-Agent": "JobSync-LogoFetcher/1.0",
          Accept: "image/*",
        },
      });

      // Success — return the response
      if (response.status >= 200 && response.status < 300) {
        return { response, finalUrl: currentUrl };
      }

      // Redirect — validate Location
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) {
          throw new Error(`Redirect ${response.status} without Location header`);
        }

        // Resolve relative Location URLs
        const resolvedLocation = new URL(location, currentUrl).toString();

        // SSRF re-validate redirect target
        const redirectCheck = validateWebhookUrl(resolvedLocation);
        if (!redirectCheck.valid) {
          throw new Error(`SSRF blocked redirect: ${redirectCheck.error}`);
        }

        // Consume the body to free resources
        try {
          await response.body?.cancel();
        } catch {
          // Ignore cancel errors
        }

        currentUrl = resolvedLocation;
        continue;
      }

      // Error status
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    throw new Error(`Too many redirects (max ${MAX_REDIRECTS})`);
  }

  /**
   * Read response body with streaming size limit.
   * Aborts if body exceeds MAX_DOWNLOAD_BYTES.
   */
  private async readBodyWithLimit(response: Response): Promise<Buffer> {
    if (!response.body) {
      throw new Error("Response has no body");
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        totalSize += value.length;
        if (totalSize > MAX_DOWNLOAD_BYTES) {
          await reader.cancel();
          throw new Error(
            `Response body exceeds ${MAX_DOWNLOAD_BYTES} byte limit`,
          );
        }

        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }

    return Buffer.concat(chunks);
  }
}

// ---------------------------------------------------------------------------
// Singleton (globalThis pattern — survives HMR)
// ---------------------------------------------------------------------------

const g = globalThis as unknown as { __logoAssetService?: LogoAssetService };
if (!g.__logoAssetService) g.__logoAssetService = new LogoAssetService();
export const logoAssetService = g.__logoAssetService;
