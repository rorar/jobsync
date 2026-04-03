/**
 * Clearbit Logo Module — Manifest
 *
 * Declares identity, credentials, health check, and resilience config
 * for the Clearbit Logo API (free tier, no API key required).
 *
 * API: https://logo.clearbit.com/{domain} — returns PNG logo directly.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { DataEnrichmentManifest } from "@/lib/connector/manifest";

export const clearbitManifest: DataEnrichmentManifest = {
  id: "clearbit",
  name: "Clearbit Logo",
  manifestVersion: 1,
  connectorType: ConnectorType.DATA_ENRICHMENT,
  supportedDimensions: ["logo"],
  credential: {
    type: CredentialType.NONE,
    moduleId: "clearbit",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint: "https://logo.clearbit.com/clearbit.com",
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
