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
export async function addBlacklistEntry(
  pattern: string,
  matchType: BlacklistMatchType = "contains",
  reason?: string,
): Promise<ActionResult<CompanyBlacklist>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

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

    // Verify ownership
    const entry = await prisma.companyBlacklist.findUnique({
      where: { id },
    });

    if (!entry || entry.userId !== user.id) {
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

/**
 * Get blacklist entries for a specific user (server-only, no auth check).
 * Used by the Runner pipeline to filter vacancies.
 */
export async function getBlacklistEntriesForUser(
  userId: string,
): Promise<Pick<CompanyBlacklist, "pattern" | "matchType">[]> {
  const entries = await prisma.companyBlacklist.findMany({
    where: { userId },
    select: { pattern: true, matchType: true },
  });

  return entries.map((e) => ({
    pattern: e.pattern,
    matchType: e.matchType as BlacklistMatchType,
  }));
}
