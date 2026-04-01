"use server";

import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import type {
  CompanyBlacklist,
  BlacklistMatchType,
} from "@/models/companyBlacklist.model";
import { getCurrentUser } from "@/utils/user.utils";
import { revalidatePath } from "next/cache";

/**
 * Get all blacklist entries for the current user.
 */
export async function getBlacklistEntries(): Promise<
  ActionResult<CompanyBlacklist[]>
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "blacklist.notAuthenticated" };

    const entries = await prisma.companyBlacklist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 500, // Bound query to prevent unbounded memory (F-05)
    });

    return {
      success: true,
      data: entries.map((e) => ({
        ...e,
        matchType: e.matchType as BlacklistMatchType,
      })),
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Add a company to the blacklist.
 */
const VALID_MATCH_TYPES: readonly string[] = ["exact", "contains", "starts_with", "ends_with"] as const;

export async function addBlacklistEntry(
  pattern: string,
  matchType: BlacklistMatchType = "contains",
  reason?: string,
): Promise<ActionResult<CompanyBlacklist>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "blacklist.notAuthenticated" };

    // Runtime validation — TypeScript types are erased (SEC-14)
    if (!VALID_MATCH_TYPES.includes(matchType)) {
      return { success: false, message: "blacklist.invalidMatchType" };
    }

    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
      return { success: false, message: "blacklist.patternRequired" };
    }
    if (trimmedPattern.length > 500) {
      return { success: false, message: "blacklist.patternTooLong" };
    }

    const trimmedReason = reason?.trim();
    if (trimmedReason && trimmedReason.length > 1000) {
      return { success: false, message: "blacklist.reasonTooLong" };
    }

    // Check for duplicate
    const existing = await prisma.companyBlacklist.findUnique({
      where: {
        userId_pattern_matchType: {
          userId: user.id,
          pattern: trimmedPattern,
          matchType,
        },
      },
    });

    if (existing) {
      return { success: false, message: "blacklist.alreadyExists" };
    }

    const entry = await prisma.companyBlacklist.create({
      data: {
        userId: user.id,
        pattern: trimmedPattern,
        matchType,
        reason: trimmedReason || null,
      },
    });

    revalidatePath("/settings");
    return {
      success: true,
      data: {
        ...entry,
        matchType: entry.matchType as BlacklistMatchType,
      },
    };
  } catch (error) {
    return handleError(error);
  }
}

/**
 * Remove a company from the blacklist.
 */
export async function removeBlacklistEntry(
  id: string,
): Promise<ActionResult<undefined>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "blacklist.notAuthenticated" };

    // Atomic delete with ownership check — avoids TOCTOU race (SEC-P2-17, ADR-015)
    const result = await prisma.companyBlacklist.deleteMany({
      where: { id, userId: user.id },
    });

    if (result.count === 0) {
      return { success: false, message: "blacklist.entryNotFound" };
    }

    revalidatePath("/settings");
    return { success: true };
  } catch (error) {
    return handleError(error);
  }
}

// SEC-13: getBlacklistEntriesForUser moved to src/lib/blacklist-query.ts
// Removed from "use server" file to prevent client-side IDOR.
// "use server" exports are callable from the browser — this function
// accepts a raw userId and must NOT be client-accessible.
