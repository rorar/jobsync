"use server";
import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { NoteFormSchema } from "@/models/note.schema";
import { Note, NoteResponse } from "@/models/note.model";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import { z } from "zod";

export const getNotesByJobId = async (
  jobId: string
): Promise<ActionResult<NoteResponse[]>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const job = await prisma.job.findFirst({
      where: { id: jobId, userId: user.id },
      select: { id: true },
    });
    if (!job) {
      throw new Error("Job not found");
    }

    const notes = await prisma.note.findMany({
      where: { jobId, userId: user.id },
      orderBy: { createdAt: "desc" },
    });

    const data: NoteResponse[] = notes.map((note) => ({
      ...note,
      isEdited: note.updatedAt.getTime() - note.createdAt.getTime() > 1000,
    }));

    return { success: true, data };
  } catch (error) {
    const msg = "errors.fetchFailed";
    return handleError(error, msg);
  }
};

export const addNote = async (
  data: z.infer<typeof NoteFormSchema>
): Promise<ActionResult<Note>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const validated = NoteFormSchema.parse(data);

    const job = await prisma.job.findFirst({
      where: { id: validated.jobId, userId: user.id },
      select: { id: true },
    });
    if (!job) {
      throw new Error("Job not found");
    }

    const note = await prisma.note.create({
      data: {
        jobId: validated.jobId,
        userId: user.id,
        content: validated.content,
      },
    });

    // GDPR audit trail (S6a): record a note added against a Job. The audited
    // target is the Job (no snapshot — note content is not copied into the
    // audit payload). Fire-and-forget, non-blocking.
    writeDataAuditLog({
      actorId: user.id,
      actorEmail: user.email,
      action: "job.note_add",
      targetType: "job",
      targetId: validated.jobId,
    });

    return { success: true, data: note };
  } catch (error) {
    const msg = "errors.createFailed";
    return handleError(error, msg);
  }
};

export const updateNote = async (
  data: z.infer<typeof NoteFormSchema>
): Promise<ActionResult<Note>> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    const validated = NoteFormSchema.parse(data);
    if (!validated.id) {
      throw new Error("Note ID is required for update");
    }

    const note = await prisma.note.update({
      where: { id: validated.id, userId: user.id },
      data: { content: validated.content },
    });

    return { success: true, data: note };
  } catch (error) {
    const msg = "errors.updateFailed";
    return handleError(error, msg);
  }
};

export const deleteNote = async (
  noteId: string
): Promise<ActionResult> => {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("errors.notAuthenticated");
    }

    await prisma.note.delete({
      where: { id: noteId, userId: user.id },
    });

    return { success: true };
  } catch (error) {
    const msg = "errors.deleteFailed";
    return handleError(error, msg);
  }
};
