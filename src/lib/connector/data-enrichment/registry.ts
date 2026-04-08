/**
 * Data Enrichment Registry Facade
 *
 * Thin facade on the unified ModuleRegistry, filtered to DATA_ENRICHMENT modules.
 * Follows the same pattern as job-discovery/registry.ts.
 */

import { moduleRegistry } from "../registry";
import { ConnectorType, type DataEnrichmentManifest } from "../manifest";
import type { DataEnrichmentConnector, EnrichmentDimension } from "./types";

/**
 * Facade on the unified ModuleRegistry, filtered to DATA_ENRICHMENT modules.
 * Preserves the existing public API pattern for all callers.
 */
class EnrichmentConnectorRegistry {
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

const g = globalThis as unknown as { __enrichmentConnectorRegistry?: EnrichmentConnectorRegistry };
g.__enrichmentConnectorRegistry ??= new EnrichmentConnectorRegistry();
export const enrichmentConnectorRegistry = g.__enrichmentConnectorRegistry;

/**
 * Get all active enrichment modules.
 */
export function getActiveEnrichmentModules() {
  return moduleRegistry.getActive(ConnectorType.DATA_ENRICHMENT);
}

/**
 * Get active enrichment modules that support a given dimension.
 * Filters by the supportedDimensions array on the manifest.
 */
export function getEnrichmentModuleByDimension(dimension: EnrichmentDimension) {
  return getActiveEnrichmentModules()
    .filter((m) => {
      const manifest = m.manifest as DataEnrichmentManifest;
      return manifest.supportedDimensions?.includes(dimension);
    });
}
