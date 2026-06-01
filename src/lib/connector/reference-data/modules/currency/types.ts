/**
 * CUR — ISO-4217 Currency Reference Module — Type Definitions
 *
 * Welle 2, Phase 1. Domain types for currency lookups. All data is derived
 * from native `Intl` (no vendored JSON, no npm dependency):
 *   - code list  → Intl.supportedValuesOf("currency")
 *   - name       → Intl.DisplayNames(locale, {type:"currency"})  (locale-aware)
 *   - symbol     → Intl.NumberFormat(locale, {style:"currency"}).formatToParts()
 *   - minorUnit  → Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits
 */

export interface CurrencyInfo {
  /** ISO-4217 alphabetic code (e.g. "EUR") */
  code: string;
  /** Localized currency symbol (e.g. "€", "$") */
  symbol: string;
  /** Localized display name (e.g. "Euro", "US-Dollar") */
  name: string;
  /** Number of minor-unit fraction digits (e.g. 2 for EUR, 0 for JPY) */
  minorUnit: number;
}
