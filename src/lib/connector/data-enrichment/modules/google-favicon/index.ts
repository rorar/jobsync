/**
 * Google Favicon Module — Connector Implementation
 *
 * Enriches company data with favicons from Google's favicon service.
 * No API key required. Always returns an image (falls back to a
 * default globe icon for unknown domains).
 *
 * API: https://www.google.com/s2/favicons?domain={domain}&sz=128
 */

import type {
  DataEnrichmentConnector,
  EnrichmentInput,
  EnrichmentOutput,
} from "../../types";
import { ENRICHMENT_CONFIG } from "../../types";

/**
 * Creates a Google Favicon enrichment connector.
 *
 * Performs a HEAD request to verify the favicon service responds.
 * Google's service always returns something (even a default globe),
 * so this is primarily a connectivity check.
 */
export function createGoogleFaviconModule(): DataEnrichmentConnector {
  return {
    async enrich(input: EnrichmentInput): Promise<EnrichmentOutput> {
      const domain = input.companyDomain;

      if (!domain) {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "google_favicon",
          ttl: 0,
        };
      }

      const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
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
            data: { logoUrl, format: "png" },
            source: "google_favicon",
            ttl: ENRICHMENT_CONFIG.LOGO_TTL_SECONDS,
          };
        }

        return {
          dimension: "logo",
          status: "not_found",
          data: {},
          source: "google_favicon",
          ttl: 0,
        };
      } catch {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "google_favicon",
          ttl: 0,
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}
