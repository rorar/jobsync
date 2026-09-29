# Open items register — as of 2026-09-29

**State this describes (updated 2026-09-29):** branch `fix/e2e-elysium` at `294e13c8`, the merge of
`feat/quick-capture-and-referral-events`. That merge was first committed as `a3863ab4` and amended
at 14:15 with an unchanged tree (one word of the message), so `a3863ab4` is no longer in the history.
At `294e13c8` the branch is 297 commits ahead of `main` and 0 behind, with merge-base `968ac32a`,
and 29 commits ahead of `origin/fix/e2e-elysium`, all unpushed. While this update was being written,
five more commits landed (`3da76c83..072f87d3`: docs, GitHub templates, script comments, a
label-sync script and `docs/BUGS.md`; no application code). At `072f87d3` the counts are 302 and 34. The rows they touch say so. The
register's own commits come after that and are not counted. `git rev-list --count
origin/fix/e2e-elysium..HEAD` gives the live number. Every statement below is true *as of the
commit and date it names*; none is a standing claim. Where something could not be checked, it says
so.

**Line anchors.**
- Rows added or edited on 2026-09-29 cite lines at `294e13c8`.
- The exception is `docs/BUGS.md`. `f7100ae7` and `072f87d3` inserted six rows into it after the
  merge, so its lines in edited rows are cited at `072f87d3`.
- Rows not touched since 2026-09-28 keep their anchors at `efcd2570`. `403cda87`, the merge and
  the later commits added about 300 lines to `docs/BUGS.md`, so in an untouched row a `BUGS.md`
  line number can be stale: search by ID.
- `CLAUDE.md` is cited "at `294e13c8`", that is, before `8094ff67` corrected the drift that M1,
  M16 and M38–M43 describe. M48 cites it at `688df386`.

**Original state (2026-09-28), kept as history:** branch `fix/e2e-elysium` as it stood before this
register was written — `efcd2570`, working tree clean, 6 commits ahead of `origin/fix/e2e-elysium`
(`cb136619` … `efcd2570`, unpushed). Each item was re-checked against the file, the git history or
GitHub on 2026-09-28 — not copied from an earlier document.

**Why this file exists.** Open work had spread over nine `docs/handoff-*.md` files, three knip
investigations, two ROADMAP discovery entries, two GitHub issues and an out-of-repo session handoff.
This register collects what is still open into one list, ordered by who has to act. On 2026-09-29 a
sweep of every jobsync session from 2026-08-20 to 2026-09-28 added 68 rows to `docs/BUGS.md`
(`403cda87`; six more followed the same day) and the decisions, doc drift and housekeeping in this file. § 8 is the index from
every sweep ID to where it lives now.

> **The maintainer's decision criterion** for every GDPR and architecture decision below:
> *"most flexible and long-lasting BUT completely GDPR compliant."*
> — `docs/handoff-2026-08-30-retention.md:314`. The same handoff notes that this criterion may
> invert a pragmatic reading, and that it did so once already (its § 4.1).

## How to work an item (for agents)

- **Evidence.** Every row cites `path:line`. Defects live in `docs/BUGS.md` rows, found by ID. The
  sweep's own account, with the method and each finding's origin, is `docs/sweep-2026-09-29.md`.
  The per-probe reports and source transcripts are kept out of the repo. Re-read the cited file at
  HEAD before acting, because line numbers drift.
- **Owner.** The rows in § 2 need the maintainer; the rows in § 3 an agent can do without asking.
  The tables added on 2026-09-29 have an Owner column, which overrides the section default:
  - `agent`: unblocked; any session may do it.
  - `maintainer`: only @rorar acts, for example a push, a legal judgement, host configuration, or
    an edit someone else left uncommitted.
  - `needs-decision`: a maintainer decision first, then agent work.
  - `maintainer → agent`: the maintainer decides whether and when; an agent does the work.
  - A parenthesis qualifies the owner. `agent (gate: …)` names the run only the orchestrator may
    do. `maintainer (push)` or `maintainer (trigger)` names what the maintainer has to do or watch
    for. `agent (doc) / needs-decision (MOD-B2)` splits one row between two owners.
- **Gates.**
  - Use the wrappers only: `scripts/typecheck-safe.sh`, `scripts/test.sh`, `scripts/test-e2e.sh`,
    `scripts/build-safe.sh`.
  - Judge a run by its last line, `[<name>] EXIT=<rc>`, never through a pipe. A run without an
    `EXIT=` line failed before it started.
  - Subagents run no tests, builds, typechecks or E2E. The orchestrator does.
  - Edit `specs/*.allium` through `allium:tend` only, never by hand.
  - Every user-visible string goes into all four locales (en, de, fr, es).
  - A UI change goes through the ui-design consult first (`design-review`, `accessibility-audit`,
    `/responsive-design`), as `CLAUDE.md` § Post-Work Checklist requires.
  - A newly found defect gets a `docs/BUGS.md` row before the fix starts.
- **Completion.**
  - Do not delete the row. Mark it closed here with the date and commit.
  - In the same commit, update the `docs/BUGS.md` row, its header line and its block-table counts.
- **Push** only when the maintainer asks.

**What it supersedes** (for open items only — the history in those files stays valid):
`docs/handoff-2026-09-14-e2e-fixture-consolidation.md` § 4 · `docs/handoff-2026-09-14-post-job-teardown-migration.md` § 3 ·
`docs/handoff-2026-09-13-session-resume.md` §§ 3–5 · `docs/handoff-2026-09-08-open-items.md` § 2
(§ 2.1 and § 2.2 are closed; only § 2.3 housekeeping survives, below) · the "Pending" list of the
session-handoff record `2026-09-28-combobox-seam-and-doc-integrity.md`, which also contains one false
claim corrected in § 3, item M6.

**Added 2026-09-29:** each item of these documents is mapped in § 9.
- `docs/handoff-2026-09-02-e2e-closeout.md` § 9b. Its claim to be "current" is item M31.
- `docs/handoff-2026-08-24-orphan-prune.md`: the open items in § 8 and in the § 11 status update.
- `docs/TASKLIST-2026-08-26.md`: all eleven tasks.
- `docs/handoff-2026-08-30-retention.md` § 4 (decisions) and § 5 (TODO-1..14).
- `~/elysium-jobsync-migration.md` § 5. This file is out of the repo.
- `docs/handoff-2026-08-19.md` (imported by `377428d4`; history). Its only fact that was recorded
  nowhere else is the ActivityTimeline ui-design waiver, now noted in D15.
- `/home/pascal/vor-e2e-session-summary.md`. This file is also out of the repo, and it is **not
  reliable**. The sweep checked it on 2026-09-29 against transcript `4523522a` and git:
  - three claims are wrong: the tool-use counts, the list of named sub-agents, and when
    `adr-retention` was spawned;
  - three are stale: the merge order, the Chromium override, and the dev-server rule;
  - one is misleading: the run period.

  Do not work from it.

**What it does not supersede:** `CLAUDE.md` § Deferred Sprint Work, `docs/NOT-PLANNED.md`,
`docs/BUGS.md`, `docs/sweep-2026-09-29.md` (the sweep's evidence, not a work list).

---

## 1. Verification gate — blocks any merge to `main`

| # | Item | Evidence |
|---|---|---|
| V1 | **✅ Closed 2026-09-29 — full suite green at `688df386`** (code = the `294e13c8` merge; later commits touched only docs, templates and script comments): `./scripts/test-e2e.sh` production mode, **128 passed (8.9 min)**, 0 failed, `[residue] OK`, `[test-e2e] EXIT=0`. Chromium fallback 1234 vs pinned 1200 (the Playwright bump is a register D row). History below. **The full Playwright suite has not run since the Job teardown migration.** The last full run on record is 112/112 on 2026-09-08 (`scripts/check-e2e-residue.sh:128`). Since then only targeted runs: the 5 migrated Job specs (28 passed, `docs/handoff-2026-09-14-post-job-teardown-migration.md:8`), 7 specs (41 passed) on 2026-09-14, then `activity-crud` alone. `test-results/.last-run.json` ("passed", 2026-09-14 12:07) is that single-spec run, not a suite. **2026-09-29:** still true; the merge `294e13c8` adds no E2E change but does add production code (`import "server-only"` in `src/lib/crm/orphan-targets.ts:67`). | Production code changed since `d5497bdf` without a full run: `src/auth.config.ts` (E2E-B49 — the `authorized` callback every matched request passes through), `src/app/api/v1/jobs/route.ts` (E2E-B48), `src/lib/connector/data-enrichment/orchestrator.ts` (new chain guard), 13 deleted files (`e4fe2a23`), `prisma/seed-e2e.ts` (+48). |
| V2 | **✅ Closed 2026-09-29 on `294e13c8`:** `bash scripts/test.sh` 320 suites, 5911 passed + 2 todo, `[test.sh] EXIT=0` (the merged database-tier test ran; `sqlite3` present); `bash scripts/typecheck-safe.sh` `[typecheck-safe] EXIT=0`. History below. Jest and typecheck were last run on 2026-09-14: `scripts/test.sh` 320 suites, 5910 passed + 2 todo; `scripts/typecheck-safe.sh` `EXIT=0`. Since then only a comment (`cb136619`) and a `describe` title (`3736c4e2`) changed in code, so the result still describes the code — but re-run before a merge. **Updated 2026-09-29: no longer true.** The merge changed code and tests: `git diff --stat 468db168..HEAD -- src __tests__` lists 7 files — `import "server-only"` in `src/lib/crm/orphan-targets.ts:67`, a new 50-line database-tier test in `__tests__/crm-orphan-prune.integration.spec.ts`, 3 lines in `__tests__/crm-orphan-prune.spec.ts`, and comment-only lint fixes in the three `cdp-scripts/*.mjs`. The 2026-09-14 result does not describe `294e13c8`. Both must be re-run. | `git diff --stat 468db168..HEAD` |
| V3 | The `allium:weed` pass that ADR-046's plan named as "the actual spec-vs-code check" after the migration was never run. **Inputs added 2026-09-29:** `SPEC-B5` (reload-only deletion proof vs `DeletionProofSurvivesTheModalAndCitesTheServer`), M21, and the 204-as-proof ambiguity against `specs/e2e-test-infrastructure.allium:980-988` (sweep G-13-22). **RAN 2026-09-29 — verdict dirty.** The pass read `403cda87`. The merge added only `scripts/check-spec-refs.mjs` under `specs/`, `e2e/`, `scripts/`, `src/components/` and `prisma/`, so the result holds at `294e13c8`. The report is the sweep evidence's `wave/weed-report.md`, out of repo. It found 20 divergences (14 spec bugs, 5 code bugs, 1 aspirational) and 7 open questions; its `allium check` result, 0 errors, proves syntax only (report § 0). Where each went: **spec bugs** → M44, which absorbs M21. **Decisions** → D39 (§ Q1, *Proposed resolution for Q1*, the mechanism clause), D40 (§ Q1, *Remaining E2E-B37 shape*), D41 (§ Q2, *Which side is wrong*), D42 (§ 5.6) and D3 (§ Q3). **Code bugs** → BUGS `E2E-B70` (*TrackedFactoryRegistersBeforeWrite*, false leak warning), `E2E-B71` (§ 5.1, seed-template stamp) and `E2E-B72` (inline cleanup, which is D40), all filed by the lead in `f7100ae7`. **Comment and doc drift:** § 5.9 → M45, which absorbs M20; § 5.10 → M46. § 5.7 (`CIExecution`) stays aspirational until D11 is decided. What the pass did not check is listed in § 5.11. | Not recorded in either 2026-09-14 handoff or in ADR-046. |
| V4 | **CI on `main` is red, and has been for every recorded run since at least 2026-08-07** (the six most recent runs on `main`, CI and Docker Publish, all `failure`; cause checked for the latest pair only, `968ac32a`, 2026-08-19). CI (run `32244003432`) stops at Lint on the five `no-empty` errors in `src/lib/connector/arbeitsagentur-account/cdp-scripts/*.mjs` (M17); Type check, Unit tests and Build were skipped. Docker Publish (run `32244003429`) fails in `npm ci` with `ERESOLVE`: `next-auth@5.0.0-beta.30` wants `nodemailer@^7.0.7` as a peer, the project pins `^8.0.4` (D10). None of the files involved changed `main..HEAD`, so merging this branch as it is would land red on both — **inferred, not run**. CI triggers only on `main` / `dev` (`ci.yml:3-7`), so this branch's own CI steps have never run in Actions. **Updated 2026-09-29 (`294e13c8`):** the **lint half is resolved on this branch** by the merge. `036e6b91` (`WH-B1` in `docs/BUGS.md`) gives each of the five empty `catch` blocks a comment, e.g. `cdp-auto-complete.mjs:51`. lint: verified 2026-09-29 on `294e13c8` — `bun run lint` 0 errors (react-hooks/exhaustive-deps warnings only). The **Docker half** is `INF-B1` in `docs/BUGS.md`; the strategy stays decision D10. `INF-B1`, as corrected in `072f87d3`, records that Docker Publish has never succeeded since it was added on 2026-06-02. The Docker research on 2026-09-29 found the same `npm ci` exit on the first, a middle and the latest run, so "cause checked for the latest pair only" no longer limits the Docker half. The sentence "none of the files involved changed `main..HEAD`" no longer holds: `package.json` and the three `.mjs` files differ now. | `gh run view 32244003432 --log-failed`; `gh run view 32244003429 --log-failed` |

V1 note: `docs/BUGS.md:155,185` record "128 passed, `[residue] OK`" on 2026-09-09, after the 112/112 of 2026-09-08. Whether that was a full-suite run is not recorded; every production change V1 lists came after it either way. *(Re-anchored 2026-09-29: those rows, `E2E-B38` and `E2E-B47`, are now at `docs/BUGS.md:436,466`.)*

Gate to run, each judged by its own `EXIT=` line, never through a pipe: `./scripts/test-e2e.sh` (full),
`bash scripts/test.sh`, `bash scripts/typecheck-safe.sh`.

---

## 2. Maintainer decisions

| # | Decision | Context |
|---|---|---|
| D1 | **How and when `fix/e2e-elysium` reaches `main`.** It is 274 commits ahead of `main` (= `origin/main`), 0 behind, merge-base `968ac32a` (2026-08-19). It carries two product bug fixes (E2E-B48, E2E-B49), ADR-045, ADR-046, the fixture consolidation and 13 dead-code deletions. The branch name no longer describes its content. **Updated 2026-09-29:** 297 ahead at `294e13c8` (302 at `072f87d3`), 0 behind, same merge-base. It now also carries the sibling merge (`294e13c8`) and the sweep's 68 `docs/BUGS.md` rows (`403cda87`). Before the merge to `main`, also do M47, the maintainer's steps for the GitHub files added on 2026-09-29. | `git rev-list --count main..HEAD` |
| D1a | Three sibling branches hold commits this branch lacks (`git cherry` shows all as genuinely absent, not patch-equivalent). **Whether each is superseded or still needed has not been established.** **Updated 2026-09-29: one of the three is merged; two stay open** — see the dated notes in the rows below. **Updated again 2026-09-29 (late):** the other two are assessed, and their useful files are imported file by file. Only deleting the two branches is left, and that is the maintainer's call. The outcome is in each row below. | see below |
| | `feat/quick-capture-and-referral-events` — 11 commits. Includes a **second, independently built** spec reference checker (`scripts/check-spec-refs.mjs`, `cb614f9c`, 2026-08-25, for qualified cross-spec references) while this branch has `scripts/check-spec-refs.sh` + `tools/allium-refcheck/` (`458d0da0`, 2026-09-06, titled "the reference-integrity gate this project had no tool for"). `ci.yml` diverges both ways: this branch has the notification-writer, allium and spec-refs steps; that branch has the database test tier (`010c9008`). `docs/BUGS.md` diverges too: that branch has four findings this one lacks, `WH-B1`..`WH-B4`, two of them marked OPEN there: `WH-B2` (`__tests__/TasksPageClient.spec.tsx` flakes under full-suite load) and `WH-B3` ("retention expiry archives but never erases"), plus a header of 610 / 607 / 4 open against this branch's 684 / 676 / 2. `72f4138f` (2026-08-26, "user-configurable retention — erase on expiry") is an ancestor of this branch and not of that one. **Checked 2026-09-28 (probe, then re-verified by hand):** at HEAD it closes every item `WH-B3` names — the sweep matches `status: { not: "anonymized" }` (`src/lib/scheduler/crm-cron.ts:72-74`, so rows archived by the old code are reached), erases through `anonymizePersonCascade` (`:127-132`), and no longer reads or copies the name (`:80`). One deliberate exception: with `crmRetentionEnabled` off the sweep skips the Person (`:104`) and the PII stays — a documented opt-out (ADR-042 § 2), default on (`src/models/userSettings.model.ts:122`). The whole path is latent: the only `prisma.person.create` hardcodes `dataSource: "manual"` (`src/actions/person.actions.ts:162,181`), so no `auto_created` Person exists yet. `WH-B2`: `__tests__/TasksPageClient.spec.tsx` is byte-identical on both branches (last changed `f7d0d567`, 2026-03-29), so the shape it names is still there; `docs/handoff-2026-08-30-retention.md:389` records that it "passed on the last two full runs"; it was not re-run. Neither `WH-B` finding has a row in this branch's `docs/BUGS.md`, although `E2E-FIX-BRIEF.md:133` says WH-B2 is "recorded … in `docs/BUGS.md`". **MERGED 2026-09-29 (`294e13c8`); `git rev-list --count HEAD..feat/quick-capture-and-referral-events` = 0.** The merge message resolves the three conflicts: **(1)** `package.json` is a union. `check:spec-refs` stays on the `.sh` checker (`package.json:18`), the `.mjs` is added as `check:spec-qualified-refs` (`:19`), and the CI step that used to run `check:spec-refs` a second time now runs it (`ci.yml:106-107`). **(2)** `CLAUDE.md` keeps this branch's side in both hunks. **(3)** `docs/BUGS.md` keeps this branch's header and block table, adds the sibling's `WH-B1..B4` sections, and gives them a block row. Since the merge, `WH-B3` is recorded as closed by `72f4138f` (`docs/BUGS.md:123`) and `WH-B2` is open (`:197`), so the sentence above that neither `WH-B` finding has a row is no longer true. The porting hazard is moot, because the merge took the tip state. | `git diff fix/e2e-elysium feat/quick-capture-and-referral-events -- .github/workflows/ci.yml` |
| | **Classified 2026-09-28 (probe, key points re-verified by hand):** none of the 11 commits exists here in any form; only `ci.yml`, `CLAUDE.md`, `docs/BUGS.md` and `package.json` changed on both sides since the merge-base `6a30e6e4`. Missing here: the `server-only` import and W-D2 test (`4086ec09`), the `sqlite3` CI step and ADR-040 update (`010c9008`, `02e10d0f` — ADR-040:82 here still says the tier "is not yet wired"), the lint fix (`036e6b91` — the five empty `catch {}` blocks are live in `src/lib/connector/arbeitsagentur-account/cdp-scripts/*.mjs` and `.eslintrc.json` makes `no-empty` an error), a handoff update, and all `WH-B` rows. Conflict: both branches added `check:spec-refs` to `package.json`, pointing at different checkers. **Porting hazard:** `010c9008`, `8dd32004` and `9ce9195d` add wording that `02e10d0f` later retracts — port the tip state of ADR-040 and `public-api-v1.md`, not commit by commit. The two checkers are complementary, not rivals (probe's comparison, spot-checked): the `.mjs` resolves qualified `alias/Sym.member` references anywhere; the `.sh` + `refcheck.py` kind-checks five reference kinds *(corrected 2026-09-29: this row said "four positions"; `scripts/check-spec-refs.sh:12` says five)* and has a distinct "could not run" exit. The probe estimates ~32 of 38 qualified cross-spec references are checked by nothing in CI here (its own regex count, not independent). CI runs only on push/PR to `main` and `dev` (`ci.yml:3-7`), so none of this has ever been exercised on this branch; whether `bun run lint` (`next lint`) reaches the `.mjs` files — i.e. whether CI would go red after a merge — is not determined. **2026-09-29:** all of this is now on the branch through `294e13c8`. | `git diff 6a30e6e4 …`; `.eslintrc.json` |
| | `spec/gdpr-data-rights-person-stub` — 2 commits (`mise.toml`; six plan/analysis docs never added). The main checkout `/home/pascal/projekte/jobsync` sits on this branch, idle since 2026-08-31. **All seven files are absent here** (checked by path and by distinctive lines; `docs/next-session-prompt.md:78` still points at one of them). The main checkout is also **not clean**: 61 uncommitted entries — 54 deleted `docs/.remember/logs/…`, modified `.remember/remember.md`, four `.understand-anything/*` files, `docs/handoff-2026-08-18.md` and `playwright.config.ts`. Not this session's; not touched. **Still open 2026-09-29:** 2 commits ahead of HEAD. `mise.toml` is `cf12dca8` ("track mise.toml, the host move's environment definition") and is not in `294e13c8`; that is `~/elysium-jobsync-migration.md` § 5.3. **Outcome 2026-09-29 (late): assessed.** The files were imported one by one, not by commit, so `git cherry HEAD spec/gdpr-data-rights-person-stub` still shows both commits `+`. **(1)** `377428d4` imported five files from `fa9b2a25`: `docs/handoff-2026-08-19.md`, three files in `docs/superpowers/plans/` (the completed IF-2 Zod validation plan, the completed geocode/holiday implementation plan and that plan's session prompt), and `docs/superpowers/specs/2026-06-09-doc-media-generator-design.md`. The design and two of the plans got dated notes on 2026-09-29. **(2)** `43c50304` imported `docs/twenty-crm-implementation-patterns.md` unchanged as a reference document (maintainer decision 2026-09-29). **(3) Not taken:** `mise.toml` (`cf12dca8`). Its `bun = "latest"` would undo the 1.4.0 pin, and its `_.file = ".env"` fails on this checkout's `.env`. `4df39b43` replaced it with a new pinned `mise.toml` (§ 9, item 5.3). **(4) Branch deletion:** the maintainer can delete the local branch and `origin/spec/gdpr-data-rights-person-stub`, but only after the main checkout moves off the branch. The main checkout still has it checked out and holds 61 uncommitted entries that belong to someone else (re-counted 2026-09-29). | `git worktree list`; `git -C /home/pascal/projekte/jobsync status --porcelain` |
| | `docs-spotlight-research` — 3 docs-only commits (Spotlight 2.20 research, F.7 notes). **Both added documents are absent here.** **Still open 2026-09-29:** 3 commits ahead of HEAD. **Outcome 2026-09-29 (late): assessed and imported.** `e1f686bc` and `048e1fc1` were cherry-picked as `31709c36` and `3a5baee3`; `git cherry` now shows both as `-`. From `32f5fece`, only `docs/design/2026-08-05-f7-open-threads-reference.md` was taken (`b55d3f32`), so `git cherry` still shows that commit as `+`. **Not taken:** the same commit's `.remember/remember.md` change, a stale 2026-08-05 recovery handoff (the file is tracked and empty at HEAD). Both documents got dated notes on 2026-09-29. F.7's three document questions are now D45. No worktree has this branch checked out. The maintainer can delete it and `origin/docs-spotlight-research` at any time. | `git cherry -v HEAD docs-spotlight-research` |
| D2 | **Combobox architecture — Axis 1 first** (shell component / headless hook / descriptor contract). Full option space, evidence and the DDD reading in GitHub issue [#2](https://github.com/rorar/jobsync/issues/2) and `docs/ROADMAP.md:2835` (`Discovery: Combobox-Konsolidierung …`). This replaces the older "Option A / Option B" framing in `docs/knip-unused-ui-primitives.md` § 5.5. | Blocks M8's framing (not its fact) and the knip ignore entry in D6. |
| D3 | **What `TriggerAriaExpanded` means** (`specs/ui-combobox-keyboard.allium:362`): "declares `type="button"` in JSX" or "renders it". Three of fourteen triggers (`WizardShell.tsx:269`, `InterviewForm.tsx:270`, `:450`) only render it because Radix injects it. Decide in an `allium:weed` pass. **2026-09-29, weed pass § Q3:** the text supports both readings, which is the defect. The pass recommends doing both: add `type="button"` at the three sites, and tend the guarantee to rendered behaviour via `allium:tend`. That removes the Radix 1.1.15 coupling that M7 would otherwise have to pin. The decision stays here. | `docs/knip-unused-ui-primitives.md` § 5.5, "Three separate facts" |
| D4 | **Which prevention measures to build** (from the 2026-09-28 discussion): (A) a doc-citation integrity check · (B) graph staleness hook that acts instead of warns · (C) warnings at the point of confusion · (D) deferral entries must name what they unblock · (E) sub-agent briefing rules · (F) document the search-tool traps — **with the mechanism measured on 2026-09-28, which differs from how the 2026-09-27/28 records describe it.** The `grep` shell function runs `( exec -a ugrep "$CLAUDE_CODE_EXECPATH" … )` and falls back to `/home/pascal/.local/bin/claude` when that path is not executable. Since 2026-09-22 that fallback is a 177-byte `sh` wrapper (the session-handoff launcher), and `exec -a` does not survive a script, so the Claude CLI receives the flags: every call fails with `error: unknown option '-G'`, and `-v` prints the Claude version. It is not about clustered flags — `grep -n -i` failed too. It hit the tmux session because that process ran 2.1.270, whose binary the updater had removed from `~/.local/share/claude/versions/`; with `CLAUDE_CODE_EXECPATH` pointing at an existing version, `-ci`, `-n -i` and `-v` all work (verified). Any long-running session whose version gets pruned will hit it again. Separately, even a working `grep` passes `--ignore-files`: `grep -rl BUILD_ID .next-e2e` finds 28 files where `command grep` finds 33. And `awk` is `mawk`: `IGNORECASE` is silently ignored — use `tolower($0) ~ /…/`. Two more traps in the same family: Bash tool output is compressed and paraphrased before the model sees it (recorded only in the auto-memory file `feedback_bash_output_is_paraphrased_not_verbatim.md`, **not** in `CLAUDE.md`, which documents only the `| tail` exit-status trap — a claim made on 2026-09-28 that `CLAUDE.md` already covered it was wrong); and self-imposed width caps such as `printf "%.140s"` hide the end of long Markdown table rows, which is where BACKLOG and BUGS rows keep their triggers and dispositions (M6). Two facts bear on this: M1 below needs no new mechanism and should come first; and a reference checker already exists twice across branches (D1a), while neither checks `path:line` citations in Markdown. **Added 2026-09-29:** the sweep found a fourth loss mechanism for (E): sub-agent reports reached the lead only as notification text cut at about 4,000 characters, or as nothing at all under Claude Code 2.1.246, and the automatic security-review hook never delivered its findings to a working session. Most LOST items in § 8 come from that (`docs/BUGS.md` § Session 2026-09-29, preamble). | |
| D5 | **CHANGELOG policy.** The newest section is `[2026-05-10]`; nothing since (Waves 1–5, the E2E work) is recorded. Revive or declare frozen. Two false shipped-fix claims were found in it this month: `CHANGELOG.md:491` (WEED-1, corrected 2026-09-14) and `CHANGELOG.md:429` (M3). | |
| D6 | **GitHub issue [#1](https://github.com/rorar/jobsync/issues/1)** (LinguiJS: knip ignore, three false doc claims, migration scope), open since 2026-09-02. None of its three parts is done — `knip.ts:27-30` still ignores only the EURES generated file. Part 1 edits the same `knip.ts` block as the `base-combobox.tsx` ignore (gated on D2), so the two could share a commit. **Re-checked 2026-09-28:** Parts 1, 2a (local side) and 2c still hold — no `knip.ts` entries, zero importers, `src/i18n/README.md:179` still gates on the swc-plugin, the four catalogs are 108 bytes each. The 2b promise now sits at `CLAUDE.md:193` and `README.md:189-190`. The issue's own figures need correcting: `t("…")` call sites grew to 2 380 (regex; the issue's 2 344 reproduces at 2026-09-02), and "6 448 dictionary entries" was never reproducible — HEAD has 9 600 (2 400 keys × 4). Part 3's `pkill` sites in `build-safe.sh` / `dev-e2e.sh` are comments now and port 3737 is no longer hardcoded. Upstream plugin claims are external and were not checked. **CONVERTED 2026-09-29 → M23; no longer a decision.** The maintainer decided Parts 1–2 on 2026-09-02, in session `47cb5d34`, transcript L6785: the `knip.ts` ignore plus the README and `CLAUDE.md` correction, and *"die Umstellung ist eine Sache für eine eigene Session"*. Part 3, the migration itself, stays in issue #1 for a separate session. **Correction to this row:** `README.md:189-190` is wrong, because `README.md` has 110 lines. The promise is at `src/i18n/README.md:189-190`. | |
| D7 | **Public API v1 route-stack dedup.** Recounted 2026-09-28 over the 8 working handlers: path-id UUID guard ×6, **ownership check `findFirst({ id, userId })` + 404 ×6** (not ×5 — five only if the single-job GET at `jobs/[id]/route.ts:25` is excluded), JSON body parsing ×4, Zod error formatting two idioms ×3 each (split by site, not by query vs body). `isValidUUID` already exists at `src/lib/api/schemas.ts:97` and all six sites use it; no helper exists for body parsing, Zod formatting or the ownership 404. Found alongside, and verified: the six 404s disagree — `status/route.ts:62` returns the i18n key `api.statusChange.jobNotFound`, the others English text; each route's own `OPTIONS` handler is dead, because `with-api-auth.ts:38-40` answers preflight first; `src/app/api/logos/[id]/route.ts:26` re-declares the UUID regex. Reported by the probe, not re-verified: duplicated resume/tag ownership checks and salary block between the create and update handlers. Optional, deferred. **Added 2026-09-29 (sweep G-28-02, verified at `294e13c8`):** one more duplicate. The company pre-check at `src/app/api/v1/jobs/route.ts:120,125` repeats `trim().toLowerCase()` inline, which `findOrCreate` already does at `src/lib/api/helpers.ts:21`. | `docs/handoff-2026-09-14-e2e-fixture-consolidation.md:228` |
| D8 | **New, 2026-09-28 — a fail-open path in front of an irreversible action.** `getPrivacySettingsForUser` returns the defaults on *any* error — a failed DB read or an unparseable settings JSON (`src/lib/account/privacy-helpers.ts:25-32`) — and the default is `crmRetentionEnabled: true`. The erasure sweep reads the setting through exactly that path (`crm-cron.ts:92` → `src/lib/crm/retention-policy.ts:45`). So a user who switched retention **off** would have expired auto-created contacts **erased** whenever that read fails. Latent today (no `auto_created` writer, see D1a). Needs a `docs/BUGS.md` row and a choice: fail closed for the destructive sweep only, or change the helper for all its callers (account deletion, confirmation endpoint). **2026-09-29:** the defect now has its row, `GDPR-B2` in `docs/BUGS.md`. The choice stays here. | found by probe, chain re-traced by hand |
| D9 | Two existing open questions on CRM retention, recorded in the specs and not tracked anywhere else: `quick_capture` Persons carry no retention deadline at all (`specs/crm.allium:1953`), and `CrmActivityLog` retention is undecided (`docs/adr/042-…:366-376`). **Added 2026-09-29 (sweep T25, A66):** **(1)** `GDPR-B4` in `docs/BUGS.md`: `CRM_CONFIG.timelineRetentionDays` (`src/models/person.model.ts:343`) is dead configuration, yet `specs/gdpr-data-rights.allium:445` names it as the source of the purge window. The cron reads `crmActivityLogRetentionDays` (`src/lib/scheduler/retention-config.ts:8`). The mechanical fix belongs to the BUGS row; the policy stays here. **(2)** The fact the policy turns on: `CrmActivityLog` has **three** PII carriers — `targetPersonId`, `details` and `linkedRecordName`. The anonymise rule as specified nulls only the first, while `crm/AnonymizePerson` scrubs all three, so anonymise-as-specified is worse than deleting. Any anonymise answer must scrub all three (`docs/handoff-2026-08-30-retention.md:324-328`; ADR-042:366-376). Ownership is settled: `gdpr-data-rights.allium` Scope S4 owns `CrmActivityLog` retention. | |
| D10 | **✅ Decided and fixed 2026-09-29 (maintainer: "beheben"), option (a):** bun 1.4.0 from `bun.lock` in the image, `node:22.23.2-alpine`, `package-lock.json` deleted, CI pinned to bun 1.4.0 / node 22 (exact 22.23.2 since `4df39b43`, with `mise.toml`), `.dockerignore` extended (`SEC-B10`). Verified locally amd64 (build + container smoke test); arm64 untested. `INF-B1` closes at the first green Docker Publish on `main`. The next-auth / nodemailer upgrades stay separate (`SEC-B8`, `SEC-B9`, issue #3). History below. **Docker image dependency strategy.** The Dockerfile installs with `npm ci` (`Dockerfile:12`) from `package-lock.json`, last changed 2026-03-06 (`db04d5f2`), while development uses bun (`bun.lock`). Besides the `nodemailer` / `next-auth` peer conflict (V4), the lockfile still lists `@radix-ui/react-avatar`, which this branch removed from `package.json` (`7b19a067`) — a second, inferred reason for `npm ci` to fail. Options include pinning `nodemailer` to the peer range, `--legacy-peer-deps`, or building the image with bun; not evaluated. **2026-09-29:** the failure is `INF-B1` in `docs/BUGS.md`; this row stays the decision. `072f87d3` corrected `INF-B1`. The workflow has never succeeded: 36 of 37 runs failed at `npm ci` and 1 was cancelled. The lockfile lacks 24 direct dependencies (inherited), and a Docker research pass recommends building with bun from `bun.lock`. The same commit filed `SEC-B8` (`next-auth`) and `SEC-B9` (`nodemailer`), published advisories against both installed versions. Upgrading both packages together also changes the peer conflict, so decide this row together with those two. **Docker research, 2026-09-29** (sweep evidence `wave/docker-report.md`, out of repo; `INF-B1` carries the facts). *Correction to this row:* `@radix-ui/react-avatar` in the lockfile is **not** a reason for `npm ci` to fail, because npm does not report extra lock entries (inherited: the report's reading of the npm 10 source). The real second reason is that `package-lock.json` lacks 24 direct dependencies, so every npm-based option also needs a regenerated lockfile. **Recommendation:** build the image with bun from `bun.lock` on `node:22.23.2-alpine`, delete `package-lock.json`, and pin one bun version in both the Dockerfile and `ci.yml`. Its prerequisite, the lint fix `036e6b91` (`next build` lints), has been on this branch since the merge. Extend `.dockerignore` in the same change (`SEC-B10`). The next-auth and nodemailer bumps are separate follow-ups (`SEC-B8`, `SEC-B9`). The report also names two side findings for the same change: `docker-entrypoint.sh:13` downloads Prisma with `npx` on every container start, and `release.sh:144` would abort once `package-lock.json` is deleted. **The maintainer decides** (report § 9): (1) the bun version, 1.3.14 or 1.4.x, pinned in both places; (2) the Node base image, with `node:22.23.2-alpine` recommended, because Node 20 is end-of-life and `ci.yml`'s `node-version` moves with it (this also settles D30); (3) the verification path: a local amd64 build, `workflow_dispatch` (which pushes a branch image to GHCR), or a permanent `pull_request` trigger; (4) whether to delete or keep `package-lock.json`; (5) whether to do the next-auth and nodemailer bumps now or as tracked follow-ups (nodemailer ≥10.0.2 is two majors away). Close `INF-B1` only after a green Docker Publish run on `main`. | |
| D11 | **ROADMAP § 8.5 Phase 3 is still TODO** (`docs/ROADMAP.md:2638-2641`): dev-server auto-restart, `retries: 1` (`playwright.config.ts:32` still reads `process.env.CI ? 2 : 0`), and **E2E as a merge gate in CI** — re-flagged by `docs/handoff-2026-09-02-e2e-closeout.md:323-327` ("Playwright never runs unattended") and the 2026-09-06 handoff. The section header (`:2614-2616`, "68/68 … Phase 1+2 DONE") is stale. Not in NOT-PLANNED or Deferred Sprint Work. | |
| D12 | **ROADMAP § 8.0 "Discovery: Self-Contained Module E2E Coverage (offen)"** (`docs/ROADMAP.md:2511-2517`) — the second discovery entry the header counts; cited as open by `e2e/helpers/cleanup-fixture.ts:39`. Related to D2: both ask what a Module may contribute from its own directory. | |
| D13 | Twelve `open question`s were added to specs since 2026-09-01. Three bear on product behaviour: resuming an automation is not gated on its module being active (`specs/module-lifecycle.allium:1120`); the "create or select" upsert overwrites the stored label for ActivityType and JobTitle but not for Tag (`specs/shared-entities.allium:502`); `UpdatePreferences` / `ResetToDefaults` are dangling `provides` in the file SPEC-B3 fixed (`specs/notification-dispatch.allium:896`). The other nine are in `specs/e2e-test-infrastructure.allium` and `specs/scheduler-coordination.allium:1017`. **2026-09-29:** at `294e13c8`, 137 lines in `specs/` begin with `open question` (`git grep -h -c '^open question' -- specs`). By the sweep's count, 117 of them are in no tracker. See the last row of § 8. | probe count of added lines; the three verified |

### 2b. Decisions added 2026-09-29 (from the sweep)

Each row names the sweep ID it came from; § 8 maps back. "Inherited" marks evidence the sweep's
probes checked and this pass did not re-read.

| # | Decision | Evidence (at `294e13c8`) | Owner | From |
|---|---|---|---|---|
| D14 | **The retention erasure code was never security-reviewed.** Two automatic reviews ended without a verdict. The review of `72f4138f` ended empty; that commit added `src/lib/crm/anonymize-person.ts`, `src/lib/crm/retention-policy.ts`, the write path in `src/actions/privacy.actions.ts` and the unattended cross-user erasure in `src/lib/scheduler/crm-cron.ts`. The review of `5c49bb43`, the anonymise cascade, also ended without a verdict. No later review prompt names `anonymize-person.ts` or `privacy.actions.ts`. Decide whether to commission a security review (for example `/security-review` or `comprehensive-review:security-auditor`) before the path becomes live with an `auto_created` writer. | `git show --stat 72f4138f` (17 files); review verdicts: sweep evidence, probe H § 0b | maintainer → agent | H-unrev |
| D15 | **Two deferred full reviews never ran.** (1) In session `904bbf57`, the maintainer deferred `/comprehensive-review:full-review` plus a blind-spot pass for `7b331b34..22d2238d` ("No comprehensive-review for now"). The only later full review, `/home/pascal/projekte/jobsync/.full-review/00-scope.md`, covers `81ad0940..d3242c86` instead. (2) The 2026-08-25 sibling work (W-H1 spec flip and the § 8.3 fixes, now merged) had none either. Decide whether to run them now or record them as waived. **Added 2026-09-29 (late):** `docs/handoff-2026-08-19.md`, imported by `377428d4`, records deferral (1) at `:65-66`. At `:63-64` it also records a waiver that is already decided: the maintainer waived the ui-design consult for `ActivityTimeline.tsx` in the `IT-B2` fix (`99a9ff87`, inside the range above), judging it "a text/i18n bugfix, not a redesign". That handoff is the only other record of the waiver. D18 is a different case: it concerns another component, and no waiver is recorded for it. | (1) sweep evidence, probe H, rows H9-20 (inherited); (2) `docs/handoff-2026-08-24-orphan-prune.md:392-398` | maintainer | H9-20 |
| D16 | **`application-documents.allium` builds a salutation on a `gender` field that exists nowhere else.** The field `gender` does not exist in `crm.allium`, `prisma/schema.prisma` or `person.model.ts`. The maintainer asked for "/allium fix application-documents gender stub"; it was never executed. Decide whether `Person` gains the field, with its GDPR weight, or whether the feature derives formality without it. **Do not resolve this by deleting the stub field**: the feature depends on it. Then apply the decision via `allium:tend`. Benign until ROADMAP 4.2 starts. | `specs/application-documents.allium:68`, `:115`, `:403`, `:541`; `docs/TASKLIST-2026-08-26.md:161-179`; `docs/handoff-2026-08-30-retention.md:381` (TODO-5) | needs-decision | A65 |
| D17 | **Converted-referral dead end.** `converted` is terminal. A referral whose Job was deleted shows "The job application it created has since been deleted" and has no route back: `commitReferralToApply` and `reviveReferral` are both refused by the transition table. Decide whether the state is recoverable or terminal by design, and say so in the UI either way. | `src/models/insideTrack.model.ts:82`; `src/actions/referral.actions.ts:269-270`, `:295`; `docs/handoff-2026-08-30-retention.md:360-367` (§ 4.4, TODO-6) | needs-decision | A53 |
| D18 | **The converted-referral banner shipped without the ui-design consult `CLAUDE.md` requires.** Decide whether to run it retroactively (design-review, accessibility-audit), best together with D17, since D17 may change the banner. | `d7126096` (2026-08-21; `ReferralWorkspaceClient.tsx`, `insideTrack.ts`); no consult recorded in BUGS, the register or the commit | maintainer → agent | A7 |
| D19 | **Drift inventory: keep or fold into ADR-041.** De facto kept as a dated, superseded snapshot. The maintainer's question was never answered. ADR-041 cites the inventory, so the duplication is live. | `docs/w-h1-crm-gdpr-drift-inventory.md:1-12`; `docs/TASKLIST-2026-08-26.md:146-157`; `docs/handoff-2026-08-30-retention.md:384` (TODO-8) | maintainer | A49 |
| D20 | **Pre-expiry retention notice — not built.** It carries a trap: a `Notification` row lives 30 days, so a notice fired 14 days before erasure leaves a **named residue about 16 days after the erasure**. That can happen unless the notice uses the late-binding pattern with `personId` in `titleParams`. The reserved member `retention_expired` should become `retention_expiring`. See M11 for the related stale copy. | `src/lib/events/event-types.ts:272-286`; ADR-042:340-354; `docs/handoff-2026-08-30-retention.md:383` (TODO-7) | needs-decision | A73 |
| D21 | **No E2E test for the retention settings.** `CLAUDE.md` wants at least one per feature. The gap exists because the VM could not take a Playwright pass at that time, not because it was judged unnecessary. The component half is `UT-B2`. | `git grep -il retention -- e2e` finds nothing; ADR-042:395-401; TODO-9 | agent (gate: E2E run by the orchestrator) | A77 |
| D22 | **`rebaseCrmRetention` is a read-then-write loop inside the settings save.** Accepted in ADR-042, bounded by `CRM_CONFIG.maxPersonsPerUser` and cheap today. The trigger to revisit is an auto-creation writer that produces thousands of rows per user; it should then become a background job. Recorded here so the trigger has an owner. | `src/actions/privacy.actions.ts:176`; ADR-042:329-336 | maintainer (trigger) | A78 (= B11) |
| D23 | **User settings are invisible to Allium.** Two live behavioural gates are stated only in `@guidance`: the sweep is skipped when `crm_retention_enabled` is false, and the period is a per-user 180/365/730/1095. The same holds for `cooling_off_days`. Decide: model `UserSettings` as an entity that rules may read, or declare user configuration out of scope once, centrally. | `specs/crm.allium:1965`; ADR-042:382-393; TODO-4 | needs-decision | A79 |
| D24 | **`MergePersons` retention deadline.** The winner of a merge could inherit `max(winner, loser)` of the two deadlines, but not "now + period": that would extend retention through de-duplication. Decide, then state it as an `ensures` on the rule. Latent: no `auto_created` writer yet. | `specs/crm.allium:1961`; ADR-042:378-380 | needs-decision | B10 |
| D25 | **ADR-042's decision 1 rests on two legal characterisations that nobody assessed:** Recital 26 and the Art. 5(2) framing. The ADR agent said it did not assess them independently; the ADR states them as settled. Decide whether they need a qualified review or a caveat in the ADR. | ADR-042:102-107 | maintainer | B29 |
| D26 | **The committed, real-shape E2E API key is accepted in ADR-046 but has no tracker row.** ADR-046 makes "test-only" depend on where the seed runs. `SEC-B5` in `docs/BUGS.md` is the path it does not weigh. Decide whether the acceptance stands once `SEC-B5` is fixed, or whether the fixture changes. | ADR-046:62-71; `e2e/helpers/api-key-fixture.ts:36-37`; `SEC-B5` | maintainer | H-S4 |
| D27 | **"Check the automation happy path — it seems not chained correctly."** This is the maintainer's standing reminder from 2026-08-17, parked with "don't start unless I say". It exists only in an out-of-repo memory file and was never investigated. Decide when to start it. | `~/.claude/projects/-home-pascal/memory/project_automation_happy_path_chaining.md` (exists, 2026-08-17) | maintainer | H9-22 |
| D28 | **Module-author documentation.** The maintainer asked for "document all this for the Module-SDK so module authors have it easier". It was delivered only as forward references: the SDK developer-doc bullet in ROADMAP § 8.7, a `CONVENTIONS` paragraph and the `cleanup-fixture.ts` scope header. No module-author document exists, because the SDK is a future ROADMAP item. Decide whether that deferral is the intended answer. | `docs/ROADMAP.md:2826-2832`; `e2e/CONVENTIONS.md:191-193`; `e2e/helpers/cleanup-fixture.ts:29-46` | maintainer | G-13-31 |
| D29 | **Playwright bump versus chromium skew.** `@playwright/test` is `^1.49.1` and 1.57.0 is installed. That version pins chromium 1200, which cannot be installed on ubuntu26.04, so every run falls back to the cached 1234 with a warning. Every E2E number since is measured on 1234 (`E2E-B10`, closed "as far as it can be"). Options, per the migration note: (a) bump `@playwright/test`, which touches CI and needs its own verification pass; (b) keep the fallback; (c) point at a system Chrome. | `package.json:94`; `scripts/test-e2e.sh:89-112`; `~/elysium-jobsync-migration.md` § 5.4 | needs-decision | B24 |
| D30 | **✅ Settled 2026-09-29 by `5735d22f` + `4df39b43`:** bun 1.4.0 and node 22.23.2 are pinned identically in `Dockerfile`, `.github/workflows/ci.yml` and `mise.toml`, each with a keep-equal comment. History below. **CI runtime drift.** CI runs bun `1.3` and node `20`; locally, bun is 1.4.0 and node v22.23.2 (checked 2026-09-29). "Green locally" and "green in CI" therefore run different runtimes. Decide whether to pin CI to the local versions or the reverse. | `.github/workflows/ci.yml:61`, `:65`; `~/elysium-jobsync-migration.md` § 5.6 | needs-decision | B25 |
| D31 | **No suite-level count of `test.skip`.** A skipped test is invisible in a pass/fail count. The wrapper counts no skips; its only "SKIPPED" lines are the residue gate's. Decide whether to add a skip threshold. | `scripts/test-e2e.sh:742-748` (residue lines only); inherited | needs-decision | F-05-11 |
| D32 | **The allium diagnostic baseline is not pinned in CI.** CI installs allium and runs the reference checkers, but no step runs `allium check` or compares its warning and info counts to a baseline. A CLI upgrade can therefore widen the gap silently, which is how SPEC-B1 surfaced. The warning gate discussed on 2026-08-26 is gameable (`docs/gdpr-data-rights-stub-fix.md` § 6). | `.github/workflows/ci.yml:38-57`, `:106-107` | needs-decision | A88 |
| D33 | **Six W-H1 tombstones are not compressed.** ADR-041 § 7 allows each `-- NOTE —` tombstone in `crm-gdpr.allium` to shrink to a one-line pointer. The ADR now holds the durable copy. Nothing has been done. If the answer is yes, do it via `allium:tend`. | `git show HEAD:specs/crm-gdpr.allium \| grep -c -- "-- NOTE —"` = 6; ADR-041:154-176 | maintainer → agent | A89 |
| D34 | **The suggested `-- OWNER:` stub lint was never built.** It was proposed as the cheap guard against stubs drifting from their owner. Decide whether to build it or drop it. | `docs/gdpr-data-rights-stub-fix.md` § 6 (`:337`), § 10 (`:433`) | needs-decision | A90 |
| D35 | **SQLite foreign-key enforcement (`PRAGMA foreign_keys`) has never been confirmed.** Several specs rely on "protected by FK" (see `SPEC-B6`). Decide whether to confirm it with a test. | no tracker or spec hit; inherited | maintainer → agent | F-08-13 |
| D36 | **No ADR index.** `CLAUDE.md` names ten ADRs in passing (015–019, 029, 030, 042–044, checked at `294e13c8`); 033, 037, 040, 041, 045 and 046 appear in no index and in no `CLAUDE.md` section. The handoff deliberately did not create one. Decide: generate it from the directory, or rely on `ls docs/adr/`. | `docs/handoff-2026-08-30-retention.md:388` (TODO-14); `docs/adr/` has no index file | maintainer | TODO-14 |
| D37 | **`scripts/sessions/` and the `session/s5a-*` branches.** `scripts/sessions/` holds April-era prompts and `run-session.sh`. No code, script or config references them; only April-era design documents, the retention handoff and the understand-anything graph mention them (`git grep`, 2026-09-29). The directory was last touched in `fa6197ea` (2026-04-05). Two local branches remain, neither on `origin` nor with an upstream: `session/s5a-resume-verification` (tip `5f3f99b1`, resource guards for those scripts) and `session/s5a-ui-gaps-webhook` (tip `547c33c4`). Deleting a directory or a branch is the maintainer's call. | `docs/handoff-2026-08-30-retention.md:390` (TODO-13); `git branch --list '*s5a*'` | maintainer | A84 |
| D38 | **`jobsync-dashboard.service` and an uncommitted edit in the helpers repo.** The unit is `linked` and `inactive` (`systemctl --user is-enabled`, 2026-09-29). It is not enabled, as two records claim (M26). The script it starts still puts a NixOS path on `PATH` (`~/projekte/helpers/bin/jobsync-dashboard.sh:42`), and on the previous host the unit crash-looped with `Cannot find package 'vite'`. `~/projekte/helpers` also holds an uncommitted edit to the unit file itself, `systemd/user/jobsync-dashboard.service`, that removes its NixOS paths. The edit dates from 2026-08-31; its owner is unknown. Decide: remove the unit or make `vite` resolvable, and commit or discard the foreign edit. Not repo state. | `git -C ~/projekte/helpers status --porcelain` → ` M systemd/user/jobsync-dashboard.service`; `~/elysium-jobsync-migration.md` § 5.1 | maintainer | B27b |
| D39 | **`FixtureOwnedTeardown`'s mechanism clause: fixture only, or "fixture or `afterEach`, never inline"?** The spec requires a fixture. The code meets the guarantee (runs on a failed test) with 5 fixture files and 9 `afterEach` files. ADR-045, ADR-046 and the residue gate's own advice (`scripts/check-e2e-residue.sh:329-332`) already treat `afterEach` as acceptable. The pass recommends narrowing the clause; the alternative is to keep it and record the 9 files as deferred divergence. The chosen wording goes into M44. | weed pass § Q1, *Proposed resolution for Q1*; `specs/e2e-test-infrastructure.allium:873-875`, `:909-912` | needs-decision | V3 weed |
| D40 | **Inline cleanup of intra-run-visible models: fix, or accept an arrange-phase reset?** `smtp-settings`, `settings-blacklist` and `company-crud` delete at the end of the test body, where a failed assertion skips the delete. Either add a fixture or `afterEach` teardown, or accept an idempotent arrange-phase reset plus uid-keyed rows and narrow the spec clause. | BUGS `E2E-B72`; weed pass § Q1, *Remaining E2E-B37 shape* | needs-decision | V3 weed |
| D41 | **Deletion proof for the teardown deleters: tend the invariant, or add toast waits?** `DeletionProofSurvivesTheModalAndCitesTheServer` demands a rendered success message. Four teardown deleters prove deletion by the row disappearing. Every container involved reloads only on server success, so the invariant's premise is false for them. Option (a): tend the invariant to accept a success-gated reload, and pin the nine containers with component tests ("a refused delete keeps the row"). This is the pass's recommendation. Option (b): add `expectToast` waits to the four deleters. The row's own citation is off: the proof is at `admin-reference-cleanup.ts:194-203`, not `:188-198`. | BUGS `SPEC-B5`; weed pass § Q2, *Which side is wrong* | needs-decision | V3 weed, F-04-20 |
| D42 | **`OneSpecPerAggregate`: keep it with an explicit exception list, or drop it?** The spec lists 11 aggregates with one multi-file exception. HEAD has 28 spec files: Job spans 4, staging 3 and contact 2, and about 10 files map to no aggregate. The answer decides how M44 rewrites `DomainAggregate`. | weed pass § 5.6 | needs-decision | V3 weed |
| D43 | **Is editing or deleting a note about a consent-withdrawn contact new processing (GDPR Art. 7(3))?** (`GDPR-B3`). `createCrmNote` refuses a consent-blocked target (`src/actions/crmNote.actions.ts:69-70`); `updateCrmNote` (`:125`) and `deleteCrmNote` (`:156`) do not. The spec records it only as an open question (`specs/crm.allium:1957`). Decide, then enforce or document the exemption. Criterion: most flexible and long-lasting BUT completely GDPR compliant. Owner: maintainer. | `docs/BUGS.md` `GDPR-B3`; issue draft 23 | maintainer | lead 2026-09-29 (`6e028faa`) |
| D44 | **Degradation rule 3: wire it or remove it** (`MOD-B2`). `handleCircuitBreakerTrip` (`src/lib/connector/degradation.ts:339`) has no caller in `src/`, so "pause after 3 circuit-breaker opens" never fires, while `specs/module-lifecycle.allium` and `CLAUDE.md` describe it. Either call it where the Cockatiel breaker opens, or drop the rule from spec and docs. Owner: maintainer. | `docs/BUGS.md` `MOD-B2`; issue draft 24 | maintainer | lead 2026-09-29 (`6e028faa`) |
| D45 | **Document story before ROADMAP 2.8, 2.20 and 4.2.** The F.7 reference lists three open questions that no spec, register row or BACKLOG entry tracked until now. **(Q1)** Is an `ApplicationFile` / `Attachment` (4.2) edited in place, or only regenerated? Record it as an `open question` in `specs/application-documents.allium` via `allium:tend`, because that spec holds the `draft → generated → edited → final` lifecycle. **(Q2)** Does the 2.8 file explorer show files synced from Paperless-ngx (1.6), or only local `{DATA_DIR}` files? **(Q3)** Does the Spotlight palette offer document actions (open, generate, share) before 4.2 ships, or does the document tier wait for 4.2? Q2 and Q3 belong in the scope of the future `spotlight.allium`. F.7 treats storage as settled by 1.6 (Paperless-ngx) and advises against reopening it. | `docs/design/2026-08-05-f7-open-threads-reference.md` § 2, "Still genuinely open after this"; `specs/application-documents.allium:596-606` (six open questions, none of these three); before this row, `git grep -i paperless` over `specs/`, this register and `docs/BACKLOG.md` found only `specs/cv-document.allium:790`; no `spotlight*.allium` exists (all at `43c50304`) | maintainer | siblings assessment 2026-09-29 (F.7) |

---

## 3. Unblocked — mechanical, no decision needed

| # | Item | Where |
|---|---|---|
| M1 | **`CLAUDE.md` has drifted from the E2E code**, and it is the one file every agent reads first. `CLAUDE.md:975` lists a `login` export from `e2e/helpers/index.ts` that `ec823595` removed (no such export exists). § E2E Test Infrastructure (`:968`) mentions none of ADR-046, `deleteJobViaApi`, `testWithCleanup`, `activity-fixture`, `cleanup-fixture` or `api-key-fixture`, although ADR-046's plan listed that update as required collateral. `:1077` describes cleanup only as "in one test body", without the `afterEach` / fixture nets ADR-045 and ADR-046 rely on. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | `CLAUDE.md` |
| M2 | The understand-anything graph is 317 commits behind (`fca5b10f` vs `efcd2570`) and contains two false edges: `.understand-anything/knowledge-graph.json:16888` and `:16937` say `country-select.tsx` and `currency-select.tsx` are "built on BaseCombobox"; neither imports it. Regenerate or move aside. **2026-09-29:** 340 commits behind at `294e13c8` (session-start staleness check). | `bash scripts/understand-staleness-check.sh` |
| M3 | `CHANGELOG.md:429` claims "Public API search case-insensitive (`mode: 'insensitive'` on SQLite)" as a shipped fix. E2E-B48 found that exact query shape returned 500 on SQLite on every call. Correct in place, as `:491` was. | `docs/BUGS.md` E2E-B48 row |
| M4 | `docs/knip-connector-facades.md:3` still reads "Status: decision brief. Nothing has been changed." Both files it discusses were deleted on 2026-09-13. Related trap worth recording in the knip docs: `e4fe2a23` ("delete three unused UI primitives") deleted **13** files, including both facades; `9c81dd2a` ("delete two unused registry facades") deleted none — it added the orchestrator guard and edited `CLAUDE.md`, a test and `register-all.ts`. Both are pushed and cannot be reworded; `git log --diff-filter=D` on a facade file points at a commit titled "UI primitives". | `git show --stat e4fe2a23 9c81dd2a` |
| M5 | `e2e/crud/keyboard-ux.spec.ts:133-135` says all three reference deletes refuse on "WorkExperience or Education" and cites `jobtitle.actions.ts:120-131`. Only `deleteJobLocationById` guards on both; `deleteJobTitleById` and `deleteCompanyById` guard on WorkExperience only, and the job-title guard runs at `:124-134`. This was parked as "bundle with whatever is decided for this file" (`docs/handoff-2026-09-14-post-job-teardown-migration.md` § 3.3); the decision was to leave the file on `afterEach`, so the bundle will never come. One-comment fix. | |
| M6 | **Correction of a claim made on 2026-09-28:** `docs/BACKLOG.md:241` is **not** a phantom citation. Its revisit trigger names "the BaseCombobox consolidation (§G) introducing server-side company search". The false claim came from a search that was *meant* to be case-insensitive and silently was not: the `grep` shell function had failed (see D4 (F)), so the fallback was `awk 'BEGIN{IGNORECASE=1} /combobox/'` — and `awk` here is `mawk` 1.3.4, which ignores the gawk-only `IGNORECASE` without a warning (1 hit; `tolower($0) ~` gives 7). Line 241 had been read minutes earlier, through `awk '… {printf "L%03d>%.140s\n", NR, $0}'`: the `%.140s` cut every line at 140 characters, and the row's trigger clause sits after that point, so the visible part was only about `companyLabel`. *(Corrected the same evening: an earlier version of this entry said that read "was cut off after line 239". That was an artefact of the transcript extraction used to diagnose it, which capped each result at 900 characters — the original result contains line 241.)* It was corrected in issue #2 on 2026-09-28; it survives uncorrected in the immutable session-handoff record named above. `docs/knip-unused-ui-primitives.md:309-311` needs no change. | `awk 'tolower($0) ~ /combobox/' docs/BACKLOG.md` |
| M7 | No test pins Radix's injection of `type="button"` / `aria-expanded` (`@radix-ui/react-popover` 1.1.15, `dist/index.mjs:89,91,94`). If it stopped, three triggers inside real `<form onSubmit>` would become submit buttons silently. Pin the dependency behaviour, not a call site. | `docs/knip-unused-ui-primitives.md` § 5.5 |
| M8 | A fact-only header note on `specs/base-combobox.allium`: which file implements the rules today (`src/components/ComboBox.tsx`) and that `base-combobox.tsx` implements only the shell. The fact is unblocked; any SDK / connector framing waits for D2. Must go through `allium:tend`. | |
| M9 | `docs/BUGS.md` small drift: header says "Updated 2026-09-13" but the file changed on 2026-09-14 (`c027690c`, `518ddd98`); `:39-40` says "the three remaining open items are the two …"; `PRE-1` (`:1357`) still reads "Open — investigate in S3", is not among the header's 2 open (`FL-1`, `FL-2`, `:1135-1136`), and its two tests (`__tests__/ActivityForm.spec.tsx:154,183`) exist and pass in the green suite. Five section headings still announce open work their rows no longer hold: `:72` "(21 found, 20 fixed, 1 open)" and `:95` "Open — 1 item" (the block table says 21 / 21 / 0; `E2E-B11` was fixed 2026-09-08), `:119` "13 fixed, 7 open" (block table: 17 fixed, 0 open, 5 other), `:1584` and `:1620` "## Open — Reported 2026-03-25/26" (every row below them is marked fixed). `PRE-1` is the only row-level discrepancy; the header's "2 open" otherwise holds. **Re-anchored 2026-09-29 (`294e13c8`):** the "Updated" date is resolved; the header now reads "Updated 2026-09-29". The rest still holds, at new lines: "the three remaining open items" `:41`; `PRE-1` `:1638`; `FL-1`/`FL-2` `:1416-1417`; the stale headings `:353`, `:376`, `:400`, `:1865`, `:1901`. The header's open count is now 69 at the merge and 75 at `072f87d3`, and includes the sweep block, but `PRE-1` is still not counted in it. | |
| M10 | ADR-042's `crm-cron.ts` line citations have drifted by +2: it cites `:70`, `:74-78`, `:102`, `:125-130`; the code is at `:72`, `:76-80`, `:104`, `:127-132`. | `docs/adr/042-…` |
| M11 | `email.subject.retention_expired` reads "Contact archived — retention expired" in all four locales (`src/i18n/dictionaries/email.ts:38,68,98,128`), but the sweep now erases, and the event reason is reserved for a *pre*-expiry notice that is not emitted yet (`src/lib/events/event-types.ts:272`). Stale copy, no user sees it today. **2026-09-29:** see D20; the notice itself is a decision. | |
| M12 | `E2E-FIX-BRIEF.md:133` says WH-B2 is "recorded … in `docs/BUGS.md`"; this branch's `docs/BUGS.md` has no `WH-B` entry at all. **CLOSED 2026-09-29 by `294e13c8`:** the claim is true now, because the merge brought `WH-B2` to `docs/BUGS.md:197`. | |
| M13 | **`scripts/restart.sh:10,13,14` still runs machine-wide `pkill -f "next dev"` / `pkill -9 -f "next-server"`** — live code, not a comment. `CLAUDE.md:26` lists the script as a normal helper, and the same file says blind `pkill -f` is exactly what `devserver_stop` replaced because it takes sibling worktrees' servers with it. Route it through `devserver_stop`. **2026-09-29:** now `INF-B2` in `docs/BUGS.md`; work it there. Unchanged at `294e13c8`. | |
| M14 | `docs/architecture/public-api-v1.md:500-504` documents `DELETE /api/v1/jobs/:id` as **200 with a body**; the route returns 204 (`src/app/api/v1/jobs/[id]/route.ts:144`, `noContentResponse()`) and the tests pin 204 (`__tests__/api-v1-jobs.spec.ts:983,998`). A public-contract error. The sibling branch has the fix (D1a). **CLOSED 2026-09-29 by `294e13c8`** (`010c9008`, final wording `02e10d0f`). Recorded as `API-B1`, FIXED, in `docs/BUGS.md`. | |
| M15 | `docs/adr/041-…:130` says "`scripts/check-spec-refs.mjs` closes the remainder in CI"; that file does not exist on this branch (D1a). **CLOSED 2026-09-29 by `294e13c8`:** the sentence is true now. `scripts/check-spec-refs.mjs` exists, `package.json:19` runs it as `check:spec-qualified-refs`, and CI runs that script (`ci.yml:106-107`). | |
| M16 | `CLAUDE.md:1104` cites `src/i18n/lingui.ts:8` for the dynamic catalog import; it is at `:7`. Belongs with M1. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | |
| M17 | **The lint failure that keeps `main` red (V4)**: five empty `catch {}` blocks — `cdp-auto-complete.mjs:51`, `cdp-keep-alive.mjs:457`, `cdp-login-bundid.mjs:61,117,128` — against `no-empty` / `allowEmptyCatch: false` (`.eslintrc.json:4`). The fix exists on the sibling branch as `036e6b91` (D1a). **CLOSED on this branch 2026-09-29 by `294e13c8`** (`036e6b91`). Recorded as `WH-B1`, FIXED, in `docs/BUGS.md`. `main` stays red until this branch lands (V4). | CI log of run `32244003432` |
| M18 | `docs/BUGS.md:109` (MOD-B1) still says "Residual, NOT fixed: a throw after the persist …"; `0e0f5332` closed it the same evening (`src/lib/connector/degradation.ts:81-95`, "MOD-B1 residual, closed 2026-09-05"). **Re-anchored 2026-09-29:** still true; the row is now `docs/BUGS.md:390`. | |
| M19 | `src/lib/connector/degradation.ts:127` cites the invariant `EscalationIsNotAtomic`, which `specs/module-lifecycle.allium:795` says was replaced. | |
| M20 | `e2e/helpers/admin-reference-cleanup.ts:18-33` says `keyboard-ux` and `profile-crud` carry private copies of its two functions; `5b9c6f51` (2026-09-09) retired both, and neither spec defines one today. **Folded 2026-09-29 into M45** (weed pass § 5.9 found the same comment and four more). | |
| M21 | `specs/e2e-test-infrastructure.allium:883-886, 909-914` (`FixtureOwnedTeardown` guidance) counts "2 of 27" spec files and "25 have no afterEach"; today there are 28 spec files, 9 with a `test.afterEach` and 5 on a cleanup fixture. Input for V3; edit via `allium:tend`. **Folded 2026-09-29 into M44**, the weed pass's tend list, which re-measured the numbers (§ Q1). | |
| M22 | The admin tablist has no wrap (`src/components/ui/tabs.tsx:17`, `inline-flex h-10`; used at `AdminTabsContainer.tsx:49`) — the reflow half of R3 (`docs/handoff-2026-09-08-open-items.md:99`, WCAG SC 1.4.10) was never fixed and has no `docs/BUGS.md` row. UI-B6 fixed only the history/activation half. Static read, not checked in a browser; a fix goes through the ui-design / `/responsive-design` process CLAUDE.md prescribes. **2026-09-29:** now `UI-B27` in `docs/BUGS.md`; work it there. | |

### 3b. Items added 2026-09-29 (from the sweep)

The doc-drift rows fixed on 2026-09-29 (M1, M16, M38–M43) are closed by `8094ff67`; each row says so.
M44–M48 were added later the same day, from the V3 weed pass and the lead's review. M49–M52 and
D45 came from the assessment of the two remaining sibling branches (D1a), late on 2026-09-29.

| # | Item | Evidence (at `294e13c8`) | Owner | From |
|---|---|---|---|---|
| M23 | **LinguiJS: the `knip.ts` ignore plus the doc correction (issue #1, Parts 1–2), decided 2026-09-02; formerly D6.** Add `knip.ts` ignore entries for the staged LinguiJS block. Correct the sentence that says the migration is blocked on a condition, and the "no consumer change" promise. This is **not** gated on D2; only the separate `base-combobox.tsx` ignore entry is, although both edit the same `knip.ts` block. **Scope input for Part 3 (sweep G-28-01, inherited AST count):** 276 of 2,666 `t()` calls use template-literal (43) or non-literal (233) keys, e.g. `t(result.message)`, which a macro migration cannot convert statically. Neither issue #1 nor this register recorded that before. | `knip.ts:27-30`; `src/i18n/README.md:179`, `:189-190`; `CLAUDE.md:193` | agent | D6, G-28-01 |
| M24 | **`docs/BUGS.md:632` "Known, deliberately not fixed" lists items that are fixed.** The missing `import "server-only"` on `orphan-targets.ts` is fixed (`4086ec09`, now `src/lib/crm/orphan-targets.ts:67`). The unscoped `company.actions.ts` counts and the `mock.actions.ts` deletes without `userId` were scoped in `485c307e`. Only "the prune's count is not reported anywhere" still holds (§ 4). Add a dated correction. | `docs/BUGS.md:632`; `src/actions/company.actions.ts:351-367` | agent | A22 |
| M25 | **The CrmNote target-filter rule for API v1 exists only in a handoff.** Any new `/api/v1` route that reads `CrmNote` must apply a target filter explicitly, because v1 routes bypass the server-action guard. Move the rule into `CLAUDE.md` § Public API v1. Wait for the in-progress `CLAUDE.md` edits first. | `docs/handoff-2026-08-24-orphan-prune.md:271-288` | agent | A36 |
| M26 | **Two records say the dashboard unit is `enabled`; it was only ever `linked`.** `list-unit-files` printed "linked enabled", which is STATE `linked` and VENDOR PRESET `enabled`. On 2026-09-29, `is-enabled` prints `linked`. Add a dated correction to the repo handoff. The out-of-repo note is the maintainer's. The unit itself is D38. | `docs/handoff-2026-08-30-retention.md:387` (TODO-11); `~/elysium-jobsync-migration.md` § 5.1 (out of repo) | agent | B27c |
| M27 | **The `afterEach` rationale comments make a claim about `test.skip` that the sweep found false.** The comments explain the swap-before-await with how hooks behave under `test.skip`. The comment text is verified; the Playwright-semantics verdict is the sweep's and was not re-checked here. | `e2e/crud/webhook-settings.spec.ts:209-211`; `e2e/crud/settings-api-keys.spec.ts:191-193` | agent | C38 |
| M28 | **Two `docs/BUGS.md` rows describe machinery that is gone.** `E2E-B9` still says "Needs a decision" and describes the `E2E_ALLOW_DESTRUCTIVE` step 0b. That gate now survives only as a history comment (`scripts/e2e-db.sh:20`). `E2E-B26` still says `Company:E2E-B25` remains in `KNOWN_DEBT`; that entry was pruned on 2026-09-08 (`scripts/check-e2e-residue.sh:103-109`). | `docs/BUGS.md:391`, `:415` | agent | C77 |
| M29 | **`ts-jest` looks unused.** Jest runs through `next/jest` and SWC. `ts-node` is the load-bearing one (`CLAUDE.md` § Dead Code Detection). Remove `ts-jest` only after `scripts/test.sh` passes without it. The doc line is M42. | `package.json:120` | agent (gate: `test.sh` by the orchestrator) | D-OA2 |
| M30 | **The lesson "do not edit a shell script while it is executing" exists only in a handoff.** bash reads lazily by byte offset; an edit destroyed a 36-minute run. Put it where script authors look (`CLAUDE.md` § Using these scripts, or `scripts/` headers). | `docs/handoff-2026-09-06-e2e-elysium.md:130-131` | agent | D-OA7 |
| M31 | **`docs/handoff-2026-09-02-e2e-closeout.md` § 9b calls itself current and is stale.** `:350` says "Where this section and §9 disagree, this one is current". Its claims at `:423-436` are false now: SPEC-B1 uncommitted, SPEC-B2 open, E2E-B28 and E2E-B36 left at Open. `:363` says "four … deleted"; the sweep measured five. Add a dated superseded banner that points here. Do not rewrite the history. | `docs/handoff-2026-09-02-e2e-closeout.md:350`, `:363`, `:423-436` | agent | E4, F-04-21 |
| M32 | **An out-of-repo memory file primes sessions with a false open item.** `project_allium_cv_document_trigger_errors.md` says cv-document has 3 errors, "open, unfixed". SPEC-B1 fixed them (`8eba83a8`). Its suggestion to "add `allium check` to CI" is D32. | `~/.claude/projects/-home-pascal/memory/project_allium_cv_document_trigger_errors.md:3` | maintainer (memory is out of repo) | E5 |
| M33 | **`E2E-FIX-NOTES.md` states its evidence falsely.** The heading at `:949` says "nothing failed twice", and `:957-958` say "Five distinct tests failed once each … No test failed twice". Its own table lists `webhook-settings:229` in run 1 (`:953`) **and** run 2 (`:954`). Add a dated correction. | `E2E-FIX-NOTES.md:949-958` | agent | P6 |
| M34 | **`degradation.ts:141` cites "line 548" for `AuthFailureEscalation`.** The rule is at `specs/module-lifecycle.allium:695`. Fix it together with M19. | `src/lib/connector/degradation.ts:141` | agent | F-04-08 |
| M35 | **Stale teardown comments about the `aria-label="Delete"` selector** (inherited). | `e2e/crud/kanban.spec.ts:209`; `e2e/crud/contact-company-link.spec.ts:81`; `e2e/crud/job-status-crud.spec.ts:190` | agent | F-08-20 |
| M36 | **`docs/knip-unused-ui-primitives.md:354` cites `docs/BUGS.md:1443` for WEED-1.** WEED-1 is now at `docs/BUGS.md:1737`. Cite by ID, not by line. | `docs/knip-unused-ui-primitives.md:354` | agent | G-14-29 |
| M37 | **Issue #2 says its content is mirrored in `docs/ROADMAP.md` § 8.7, but that entry is unpushed.** The ROADMAP entry (`55836921`, `efcd2570`, now `docs/ROADMAP.md:2835`) is not on `origin`. The branch is 29 commits ahead at the merge and 34 at `072f87d3`. The public issue points at text no reader can see. It resolves on the next push. | `git merge-base --is-ancestor 55836921 origin/fix/e2e-elysium` → false | maintainer (push) | G-27-07 |
| M38 | **`CLAUDE.md` misstates the Chromium setup.** `CLAUDE.md:1022` says "elsewhere leave it unset and Playwright uses its own download". That is false on this host; the fallback at `scripts/test-e2e.sh:89-148` exists because the install is refused. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | `CLAUDE.md:1022` at `294e13c8` | agent | summary-check |
| M39 | **Two docs state the wrong production-build memory cap.** `CLAUDE.md:1052` and `docs/e2e-run-modes.md:94` say `e2e-prod-build.sh` builds under a "7 G cgroup". `scripts/build-safe.sh:29` defaults to 12G. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | `CLAUDE.md:1052` at `294e13c8`; `docs/e2e-run-modes.md:94` | agent | G-13-08 |
| M40 | **`e2e/CONVENTIONS.md` describes a host this project no longer runs on.** `e2e/CONVENTIONS.md:379-380` states "8 GB RAM, no swap" and the NixOS chromium path as current. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | `e2e/CONVENTIONS.md:379-380` | agent | D-OA9 |
| M41 | **One sentence about the CPU load guard is imprecise.** `CLAUDE.md:75-76` says "usage cannot exceed the allowance". That is imprecise: it confuses the container-root cgroup with the shell's affinity. Keep the decision; fix the sentence. **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). | `CLAUDE.md:75-76` at `294e13c8` | agent | D-OA10 |
| M42 | **The architecture overview names the wrong Jest transformer.** `docs/architecture/overview.md:789` says "Jest 29 + ts-jest". **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). The dependency itself is M29. | `docs/architecture/overview.md:789` | agent | D-OA2 |
| M43 | **`CLAUDE.md` lists degradation rule 3 ("pause after 3 CB opens") as live.** `handleCircuitBreakerTrip` has no caller in `src/` (`MOD-B2`). **Closed 2026-09-29 by `8094ff67`** (verified by the lead against the file). Whether to wire the rule or remove it is the product decision in `MOD-B2`. | `CLAUDE.md:268`, `:601`, `:603` at `294e13c8`; `src/lib/connector/degradation.ts:339` | agent (doc) / needs-decision (MOD-B2) | F-05-14 |
| M44 | **Tend `specs/e2e-test-infrastructure.allium` per the weed report** (via `allium:tend`, never by hand). This absorbs M21. The spec bugs to fix: the stale measurements (§ Q1, step 1); the `deleteJobViaApi` wording, which should admit a checked HTTP status as a server signal (§ Q2, first bullet); Activity missing from `IntraRunVisibility` (§ Q1 addendum; C34's `WebPushSubscription` is the same kind of gap); the open questions at `:1796` (answered: move it to the ANSWERED block), `:1800` (stale premise) and `:1794` (close or keep, § Q4); `GlobalSetup` (§ 5.2); `DiscardRunDatabase` reason 3 and the unmodelled end-of-run stop (§ 5.3); the `known_debt` list (§ 5.4); `FixtureKind` (§ 5.5); the actors (§ 5.7); and the stale citations inside the deletion-proof invariant (§ 5.8). The parts that depend on D39, D41 and D42 wait for those decisions. | weed pass § 7 (JSON, `spec-bug` entries) | agent | V3 weed, M21 |
| M45 | **Code comments that contradict the spec or the code** (weed pass § 5.9). This absorbs M20. `scripts/check-e2e-residue.sh:6-8` says the only implementations are two detectors that only `console.warn`. `scripts/check-e2e-residue.sh:161-163` and `e2e/crud/job-crud.spec.ts:644-645` still put the Job delete in an `afterEach`; it has been in the `testWithCleanup` fixture since ADR-046. `e2e/helpers/admin-reference-cleanup.ts:18-33` mentions private copies that no longer exist. `:329-332` of the same script recommends `afterEach`; resolve it with D39. | weed pass § 5.9 | agent | V3 weed, M20 |
| M46 | **ADR-045 still states the inference that E2E-B37 falsified.** `WebhookEndpoint`, `PublicApiKey`, `SmtpConfig` and `CompanyBlacklist` "end at zero, because those specs already own their rows" (`:153-158`), and `:166` repeats "25 of 27". Add a dated line to § Neutral that points at `E2E-B37`, as was done for ADR-046. | `docs/adr/045-e2e-owns-nothing-that-outlives-the-run.md:153-158`, `:166`; weed pass § 5.10 | agent | V3 weed |
| M47 | **✅ Closed 2026-09-29:** private vulnerability reporting enabled by the maintainer (API reports `enabled: true`; 0 reports), and `bash scripts/sync-labels.sh --apply` created the 22 labels. The 35 sweep issues are #3–#37 (`#23`, D10, closed as decided). **The GitHub files added on 2026-09-29 do nothing until the branch reaches `main`.** `3da76c83` added `.github/ISSUE_TEMPLATE/*` (bug, decision, work package, config), `.github/pull_request_template.md`, `.github/labels.yml`, `SECURITY.md` and `scripts/sync-labels.sh`. GitHub reads them from the default branch, which is `main`. Before that merge (D1): **(1)** enable private vulnerability reporting; `gh api repos/rorar/jobsync/private-vulnerability-reporting` returned `{"enabled":false}` on 2026-09-29. **(2)** Run `bash scripts/sync-labels.sh --apply` (the script is a dry run by default). | `git show --stat 3da76c83`; `scripts/sync-labels.sh:4-10` | maintainer | lead 2026-09-29 |
| M48 | **`CLAUDE.md` § i18n says to validate with `bun run /tmp/test-dictionaries.ts`, a file that does not exist.** It is neither in `/tmp` nor tracked (checked 2026-09-29). The dictionary check is `__tests__/dictionaries.spec.ts`: key consistency across the four locales, no empty values, dot notation and per-namespace checks. It runs in `scripts/test.sh`. | `CLAUDE.md:181` at `688df386`; `__tests__/dictionaries.spec.ts:139`, `:154` | agent | lead 2026-09-29 |
| M49 | **`devenv.nix` runs four commands that the guard hook refuses.** `dev.exec` and `processes.next-dev.exec` run `bun run dev`, `build.exec` runs `bun run build`, `test.exec` runs `npx jest $@`, and the pre-commit hook runs `bunx tsc --noEmit`. Route each one through its wrapper: `./scripts/dev.sh`, `bash scripts/build-safe.sh`, `bash scripts/test.sh` and `bash scripts/typecheck-safe.sh`. `CLAUDE.md:9` still calls devenv "recommended for standard NixOS". The new `mise.toml` describes itself as the replacement for `devenv.nix` on hosts without Nix, so reword that line when `CLAUDE.md` is next edited. | `devenv.nix:68-70`, `:89`, `:96`; `scripts/guard-heavy-commands.sh:67-74`, `:97-118`; `mise.toml:1-2`; `CLAUDE.md:9` (all at `4df39b43`) | agent | siblings assessment 2026-09-29 |
| M50 | **`docs/inside-track-implementation-debt.md:177-179` still calls quick-capture provenance an open question.** It says the contact side "stays gated" on the question at `specs/crm.allium:1416-1433`. That question was decided on 2026-08-17: `quick_capture` became a `DataSource` value (`specs/crm.allium:1933`, ADR-039), and those spec lines now hold other rules. Only the contact quick-create UI is still unbuilt: `ContactPicker.tsx` has no `onCreate`. Add a dated correction. | `docs/inside-track-implementation-debt.md:177-179`; `specs/crm.allium:1933`; `docs/adr/039-cross-context-timeline-projection-and-quick-capture-provenance.md:3-4` (all at `43c50304`) | agent | siblings assessment 2026-09-29 |
| M51 | **`docs/next-session-prompt.md` is a stale session prompt with a generic name.** It prepares the session after 2026-05-14 (`:12`), was last changed in `4a34f19c` (2026-05-13), and tells readers to stop the server before `tsc` (`:7`, `:66`) and to run a bare `bun run build` (`:60`). Its link at `:78` works again since `377428d4` imported the IF-2 plan. Add a dated superseded banner that points here. Deleting the file is the maintainer's call. | `docs/next-session-prompt.md:7`, `:12`, `:60`, `:66`, `:78`; `git log -1 -- docs/next-session-prompt.md` (at `43c50304`) | agent | siblings assessment 2026-09-29 |
| M52 | **`src/lib/env-sync.ts` writes `.env` lines that mise's dotenv parser rejects.** `:55` joins `ALLOWED_DEV_ORIGINS` with `", "`, and `:107` writes `KEY=value` unquoted. Next.js reads such lines. mise stopped with "failed to parse dotenv file" on the main checkout's `.env`; the siblings assessment observed this, and it was not re-run here. This matters only if a strict dotenv reader is added. The `mise.toml` of `4df39b43` deliberately leaves out `_.file = ".env"` for this reason. Either quote values that contain spaces, or leave the code as it is. Low. | `src/lib/env-sync.ts:55`, `:107`; `mise.toml:13-15` (at `4df39b43`) | agent | siblings assessment 2026-09-29 |

---

## 4. Housekeeping — low priority, or leave alone

- `.next-e2e/` is 1.4 GB (gitignored build output; delete when disk matters).
- `scripts/install-hooks.sh` is still unrun, deliberately: `core.hooksPath` is per-repository, so installing from a worktree arms the main checkout too (`docs/handoff-2026-09-08-open-items.md` § 2.3).
- Three stash entries from 2026-03/04 belong to other sessions. The stash is shared across worktrees — do not touch.
- `PublicApiKey.permissions` is unused; this is documented (`specs/api-key-management.allium:110`), not hidden.
- `TEST_USER_EMAIL` is duplicated as a literal (`e2e/global-setup.ts:12`, `prisma/seed-e2e.ts:41`); ADR-046's plan accepted this as the existing convention.
- `heap-snapshots/` (8.6 MB, gitignored) — measurement artefacts from E2E-B42, listed in `docs/handoff-2026-09-08-open-items.md:120`.
- Two experiments never run, both low value today: heap growth of the **production** server over a full run (`docs/handoff-2026-09-06-e2e-elysium.md:376-379`; `E2E_DEV_HEAP_SNAPSHOT` has no production equivalent), and running the suite against `node .next-e2e/standalone/server.js` (`docs/e2e-run-modes.md:123-128`).

**Added 2026-09-29 (from the sweep; sweep ID in brackets; "inherited" = the probe checked it, this
pass did not re-read):**

- [A13] The `CrmPruneDb` union (`src/lib/crm/orphan-targets.ts:72`) forces 8 `as never` casts in
  `__tests__/crm-orphan-prune.spec.ts` (`git grep -c` at `294e13c8`; the sweep counted 10 at
  `fbf44fc4`).
- [A83] Uncertain. The `archiver` default-export build warning (`src/app/api/users/export/route.ts:4`).
  Only a build can settle it.
- [B26] `scripts/env.sh` applies the NixOS Prisma engine pinning unconditionally. It was decided
  harmless (elysium § 5.5; `CLAUDE.md` glibc note). Leave it alone.
- [C34] The per-user cap on `WebPushSubscription` is not classified in `IntraRunVisibility`
  (`specs/e2e-test-infrastructure.allium:290`). If it is changed, use `allium:tend`.
- [C40] `src/components/settings/WebhookSettings.tsx` has no `data-testid`, so the E2E card
  locator stays class-anchored.
- [D-OA3] `@types/dompurify` (`package.json:100`) was in the 2026-09-02 knip output and was never
  triaged.
- [D-OA8] knip has no wrapper script and no guard-hook rule. The decision on its runtime was never
  recorded.
- [D-OA11] `AuthRateLimitResult` is exported and unused (`src/lib/auth/auth-rate-limit.ts:20`).
  `JEST_MAX_WORKERS` is parsed without a NaN guard (`jest.config.ts:112-113`).
- [P3] The PublicApiKey cap is the literal `10` (`src/actions/publicApiKey.actions.ts:38`), not a
  named constant as `MAX_ENDPOINTS_PER_USER` is.
- [G-13-26] Private E2E navigation helpers are duplicated. `navigateToStaging` appears 3 times
  (`staging-crud.spec.ts:8`, `staging-details-sheet.spec.ts:23`, `staging-layout-toggle.spec.ts:19`),
  which meets the `CONVENTIONS` three-file bar. `navigateToAutomations` appears 2 times
  (`automation-crud.spec.ts:9`, `automation-wizard-modules.spec.ts:9`), and so does
  `navigateToContacts` (`contact-crud.spec.ts:25`, `contact-company-link.spec.ts:27`).
- [H9-5] No `mockPersonQuickCapture` fixture in `src/lib/data/testFixtures.ts`, although each
  other `DataSource` value has one. Nit.
- [F-04-09] `health-monitor.ts` updates memory before the DB (`:192,228,240`). Nit; inherited.
- [F-04-14] The `purgeApiKey` catch (`e2e/crud/settings-api-keys.spec.ts:167-172`) has a prose
  reason but no `swallow-ok:` marker. Nit; inherited.
- [F-05-35] The teardown sweeps hardcoded activity names (`e2e/crud/activity-crud.spec.ts:242,331,358`).
  Nit; inherited.
- [F-08-17] A dead `x-chunk` attribute in four admin containers (`CompaniesContainer.tsx:69`, and
  `:56` in `JobLocationsContainer`, `JobSourcesContainer` and `JobTitlesContainer`). Nit; inherited.
- [F-09-10] Dead placeholder comments (`JobTitlesContainer.tsx:61`, `JobLocationsContainer.tsx:61`)
  and a stale cite (`e2e/helpers/admin-reference-cleanup.ts:58`). Nit; inherited.
- [F-08-19, F-08-25] Duplicated dialogs and flashes. There are two delete-note dialogs
  (`NotesSection.tsx`, `NotesCollapsibleSection.tsx`), and `TasksTable` has five duplicated
  dialogs. Staging and Tasks show a blank-then-append flash. `profile.loading` is a dead key.
  LOW; inherited.
- [F-06-08] `tools/next-heap/trace-floors.py` does not group by server lifetime. Inherited.
- [handoff-08-24 § 8.3] The CRM orphan-note prune's count is not reported anywhere. Low, because
  the erasure itself is audited (`docs/BUGS.md:632`).
- [lead 2026-09-29] `CONTRIBUTING.md` is still upstream's text. It says to add `Gsync/jobsync` as the upstream remote (`:58`), to `npm install` (`:62`, which the Docker research infers would hit the same ERESOLVE as `INF-B1`) and to take issues from upstream (`:84`). Upstream takes no PRs; this fork's workflow is in `CLAUDE.md` § Git Workflow. Rewrite it or mark it as upstream's.
- [TODO-10, elysium § 5.2] `NODE_COMPILE_CACHE` is **resolved only for shells that source
  `~/.bashrc`**. `~/.bashrc:76` exports it to `~/.cache/node-compile-cache`, which is on zfs,
  while `/tmp` is tmpfs. A process that does not source `.bashrc`, such as a systemd unit, still
  falls back to `/tmp`. Host configuration; the maintainer owns it.

---

## 5. Settled — do not reopen without new evidence

- The four `afterEach` ordering-trap specs (`activity-crud`, `task-crud`, `keyboard-ux`, `profile-crud`) stay on `afterEach`. Three named conditions would reopen it: `docs/handoff-2026-09-14-e2e-fixture-consolidation.md:234`.
- The Job teardown migration (ADR-046) is done and measured.
- `docs/handoff-2026-09-08-open-items.md` § 2.1 and § 2.2 are closed (T1, T2, T6 and T9 re-checked against the code on 2026-09-28).
- All 13 knip deletions are applied (`e4fe2a23`, plus `7b19a067` for `@radix-ui/react-avatar`); `src/components/ui/base-combobox.tsx` is kept pending D2.
- **Added 2026-09-29:** `feat/quick-capture-and-referral-events` is merged (`294e13c8`); D1a
  records how the conflicts were resolved.
- **Added 2026-09-29:** `WH-B3` (retention expiry archives but never erases) is closed on this
  branch by `72f4138f`. Its deliberate exception, and that exception's fail-open read path, are
  `GDPR-B2` / D8.
- **Added 2026-09-29:** two sweep leads turned out to be no finding. C45's truncated "disclosure"
  was a single-file `esbuild` syntax parse. E11, the `scripts-wave4` agent, left no transcript,
  and its three targets were closed by `64e2f52d`.

---

## 6. Not verified

- Whether `next lint` reaches the five `.mjs` files with empty `catch` blocks on this branch (the `main` CI log says it does there, V4). *Settled 2026-09-28:* a read-only `git merge-tree --write-tree fix/e2e-elysium feat/quick-capture-and-referral-events` auto-merges `ci.yml` and conflicts in exactly three files: `CLAUDE.md`, `docs/BUGS.md`, `package.json`. The sibling's `WH-B1` is the same five `catch` blocks as V4 / M17 here — one finding, which must not get a second ID on this branch. Whether the `WH-B2` flake still occurs cannot be settled without running the suite. **2026-09-29:** the merge happened, with the conflicts as predicted, and the lint fix is in the tree. The run result is the V4 placeholder.
- knip's actual unused-files output: issue #1 says 21 → 16 for the LinguiJS group, `CLAUDE.md:1106-1110` says six files. One is wrong; only a `bun knip` run tells which.
- The manual check ADR-046's plan asked for (break the seeded key, confirm the warnings distinguish 401 / 0 matches / 2+ matches / non-204) is not recorded anywhere.
- Whether `bun knip` currently reports `base-combobox.tsx` (not run since 2026-09-13).
- `UI-B1..UI-B17` were not re-checked item by item; the closure rests on `docs/BUGS.md`.
- The Sprint 2/4/5 "open follow-ups" bullet lists in `docs/BUGS.md` (`:486`, `:600`, `:752`, `:875`, `:923`) were not audited item by item. They belong to the pre-E2E block the file itself carries forward without a recount, and `CLAUDE.md` § Deferred Sprint Work is their index.
- **Added 2026-09-29:** the sweep's inherited rows ("inherited" in § 3b, § 4 and in `docs/BUGS.md`) were checked by a probe only. Before acting on one, re-read the cited lines.

---

## 7. Re-scan after the search-tool finding (2026-09-28)

When the `grep` function was found broken in the tmux session, every Bash call since 2026-09-15 that used the function or `awk IGNORECASE` was pulled from the session transcript: **13 calls**. All affected ones fall in one window, 2026-09-27 21:08–21:24 UTC, during the combobox discovery. The Grep and Glob tools were not used in that window. The discovery for this register used `command grep`, `git grep` and `tolower()` throughout and is not affected. What the window produced, re-checked:

| Claim from that window | Re-check | Result |
|---|---|---|
| `docs/BACKLOG.md` mentions combobox once | case-insensitive | **Wrong** — 7; see M6 |
| Vocabulary table in issue #2 (5 documents) | case-insensitive | One count changed (debt file connector 2 → 3, Communication Connector); conclusion holds |
| "The connector/module intent appears nowhere" | the repo-wide pass that had failed, run properly: 24 tracked files mentioning `base-combobox`, ±4-line window for seam vocabulary | **Holds** — only documents written after the discovery, a Welle-4 design note and spec-filename lists |
| `widget-registry.tsx:42,46-55`, `manifest.ts:112-115,125,155-159,164-166,171,188-189` | re-read with `awk` | **Hold** |

A case-insensitive re-run of this register's own scans for open markers in `docs/BUGS.md` and `docs/ROADMAP.md` added the five stale headings now listed under M9 and nothing else.

---

## 8. Sweep 2026-09-29 — destination index

The sweep's ID list is the table in `docs/sweep-2026-09-29.md` § 3, with 147 sweep IDs in 138 rows.
This section maps each of those rows to a concrete register ID or `docs/BUGS.md` ID, in the same
order. Where the sweep doc says "register (…, pending)", the pending ID is given here.

*Rebuilt 2026-09-29.* The first version of this section was keyed on the sweep's raw destination
list. That list truncated ten ID families to a prefix (`F-04`, `G-13`, `H9` and others), so it is
not used as the reconciliation base any more.

In three places the register's placement differs from the sweep doc's category: A84, B27b and
F-08-13. Each row's note says why. "inherited" means the probe checked the item and this pass did not
re-read it (see the rows in § 3b and § 4).

| Sweep ID | Now lives in | Note |
|---|---|---|
| A7 | D18 |  |
| A13 | § 4 housekeeping |  |
| A14 | BUGS `APP-B1` |  |
| A22 | M24 |  |
| A30 | spec open question | `specs/inside-track.allium:833-834` |
| A33 | spec open question | `specs/inside-track.allium:833-834` |
| A36 | M25 |  |
| A40 | spec open question | `specs/crm-gdpr.allium:985` |
| A44 | BUGS `GDPR-B3` | spec side: `specs/crm.allium:1957` |
| A45 | spec open question | `specs/crm.allium:1959` |
| A47 | spec open question | `specs/crm-gdpr.allium:987` |
| A49 | D19 |  |
| A52 | BUGS `UT-B7` |  |
| A53 | D17 |  |
| A55 | BUGS `UT-B4` |  |
| A60, B8 | spec open question | `specs/gdpr-data-rights.allium:528` |
| A61 | spec open question | `specs/gdpr-data-rights.allium:530` |
| A62 | spec open question | `specs/gdpr-data-rights.allium:532` |
| A63 | spec open question | `specs/gdpr-data-rights.allium:534` |
| A64, B9 | BUGS `SPEC-B8` |  |
| A65 | D16 |  |
| A67 | BUGS `GDPR-B1` | spec side: `specs/crm-gdpr.allium:995` |
| A73 | D20 | related: M11 |
| A77 | D21 | component half: BUGS `UT-B2` |
| A78, B11 | D22 |  |
| A79 | D23 |  |
| A80, B12 | BUGS `UI-B23` |  |
| A81 | BUGS `SPEC-B4` |  |
| A82 | BUGS `UT-B5` |  |
| A83 | § 4 housekeeping | uncertain; needs a build |
| A84 | D37 | the sweep doc says housekeeping; the register makes it a decision, because deleting a branch or directory is the maintainer's call |
| A88 | D32 |  |
| A89 | D33 |  |
| A90 | D34 |  |
| B1 | BUGS `E2E-B60` |  |
| B2 | BUGS `UI-B28` |  |
| B10 | D24 |  |
| B24 | D29 |  |
| B25 | D30 | settled together with D10 (2) |
| B27b | D38 | the sweep doc says housekeeping; the register makes it a decision, because committing or discarding a foreign edit is the maintainer's call |
| B27c | M26 |  |
| B29 | D25 |  |
| B35 | BUGS `E2E-B62` |  |
| B37 | BUGS `UI-B22` |  |
| B40 | BUGS `E2E-B59` |  |
| B41b | BUGS `INF-B4` |  |
| C34 | § 4 housekeeping | if tended, it goes with M44 |
| C37 | BUGS `E2E-B54` |  |
| C38 | M27 |  |
| C39, D-OA5 | BUGS `E2E-B58` |  |
| C40 | § 4 housekeeping |  |
| C45 | done — no finding | § 5 |
| C55 | BUGS `E2E-B69` | fixed in `5c42b3cf` |
| C77 | M28 |  |
| C78 | BUGS `E2E-B51` |  |
| D-OA1 | BUGS `SEC-B6` |  |
| D-OA2 | M29 (dependency), M42 (doc line) | M42 closed by `8094ff67` |
| D-OA3 | § 4 housekeeping |  |
| D-OA4 | BUGS `UT-B3` |  |
| D-OA6 | BUGS `INF-B3` |  |
| D-OA7 | M30 |  |
| D-OA8 | § 4 housekeeping |  |
| D-OA9 | M40 | closed by `8094ff67` |
| D-OA10 | M41 | closed by `8094ff67` |
| D-OA11 | § 4 housekeeping |  |
| E1, F-04-13 | BUGS `E2E-B50` |  |
| E2 | BUGS `E2E-B52` |  |
| E3 | BUGS `MOD-B3` |  |
| E4 | M31 |  |
| E5 | M32 |  |
| F-04-06 | BUGS `UI-B19` |  |
| F-04-08 | M34 |  |
| F-04-09 | § 4 housekeeping |  |
| F-04-10 | BUGS `UT-B9` |  |
| F-04-11 | BUGS `UT-B8` |  |
| F-04-14 | § 4 housekeeping |  |
| F-04-20 | BUGS `SPEC-B5` | the decision is D41 |
| F-04-21 | M31 |  |
| F-05-11 | D31 |  |
| F-05-14 | BUGS `MOD-B2` | doc side: M43 |
| F-05-18 | BUGS `E2E-B54` |  |
| F-05-19 | BUGS `E2E-B55` |  |
| F-05-20 | BUGS `W4-B2` |  |
| F-05-22 | BUGS `SPEC-B7` |  |
| F-05-23 | BUGS `SPEC-B9` |  |
| F-05-28 | BUGS `E2E-B61` |  |
| F-05-33 | BUGS `E2E-B56` |  |
| F-05-34 | BUGS `E2E-B57` |  |
| F-05-35 | § 4 housekeeping |  |
| F-06-06 | BUGS `E2E-B53` |  |
| F-06-07 | BUGS `E2E-B67` |  |
| F-06-08 | § 4 housekeeping |  |
| F-06-09 | BUGS `E2E-B66` |  |
| F-08-11 | BUGS `APP-B2` |  |
| F-08-12 | BUGS `SPEC-B6` |  |
| F-08-13 | D35 | the sweep doc says M; the register makes it a decision, because it is a choice whether to test FK enforcement at all |
| F-08-14 | BUGS `UI-B20` |  |
| F-08-15 | BUGS `APP-B3` |  |
| F-08-16 | BUGS `UI-B24` |  |
| F-08-17 | § 4 housekeeping |  |
| F-08-19, F-08-25 | § 4 housekeeping |  |
| F-08-20 | M35 |  |
| F-08-21, F-08-26 | BUGS `UI-B26` |  |
| F-08-22, F-08-23 | BUGS `UI-B21` |  |
| F-08-24 | BUGS `UI-B25` |  |
| F-08-28 | process lesson | its six items are BUGS `APP-B2`, `UI-B20`, `APP-B3`, `UI-B21`, `UI-B25`, `UI-B26` |
| F-09-08 | BUGS `INF-B5` |  |
| F-09-10 | § 4 housekeeping |  |
| G-13-08 | M39 | closed by `8094ff67` |
| G-13-26 | § 4 housekeeping |  |
| G-13-31 | D28 |  |
| G-14-05 | BUGS `E2E-B63` |  |
| G-14-06 | BUGS `E2E-B64` |  |
| G-14-07 | BUGS `E2E-B65` |  |
| G-14-29 | M36 |  |
| G-27-07 | M37 |  |
| G-28-01 | M23 | scope input for issue #1 Part 3; D6 became M23 |
| G-28-02 | D7 | added to the existing row |
| H-unrev | D14 |  |
| H9-3 | BUGS `SEC-B3` |  |
| H9-5 | § 4 housekeeping |  |
| H9-9 | BUGS `UI-B29` |  |
| H9-10 | BUGS `UT-B6` |  |
| H9-20 | D15 |  |
| H9-22 | D27 |  |
| H-S2 | done — `bcabca94` | BUGS `SEC-B1` |
| H-S3 | BUGS `SEC-B7` | the class is described there; no reproduction here |
| H-S4 | D26 |  |
| H-S4r | BUGS `SEC-B5` |  |
| H-S5 | BUGS `SEC-B4` |  |
| H-O2 | BUGS `API-B2` |  |
| H-O6 | BUGS `E2E-B68` |  |
| P3 | § 4 housekeeping |  |
| P6 | M33 |  |
| P28 | BUGS `UT-B1` |  |
| T25 | BUGS `GDPR-B4` | the policy stays in D9 |
| T36 | BUGS `UT-B2` |  |
| TODO-14 | D36 |  |

**Keys in the sweep's raw destination list that are not finding IDs** (`docs/sweep-2026-09-29.md`
§ 3, second table). None of them is an open item.

| Key | What it is |
|---|---|
| F-04, F-05, F-06, F-08, F-09, G-13, G-14, G-27, G-28, H9 | Truncated family keys. Every member has its own row above. |
| D6, D7, D9 | Register item IDs, not sweep IDs. D6 became M23 (with G-28-01), D7 received G-28-02, and D9 received `GDPR-B4` and the three-PII-carrier fact. |
| B5 | Occurs only inside `IT-B5` (never filed; the finding is `UT-B6`). As a probe-B row it is the sibling-branch lint, now `WH-B1`, fixed by the merge. |
| B18 | Occurs only inside `E2E-B18`. As a probe-B row it is a `docs/BUGS.md` header off by one, superseded by M9. |
| B26 | Occurs only inside `E2E-B26`. As a probe-B row it is the `scripts/env.sh` Prisma pinning, decided harmless; see § 4. |
| E11 | An agent with no report and no transcript; its targets were closed by `64e2f52d` (§ 5). |

**Items without a sweep ID**, from the sweep doc's third table and from the lead on 2026-09-29:

| Item | Now lives in |
|---|---|
| `CLAUDE.md:1022` Chromium sentence | M38 (closed by `8094ff67`) |
| The out-of-repo session summary | the header ("What it supersedes"). The sweep doc says "four factual errors"; the check file it cites shows three wrong, three stale and one misleading claim. |
| The dashboard unit is `linked`, not enabled | D38; the false premise in the handoff is M26 |
| 137 spec `open question`s, 117 in no tracker | the specs; the full list is in the sweep evidence, out of repo. D13 lists the three that bear on product behaviour. |
| August open questions `specs/crm.allium:1955` and `specs/crm-gdpr.allium:991` | the specs |
| `specs/crm-gdpr.allium:995` | BUGS `GDPR-B1` |
| `specs/crm-gdpr.allium:997`, `:1001` | D9 |
| "D6 correction" (Parts 1–2 of issue #1 decided on 2026-09-02) | M23 |
| The maintainer's decision criterion | the register header |
| V3 weed pass (20 divergences) | V3; the destinations are listed there |
| `CLAUDE.md` § i18n points at a missing validation script | M48 |
| `CONTRIBUTING.md` is upstream's text | § 4 |
| GitHub templates, labels and security policy are dormant until `main` | M47 |
| Docker research (D10, `INF-B1`, `SEC-B8..B10`) | D10 |
| Sibling-branch assessment, late 2026-09-29: F.7's three document questions | D45 |
| Same assessment: `devenv.nix` runs commands the guard hook refuses | M49 |
| Same assessment: the debt doc still calls quick-capture provenance open | M50 |
| Same assessment: `docs/next-session-prompt.md` is stale | M51 |
| Same assessment: `env-sync.ts` writes lines mise's dotenv parser rejects | M52 |

---

## 9. Supersession map for the documents added on 2026-09-29

Each open item of the newly superseded documents, and where it lives now. Checked at `294e13c8`.

**`docs/handoff-2026-08-30-retention.md` § 4 and § 5 (TODO-1..14):**

| Item | Now |
|---|---|
| § 4.1 / TODO-2 timeline retention | D9 |
| § 4.2 / TODO-3 Art. 15 completeness | BUGS `GDPR-B1` |
| § 4.3 WH-B3 | closed by `72f4138f` + `669104a0` (§ 5 of this register) |
| § 4.4 / TODO-6 converted-referral dead end | D17 |
| TODO-1 ADR for the retention change | done — ADR-042 |
| TODO-4 settings invisible to Allium | D23 |
| TODO-5 `gender` stub | D16 |
| TODO-7 pre-expiry notice | D20 |
| TODO-8 drift inventory | D19 |
| TODO-9 retention E2E | D21 |
| TODO-10 `NODE_COMPILE_CACHE` | § 4 (resolved for `.bashrc` shells only) |
| TODO-11 dashboard unit | D38; the false "enabled" premise is M26 |
| TODO-12 WH-B2 flake | BUGS `WH-B2` |
| TODO-13 `scripts/sessions/` and the s5a branch | D37 |
| TODO-14 ADR index | D36 |

**`docs/TASKLIST-2026-08-26.md`:**

| Task | Now |
|---|---|
| 0. keep the `wh1-final` agent | moot (history) |
| 1. push `50d9aaac` | done — on `origin/spec/w-h1-crm-gdpr-dependency-flip` and an ancestor of HEAD |
| 2. `gdpr-data-rights.allium` `Person` stub | done — `dcedc8b6` |
| 3. timeline retention | D9 |
| 4. Art. 15 completeness | BUGS `GDPR-B1` |
| 5. WH-B3 | done — `72f4138f` + `669104a0` |
| 6. converted-referral dead end | D17 |
| 7. "loud vs silent" framing | done — `aba8aa31`, merged by `294e13c8` |
| 8. drift inventory | D19 |
| 9. `gender` stub | D16 |
| 10. `CLAUDE.md` resource facts | done — `aba8aa31` on the sibling, and `19cc6fe3` here removed the host figures (the merge kept this branch's side). Residual wrong figures: M39, M40, M41. |
| 11. WH-B2 | BUGS `WH-B2` |

**`docs/handoff-2026-08-24-orphan-prune.md` § 8 and § 11:**

| Item | Now |
|---|---|
| § 8.1 W-H1 | done — § 11 of that handoff; merged |
| § 8.2 `/understand` graph refresh | M2 |
| § 8.3 `server-only`, `sqlite3` CI step, DELETE contract, converted-banner test | done — `4086ec09`, `010c9008`, `02e10d0f`, merged by `294e13c8` (the E2E was replaced by a database-tier test) |
| § 8.3 prune count not reported | § 4 |
| § 8.4 CrmNote API target filter | M25 |
| § 11 "Not done": no full review | D15 |

**`docs/handoff-2026-09-02-e2e-closeout.md` § 9b** — "waiting on a quiet full run", items 1–7:

| Item | Now |
|---|---|
| 1. residue gate end to end | done — `[residue] OK` recorded in `docs/BUGS.md:413,436` |
| 2. `Task` / `Activity` zero at suite scale | done — `E2E-B24` narrowed and enforced |
| 3. `Company` zero in profile-crud | done — `KNOWN_DEBT` pruned 2026-09-08 (`scripts/check-e2e-residue.sh:103-109`); the stale `E2E-B26` text is M28 |
| 4. re-windowed console assertions | done — `E2E-B28` FIXED |
| 5. `E2E-B39` | done — FIXED `3fe7412a` |
| 6. `E2E-B35` | done — closed 2026-09-07 |
| 7. `KNOWN_DEBT` `Task` / `Activity` | done — pruned 2026-09-08 |
| the section's claim to be current | M31 |

**`~/elysium-jobsync-migration.md` § 5 (out of repo):**

| Item | Now |
|---|---|
| 5.1 dashboard unit | D38 (its "enabled" is M26) |
| 5.2 `NODE_COMPILE_CACHE` | § 4 |
| 5.3 `mise.toml` untracked | D1a — committed as `cf12dca8` on `spec/gdpr-data-rights-person-stub`, not in HEAD. **Outcome 2026-09-29 (late):** `cf12dca8` was not taken. `4df39b43` added a new pinned `mise.toml` instead: `bun = "1.4.0"`, `node = "22.23.2"`, no python and no `_.file`. The same commit names `mise.toml` in the "keep equal" comments of `Dockerfile` and `ci.yml`, and pins `ci.yml`'s `node-version` to `"22.23.2"`. |
| 5.4 Playwright vs Ubuntu 26 | D29 |
| 5.5 `scripts/env.sh` Prisma pinning | § 4 (decided harmless) |
| 5.6 bun / node drift vs CI | D30 |

**`docs/handoff-2026-08-19.md`** (imported by `377428d4`, late 2026-09-29; checked at `43c50304`):

| Item | Now |
|---|---|
| § 1 shipped work (`7b331b34`, `99a9ff87`) | done — both are ancestors of HEAD |
| § 3 ui-design consult waived for `ActivityTimeline.tsx` | decided (waived); recorded in D15 |
| § 3 no full review and no blind-spot pass | D15 (1) |
| § 3 parked `qc-reviewer` never delivered | moot (history) |
| § 4 decisions B-3 / B-4 | done — `IT-B1` (`5c49bb43`) and `IT-B3` (`71da1c52`), both fixed 2026-08-20 in `docs/BUGS.md` |
| § 4 decision B-5, `quick_capture` retention posture | D9 (`specs/crm.allium:1953`) |
| § 4 weed batch (three findings) | done — each marked fixed 2026-08-19 in `docs/weed-findings-2026-08-17.md:87`, `:112`, `:162` |
| § 4 § G contact-side quick-create UI | still unbuilt: `docs/inside-track-implementation-debt.md` § G and ROADMAP 2.20; the provenance gate it names is decided (M50) |
| § 4 automation happy-path reminder | D27 |
