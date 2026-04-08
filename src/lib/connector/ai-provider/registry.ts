import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";
import type { AIProviderConnector } from "./types";

/**
 * Facade on the unified ModuleRegistry, filtered to AI_PROVIDER modules.
 * Preserves the existing public API for all callers.
 */
class AIProviderRegistry {
  register(_id: string, _factory: () => AIProviderConnector): void {
    // No-op: modules self-register via moduleRegistry in their own index.ts
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

const g = globalThis as unknown as { __aiProviderRegistry?: AIProviderRegistry };
g.__aiProviderRegistry ??= new AIProviderRegistry();
export const aiProviderRegistry = g.__aiProviderRegistry;
