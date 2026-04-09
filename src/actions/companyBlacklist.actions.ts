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
import { emitEvent, createEvent } from "@/lib/events";

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

/** Build a Prisma string filter from blacklist match type + pattern. */
function buildEmployerNameFilter(
  pattern: string,
  matchType: BlacklistMatchType,
): { contains: string } | { startsWith: string } | { endsWith: string } | { equals: string } {
  switch (matchType) {
    case "contains": return { contains: pattern };
    case "starts_with": return { startsWith: pattern };
    case "ends_with": return { endsWith: pattern };
    case "exact": return { equals: pattern };
  }
}

export async function addBlacklistEntry(
  pattern: string,
  matchType: BlacklistMatchType = "contains",
  reason?: string,
): Promise<ActionResult<CompanyBlacklist & { trashedCount?: number }>> {
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

    // Build Prisma filter for employer name matching
    const employerFilter = buildEmployerNameFilter(trimmedPattern, matchType);

    // Transaction (H-A-05 + H-P-02):
    //   1. pre-flight findMany selects the IDs of staged vacancies that match
    //      the new blacklist pattern. Prisma doesn't support RETURNING on
    //      updateMany for SQLite, so we need an explicit read to know which
    //      rows were trashed — the alternative (updateMany then re-query)
    //      loses the "transitioning set" (other concurrent actions could
    //      move rows in or out of the predicate).
    //   2. updateMany by `id IN (...)` rewrites the write as an indexed PK
    //      lookup instead of a second LIKE scan. The H-P-02 composite index
    //      `(userId, employerName)` covers the pre-flight findMany; the
    //      updateMany now bypasses the LIKE altogether.
    //   3. create the blacklist row last so the write lock window is tight.
    // Events are emitted AFTER the transaction commits so consumers never
    // observe a trashed vacancy before the blacklist row is visible.
    const { entry, trashedIds } = await prisma.$transaction(async (tx) => {
      const matching = await tx.stagedVacancy.findMany({
        where: {
          userId: user.id,
          employerName: employerFilter,
          trashedAt: null,
          archivedAt: null,
          promotedToJobId: null,
        },
        select: { id: true },
      });
      const ids = matching.map((row) => row.id);

      if (ids.length > 0) {
        await tx.stagedVacancy.updateMany({
          where: {
            // Keep userId in the WHERE clause even though we already filtered
            // above — defense-in-depth IDOR guard (ADR-015).
            userId: user.id,
            id: { in: ids },
            trashedAt: null,
            archivedAt: null,
            promotedToJobId: null,
          },
          data: { trashedAt: new Date() },
        });
      }

      const created = await tx.companyBlacklist.create({
        data: {
          userId: user.id,
          pattern: trimmedPattern,
          matchType,
          reason: trimmedReason || null,
        },
      });

      return { entry: created, trashedIds: ids };
    });

    // H-A-05 domain-event seam: emit one VacancyTrashed per row (satisfies
    // the per-row contract documented in specs/vacancy-pipeline.allium rule
    // TrashVacancy) + one BulkActionCompleted envelope so batch-aware
    // consumers (audit log, analytics, notification summaries) still see the
    // aggregate shape. Both shapes are now in the event stream — consumers
    // subscribe to whichever they prefer.
    //
    // Events fire AFTER commit to preserve causal ordering (consumers never
    // see a VacancyTrashed for a row that is still untrashed in the DB).
    // emitEvent is fire-and-forget and error-isolated per ErrorIsolation
    // rule in specs/event-bus.allium.
    for (const trashedId of trashedIds) {
      emitEvent(
        createEvent("VacancyTrashed", {
          stagedVacancyId: trashedId,
          userId: user.id,
        }),
      );
    }
    if (trashedIds.length > 0) {
      emitEvent(
        createEvent("BulkActionCompleted", {
          actionType: "blacklist_trash",
          itemIds: trashedIds,
          userId: user.id,
          succeeded: trashedIds.length,
          failed: 0,
        }),
      );
    }

    revalidatePath("/settings");
    revalidatePath("/staging");
    return {
      success: true,
      data: {
        ...entry,
        matchType: entry.matchType as BlacklistMatchType,
        trashedCount: trashedIds.length,
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
