/**
 * Timezone helper for the Holiday reference module (D-TZ / TimezoneAwareness).
 *
 * The holiday/weekend badge must answer "is it a holiday/weekend RIGHT NOW in the
 * contact's country?" — which depends on the contact country's local calendar
 * date, not the server clock. Near midnight the two can differ by a day. This
 * helper derives the current calendar date in a given IANA timezone.
 */

import "server-only";

/**
 * Returns a Date whose LOCAL calendar fields (year/month/day) equal the calendar
 * date it currently is in `timeZone`, fixed at local noon (DST-safe — noon avoids
 * the midnight boundary so the day-of-week and calendar day are unambiguous).
 *
 * Pure: `now` is supplied explicitly (no hidden clock), so it is deterministic
 * and unit-testable regardless of the runtime's own timezone. On an invalid
 * timezone it falls back to the input instant and never throws.
 */
export function dateInTimeZone(now: Date, timeZone: string): Date {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const year = Number(get("year"));
    const month = Number(get("month"));
    const day = Number(get("day"));
    if (!year || !month || !day) return now;
    return new Date(year, month - 1, day, 12, 0, 0, 0);
  } catch {
    // Invalid IANA zone → fail safe to the raw instant (no off-by-one fix, but no crash).
    return now;
  }
}
