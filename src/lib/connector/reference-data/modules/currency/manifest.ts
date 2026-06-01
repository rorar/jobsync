/**
 * CUR — ISO-4217 Currency Reference Module — Manifest
 *
 * Offline reference data module for ISO-4217 currency lookups. No external
 * API calls — all data comes from native `Intl` (ICU). Mirrors the geo-codes
 * manifest: REFERENCE_DATA connector type, no credential, no healthCheck.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { currencyI18n } from "./i18n";

export const currencyManifest: ReferenceDataManifest = {
  id: "currency",
  name: "Currency Reference Data",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "currency",
  credential: {
    type: CredentialType.NONE,
    moduleId: "currency",
    required: false,
    sensitive: false,
  },
  // No healthCheck — fully offline module (native Intl).
  i18n: currencyI18n,
};
