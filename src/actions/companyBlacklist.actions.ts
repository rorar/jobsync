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
    if (!user) return { success: false, message: "Not authenticated" };

    const entries = await prisma.companyBlacklist.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
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
    if (!user) return { success: false, message: "Not authenticated" };

    // Runtime validation — TypeScript types are erased (SEC-14)
    if (!VALID_MATCH_TYPES.includes(matchType)) {
      return { success: false, message: "Invalid match type" };
    }

    const trimmedPattern = pattern.trim();
    if (!trimmedPattern) {
      return { success: false, message: "blacklist.patternRequired" };
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
        reason: reason?.trim() || null,
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
    if (!user) return { success: false, message: "Not authenticated" };

    // Ownership enforced at Prisma level (ADR-015)
    const entry = await prisma.companyBlacklist.findFirst({
      where: { id, userId: user.id },
    });

    if (!entry) {
      return { success: false, message: "Entry not found" };
    }

    await prisma.companyBlacklist.delete({
      where: { id },
    });

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
