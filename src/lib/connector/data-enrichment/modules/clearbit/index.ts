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
import { clearbitPolicy } from "./resilience";

/** Domain validation regex — prevents injection of paths, query strings, or invalid characters */
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

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

      // Validate domain format to prevent SSRF / injection (Fix 6)
      if (!DOMAIN_REGEX.test(domain)) {
        return {
          dimension: "logo",
          status: "not_found",
          data: {},
          source: "clearbit",
          ttl: 0,
        };
      }

      const logoUrl = `https://logo.clearbit.com/${encodeURIComponent(domain)}`;

      try {
        return await clearbitPolicy.execute(async ({ signal }) => {
          const response = await fetch(logoUrl, {
            method: "HEAD",
            signal,
            redirect: "manual",
          });

          if (response.ok) {
            return {
              dimension: "logo" as const,
              status: "found" as const,
              data: { logoUrl, width: 128, format: "png" },
              source: "clearbit",
              ttl: ENRICHMENT_CONFIG.LOGO_TTL_SECONDS,
            };
          }

          return {
            dimension: "logo" as const,
            status: "not_found" as const,
            data: {},
            source: "clearbit",
            ttl: 0,
          };
        });
      } catch {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "clearbit",
          ttl: 0,
        };
      }
    },
  };
}
