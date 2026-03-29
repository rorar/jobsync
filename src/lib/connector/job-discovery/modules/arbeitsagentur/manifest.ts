import { ConnectorType, CredentialType, type JobDiscoveryManifest } from "@/lib/connector/manifest";

export const arbeitsagenturManifest: JobDiscoveryManifest = {
  id: "arbeitsagentur",
  name: "Arbeitsagentur",
  connectorType: ConnectorType.JOB_DISCOVERY,
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
  connectorParamsSchema: {
    umkreis: { type: "number", label: "Radius (km)", defaultValue: 25 },
    veroeffentlichtseit: { type: "number", label: "Published within (days)", defaultValue: 7 },
    arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz", "snw", "mj", "ho"] },
    befristung: { type: "select", label: "Contract type", options: [1, 2] },
  },
};
