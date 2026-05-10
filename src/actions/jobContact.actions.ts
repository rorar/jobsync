"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";

function handleError(error: unknown): ActionResult<never> {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error("[jobContact.actions]", message);
  return { success: false, message };
}

export async function addJobContact(
  jobId: string,
  personId: string,
  role?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    // Verify job ownership
    const job = await prisma.job.findFirst({ where: { id: jobId, userId: user.id } });
    if (!job) return { success: false, message: "crm.errors.jobNotFound" };

    // Verify person ownership
    const person = await prisma.person.findFirst({ where: { id: personId, userId: user.id } });
    if (!person) return { success: false, message: "crm.errors.personNotFound" };

    const contact = await prisma.jobContact.create({
      data: {
        userId: user.id,
        jobId,
        personId,
        role: role ?? null,
      },
    });

    eventBus.publish(createEvent(DomainEventType.ContactUpdated, { personId, userId: user.id }));

    return { success: true, data: { id: contact.id } };
  } catch (error) {
    if ((error as any)?.code === "P2002") {
      return { success: false, message: "crm.errors.contactAlreadyLinked" };
    }
    return handleError(error);
  }
}

export async function removeJobContact(
  jobContactId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const entry = await prisma.jobContact.findFirst({
      where: { id: jobContactId, userId: user.id },
    });
    if (!entry) return { success: false, message: "crm.errors.jobContactNotFound" };

    await prisma.jobContact.delete({ where: { id: jobContactId } });

    eventBus.publish(createEvent(DomainEventType.ContactUpdated, { personId: entry.personId, userId: user.id }));

    return { success: true, data: { id: jobContactId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function getJobContactsForPerson(
  personId: string,
): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const contacts = await prisma.jobContact.findMany({
      where: { personId, userId: user.id },
      include: {
        job: {
          select: {
            id: true,
            JobTitle: { select: { label: true } },
            Company: { select: { label: true } },
            Status: { select: { value: true, label: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: contacts };
  } catch (error) {
    return handleError(error);
  }
}

export async function getJobContactsForJob(
  jobId: string,
): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const contacts = await prisma.jobContact.findMany({
      where: { jobId, userId: user.id },
      include: {
        person: {
          select: { id: true, firstName: true, lastName: true, headline: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: contacts };
  } catch (error) {
    return handleError(error);
  }
}
