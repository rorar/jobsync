"use server";

import "server-only";
import { getCurrentUser } from "@/utils/user.utils";

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
  if (!countryCode || !/^[A-Z]{2}$/i.test(countryCode)) return null;

  const user = await getCurrentUser();
  if (!user) return null;

  const [{ getHolidayService }, { getGeoCodeService }] = await Promise.all([
    import("@/lib/connector/reference-data/modules/public-holidays"),
    import("@/lib/connector/reference-data/modules/geo-codes"),
  ]);

  const holidayService = getHolidayService();
  const geoCodeService = getGeoCodeService();
  const today = new Date();
  const sub = subdivisionCode ?? undefined;

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
