/**
 * CUR — ISO-4217 Currency Reference Module — Translator
 *
 * Pure, dependency-free translator over native `Intl`. No `server-only` guard
 * here on purpose: this is a pure data function (like geo-codes' countries.ts)
 * that is safe to import from any layer; the module's `index.ts` carries the
 * `server-only` boundary and the registry self-registration.
 *
 * Why native Intl instead of an npm currency package:
 *   - Locale-aware names for en/de/fr/es come straight from ICU (verified).
 *   - Symbol + minor-unit come from Intl.NumberFormat — the SAME engine the
 *     existing `format-salary-range.ts` already uses, so display stays
 *     consistent across the app.
 *   - Zero new dependency, fully offline — matches the geo-codes precedent
 *     (offline reference data, no external API).
 */

import type { CurrencyInfo } from "./types";

/** Well-formed ISO-4217 alpha code (3 letters). */
const CODE_RE = /^[A-Z]{3}$/;

/**
 * Active ISO-4217 codes from native ICU, frozen once at module load.
 * `Intl.supportedValuesOf` is guarded for very old runtimes (returns []).
 */
const SUPPORTED_CODES: ReadonlySet<string> = new Set(
  typeof Intl.supportedValuesOf === "function"
    ? Intl.supportedValuesOf("currency")
    : [],
);

/** Per-locale result cache (mirrors geo-codes getCountries caching). */
const listCache = new Map<string, CurrencyInfo[]>();

/**
 * Normalize + validate a currency code against the active ISO-4217 set.
 * Returns the canonical uppercase code, or null if malformed/unknown.
 *
 * This is the gate that prevents `Intl.DisplayNames.of("XYZ")` echo-back:
 * DisplayNames returns the input verbatim for unknown codes, so we MUST
 * reject codes that are not in `SUPPORTED_CODES` rather than fabricate a
 * currency named after its own code.
 */
function normalizeCode(input: string): string | null {
  if (typeof input !== "string") return null;
  const code = input.trim().toUpperCase();
  if (!CODE_RE.test(code)) return null;
  if (!SUPPORTED_CODES.has(code)) return null;
  return code;
}

/** True iff `input` is an active ISO-4217 code (case-insensitive). */
export function isValidCurrencyCode(input: string): boolean {
  return normalizeCode(input) !== null;
}

/**
 * Locale-aware display name. Does NOT validate against the active set — a
 * scalar localizer. Returns the (uppercased) code unchanged for unknown codes
 * (Intl.DisplayNames echo behavior, which is the desired fallback here).
 */
export function getCurrencyName(code: string, locale: string): string {
  const norm = typeof code === "string" ? code.trim().toUpperCase() : String(code);
  try {
    const dn = new Intl.DisplayNames([locale], { type: "currency" });
    return dn.of(norm) ?? norm;
  } catch {
    return norm;
  }
}

/** Localized currency symbol (e.g. "€", "$"). Falls back to the code. */
export function getCurrencySymbol(code: string, locale: string): string {
  const norm = typeof code === "string" ? code.trim().toUpperCase() : String(code);
  try {
    const parts = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: norm,
    }).formatToParts(1);
    return parts.find((p) => p.type === "currency")?.value ?? norm;
  } catch {
    return norm;
  }
}

/** Minor-unit fraction digits (2 for EUR, 0 for JPY). Defaults to 2. */
export function getCurrencyMinorUnit(code: string): number {
  const norm = typeof code === "string" ? code.trim().toUpperCase() : String(code);
  try {
    return (
      new Intl.NumberFormat("en", {
        style: "currency",
        currency: norm,
      }).resolvedOptions().maximumFractionDigits ?? 2
    );
  } catch {
    return 2;
  }
}

/**
 * Resolve a single currency to a full `CurrencyInfo`, or null if the code is
 * malformed or not an active ISO-4217 currency.
 */
export function getCurrency(code: string, locale: string): CurrencyInfo | null {
  const norm = normalizeCode(code);
  if (!norm) return null;
  return {
    code: norm,
    symbol: getCurrencySymbol(norm, locale),
    name: getCurrencyName(norm, locale),
    minorUnit: getCurrencyMinorUnit(norm),
  };
}

/**
 * All active ISO-4217 currencies, sorted by code ascending, localized to
 * `locale`. Cached per locale (the result array is stable across calls).
 */
export function getCurrencies(locale: string): CurrencyInfo[] {
  const cached = listCache.get(locale);
  if (cached) return cached;

  const list = [...SUPPORTED_CODES].sort().map<CurrencyInfo>((code) => ({
    code,
    symbol: getCurrencySymbol(code, locale),
    name: getCurrencyName(code, locale),
    minorUnit: getCurrencyMinorUnit(code),
  }));

  listCache.set(locale, list);
  return list;
}

/** Test-only: reset the per-locale cache. Do NOT call from production code. */
export function _clearCurrencyCache(): void {
  listCache.clear();
}
