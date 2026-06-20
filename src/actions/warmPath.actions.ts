"use server";

import "server-only";
import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";
import { handleError } from "@/lib/utils";
import { parseCompanies, isConsentBlocked } from "@/models/person.model";
import type { ConnectionStrength } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// warmPath.actions.ts — WarmPathFinder surface (Welle 5, Inside Track).
// SoT: specs/inside-track.allium surface WarmPathFinder. Read-only Open Host
// Service query over the viewer's CRM. ADR-015: userId-scoped; user_id from the
// session. @guarantee ExcludesConsentBlockedPersons: no consent-blocked Person
// is ever surfaced (1-hop OR any node of a 2-hop path).
// ---------------------------------------------------------------------------

export interface WarmPathInsider {
  personId: string;
  name: string;
  /** Past association (CompanyAssociation.endDate set) — still a valid door-opener. */
  isFormer: boolean;
  position?: string | null;
}

export interface WarmPathNetwork {
  connectionId: string;
  intermediaryId: string;
  intermediaryName: string;
  insiderId: string;
  insiderName: string;
  kind: string;
  strength: string;
}

export interface WarmPaths {
  insiders: WarmPathInsider[];
  networkPaths: WarmPathNetwork[];
}

const STRENGTH_RANK: Record<ConnectionStrength, number> = { close: 0, medium: 1, weak: 2 };

function fullName(p: { firstName?: string | null; lastName?: string | null }): string {
  return [p.firstName, p.lastName].filter(Boolean).join(" ");
}

type ConsentFields = { processingBasis: string; consentWithdrawnAt: Date | null };

/**
 * Reveal how the viewer is connected to a target company: 1-hop insiders
 * (contacts with a CompanyAssociation at the company, incl. former) + 2-hop
 * network paths (a contact who knows an insider via PersonConnection). Capped
 * at depth 2; consent-blocked persons excluded everywhere; ranked active>former
 * and by connection strength.
 */
export async function findWarmPaths(companyId: string): Promise<ActionResult<WarmPaths>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.notAuthenticated" };

    // 1-hop: coarse prefilter on the companies JSON text (mirrors the person
    // search prefilter), then exact-match the companyId in JS via parseCompanies.
    const candidates = await prisma.person.findMany({
      where: {
        userId: user.id,
        status: { not: "anonymized" },
        companies: { contains: companyId },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        companies: true,
        processingBasis: true,
        consentWithdrawnAt: true,
      },
    });

    const insiders: WarmPathInsider[] = [];
    for (const c of candidates) {
      if (isConsentBlocked(c as unknown as ConsentFields)) continue; // @guarantee
      const assoc = parseCompanies(c.companies).find((a) => a.companyId === companyId);
      if (!assoc) continue; // prefilter false-positive (substring match elsewhere)
      insiders.push({
        personId: c.id,
        name: fullName(c),
        isFormer: Boolean(assoc.endDate),
        position: assoc.position ?? null,
      });
    }
    // Rank: active associations before former ones.
    insiders.sort((a, b) => Number(a.isFormer) - Number(b.isFormer));

    if (insiders.length === 0) {
      return { success: true, data: { insiders: [], networkPaths: [] } };
    }

    // 2-hop: a contact (from_person) who knows an insider (to_person at the
    // company) via a directed PersonConnection.
    const insiderIds = insiders.map((i) => i.personId);
    const edges = await prisma.personConnection.findMany({
      where: { userId: user.id, toPersonId: { in: insiderIds } },
      include: {
        fromPerson: { select: { id: true, firstName: true, lastName: true, processingBasis: true, consentWithdrawnAt: true } },
        toPerson: { select: { id: true, firstName: true, lastName: true, processingBasis: true, consentWithdrawnAt: true } },
      },
    });

    const networkPaths: WarmPathNetwork[] = [];
    for (const e of edges) {
      // @guarantee: every Person on the path must be consent-unblocked.
      if (isConsentBlocked(e.fromPerson as unknown as ConsentFields)) continue;
      if (isConsentBlocked(e.toPerson as unknown as ConsentFields)) continue;
      networkPaths.push({
        connectionId: e.id,
        intermediaryId: e.fromPersonId,
        intermediaryName: fullName(e.fromPerson),
        insiderId: e.toPersonId,
        insiderName: fullName(e.toPerson),
        kind: e.kind,
        strength: e.strength,
      });
    }
    // Rank by connection strength (close > medium > weak); unknown last.
    networkPaths.sort(
      (a, b) =>
        (STRENGTH_RANK[a.strength as ConnectionStrength] ?? 99) -
        (STRENGTH_RANK[b.strength as ConnectionStrength] ?? 99),
    );

    return { success: true, data: { insiders, networkPaths } };
  } catch (error) {
    return handleError(error);
  }
}
