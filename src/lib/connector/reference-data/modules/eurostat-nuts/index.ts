/**
 * Eurostat NUTS Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";

export function createEurostatNutsModule(): ReferenceDataConnector {
  return { id: "eurostat_nuts" };
}
