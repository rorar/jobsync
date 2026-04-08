/**
 * Eurostat NUTS Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { eurostatNutsManifest } from "./manifest";

export function createEurostatNutsModule(): ReferenceDataConnector {
  return { id: "eurostat_nuts" };
}

// Self-registration
moduleRegistry.register(eurostatNutsManifest, createEurostatNutsModule);
