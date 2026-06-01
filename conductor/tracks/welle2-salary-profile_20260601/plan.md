# Implementation Plan: Welle 2 — Salary + Profil (Kette B)

**Track ID:** welle2-salary-profile_20260601
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-01
**Status:** [ ] Not Started

## Overview

Build the currency reference module first (it is the shared dependency), wire it +
geo-codes into the profile form, then migrate Job salary into a structured shape. TDD;
the salary Prisma migration is the highest-risk task — test the parser before migrating.

## Phase 1: CUR — ISO-4217 Currency Reference Module

### Tasks

- [x] Task 1.1: Unit test for the currency translator (code → symbol/name/minor-unit;
      locale-aware names for en/de/fr/es; invalid code rejected). → `__tests__/currency-reference.spec.ts` (20 tests).
- [x] Task 1.2: Scaffold `src/lib/connector/reference-data/modules/currency/` with
      `i18n.ts`, `manifest.ts` (`ReferenceDataManifest`, health-only), `index.ts`
      (self-registers via `moduleRegistry.register(...)`). Backed by native `Intl` (zero dep, offline) + `types.ts` + `currency-data.ts` translator.
- [x] Task 1.3: Add the import line to `src/lib/connector/register-all.ts`.
- [x] Task 1.4: Add `getCurrencyOptions` (+ `getCurrencyInfo` lookup) to the reference-data OHS action file
      (auth-gated, ADR-019, `/^[A-Z]{3}$/` boundary validation); per-locale result cache in the translator.
- [x] Task 1.5: Build + tests. tsc --noEmit clean; 38 tests green (currency-reference + reference-data.actions).

### Verification

- [x] Currency module registers, health-checks, and serves locale-aware options via OHS.

## Phase 2: F-AJ-06 — Profile address + currency form

### Tasks

- [x] Task 2.1: Component test: profile form renders `CountrySelect`/`SubdivisionSelect`
      + currency selector; selections persist and reload. → `ProfilePreferencesCard.spec.tsx` (orchestration: load/prefill/cascade-reset/save, selects stubbed) + `profile-preferences.actions.spec.ts` (10 action tests).
- [x] Task 2.2: Add a `CurrencySelect` combobox (mirror CountrySelect: `shouldFilter={false}`,
      controlled inputValue reset on close, aria-live, loading prop). Currency deltas per ui-design: symbol·**CODE**·name, code-first ranking, symbol/code/name filter, no flag, fixed-width symbol cell. `CurrencySelect.spec.tsx` (14 tests).
- [x] Task 2.3: Persist via NEW standalone `getProfilePreferences`/`updateProfilePreferences`
      in `profile.actions.ts` (ADR-015 userId; lazy-Profile update-or-create; boundary validation). Schema: 3 nullable cols on `Profile` (ADR-034) + migration `20260601134805`. UI: `ProfilePreferencesCard` (cascade reset; Region self-hides per PersonForm precedent) wired into `ProfileContainer`.
- [x] Task 2.4: i18n new labels en/de/fr/es (crm.currency* + profile.* — 13 keys × 4). Build (tsc clean) + tests (dictionary-completeness green).

### Verification

- [x] Profile saves/loads address + currency; reference data wired end-to-end. ADR-034 written. ui-design consulted (findings applied). 68 Welle-2 tests green + 90 dictionary tests + tsc 0 errors.

## Phase 3: F-AJ-05 — Structured Job salary (depends on CUR + F-AJ-06)

**Confirmed shape (@rorar 2026-06-01):** `salaryMin/salaryMax/salaryCurrency/salaryPeriod`
(matches the StagedVacancy precedent + reuses `formatSalaryRange`). **Fixum** = fixed-amount
mode (min==max). PLUS extensions (build extensibly — item 0):
- **Bonus** (item 1): flexible value object — fixed amount AND/OR % share, with a condition
  (e.g. "after reaching goal" / "share of sales"). Stored as JSON (`salaryBonus`) so the
  shape can grow. NOT a flat column.
- **Settings toggle** (item 2): "Entering a Fixum disables the range" — a UserSettings flag,
  default ON. Controls form behavior only.
- **Modal fields** (item 3): range/fixum + currency + period + bonus in AddJob.
- **API back-compat (autonomous decision):** keep `salaryRange` as a deprecated, computed
  read field so `/api/v1/jobs` stays non-breaking; accept structured input; best-effort
  parse legacy strings, never drop.

> Items 4–7 (gross/net calculator, gross/net selection, company perks, country libs) are
> SEPARATE tracks: `salary-calculator_20260601`, `company-perks_20260601`. NOT in this Welle.

### Tasks

- [x] Task 3.1: Allium spec for the Compensation domain (range/fixum/period/bonus,
      extensible) — `specs/compensation.allium`. `allium check` 0 errors. SalaryPeriod/BonusKind enums, Bonus value object, structured fields on Job + is_fixum derived, 6 invariants (max>=min, currency-present/active, bonus-kind field requirements), deprecated salary_range documented as computed, fixum_disables_range flag (UI-only).
- [x] Task 3.2: Parser `salaryRange`→`{min,max,currency,period}` (`parse-salary-range.ts`,
      15 tests): bucket ids + free-text + k-suffix + EU/US thousands + symbols/ISO + period +
      single-value fixum + bounds; unparseable preserved, ReDoS-safe.
- [x] Task 3.3: Migration `20260601191028` adds salaryMin/Max/Currency/Period + salaryBonus(JSON)
      to Job (additive); salaryRange RETAINED. Idempotent backfill `scripts/migrate-job-salary-structured.ts`.
- [x] Task 3.4: format-salary-range fixum (min==max) already handled — reused. Bonus value
      object + parse/serialize/validate/format in `bonus.ts` (17 tests).
- [x] Task 3.5: `fixumDisablesRange` (default ON) on UserSettings + get/update actions +
      `JobFormSettings.tsx` + new "job-form" settings section + i18n ×4.
- [x] Task 3.6: `JobSalaryFields` (range/fixum/currency/period/bonus) wired into AddJob;
      `job.actions` persists structured + computes salaryRange via shared `build-job-salary.ts` (ADR-015).
- [x] Task 3.7: API v1 schemas + select + POST/PATCH handlers accept structured (additive,
      legacy salaryRange parsed as fallback → non-breaking); promoter carries StagedVacancy structured salary.
- [x] Task 3.8: JobSalaryFields (3) + AddJob/job-audit/self-registration updated; E2E
      happy-path added (job-crud.spec, salary range) — NOT yet run (needs Playwright). Full
      jest 5213 green, tsc 0 errors, dictionary consistent.

### Verification

- [x] New jobs capture structured salary + bonus; fixum toggle works; formatter renders
      range/fixum; API v1 non-breaking; backfill script ready. ⚠ E2E written, not executed this session.

## Final Verification

- [ ] All acceptance criteria met (CUR, F-AJ-06, F-AJ-05)
- [ ] `bash scripts/test.sh` green; `bun run build` zero type errors
- [ ] Migration verified on a DB copy; rollback path documented
- [ ] i18n consistent across en/de/fr/es
- [ ] Ready for review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

## Phase 4: Wrap-Up (finale Phase — vor Merge/Push)

Per `conductor/workflow.md` § Wrap-Up-Phase. Run only after all prior phases pass.

### Tasks
- [ ] Task 4.1: Blind-Spot-Analyse — projektweit `grep` nach den Pattern-Fixes dieses Tracks; adjacent Lücken schließen.
- [ ] Task 4.2: `/comprehensive-review:full-review` (Architecture+Security+Performance+Testing+Best-Practices) — alle realen Findings autonom fixen; Agent-Claims gegen `git diff`/Code verifizieren (kein Fabrizieren).
- [ ] Task 4.3: `/understand` inkrementell-Refresh + Graph-Commit (1× am Welle-Ende, NICHT per-Commit; `autoUpdate` OFF).
- [ ] Task 4.4: Honesty-Gate voll ausführen (2 Fragen: Shortcuts/fehlende Skills/Gaps? Docs/Handoff?).
- [ ] Task 4.5: Push eigenständig — nach Gate, Fork `main`, NIE upstream.
- [ ] Task 4.6: Doku-Update (README/User-Guide/API/ADR wo nötig) + `docs/BACKLOG.md` + `docs/BUGS.md` + Memory-Handoff aktualisieren.

### Verification
- [ ] full-review: keine offenen Critical/High. Honesty-Gate sauber. Auf Fork `main` gepusht. BACKLOG/BUGS/Docs synchron.
