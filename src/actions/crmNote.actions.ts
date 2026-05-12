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

    // Activity log
    const firstTarget = input.targets[0];
    await prisma.crmActivityLog.create({
      data: {
        userId: user.id,
        activityType: "note_added",
        actorId: user.id,
        targetPersonId: firstTarget?.targetPersonId ?? null,
        targetJobId: firstTarget?.targetJobId ?? null,
        linkedRecordName: input.title ?? null,
      },
    });

    eventBus.publish(
      createEvent(DomainEventType.CrmNoteCreated, {
        noteId: note.id,
        userId: user.id,
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

    const data: Record<string, unknown> = {};
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
