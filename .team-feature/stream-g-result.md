# Stream G — E2E Tests (executed inline by orchestrator)

## Why inline
Spawned agent crashed with API 529 Overloaded (`tool_uses: 0`, no progress). Same as Stream F. Re-spawning while the API is overloaded is a poor strategy. Wrote the tests directly with full context from the `.team-feature/` artifacts.

## Files created
- `e2e/crud/staging-details-sheet.spec.ts` — opens details sheet from list-mode card, verifies the title is displayed in the dialog, closes via Escape, verifies the original card is still in place. Uses `test.skip` if the seed user has no staged vacancies (creating one is too heavy for an E2E).
- `e2e/crud/staging-layout-toggle.spec.ts` — clicks the Comfortable radio, verifies `aria-checked="true"` + `localStorage["jobsync-staging-layout-size"] === "comfortable"`, reloads, verifies persistence, restores original state.

## Test results
- `staging-details-sheet`: PASS in 4.7s after a one-line fix (Sheet renders the title twice — once `sr-only` for accessibility, once visible — needed `.first()` to satisfy strict mode)
- `staging-layout-toggle`: PASS (in the 9-pass run alongside the 8 smoke tests)
- Total: 2/2 new E2E tests passing

## Key selectors used
- Details button: `getByRole("button", { name: /^Details:/i })` — matches the `aria-label="Details: <vacancy title>"` pattern from `StagedVacancyCard.tsx:200`
- Sheet: `getByRole("dialog")` (Radix Sheet renders as `role="dialog"`)
- Layout toggle radios: `getByRole("radio", { name: /Compact|Default|Comfortable/i })`
- localStorage check: `page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY)`

## No infrastructure changes
- `playwright.config.ts` unchanged
- `e2e/global-setup.ts` unchanged
- `e2e/helpers/index.ts` unchanged
- Used the existing storageState mechanism for auth
- Single `--workers=1` execution per VM resource rules
