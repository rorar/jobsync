"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { type BlocklistType, CRM_CONFIG } from "@/models/person.model";
import { isBlockedByEntries } from "@/lib/crm/blocklist-match";

const VALID_BLOCKLIST_TYPES: BlocklistType[] = ["email", "phone", "domain", "pattern"];

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

export async function addToBlocklist(
  handle: string,
  type: BlocklistType,
  reason?: string | null,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    if (!handle || !handle.trim()) {
      return { success: false, message: "crm.errors.handleRequired" };
    }

    if (!VALID_BLOCKLIST_TYPES.includes(type)) {
      return { success: false, message: "crm.errors.invalidBlocklistType" };
    }

    // Check limit
    const count = await prisma.crmBlocklist.count({ where: { userId: user.id } });
    if (count >= CRM_CONFIG.maxBlocklistEntries) {
      return { success: false, message: "crm.errors.blocklistLimitReached" };
    }

    // Check for duplicates (unique constraint: userId + handle)
    const existing = await prisma.crmBlocklist.findUnique({
      where: { userId_handle: { userId: user.id, handle: handle.trim().toLowerCase() } },
    });
    if (existing) {
      return { success: false, message: "crm.errors.handleAlreadyBlocked" };
    }

    const entry = await prisma.crmBlocklist.create({
      data: {
        userId: user.id,
        handle: handle.trim().toLowerCase(),
        type,
        reason: reason ?? null,
      },
    });

    return { success: true, data: { id: entry.id } };
  } catch (error) {
    return handleError(error);
  }
}

export async function removeFromBlocklist(
  entryId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const entry = await prisma.crmBlocklist.findFirst({
      where: { id: entryId, userId: user.id },
    });
    if (!entry) return { success: false, message: "crm.errors.blocklistEntryNotFound" };

    await prisma.crmBlocklist.delete({ where: { id: entryId } });

    return { success: true, data: { id: entryId } };
  } catch (error) {
    return handleError(error);
  }
}

export async function getBlocklist(filters?: {
  type?: BlocklistType;
}): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const where: Record<string, unknown> = { userId: user.id };
    if (filters?.type) where.type = filters.type;

    const entries = await prisma.crmBlocklist.findMany({
      where,
      orderBy: { createdAt: "desc" },
    });

    return { success: true, data: entries };
  } catch (error) {
    return handleError(error);
  }
}

export async function isHandleBlocked(
  handle: string,
): Promise<boolean> {
  try {
    const user = await getCurrentUser();
    if (!user) return false;

    const h = handle.trim().toLowerCase();
    if (!h) return false;

    // Fast path: exact email / phone / domain-literal handle.
    const exact = await prisma.crmBlocklist.findUnique({
      where: { userId_handle: { userId: user.id, handle: h } },
    });
    if (exact) return true;

    // Welle 3 (Gap-6): set evaluation for domain-suffix + glob-pattern entries.
    const fuzzy = await prisma.crmBlocklist.findMany({
      where: { userId: user.id, type: { in: ["domain", "pattern"] } },
      select: { type: true, handle: true },
    });
    return isBlockedByEntries(h, fuzzy);
  } catch {
    return false;
  }
}
