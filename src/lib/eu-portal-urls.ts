/**
 * Shared URL builders for EU portal links (ESCO, EURES, ISCO).
 * All URLs include the user's locale for localized content.
 *
 * NOTE: The ESCO portal's classification/occupation?uri= endpoint
 * returns HTTP 500 as of 2026-04 (EU-side bug). We use the ESCO
 * Web Service API endpoint instead, which returns JSON and works.
 * For human-readable pages, we link to the occupation_main browsing
 * page with the occupation title as a search hint.
 */

const ESCO_PORTAL_BASE = "https://esco.ec.europa.eu";
const EURES_PORTAL_BASE = "https://europa.eu/eures/portal";

/**
 * Build an ESCO occupation portal URL with locale.
 * NOTE: The portal's classification/occupation?uri= endpoint returns 500
 * as of 2026-04 (EU-side bug). We link to it anyway — it's the correct URL
 * and will work again when they fix it. Better than a degraded alternative.
 */
export function escoOccupationUrl(uri: string, locale: string): string {
  const lang = mapLocale(locale);
  return `${ESCO_PORTAL_BASE}/${lang}/classification/occupation?uri=${encodeURIComponent(uri)}`;
}

/**
 * Build an ESCO ISCO group classification URL with locale.
 */
export function escoIscoGroupUrl(uri: string, locale: string): string {
  const lang = mapLocale(locale);
  return `${ESCO_PORTAL_BASE}/${lang}/classification/occupation?uri=${encodeURIComponent(uri)}`;
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
