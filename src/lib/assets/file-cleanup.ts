import "server-only";

import { unlink, rmdir } from "fs/promises";
import path from "path";

/**
 * Delete a file and prune empty parent directories upward.
 *
 * Best-effort and idempotent:
 * - ENOENT on file = success (already gone)
 * - ENOENT/ENOTEMPTY on rmdir = stop pruning (dir has contents or gone)
 * - Non-ENOENT errors on unlink are re-thrown
 *
 * @param filePath  - Absolute path to file to delete
 * @param levels    - Number of parent directories to attempt removal (default: 0)
 *
 * @example
 * // Delete logo file + clean company dir + user dir if empty
 * await deleteFileAndPruneEmptyParents("/data/logos/userId/companyId/logo.png", 2);
 */
export async function deleteFileAndPruneEmptyParents(
  filePath: string,
  levels: number = 0,
): Promise<void> {
  // Delete the file
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File already gone — idempotent success
      return;
    }
    throw error;
  }

  // Prune empty parent directories upward
  let currentDir = filePath;
  for (let i = 0; i < levels; i++) {
    currentDir = path.dirname(currentDir);
    try {
      await rmdir(currentDir);
    } catch {
      // Directory not empty, doesn't exist, or permission error — stop pruning
      break;
    }
  }
}
