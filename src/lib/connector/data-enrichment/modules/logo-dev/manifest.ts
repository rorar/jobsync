/**
 * Logo.dev Module — Manifest
 *
 * Declares identity, credentials, health check, and resilience config
 * for the Logo.dev API. Requires an API key (free tier available).
 *
 * API: https://img.logo.dev/{domain}?token={key}&format=png
 *
 * Replaces Clearbit Logo API (dead since 2025-12-01, DNS no longer resolves).
 * When no API key is configured, the module is skipped and the enrichment
 * chain falls through to Google Favicon (keyless).
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { DataEnrichmentManifest } from "@/lib/connector/manifest";
import { logoDevI18n } from "./i18n";

export const logoDevManifest: DataEnrichmentManifest = {
  id: "logo_dev",
  name: "Logo.dev",
  manifestVersion: 1,
  connectorType: ConnectorType.DATA_ENRICHMENT,
  supportedDimensions: ["logo"],
  credential: {
    type: CredentialType.API_KEY,
    moduleId: "logo_dev",
    required: false,
    envFallback: "LOGODEV_API_KEY",
    sensitive: false, // pk_ is a publishable key — safe for client-side use per Logo.dev docs
    placeholder: "pk_...",
  },
  healthCheck: {
    endpoint: "https://img.logo.dev/google.com?format=png",
    timeoutMs: 5000,
    intervalMs: 300000,
  },
  resilience: {
    retryAttempts: 1,
    retryBackoff: "none",
    circuitBreaker: true,
    circuitBreakerThreshold: 3,
    circuitBreakerCooldownMs: 30000,
    timeoutMs: 5000,
  },
  i18n: logoDevI18n,
};
