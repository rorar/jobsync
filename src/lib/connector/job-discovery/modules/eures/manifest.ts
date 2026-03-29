import { ConnectorType, CredentialType, type JobDiscoveryManifest } from "@/lib/connector/manifest";

export const euresManifest: JobDiscoveryManifest = {
  id: "eures",
  name: "EURES",
  connectorType: ConnectorType.JOB_DISCOVERY,
  credential: {
    type: CredentialType.NONE,
    moduleId: "eures",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint: "https://europa.eu/eures/eures-apps/api/jv-searchengine/public/jv-search/search",
    timeoutMs: 15000,
    intervalMs: 300000,
  },
  resilience: {
    retryAttempts: 3,
    retryBackoff: "exponential",
    circuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 30000,
    timeoutMs: 15000,
    rateLimitTokens: 3,
    rateLimitRefillMs: 500,
    maxConcurrent: 5,
  },
};
