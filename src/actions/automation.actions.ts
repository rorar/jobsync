"use server";

import prisma from "@/lib/db";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/utils/user.utils";
import { calculateNextRunAt, type ScheduleFrequency } from "@/lib/connector/job-discovery/schedule";
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
  JobBoard,
} from "@/models/automation.model";
import type {
  StagedVacancyWithAutomation,
  StagedVacancyStatus,
} from "@/models/stagedVacancy.model";
import { APP_CONSTANTS } from "@/lib/constants";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { validateConnectorParams } from "@/lib/connector/params-validator";
import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/job-discovery/connectors"; // ensure module registration
import { getAutomationSettingsForUser } from "@/actions/userSettings.actions";

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

    // Soft warning when automation count exceeds user's configured threshold.
    // Convention: result.message is overloaded — a "performanceWarning:<count>" prefix
    // signals a non-error warning to the UI layer, which checks for the prefix in
    // AutomationWizard.onSubmit to show a separate toast. This avoids adding a
    // dedicated "warnings" field to ActionResult for a single use case.
    let warning: string | undefined;
    const automationSettings = await getAutomationSettingsForUser(user.id);
    if (
      automationSettings.performanceWarningEnabled &&
      total >= automationSettings.performanceWarningThreshold
    ) {
      warning = `performanceWarning:${total}`;
    }

    return {
      success: true,
      data: automations.map(toAutomationWithResume) as AutomationWithResume[],
      total,
      message: warning,
    };
  } catch (error) {
    return handleError(error, "errors.fetchAutomationsList");
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
    return handleError(error, "errors.fetchAutomation");
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

    // S-1: Validate jobBoard against module registry
    const registered = moduleRegistry.get(validated.jobBoard);
    if (!registered) {
      return { success: false, message: `Unknown module: ${validated.jobBoard}` };
    }

    // S-9: Normalize empty string connectorParams to undefined
    if (validated.connectorParams === '') {
      validated.connectorParams = undefined;
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

    // Validate connectorParams against module's declared schema
    if (validated.connectorParams) {
      let params: unknown;
      try {
        params =
          typeof validated.connectorParams === "string"
            ? JSON.parse(validated.connectorParams)
            : validated.connectorParams;
      } catch {
        return { success: false, message: "Invalid connector params: malformed JSON" };
      }
      const validation = validateConnectorParams(
        validated.jobBoard,
        params as Record<string, unknown>,
      );
      if (!validation.valid) {
        return {
          success: false,
          message: `Invalid connector params: ${validation.errors?.join(", ")}`,
        };
      }
    }

    const nextRunAt = calculateNextRunAt(validated.scheduleHour, validated.scheduleFrequency as ScheduleFrequency);

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
        scheduleFrequency: validated.scheduleFrequency,
        nextRunAt,
        status: "active",
      },
      include: {
        resume: {
          select: { id: true, title: true },
        },
      },
    });

    // Soft warning when automation count exceeds user's configured threshold.
    // See getAutomationsList for the "performanceWarning:" prefix convention.
    let warning: string | undefined;
    const automationCount = await prisma.automation.count({ where: { userId: user.id } });
    const automationSettings = await getAutomationSettingsForUser(user.id);
    if (
      automationSettings.performanceWarningEnabled &&
      automationCount >= automationSettings.performanceWarningThreshold
    ) {
      warning = `performanceWarning:${automationCount}`;
    }

    return {
      success: true,
      data: toAutomationWithResume(automation) as AutomationWithResume,
      message: warning,
    };
  } catch (error) {
    return handleError(error, "errors.createAutomation");
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

    // S-1: Validate jobBoard against module registry (if provided in partial update)
    if (validated.jobBoard) {
      const registered = moduleRegistry.get(validated.jobBoard);
      if (!registered) {
        return { success: false, message: `Unknown module: ${validated.jobBoard}` };
      }
    }

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

    // Validate connectorParams against module's declared schema
    if (validated.connectorParams && validated.connectorParams !== '') {
      let params: unknown;
      try {
        params =
          typeof validated.connectorParams === "string"
            ? JSON.parse(validated.connectorParams)
            : validated.connectorParams;
      } catch {
        return { success: false, message: "Invalid connector params: malformed JSON" };
      }
      const moduleId = validated.jobBoard ?? existing.jobBoard;
      const validation = validateConnectorParams(
        moduleId,
        params as Record<string, unknown>,
      );
      if (!validation.valid) {
        return {
          success: false,
          message: `Invalid connector params: ${validation.errors?.join(", ")}`,
        };
      }
    }

    const updateData: Record<string, unknown> = { ...validated };

    if (validated.connectorParams === '') {
      updateData.connectorParams = null;
    }

    if (validated.scheduleHour !== undefined || validated.scheduleFrequency !== undefined) {
      const hour = validated.scheduleHour ?? existing.scheduleHour;
      const freq = (validated.scheduleFrequency ?? existing.scheduleFrequency) as ScheduleFrequency;
      updateData.nextRunAt = calculateNextRunAt(hour, freq);
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
    return handleError(error, "errors.updateAutomation");
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

    // Guard: cannot delete while running (prevents RecordNotFound in finalizeRun)
    const { runCoordinator } = await import("@/lib/scheduler/run-coordinator");
    if (runCoordinator.getRunStatus(id)) {
      return { success: false, message: "Cannot delete: automation is currently running" };
    }

    await prisma.automation.delete({ where: { id } });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteAutomation");
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
    return handleError(error, "errors.pauseAutomation");
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

    const nextRunAt = calculateNextRunAt(
      automation.scheduleHour,
      automation.scheduleFrequency as ScheduleFrequency
    );

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
    return handleError(error, "errors.resumeAutomation");
  }
}

export async function getDiscoveredJobs(
  automationId: string,
  page: number = 1,
  limit: number = 20,
  statusFilter?: StagedVacancyStatus[],
): Promise<ActionResult<StagedVacancyWithAutomation[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const skip = (page - 1) * limit;
    const where: Prisma.StagedVacancyWhereInput = {
      userId: user.id,
      automationId,
      trashedAt: null,
    };
    if (statusFilter && statusFilter.length > 0) {
      where.status = { in: statusFilter };
    }

    const [data, total] = await Promise.all([
      prisma.stagedVacancy.findMany({
        where,
        include: { automation: { select: { id: true, name: true } } },
        orderBy: { discoveredAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.stagedVacancy.count({ where }),
    ]);

    return {
      success: true,
      data: data.map((d) => ({
        ...d,
        status: d.status as StagedVacancyStatus,
        source: d.source as "manual" | "automation",
      })) as StagedVacancyWithAutomation[],
      total,
    };
  } catch (error) {
    return handleError(error, "errors.fetchDiscoveredJobs");
  }
}

export async function getDiscoveredJobById(id: string): Promise<ActionResult<StagedVacancyWithAutomation & { parsedMatchData: object | null }>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
        trashedAt: null,
      },
      include: {
        automation: {
          select: { id: true, name: true },
        },
      },
    });

    if (!vacancy) {
      return { success: false, message: "Discovered job not found" };
    }

    let parsedMatchData = null;
    if (vacancy.matchData) {
      try {
        parsedMatchData = JSON.parse(vacancy.matchData);
      } catch {
        // Ignore parse errors
      }
    }

    return {
      success: true,
      data: {
        ...vacancy,
        status: vacancy.status as StagedVacancyStatus,
        source: vacancy.source as "manual" | "automation",
        parsedMatchData,
      } as StagedVacancyWithAutomation & { parsedMatchData: object | null },
    };
  } catch (error) {
    return handleError(error, "errors.fetchDiscoveredJob");
  }
}

export async function dismissDiscoveredJob(id: string): Promise<ActionResult<StagedVacancyWithAutomation>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
        trashedAt: null,
      },
    });

    if (!vacancy) {
      return { success: false, message: "Discovered job not found" };
    }

    if (vacancy.status !== "staged" && vacancy.status !== "ready") {
      return { success: false, message: "Can only dismiss staged or ready vacancies" };
    }

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { status: "dismissed" },
      include: {
        automation: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        status: updated.status as StagedVacancyStatus,
        source: updated.source as "manual" | "automation",
      } as StagedVacancyWithAutomation,
    };
  } catch (error) {
    return handleError(error, "errors.dismissDiscoveredJob");
  }
}

export async function acceptDiscoveredJob(id: string): Promise<ActionResult<StagedVacancyWithAutomation>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "Not authenticated" };
    }

    const vacancy = await prisma.stagedVacancy.findFirst({
      where: {
        id,
        userId: user.id,
        automationId: { not: null },
        trashedAt: null,
      },
    });

    if (!vacancy) {
      return { success: false, message: "Discovered job not found" };
    }

    const updated = await prisma.stagedVacancy.update({
      where: { id },
      data: { status: "ready" },
      include: {
        automation: {
          select: { id: true, name: true },
        },
      },
    });

    return {
      success: true,
      data: {
        ...updated,
        status: updated.status as StagedVacancyStatus,
        source: updated.source as "manual" | "automation",
      } as StagedVacancyWithAutomation,
    };
  } catch (error) {
    return handleError(error, "errors.acceptDiscoveredJob");
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
    return handleError(error, "errors.fetchAutomationRuns");
  }
}
