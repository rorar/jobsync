# Test Architecture: W-1 + D-L1

## Test Structure

Both fixes extend existing test files (no new test files):
- `__tests__/weekend-service.spec.ts` — W-1 tests (Intl primary, CLDR fallback)
- `__tests__/holiday-service.spec.ts` — D-L1 tests (locale passthrough)

## Mock Strategy

### W-1
- **No mocking for primary path** — Node.js 22 has `getWeekInfo()`, test real behavior
- **CLDR fallback**: mock `Intl.Locale.prototype.getWeekInfo` as undefined to force CLDR path
- **Cache clearing**: add `_clearWeekendCaches()` export to weekend.ts for test isolation

### D-L1
- **No mocking for integration tests** — use real date-holidays to verify actual translations
- **Cache key**: test `buildInstanceKey` directly (already exported from caching.ts)
- `server-only` + `moduleRegistry`: already mocked in existing test setup

## Test Execution
- Single run: `nice -n 15 bash scripts/test.sh`
- No parallel test processes
- Existing tests must pass unchanged (backward compat)

## Fixture Design
- `localDate(iso)` helper already exists in holiday-service.spec.ts
- Country codes: DE, US, IR, SA, AF for weekend edge cases
- Locales: "fr", "es", "en", "ja" (unsupported), "" (empty)
