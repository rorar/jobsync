/**
 * EnrichmentTrigger — Event Bus Consumer
 *
 * Subscribes to CompanyCreated and VacancyPromoted events to trigger
 * automatic data enrichment (logo, deep_link) via the orchestrator.
 *
 * All enrichment calls are fire-and-forget: errors are silently caught
 * and never visible to the user.
 *
 * Spec: specs/data-enrichment.allium (rules TriggerEnrichmentOnCompanyCreated,
 *       TriggerEnrichmentOnJobImported)
 */

import { eventBus } from "../event-bus";
import { DomainEventType } from "../event-types";
import type {
  DomainEvent,
  CompanyCreatedPayload,
  VacancyPromotedPayload,
} from "../event-types";
import {
  enrichmentOrchestrator,
  getChainForDimension,
} from "@/lib/connector/data-enrichment/orchestrator";
import { applyLogoWriteback } from "@/lib/connector/data-enrichment/logo-writeback";
import db from "@/lib/db";

/**
 * Extract a plausible domain from a company name.
 *
 * Strategy:
 * 1. If input already looks like a domain (contains dot, no spaces), use as-is.
 * 2. Otherwise strip common legal suffixes, lowercase, remove non-alphanumeric,
 *    and append ".com".
 * 3. Return null for names that can't be reasonably converted.
 */
export function extractDomainFromCompanyName(companyName: string): string | null {
  const trimmed = companyName?.trim();
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

// ---------------------------------------------------------------------------
// CompanyCreated -> Logo Enrichment
// ---------------------------------------------------------------------------

async function handleCompanyCreated(
  event: DomainEvent<typeof DomainEventType.CompanyCreated>,
): Promise<void> {
  const payload = event.payload as CompanyCreatedPayload;
  const domain = extractDomainFromCompanyName(payload.companyName);

  if (!domain) {
    console.debug(
      `[EnrichmentTrigger] Skipping CompanyCreated — no domain for "${payload.companyName}"`,
    );
    return;
  }

  const chain = getChainForDimension("logo");
  if (!chain) {
    console.debug("[EnrichmentTrigger] No fallback chain configured for logo dimension");
    return;
  }

  console.debug(
    `[EnrichmentTrigger] CompanyCreated → logo enrichment for domain "${domain}"`,
  );

  // Fire-and-forget: enrichment is best-effort, never blocks company creation
  enrichmentOrchestrator
    .execute(payload.userId, {
      dimension: "logo",
      companyDomain: domain,
      companyName: payload.companyName,
    }, chain)
    .then(async (output) => {
      // Link result to company if enrichment succeeded
      if (output && output.status === "found") {
        try {
          await db.enrichmentResult.updateMany({
            where: {
              userId: payload.userId,
              dimension: "logo",
              domainKey: domain,
              companyId: null,
            },
            data: { companyId: payload.companyId },
          });

          // Logo writeback via shared helper
          await applyLogoWriteback(db, payload.userId, payload.companyId, output);
        } catch {
          // Best-effort link — do not break on failure
        }
      }
    })
    .catch(() => {
      // Silently swallow enrichment errors — spec: best-effort
    });
}

// ---------------------------------------------------------------------------
// VacancyPromoted -> Logo + DeepLink Enrichment
// ---------------------------------------------------------------------------

async function handleVacancyPromoted(
  event: DomainEvent<typeof DomainEventType.VacancyPromoted>,
): Promise<void> {
  const payload = event.payload as VacancyPromotedPayload;

  // Look up the created job to find company and URL (IDOR: userId in where)
  let job;
  try {
    job = await db.job.findFirst({
      where: { id: payload.jobId, userId: payload.userId },
      select: {
        companyId: true,
        jobUrl: true,
        Company: { select: { id: true, label: true } },
      },
    });
  } catch {
    // DB read failure — cannot enrich without job data
    return;
  }

  if (!job) return;

  // --- Logo enrichment (if company has a domain) ---
  if (job.Company) {
    const domain = extractDomainFromCompanyName(job.Company.label);
    if (domain) {
      const logoChain = getChainForDimension("logo");
      if (logoChain) {
        console.debug(
          `[EnrichmentTrigger] VacancyPromoted → logo enrichment for domain "${domain}"`,
        );

        // Fire-and-forget
        enrichmentOrchestrator
          .execute(payload.userId, {
            dimension: "logo",
            companyDomain: domain,
            companyName: job.Company.label,
          }, logoChain)
          .then(async (output) => {
            if (output && output.status === "found" && job!.Company) {
              try {
                // Link result to company
                await db.enrichmentResult.updateMany({
                  where: {
                    userId: payload.userId,
                    dimension: "logo",
                    domainKey: domain,
                    companyId: null,
                  },
                  data: { companyId: job!.Company.id },
                });

                // Logo writeback via shared helper
                await applyLogoWriteback(db, payload.userId, job!.Company.id, output);
              } catch {
                // Best-effort
              }
            }
          })
          .catch(() => {});
      }
    }
  }

  // --- Deep link enrichment (if job has a URL) ---
  if (job.jobUrl) {
    const deepLinkChain = getChainForDimension("deep_link");
    if (deepLinkChain) {
      console.debug(
        `[EnrichmentTrigger] VacancyPromoted → deep_link enrichment for "${job.jobUrl}"`,
      );

      // Fire-and-forget
      enrichmentOrchestrator
        .execute(payload.userId, {
          dimension: "deep_link",
          url: job.jobUrl,
        }, deepLinkChain)
        .catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerEnrichmentTrigger(): void {
  eventBus.subscribe(DomainEventType.CompanyCreated, handleCompanyCreated);
  eventBus.subscribe(DomainEventType.VacancyPromoted, handleVacancyPromoted);
}

// ---------------------------------------------------------------------------
// Test Helpers (exported for test access)
// ---------------------------------------------------------------------------

/** @internal -- exposed for tests only */
export const _testHelpers = {
  handleCompanyCreated,
  handleVacancyPromoted,
  extractDomainFromCompanyName,
};
