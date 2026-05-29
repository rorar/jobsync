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

## Blind-spot analysis (2026-05-29) — what we missed, now handled
- **TZ (Medium)**: `getPersonHolidayInfo` uses server-clock `new Date()`, not the contact country's local date — off-by-one near midnight. DOCUMENTED in code; proper fix = D-TZ below. (commit `cc85dad`)
- **Diacritic search (Medium)**: combobox filter didn't fold accents — FIXED via `foldDiacritics` (commit `106b2b7`).
- **Holiday badge had no UI test (Medium)**: extracted `HolidayBadge` + 7 tests + aria-live (commit `cc85dad`).
- **Migration never run (Low)**: verified via `DRY_RUN=1 bun scripts/...` (0 rows, exit 0); bun invocation documented.
- **`.replace()` `$` risk (Low)**: verified — no `$` in date-holidays names across 10 sampled countries. No action.

## Remaining for future sessions
- **D-TZ: derive the contact country's IANA timezone** so the holiday badge uses the country-local date (Allium TimezoneAwareness). Highest-value remaining holiday item. (LOW today, the PoC documents the gap)
- D-W2: CountryInfo.weekendDays field missing in code type (LOW)
- E2E test for PersonDetail holiday badge (unit-level done: `HolidayBadge.spec.tsx` + `reference-data.actions.spec.ts`)
- Pre-existing dead imports in `src/actions/person.actions.ts` (`ActorSource`, `validateExactlyOneTarget`) — unused before this session, tsc does not error (noUnusedLocals off); remove in a cleanup pass

## Session 2026-05-29 — GDPR S3 + A-leftovers DONE

Sprint: GDPR S3 (resume free-text PII redaction to cloud AI) + the open A-leftovers. Lean-full-rigor execution of `/full-stack-orchestration:full-stack-feature` (DB/deploy phases N/A); TDD throughout; `/gdpr-data-handling` consulted for Art. 5(1)(c) proportionality.

- **S3 (primary) — DONE.** `stripEmailPhonePatterns` promoted to shared `text-processing.ts` (single source of truth, re-exported from `preprocessing-job.ts`). `convertResumeToText({stripPii:true})` now scrubs email/phone from EVERY free-text field reaching the cloud LLM: title, headline, summary, work-experience & education descriptions. Local Ollama (`stripPii=false`) keeps full fidelity. Spec: `specs/ai-provider.allium` gained `@invariant CloudTransferDataMinimization` (passes `allium check`).
  - **ReDoS fix (was a latent SHIPPED vuln on the job path):** the email regex was quadratic O(n²) (200k input = 40 020 ms, measured). Bounded to RFC caps `{1,64}@{1,255}\.{2,24}` → linear (69 ms). Regression test added.
- **D-TZ — DONE.** No new dependency: `HolidayService.getPrimaryTimezone()` wraps `date-holidays` `getTimezones()`; pure `dateInTimeZone(now, tz)` helper (`public-holidays/timezone.ts`) computes the contact-country-local calendar day (local noon, DST-safe, no-throw fallback). `getPersonHolidayInfo` now uses it instead of the server clock. Spec `holiday-reference-data.allium` `TimezoneAwareness` invariant + `get_primary_timezone` contract added.
- **D-W2 — RESOLVED BY DESIGN (no field added).** The design doc's `CountryInfo` never had `weekendDays`; weekend data is owned by `HolidayService.getWeekendDays()` to avoid a GeoCode→Holiday circular dependency. Adding the field would re-introduce that coupling → closed as a documented design clarification. **(Flag for user: override if a per-country weekendDays field on CountryInfo is genuinely wanted.)**
- **Dead imports — DONE.** `ActorSource` + `validateExactlyOneTarget` removed from `person.actions.ts`.
- **E2E — DONE.** `e2e/crud/contact-crud.spec.ts`: creates a contact with a country and asserts the detail page renders (exercises the REAL D-TZ holiday path end-to-end — what mocked unit tests can't). Deliberately NOT asserting badge visibility (date-conditional → would be flaky); documented inline. 9/9 green.
- Review: 2 focused reviewers → ReDoS (H, fixed+verified) + headline-unscrubbed (M, fixed). Blind-spot pass additionally caught `resume.title` unscrubbed (fixed). Reports in `.full-review/`.
- Verified: 253 suites / 5014 unit tests pass; `tsc --noEmit` 0 errors; both specs `allium check` clean.
- **Flashlight (project-wide grep) found a BIGGER leak — FIXED.** The automation runner (`job-discovery/runner.ts`) has its own `convertResumeForMatch()` (near-duplicate of `convertResumeToText`, NO redaction) that sent the full resume + inline job text to the user's AI module on every scheduled AI-scored run — cloud providers included. Hardened with the same `stripPii=!isLocal` manifest pattern + shared scrubber; +3 tests (`runner-pii-redaction.spec.ts`). All 3 AI-transfer sites (2 routes + runner) now gate `stripPii`.
- **Still residual (accepted, documented):** free-text names/addresses + Art. 9 data (NER disproportionate); Unicode/IDN emails (`josé@münchen.de`) not matched by ASCII regex; multi-tz countries use first/representative zone.
- ~~**Future cleanup (NEW, low priority):** unify `convertResumeForMatch` (runner) with `convertResumeToText` (routes)~~ — **DONE 2026-05-29** (PII-Egress-Härtung-Sprint). Redaction policy extracted to dependency-free leaf `src/lib/pii` (shared by both converters); layouts kept per-converter (different prompts). Type diff bridged via structural `RedactableContact` (no cast). See ADR-032 + `docs/gdpr-audit-report.md` S3.
- **Separate KNOWN deferred GDPR item (not this sprint):** webhook payloads send full data blobs to external URLs unfiltered.
