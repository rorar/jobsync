/**
 * CUR — ISO-4217 Currency Reference Module — Service & Registration
 *
 * Provides offline ISO-4217 currency lookups backed entirely by native `Intl`:
 *   - getCurrencies(locale)        → full active set, sorted, locale-aware
 *   - getCurrency(code, locale)    → single CurrencyInfo or null
 *   - getCurrencyName/Symbol/MinorUnit — scalar localizers
 *   - isValidCurrencyCode(code)    → active-set membership
 *
 * Welle 2, Phase 1. Mirrors the GeoCode module: server-only boundary here,
 * globalThis singleton, health-only registry registration.
 */

import "server-only";

import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { currencyManifest } from "./manifest";

import type { CurrencyInfo } from "./types";
import {
  getCurrencies as dataGetCurrencies,
  getCurrency as dataGetCurrency,
  getCurrencyName as dataGetCurrencyName,
  getCurrencySymbol as dataGetCurrencySymbol,
  getCurrencyMinorUnit as dataGetCurrencyMinorUnit,
  isValidCurrencyCode as dataIsValidCurrencyCode,
} from "./currency-data";

// Re-export types for consumers
export type { CurrencyInfo };

// ---------------------------------------------------------------------------
// CurrencyService Interface
// ---------------------------------------------------------------------------

export interface CurrencyService {
  readonly id: string;

  getCurrencies(locale: string): CurrencyInfo[];
  getCurrency(code: string, locale: string): CurrencyInfo | null;
  getCurrencyName(code: string, locale: string): string;
  getCurrencySymbol(code: string, locale: string): string;
  getCurrencyMinorUnit(code: string): number;
  isValidCurrencyCode(code: string): boolean;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createCurrencyService(): CurrencyService {
  return {
    id: "currency",
    getCurrencies: dataGetCurrencies,
    getCurrency: dataGetCurrency,
    getCurrencyName: dataGetCurrencyName,
    getCurrencySymbol: dataGetCurrencySymbol,
    getCurrencyMinorUnit: dataGetCurrencyMinorUnit,
    isValidCurrencyCode: dataIsValidCurrencyCode,
  };
}

// ---------------------------------------------------------------------------
// Singleton (globalThis pattern)
// ---------------------------------------------------------------------------

const CURRENCY_SERVICE_KEY = Symbol.for("jobsync.currencyService");
const g = globalThis as unknown as { [key: symbol]: CurrencyService | undefined };

export function getCurrencyService(): CurrencyService {
  if (!g[CURRENCY_SERVICE_KEY]) {
    g[CURRENCY_SERVICE_KEY] = createCurrencyService();
  }
  return g[CURRENCY_SERVICE_KEY];
}

// ---------------------------------------------------------------------------
// Module connector (for registry — health-only, same as geo-codes pattern)
// ---------------------------------------------------------------------------

function createCurrencyModule(): ReferenceDataConnector {
  return { id: "currency" };
}

// Self-registration
moduleRegistry.register(currencyManifest, createCurrencyModule);
