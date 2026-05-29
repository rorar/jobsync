# TDD Red Phase: Failing Tests

**Date:** 2026-05-28
**Status:** Tests written, expected to FAIL against current production code

---

## W-1 Tests Added to `__tests__/weekend-service.spec.ts`

New describe block: **"W-1: Intl.Locale.getWeekInfo() as primary source"**

| Test ID | Description | Why it FAILS |
|---------|-------------|--------------|
| W-1.1 | Uses Intl.Locale.getWeekInfo() as primary source on Node 22+ | Current code only uses CLDR, never calls `getWeekInfo()`. Spy will not be called. Also `clearWeekendCaches` not exported. |
| W-1.2a | Iran (IR) returns `[5]` (Friday-only weekend) | CLDR `expandWeekendRange` may not produce `[5]` correctly for IR — depends on CLDR weekendStart/weekendEnd data for IR |
| W-1.2b | Saudi Arabia (SA) returns `[5, 6]` (Friday+Saturday) | Same CLDR range expansion issue |
| W-1.2c | Afghanistan (AF) returns `[4, 5]` (Thursday+Friday) | Same CLDR range expansion issue |
| W-1.3 | Falls back to CLDR when getWeekInfo is unavailable | Expected to PASS (current code is CLDR-only). Included for regression safety. |
| W-1.4 | isWeekend returns true for Friday in Iran | Depends on W-1.2a producing correct weekend set for IR |
| W-1.5 | isWeekend returns false for Saturday in Iran | Depends on W-1.2a — Saturday should NOT be weekend in Iran |
| W-1.6 | isWeekend returns true for Thursday in Afghanistan | Depends on W-1.2c producing correct weekend set for AF |

## D-L1 Tests Added to `__tests__/holiday-service.spec.ts`

New describe block: **"D-L1: Locale passthrough to date-holidays"**

| Test ID | Description | Why it FAILS |
|---------|-------------|--------------|
| D-L1.1 | getHolidays with French locale returns French names (Dec 25 contains "Noel") | `getHolidays` does not accept a 5th `locale` parameter. Extra arg is silently ignored; names come back in German default. |
| D-L1.2 | getHolidays with Spanish locale returns Spanish names (Jan 1 contains "Ano/Nuevo") | Same — locale param not in interface |
| D-L1.3 | getHolidays with English locale returns "New Year's Day" | Same — locale param not in interface, returns "Neujahr" |
| D-L1.4 | getHolidays without locale returns country default (backward compat) | Expected to PASS — existing behavior unchanged |
| D-L1.5 | Cache isolation: French and German names differ for same holiday | Locale param ignored, both calls return same German names |
| D-L1.6 | isHoliday with French locale returns French name | `isHoliday` does not accept a 5th `locale` parameter |
| D-L1.7 | isBusinessDay with French locale returns French blocking holiday names | `isBusinessDay` does not accept a 4th `locale` parameter |
| D-L1.8 | buildInstanceKey includes locale in cache key | `buildInstanceKey` only accepts 3 params (cc, sub, year), 4th arg ignored. Returns `"DE::2026"` not `"DE::2026:fr"` |

## Summary

- **14 new tests** total (6 in weekend-service, 8 in holiday-service)
- **11 expected to FAIL** (TDD RED phase)
- **3 expected to PASS** (W-1.3, D-L1.4 backward compat, and possibly W-1.3)
- All tests use `@ts-expect-error` where needed so TypeScript compiles but tests fail at runtime
- **No production code was modified**

## Files Modified

- `__tests__/weekend-service.spec.ts` — added describe block at line 119+
- `__tests__/holiday-service.spec.ts` — added describe block at line 583+
- `.tdd-cycle/03-failing-tests.md` — this file
