/**
 * Holiday Module — Weekend Detection
 *
 * Determines weekend days per country using CLDR supplemental data.
 * Falls back to Intl.Locale.getWeekInfo() if available (Node 22+),
 * otherwise uses cldr-core JSON as the definitive source.
 *
 * Weekend day numbers follow JavaScript convention:
 *   0 = Sunday, 1 = Monday, ..., 6 = Saturday
 */

// Load CLDR week data at module init (small JSON, ~2KB)
import weekDataJson from "cldr-core/supplemental/weekData.json";

const weekData = weekDataJson.supplemental.weekData;

/**
 * CLDR day name → JavaScript day number mapping.
 * CLDR uses three-letter lowercase day names.
 */
const CLDR_DAY_MAP: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/**
 * Resolve weekend start/end from CLDR data.
 * Falls back to the "001" (World) default if the country is not listed.
 */
function getWeekendFromCldr(countryCode: string): [number, number] {
  const cc = countryCode.toUpperCase();

  const startDay =
    (weekData.weekendStart as Record<string, string>)[cc] ??
    (weekData.weekendStart as Record<string, string>)["001"];
  const endDay =
    (weekData.weekendEnd as Record<string, string>)[cc] ??
    (weekData.weekendEnd as Record<string, string>)["001"];

  return [
    CLDR_DAY_MAP[startDay] ?? 6, // Default: Saturday
    CLDR_DAY_MAP[endDay] ?? 0,   // Default: Sunday
  ];
}

/**
 * Expand a weekend start/end range into the full set of weekend day numbers.
 *
 * Handles wrap-around (e.g. Friday → Saturday for some Middle Eastern countries).
 */
function expandWeekendRange(start: number, end: number): number[] {
  const days: number[] = [];
  let current = start;
  while (true) {
    days.push(current);
    if (current === end) break;
    current = (current + 1) % 7;
    // Safety: prevent infinite loop if start === end (single-day weekend)
    if (days.length > 7) break;
  }
  return days;
}

/** In-memory cache: countryCode → Set of weekend day numbers */
const weekendCache = new Map<string, Set<number>>();

/**
 * Get the set of weekend day numbers for a country.
 *
 * @param countryCode ISO 3166-1 alpha-2 country code
 * @returns Set of JavaScript day numbers (0=Sun, 6=Sat) that are weekend days
 */
export function getWeekendDays(countryCode: string): Set<number> {
  const cc = countryCode.toUpperCase();

  let cached = weekendCache.get(cc);
  if (cached) return cached;

  const [start, end] = getWeekendFromCldr(cc);
  const days = expandWeekendRange(start, end);
  cached = new Set(days);

  weekendCache.set(cc, cached);
  return cached;
}

/**
 * Check if a given date falls on a weekend for the specified country.
 */
export function isWeekend(date: Date, countryCode: string): boolean {
  return getWeekendDays(countryCode).has(date.getDay());
}
