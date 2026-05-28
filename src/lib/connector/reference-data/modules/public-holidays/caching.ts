/**
 * Holiday Module — Day Cache
 *
 * Caches date-holidays instances per country+subdivision+year combination.
 * Instances are expensive to construct (~50ms each) because they parse
 * the full holiday rule set. Caching amortizes this over many lookups.
 */

import "server-only";

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

/** Cache key format: "CC:SUB:YEAR" or "CC:SUB:YEAR:LOCALE" */
export function buildInstanceKey(
  countryCode: string,
  subdivisionCode?: string,
  year?: number,
  locale?: string,
): string {
  const cc = countryCode.toUpperCase();
  const sub = subdivisionCode?.toUpperCase() ?? "";
  const y = year ?? new Date().getFullYear();
  const lang = locale ? `:${locale.split("-")[0].toLowerCase()}` : "";
  return `${cc}:${sub}:${y}${lang}`;
}

interface CachedHolidays {
  holidays: HolidayEntry[];
  /** Map from ISO date string to ALL holiday entries for that date (CB-11: multiple per date) */
  dateMap: Map<string, HolidayEntry[]>;
}

/**
 * DayCache provides cached holiday data per country+subdivision+year.
 *
 * Thread-safe within a single Node.js process. Uses a Map as the backing store
 * with LRU eviction when maxSize is reached (P-5 fix). Holiday data doesn't
 * change within a year, but unbounded growth across many locale/subdivision
 * combinations needs a cap.
 */
export class DayCache {
  private cache = new Map<string, CachedHolidays>();
  private readonly maxSize: number;

  constructor(maxSize = 500) {
    this.maxSize = maxSize;
  }

  /**
   * Get holidays for a country/subdivision/year combination.
   * Builds and caches the result on first access.
   */
  getHolidays(
    countryCode: string,
    year: number,
    subdivisionCode?: string,
    types?: HolidayType[],
    locale?: string,
  ): HolidayEntry[] {
    const key = buildInstanceKey(countryCode, subdivisionCode, year, locale);
    let cached = this.cache.get(key);

    if (!cached) {
      cached = this.buildCache(countryCode, year, subdivisionCode, locale);
      this.lruSet(key, cached);
    } else {
      // LRU touch: re-insert to move to end of Map iteration order
      this.cache.delete(key);
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
   * Returns ALL matching holidays (CB-11: multiple per date per MultipleHolidaysPerDate invariant).
   */
  isHoliday(
    date: Date,
    countryCode: string,
    subdivisionCode?: string,
    types?: HolidayType[],
    locale?: string,
  ): HolidayEntry[] {
    const year = date.getFullYear();
    const key = buildInstanceKey(countryCode, subdivisionCode, year, locale);
    let cached = this.cache.get(key);

    if (!cached) {
      cached = this.buildCache(countryCode, year, subdivisionCode, locale);
      this.lruSet(key, cached);
    } else {
      this.cache.delete(key);
      this.cache.set(key, cached);
    }

    const isoDate = formatIsoDate(date);
    const entries = cached.dateMap.get(isoDate) ?? [];

    if (types && types.length > 0) {
      const typeSet = new Set(types);
      return entries.filter((h) => typeSet.has(h.type));
    }

    return entries;
  }

  /**
   * Pre-warm the cache for specific countries and years.
   * Fire-and-forget — errors are logged but not thrown.
   */
  preWarm(countryCodes: string[], year: number, locale?: string): void {
    for (const cc of countryCodes) {
      const key = buildInstanceKey(cc, undefined, year, locale);
      if (!this.cache.has(key)) {
        try {
          const cached = this.buildCache(cc, year, undefined, locale);
          this.lruSet(key, cached);
        } catch (err) {
          console.warn(`[DayCache] Pre-warm failed for ${cc}/${year}:`, err);
        }
      }
    }
  }

  /** Clear the entire cache. */
  clear(): void {
    this.cache.clear();
  }

  /** Get the number of cached entries (for diagnostics). */
  get size(): number {
    return this.cache.size;
  }

  // -------------------------------------------------------------------------
  // Private
  // -------------------------------------------------------------------------

  /** Insert with LRU eviction: evict oldest entry when cache exceeds maxSize */
  private lruSet(key: string, value: CachedHolidays): void {
    if (this.cache.size >= this.maxSize) {
      // Map iteration order = insertion order; first key is oldest (LRU)
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    this.cache.set(key, value);
  }

  private buildCache(
    countryCode: string,
    year: number,
    subdivisionCode?: string,
    locale?: string,
  ): CachedHolidays {
    const cc = countryCode.toUpperCase();
    const sub = subdivisionCode?.toUpperCase();

    // Locale cascade: user locale + English fallback
    const opts: Record<string, unknown> = {};
    const effectiveLocale = locale && locale.length > 0 ? locale.split("-")[0].toLowerCase() : undefined;
    if (effectiveLocale) {
      opts.languages = effectiveLocale === "en" ? ["en"] : [effectiveLocale, "en"];
    }

    const hd = sub
      ? new Holidays(cc, sub, opts)
      : new Holidays(cc, opts);

    const rawHolidays = hd.getHolidays(year) ?? [];

    const holidays: HolidayEntry[] = [];
    const dateMap = new Map<string, HolidayEntry[]>();

    for (const h of rawHolidays) {
      if (!h.date || !h.name) continue;

      const isoDate = h.date.slice(0, 10); // "YYYY-MM-DD"
      const entry: HolidayEntry = {
        date: isoDate,
        name: h.name,
        type: mapHolidayType(h.type),
        country: cc,
        subdivision: sub ?? null,
        region: null,
        substitute: h.substitute ?? false,
        start: h.start instanceof Date ? h.start : new Date(h.start),
        end: h.end instanceof Date ? h.end : new Date(h.end),
      };

      holidays.push(entry);

      // CB-11: Collect ALL entries per date (MultipleHolidaysPerDate invariant)
      const existing = dateMap.get(isoDate);
      if (existing) {
        existing.push(entry);
      } else {
        dateMap.set(isoDate, [entry]);
      }
    }

    return { holidays, dateMap };
  }
}

/**
 * Format a Date to ISO date string (YYYY-MM-DD) in local time.
 */
export function formatIsoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
