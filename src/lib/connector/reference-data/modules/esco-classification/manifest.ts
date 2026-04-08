/**
 * ESCO Classification Module — Manifest
 *
 * Reference data module for the EU ESCO occupation/skill taxonomy.
 * Health-only — no lookup interface yet.
 *
 * Consumer: EURES module (EuresOccupationCombobox, via /api/esco/ proxy routes)
 * Note: ISCO groups are embedded in ESCO responses (broaderIscoGroup), not a separate API.
 * Note: The ESCO portal's classification/occupation?uri= endpoint returns HTTP 500
 *       as of 2026-04 (EU-side bug). The search endpoint used here still works.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { escoClassificationI18n } from "./i18n";

export const escoClassificationManifest: ReferenceDataManifest = {
  id: "esco_classification",
  name: "ESCO Classification API",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "esco_occupations",
  credential: {
    type: CredentialType.NONE,
    moduleId: "esco_classification",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint:
      "https://ec.europa.eu/esco/api/search?text=test&language=en&type=occupation&limit=1",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
  i18n: escoClassificationI18n,
};
