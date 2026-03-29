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
    // Conservative defaults for RapidAPI free tier (500 requests/month, 5/sec burst).
    // 2 tokens refilled every 1s keeps us well under the burst cap while allowing
    // reasonable throughput; maxConcurrent=3 prevents bulkhead saturation.
    rateLimitTokens: 2,
    rateLimitRefillMs: 1000,
    maxConcurrent: 3,
  },
};
