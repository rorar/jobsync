import { ConnectorType, CredentialType, type JobDiscoveryManifest } from "@/lib/connector/manifest";

export const jsearchManifest: JobDiscoveryManifest = {
  id: "jsearch",
  name: "JSearch",
  connectorType: ConnectorType.JOB_DISCOVERY,
  credential: {
    type: CredentialType.API_KEY,
    moduleId: "rapidapi",
    required: true,
    envFallback: "RAPIDAPI_KEY",
    sensitive: true,
    placeholder: "Your RapidAPI key",
  },
  resilience: {
    retryAttempts: 2,
    retryBackoff: "exponential",
    circuitBreaker: true,
    circuitBreakerThreshold: 5,
    circuitBreakerCooldownMs: 30000,
    timeoutMs: 15000,
    rateLimitTokens: undefined,
    rateLimitRefillMs: undefined,
    maxConcurrent: undefined,
  },
};
