/**
 * Holiday Module — Day Cache
 *
 * Caches date-holidays instances per country+subdivision+year combination.
 * Instances are expensive to construct (~50ms each) because they parse
 * the full holiday rule set. Caching amortizes this over many lookups.
 */

import Holidays from "date-holidays";
import type { HolidayEntry, HolidayType } from "./types";

/**
 * Map of holiday type strings from date-holidays to our HolidayType enum.
 * The date-holidays library uses these type strings in its output.
 */
const HOLIDAY_TYPE_MAP: Record<string, HolidayType> = {
  public: "public",
  bank: "bank",
  optional: "optional",
  observance: "observance",
  school: "school",
};

function mapHolidayType(type: string): HolidayType {
  return HOLIDAY_TYPE_MAP[type] ?? "public";
}

/** Cache key format: "CC:SUB:YEAR" (e.g. "DE:BY:2026") */
export function buildInstanceKey(
  countryCode: string,
  subdivisionCode?: string,
  year?: number,
): string {
  const cc = countryCode.toUpperCase();
  const sub = subdivisionCode?.toUpperCase() ?? "";
  const y = year ?? new Date().getFullYear();
  return `${cc}:${sub}:${y}`;
}

interface CachedHolidays {
  holidays: HolidayEntry[];
  /** Map from ISO date string to holiday entry for O(1) lookup */
  dateMap: Map<string, HolidayEntry>;
}

/**
 * DayCache provides cached holiday data per country+subdivision+year.
 *
 * Thread-safe within a single Node.js process. Uses a simple Map as the
 * backing store — no TTL eviction (holiday data doesn't change within a year).
 */
export class DayCache {
  private cache = new Map<string, CachedHolidays>();

  /**
   * Get holidays for a country/subdivision/year combination.
   * Builds and caches the result on first access.
   */
  getHolidays(
    countryCode: string,
    year: number,
    subdivisionCode?: string,
    types?: HolidayType[],
  ): HolidayEntry[] {
    const key = buildInstanceKey(countryCode, subdivisionCode, year);
    let cached = this.cache.get(key);

    if (!cached) {
      cached = this.buildCache(countryCode, year, subdivisionCode);
      this.cache.set(key, cached);
    }

    if (types && types.length > 0) {
      const typeSet = new Set(types);
      return cached.holidays.filter((h) => typeSet.has(h.type));
    }

    return cached.holidays;
  }

  /**
   * Check if a specific date is a holiday.
   */
  isHoliday(
    date: Date,
    countryCode: string,
    subdivisionCode?: string,
    types?: HolidayType[],
  ): HolidayEntry | null {
    const year = date.getFullYear();
    const key = buildInstanceKey(countryCode, subdivisionCode, year);
    let cached = this.cache.get(key);

    if (!cached) {
      cached = this.buildCache(countryCode, year, subdivisionCode);
      this.cache.set(key, cached);
    }

    const isoDate = formatIsoDate(date);
    const entry = cached.dateMap.get(isoDate);

    if (!entry) return null;

    // Check type filter
    if (types && types.length > 0 && !types.includes(entry.type)) {
      return null;
    }

    return entry;
  }

  /**
   * Batch check: is any date in the array a holiday?
   * Returns a Map from ISO date string to HolidayEntry (or null).
   */
  isHolidayBatch(
    dates: Date[],
    countryCode: string,
    subdivisionCode?: string,
    types?: HolidayType[],
  ): Map<string, HolidayEntry | null> {
    const result = new Map<string, HolidayEntry | null>();

    for (const date of dates) {
      const isoDate = formatIsoDate(date);
      result.set(isoDate, this.isHoliday(date, countryCode, subdivisionCode, types));
    }

    return result;
  }

  /**
   * Pre-warm the cache for specific countries and years.
   * Fire-and-forget — errors are logged but not thrown.
   */
  preWarm(countryCodes: string[], year: number): void {
    for (const cc of countryCodes) {
      const key = buildInstanceKey(cc, undefined, year);
      if (!this.cache.has(key)) {
        try {
          const cached = this.buildCache(cc, year);
          this.cache.set(key, cached);
        } catch (err) {
          console.warn(`[DayCache] Pre-warm failed for ${cc}/${year}:`, err);
        }
      }
    }
  }

  /**
   * Clear the entire cache. Useful for testing.
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get the number of cached entries (for diagnostics).
   */
  get size(): number {
    return this.cache.size;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  private buildCache(
    countryCode: string,
    year: number,
    subdivisionCode?: string,
  ): CachedHolidays {
    const cc = countryCode.toUpperCase();
    const hd = subdivisionCode
      ? new Holidays(cc, subdivisionCode.toUpperCase())
      : new Holidays(cc);

    const rawHolidays = hd.getHolidays(year) ?? [];

    const holidays: HolidayEntry[] = [];
    const dateMap = new Map<string, HolidayEntry>();

    for (const h of rawHolidays) {
      if (!h.date || !h.name) continue;

      const isoDate = h.date.slice(0, 10); // "YYYY-MM-DD"
      const entry: HolidayEntry = {
        date: isoDate,
        name: h.name,
        type: mapHolidayType(h.type),
      };

      holidays.push(entry);

      // First holiday wins for a given date (some countries have multiple
      // holidays on the same day — we keep the first/most important one)
      if (!dateMap.has(isoDate)) {
        dateMap.set(isoDate, entry);
      }
    }

    return { holidays, dateMap };
  }
}

/**
 * Format a Date to ISO date string (YYYY-MM-DD) in local time.
 */
function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
