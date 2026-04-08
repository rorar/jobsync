/**
 * Logo.dev Module — Connector Implementation
 *
 * Enriches company data with high-quality logos from Logo.dev.
 * Requires an API key (free tier available at https://logo.dev).
 *
 * API: https://img.logo.dev/{domain}?token={key}&format=png
 *
 * When no API key is resolved, returns "not_found" so the enrichment
 * chain falls through to the next module (Google Favicon).
 */

import type {
  DataEnrichmentConnector,
  EnrichmentInput,
  EnrichmentOutput,
} from "../../types";
import { ENRICHMENT_CONFIG } from "../../types";
import { logoDevPolicy } from "./resilience";
import { moduleRegistry } from "@/lib/connector/registry";
import { logoDevManifest } from "./manifest";

/** Domain validation regex — prevents injection of paths, query strings, or invalid characters */
const DOMAIN_REGEX = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

/**
 * Creates a Logo.dev enrichment connector.
 *
 * The API key is resolved by the credential-resolver (DB → env → skip).
 * If no key is available, the module returns not_found to let the chain continue.
 */
export function createLogoDevModule(apiKey?: string): DataEnrichmentConnector {
  return {
    async enrich(input: EnrichmentInput): Promise<EnrichmentOutput> {
      const domain = input.companyDomain;

      if (!domain) {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "logo_dev",
          ttl: 0,
        };
      }

      // No API key → skip this module, let chain fall through
      if (!apiKey) {
        return {
          dimension: "logo",
          status: "not_found",
          data: {},
          source: "logo_dev",
          ttl: 0,
        };
      }

      // Validate domain format to prevent SSRF / injection
      if (!DOMAIN_REGEX.test(domain)) {
        return {
          dimension: "logo",
          status: "not_found",
          data: {},
          source: "logo_dev",
          ttl: 0,
        };
      }

      const logoUrl = `https://img.logo.dev/${encodeURIComponent(domain)}?token=${encodeURIComponent(apiKey)}&format=png`;

      try {
        return await logoDevPolicy.execute(async ({ signal }) => {
          const response = await fetch(logoUrl, {
            method: "HEAD",
            signal,
            redirect: "manual",
          });

          if (response.ok) {
            return {
              dimension: "logo" as const,
              status: "found" as const,
              data: { logoUrl, format: "png" },
              source: "logo_dev",
              ttl: ENRICHMENT_CONFIG.LOGO_TTL_SECONDS,
            };
          }

          // 401/403 = invalid key — return not_found so chain continues
          if (response.status === 401 || response.status === 403) {
            return {
              dimension: "logo" as const,
              status: "not_found" as const,
              data: {},
              source: "logo_dev",
              ttl: 0,
            };
          }

          return {
            dimension: "logo" as const,
            status: "not_found" as const,
            data: {},
            source: "logo_dev",
            ttl: 0,
          };
        });
      } catch {
        return {
          dimension: "logo",
          status: "error",
          data: {},
          source: "logo_dev",
          ttl: 0,
        };
      }
    },
  };
}

// Self-registration
moduleRegistry.register(logoDevManifest, createLogoDevModule);
