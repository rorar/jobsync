/**
 * Holiday Reference Module — Type Definitions
 *
 * Domain types for public holiday lookups and business day calculations
 * (ROADMAP 1.22). Aligned with specs/holiday-reference-data.allium.
 */

export type HolidayType = "public" | "bank" | "optional" | "observance" | "school";

export interface HolidayEntry {
  /** Holiday date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Localized holiday name */
  name: string;
  /** Holiday type classification */
  type: HolidayType;
  /** ISO 3166-1 alpha-2 country code */
  country: string;
  /** ISO 3166-2 subdivision code or null for nationwide */
  subdivision: string | null;
  /** 3rd-level region code or null */
  region: string | null;
  /** Whether this is a substitute holiday */
  substitute: boolean;
  /** Start timestamp (timezone-aware) */
  start: Date;
  /** End timestamp (can span multiple days) */
  end: Date;
}

export interface BusinessDayResult {
  /** Whether the given date is a business day */
  isBusinessDay: boolean;
  /** Public/bank holidays blocking this day (empty if none) */
  blockingHolidays: HolidayEntry[];
  /** Whether the date falls on a weekend day for the country */
  isWeekend: boolean;
}

export interface HolidayCheckOptions {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** ISO 3166-2 subdivision code WITHOUT country prefix (e.g. "BY") */
  subdivisionCode?: string;
  /** Holiday types to include (default: all) */
  types?: HolidayType[];
}

export interface RegionInfo {
  /** Region/subdivision code as used by date-holidays */
  code: string;
  /** Localized region name */
  name: string;
}
