# TDD Cycle: Requirements Analysis

**Scope:** W-1 (Intl.Locale.getWeekInfo() as primary weekend source) + D-L1 (Locale passthrough to date-holidays)
**Date:** 2026-05-28
**Status:** Analysis complete

---

## 1. Current State

### W-1: Weekend Detection (weekend.ts)

The current implementation uses **only** `cldr-core/supplemental/weekData.json` to determine weekend days per country. It:
- Imports `weekData.json` at module init (~2KB JSON)
- Maps CLDR three-letter day names (`sat`, `sun`, `fri`, etc.) to JS day numbers (0=Sun..6=Sat)
- Expands a start/end range into all weekend days
- Converts to ISO 8601 day numbers (1=Mon..7=Sun) at the public API boundary
- Caches results in two module-level Maps: `jsWeekendCache` and `isoWeekendCache`

**Design doc AD-2** mandates: `Intl.Locale.getWeekInfo()` primary, `cldr-core` fallback. Node.js 24.13.1 is the runtime (getWeekInfo() available since Node.js 21).

### D-L1: Locale Passthrough (caching.ts + index.ts)

The current `DayCache.buildCache()` constructs Holidays instances as:
```typescript
const hd = sub ? new Holidays(cc, sub) : new Holidays(cc);
```

No `languages` option is passed. The design doc Section 2 mandates:
```typescript
new Holidays(cc, sub, { languages: [userLocale, 'en'] })
```

This means holiday names are currently returned in the country's default language (e.g., "Neujahr" for DE) rather than the user's display locale. The locale must be threaded through the entire call chain: `HolidayService` interface -> `DayCache.getHolidays/isHoliday/preWarm` -> `buildCache` -> `Holidays` constructor. The cache key must include the locale to prevent cross-locale cache pollution.

---

## 2. Acceptance Criteria

### W-1: Intl.Locale.getWeekInfo() as Primary

| ID | Criterion | Pass Condition | Fail Condition |
|----|-----------|---------------|----------------|
| W-1.1 | Primary source is Intl.Locale.getWeekInfo() | When `Intl.Locale.prototype.getWeekInfo` exists, weekend days come from `new Intl.Locale('und-' + cc).getWeekInfo().weekend` | Falls through to CLDR without trying Intl first |
| W-1.2 | CLDR fallback when Intl unavailable | When `getWeekInfo` is absent/throws, weekend days come from cldr-core weekData.json (existing logic) | Throws an error or returns empty/undefined |
| W-1.3 | Return format is ISO 8601 | `getWeekendDays("DE")` returns `[6, 7]` (Sat=6, Sun=7), never JS day 0 | Contains 0, or uses wrong numbering |
| W-1.4 | Intl.getWeekInfo() already returns ISO 8601 | No conversion needed for Intl path -- `.weekend` array is already 1=Mon..7=Sun | Applies jsToIso conversion to already-ISO numbers |
| W-1.5 | CLDR path still converts JS->ISO | The fallback path through expandWeekendRange still uses JS day numbers internally and converts at the boundary | Double-conversion or no conversion on CLDR path |
| W-1.6 | Country-specific weekends correct | IR returns `[5]` (Friday only), SA returns `[5, 6]`, AE returns `[6, 7]`, AF returns `[4, 5]` | Wrong days for any country |
| W-1.7 | Unknown country fallback | `getWeekendDays("XX")` returns `[6, 7]` (world default) on both Intl and CLDR paths | Throws or returns empty |
| W-1.8 | Case insensitivity preserved | `getWeekendDays("de")` equals `getWeekendDays("DE")` | Case-sensitive lookups |
| W-1.9 | Results are cached | Second call for same country returns cached result, no re-computation | Creates new Intl.Locale on every call |
| W-1.10 | isWeekend() works with new primary | `isWeekend(saturday, "DE")` returns true, `isWeekend(friday, "IR")` returns true | Weekend check inconsistent with getWeekendDays |
| W-1.11 | Sorted output | Return array is sorted ascending (e.g., `[5, 6]` not `[6, 5]`) | Unsorted array |

### D-L1: Locale Passthrough to date-holidays

| ID | Criterion | Pass Condition | Fail Condition |
|----|-----------|---------------|----------------|
| D-L1.1 | Holidays constructor receives languages | `new Holidays(cc, sub, { languages: [locale, 'en'] })` | Constructor called without languages option |
| D-L1.2 | Holiday names reflect user locale | `getHolidays("DE", 2026, undefined, undefined, "fr")` returns "Nouvel An" for Jan 1 | Returns "Neujahr" regardless of locale |
| D-L1.3 | English fallback | `getHolidays("DE", 2026, undefined, undefined, "en")` returns "New Year's Day" | Falls back to country default instead of explicit English |
| D-L1.4 | Cache key includes locale | Key format becomes `CC:SUB:YEAR:LOCALE` (e.g., `DE::2026:fr`) | Same cache entry serves different locales |
| D-L1.5 | Different locales produce different cache entries | Requesting DE/2026 with locale "fr" then "de" creates two cache entries | Second request returns French names |
| D-L1.6 | Locale parameter in HolidayService interface | All public methods accept optional `locale?: string` parameter | Locale not available at interface level |
| D-L1.7 | Locale flows through DayCache | `DayCache.getHolidays()`, `DayCache.isHoliday()`, `DayCache.preWarm()` all accept locale | Locale dropped between service and cache |
| D-L1.8 | Locale flows to buildCache | `buildCache()` receives locale and passes to Holidays constructor | Locale not threaded to constructor |
| D-L1.9 | Backward compatibility | Calling without locale uses default behavior (country's default language) | Existing callers break |
| D-L1.10 | isBusinessDay includes locale | `isBusinessDay(date, "DE", undefined, "fr")` returns blocking holidays with French names | Names in wrong locale |
| D-L1.11 | isHolidayBatch includes locale | `isHolidayBatch(date, locations, types, "fr")` returns entries with French names | Locale not propagated to batch |
| D-L1.12 | preWarm accepts locale | `preWarm(countries, year, locale)` warms cache for specific locale | Pre-warmed entries in wrong locale |
| D-L1.13 | buildInstanceKey includes locale | Key format: `CC:SUB:YEAR:LOCALE` | Locale omitted from key |

---

## 3. Edge Cases

### W-1 Edge Cases

| ID | Edge Case | Expected Behavior |
|----|-----------|-------------------|
| W-E1 | Intl.Locale constructor throws (malformed country code like "", "X", "123") | Catch error, fall through to CLDR fallback |
| W-E2 | `getWeekInfo()` method absent (Node.js < 21 runtime) | Feature detection: `typeof locale.getWeekInfo === 'function'`, fall to CLDR |
| W-E3 | `getWeekInfo()` returns empty weekend array | Treated as valid (country with no weekend days -- theoretically possible), return `[]` |
| W-E4 | `getWeekInfo()` returns undefined `.weekend` property | Fall through to CLDR fallback |
| W-E5 | Country code is mixed case ("dE", "De") | Normalized to uppercase before Intl.Locale construction |
| W-E6 | Country with single weekend day (IR = Friday only) | Returns `[5]` (length 1), not padded to 2 days |
| W-E7 | Country with 3+ weekend days (if CLDR ever defines one) | Returns all days from `.weekend` array |
| W-E8 | Concurrent calls for same country (race condition on cache) | Idempotent -- worst case: double computation, no corruption |
| W-E9 | Intl and CLDR disagree for a country | Intl wins (primary), CLDR only used when Intl unavailable |
| W-E10 | `Intl.Locale` exists but `getWeekInfo` does not (Safari polyfill scenario) | Feature-detect `getWeekInfo` specifically, not just `Intl.Locale` |

### D-L1 Edge Cases

| ID | Edge Case | Expected Behavior |
|----|-----------|-------------------|
| D-E1 | Locale is undefined/null | Omit `languages` from Holidays options (default behavior) |
| D-E2 | Locale is empty string `""` | Treat as undefined, omit languages |
| D-E3 | Locale not supported by date-holidays (e.g., "ja") | date-holidays falls back to English via `languages: ['ja', 'en']` |
| D-E4 | Same country+year, different locales | Each locale gets its own cache entry; no cross-contamination |
| D-E5 | Locale changes mid-session | Next lookup uses new locale, gets new cache entry or builds new one |
| D-E6 | Pre-warm with locale, then lookup without locale | Different cache keys, lookup triggers fresh build |
| D-E7 | buildInstanceKey with locale=undefined vs locale="" | Both should produce same key (no locale segment) |
| D-E8 | Subdivision with locale (3 args + options) | `new Holidays(cc, sub, { languages: [locale, 'en'] })` -- options as 3rd arg when sub is present |
| D-E9 | Locale "en" passed explicitly | Should not duplicate: `languages: ['en', 'en']` is harmless but should be `['en']` |
| D-E10 | Cache size growth from many locales | 4 locales x N countries x Y years -- moderate growth; no eviction needed for typical usage |

---

## 4. Test Scenario Matrix

### W-1: Weekend Detection (Intl primary, CLDR fallback)

| # | Scenario | Category | Source | Input | Expected Output |
|---|----------|----------|--------|-------|-----------------|
| 1 | Standard Sat+Sun country (DE) | Unit | Intl | `"DE"` | `[6, 7]` |
| 2 | Standard Sat+Sun country (US) | Unit | Intl | `"US"` | `[6, 7]` |
| 3 | Friday-only weekend (IR) | Unit | Intl | `"IR"` | `[5]` |
| 4 | Friday+Saturday weekend (SA) | Unit | Intl | `"SA"` | `[5, 6]` |
| 5 | Friday+Saturday weekend (IL) | Unit | Intl | `"IL"` | `[5, 6]` |
| 6 | Thursday+Friday weekend (AF) | Unit | Intl | `"AF"` | `[4, 5]` |
| 7 | Sunday-only weekend (IN) | Unit | Intl | `"IN"` | `[7]` |
| 8 | UAE modern (Sat+Sun since 2022) | Unit | Intl | `"AE"` | `[6, 7]` |
| 9 | Unknown country (XX) | Unit | Intl/CLDR | `"XX"` | `[6, 7]` (world default) |
| 10 | Case insensitivity | Unit | Both | `"de"` vs `"DE"` | Equal results |
| 11 | CLDR fallback: Intl unavailable | Unit | CLDR | DE with mocked Intl | `[6, 7]` from CLDR |
| 12 | CLDR fallback: Intl throws | Unit | CLDR | Mock getWeekInfo to throw | `[6, 7]` from CLDR |
| 13 | CLDR fallback: getWeekInfo undefined | Unit | CLDR | Mock getWeekInfo as undefined | `[6, 7]` from CLDR |
| 14 | Return type is sorted number[] | Unit | Intl | `"SA"` | `[5, 6]` not `[6, 5]` |
| 15 | No JS day 0 in output | Unit | Intl | `"DE"` | Does not contain 0 |
| 16 | Caching: idempotent | Unit | Both | Same country twice | Equal references or values |
| 17 | isWeekend: Saturday in DE | Integration | Both | `Sat 2026-01-03, "DE"` | `true` |
| 18 | isWeekend: Friday in IR | Integration | Both | `Fri 2026-01-09, "IR"` | `true` |
| 19 | isWeekend: Saturday in IR | Integration | Both | `Sat 2026-01-03, "IR"` | `false` (not a weekend in Iran) |
| 20 | isWeekend: Thursday in AF | Integration | Both | `Thu 2026-01-08, "AF"` | `true` |

### D-L1: Locale Passthrough

| # | Scenario | Category | Input | Expected Output |
|---|----------|----------|-------|-----------------|
| 21 | French locale, German holidays | Unit | `"DE", 2026, locale:"fr"` | Jan 1 name = "Nouvel An" |
| 22 | Spanish locale, German holidays | Unit | `"DE", 2026, locale:"es"` | Jan 1 name contains "Nuevo" |
| 23 | English locale, German holidays | Unit | `"DE", 2026, locale:"en"` | Jan 1 name = "New Year's Day" |
| 24 | No locale (backward compat) | Unit | `"DE", 2026` (no locale) | Jan 1 name = "Neujahr" (country default) |
| 25 | Cache isolation: fr then de | Unit | Two calls, diff locale | Different name for same holiday |
| 26 | Cache key format | Unit | `buildInstanceKey("DE", "BY", 2026, "fr")` | `"DE:BY:2026:fr"` |
| 27 | Cache key no locale | Unit | `buildInstanceKey("DE", undefined, 2026)` | `"DE::2026"` (unchanged) |
| 28 | Subdivision + locale | Unit | `"DE", 2026, "BY", locale:"es"` | Epiphany in Spanish |
| 29 | isHoliday with locale | Integration | `Dec 25, "DE", locale:"fr"` | Returns entry with French name |
| 30 | isBusinessDay with locale | Integration | `Dec 25, "DE", locale:"fr"` | blockingHolidays have French names |
| 31 | isHolidayBatch with locale | Integration | `Dec 25, [{DE},{FR}], locale:"es"` | All entries in Spanish |
| 32 | preWarm with locale | Unit | `preWarm(["DE"], 2026, "fr")` | Cache populated for fr locale |
| 33 | Unsupported locale fallback | Unit | `"DE", 2026, locale:"ja"` | Names in English (fallback via `['ja', 'en']`) |
| 34 | Empty string locale | Unit | `"DE", 2026, locale:""` | Treated as no locale (country default) |
| 35 | Locale dedup in languages array | Unit | locale="en" | `languages: ['en']` not `['en', 'en']` |

---

## 5. Test Categories

### Unit Tests (weekend.ts)

**W-1 Primary source tests** (Scenarios 1-10, 14-16):
- Test `getWeekendDays()` returns correct ISO 8601 days for various countries
- Test `getWeekendDays()` returns sorted arrays
- Test case insensitivity
- Test caching behavior

**W-1 Fallback tests** (Scenarios 11-13):
- Mock `Intl.Locale.prototype.getWeekInfo` as undefined/throwing
- Verify CLDR path produces correct results
- Verify feature detection logic

**W-1 isWeekend integration** (Scenarios 17-20):
- Test `isWeekend()` with specific dates against countries with non-standard weekends

### Unit Tests (caching.ts)

**D-L1 Cache key tests** (Scenarios 26-27):
- Test `buildInstanceKey` includes locale in key
- Test `buildInstanceKey` backward compatible when locale omitted

**D-L1 DayCache tests** (Scenarios 21-25, 28, 32-35):
- Test `DayCache.getHolidays()` passes locale to Holidays constructor
- Test `DayCache.isHoliday()` passes locale to Holidays constructor
- Test `DayCache.preWarm()` accepts and uses locale
- Test cache isolation between locales
- Test backward compatibility (no locale = default behavior)

### Integration Tests (index.ts / HolidayService)

**D-L1 Service interface tests** (Scenarios 29-31):
- Test `HolidayService.isHoliday()` with locale parameter
- Test `HolidayService.isBusinessDay()` with locale parameter
- Test `HolidayService.isHolidayBatch()` with locale parameter

### Regression Tests

- All existing `weekend-service.spec.ts` tests must pass unchanged
- All existing `holiday-service.spec.ts` tests must pass unchanged (backward compatibility)

---

## 6. Dependencies Needing Mocking

### W-1: Mocking Strategy

| Dependency | Mock Approach | Purpose |
|------------|--------------|---------|
| `Intl.Locale.prototype.getWeekInfo` | `jest.spyOn` / property delete | Test CLDR fallback when Intl API is unavailable |
| `Intl.Locale` constructor | `jest.spyOn(globalThis, 'Intl', ...)` or `jest.fn()` | Test error handling when Locale construction throws |
| Module-level caches (`jsWeekendCache`, `isoWeekendCache`) | Module re-import or `jest.resetModules()` | Test cache-miss paths; verify caching works |
| `cldr-core/supplemental/weekData.json` | `jest.mock()` | Isolate CLDR fallback tests from actual CLDR data |

**Important:** The caches in `weekend.ts` are module-level `Map` instances. To test cache behavior properly, either:
- Export a `clearWeekendCaches()` function for tests (preferred, matches `clearDayCache()` pattern)
- Use `jest.resetModules()` + dynamic import to get fresh caches
- Accept that cached values persist across tests within the same module import

### D-L1: Mocking Strategy

| Dependency | Mock Approach | Purpose |
|------------|--------------|---------|
| `date-holidays` (`Holidays` class) | `jest.mock('date-holidays')` | Verify constructor receives `{ languages: [locale, 'en'] }` |
| `server-only` | `jest.mock('server-only', () => ({}))` | Already mocked in existing tests |
| `@/lib/connector/registry` | `jest.mock(...)` | Already mocked in existing tests |

**For D-L1 unit tests of DayCache:** Mock the `Holidays` constructor to capture the options object and verify `languages` array content. This avoids depending on date-holidays' actual translation data in unit tests.

**For D-L1 integration tests of HolidayService:** Use the real `date-holidays` library and verify actual translated names (e.g., "Nouvel An" vs "Neujahr"). This confirms end-to-end locale propagation.

### Shared Test Utilities Needed

```typescript
/** Helper: clear weekend caches between tests (new export from weekend.ts) */
export function clearWeekendCaches(): void;

/** Helper: create Date from ISO string in local time (exists in holiday-service.spec.ts) */
function localDate(iso: string): Date;
```

---

## 7. Implementation Impact Summary

### Files to Modify

| File | Change | Complexity |
|------|--------|------------|
| `weekend.ts` | Add `getWeekendFromIntl()`, feature detection, fallback chain | Medium |
| `caching.ts` | Add `locale` param to `getHolidays`, `isHoliday`, `preWarm`, `buildCache`, `buildInstanceKey` | Medium |
| `index.ts` | Add `locale` param to all `HolidayService` interface methods and factory implementation | Medium |
| `types.ts` | Potentially add `locale` to `HolidayCheckOptions` | Low |

### Files to Create/Update for Tests

| File | Change |
|------|--------|
| `__tests__/weekend-service.spec.ts` | Add Intl primary tests, CLDR fallback tests, non-standard weekend countries |
| `__tests__/holiday-service.spec.ts` | Add locale passthrough tests, cache isolation tests |

### Invariants That Must Hold

1. **WeekendPatternsFromCldr** (Allium) -- upgraded to "WeekendPatternsFromIntl" with CLDR fallback
2. **LocaleFromUser** (Allium) -- currently NOT implemented; D-L1 implements it
3. **GracefulDegradation** (Allium) -- must hold for both Intl errors and missing locales
4. **MultipleHolidaysPerDate** (Allium) -- unaffected by locale changes
5. **BusinessDaySemantics** (Allium) -- unaffected, but holiday names in results change per locale
6. **HistoricalLookupSupported** (Allium) -- unaffected by these changes

### API Signature Changes (Breaking)

The `locale` parameter is **additive and optional** in all positions. No existing callers break because:
- `getWeekendDays(countryCode)` -- unchanged signature
- `getHolidays(cc, year, sub?, types?)` -- adds `locale?` as 5th parameter
- `isHoliday(date, cc, sub?, types?)` -- adds `locale?` as 5th parameter
- `isBusinessDay(date, cc, sub?)` -- adds `locale?` as 4th parameter
- `isHolidayBatch(date, locs, types?)` -- adds `locale?` as 4th parameter
- `preWarm(ccs, year)` -- adds `locale?` as 3rd parameter
- `buildInstanceKey(cc, sub?, year?)` -- adds `locale?` as 4th parameter

All new parameters are optional with `undefined` as default, preserving backward compatibility.
