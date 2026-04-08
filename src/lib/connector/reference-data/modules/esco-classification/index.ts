/**
 * ESCO Classification Module — Health-only (no connector interface yet)
 */

import type { ReferenceDataConnector } from "../../types";

export function createEscoClassificationModule(): ReferenceDataConnector {
  return { id: "esco_classification" };
}
