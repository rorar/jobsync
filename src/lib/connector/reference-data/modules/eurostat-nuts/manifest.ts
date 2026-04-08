/**
 * Eurostat NUTS Module — Manifest
 *
 * Reference data module for the EU NUTS regional classification.
 * Health-only — no lookup interface yet.
 *
 * Consumer: EURES module (EuresLocationCombobox, via /api/eures/locations proxy route)
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { eurostatNutsI18n } from "./i18n";

export const eurostatNutsManifest: ReferenceDataManifest = {
  id: "eurostat_nuts",
  name: "Eurostat NUTS Regions",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "nuts_regions",
  credential: {
    type: CredentialType.NONE,
    moduleId: "eurostat_nuts",
    required: false,
    sensitive: false,
  },
  healthCheck: {
    endpoint:
      "https://ec.europa.eu/eurostat/api/dissemination/sdmx/2.1/codelist/ESTAT/GEO?format=JSON&lang=en",
    timeoutMs: 10000,
    intervalMs: 300000,
  },
  i18n: eurostatNutsI18n,
};
