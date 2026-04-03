/**
 * Google Favicon Module — Manifest
 *
 * Declares identity, credentials, health check, and resilience config
 * for the Google Favicon API (no API key required).
 *
 * API: https://www.google.com/s2/favicons?domain={domain}&sz=128
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { DataEnrichmentManifest } from "@/lib/connector/manifest";

export const googleFaviconManifest: DataEnrichmentManifest = {
  id: "google_favicon",
  name: "Google Favicon",
  manifestVersion: 1,
  connectorType: ConnectorType.DATA_ENRICHMENT,
  supportedDimensions: ["logo"],
  credential: {
    type: CredentialType.NONE,
    moduleId: "google_favicon",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint: "https://www.google.com/s2/favicons?domain=google.com&sz=128",
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
};
