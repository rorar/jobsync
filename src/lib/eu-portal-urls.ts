/**
 * Shared URL builders for EU portal links (ESCO, EURES, ISCO).
 * All URLs include the user's locale for localized content.
 *
 * ESCO portal classification pages return 500 as of 2026-04.
 * Using the LOD (Linked Open Data) endpoint which redirects correctly.
 */

const ESCO_LOD_BASE = "https://data.europa.eu/esco";
const EURES_PORTAL_BASE = "https://europa.eu/eures/portal";

/**
 * Build an ESCO occupation detail URL.
 * Uses the LOD endpoint which redirects to the correct portal page.
 */
export function escoOccupationUrl(uri: string): string {
  // The URI itself IS the LOD URL: http://data.europa.eu/esco/occupation/{uuid}
  // Redirect chain: data.europa.eu → ec.europa.eu/esco/lod/occupation/{uuid}
  return uri;
}

/**
 * Build an ESCO ISCO group classification URL with locale.
 */
export function escoIscoGroupUrl(uri: string, locale: string): string {
  const lang = mapLocale(locale);
  return `https://esco.ec.europa.eu/${lang}/classification/occupation?uri=${encodeURIComponent(uri)}`;
}

/**
 * Build a EURES job search URL with locale.
 */
export function euresSearchUrl(keyword: string, locale: string): string {
  const lang = mapLocale(locale);
  return `${EURES_PORTAL_BASE}/jv-se/home?keyword=${encodeURIComponent(keyword)}&lang=${lang}`;
}

/**
 * Build a EURES job detail URL with locale.
 */
export function euresJobDetailUrl(url: string, locale: string): string {
  if (!url.includes("europa.eu/eures/")) return url;
  const lang = mapLocale(locale);
  return `${url}${url.includes("?") ? "&" : "?"}lang=${lang}`;
}

/**
 * Map app locale to EU portal language code.
 * EU portals use 2-letter ISO 639-1 codes.
 */
function mapLocale(locale: string): string {
  // Our app uses: en, de, fr, es — all valid EU portal codes
  return locale.slice(0, 2).toLowerCase();
}
