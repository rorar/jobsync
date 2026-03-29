import { moduleRegistry } from "../../registry";
import { aiProviderRegistry } from "../registry";

// Import manifests + factories
import { ollamaManifest } from "./ollama/manifest";
import { createOllamaConnector } from "./ollama";
import { openaiManifest } from "./openai/manifest";
import { createOpenAIConnector } from "./openai";
import { deepseekManifest } from "./deepseek/manifest";
import { createDeepSeekConnector } from "./deepseek";

// Register with unified registry
moduleRegistry.register(ollamaManifest, createOllamaConnector);
moduleRegistry.register(openaiManifest, createOpenAIConnector);
moduleRegistry.register(deepseekManifest, createDeepSeekConnector);

export function registerAllAIConnectors() {
  // No-op: registration happens at import time above
}

export { aiProviderRegistry };
