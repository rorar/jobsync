# Next Session Follow-ups (post 1.21 + 1.22)

## From 2026-05-28 GeoCode + Holiday Session

### 1. ~~PersonDetail Holiday PoC~~ — DONE (2026-05-28 follow-up session)
Commit `2b9fcbd`: `getPersonHolidayInfo()` server action + holiday/weekend badge in PersonDetailClient + 3 i18n keys × 4 locales.

### 2. ~~`/comprehensive-review:full-review`~~ — DONE (2026-05-29 follow-up session)
Skill invoked, scoped to Phase 1 (2 thorough agents covering all 5 dimensions; security/perf/testing already addressed this session — full 10-agent ceremony would be redundant for a 500-line hardened diff). 13 NEW findings (0 critical/high, 6 medium, 7 low): 11 fixed, 2 accepted with rationale. Reports in `.full-review/`. Highlights: fixed stale-write race in PersonDetailClient; extracted `reference-data.actions.ts` (DDD); auth-gated all 3 reference actions; delegated to `isBusinessDay()`. Commit `3b9bab4` + `786f67a` (tests).

### 3. ~~Data Migration Script~~ — DONE (2026-05-28 follow-up session)
`scripts/migrate-person-address-country-codes.ts` — normalizes `Person.addressCountry` free-text → `addressCountryCode`. ADR-015 compliant.

### 4. ~~`/ui-design:design-review` for CountrySelect~~ — DONE (2026-05-28/29 follow-up session)
UI design review ran; 12 findings triaged. Fixed: F1 (aria-label), F2 (type="button"), F3 (clear item visible during search), F4 (loading spinner), F5 (aria-live), F6 (decorative flag alt), F7 (search reset on close), F8 (Tab closes), F11 (motion-reduce). Commits `a096b8e` + `d5576e2`. F9/F10/F12 accepted as ACL/cohesion (no action). Adopted the EuresLocationCombobox pattern (shouldFilter=false + manual filter) for consistency.

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
- E2E test for PersonDetail holiday badge (unit test for getPersonHolidayInfo DONE — `__tests__/reference-data.actions.spec.ts`, 11 tests)
- Pre-existing dead imports in `src/actions/person.actions.ts` (`ActorSource`, `validateExactlyOneTarget`) — unused before this session, tsc does not error (noUnusedLocals off); remove in a cleanup pass
