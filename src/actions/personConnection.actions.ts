"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import {
  isValidConnectionKind,
  isValidConnectionStrength,
  INSIDE_TRACK_CONFIG,
} from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// personConnection.actions.ts — directed P2P network edges (Welle 5).
// SoT: specs/inside-track.allium rule AddPersonConnection + invariants
// NoSelfConnection / DistinctEndpointsPerUser. ADR-015: userId-scoped; user_id
// from the session, never client input.
// ---------------------------------------------------------------------------

interface AddPersonConnectionInput {
  fromPersonId: string;
  toPersonId: string;
  kind: string;
  strength: string;
  notes?: string | null;
}

export async function addPersonConnection(
  input: AddPersonConnectionInput,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    // NoSelfConnection
    if (input.fromPersonId === input.toPersonId) {
      return { success: false, message: "crm.errors.connectionSelf" };
    }
    // Controlled vocabularies (ADR-019 runtime guards)
    if (!isValidConnectionKind(input.kind) || !isValidConnectionStrength(input.strength)) {
      return { success: false, message: "crm.errors.invalidConnectionAttributes" };
    }

    // Both endpoints must belong to the user (IDOR).
    const owned = await prisma.person.count({
      where: { id: { in: [input.fromPersonId, input.toPersonId] }, userId: user.id },
    });
    if (owned < 2) return { success: false, message: "crm.errors.personNotFound" };

    // DistinctEndpointsPerUser — at most one edge per (user, from, to).
    const existing = await prisma.personConnection.findFirst({
      where: { userId: user.id, fromPersonId: input.fromPersonId, toPersonId: input.toPersonId },
      select: { id: true },
    });
    if (existing) return { success: false, message: "crm.errors.connectionExists" };

    // Per-user network cap.
    const count = await prisma.personConnection.count({ where: { userId: user.id } });
    if (count >= INSIDE_TRACK_CONFIG.maxConnectionsPerUser) {
      return { success: false, message: "crm.errors.connectionLimitReached" };
    }

    const conn = await prisma.personConnection.create({
      data: {
        userId: user.id,
        fromPersonId: input.fromPersonId,
        toPersonId: input.toPersonId,
        kind: input.kind,
        strength: input.strength,
        notes: input.notes ?? null,
      },
      select: { id: true },
    });
    return { success: true, data: { id: conn.id } };
  } catch (error) {
    // @@unique backstop for a race past the pre-check.
    if ((error as { code?: string })?.code === "P2002") {
      return { success: false, message: "crm.errors.connectionExists" };
    }
    return handleError(error);
  }
}

export async function removePersonConnection(
  connectionId: string,
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const entry = await prisma.personConnection.findFirst({
      where: { id: connectionId, userId: user.id },
      select: { id: true },
    });
    if (!entry) return { success: false, message: "crm.errors.connectionNotFound" };

    await prisma.personConnection.delete({ where: { id: connectionId } });
    return { success: true, data: { id: connectionId } };
  } catch (error) {
    return handleError(error);
  }
}

/** List the user's network edges, optionally filtered to one endpoint Person. */
export async function listPersonConnections(
  personId?: string,
): Promise<ActionResult<Record<string, unknown>[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    const where = personId
      ? { userId: user.id, OR: [{ fromPersonId: personId }, { toPersonId: personId }] }
      : { userId: user.id };

    const connections = await prisma.personConnection.findMany({
      where,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        fromPersonId: true,
        toPersonId: true,
        kind: true,
        strength: true,
        notes: true,
        createdAt: true,
      },
    });
    return { success: true, data: connections };
  } catch (error) {
    return handleError(error);
  }
}
