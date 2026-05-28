/**
 * GeoCode Reference Module — Manifest
 *
 * Offline reference data module for ISO 3166 country/subdivision lookups
 * and Eurostat NUTS → ISO 3166-2 mapping. No external API calls — all
 * data comes from vendored JSON and npm packages.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { geoCodesI18n } from "./i18n";

export const geoCodesManifest: ReferenceDataManifest = {
  id: "geo_codes",
  name: "GeoCode Reference Data",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "geo_codes",
  credential: {
    type: CredentialType.NONE,
    moduleId: "geo_codes",
    required: false,
    sensitive: false,
  },
  // No healthCheck — fully offline module
  i18n: geoCodesI18n,
};
