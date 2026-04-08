import "server-only";

/**
 * LogoAssetSubscriber — Event Bus Consumer
 *
 * Subscribes to EnrichmentCompleted where dimension === "logo".
 * Resolves companyId from EnrichmentResult, guards against duplicate downloads,
 * and fires-and-forgets the download pipeline.
 *
 * Follows enrichment-trigger.ts subscriber pattern.
 */

import { eventBus } from "@/lib/events/event-bus";
import { DomainEventType } from "@/lib/events/event-types";
import type {
  DomainEvent,
  EnrichmentCompletedPayload,
} from "@/lib/events/event-types";
import { logoAssetService } from "./logo-asset-service";
import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Domain Base Extraction (reverse lookup: domain → company name)
// ---------------------------------------------------------------------------

/**
 * Extract the base name from a domain key for company lookup.
 * E.g. "acme.co.uk" → "acme", "www.example.com" → "example"
 *
 * This is specific to the reverse-lookup use case (domain → company name),
 * distinct from the forward extractDomain() in domain-extractor.ts.
 */
function extractDomainBase(domainKey: string): string {
  // Remove protocol if present
  let domain = domainKey.replace(/^https?:\/\//, "");
  // Remove www prefix
  domain = domain.replace(/^www\./, "");
  // Split by dots and take the first part (e.g., "acme" from "acme.co.uk")
  const parts = domain.split(".");
  return parts[0]?.toLowerCase() || domain.toLowerCase();
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handleEnrichmentCompleted(
  event: DomainEvent<typeof DomainEventType.EnrichmentCompleted>,
): Promise<void> {
  const payload = event.payload as EnrichmentCompletedPayload;

  // Only handle logo dimension
  if (payload.dimension !== "logo") return;

  const { userId, domainKey } = payload;

  // Resolve the enrichment result to get the logo URL and companyId
  let enrichmentResult;
  try {
    enrichmentResult = await db.enrichmentResult.findUnique({
      where: {
        userId_dimension_domainKey: {
          userId,
          dimension: "logo",
          domainKey,
        },
      },
      select: {
        companyId: true,
        data: true,
        status: true,
      },
    });
  } catch (error) {
    console.error(
      "[LogoAssetSubscriber] Failed to query enrichment result:",
      error,
    );
    return;
  }

  if (!enrichmentResult || enrichmentResult.status !== "found") {
    console.debug(
      `[LogoAssetSubscriber] No successful enrichment result for domain "${domainKey}"`,
    );
    return;
  }

  // Extract logo URL from enrichment data
  let logoUrl: string | null = null;
  try {
    const data =
      typeof enrichmentResult.data === "string"
        ? (JSON.parse(enrichmentResult.data) as Record<string, unknown>)
        : (enrichmentResult.data as Record<string, unknown>);
    logoUrl = (data?.logoUrl as string) ?? null;
  } catch {
    console.debug(
      "[LogoAssetSubscriber] Failed to parse enrichment data for logo URL",
    );
    return;
  }

  if (!logoUrl) {
    console.debug(
      "[LogoAssetSubscriber] No logoUrl in enrichment result data",
    );
    return;
  }

  // Resolve companyId — enrichment result may have it linked
  let companyId = enrichmentResult.companyId;

  if (!companyId) {
    // Fallback: find a company by domain-based lookup
    // The domainKey is typically the company domain (e.g., "acme.com")
    // Use prefix match (startsWith) instead of substring match (contains)
    // to avoid false positives and enable index usage.
    try {
      const domainBase = extractDomainBase(domainKey);
      const company = await db.company.findFirst({
        where: {
          createdBy: userId,
          value: { startsWith: domainBase },
        },
        select: { id: true },
      });
      companyId = company?.id ?? null;
    } catch {
      // Lookup failure — cannot proceed
    }
  }

  if (!companyId) {
    console.debug(
      `[LogoAssetSubscriber] Cannot resolve companyId for domain "${domainKey}"`,
    );
    return;
  }

  // Guard: check existing LogoAsset status
  try {
    const existing = await db.logoAsset.findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { status: true, sourceUrl: true },
    });

    if (existing) {
      // Skip if pending (concurrent download guard)
      if (existing.status === "pending") {
        console.debug(
          `[LogoAssetSubscriber] Skipping — download already pending for company ${companyId}`,
        );
        return;
      }

      // Skip if same URL and already ready
      if (existing.status === "ready" && existing.sourceUrl === logoUrl) {
        console.debug(
          `[LogoAssetSubscriber] Skipping — same URL already cached for company ${companyId}`,
        );
        return;
      }
    }
  } catch {
    // Guard check failed — proceed with download anyway
  }

  // Fire-and-forget download
  console.debug(
    `[LogoAssetSubscriber] Triggering download for company ${companyId}: ${logoUrl}`,
  );

  logoAssetService
    .downloadAndProcess(logoUrl, userId, companyId)
    .catch((error) => {
      console.error(
        "[LogoAssetSubscriber] Fire-and-forget download failed:",
        error,
      );
    });
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerLogoAssetSubscriber(): void {
  eventBus.subscribe(DomainEventType.EnrichmentCompleted, handleEnrichmentCompleted);
}
