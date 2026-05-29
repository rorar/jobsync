/**
 * Public Holidays Reference Module — Service & Registration
 *
 * Provides offline public holiday lookups with:
 *   - Country-level and subdivision-level holiday calendars (date-holidays)
 *   - Weekend detection per country (CLDR supplemental data)
 *   - Business day calculation (isBusinessDay)
 *   - Batch holiday checking
 *   - Pre-warming for active countries
 *   - getRegions: extract regions from date-holidays for a country+subdivision
 *
 * ROADMAP 1.22 — Holiday Reference Module
 *
 * Design decision: getRegions() lives on HolidayService (NOT GeoCodeService)
 * to avoid a circular dependency — the region data comes from date-holidays,
 * not from the geo-code layers.
 */

import "server-only";

import Holidays from "date-holidays";
import type { ReferenceDataConnector } from "../../types";
import { moduleRegistry } from "@/lib/connector/registry";
import { publicHolidaysManifest } from "./manifest";

import type {
  HolidayEntry,
  HolidayType,
  BusinessDayResult,
  HolidayCheckOptions,
  RegionInfo,
} from "./types";
import { DayCache } from "./caching";
import { getWeekendDays, isWeekend } from "./weekend";

// Re-export types for consumers
export type { HolidayEntry, HolidayType, BusinessDayResult, HolidayCheckOptions, RegionInfo };

// ---------------------------------------------------------------------------
// HolidayService Interface
// ---------------------------------------------------------------------------

export interface HolidayService {
  readonly id: string;

  /**
   * Get all holidays for a country/subdivision in a given year.
   */
  getHolidays(
    countryCode: string,
    year: number,
    subdivisionCode?: string,
    types?: HolidayType[],
    locale?: string,
  ): HolidayEntry[];

  /**
   * Check if a specific date is a holiday.
   * Returns ALL matching holidays (multiple per date possible per MultipleHolidaysPerDate invariant).
   */
  isHoliday(
    date: Date,
    countryCode: string,
    subdivisionCode?: string,
    types?: HolidayType[],
    locale?: string,
  ): HolidayEntry[];

  /**
   * Get weekend day numbers for a country.
   * Returns ISO 8601 day numbers: 1=Mon, 2=Tue, ..., 7=Sun
   */
  getWeekendDays(countryCode: string): number[];

  /**
   * Get the representative IANA timezone for a country (+ optional subdivision).
   * Returns the FIRST timezone for multi-timezone countries (e.g. US → the
   * easternmost), or null if the country is unknown / has no timezone data.
   * Used to compute the contact-country-local date for the holiday badge
   * (D-TZ / TimezoneAwareness).
   */
  getPrimaryTimezone(countryCode: string, subdivisionCode?: string): string | null;

  /**
   * Check if a date is a business day (not weekend, not public/bank holiday).
   * Returns enriched result with blockingHolidays + isWeekend.
   */
  isBusinessDay(
    date: Date,
    countryCode: string,
    subdivisionCode?: string,
    locale?: string,
  ): BusinessDayResult;

  /**
   * Batch holiday check: one date × multiple locations (CB-14: CRM use case).
   * Deduplicates by location key. Returns Map from location key to HolidayEntry[].
   */
  isHolidayBatch(
    date: Date,
    locations: Array<{ countryCode: string; subdivisionCode?: string }>,
    types?: HolidayType[],
    locale?: string,
  ): Map<string, HolidayEntry[]>;

  /**
   * Get available regions (subdivisions + sub-regions) for a country
   * as known to the date-holidays library.
   *
   * Note: This is NOT the same as GeoCodeService.getSubdivisions() which
   * returns ISO 3166-2 subdivisions. date-holidays may define different
   * granularity (e.g. DE-BY has sub-regions A, KATH, EVANG).
   */
  getRegions(
    countryCode: string,
    subdivisionCode?: string,
  ): RegionInfo[];

  /**
   * Pre-warm the cache for a list of countries and a year.
   * Fire-and-forget.
   */
  preWarm(countryCodes: string[], year: number, locale?: string): void;

  /**
   * Clear the day cache. Primarily for testing.
   */
  clearDayCache(): void;
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

function createHolidayService(): HolidayService {
  const dayCache = new DayCache();

  // Shared Holidays instance for getStates/getRegions queries
  const holidaysHelper = new Holidays();

  return {
    id: "public_holidays",

    getHolidays(
      countryCode: string,
      year: number,
      subdivisionCode?: string,
      types?: HolidayType[],
      locale?: string,
    ): HolidayEntry[] {
      return dayCache.getHolidays(countryCode, year, subdivisionCode, types, locale);
    },

    isHoliday(
      date: Date,
      countryCode: string,
      subdivisionCode?: string,
      types?: HolidayType[],
      locale?: string,
    ): HolidayEntry[] {
      return dayCache.isHoliday(date, countryCode, subdivisionCode, types, locale);
    },

    getWeekendDays(countryCode: string): number[] {
      return getWeekendDays(countryCode);
    },

    getPrimaryTimezone(countryCode: string, subdivisionCode?: string): string | null {
      const cc = countryCode?.toUpperCase();
      if (!cc) return null;
      try {
        // Fresh instance: getTimezones() reads the INITIALIZED country, so we must
        // not mutate the shared holidaysHelper (used by getRegions/getStates).
        const hd = new Holidays();
        if (subdivisionCode) hd.init(cc, subdivisionCode.toUpperCase());
        else hd.init(cc);
        // NOTE: init() returns true even for unknown countries; the reliable
        // "unknown" signal is an EMPTY timezone list (verified against date-holidays).
        const timezones = hd.getTimezones();
        return timezones && timezones.length > 0 ? timezones[0] : null;
      } catch {
        return null;
      }
    },

    isBusinessDay(
      date: Date,
      countryCode: string,
      subdivisionCode?: string,
      locale?: string,
    ): BusinessDayResult {
      const weekendResult = isWeekend(date, countryCode);
      const holidays = dayCache.isHoliday(date, countryCode, subdivisionCode, undefined, locale);
      const blockingHolidays = holidays.filter(
        (h) => h.type === "public" || h.type === "bank",
      );

      return {
        isBusinessDay: blockingHolidays.length === 0 && !weekendResult,
        blockingHolidays,
        isWeekend: weekendResult,
      };
    },

    isHolidayBatch(
      date: Date,
      locations: Array<{ countryCode: string; subdivisionCode?: string }>,
      types?: HolidayType[],
      locale?: string,
    ): Map<string, HolidayEntry[]> {
      const results = new Map<string, HolidayEntry[]>();
      for (const loc of locations) {
        const key = `${loc.countryCode.toUpperCase()}:${loc.subdivisionCode?.toUpperCase() ?? ""}`;
        if (!results.has(key)) {
          results.set(key, dayCache.isHoliday(date, loc.countryCode, loc.subdivisionCode, types, locale));
        }
      }
      return results;
    },

    getRegions(
      countryCode: string,
      subdivisionCode?: string,
    ): RegionInfo[] {
      const cc = countryCode.toUpperCase();

      if (subdivisionCode) {
        // Get sub-regions within a subdivision
        const regions = holidaysHelper.getRegions(cc, subdivisionCode.toUpperCase());
        if (!regions) return [];
        return Object.entries(regions).map(([code, name]) => ({
          code,
          name: name as string,
        }));
      }

      // Get states/subdivisions for the country
      const states = holidaysHelper.getStates(cc);
      if (!states) return [];
      return Object.entries(states).map(([code, name]) => ({
        code,
        name: name as string,
      }));
    },

    preWarm(countryCodes: string[], year: number, locale?: string): void {
      dayCache.preWarm(countryCodes, year, locale);
    },

    clearDayCache(): void {
      dayCache.clear();
    },
  };
}

// ---------------------------------------------------------------------------
// Singleton (globalThis pattern)
// ---------------------------------------------------------------------------

const HOLIDAY_SERVICE_KEY = Symbol.for("jobsync.holidayService");
const g = globalThis as unknown as { [key: symbol]: HolidayService | undefined };

export function getHolidayService(): HolidayService {
  if (!g[HOLIDAY_SERVICE_KEY]) {
    g[HOLIDAY_SERVICE_KEY] = createHolidayService();
  }
  return g[HOLIDAY_SERVICE_KEY];
}

// ---------------------------------------------------------------------------
// Module connector (for registry — health-only, same as esco/eurostat pattern)
// ---------------------------------------------------------------------------

function createPublicHolidaysModule(): ReferenceDataConnector {
  return { id: "public_holidays" };
}

// Self-registration
moduleRegistry.register(publicHolidaysManifest, createPublicHolidaysModule);
