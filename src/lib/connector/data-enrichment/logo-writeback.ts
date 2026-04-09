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
import { stripCredentialsFromUrl } from "@/lib/assets/logo-asset-service";

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

  // Defense-in-depth: strip credential parameters before writing to the DB.
  // This ensures that even if an upstream enrichment module (e.g. a future
  // module that does not pre-clean its URL the way logo-dev/index.ts does)
  // passes a tokenized URL, credentials never reach Company.logoUrl.
  const safeLogoUrl = stripCredentialsFromUrl(logoUrl);

  await db.company.updateMany({
    where: {
      id: companyId,
      createdBy: userId,
      logoUrl: null,
    },
    data: { logoUrl: safeLogoUrl },
  });
}
