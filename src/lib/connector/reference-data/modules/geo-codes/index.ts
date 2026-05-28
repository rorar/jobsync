/**
 * GeoCode Reference Module — Service & Registration
 *
 * Provides offline ISO 3166 country/subdivision lookups with:
 *   Layer 1: i18n-iso-countries (country names, validation, normalization)
 *   Layer 2: iso3166-2-db (subdivision names, multilingual)
 *   Layer 3: amckenna41/iso3166-2 vendored JSON (geo coordinates, flags, types)
 *   NUTS mapping: Eurostat NUTS L1 → ISO 3166-2 resolution
 *
 * ROADMAP 1.21 — GeoCode Reference Module
 */

import "server-only";

import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { geoCodesManifest } from "./manifest";

import type { CountryInfo, SubdivisionInfo, GeoCoordinate, NutsResolution } from "./types";
import {
  getCountries as countriesGetCountries,
  normalizeCountry as countriesNormalizeCountry,
  getCountryName as countriesGetCountryName,
  isValidCountryCode as countriesIsValidCountryCode,
} from "./countries";
import {
  getSubdivisions as subdivisionsGetSubdivisions,
  getSubdivisionName as subdivisionsGetSubdivisionName,
  isValidSubdivisionCode as subdivisionsIsValidSubdivisionCode,
  hasSubdivisions as subdivisionsHasSubdivisions,
} from "./subdivisions";
import {
  getSubdivisionGeo as geoGetSubdivisionGeo,
  getSubdivisionFlag as geoGetSubdivisionFlag,
  getSubdivisionType as geoGetSubdivisionType,
} from "./geo-data";
import {
  countryFromNuts as nutsCountryFromNuts,
  nutsToSubdivision as nutsNutsToSubdivision,
  resolveNutsCode as nutsResolveNutsCode,
} from "./nuts-mapping";

// Re-export types for consumers
export type { CountryInfo, SubdivisionInfo, GeoCoordinate, NutsResolution };

// ---------------------------------------------------------------------------
// GeoCodeService Interface
// ---------------------------------------------------------------------------

export interface GeoCodeService {
  readonly id: string;

  // Layer 1 — Countries
  getCountries(locale: string): CountryInfo[];
  normalizeCountry(input: string): string | null;
  getCountryName(code: string, locale: string): string;
  isValidCountryCode(code: string): boolean;

  // Layer 2 — Subdivisions
  getSubdivisions(countryCode: string, locale: string): SubdivisionInfo[];
  getSubdivisionName(countryCode: string, subdivisionCode: string, locale: string): string;
  isValidSubdivisionCode(countryCode: string, subdivisionCode: string): boolean;
  hasSubdivisions(countryCode: string): boolean;

  // Layer 3 — Geo Data (vendored)
  getSubdivisionGeo(countryCode: string, subdivisionCode: string): GeoCoordinate | null;
  getSubdivisionFlag(countryCode: string, subdivisionCode: string): string | null;
  getSubdivisionType(countryCode: string, subdivisionCode: string): string | null;

  // NUTS Mapping
  countryFromNuts(nutsCode: string): string;
  nutsToSubdivision(nutsL1: string): string | null;
  resolveNutsCode(nutsCode: string): NutsResolution;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createGeoCodeService(): GeoCodeService {
  return {
    id: "geo_codes",

    // Layer 1
    getCountries: countriesGetCountries,
    normalizeCountry: countriesNormalizeCountry,
    getCountryName: countriesGetCountryName,
    isValidCountryCode: countriesIsValidCountryCode,

    // Layer 2
    getSubdivisions: subdivisionsGetSubdivisions,
    getSubdivisionName: subdivisionsGetSubdivisionName,
    isValidSubdivisionCode: subdivisionsIsValidSubdivisionCode,
    hasSubdivisions: subdivisionsHasSubdivisions,

    // Layer 3
    getSubdivisionGeo: geoGetSubdivisionGeo,
    getSubdivisionFlag: geoGetSubdivisionFlag,
    getSubdivisionType: geoGetSubdivisionType,

    // NUTS Mapping
    countryFromNuts: nutsCountryFromNuts,
    nutsToSubdivision: nutsNutsToSubdivision,
    resolveNutsCode: nutsResolveNutsCode,
  };
}

// ---------------------------------------------------------------------------
// Singleton (globalThis pattern)
// ---------------------------------------------------------------------------

const GEO_CODE_SERVICE_KEY = Symbol.for("jobsync.geoCodeService");
const g = globalThis as unknown as { [key: symbol]: GeoCodeService | undefined };

export function getGeoCodeService(): GeoCodeService {
  if (!g[GEO_CODE_SERVICE_KEY]) {
    g[GEO_CODE_SERVICE_KEY] = createGeoCodeService();
  }
  return g[GEO_CODE_SERVICE_KEY];
}

// ---------------------------------------------------------------------------
// Module connector (for registry — health-only, same as esco/eurostat pattern)
// ---------------------------------------------------------------------------

function createGeoCodeModule(): ReferenceDataConnector {
  return { id: "geo_codes" };
}

// Self-registration
moduleRegistry.register(geoCodesManifest, createGeoCodeModule);
