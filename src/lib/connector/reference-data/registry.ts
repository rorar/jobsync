/**
 * Reference Data — Registry Facade
 *
 * Thin wrapper over the unified ModuleRegistry for reference_data modules.
 * Same pattern as job-discovery/registry.ts and data-enrichment/registry.ts.
 */

import { moduleRegistry } from "../registry";
import { ConnectorType } from "../manifest";

export function getReferenceDataModules() {
  return moduleRegistry.getByType(ConnectorType.REFERENCE_DATA);
}

export function getActiveReferenceDataModules() {
  return moduleRegistry.getActive(ConnectorType.REFERENCE_DATA);
}
