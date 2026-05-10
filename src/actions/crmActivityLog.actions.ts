"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import type { ActivityType } from "@/models/person.model";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[crmActivityLog.actions]", message);
  return { success: false, message };
}

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function getActivityTimeline(filters: {
  targetPersonId?: string;
  targetJobId?: string;
  activityType?: ActivityType;
  page?: number;
  pageSize?: number;
}): Promise<ActionResult<{ activities: Record<string, unknown>[]; total: number }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const page = filters.page ?? 1;
    const pageSize = filters.pageSize ?? 50;
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { userId: user.id };
    if (filters.targetPersonId) where.targetPersonId = filters.targetPersonId;
    if (filters.targetJobId) where.targetJobId = filters.targetJobId;
    if (filters.activityType) where.activityType = filters.activityType;

    const [activities, total] = await Promise.all([
      prisma.crmActivityLog.findMany({
        where,
        include: {
          targetPerson: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: { happenedAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.crmActivityLog.count({ where }),
    ]);

    return { success: true, data: { activities, total } };
  } catch (error) {
    return handleError(error);
  }
}
