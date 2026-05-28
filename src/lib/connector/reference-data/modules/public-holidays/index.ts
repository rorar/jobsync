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
  ): HolidayEntry[];

  /**
   * Check if a specific date is a holiday.
   */
  isHoliday(
    date: Date,
    options: HolidayCheckOptions,
  ): HolidayEntry | null;

  /**
   * Get the set of weekend day numbers for a country.
   * Returns JavaScript day numbers (0=Sunday, 6=Saturday).
   */
  getWeekendDays(countryCode: string): Set<number>;

  /**
   * Check if a date is a business day (not weekend, not holiday).
   */
  isBusinessDay(
    date: Date,
    options: HolidayCheckOptions,
  ): BusinessDayResult;

  /**
   * Batch check multiple dates for holidays.
   * Returns a Map from ISO date string to HolidayEntry (or null).
   */
  isHolidayBatch(
    dates: Date[],
    options: HolidayCheckOptions,
  ): Map<string, HolidayEntry | null>;

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
  preWarm(countryCodes: string[], year: number): void;

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
    ): HolidayEntry[] {
      return dayCache.getHolidays(countryCode, year, subdivisionCode, types);
    },

    isHoliday(
      date: Date,
      options: HolidayCheckOptions,
    ): HolidayEntry | null {
      return dayCache.isHoliday(
        date,
        options.countryCode,
        options.subdivisionCode,
        options.types,
      );
    },

    getWeekendDays(countryCode: string): Set<number> {
      return getWeekendDays(countryCode);
    },

    isBusinessDay(
      date: Date,
      options: HolidayCheckOptions,
    ): BusinessDayResult {
      // Check weekend first (cheaper)
      if (isWeekend(date, options.countryCode)) {
        return { isBusinessDay: false, reason: "weekend" };
      }

      // Check holiday
      const holiday = dayCache.isHoliday(
        date,
        options.countryCode,
        options.subdivisionCode,
        options.types,
      );

      if (holiday) {
        return {
          isBusinessDay: false,
          reason: "holiday",
          holidayName: holiday.name,
        };
      }

      return { isBusinessDay: true, reason: "business_day" };
    },

    isHolidayBatch(
      dates: Date[],
      options: HolidayCheckOptions,
    ): Map<string, HolidayEntry | null> {
      return dayCache.isHolidayBatch(
        dates,
        options.countryCode,
        options.subdivisionCode,
        options.types,
      );
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

    preWarm(countryCodes: string[], year: number): void {
      dayCache.preWarm(countryCodes, year);
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
