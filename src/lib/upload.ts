import "server-only";

import fs from "fs";
import path from "path";
import { getDataDir } from "@/lib/storage";

/**
 * Upload a file to the persistent storage directory.
 *
 * Validates that both `dir` and `filePath` resolve within the application's
 * DATA_DIR to prevent path traversal attacks.
 *
 * NOT a Server Action — lives in a `server-only` module so it can never be
 * called from the browser (ADR-019). Callers: profile.actions.ts, resume/route.ts.
 */
export async function uploadFile(
  file: File,
  dir: string,
  filePath: string,
): Promise<void> {
  const dataDir = getDataDir();
  const resolvedDir = path.resolve(dir);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedDir.startsWith(dataDir) || !resolvedPath.startsWith(resolvedDir)) {
    throw new Error("Invalid upload path");
  }

  const bytes = await file.arrayBuffer();
  const buffer = new Uint8Array(bytes);

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await fs.promises.writeFile(filePath, buffer);
}
