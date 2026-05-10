"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import {
  type CrmTaskStatus,
  type PolymorphicTarget,
  isValidTaskTransition,
  validateExactlyOneTarget,
  CRM_CONFIG,
} from "@/models/person.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateTaskInput {
  title: string;
  description?: string | null;
  dueDate?: string | null;
  targets: PolymorphicTarget[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function handleError(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[crmTask.actions]", message);
  return { success: false, message };
}

const TASK_SELECT = {
  id: true,
  userId: true,
  title: true,
  description: true,
  dueDate: true,
  status: true,
  completedAt: true,
  createdAt: true,
  updatedAt: true,
  targets: {
    select: {
      id: true,
      targetPersonId: true,
      targetPerson: { select: { id: true, firstName: true, lastName: true } },
      targetCompanyId: true,
      targetCompany: { select: { id: true, label: true } },
      targetJobId: true,
      targetJob: { select: { id: true, JobTitle: { select: { label: true } }, Company: { select: { label: true } } } },
    },
  },
} as const;

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function createCrmTask(
  input: CreateTaskInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    if (!input.targets || input.targets.length === 0) {
      return { success: false, message: "crm.errors.targetRequired" };
    }

    // Validate each target
    for (const target of input.targets) {
      if (!validateExactlyOneTarget(target)) {
        return { success: false, message: "crm.errors.exactlyOneTarget" };
      }
    }

    // Check task limit
    const count = await prisma.crmTask.count({ where: { userId: user.id } });
    if (count >= CRM_CONFIG.maxTasksPerUser) {
      return { success: false, message: "crm.errors.taskLimitReached" };
    }

    const task = await prisma.crmTask.create({
      data: {
        userId: user.id,
        title: input.title,
        description: input.description ?? null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        status: "pending",
        targets: {
          create: input.targets.map((t) => ({
            targetPersonId: t.targetPersonId ?? null,
            targetCompanyId: t.targetCompanyId ?? null,
            targetJobId: t.targetJobId ?? null,
          })),
        },
      },
    });

    // Activity log
    const firstTarget = input.targets[0];
    await prisma.crmActivityLog.create({
      data: {
        userId: user.id,
        activityType: "task_created",
        actorId: user.id,
        targetPersonId: firstTarget?.targetPersonId ?? null,
        targetJobId: firstTarget?.targetJobId ?? null,
        linkedRecordName: input.title,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.CrmTaskCreated, {
        taskId: task.id,
        userId: user.id,
        title: input.title,
      }),
    );

    return { success: true, data: { id: task.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function startCrmTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const task = await prisma.crmTask.findFirst({
      where: { id: taskId, userId: user.id },
    });
    if (!task) return { success: false, message: "crm.errors.taskNotFound" };

    if (!isValidTaskTransition(task.status as CrmTaskStatus, "in_progress")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmTask.update({
      where: { id: taskId },
      data: { status: "in_progress" },
    });

    return { success: true, data: { id: taskId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function completeCrmTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const task = await prisma.crmTask.findFirst({
      where: { id: taskId, userId: user.id },
    });
    if (!task) return { success: false, message: "crm.errors.taskNotFound" };

    if (!isValidTaskTransition(task.status as CrmTaskStatus, "done")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmTask.update({
      where: { id: taskId },
      data: { status: "done", completedAt: new Date() },
    });

    // Activity log
    await prisma.crmActivityLog.create({
      data: {
        userId: user.id,
        activityType: "task_completed",
        actorId: user.id,
        linkedRecordName: task.title,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.CrmTaskCompleted, {
        taskId,
        userId: user.id,
        title: task.title,
      }),
    );

    return { success: true, data: { id: taskId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function cancelCrmTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const task = await prisma.crmTask.findFirst({
      where: { id: taskId, userId: user.id },
    });
    if (!task) return { success: false, message: "crm.errors.taskNotFound" };

    if (!isValidTaskTransition(task.status as CrmTaskStatus, "cancelled")) {
      return { success: false, message: "crm.errors.invalidTransition" };
    }

    await prisma.crmTask.update({
      where: { id: taskId },
      data: { status: "cancelled" },
    });

    return { success: true, data: { id: taskId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteCrmTask(taskId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const task = await prisma.crmTask.findFirst({
      where: { id: taskId, userId: user.id },
    });
    if (!task) return { success: false, message: "crm.errors.taskNotFound" };

    // Cascade delete targets via onDelete: Cascade
    await prisma.crmTask.delete({ where: { id: taskId } });

    return { success: true, data: { id: taskId } };
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function getCrmTasks(filters?: {
  status?: CrmTaskStatus;
  targetPersonId?: string;
  targetJobId?: string;
  overdue?: boolean;
}): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const where: Record<string, unknown> = { userId: user.id };
    if (filters?.status) where.status = filters.status;

    if (filters?.targetPersonId || filters?.targetJobId) {
      where.targets = {
        some: {
          ...(filters.targetPersonId ? { targetPersonId: filters.targetPersonId } : {}),
          ...(filters.targetJobId ? { targetJobId: filters.targetJobId } : {}),
        },
      };
    }

    if (filters?.overdue) {
      where.dueDate = { lte: new Date() };
      where.status = { in: ["pending", "in_progress"] };
    }

    const tasks = await prisma.crmTask.findMany({
      where,
      select: TASK_SELECT,
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
    });

    return { success: true, data: tasks };
  } catch (error) {
    return handleError(error);
  }
}
