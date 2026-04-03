"use server";

import db from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { revalidatePath } from "next/cache";
import {
  enrichmentOrchestrator,
  getChainForDimension,
} from "@/lib/connector/data-enrichment/orchestrator";
import {
  ENRICHMENT_DIMENSIONS,
  type EnrichmentDimension,
  type EnrichmentResult,
} from "@/lib/connector/data-enrichment/types";

/**
 * Trigger enrichment for a company dimension.
 * Executes the fallback chain via the orchestrator.
 *
 * IDOR: userId from session, companyId ownership verified.
 */
export async function triggerEnrichment(
  companyId: string,
  dimension: EnrichmentDimension,
): Promise<ActionResult<EnrichmentResult>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "enrichment.notAuthenticated" };
    }

    // Validate dimension at runtime (TypeScript union erased)
    if (!ENRICHMENT_DIMENSIONS.includes(dimension)) {
      return { success: false, message: "enrichment.invalidDimension" };
    }

    // Verify company ownership (IDOR: ADR-015)
    const company = await db.company.findFirst({
      where: { id: companyId, createdBy: user.id },
      select: { id: true, label: true },
    });

    if (!company) {
      return { success: false, message: "enrichment.companyNotFound", errorCode: "NOT_FOUND" };
    }

    // Get the fallback chain for the requested dimension
    const chain = getChainForDimension(dimension);
    if (!chain) {
      return { success: false, message: "enrichment.noChainAvailable" };
    }

    // Build enrichment input from company data
    const input = {
      dimension,
      companyDomain: extractDomain(company.label),
      companyName: company.label,
    };

    // Execute the fallback chain
    const output = await enrichmentOrchestrator.execute(user.id, input, chain);

    if (!output) {
      return { success: false, message: "enrichment.allModulesFailed" };
    }

    // Fetch the persisted result to return
    const result = await db.enrichmentResult.findFirst({
      where: {
        userId: user.id,
        dimension,
        domainKey: input.companyDomain ?? input.companyName ?? "unknown",
      },
    });

    if (!result) {
      return { success: false, message: "enrichment.persistFailed" };
    }

    // Link result to company if not yet linked
    if (!result.companyId) {
      await db.enrichmentResult.update({
        where: { id: result.id },
        data: { companyId },
      });
    }

    revalidatePath("/jobs");
    return { success: true, data: result };
  } catch (error) {
    return handleError(error, "enrichment.triggerFailed");
  }
}

/**
 * Get enrichment status/results for a company.
 * Returns all enrichment results linked to the company.
 *
 * IDOR: userId from session, companyId ownership verified.
 */
export async function getEnrichmentStatus(
  companyId: string,
): Promise<ActionResult<EnrichmentResult[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "enrichment.notAuthenticated" };
    }

    // Verify company ownership (IDOR: ADR-015)
    const company = await db.company.findFirst({
      where: { id: companyId, createdBy: user.id },
      select: { id: true },
    });

    if (!company) {
      return { success: false, message: "enrichment.companyNotFound", errorCode: "NOT_FOUND" };
    }

    const results = await db.enrichmentResult.findMany({
      where: {
        userId: user.id,
        companyId,
      },
      orderBy: { updatedAt: "desc" },
    });

    return { success: true, data: results };
  } catch (error) {
    return handleError(error, "enrichment.statusFailed");
  }
}

/**
 * Get a specific enrichment result by dimension and domain key.
 * Returns null if no result exists.
 */
export async function getEnrichmentResult(
  dimension: EnrichmentDimension,
  domainKey: string,
): Promise<ActionResult<EnrichmentResult | null>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "enrichment.notAuthenticated" };
    }

    // Validate dimension at runtime
    if (!ENRICHMENT_DIMENSIONS.includes(dimension)) {
      return { success: false, message: "enrichment.invalidDimension" };
    }

    const result = await db.enrichmentResult.findFirst({
      where: {
        userId: user.id,
        dimension,
        domainKey,
      },
    });

    return { success: true, data: result ?? null };
  } catch (error) {
    return handleError(error, "enrichment.resultFailed");
  }
}

/**
 * Refresh an existing enrichment result by re-running the chain.
 * Used when a result is stale or the user wants a forced refresh.
 *
 * IDOR: userId from session, resultId ownership verified.
 */
export async function refreshEnrichment(
  resultId: string,
): Promise<ActionResult<EnrichmentResult>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, message: "enrichment.notAuthenticated" };
    }

    // Fetch existing result with ownership check (IDOR: ADR-015)
    const existing = await db.enrichmentResult.findFirst({
      where: { id: resultId, userId: user.id },
    });

    if (!existing) {
      return { success: false, message: "enrichment.resultNotFound", errorCode: "NOT_FOUND" };
    }

    const dimension = existing.dimension as EnrichmentDimension;

    // Validate dimension
    if (!ENRICHMENT_DIMENSIONS.includes(dimension)) {
      return { success: false, message: "enrichment.invalidDimension" };
    }

    const chain = getChainForDimension(dimension);
    if (!chain) {
      return { success: false, message: "enrichment.noChainAvailable" };
    }

    // Build enrichment input from existing result data
    const input = {
      dimension,
      companyDomain: existing.domainKey,
      companyName: existing.domainKey,
    };

    // Execute the fallback chain (will upsert over existing result)
    const output = await enrichmentOrchestrator.execute(user.id, input, chain);

    if (!output) {
      return { success: false, message: "enrichment.allModulesFailed" };
    }

    // Fetch the updated result
    const refreshed = await db.enrichmentResult.findFirst({
      where: { id: resultId, userId: user.id },
    });

    if (!refreshed) {
      return { success: false, message: "enrichment.persistFailed" };
    }

    revalidatePath("/jobs");
    return { success: true, data: refreshed };
  } catch (error) {
    return handleError(error, "enrichment.refreshFailed");
  }
}

/**
 * Extract a domain from a company name.
 * Simple heuristic: lowercase, remove spaces, append ".com".
 * In practice, modules handle domain resolution themselves.
 */
function extractDomain(companyName: string): string {
  return companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .concat(".com");
}
