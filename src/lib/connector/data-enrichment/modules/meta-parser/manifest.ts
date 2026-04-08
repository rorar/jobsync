/**
 * Meta/OpenGraph Parser Module — Manifest
 *
 * Declares identity, credentials, health check, and resilience config
 * for the server-side meta tag parser.
 *
 * This module fetches a URL and extracts OpenGraph + standard meta tags
 * to produce structured DeepLinkData (title, description, image, siteName).
 *
 * No external API key required — fetches directly from the target URL.
 */

import { ConnectorType, CredentialType } from "@/lib/connector/manifest";
import type { DataEnrichmentManifest } from "@/lib/connector/manifest";
import { metaParserI18n } from "./i18n";

export const metaParserManifest: DataEnrichmentManifest = {
  id: "meta_parser",
  name: "Meta/OpenGraph Parser",
  manifestVersion: 1,
  connectorType: ConnectorType.DATA_ENRICHMENT,
  supportedDimensions: ["deep_link"],
  credential: {
    type: CredentialType.NONE,
    moduleId: "meta_parser",
    required: false,
    sensitive: false,
  },
  resilience: {
    retryAttempts: 1,
    retryBackoff: "none",
    circuitBreaker: true,
    circuitBreakerThreshold: 3,
    circuitBreakerCooldownMs: 30000,
    timeoutMs: 10000,
  },
  i18n: metaParserI18n,
};
