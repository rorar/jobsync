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
};
