import "server-only";

import prisma from "@/lib/db";

/**
 * Company aggregate — server-only repository writes for callers OUTSIDE the
 * Company bounded context (e.g. the Data-Enrichment event consumer).
 *
 * ADR-019: this lives in a `server-only` leaf — NOT a "use server" file — so the
 * raw owner-id parameter is never exposed as a callable Server Action. Callers
 * pass a trusted owner id from their own context (e.g. a `CompanyCreated` event
 * payload). Mirrors `src/lib/blacklist-query.ts`.
 */

/**
 * Set `Company.domain` iff it is currently unset, scoped to the owning user
 * (`createdBy`, ADR-015 IDOR). Best-effort and non-blocking: returns the number
 * of rows written and never throws — data enrichment is best-effort per
 * `specs/data-enrichment.allium`.
 *
 * Replaces the raw `db.company.updateMany` the enrichment consumer used to run
 * inline (D5 / A-05 bounded-context leak): the Company aggregate is now only
 * mutated through this named repository function, and the write is owner-scoped
 * (the prior inline write was not).
 */
export async function setCompanyDomainIfUnset(
  companyId: string,
  ownerUserId: string,
  domain: string,
): Promise<number> {
  try {
    const result = await prisma.company.updateMany({
      where: { id: companyId, createdBy: ownerUserId, domain: null },
      data: { domain },
    });
    return result.count;
  } catch {
    // Best-effort — a domain writeback failure must never block the event bus.
    return 0;
  }
}
