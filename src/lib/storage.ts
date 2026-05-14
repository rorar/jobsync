import "server-only";

import path from "path";

/**
 * Centralized Persistent Storage Path Resolution
 *
 * Single source of truth for all filesystem storage paths in the application.
 * Replaces scattered hardcoded "/data/" references and NODE_ENV branching.
 *
 * Fallback chain (evaluated once at import time):
 * 1. DATA_DIR env var — explicit override (highest priority)
 * 2. /data — Docker volume mount convention (detected via statSync)
 * 3. ./data — local development fallback (resolved to absolute path)
 *
 * NOT for database paths — DATABASE_URL is managed by Prisma separately.
 * NOT for module-level storage — modules are stateless API translators (DDD ACL).
 * Storage is owned by application services (LogoAsset, Retention, Profile).
 *
 * @see src/lib/connector/resilience.ts — outbound resilience (Cockatiel)
 * @see src/lib/rate-limit.ts — inbound rate limiting
 */

// =============================================================================
// Base directory resolution (evaluated once at import time)
// =============================================================================

const DATA_DIR: string = (() => {
  // 1. Explicit env var (highest priority)
  if (process.env.DATA_DIR) {
    return path.resolve(process.env.DATA_DIR);
  }

  // 2. Docker volume mount convention
  try {
    const fs = require("fs");
    if (fs.statSync("/data").isDirectory()) return "/data";
  } catch {
    // Not in Docker or /data doesn't exist
  }

  // 3. Local development fallback
  return path.resolve("./data");
})();

// =============================================================================
// Public API
// =============================================================================

/**
 * Get the resolved persistent storage base directory.
 *
 * Returns an absolute path. Determined once at import time via the
 * fallback chain: DATA_DIR env → /data (Docker) → ./data (dev).
 */
export function getDataDir(): string {
  return DATA_DIR;
}

/**
 * Build a storage path by joining segments onto the base data directory.
 *
 * Extensible — any application service can construct paths without
 * knowing the base directory or the fallback chain.
 *
 * @example
 * getStoragePath("logos")                        // "/data/logos"
 * getStoragePath("logos", userId, companyId)      // "/data/logos/{userId}/{companyId}"
 * getStoragePath("audit-archive")                // "/data/audit-archive"
 * getStoragePath("files", "resumes")             // "/data/files/resumes"
 */
export function getStoragePath(...segments: string[]): string {
  return path.join(DATA_DIR, ...segments);
}

// =============================================================================
// Convenience exports for well-known storage zones
// =============================================================================

/** Logo asset storage: `{dataDir}/logos` */
export function getLogosDir(): string {
  return getStoragePath("logos");
}

/** Admin audit log archive: `{dataDir}/audit-archive` */
export function getAuditArchiveDir(): string {
  return getStoragePath("audit-archive");
}

/** Resume file uploads: `{dataDir}/files/resumes` */
export function getResumesDir(): string {
  return getStoragePath("files", "resumes");
}
