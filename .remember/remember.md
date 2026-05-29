# Handoff

## State
Session 2026-05-28/29 follow-up: ALL 7 follow-ups from the GeoCode+Holiday session
DONE, plus comprehensive-review fixes. 9 commits this session (`db86060`..`786f67a`).
251 suites, 4989 tests, 0 failures, tsc 0 errors, build clean.

## Key changes this session
- Performance: DayCache LRU (maxSize=500, `lruGetOrBuild` single access point), iso3166-2-db Map lookup
- Security: `server-only` on 6 sub-modules, flag URL allowlist, getPersons pageSize [1,100]
- DDD: extracted `src/actions/reference-data.actions.ts` (getCountryOptions/getSubdivisionOptions/
  getPersonHolidayInfo moved OUT of person.actions.ts — Person Repository stays pure).
  All 3 auth-gated (ADR-019). getPersonHolidayInfo delegates to HolidayService.isBusinessDay().
- UI: CountrySelect/SubdivisionSelect adopt EuresLocationCombobox pattern (shouldFilter=false +
  manual filter + controlled inputValue reset on close + aria-live + loading prop)
- PersonDetail holiday badge PoC (amber=holiday, blue=weekend); stale-write race fixed (cancel guard)
- Allium: get_countries/get_subdivisions + CountryInfo/SubdivisionInfo removed from HolidayLookupContract
- Migration script: `scripts/migrate-person-address-country-codes.ts` (DRY_RUN=1 supported, per-row try/catch)

## Next
1. E2E test for PersonDetail holiday badge (unit test done: reference-data.actions.spec.ts)
2. D-TZ (IANA timezone override on HolidayCheckOptions) + D-W2 (CountryInfo.weekendDays type) — LOW
3. Pre-existing dead imports in person.actions.ts (ActorSource, validateExactlyOneTarget) — cleanup pass

## Notes
- Reference lookups now in reference-data.actions.ts, NOT person.actions.ts (CLAUDE.md updated)
- `.replace("{x}", ...)` is the established i18n interpolation pattern (65 sites) — not a finding
- Migration forks normalizeCountry intentionally (CLI runs outside Next.js, server-only throws)
