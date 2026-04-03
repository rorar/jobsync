/**
 * Clearbit Logo Module — Connector Implementation
 *
 * Enriches company data with logos from the Clearbit Logo API.
 * Free tier: no API key required, returns 128x128 PNG logos.
 *
 * API: https://logo.clearbit.com/{domain}
 */

import type {
  DataEnrichmentConnector,
  EnrichmentInput,
  EnrichmentOutput,
} from "../../types";
import { ENRICHMENT_CONFIG } from "../../types";

/**
 * Creates a Clearbit Logo enrichment connector.
 *
 * Performs a HEAD request to verify the logo exists before returning
 * the URL. This avoids serving broken image links to the UI.
 */
export function createClearbitModule(): DataEnrichmentConnector {
  return {
    async enrich(input: EnrichmentInput): Promise<EnrichmentOutput> {
      const domain = input.companyDomain;

      if (!domain) {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "clearbit",
          ttl: 0,
        };
      }

      const logoUrl = `https://logo.clearbit.com/${encodeURIComponent(domain)}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        ENRICHMENT_CONFIG.MODULE_TIMEOUT_MS,
      );

      try {
        const response = await fetch(logoUrl, {
          method: "HEAD",
          signal: controller.signal,
        });

        if (response.ok) {
          return {
            dimension: "logo",
            status: "found",
            data: { logoUrl, width: 128, format: "png" },
            source: "clearbit",
            ttl: ENRICHMENT_CONFIG.LOGO_TTL_SECONDS,
          };
        }

        return {
          dimension: "logo",
          status: "not_found",
          data: {},
          source: "clearbit",
          ttl: 0,
        };
      } catch {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "clearbit",
          ttl: 0,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
