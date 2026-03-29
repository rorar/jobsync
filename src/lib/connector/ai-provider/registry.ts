import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";
import type { AIProviderConnector } from "./types";

/**
 * Facade on the unified ModuleRegistry, filtered to AI_PROVIDER modules.
 * Preserves the existing public API for all callers.
 */
class AIProviderRegistry {
  register(_id: string, _factory: () => AIProviderConnector): void {
    // No-op: registration now happens in modules/connectors.ts via moduleRegistry
  }

  create(id: string): AIProviderConnector {
    return moduleRegistry.create(id) as AIProviderConnector;
  }

  has(id: string): boolean {
    return moduleRegistry.has(id);
  }

  availableModules(): string[] {
    return moduleRegistry
      .getByType(ConnectorType.AI_PROVIDER)
      .map((m) => m.manifest.id);
  }
}

export const aiProviderRegistry = new AIProviderRegistry();
