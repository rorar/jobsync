/**
 * ESCO Classification Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { escoClassificationManifest } from "./manifest";

export function createEscoClassificationModule(): ReferenceDataConnector {
  return { id: "esco_classification" };
}

// Self-registration
moduleRegistry.register(escoClassificationManifest, createEscoClassificationModule);
