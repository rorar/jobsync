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

## Blind-spot pass (2026-05-29)
- Fixed: diacritic-insensitive combobox search (foldDiacritics in @/lib/utils)
- Fixed: extracted HolidayBadge (+7 tests, aria-live) — closes UI test gap
- Documented: getPersonHolidayInfo uses SERVER clock (TZ off-by-one near midnight) → D-TZ
- Verified: migration runs (DRY_RUN=1 bun scripts/...), no `$` in holiday names

## Next
1. D-TZ: derive contact country IANA timezone so holiday badge uses country-local date (top holiday item)
2. E2E test for PersonDetail holiday badge (unit done: HolidayBadge.spec + reference-data.actions.spec)
3. D-W2 (CountryInfo.weekendDays type) — LOW
4. Pre-existing dead imports in person.actions.ts (ActorSource, validateExactlyOneTarget) — cleanup pass

## Stats: 252 suites, 4997 tests, 0 failures, tsc clean, build clean. 13 commits this session (db86060..HEAD), all LOCAL/unpushed.

## Notes
- Reference lookups now in reference-data.actions.ts, NOT person.actions.ts (CLAUDE.md updated)
- `.replace("{x}", ...)` is the established i18n interpolation pattern (65 sites) — not a finding
- Migration forks normalizeCountry intentionally (CLI runs outside Next.js, server-only throws)
