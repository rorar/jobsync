# Next Session Follow-ups (post 1.21 + 1.22)

## From 2026-05-28 GeoCode + Holiday Session

### 1. ~~PersonDetail Holiday PoC~~ — DONE (2026-05-28 follow-up session)
Commit `2b9fcbd`: `getPersonHolidayInfo()` server action + holiday/weekend badge in PersonDetailClient + 3 i18n keys × 4 locales.

### 2. `/comprehensive-review:full-review` — PARTIAL
Architecture review agent ran in follow-up session. Full orchestrated 5-dimensional skill not invoked — can be run before next major feature.

### 3. ~~Data Migration Script~~ — DONE (2026-05-28 follow-up session)
`scripts/migrate-person-address-country-codes.ts` — normalizes `Person.addressCountry` free-text → `addressCountryCode`. ADR-015 compliant.

### 4. `/ui-design:design-review` for CountrySelect — PARTIAL
UI designer agent review ran in follow-up session. Findings to be triaged.

### 5. ~~Performance Findings~~ — DONE (2026-05-28 follow-up session)
- P-5: DayCache LRU eviction (maxSize=500) — DONE + 2 new tests
- P-6: dateSet removed — DONE (previous session)
- P-7: isHolidayBatch cache key — SKIPPED (current inline key is already optimal for dedup)
- P-10: iso3166-2-db fallback → Map conversion — DONE

### 6. ~~Security Findings~~ — DONE (2026-05-28 follow-up session)
- S-3: `import "server-only"` added to 6 sub-modules — DONE
- S-5: getSubdivisionFlag URL domain allowlist — DONE
- S-7: getPersons pageSize bounded [1, 100] — DONE

### 7. ~~Allium Spec~~ — DONE (2026-05-28 follow-up session)
Option A implemented: removed `get_countries`, `get_subdivisions`, `CountryInfo`, `SubdivisionInfo` from `holiday-reference-data.allium`. `allium check` passes.

## Remaining for future sessions
- D-TZ: IANA timezone override parameter on HolidayCheckOptions (LOW)
- D-W2: CountryInfo.weekendDays field missing in code type (LOW)
- E2E test for PersonDetail holiday badge
- Test for getPersonHolidayInfo server action
