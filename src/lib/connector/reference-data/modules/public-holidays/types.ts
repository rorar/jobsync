/**
 * Holiday Reference Module — Type Definitions
 *
 * Domain types for public holiday lookups and business day calculations
 * (ROADMAP 1.22).
 */

export type HolidayType = "public" | "bank" | "optional" | "observance" | "school";

export interface HolidayEntry {
  /** Holiday date in ISO 8601 format (YYYY-MM-DD) */
  date: string;
  /** Localized holiday name */
  name: string;
  /** Holiday type classification */
  type: HolidayType;
}

export interface BusinessDayResult {
  /** Whether the given date is a business day (not weekend, not holiday) */
  isBusinessDay: boolean;
  /** If not a business day, the reason */
  reason: "business_day" | "weekend" | "holiday";
  /** Holiday name if reason is "holiday" */
  holidayName?: string;
}

export interface HolidayCheckOptions {
  /** ISO 3166-1 alpha-2 country code */
  countryCode: string;
  /** ISO 3166-2 subdivision code WITHOUT country prefix (e.g. "BY") */
  subdivisionCode?: string;
  /** Holiday types to include (default: ["public", "bank"]) */
  types?: HolidayType[];
}

export interface RegionInfo {
  /** Region/subdivision code as used by date-holidays */
  code: string;
  /** Localized region name */
  name: string;
}
