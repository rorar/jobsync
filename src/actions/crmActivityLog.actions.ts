"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import type { ActivityType } from "@/models/person.model";

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function getActivityTimeline(filters: {
  targetPersonId?: string;
  targetJobId?: string;
  targetCompanyId?: string;
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

    // IDOR: userId always scopes the query. targetCompanyId (Welle 3 P3) filters
    // by company WITHOUT a Company.userId join — Company is a shared lookup, so the
    // CrmActivityLog.userId scope is the ownership boundary.
    const where: Record<string, unknown> = { userId: user.id };
    if (filters.targetPersonId) where.targetPersonId = filters.targetPersonId;
    if (filters.targetJobId) where.targetJobId = filters.targetJobId;
    if (filters.targetCompanyId) where.targetCompanyId = filters.targetCompanyId;
    if (filters.activityType) where.activityType = filters.activityType;

    const [activities, total] = await Promise.all([
      prisma.crmActivityLog.findMany({
        where,
        include: {
          targetPerson: { select: { id: true, firstName: true, lastName: true } },
          targetCompany: { select: { id: true, label: true } },
          targetJob: { select: { id: true, JobTitle: { select: { label: true } }, Company: { select: { label: true } } } },
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
