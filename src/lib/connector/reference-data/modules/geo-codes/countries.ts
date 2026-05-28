/**
 * GeoCode Module — Layer 1: Country Lookups
 *
 * Uses i18n-iso-countries for ISO 3166-1 alpha-2 country data
 * with localized names in en/de/fr/es (our 4 supported locales).
 */

import "server-only";

import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import deLocale from "i18n-iso-countries/langs/de.json";
import frLocale from "i18n-iso-countries/langs/fr.json";
import esLocale from "i18n-iso-countries/langs/es.json";

import { hasSubdivisions as checkSubdivisions } from "./subdivisions";
import type { CountryInfo } from "./types";

// Register locales once at module load
countries.registerLocale(enLocale);
countries.registerLocale(deLocale);
countries.registerLocale(frLocale);
countries.registerLocale(esLocale);

/** Supported locale codes — fallback to "en" for unknown locales */
const SUPPORTED_LOCALES = new Set(["en", "de", "fr", "es"]);

function resolveLocale(locale: string): string {
  // Handle locale strings like "de-DE" → "de"
  const lang = locale.split("-")[0].toLowerCase();
  return SUPPORTED_LOCALES.has(lang) ? lang : "en";
}

/** Pre-computed set of country codes that have subdivisions (computed once) */
let _subdivisionsSet: Set<string> | null = null;
function getSubdivisionsSet(): Set<string> {
  if (!_subdivisionsSet) {
    _subdivisionsSet = new Set<string>();
    const allCodes = Object.keys(countries.getAlpha2Codes());
    for (const code of allCodes) {
      if (checkSubdivisions(code)) _subdivisionsSet.add(code);
    }
  }
  return _subdivisionsSet;
}

/** Per-locale result cache — countries list is immutable, computed once per locale */
const countriesCache = new Map<string, CountryInfo[]>();

/**
 * Get all countries with localized names, sorted alphabetically.
 * Result is cached per locale (data is static).
 */
export function getCountries(locale: string): CountryInfo[] {
  const lang = resolveLocale(locale);
  const cached = countriesCache.get(lang);
  if (cached) return cached;

  const subSet = getSubdivisionsSet();
  const names = countries.getNames(lang, { select: "official" });

  const result = Object.entries(names)
    .map(([code, name]) => ({
      code,
      name,
      hasSubdivisions: subSet.has(code),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, lang));

  countriesCache.set(lang, result);
  return result;
}

/**
 * Normalize a country input to an ISO 3166-1 alpha-2 code.
 *
 * Accepts:
 *   - Alpha-2 code ("DE")
 *   - Alpha-3 code ("DEU")
 *   - Numeric code ("276")
 *   - Country name in any registered locale ("Deutschland", "Germany")
 *
 * Returns null if the input cannot be resolved.
 */
export function normalizeCountry(input: string): string | null {
  if (!input || input.trim().length === 0) return null;

  const trimmed = input.trim();

  // Try alpha-2 directly
  if (trimmed.length === 2 && countries.isValid(trimmed.toUpperCase())) {
    return trimmed.toUpperCase();
  }

  // Try alpha-3 → alpha-2
  if (trimmed.length === 3) {
    const alpha2 = countries.alpha3ToAlpha2(trimmed.toUpperCase());
    if (alpha2) return alpha2;
  }

  // Try numeric → alpha-2
  if (/^\d{1,3}$/.test(trimmed)) {
    const alpha2 = countries.numericToAlpha2(trimmed.padStart(3, "0"));
    if (alpha2) return alpha2;
  }

  // Try name lookup in each registered locale
  for (const lang of SUPPORTED_LOCALES) {
    const alpha2 = countries.getAlpha2Code(trimmed, lang);
    if (alpha2) return alpha2;
  }

  return null;
}

/**
 * Get the localized name for a country code.
 * Returns the code itself if no name is found.
 */
export function getCountryName(code: string, locale: string): string {
  const lang = resolveLocale(locale);
  return countries.getName(code.toUpperCase(), lang) ?? code;
}

/**
 * Check whether a given alpha-2 code is a valid ISO 3166-1 country.
 */
export function isValidCountryCode(code: string): boolean {
  return countries.isValid(code.toUpperCase());
}
