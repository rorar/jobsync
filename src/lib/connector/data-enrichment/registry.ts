/**
 * Data Enrichment Registry Facade
 *
 * Thin facade on the unified ModuleRegistry, filtered to DATA_ENRICHMENT modules.
 * Follows the same pattern as job-discovery/registry.ts.
 */

import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";
import type { DataEnrichmentConnector, DataEnrichmentManifestExtension, EnrichmentDimension } from "./types";

/**
 * Facade on the unified ModuleRegistry, filtered to DATA_ENRICHMENT modules.
 * Preserves the existing public API pattern for all callers.
 */
class EnrichmentConnectorRegistry {
  register(_id: string, _factory: () => DataEnrichmentConnector): void {
    // No-op: modules self-register via moduleRegistry in their own index.ts
  }

  create(id: string): DataEnrichmentConnector {
    return moduleRegistry.create(id) as DataEnrichmentConnector;
  }

  has(id: string): boolean {
    return moduleRegistry.has(id);
  }

  availableConnectors(): string[] {
    return moduleRegistry
      .getByType(ConnectorType.DATA_ENRICHMENT)
      .map((m) => m.manifest.id);
  }
}

export const enrichmentConnectorRegistry = new EnrichmentConnectorRegistry();

/**
 * Get all active enrichment modules.
 */
export function getActiveEnrichmentModules() {
  return moduleRegistry.getActive(ConnectorType.DATA_ENRICHMENT);
}

/**
 * Get active enrichment modules that support a given dimension.
 * Filters by the supportedDimensions array on the manifest extension.
 */
export function getEnrichmentModuleByDimension(dimension: EnrichmentDimension) {
  return getActiveEnrichmentModules()
    .filter((m) => {
      const ext = m.manifest as unknown as DataEnrichmentManifestExtension;
      return ext.supportedDimensions?.includes(dimension);
    });
}
