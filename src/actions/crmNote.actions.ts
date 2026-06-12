"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { type PolymorphicTarget, validateExactlyOneTarget } from "@/models/person.model";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CreateNoteInput {
  title?: string | null;
  body: string;
  targets: PolymorphicTarget[];
}

const NOTE_SELECT = {
  id: true,
  userId: true,
  title: true,
  body: true,
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

export async function createCrmNote(
  input: CreateNoteInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    if (!input.targets || input.targets.length === 0) {
      return { success: false, message: "crm.errors.targetRequired" };
    }

    for (const target of input.targets) {
      if (!validateExactlyOneTarget(target)) {
        return { success: false, message: "crm.errors.exactlyOneTarget" };
      }
    }

    // IDOR: verify ownership of all referenced targets (ADR-015 CrossAggregateOwnership)
    for (const target of input.targets) {
      if (target.targetPersonId) {
        const person = await prisma.person.findFirst({ where: { id: target.targetPersonId, userId: user.id } });
        if (!person) return { success: false, message: "crm.errors.personNotFound" };
      }
      if (target.targetCompanyId) {
        const company = await prisma.company.findFirst({ where: { id: target.targetCompanyId, createdBy: user.id } });
        if (!company) return { success: false, message: "crm.errors.companyNotFound" };
      }
      if (target.targetJobId) {
        const job = await prisma.job.findFirst({ where: { id: target.targetJobId, userId: user.id } });
        if (!job) return { success: false, message: "crm.errors.jobNotFound" };
      }
    }

    const note = await prisma.crmNote.create({
      data: {
        userId: user.id,
        title: input.title ?? null,
        body: input.body,
        targets: {
          create: input.targets.map((t) => ({
            targetPersonId: t.targetPersonId ?? null,
            targetCompanyId: t.targetCompanyId ?? null,
            targetJobId: t.targetJobId ?? null,
          })),
        },
      },
    });

    // Activity log projected via crm-activity-logger consumer (TimelineProjection contract)
    const firstTarget = input.targets[0];
    eventBus.publish(
      createEvent(DomainEventType.CrmNoteCreated, {
        noteId: note.id,
        userId: user.id,
        targetPersonId: firstTarget?.targetPersonId ?? undefined,
        targetJobId: firstTarget?.targetJobId ?? undefined,
        targetCompanyId: firstTarget?.targetCompanyId ?? undefined,
      }),
    );

    return { success: true, data: { id: note.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function updateCrmNote(
  noteId: string,
  input: { title?: string | null; body?: string },
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const note = await prisma.crmNote.findFirst({
      where: { id: noteId, userId: user.id },
    });
    if (!note) return { success: false, message: "crm.errors.noteNotFound" };

    const data: Record<string, unknown> = {
      updatedByType: "user",
      updatedById: user.id,
    };
    if (input.title !== undefined) data.title = input.title;
    if (input.body !== undefined) data.body = input.body;

    await prisma.crmNote.update({
      where: { id: noteId },
      data,
    });

    return { success: true, data: { id: noteId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function deleteCrmNote(noteId: string): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const note = await prisma.crmNote.findFirst({
      where: { id: noteId, userId: user.id },
    });
    if (!note) return { success: false, message: "crm.errors.noteNotFound" };

    await prisma.crmNote.delete({ where: { id: noteId } });

    return { success: true, data: { id: noteId } };
  } catch (error) {
    return handleError(error);
  }
}

// ---------------------------------------------------------------------------
// Read queries
// ---------------------------------------------------------------------------

export async function getCrmNotes(filters?: {
  targetPersonId?: string;
  targetJobId?: string;
  targetCompanyId?: string;
}): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const where: Record<string, unknown> = { userId: user.id };

    if (filters?.targetPersonId || filters?.targetJobId || filters?.targetCompanyId) {
      where.targets = {
        some: {
          ...(filters.targetPersonId ? { targetPersonId: filters.targetPersonId } : {}),
          ...(filters.targetJobId ? { targetJobId: filters.targetJobId } : {}),
          ...(filters.targetCompanyId ? { targetCompanyId: filters.targetCompanyId } : {}),
        },
      };
    }

    const notes = await prisma.crmNote.findMany({
      where,
      select: NOTE_SELECT,
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: notes };
  } catch (error) {
    return handleError(error);
  }
}
