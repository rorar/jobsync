/**
 * Public Holidays Reference Module — Manifest
 *
 * Offline reference data module for public holiday lookups and
 * business day calculations. Uses the date-holidays npm package
 * with CLDR weekend data. No external API calls.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { ReferenceDataManifest } from "@/lib/connector/manifest";
import { publicHolidaysI18n } from "./i18n";

export const publicHolidaysManifest: ReferenceDataManifest = {
  id: "public_holidays",
  name: "Public Holidays",
  manifestVersion: 1,
  connectorType: ConnectorType.REFERENCE_DATA,
  taxonomy: "public_holidays",
  credential: {
    type: CredentialType.NONE,
    moduleId: "public_holidays",
    required: false,
    sensitive: false,
  },
  // No healthCheck — fully offline module
  i18n: publicHolidaysI18n,
};
