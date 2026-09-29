"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { type PolymorphicTarget, validateExactlyOneTarget, isConsentBlocked } from "@/models/person.model";
import { touchPersonsRetention } from "@/lib/crm/retention-policy";

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
        // GDPR Art. 7(3): no new processing on a consent-blocked contact.
        if (isConsentBlocked(person)) return { success: false, message: "crm.errors.consentWithdrawn" };
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

    // Last-activity retention clock (specs/crm.allium AutoCreatedHasRetention):
    // recording something ABOUT a contact is a deliberate act naming them, so it
    // re-bases their deadline. ALL person targets are touched, not just
    // `firstTarget` — the event payload carries only the first for timeline
    // placement, but every named Person is equally evidence of necessity.
    await touchPersonsRetention(
      user.id,
      input.targets.map((t) => t.targetPersonId),
    );

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

/**
 * Exactly one target. A note has no standalone identity — it is always read
 * through the entity it is about.
 */
export type CrmNoteTargetFilter =
  | { targetPersonId: string; targetJobId?: never; targetCompanyId?: never }
  | { targetJobId: string; targetPersonId?: never; targetCompanyId?: never }
  | { targetCompanyId: string; targetPersonId?: never; targetJobId?: never };

/**
 * Notes about one target.
 *
 * The filter is REQUIRED, and that is load-bearing rather than cosmetic. The
 * orphan-note prune (`src/lib/crm/orphan-targets.ts`) deletes a note left with no
 * live target, and it is only safe to do so because a note with no target is
 * unreachable — which holds precisely as long as every read goes through a
 * target. An unfiltered list view would silently turn that prune from "reaps
 * unreachable residue" into "deletes visible user data", and nothing would fail:
 * not a type, not a test, not `allium check`. `invariant NoteHasAtLeastOneTarget`
 * does not help — it asserts the state the prune produces, not that nothing reads
 * the state it destroys.
 *
 * So if a notes index page is ever wanted, the prune has to be reconsidered in
 * the same change. Making this parameter required is what forces that
 * conversation instead of leaving it to be discovered in production.
 */
export async function getCrmNotes(
  filter: CrmNoteTargetFilter,
): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const { targetPersonId, targetJobId, targetCompanyId } = filter ?? {};
    // ADR-019: the union above is erased at runtime, so re-assert it here — a
    // browser-callable "use server" export cannot rely on its call sites.
    if (!targetPersonId && !targetJobId && !targetCompanyId) {
      return { success: false, message: "errors.unknown" };
    }

    const where: Record<string, unknown> = {
      userId: user.id,
      targets: {
        some: {
          ...(targetPersonId ? { targetPersonId } : {}),
          ...(targetJobId ? { targetJobId } : {}),
          ...(targetCompanyId ? { targetCompanyId } : {}),
        },
      },
    };

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
