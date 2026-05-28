/**
 * Holiday Module — Weekend Detection
 *
 * Determines weekend days per country using Intl.Locale.getWeekInfo()
 * as the primary source (Node.js 21+, auto-updates with CLDR).
 * Falls back to cldr-core weekData.json when Intl API is unavailable.
 *
 * External API uses ISO 8601 day numbers: 1=Mon, 2=Tue, ..., 7=Sun
 * Internal CLDR fallback uses JS Date.getDay() convention: 0=Sun, 6=Sat
 * Conversion happens at the boundary (getWeekendDays return).
 */

// Load CLDR week data at module init (small JSON, ~2KB)
import weekDataJson from "cldr-core/supplemental/weekData.json";

const weekData = weekDataJson.supplemental.weekData;

/**
 * CLDR day name → JavaScript day number mapping (internal).
 * CLDR uses three-letter lowercase day names.
 */
const CLDR_DAY_TO_JS: Record<string, number> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Convert JS day (0=Sun..6=Sat) to ISO 8601 (1=Mon..7=Sun) */
function jsToIso(jsDay: number): number {
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Resolve weekend start/end from CLDR data.
 * Falls back to the "001" (World) default if the country is not listed.
 * Returns JS day numbers (internal use only).
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
    CLDR_DAY_TO_JS[startDay] ?? 6, // Default: Saturday
    CLDR_DAY_TO_JS[endDay] ?? 0,   // Default: Sunday
  ];
}

/**
 * Expand a weekend start/end range into JS day numbers.
 * Handles wrap-around (e.g. Friday → Saturday for Middle Eastern countries).
 */
function expandWeekendRange(start: number, end: number): number[] {
  const days: number[] = [];
  let current = start;
  while (true) {
    days.push(current);
    if (current === end) break;
    current = (current + 1) % 7;
    if (days.length > 7) break; // Safety
  }
  return days;
}

/** In-memory cache: countryCode → Set of JS weekend day numbers (for isWeekend) */
const jsWeekendCache = new Map<string, Set<number>>();

/** In-memory cache: countryCode → ISO 8601 day numbers (for getWeekendDays) */
const isoWeekendCache = new Map<string, number[]>();

function resolveJsWeekend(countryCode: string): Set<number> {
  const cc = countryCode.toUpperCase();
  let cached = jsWeekendCache.get(cc);
  if (cached) return cached;

  const [start, end] = getWeekendFromCldr(cc);
  const days = expandWeekendRange(start, end);
  cached = new Set(days);
  jsWeekendCache.set(cc, cached);
  return cached;
}

/**
 * Get weekend day numbers for a country in ISO 8601 format.
 *
 * Primary: Intl.Locale.getWeekInfo() (Node.js 21+, auto-updates with CLDR)
 * Fallback: cldr-core weekData.json
 *
 * @param countryCode ISO 3166-1 alpha-2 country code
 * @returns ISO 8601 day numbers: 1=Mon, 2=Tue, ..., 7=Sun
 *          e.g. [6, 7] for Saturday+Sunday
 */
export function getWeekendDays(countryCode: string): number[] {
  const cc = countryCode.toUpperCase();
  let cached = isoWeekendCache.get(cc);
  if (cached) return cached;

  // Primary: Intl.Locale.getWeekInfo() (Node 21+, auto-updates with CLDR)
  try {
    const locale = new Intl.Locale("und", { region: cc });
    if (typeof (locale as any).getWeekInfo === "function") {
      const info = (locale as any).getWeekInfo();
      if (info?.weekend && Array.isArray(info.weekend) && info.weekend.length > 0) {
        // getWeekInfo().weekend is already ISO 8601 (1=Mon..7=Sun)
        cached = [...info.weekend].sort((a: number, b: number) => a - b);
        isoWeekendCache.set(cc, cached);
        return cached;
      }
    }
  } catch {
    // Fall through to CLDR fallback
  }

  // Fallback: cldr-core weekData.json
  const jsDays = resolveJsWeekend(cc);
  cached = [...jsDays].map(jsToIso).sort((a, b) => a - b);
  isoWeekendCache.set(cc, cached);
  return cached;
}

/**
 * Check if a given date falls on a weekend for the specified country.
 * Derives from getWeekendDays() (ISO 8601) and converts the date's JS day to ISO.
 */
export function isWeekend(date: Date, countryCode: string): boolean {
  const jsDay = date.getDay(); // 0=Sun..6=Sat
  const isoDay = jsDay === 0 ? 7 : jsDay;
  return getWeekendDays(countryCode).includes(isoDay);
}

/** Test-only: clear weekend caches for test isolation */
export function clearWeekendCaches(): void {
  jsWeekendCache.clear();
  isoWeekendCache.clear();
}
