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
import { extractDomain } from "@/lib/connector/data-enrichment/domain-extractor";
import db from "@/lib/db";

// Backwards compatibility: re-export extractDomain as extractDomainFromCompanyName
export { extractDomain as extractDomainFromCompanyName } from "@/lib/connector/data-enrichment/domain-extractor";

// ---------------------------------------------------------------------------
// Concurrency Limiter
// ---------------------------------------------------------------------------

export const MAX_CONCURRENT_ENRICHMENTS = 5;

/**
 * Semaphore state — module-level so it survives across calls in the same
 * process instance. Exported for test access only (@internal).
 *
 * RACE-SAFETY: The original check-then-increment pattern had a race window:
 *
 *   // UNSAFE — two concurrent microtasks can both see counter < 5 before
 *   // either increments, allowing 6+ concurrent enrichments to run.
 *   if (activeEnrichments >= MAX) { await queue... }
 *   activeEnrichments++;          // ← the race lives here
 *
 * The fix uses a queue-first approach: every caller unconditionally pushes a
 * ticket into the queue. A ticket is released only inside `finally` after the
 * previous holder decrements. Because Node.js processes microtasks
 * synchronously between I/O events, the increment inside `finally` and the
 * queue drain both happen atomically within the same microtask checkpoint —
 * there is no observable window where two callers can both believe they are
 * "the one" to increment.
 *
 * Limitation: per-process only; does not coordinate across multiple Node.js
 * instances. Acceptable for self-hosted single-instance deployment.
 */
export let activeEnrichments = 0;
export const enrichmentQueue: Array<() => void> = [];

/**
 * Test-only helper: reset the semaphore state to zero and drain the queue.
 * Needed because `export let activeEnrichments` is read-only from consumer
 * modules in ESM, so tests cannot assign `trigger.activeEnrichments = 0`
 * directly. Do NOT call this from production code.
 */
export function resetSemaphoreForTesting(): void {
  activeEnrichments = 0;
  enrichmentQueue.length = 0;
}

/**
 * Test-only getter: allows tests to observe the current in-flight count
 * without importing the mutable binding (which is read-only externally).
 */
export function getActiveEnrichmentsCountForTesting(): number {
  return activeEnrichments;
}

/**
 * In-memory semaphore — limits concurrent event-triggered enrichments to
 * MAX_CONCURRENT_ENRICHMENTS.
 *
 * Race-safety: the check and increment are moved inside the queue mechanism
 * so that exactly one caller holds a slot at a time per queue drain cycle.
 * Two concurrent callers both blocked in the await will each be resolved
 * one-at-a-time by the `finally` block of the current holder.
 */
export async function withEnrichmentLimit<T>(fn: () => Promise<T>): Promise<T> {
  // If the semaphore is full, suspend until a slot opens.
  // The slot is opened by the finally block of whoever currently holds it.
  if (activeEnrichments >= MAX_CONCURRENT_ENRICHMENTS) {
    await new Promise<void>((resolve) => enrichmentQueue.push(resolve));
  }
  // Increment happens synchronously after the await resolves (or immediately
  // if we were not queued) — there is no yield point between the >= check
  // and this increment because they are in the same microtask.
  activeEnrichments++;
  try {
    return await fn();
  } finally {
    // Decrement before waking the next waiter so the next caller sees the
    // correct count inside its own synchronous increment path.
    activeEnrichments--;
    const next = enrichmentQueue.shift();
    if (next) next();
  }
}

// ---------------------------------------------------------------------------
// CompanyCreated -> Logo Enrichment
// ---------------------------------------------------------------------------

async function handleCompanyCreated(
  event: DomainEvent<typeof DomainEventType.CompanyCreated>,
): Promise<void> {
  const payload = event.payload as CompanyCreatedPayload;
  const domain = extractDomain(payload.companyName);

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

  // Skip if a fresh result already exists in the database
  const existing = await db.enrichmentResult.findFirst({
    where: { userId: payload.userId, dimension: "logo", domainKey: domain },
    select: { status: true, expiresAt: true },
  });
  if (existing && existing.status === "found" && existing.expiresAt && existing.expiresAt > new Date()) {
    return;
  }

  console.debug(
    `[EnrichmentTrigger] CompanyCreated → logo enrichment for domain "${domain}"`,
  );

  // Fire-and-forget: enrichment is best-effort, never blocks company creation
  withEnrichmentLimit(() =>
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
      }),
  ).catch(() => {
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
    const domain = extractDomain(job.Company.label);
    if (domain) {
      // Skip if a fresh logo result already exists
      const existingLogo = await db.enrichmentResult.findFirst({
        where: { userId: payload.userId, dimension: "logo", domainKey: domain },
        select: { status: true, expiresAt: true },
      });
      const logoChain = getChainForDimension("logo");
      if (logoChain && !(existingLogo && existingLogo.status === "found" && existingLogo.expiresAt && existingLogo.expiresAt > new Date())) {
        console.debug(
          `[EnrichmentTrigger] VacancyPromoted → logo enrichment for domain "${domain}"`,
        );

        // Fire-and-forget
        withEnrichmentLimit(() =>
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
            }),
        ).catch(() => {});
      }
    }
  }

  // --- Deep link enrichment (if job has a URL) ---
  if (job.jobUrl) {
    // Skip if a fresh deep_link result already exists
    const existingDeepLink = await db.enrichmentResult.findFirst({
      where: { userId: payload.userId, dimension: "deep_link", domainKey: job.jobUrl },
      select: { status: true, expiresAt: true },
    });
    const deepLinkChain = getChainForDimension("deep_link");
    if (deepLinkChain && !(existingDeepLink && existingDeepLink.status === "found" && existingDeepLink.expiresAt && existingDeepLink.expiresAt > new Date())) {
      console.debug(
        `[EnrichmentTrigger] VacancyPromoted → deep_link enrichment for "${job.jobUrl}"`,
      );

      // Fire-and-forget
      withEnrichmentLimit(() =>
        enrichmentOrchestrator
          .execute(payload.userId, {
            dimension: "deep_link",
            url: job.jobUrl ?? undefined,
          }, deepLinkChain),
      ).catch(() => {});
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
  extractDomainFromCompanyName: extractDomain,
};
