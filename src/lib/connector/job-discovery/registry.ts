import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";
import type { DataSourceConnector } from "./types";

/**
 * Facade on the unified ModuleRegistry, filtered to JOB_DISCOVERY modules.
 * Preserves the existing public API for all callers.
 */
class ConnectorRegistry {
  register(_id: string, _factory: () => DataSourceConnector): void {
    // No-op: modules self-register via moduleRegistry in their own index.ts
  }

  create(id: string): DataSourceConnector {
    return moduleRegistry.create(id) as DataSourceConnector;
  }

  has(id: string): boolean {
    return moduleRegistry.has(id);
  }

  availableConnectors(): string[] {
    return moduleRegistry
      .getByType(ConnectorType.JOB_DISCOVERY)
      .map((m) => m.manifest.id);
  }
}

export const connectorRegistry = new ConnectorRegistry();
