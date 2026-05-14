import "server-only";

import { readdir, stat, unlink } from "fs/promises";
import path from "path";

/**
 * Generic Orphan File Purger
 *
 * Recursively walks a directory, identifies files NOT in a known set,
 * and deletes those older than a grace period (by mtime).
 *
 * Structure-agnostic: uses readdir({ recursive: true }), works with
 * any directory depth. No hardcoded path assumptions.
 *
 * @param baseDir      - Root directory to scan (e.g. getLogosDir())
 * @param isKnown      - Predicate: return true if the absolute file path is tracked (e.g. in DB)
 * @param graceDays    - Only delete files with mtime older than this many days ago
 * @returns            - Count of files deleted
 */
export async function purgeOrphanedFiles(
  baseDir: string,
  isKnown: (absolutePath: string) => boolean,
  graceDays: number,
): Promise<{ deletedCount: number }> {
  // Gracefully handle missing base directory
  let entries: import("fs").Dirent[];
  try {
    entries = await readdir(baseDir, { recursive: true, withFileTypes: true });
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { deletedCount: 0 };
    }
    throw error;
  }

  const graceCutoff = new Date();
  graceCutoff.setDate(graceCutoff.getDate() - graceDays);

  let deletedCount = 0;

  for (const entry of entries) {
    // Skip directories — only process regular files
    if (!entry.isFile()) continue;

    const absolutePath = path.join(entry.parentPath, entry.name);

    // Skip files that are tracked (not orphaned)
    if (isKnown(absolutePath)) continue;

    // Grace period: only delete files older than graceDays
    try {
      const fileStat = await stat(absolutePath);
      if (fileStat.mtime > graceCutoff) continue;

      await unlink(absolutePath);
      deletedCount++;
    } catch (error: unknown) {
      // File disappeared between readdir and stat/unlink — skip
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue;
      throw error;
    }
  }

  return { deletedCount };
}
