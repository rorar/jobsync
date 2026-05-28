/**
 * GeoCode Reference Module — Type Definitions
 *
 * Domain types for country and subdivision lookups (ROADMAP 1.21).
 * Three-layer architecture:
 *   Layer 1: i18n-iso-countries (country names, validation)
 *   Layer 2: iso3166-2-db (subdivision names, multilingual)
 *   Layer 3: amckenna41/iso3166-2 vendored JSON (geo coordinates, flags, types)
 */

export interface CountryInfo {
  /** ISO 3166-1 alpha-2 code (e.g. "DE") */
  code: string;
  /** Localized country name */
  name: string;
  /** Whether this country has ISO 3166-2 subdivisions in our dataset */
  hasSubdivisions: boolean;
}

export interface SubdivisionInfo {
  /** ISO 3166-2 code WITHOUT country prefix (e.g. "BY" not "DE-BY") */
  code: string;
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** Localized subdivision name */
  name: string;
  /** Subdivision type (e.g. "Land", "State", "Province") or null if unknown */
  subdivisionType: string | null;
}

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

export interface NutsResolution {
  countryCode: string;
  subdivisionCode: string | null;
}
