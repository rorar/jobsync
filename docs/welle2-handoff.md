# Welle 2 (Salary + Profil) — Phase 4 Wrap-Up Handoff

Branch: `welle-2-salary-profile`. Session: 2026-06-01 (autonomous Phase 4).
Phases 1-3 (CUR module, F-AJ-06 profile location/currency, F-AJ-05 structured salary)
were implemented + committed in prior sessions. This document records the Phase 4
wrap-up: E2E run, full-review triage+fixes, spec drift-check, and the honesty-gate.

---

## 1. What Phase 4 did

### E2E happy-path (Step 1) — GREEN
`e2e/crud/job-crud.spec.ts` "should create a job with a structured salary range".
Two real test-infra fixes were required (NOT product bugs):
- **`test.setTimeout(120_000)`** on the salary test — the default 60 s whole-test
  budget is exhausted by `ensureResumeExists` + 3 combobox-creates + tiptap on the
  8 GB NixOS VM (the error-context snapshot proved the `Minimum` spinbutton was
  present and visible; the clock simply ran out). Matches the sibling create+edit /
  create+delete tests that already carry the 120 s extension.
- **`ensureTableView()` in `deleteJob`** — the persisted Jobs view (localStorage
  `useKanbanState`) can be Kanban, which has no `role="row"` rows; the row-based
  delete cleanup now forces Table first. Deliberately NOT added to `navigateToJobs`
  (global) because a populated Table renders a `columnheader "Company"` that
  collides with the dialog's `Company` combobox in the unscoped
  `selectOrCreateComboboxOption` (`getByLabel("Company")` → strict-mode violation).
  `createJob` therefore runs in the persisted view (collision-free); only the
  row-based delete switches to Table.

Verified: salary test green in isolation and within the file (no sibling regression
from the additive `deleteJob` change). `.next` cache was cleared once (workflow rule).

### Backfill DRY-RUN (Step 2)
`DRY_RUN=1 bun scripts/migrate-job-salary-structured.ts` →
`Found 1 jobs to backfill … "7" → 60000–70000 … 1 would backfill, 0 unparseable, 0 errored.`
The real (non-DRY) backfill was **NOT** run — left for the human.

### full-review (Step 3) — 5 dimensions, findings verified against source, fixed
Review artifacts: `.full-review/{arch,security,quality,perf,testing}.md` + `TRIAGE.md`.
Every agent claim was verified against the actual file before acting (per
`feedback_verify_agent_claims`). Fixes applied (all with tests):

| # | Finding (severity) | Fix |
|---|---|---|
| F1 | `addJob`/`updateJob` never `safeParse` salary; erased-union `salaryPeriod`/currency/numbers reach DB unchecked (ADR-019) — **High** | Hardened the shared `buildJobSalaryData` into the **server-side salary validation boundary** for all 4 write paths: currency→active ISO-4217, period→`SALARY_PERIODS` membership, amounts→finite & ≥0, min/max→swap when inverted. Never throws. |
| F2 | currency not ISO-checked, percentage unbounded, no min≤max (**Med**) | Zod hardening: API `salaryCurrency.refine(isValidCurrencyCode)` (rejects 400), `percentage.max(1000)`, client `min≤max` superRefine; exported `SALARY_PERIODS` const (dedup). |
| F3 | `JobSalaryFields.fixumMode` one-time `useState` init ignored async edit-reset → editing a saved Fixum showed the range view (**High**) | Host (`AddJob`) derives `initialFixum` from the synchronous `editJob` prop + remounts via `key`; component takes it as a prop. Race-free. |
| F4 | unparseable free-text salary dropped on promotion (regression) (**Med**) | `buildJobSalaryData` retains a `salaryRangeFallback` (e.g. "competitive") in the deprecated `salaryRange` column when no structured amount was derived. Wired in promoter + both API legacy branches. |
| F6 | bonus percentage unbounded; condition stored untrimmed (**Med**) | `bonus.ts canonical` caps percentage to [0,1000] (else drops → invalidates bonus) + trims condition. |
| F7 | `Profile.userId` had no `@unique` → split-brain on concurrent lazy-create (**High**) | Added `@unique` + migration `20260601205337`; `updateProfilePreferences` → atomic `upsert`. |

Tests added/updated: `__tests__/build-job-salary.spec.ts` (new), `bonus.spec.ts`,
`addJobForm.schema.salary.spec.ts` (new), `JobSalaryFields.spec.tsx` (fixum-on-edit
regression), `api-v1-jobs.spec.ts` (salary handling — closes Testing G1),
`profile-preferences.actions.spec.ts` (upsert). Full suite: **5244 passed, 2 todo,
0 failed**; `tsc --noEmit` **0 errors**.

### allium:weed (Step 4)
`specs/compensation.allium`: `SalaryMaxGteMin`, `CurrencyIsActiveIso4217`, and the
three bonus invariants are now genuinely **enforced** by the F1/F6 code (they were
declared-but-unenforced before). Two spec edits:
- Relaxed `CurrencyPresentWhenAmount` → prose `CurrencyOptionalWithAmount`. Currency
  is intentionally OPTIONAL even with an amount (the form, API, builder, and the E2E
  happy-path all allow amount-without-currency). **Spec bug**, not a code gap.
- Added `BonusPercentageInRange` invariant + `max_bonus_percentage` config to
  document the new [0,1000] bound. `allium check specs/*.allium` → **0 errors**.

---

## 2. Honesty-gate

### (a) Shortcuts / missing skills / gaps?

- **`comprehensive-review:full-review` was executed in substance, not by its literal
  interactive orchestration.** The packaged skill is a 5-phase state-machine with
  human approval checkpoints (`AskUserQuestion`) and `.full-review/state.json`
  bookkeeping. Running autonomously (no questions) on a resource-tight VM, I ran the
  same five review dimensions via the skill's own specialized subagents
  (`architect-review`, `security-auditor`, `code-reviewer` + perf/testing personas)
  in parallel, wrote each dimension's findings to `.full-review/`, and did the triage
  + verification + consolidation myself. The analytical coverage is equivalent; the
  difference is no interactive checkpoints and no `state.json`. Flagged for honesty.
- **`CurrencyPresentWhenAmount` was resolved by relaxing the spec, not tightening the
  code.** This is a genuine product judgement (currency optional), not a shortcut —
  enforcing it would have broken the intended UX + the E2E happy-path. Recorded so a
  reviewer can override if currency-required was actually intended.
- **`min>max` is auto-swapped** in `buildJobSalaryData` (defensive backstop; the form
  + API reject it first). Swapping is a deterministic auto-correct, not silent data
  loss — both values are kept. Documented in code + spec.
- **No new findings were re-surfaced from the known deferral list** (`docs/NOT-PLANNED.md`
  + CLAUDE.md deferred-sprints). The perf "eager currency fetch on `AddJob` mount" is
  real but minor and pre-existing (AddJob is always-mounted); left as a noted follow-up,
  not fixed, to avoid scope creep.
- **Pre-existing items deliberately NOT touched:** hardcoded English `throw` in
  `profile.actions.ts:87/158/251` + `promoter.ts:62` (NOT in the Welle 2 diff; new
  Welle 2 code uses i18n keys); the codebase-wide Zod-4 `.datetime()/.url()/.uuid()`
  deprecation warnings (pre-existing, out of scope).

### (b) Docs / handoff complete?

- `docs/BACKLOG.md`: F-AJ-05, F-AJ-06, CUR marked **ERLEDIGT** with code references.
- `specs/compensation.allium`: updated + 0-error.
- This handoff + the conductor track + the session memory are updated.
- README / User-Guide salary+profile section: the structured-salary UI is shipped but
  the **display** of structured salary on job cards/detail is a tracked follow-up
  (the `formatSalaryRange`/`formatBonus` formatters exist but are not yet wired to a
  read surface). A user-facing "Salaries & profile location" guide section is best
  written once the display surface lands; noted as a follow-up rather than documenting
  a half-visible feature.

### Open items for the human (none block anything)

RESOLVED since this handoff was first written (do NOT re-flag):
- ✅ `/understand` graph refresh — DONE in a separate session: commit `60a8856`
  "chore(understand): refresh knowledge graph after Welle 2", pushed to fork `main`.
- ✅ Migration `20260601205337_add_profile_userid_unique` — NOT a manual step: applies
  automatically on deploy (`docker-entrypoint.sh` → `prisma migrate deploy`); already
  applied on the dev DB. (Only fails a deploy if duplicate Profiles exist — they don't,
  single-user self-hosted.)
- ✅ Dev-DB salary backfill — run (1 job: `"7"` → 60000–70000); idempotent re-run = 0.

STILL OPEN (deferred, non-blocking):
1. Run the real (non-DRY) `scripts/migrate-job-salary-structured.ts` backfill on the
   PRODUCTION DB once deployed (optional; only fills pre-existing jobs).
2. Follow-up (memory-tracked): DISPLAY structured salary + bonus on job detail/cards;
   relocate the eager currency/settings fetch in `AddJob` to dialog-open; write the
   User-Guide salary section once a display surface lands.

> Future agents: the RESOLVED items above are DONE — do not re-surface them as open.
> Welle 2 is genuinely complete (merged `d9b9d22`, pushed to fork `main`).
