/**
 * GeoCode Module — Layer 2: Subdivision Lookups
 *
 * Three-source fallback chain (AD-9):
 * - Primary: countries-data-json (vendored, 80+ languages per subdivision)
 * - Fallback: iso3166-2-db (npm, 9 languages including en/de/fr/es)
 * - Last resort: raw ISO code (e.g. "BY")
 *
 * countries-data-json provides the best translation coverage (80 languages
 * per subdivision from the Ruby `countries` gem). iso3166-2-db is the npm
 * fallback for countries not yet vendored. Layer 3 (amckenna41/iso3166-2)
 * adds geo coordinates, flags, and subdivision types separately.
 */

import { getDataSet, getRegionsFor } from "iso3166-2-db";
import type { SubdivisionInfo } from "./types";

// ---------------------------------------------------------------------------
// Layer 2a: countries-data-json (vendored, 80+ languages)
//
// All vendored JSONs are loaded eagerly via require() at module init.
// This ensures: (a) webpack/turbopack bundles them into standalone output,
// (b) no runtime file I/O on hot paths, (c) no __dirname resolution issues.
// Total size: ~1.9MB for 16 countries (parsed once, cached by Node module system).
// ---------------------------------------------------------------------------

interface VendoredSubdivision {
  name: string;
  code: string;
  type?: string;
  translations?: Record<string, string>;
  geo?: { latitude: number; longitude: number };
}

type VendoredData = Record<string, VendoredSubdivision>;

/* eslint-disable @typescript-eslint/no-require-imports */
const VENDORED: Record<string, VendoredData> = {
  AT: require("./data/subdivisions/AT.json"),
  BE: require("./data/subdivisions/BE.json"),
  CH: require("./data/subdivisions/CH.json"),
  CZ: require("./data/subdivisions/CZ.json"),
  DE: require("./data/subdivisions/DE.json"),
  DK: require("./data/subdivisions/DK.json"),
  ES: require("./data/subdivisions/ES.json"),
  FR: require("./data/subdivisions/FR.json"),
  GB: require("./data/subdivisions/GB.json"),
  IE: require("./data/subdivisions/IE.json"),
  IT: require("./data/subdivisions/IT.json"),
  NL: require("./data/subdivisions/NL.json"),
  PL: require("./data/subdivisions/PL.json"),
  PT: require("./data/subdivisions/PT.json"),
  SE: require("./data/subdivisions/SE.json"),
  US: require("./data/subdivisions/US.json"),
};
/* eslint-enable @typescript-eslint/no-require-imports */

function loadVendoredSubdivisions(
  countryCode: string,
): VendoredData | null {
  const cc = countryCode.toUpperCase();
  return VENDORED[cc] ?? null;
}

/**
 * Get subdivision name from vendored countries-data-json.
 * Supports any locale in the translations object (80+ languages).
 * Falls back to English, then to the `name` field.
 */
function getVendoredName(
  countryCode: string,
  subdivisionCode: string,
  locale: string,
): string | null {
  const data = loadVendoredSubdivisions(countryCode);
  if (!data) return null;

  const sc = subdivisionCode.toUpperCase();
  const entry = data[sc];
  if (!entry) return null;

  const lang = locale.split("-")[0].toLowerCase();

  // Try requested locale, then English, then raw name
  return entry.translations?.[lang]
    ?? entry.translations?.en
    ?? entry.name
    ?? null;
}

/**
 * Get all subdivisions from vendored data for a country.
 */
function getVendoredSubdivisions(
  countryCode: string,
  locale: string,
): SubdivisionInfo[] | null {
  const data = loadVendoredSubdivisions(countryCode);
  if (!data) return null;

  const cc = countryCode.toUpperCase();
  const lang = locale.split("-")[0].toLowerCase();

  return Object.entries(data).map(([code, entry]) => ({
    code,
    countryCode: cc,
    name: entry.translations?.[lang]
      ?? entry.translations?.en
      ?? entry.name
      ?? code,
    subdivisionType: entry.type ?? null,
  }));
}

// ---------------------------------------------------------------------------
// Layer 2b: iso3166-2-db (npm, 9 languages)
// ---------------------------------------------------------------------------

/** Lazy-loaded dataset reference */
let _dataset: ReturnType<typeof getDataSet> | null = null;

function getDataSetCached() {
  if (!_dataset) {
    _dataset = getDataSet();
  }
  return _dataset;
}

/** iso3166-2-db supports these locales — others fall back to English */
const ISO3166DB_LOCALES = new Set([
  "en", "de", "fr", "es", "pt", "it", "nl", "ja", "zh",
]);

function resolveIso3166dbLocale(locale: string): string {
  const lang = locale.split("-")[0].toLowerCase();
  return ISO3166DB_LOCALES.has(lang) ? lang : "en";
}

function getIso3166dbSubdivisions(
  countryCode: string,
  locale: string,
): SubdivisionInfo[] {
  const cc = countryCode.toUpperCase();
  const lang = resolveIso3166dbLocale(locale);

  const regions = getRegionsFor(cc);
  if (!regions || regions.length === 0) return [];

  return regions.map((region) => ({
    code: region.iso,
    countryCode: cc,
    name: region.names?.[lang] ?? region.names?.en ?? region.name,
    subdivisionType: null,
  }));
}

function getIso3166dbName(
  countryCode: string,
  subdivisionCode: string,
  locale: string,
): string | null {
  const cc = countryCode.toUpperCase();
  const sc = subdivisionCode.toUpperCase();
  const lang = resolveIso3166dbLocale(locale);

  const regions = getRegionsFor(cc);
  const region = regions?.find((r) => r.iso === sc);
  if (!region) return null;

  return region.names?.[lang] ?? region.names?.en ?? region.name;
}

// ---------------------------------------------------------------------------
// Public API (fallback chain: vendored → iso3166-2-db → raw code)
// ---------------------------------------------------------------------------

/**
 * Get all subdivisions for a country with localized names, sorted alphabetically.
 * Primary: countries-data-json (80+ languages). Fallback: iso3166-2-db (9 languages).
 */
export function getSubdivisions(
  countryCode: string,
  locale: string,
): SubdivisionInfo[] {
  const lang = locale.split("-")[0].toLowerCase();

  // Try vendored data first (80+ languages)
  const vendored = getVendoredSubdivisions(countryCode, locale);
  if (vendored && vendored.length > 0) {
    return vendored.sort((a, b) => a.name.localeCompare(b.name, lang));
  }

  // Fallback to iso3166-2-db (9 languages)
  return getIso3166dbSubdivisions(countryCode, locale)
    .sort((a, b) => a.name.localeCompare(b.name, lang));
}

/**
 * Get the localized name of a single subdivision.
 * Fallback chain: countries-data-json → iso3166-2-db → raw code.
 */
export function getSubdivisionName(
  countryCode: string,
  subdivisionCode: string,
  locale: string,
): string {
  // Layer 2a: countries-data-json (primary, 80+ languages)
  const vendoredName = getVendoredName(countryCode, subdivisionCode, locale);
  if (vendoredName) return vendoredName;

  // Layer 2b: iso3166-2-db (fallback, 9 languages)
  const dbName = getIso3166dbName(countryCode, subdivisionCode, locale);
  if (dbName) return dbName;

  // Layer 2c: raw code (last resort)
  return subdivisionCode;
}

/**
 * Check whether a subdivision code is valid within a country.
 * Checks both vendored and npm data sources.
 */
export function isValidSubdivisionCode(
  countryCode: string,
  subdivisionCode: string,
): boolean {
  const cc = countryCode.toUpperCase();
  const sc = subdivisionCode.toUpperCase();

  // Check vendored data first
  const vendored = loadVendoredSubdivisions(cc);
  if (vendored && sc in vendored) return true;

  // Fallback to iso3166-2-db
  const regions = getRegionsFor(cc);
  return regions?.some((r) => r.iso === sc) ?? false;
}

/**
 * Check whether a country has any subdivisions in either data source.
 */
export function hasSubdivisions(countryCode: string): boolean {
  const cc = countryCode.toUpperCase();

  // Check vendored data
  const vendored = loadVendoredSubdivisions(cc);
  if (vendored && Object.keys(vendored).length > 0) return true;

  // Fallback to iso3166-2-db
  const ds = getDataSetCached();
  const country = ds[cc];
  return (country?.regions?.length ?? 0) > 0;
}
