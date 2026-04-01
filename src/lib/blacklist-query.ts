import "server-only";

import prisma from "@/lib/db";
import type { BlacklistMatchType } from "@/models/companyBlacklist.model";

/**
 * Get blacklist entries for a specific user (server-only, internal use).
 * Used by the Runner pipeline to filter vacancies during the dedup phase.
 *
 * This function lives outside the "use server" actions file to prevent
 * client-side access. "use server" exports are callable from the browser,
 * so functions accepting raw userId must NOT be in those files (SEC-13).
 *
 * The caller (Runner) is responsible for passing a valid, authorized userId
 * from the automation context — this function trusts its caller.
 */
export async function getBlacklistEntriesForUser(
  userId: string,
): Promise<Pick<{ pattern: string; matchType: BlacklistMatchType }, "pattern" | "matchType">[]> {
  const entries = await prisma.companyBlacklist.findMany({
    where: { userId },
    select: { pattern: true, matchType: true },
  });

  return entries.map((e) => ({
    pattern: e.pattern,
    matchType: e.matchType as BlacklistMatchType,
  }));
}
