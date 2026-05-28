/**
 * GeoCode Module — Layer 3: Vendored Geo Data
 *
 * Uses the vendored amckenna41/iso3166-2 JSON dataset for:
 *   - Geo coordinates (lat/lng) per subdivision
 *   - Flag SVG URLs per subdivision
 *   - Subdivision type labels (Land, State, Province, etc.)
 *
 * The vendored file is at data/iso3166-2.json.
 */

import "server-only";

import type { GeoCoordinate } from "./types";

/**
 * Shape of a single subdivision entry in the vendored JSON.
 * Keys are ISO 3166-2 codes with country prefix (e.g. "DE-BY").
 */
interface VendoredSubdivision {
  name: string;
  localOtherName: string | null;
  type: string;
  parentCode: string | null;
  flag: string | null;
  latLng: [number, number] | null;
  history: string | null;
}

type VendoredCountryData = Record<string, VendoredSubdivision>;
type VendoredDataSet = Record<string, VendoredCountryData>;

// Lazy-load the vendored JSON — only parsed once
let _data: VendoredDataSet | null = null;

function getData(): VendoredDataSet {
  if (!_data) {
    _data = require("./data/iso3166-2.json") as VendoredDataSet;
  }
  return _data;
}

/**
 * Build the full ISO 3166-2 key from country + subdivision code.
 */
function makeKey(countryCode: string, subdivisionCode: string): string {
  return `${countryCode.toUpperCase()}-${subdivisionCode.toUpperCase()}`;
}

/**
 * Look up a vendored subdivision entry.
 */
function lookupSubdivision(
  countryCode: string,
  subdivisionCode: string,
): VendoredSubdivision | null {
  const data = getData();
  const cc = countryCode.toUpperCase();
  const key = makeKey(cc, subdivisionCode);
  return data[cc]?.[key] ?? null;
}

/**
 * Get the geographic coordinates for a subdivision.
 * Returns null if no coordinates are available.
 */
export function getSubdivisionGeo(
  countryCode: string,
  subdivisionCode: string,
): GeoCoordinate | null {
  const sub = lookupSubdivision(countryCode, subdivisionCode);
  if (!sub?.latLng) return null;
  return { lat: sub.latLng[0], lng: sub.latLng[1] };
}

/** Allowlisted domains for subdivision flag URLs (S-5 security fix) */
const ALLOWED_FLAG_DOMAINS = new Set([
  "upload.wikimedia.org",
  "raw.githubusercontent.com",
  "commons.wikimedia.org",
]);

/**
 * Get the flag SVG URL for a subdivision.
 * Returns null if no flag is available or the URL domain is not allowlisted.
 */
export function getSubdivisionFlag(
  countryCode: string,
  subdivisionCode: string,
): string | null {
  const sub = lookupSubdivision(countryCode, subdivisionCode);
  const flag = sub?.flag ?? null;
  if (!flag) return null;

  try {
    const url = new URL(flag);
    if (!ALLOWED_FLAG_DOMAINS.has(url.hostname)) return null;
    return flag;
  } catch {
    return null;
  }
}

/**
 * Get the subdivision type label (e.g. "Land", "State", "Province").
 * Returns null if not found.
 */
export function getSubdivisionType(
  countryCode: string,
  subdivisionCode: string,
): string | null {
  const sub = lookupSubdivision(countryCode, subdivisionCode);
  return sub?.type ?? null;
}
