import { ConnectorType, CredentialType, type AiManifest } from "@/lib/connector/manifest";
import { deepseekI18n } from "./i18n";

export const deepseekManifest: AiManifest = {
  id: "deepseek",
  name: "DeepSeek",
  manifestVersion: 1,
  connectorType: ConnectorType.AI_PROVIDER,
  credential: {
    type: CredentialType.API_KEY,
    moduleId: "deepseek",
    required: true,
    envFallback: "DEEPSEEK_API_KEY",
    sensitive: true,
    placeholder: "sk-...",
  },
  healthCheck: {
    endpoint: "/models",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
  modelSelection: {
    defaultModel: "deepseek-chat",
    listEndpoint: "/models",
  },
  i18n: deepseekI18n,
};
