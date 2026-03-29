import { ConnectorType, CredentialType, type AiManifest } from "@/lib/connector/manifest";

export const ollamaManifest: AiManifest = {
  id: "ollama",
  name: "Ollama",
  manifestVersion: 1,
  connectorType: ConnectorType.AI_PROVIDER,
  credential: {
    type: CredentialType.ENDPOINT_URL,
    moduleId: "ollama",
    required: false,
    envFallback: "OLLAMA_BASE_URL",
    defaultValue: "http://127.0.0.1:11434",
    sensitive: false,
    placeholder: "http://127.0.0.1:11434",
  },
  healthCheck: {
    endpoint: "/api/tags",
    timeoutMs: 5000,
    intervalMs: 300000,
  },
  modelSelection: {
    defaultModel: "llama3.2",
    listEndpoint: "/api/tags",
  },
};
