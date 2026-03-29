import { ConnectorType, CredentialType, type JobDiscoveryManifest } from "@/lib/connector/manifest";

export const arbeitsagenturManifest: JobDiscoveryManifest = {
  id: "arbeitsagentur",
  name: "Arbeitsagentur",
  manifestVersion: 1,
  connectorType: ConnectorType.JOB_DISCOVERY,
  automationType: "discovery",
  credential: {
    type: CredentialType.NONE,
    moduleId: "arbeitsagentur",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint: "https://rest.arbeitsagentur.de/jobboerse/jobsuche-service/pc/v4/jobs",
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
  connectorParamsSchema: [
    { key: "umkreis", type: "number", label: "automations.params.umkreis", defaultValue: 25, min: 0, max: 200 },
    { key: "veroeffentlichtseit", type: "number", label: "automations.params.veroeffentlichtseit", defaultValue: 7, min: 1, max: 100 },
    { key: "arbeitszeit", type: "select", label: "automations.params.arbeitszeit", options: ["vz", "tz", "snw", "mj", "ho"] },
    { key: "befristung", type: "select", label: "automations.params.befristung", options: [1, 2] },
  ],
};
