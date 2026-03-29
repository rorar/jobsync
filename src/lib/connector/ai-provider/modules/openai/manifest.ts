import { ConnectorType, CredentialType, type AiManifest } from "@/lib/connector/manifest";

export const openaiManifest: AiManifest = {
  id: "openai",
  name: "OpenAI",
  connectorType: ConnectorType.AI_PROVIDER,
  credential: {
    type: CredentialType.API_KEY,
    moduleId: "openai",
    required: true,
    envFallback: "OPENAI_API_KEY",
    sensitive: true,
    placeholder: "sk-...",
  },
  healthCheck: {
    endpoint: "/models",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
  modelSelection: {
    defaultModel: "gpt-4o-mini",
    listEndpoint: "/models",
  },
};
