"use server";

import db from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { revalidatePath } from "next/cache";
import { checkRateLimit } from "@/lib/api/rate-limit";
import {
  enrichmentOrchestrator,
  getChainForDimension,
} from "@/lib/connector/data-enrichment/orchestrator";
import {
  ENRICHMENT_DIMENSIONS,
  ENRICHMENT_CONFIG,
  type EnrichmentDimension,
  type EnrichmentResult,
} from "@/lib/connector/data-enrichment/types";
import { applyLogoWriteback } from "@/lib/connector/data-enrichment/logo-writeback";

/** Per-user enrichment rate limit: 10 requests per minute */
const ENRICHMENT_RATE_LIMIT = 10;
const ENRICHMENT_WINDOW_MS = 60_000;

/**
 * In-memory tracker for in-flight enrichment requests per user.
 * Used to enforce MAX_CONCURRENT_PER_USER from ENRICHMENT_CONFIG.
 */
const gInflight = globalThis as unknown as { __enrichmentInflight?: Map<string, number> };
gInflight.__enrichmentInflight ??= new Map<string, number>();
const inflightMap = gInflight.__enrichmentInflight;

function incrementInflight(userId: string): boolean {
  const current = inflightMap.get(userId) ?? 0;
  if (current >= ENRICHMENT_CONFIG.MAX_CONCURRENT_PER_USER) {
    return false; // Would exceed limit
  }
  inflightMap.set(userId, current + 1);
  return true;
}

function decrementInflight(userId: string): void {
  const current = inflightMap.get(userId) ?? 0;
  if (current <= 1) {
    inflightMap.delete(userId);
  } else {
    inflightMap.set(userId, current - 1);
  }
}

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

    // Rate limiting: 10 enrichments per minute per user (Fix 3)
    const rateResult = checkRateLimit(`enrichment:${user.id}`, ENRICHMENT_RATE_LIMIT, ENRICHMENT_WINDOW_MS);
    if (!rateResult.allowed) {
      return { success: false, message: "enrichment.rateLimited" };
    }

    // Concurrency limiting: MAX_CONCURRENT_PER_USER (Fix 3)
    if (!incrementInflight(user.id)) {
      return { success: false, message: "enrichment.tooManyConcurrent" };
    }

    try {
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
        companyDomain: extractDomain(company.label) ?? undefined,
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

      // Link result to company if not yet linked (Fix 5: IDOR — userId in where)
      if (!result.companyId) {
        await db.enrichmentResult.updateMany({
          where: { id: result.id, userId: user.id },
          data: { companyId },
        });
      }

      // Logo writeback: shared helper updates Company.logoUrl if currently null
      if (dimension === "logo") {
        await applyLogoWriteback(db, user.id, companyId, output);
      }

      revalidatePath("/jobs");
      return { success: true, data: result };
    } finally {
      decrementInflight(user.id);
    }
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

    // Rate limiting: 10 enrichments per minute per user (Fix 3)
    const rateResult = checkRateLimit(`enrichment:${user.id}`, ENRICHMENT_RATE_LIMIT, ENRICHMENT_WINDOW_MS);
    if (!rateResult.allowed) {
      return { success: false, message: "enrichment.rateLimited" };
    }

    // Concurrency limiting: MAX_CONCURRENT_PER_USER (Fix 3)
    if (!incrementInflight(user.id)) {
      return { success: false, message: "enrichment.tooManyConcurrent" };
    }

    try {
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

      // Logo writeback on refresh: shared helper updates Company.logoUrl if currently null
      if (dimension === "logo" && refreshed.companyId) {
        await applyLogoWriteback(db, user.id, refreshed.companyId, output);
      }

      revalidatePath("/jobs");
      return { success: true, data: refreshed };
    } finally {
      decrementInflight(user.id);
    }
  } catch (error) {
    return handleError(error, "enrichment.refreshFailed");
  }
}

/**
 * Extract a domain from a company name.
 *
 * Strategy:
 * 1. If input already looks like a domain (contains dot, no spaces), use as-is.
 * 2. Otherwise strip common legal suffixes, lowercase, remove non-alphanumeric,
 *    and append ".com".
 * 3. Return null for names that can't be reasonably converted.
 */
function extractDomain(companyName: string): string | null {
  const trimmed = companyName.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // If it already looks like a domain (e.g. "acme.com")
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Strip common legal suffixes before converting to domain
  const cleaned = trimmed
    .replace(/\b(AG|GmbH|Inc\.?|Ltd\.?|SE|SA|SAS|Corp\.?|LLC|PLC|NV|BV)\b/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!cleaned || cleaned.length < 2) return null;

  return `${cleaned}.com`;
}
