/**
 * Enrichment Orchestrator — Core Enrichment Engine
 *
 * Implements the fallback chain logic for data enrichment.
 * Walks the chain in priority order. First success wins.
 * Inactive, unhealthy, or circuit-broken modules are skipped.
 *
 * See: specs/data-enrichment (FallbackChain rules)
 */

import { randomUUID } from "node:crypto";
import { moduleRegistry } from "../registry";
import {
  ModuleStatus,
  HealthStatus,
  CircuitBreakerState,
} from "../manifest";
import { emitEvent, createEvent, DomainEventTypes } from "@/lib/events";
import db from "@/lib/db";
import { connectorCache, ConnectorCache } from "../cache";
import type {
  EnrichmentInput,
  EnrichmentOutput,
  EnrichmentDimension,
  FallbackChainConfig,
  DataEnrichmentConnector,
} from "./types";
import { ENRICHMENT_CONFIG } from "./types";

// ==========================================
// Default Fallback Chains
// ==========================================

export const DEFAULT_CHAINS: FallbackChainConfig[] = [
  {
    dimension: "logo",
    entries: [
      { moduleId: "clearbit", priority: 1 },
      { moduleId: "google_favicon", priority: 2 },
    ],
  },
  {
    dimension: "deep_link",
    entries: [
      { moduleId: "meta_parser", priority: 1 },
    ],
  },
];

/**
 * Get the fallback chain for a given dimension.
 * Returns the default chain, sorted by priority (ascending).
 */
export function getChainForDimension(
  dimension: EnrichmentDimension,
): FallbackChainConfig | undefined {
  const chain = DEFAULT_CHAINS.find((c) => c.dimension === dimension);
  if (!chain) return undefined;
  return {
    ...chain,
    entries: [...chain.entries].sort((a, b) => a.priority - b.priority),
  };
}

// ==========================================
// Cache helpers
// ==========================================

/** Build a cache key for enrichment results */
function buildEnrichmentCacheKey(dimension: string, domainKey: string): string {
  return ConnectorCache.buildKey({
    module: "enrichment",
    operation: dimension,
    params: domainKey,
  });
}

/**
 * Get TTL in seconds for a given dimension.
 */
function getTtlForDimension(dimension: EnrichmentDimension): number {
  switch (dimension) {
    case "logo":
      return ENRICHMENT_CONFIG.LOGO_TTL_SECONDS;
    case "deep_link":
      return ENRICHMENT_CONFIG.DEEP_LINK_TTL_SECONDS;
    default:
      return ENRICHMENT_CONFIG.DEEP_LINK_TTL_SECONDS;
  }
}

// ==========================================
// Orchestrator
// ==========================================

export class EnrichmentOrchestrator {
  /**
   * Execute enrichment for a given dimension and input.
   * Walks the fallback chain, skipping inactive/unhealthy modules.
   * First success wins -- remaining modules are not called.
   * Returns EnrichmentOutput on success, null on total failure.
   */
  async execute(
    userId: string,
    input: EnrichmentInput,
    chain: FallbackChainConfig,
  ): Promise<EnrichmentOutput | null> {
    const requestId = randomUUID();
    const domainKey = this.buildDomainKey(input);
    const sortedEntries = [...chain.entries].sort((a, b) => a.priority - b.priority);

    // Check in-memory cache first
    const cached = connectorCache.get<EnrichmentOutput>(
      buildEnrichmentCacheKey(input.dimension, domainKey),
    );
    if (cached) {
      return cached;
    }

    // Chain timeout: abort all attempts if total time exceeds limit
    const chainDeadline = Date.now() + ENRICHMENT_CONFIG.CHAIN_TIMEOUT_MS;

    for (let i = 0; i < sortedEntries.length; i++) {
      const entry = sortedEntries[i];

      // Check chain timeout
      if (Date.now() >= chainDeadline) {
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, "timeout", 0, "Chain timeout exceeded");
        break;
      }

      // Skip inactive modules
      const registered = moduleRegistry.get(entry.moduleId);
      if (!registered || registered.status !== ModuleStatus.ACTIVE) {
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, "skipped", 0, "Module inactive");
        continue;
      }

      // Skip unhealthy modules (UNREACHABLE or DEGRADED — Fix 9)
      if (registered.healthStatus === HealthStatus.UNREACHABLE || registered.healthStatus === HealthStatus.DEGRADED) {
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, "skipped", 0, `Module ${registered.healthStatus}`);
        continue;
      }

      // Skip circuit-broken modules
      if (registered.circuitBreakerState === CircuitBreakerState.OPEN) {
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, "skipped", 0, "Circuit breaker open");
        continue;
      }

      // Execute module with timeout
      const startMs = Date.now();
      try {
        const connector = moduleRegistry.create(entry.moduleId) as DataEnrichmentConnector;
        const result = await Promise.race([
          connector.enrich(input),
          this.createTimeout(ENRICHMENT_CONFIG.MODULE_TIMEOUT_MS),
        ]);

        const latencyMs = Date.now() - startMs;

        if (result.status === "found") {
          // Success: log, cache, persist, emit event
          const enrichmentResult = await this.persistResult(
            userId, input.dimension, domainKey, entry.moduleId, result,
          );

          await this.logAttempt(userId, enrichmentResult?.id ?? null, input.dimension, domainKey, entry.moduleId, i + 1, "success", latencyMs);

          // Cache the result
          const ttl = result.ttl || getTtlForDimension(input.dimension);
          connectorCache.set(
            buildEnrichmentCacheKey(input.dimension, domainKey),
            result,
            ttl,
          );

          // Emit success event
          emitEvent(
            createEvent(DomainEventTypes.EnrichmentCompleted, {
              requestId,
              dimension: input.dimension,
              moduleId: entry.moduleId,
              userId,
              domainKey,
            }),
          );

          return result;
        }

        // Module returned not_found or error -- log and try next
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, result.status === "not_found" ? "not_found" : "error", latencyMs, result.status === "error" ? "Module returned error status" : undefined);

      } catch (error) {
        const latencyMs = Date.now() - startMs;
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        await this.logAttempt(userId, null, input.dimension, domainKey, entry.moduleId, i + 1, "error", latencyMs, errorMessage);
      }
    }

    // All modules failed or were skipped
    emitEvent(
      createEvent(DomainEventTypes.EnrichmentFailed, {
        requestId,
        dimension: input.dimension,
        userId,
        domainKey,
      }),
    );

    return null;
  }

  /**
   * Build a domain key from the enrichment input.
   * Used as the dedup/cache key for enrichment results.
   */
  private buildDomainKey(input: EnrichmentInput): string {
    switch (input.dimension) {
      case "logo":
        return input.companyDomain ?? input.companyName ?? "unknown";
      case "deep_link":
        return input.url ?? "unknown";
      default:
        return input.companyName ?? input.companyDomain ?? "unknown";
    }
  }

  /**
   * Create a timeout promise that rejects after ms milliseconds.
   */
  private createTimeout(ms: number): Promise<never> {
    return new Promise((_resolve, reject) => {
      setTimeout(() => reject(new Error("Module timeout exceeded")), ms);
    });
  }

  /**
   * Log an enrichment attempt to the database.
   * Best-effort -- failures are silently caught.
   */
  private async logAttempt(
    userId: string,
    enrichmentResultId: string | null,
    dimension: string,
    domainKey: string,
    moduleId: string,
    chainPosition: number,
    outcome: string,
    latencyMs: number,
    errorMessage?: string,
  ): Promise<void> {
    try {
      await db.enrichmentLog.create({
        data: {
          userId,
          enrichmentResultId,
          dimension,
          domainKey,
          moduleId,
          chainPosition,
          outcome,
          latencyMs,
          errorMessage: errorMessage?.slice(0, 500),
        },
      });
    } catch {
      // Best-effort logging -- do not break enrichment chain on log failure
    }
  }

  /**
   * Persist an enrichment result to the database via upsert.
   * Uses the unique constraint on (userId, dimension, domainKey).
   * Best-effort -- returns null on failure.
   */
  private async persistResult(
    userId: string,
    dimension: string,
    domainKey: string,
    moduleId: string,
    output: EnrichmentOutput,
  ): Promise<{ id: string } | null> {
    try {
      const ttlSeconds = output.ttl || getTtlForDimension(dimension as EnrichmentDimension);
      const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

      const result = await db.enrichmentResult.upsert({
        where: {
          userId_dimension_domainKey: { userId, dimension, domainKey },
        },
        update: {
          status: output.status,
          data: JSON.stringify(output.data),
          sourceModuleId: moduleId,
          ttlSeconds,
          expiresAt,
          updatedAt: new Date(),
        },
        create: {
          userId,
          dimension,
          domainKey,
          status: output.status,
          data: JSON.stringify(output.data),
          sourceModuleId: moduleId,
          ttlSeconds,
          expiresAt,
        },
        select: { id: true },
      });

      return result;
    } catch (error) {
      console.error("[EnrichmentOrchestrator] Failed to persist result:", error);
      return null;
    }
  }
}

// Singleton instance (globalThis to survive HMR — Fix 8)
const g = globalThis as unknown as { __enrichmentOrchestrator?: EnrichmentOrchestrator };
g.__enrichmentOrchestrator ??= new EnrichmentOrchestrator();
export const enrichmentOrchestrator = g.__enrichmentOrchestrator;
