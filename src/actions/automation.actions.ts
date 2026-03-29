"use server";

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { calculateNextRunAt } from "@/lib/connector/job-discovery/schedule";
import {
  CreateAutomationSchema,
  UpdateAutomationSchema,
  type CreateAutomationInput,
  type UpdateAutomationInput,
} from "@/models/automation.schema";
import type {
  AutomationStatus,
  AutomationPauseReason,
  AutomationRunStatus,
  AutomationWithResume,
  AutomationRun,
  DiscoveredJob,
  DiscoveryStatus,
  JobBoard,
} from "@/models/automation.model";
import { APP_CONSTANTS } from "@/lib/constants";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";

const MAX_AUTOMATIONS_PER_USER = 10;

/** Narrow Prisma string fields to domain enums for Automation (with resume included). */
function toAutomationWithResume<T extends { jobBoard: string; status: string; pauseReason: string | null }>(
  row: T
): T & { jobBoard: JobBoard; status: AutomationStatus; pauseReason: AutomationPauseReason | null } {
  return {
    ...row,
    jobBoard: row.jobBoard as JobBoard,
    status: row.status as AutomationStatus,
    pauseReason: row.pauseReason as AutomationPauseReason | null,
  };
}

/** Narrow Prisma string fields to domain enums for AutomationRun. */
function toAutomationRun<T extends { status: string }>(
  row: T
): T & { status: AutomationRunStatus } {
  return { ...row, status: row.status as AutomationRunStatus };
}

/** Narrow Prisma string fields to domain enums for DiscoveredJob. */
function toDiscoveredJob<T extends { discoveryStatus: string | null }>(
  row: T
): T & { discoveryStatus: DiscoveryStatus | null } {
  return { ...row, discoveryStatus: row.discoveryStatus as DiscoveryStatus | null };
}

export async function getAutomationsList(
  page: number = 1,
  limit: number = APP_CONSTANTS.RECORDS_PER_PAGE
): Promise<ActionResult<AutomationWithResume[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const skip = (page - 1) * limit;

    const [automations, total] = await Promise.all([
      prisma.automation.findMany({
        where: { userId: user.id },
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          resume: {
            select: { id: true, title: true },
          },
        },
      }),
      prisma.automation.count({ where: { userId: user.id } }),
    ]);

    return {
      success: true,
      data: automations.map(toAutomationWithResume) as AutomationWithResume[],
      total,
    };
  } catch (error) {
    return handleError(error, "Failed to get automations list");
  }
}

export async function getAutomationById(id: string): Promise<ActionResult<AutomationWithResume & { runs: AutomationRun[] }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const automation = await prisma.automation.findFirst({
      where: { id, userId: user.id },
      include: {
        resume: {
          select: { id: true, title: true },
        },
        runs: {
          orderBy: { startedAt: "desc" },
          take: 10,
        },
      },
    });

    if (!automation) {
      return { success: false, message: "Automation not found" };
    }

    return {
      success: true,
      data: {
        ...toAutomationWithResume(automation),
        runs: automation.runs.map(toAutomationRun),
      } as AutomationWithResume & { runs: AutomationRun[] },
    };
  } catch (error) {
    return handleError(error, "Failed to get automation");
  }
}

export async function createAutomation(
  input: CreateAutomationInput
): Promise<ActionResult<AutomationWithResume>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const validated = CreateAutomationSchema.parse(input);

    const count = await prisma.automation.count({ where: { userId: user.id } });
    if (count >= MAX_AUTOMATIONS_PER_USER) {
      return { success: false, message: `Maximum of ${MAX_AUTOMATIONS_PER_USER} automations allowed per user` };
    }

    const resume = await prisma.resume.findFirst({
      where: {
        id: validated.resumeId,
        profile: { userId: user.id },
      },
    });

    if (!resume) {
      return { success: false, message: "Resume not found or doesn't belong to you" };
    }

    const nextRunAt = calculateNextRunAt(validated.scheduleHour);

    const automation = await prisma.automation.create({
      data: {
        userId: user.id,
        name: validated.name,
        jobBoard: validated.jobBoard,
        keywords: validated.keywords,
        location: validated.location,
        connectorParams: validated.connectorParams,
        resumeId: validated.resumeId,
        matchThreshold: validated.matchThreshold,
        scheduleHour: validated.scheduleHour,
        nextRunAt,
        status: "active",
      },
      include: {
        resume: {
          select: { id: true, title: true },
        },
      },
    });

    return {
      success: true,
      data: toAutomationWithResume(automation) as AutomationWithResume,
    };
  } catch (error) {
    return handleError(error, "Failed to create automation");
  }
}

export async function updateAutomation(
  id: string,
  input: UpdateAutomationInput
): Promise<ActionResult<AutomationWithResume>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const validated = UpdateAutomationSchema.parse(input);

    const existing = await prisma.automation.findFirst({
      where: { id, userId: user.id },
    });

    if (!existing) {
      return { success: false, message: "Automation not found" };
    }

    if (validated.resumeId) {
      const resume = await prisma.resume.findFirst({
        where: {
          id: validated.resumeId,
          profile: { userId: user.id },
        },
      });
      if (!resume) {
        return { success: false, message: "Resume not found or doesn't belong to you" };
      }
    }

    const updateData: Record<string, unknown> = { ...validated };

    if (validated.connectorParams === '') {
      updateData.connectorParams = null;
    }

    if (validated.scheduleHour !== undefined) {
      updateData.nextRunAt = calculateNextRunAt(validated.scheduleHour);
    }

    const automation = await prisma.automation.update({
      where: { id },
      data: updateData,
      include: {
        resume: {
          select: { id: true, title: true },
        },
      },
    });

    return {
      success: true,
      data: toAutomationWithResume(automation) as AutomationWithResume,
    };
  } catch (error) {
    return handleError(error, "Failed to update automation");
  }
}

export async function deleteAutomation(id: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const automation = await prisma.automation.findFirst({
      where: { id, userId: user.id },
    });

    if (!automation) {
      return { success: false, message: "Automation not found" };
    }

    await prisma.automation.delete({ where: { id } });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete automation");
  }
}

export async function pauseAutomation(id: string): Promise<ActionResult<AutomationWithResume>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const automation = await prisma.automation.findFirst({
      where: { id, userId: user.id },
    });

    if (!automation) {
      return { success: false, message: "Automation not found" };
    }

    const updated = await prisma.automation.update({
      where: { id },
      data: {
        status: "paused",
        nextRunAt: null,
      },
      include: {
        resume: {
          select: { id: true, title: true },
        },
      },
    });

    return {
      success: true,
      data: toAutomationWithResume(updated) as AutomationWithResume,
    };
  } catch (error) {
    return handleError(error, "Failed to pause automation");
  }
}

export async function resumeAutomation(id: string): Promise<ActionResult<AutomationWithResume>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const automation = await prisma.automation.findFirst({
      where: { id, userId: user.id },
    });

    if (!automation) {
      return { success: false, message: "Automation not found" };
    }

    const nextRunAt = calculateNextRunAt(automation.scheduleHour);

    const updated = await prisma.automation.update({
      where: { id },
      data: {
        status: "active",
        nextRunAt,
      },
      include: {
        resume: {
          select: { id: true, title: true },
        },
      },
    });

    return {
      success: true,
      data: toAutomationWithResume(updated) as AutomationWithResume,
    };
  } catch (error) {
    return handleError(error, "Failed to resume automation");
  }
}

export async function getDiscoveredJobs(options?: {
  automationId?: string;
  discoveryStatus?: DiscoveryStatus;
  page?: number;
  limit?: number;
  sortBy?: "matchScore" | "discoveredAt";
  sortOrder?: "asc" | "desc";
}): Promise<ActionResult<DiscoveredJob[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const {
      automationId,
      discoveryStatus,
      page = 1,
      limit = APP_CONSTANTS.RECORDS_PER_PAGE,
      sortBy = "matchScore",
      sortOrder = "desc",
    } = options || {};

    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {
      userId: user.id,
      automationId: { not: null },
    };

    if (automationId) {
      where.automationId = automationId;
    }

    if (discoveryStatus) {
      where.discoveryStatus = discoveryStatus;
    }

    const [jobs, total] = await Promise.all([
      prisma.job.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          automation: {
            select: { id: true, name: true },
          },
          JobTitle: { select: { label: true } },
          Company: { select: { label: true } },
          Location: { select: { label: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    return {
      success: true,
      data: jobs.map(toDiscoveredJob) as DiscoveredJob[],
      total,
    };
  } catch (error) {
    return handleError(error, "Failed to get discovered jobs");
  }
}

export async function getDiscoveredJobById(id: string): Promise<ActionResult<DiscoveredJob & { parsedMatchData: object | null }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
      },
      include: {
        automation: {
          select: { id: true, name: true },
        },
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
        Location: { select: { label: true } },
      },
    });

    if (!job) {
      return { success: false, message: "Discovered job not found" };
    }

    let parsedMatchData = null;
    if (job.matchData) {
      try {
        parsedMatchData = JSON.parse(job.matchData);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      success: true,
      data: {
        ...toDiscoveredJob(job) as DiscoveredJob,
        parsedMatchData,
      },
    };
  } catch (error) {
    return handleError(error, "Failed to get discovered job");
  }
}

export async function dismissDiscoveredJob(id: string): Promise<ActionResult<DiscoveredJob>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
      },
    });

    if (!job) {
      return { success: false, message: "Discovered job not found" };
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { discoveryStatus: "dismissed" },
      include: {
        automation: {
          select: { id: true, name: true },
        },
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
        Location: { select: { label: true } },
      },
    });

    return {
      success: true,
      data: toDiscoveredJob(updated) as DiscoveredJob,
    };
  } catch (error) {
    return handleError(error, "Failed to dismiss discovered job");
  }
}

export async function acceptDiscoveredJob(id: string): Promise<ActionResult<DiscoveredJob>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const job = await prisma.job.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
      },
    });

    if (!job) {
      return { success: false, message: "Discovered job not found" };
    }

    const updated = await prisma.job.update({
      where: { id },
      data: { discoveryStatus: "accepted" },
      include: {
        automation: {
          select: { id: true, name: true },
        },
        JobTitle: { select: { label: true } },
        Company: { select: { label: true } },
        Location: { select: { label: true } },
      },
    });

    return {
      success: true,
      data: toDiscoveredJob(updated) as DiscoveredJob,
    };
  } catch (error) {
    return handleError(error, "Failed to accept discovered job");
  }
}

export async function getAutomationRuns(
  automationId: string,
  options?: {
    page?: number;
    limit?: number;
  }
): Promise<ActionResult<AutomationRun[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const { page = 1, limit = 10 } = options || {};
    const skip = (page - 1) * limit;

    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId: user.id },
    });

    if (!automation) {
      return { success: false, message: "Automation not found" };
    }

    const [runs, total] = await Promise.all([
      prisma.automationRun.findMany({
        where: { automationId },
        skip,
        take: limit,
        orderBy: { startedAt: "desc" },
      }),
      prisma.automationRun.count({ where: { automationId } }),
    ]);

    return {
      success: true,
      data: runs.map(toAutomationRun) as AutomationRun[],
      total,
    };
  } catch (error) {
    return handleError(error, "Failed to get automation runs");
  }
}
