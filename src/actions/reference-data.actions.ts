"use server";

import "server-only";
import { getCurrentUser } from "@/utils/user.utils";
import { dateInTimeZone } from "@/lib/connector/reference-data/modules/public-holidays/timezone";

/**
 * Reference Data Server Actions — Open Host Service over the GeoCode (1.21)
 * and Holiday (1.22) reference modules.
 *
 * These are NOT part of any aggregate Repository — they are a thin client→server
 * bridge for the server-only reference-data connectors (GeoCodeService,
 * HolidayService). Kept in their own file (not person.actions.ts) so the Person
 * Aggregate Repository stays pure (DDD: one aggregate = one action file).
 *
 * All actions are auth-gated: although they return only public reference data,
 * every "use server" export is browser-callable (ADR-019), so we require an
 * authenticated session to prevent anonymous abuse of the reference modules.
 */

// ---------------------------------------------------------------------------
// GeoCode Reference Lookups (ROADMAP 1.21)
// ---------------------------------------------------------------------------

export async function getCountryOptions(locale: string) {
  const user = await getCurrentUser();
  if (!user) return [];
  const { getGeoCodeService } = await import(
    "@/lib/connector/reference-data/modules/geo-codes"
  );
  return getGeoCodeService().getCountries(locale);
}

export async function getSubdivisionOptions(countryCode: string, locale: string) {
  const user = await getCurrentUser();
  if (!user) return [];
  if (!countryCode) return [];
  const { getGeoCodeService } = await import(
    "@/lib/connector/reference-data/modules/geo-codes"
  );
  return getGeoCodeService().getSubdivisions(countryCode, locale);
}

// ---------------------------------------------------------------------------
// Currency Reference Lookups (Welle 2 — CUR, ISO-4217)
// ---------------------------------------------------------------------------

/**
 * All active ISO-4217 currencies, localized to `locale`, for a CurrencySelect.
 * Auth-gated (ADR-019): public reference data, but every "use server" export is
 * browser-callable, so an authenticated session is required.
 */
export async function getCurrencyOptions(locale: string) {
  const user = await getCurrentUser();
  if (!user) return [];
  const { getCurrencyService } = await import(
    "@/lib/connector/reference-data/modules/currency"
  );
  return getCurrencyService().getCurrencies(locale);
}

/**
 * Single currency lookup (code → symbol/name/minorUnit). Returns null for an
 * unauthenticated caller or a malformed/unknown code. Code validated at the
 * boundary with /^[A-Z]{3}$/ (ADR-019) before the service membership check.
 */
export async function getCurrencyInfo(code: string, locale: string) {
  const user = await getCurrentUser();
  if (!user) return null;
  if (!code || !/^[A-Z]{3}$/i.test(code)) return null;
  const { getCurrencyService } = await import(
    "@/lib/connector/reference-data/modules/currency"
  );
  return getCurrencyService().getCurrency(code, locale);
}

// ---------------------------------------------------------------------------
// Holiday Reference Lookups (ROADMAP 1.22 — PersonDetail PoC)
// ---------------------------------------------------------------------------

export interface PersonHolidayInfo {
  isHoliday: boolean;
  holidayName: string | null;
  isWeekend: boolean;
  countryName: string;
}

/**
 * Holiday/weekend status for a country (+ optional subdivision) on the current
 * date, used by the PersonDetail holiday badge. Composes HolidayService and
 * GeoCodeService through their public contracts only.
 */
export async function getPersonHolidayInfo(
  countryCode: string,
  locale: string,
  subdivisionCode?: string | null,
): Promise<PersonHolidayInfo | null> {
  // Auth gate first (ADR-019), consistent with the sibling reference actions —
  // do not expose input-validation behaviour to unauthenticated callers.
  const user = await getCurrentUser();
  if (!user) return null;

  if (!countryCode || !/^[A-Z]{2}$/i.test(countryCode)) return null;

  const [{ getHolidayService }, { getGeoCodeService }] = await Promise.all([
    import("@/lib/connector/reference-data/modules/public-holidays"),
    import("@/lib/connector/reference-data/modules/geo-codes"),
  ]);

  const holidayService = getHolidayService();
  const geoCodeService = getGeoCodeService();
  const sub = subdivisionCode ?? undefined;

  // D-TZ (TimezoneAwareness): compute "today" in the contact country's LOCAL
  // calendar, not the server clock. Near midnight the server TZ and the country
  // TZ can differ by a day, so a server-clock check would make the badge
  // off-by-one. getPrimaryTimezone returns the representative IANA zone (the
  // first for multi-timezone countries, e.g. US → easternmost); on null (unknown
  // country) we fall back to the server instant.
  const timezone = holidayService.getPrimaryTimezone(countryCode, sub);
  const today = timezone ? dateInTimeZone(new Date(), timezone) : new Date();

  // Delegate weekend + public/bank-holiday detection to the Holiday module's
  // public contract (BusinessDaySemantics) — no hand-rolled weekend conversion.
  const result = holidayService.isBusinessDay(today, countryCode, sub, locale);
  const publicHoliday = result.blockingHolidays[0];
  const countryName = geoCodeService.getCountryName(countryCode, locale);

  return {
    isHoliday: !!publicHoliday,
    holidayName: publicHoliday?.name ?? null,
    isWeekend: result.isWeekend,
    countryName,
  };
}
