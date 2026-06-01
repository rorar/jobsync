/**
 * currency-reference.spec.ts — CUR (ISO-4217 Currency) Reference Module Tests
 *
 * Welle 2 — Phase 1 (CUR). Mirrors the geo-codes module test layout.
 *
 * The module is backed entirely by native `Intl` (zero vendored data, zero
 * npm dependency):
 *   - code list   → Intl.supportedValuesOf("currency")  (162 active ISO-4217 codes)
 *   - name        → Intl.DisplayNames(locale, {type:"currency"})  (locale-aware)
 *   - symbol      → Intl.NumberFormat(locale, {style:"currency"}).formatToParts()
 *   - minor unit  → Intl.NumberFormat(...).resolvedOptions().maximumFractionDigits
 *
 * Tests target the pure translator (currency-data.ts) + the service singleton.
 */

jest.mock("server-only", () => ({}));

// The currency index self-registers at module load. Mock the registry so the
// registration is a no-op and we avoid importing the full connector stack.
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { register: jest.fn() },
}));

import {
  getCurrencies,
  getCurrency,
  getCurrencyName,
  getCurrencySymbol,
  getCurrencyMinorUnit,
  isValidCurrencyCode,
} from "@/lib/connector/reference-data/modules/currency/currency-data";

import { getCurrencyService } from "@/lib/connector/reference-data/modules/currency/index";

// ---------------------------------------------------------------------------
// getCurrencies
// ---------------------------------------------------------------------------

describe("getCurrencies", () => {
  it("returns the full active ISO-4217 set (>= 150 codes)", () => {
    expect(getCurrencies("en").length).toBeGreaterThanOrEqual(150);
  });

  it("returns CurrencyInfo objects with code, symbol, name, minorUnit", () => {
    const eur = getCurrencies("en").find((c) => c.code === "EUR");
    expect(eur).toBeDefined();
    expect(typeof eur!.code).toBe("string");
    expect(typeof eur!.symbol).toBe("string");
    expect(typeof eur!.name).toBe("string");
    expect(typeof eur!.minorUnit).toBe("number");
  });

  it("includes the common majors (EUR, USD, GBP, JPY, CHF)", () => {
    const codes = new Set(getCurrencies("en").map((c) => c.code));
    for (const c of ["EUR", "USD", "GBP", "JPY", "CHF"]) {
      expect(codes.has(c)).toBe(true);
    }
  });

  it("is sorted by ISO code ascending", () => {
    const codes = getCurrencies("en").map((c) => c.code);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it("returns locale-aware names (de)", () => {
    const list = getCurrencies("de");
    expect(list.find((c) => c.code === "EUR")?.name).toBe("Euro");
    expect(list.find((c) => c.code === "USD")?.name).toBe("US-Dollar");
  });

  it("returns locale-aware names (fr)", () => {
    const usd = getCurrencies("fr").find((c) => c.code === "USD");
    expect(usd?.name.toLowerCase()).toContain("dollar des États-Unis".toLowerCase());
  });

  it("returns a stable cached array per locale (same reference)", () => {
    expect(getCurrencies("en")).toBe(getCurrencies("en"));
    // distinct locales are distinct arrays
    expect(getCurrencies("en")).not.toBe(getCurrencies("de"));
  });
});

// ---------------------------------------------------------------------------
// getCurrency (single lookup)
// ---------------------------------------------------------------------------

describe("getCurrency", () => {
  it("resolves EUR with euro sign, name, and 2 minor units", () => {
    const eur = getCurrency("EUR", "en");
    expect(eur).toEqual({
      code: "EUR",
      symbol: "€",
      name: "Euro",
      minorUnit: 2,
    });
  });

  it("resolves JPY with 0 minor units", () => {
    expect(getCurrency("JPY", "en")?.minorUnit).toBe(0);
  });

  it("normalizes lowercase input", () => {
    expect(getCurrency("eur", "en")?.code).toBe("EUR");
  });

  it("returns null for an unknown but well-formed code (XYZ)", () => {
    // Intl.DisplayNames.of('XYZ') echoes the input — the translator MUST
    // reject codes that are not in the active ISO-4217 set rather than
    // fabricate a currency named "XYZ".
    expect(getCurrency("XYZ", "en")).toBeNull();
  });

  it("returns null for malformed input", () => {
    expect(getCurrency("EU", "en")).toBeNull();
    expect(getCurrency("EURO", "en")).toBeNull();
    expect(getCurrency("", "en")).toBeNull();
    expect(getCurrency("12", "en")).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Scalar helpers
// ---------------------------------------------------------------------------

describe("getCurrencyName / getCurrencySymbol / getCurrencyMinorUnit", () => {
  it("getCurrencyName is locale-aware", () => {
    expect(getCurrencyName("USD", "de")).toBe("US-Dollar");
    expect(getCurrencyName("USD", "en")).toBe("US Dollar");
  });

  it("getCurrencyName returns the code itself for an unknown code", () => {
    expect(getCurrencyName("XYZ", "en")).toBe("XYZ");
  });

  it("getCurrencySymbol returns the localized symbol", () => {
    expect(getCurrencySymbol("EUR", "en")).toBe("€");
    expect(getCurrencySymbol("USD", "en")).toBe("$");
  });

  it("getCurrencyMinorUnit returns 2 for EUR, 0 for JPY", () => {
    expect(getCurrencyMinorUnit("EUR")).toBe(2);
    expect(getCurrencyMinorUnit("JPY")).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isValidCurrencyCode
// ---------------------------------------------------------------------------

describe("isValidCurrencyCode", () => {
  it("accepts active ISO-4217 codes (case-insensitive)", () => {
    expect(isValidCurrencyCode("EUR")).toBe(true);
    expect(isValidCurrencyCode("usd")).toBe(true);
  });

  it("rejects unknown / malformed codes", () => {
    expect(isValidCurrencyCode("XYZ")).toBe(false);
    expect(isValidCurrencyCode("EU")).toBe(false);
    expect(isValidCurrencyCode("EURO")).toBe(false);
    expect(isValidCurrencyCode("")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Service singleton
// ---------------------------------------------------------------------------

describe("getCurrencyService", () => {
  it("returns a stable singleton", () => {
    expect(getCurrencyService()).toBe(getCurrencyService());
  });

  it("exposes the lookup contract", () => {
    const svc = getCurrencyService();
    expect(svc.id).toBe("currency");
    expect(svc.getCurrencies("en").length).toBeGreaterThanOrEqual(150);
    expect(svc.getCurrency("EUR", "en")?.symbol).toBe("€");
    expect(svc.isValidCurrencyCode("EUR")).toBe(true);
    expect(svc.isValidCurrencyCode("XYZ")).toBe(false);
  });
});
