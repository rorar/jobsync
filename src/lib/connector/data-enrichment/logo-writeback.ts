/**
 * Shared Logo Writeback
 *
 * Extracts logoUrl from enrichment output and writes it to Company.logoUrl
 * if the current value is null (never overrides manual uploads).
 *
 * Used by:
 * - enrichment.actions.ts (manual enrichment via UI)
 * - enrichment-trigger.ts (automatic enrichment via Event Bus)
 *
 * IDOR: Caller must supply verified userId (from session or event payload).
 */

import type { PrismaClient } from "@prisma/client";
import type { EnrichmentOutput } from "./types";

/**
 * Write enrichment logo URL back to the Company record.
 *
 * Only writes when:
 * - dimension is "logo"
 * - output.status is "found"
 * - output.data contains a non-empty logoUrl
 * - Company.logoUrl is currently null (don't override manual uploads)
 *
 * @param db       - Prisma client instance
 * @param userId   - Owner userId for IDOR (ADR-015)
 * @param companyId - Company to update
 * @param output   - Enrichment orchestrator output
 */
export async function applyLogoWriteback(
  db: PrismaClient,
  userId: string,
  companyId: string,
  output: EnrichmentOutput,
): Promise<void> {
  if (output.status !== "found") return;

  const logoData =
    typeof output.data === "string"
      ? (JSON.parse(output.data) as Record<string, unknown>)
      : (output.data as Record<string, unknown>);

  const logoUrl = logoData?.logoUrl as string | undefined;
  if (!logoUrl) return;

  await db.company.updateMany({
    where: {
      id: companyId,
      createdBy: userId,
      logoUrl: null,
    },
    data: { logoUrl },
  });
}
