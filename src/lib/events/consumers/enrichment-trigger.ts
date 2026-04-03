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
import db from "@/lib/db";

/**
 * Extract a plausible domain from a company name.
 * Simple heuristic: lowercase, remove non-alphanumeric chars, append ".com".
 * Returns null for very short names (likely not domain-like).
 */
export function extractDomainFromCompanyName(companyName: string): string | null {
  if (!companyName || companyName.trim().length < 2) return null;

  const cleaned = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (cleaned.length < 2) return null;

  return cleaned.concat(".com");
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

          // Logo writeback: update Company.logoUrl if currently null
          const logoData = typeof output.data === "string"
            ? JSON.parse(output.data) as Record<string, unknown>
            : output.data as Record<string, unknown>;
          const logoUrl = logoData?.logoUrl as string | undefined;
          if (logoUrl) {
            await db.company.updateMany({
              where: {
                id: payload.companyId,
                createdBy: payload.userId,
                logoUrl: null,
              },
              data: { logoUrl },
            });
          }
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

                // Logo writeback
                const logoData = typeof output.data === "string"
                  ? JSON.parse(output.data) as Record<string, unknown>
                  : output.data as Record<string, unknown>;
                const logoUrl = logoData?.logoUrl as string | undefined;
                if (logoUrl) {
                  await db.company.updateMany({
                    where: {
                      id: job!.Company!.id,
                      createdBy: payload.userId,
                      logoUrl: null,
                    },
                    data: { logoUrl },
                  });
                }
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
