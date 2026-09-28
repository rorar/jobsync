# Open items register — as of 2026-09-28

**State this describes:** branch `fix/e2e-elysium` at `efcd2570`, working tree clean, 6 commits ahead of
`origin/fix/e2e-elysium` (`cb136619` … `efcd2570`, unpushed). Every statement below is true *as of that
commit and this date*; none is a standing claim. Each item was re-checked against the file, the git
history or GitHub on 2026-09-28 — not copied from an earlier document. Where something could not be
checked, it says so.

**Why this file exists.** Open work had spread over nine `docs/handoff-*.md` files, three knip
investigations, two ROADMAP discovery entries, two GitHub issues and an out-of-repo session handoff.
This register collects what is still open into one list, ordered by who has to act.

**What it supersedes** (for open items only — the history in those files stays valid):
`docs/handoff-2026-09-14-e2e-fixture-consolidation.md` § 4 · `docs/handoff-2026-09-14-post-job-teardown-migration.md` § 3 ·
`docs/handoff-2026-09-13-session-resume.md` §§ 3–5 · `docs/handoff-2026-09-08-open-items.md` § 2
(§ 2.1 and § 2.2 are closed; only § 2.3 housekeeping survives, below) · the "Pending" list of the
session-handoff record `2026-09-28-combobox-seam-and-doc-integrity.md`, which also contains one false
claim corrected in § 3, item M6.

**What it does not supersede:** `CLAUDE.md` § Deferred Sprint Work, `docs/NOT-PLANNED.md`, `docs/BUGS.md`.

---

## 1. Verification gate — blocks any merge to `main`

| # | Item | Evidence |
|---|---|---|
| V1 | **The full Playwright suite has not run since the Job teardown migration.** The last full run on record is 112/112 on 2026-09-08 (`scripts/check-e2e-residue.sh:128`). Since then only targeted runs: the 5 migrated Job specs (28 passed, `docs/handoff-2026-09-14-post-job-teardown-migration.md:8`), 7 specs (41 passed) on 2026-09-14, then `activity-crud` alone. `test-results/.last-run.json` ("passed", 2026-09-14 12:07) is that single-spec run, not a suite. | Production code changed since `d5497bdf` without a full run: `src/auth.config.ts` (E2E-B49 — the `authorized` callback every matched request passes through), `src/app/api/v1/jobs/route.ts` (E2E-B48), `src/lib/connector/data-enrichment/orchestrator.ts` (new chain guard), 13 deleted files (`e4fe2a23`), `prisma/seed-e2e.ts` (+48). |
| V2 | Jest and typecheck were last run on 2026-09-14: `scripts/test.sh` 320 suites, 5910 passed + 2 todo; `scripts/typecheck-safe.sh` `EXIT=0`. Since then only a comment (`cb136619`) and a `describe` title (`3736c4e2`) changed in code, so the result still describes the code — but re-run before a merge. | `git diff --stat 468db168..HEAD` |
| V3 | The `allium:weed` pass that ADR-046's plan named as "the actual spec-vs-code check" after the migration was never run. | Not recorded in either 2026-09-14 handoff or in ADR-046. |

Gate to run, each judged by its own `EXIT=` line, never through a pipe: `./scripts/test-e2e.sh` (full),
`bash scripts/test.sh`, `bash scripts/typecheck-safe.sh`.

---

## 2. Maintainer decisions

| # | Decision | Context |
|---|---|---|
| D1 | **How and when `fix/e2e-elysium` reaches `main`.** It is 274 commits ahead of `main` (= `origin/main`), 0 behind, merge-base `968ac32a` (2026-08-19). It carries two product bug fixes (E2E-B48, E2E-B49), ADR-045, ADR-046, the fixture consolidation and 13 dead-code deletions. The branch name no longer describes its content. | `git rev-list --count main..HEAD` |
| D1a | Three sibling branches hold commits this branch lacks (`git cherry` shows all as genuinely absent, not patch-equivalent). **Whether each is superseded or still needed has not been established.** | see below |
| | `feat/quick-capture-and-referral-events` — 11 commits. Includes a **second, independently built** spec reference checker (`scripts/check-spec-refs.mjs`, `cb614f9c`, 2026-08-25, for qualified cross-spec references) while this branch has `scripts/check-spec-refs.sh` + `tools/allium-refcheck/` (`458d0da0`, 2026-09-06, titled "the reference-integrity gate this project had no tool for"). `ci.yml` diverges both ways: this branch has the notification-writer, allium and spec-refs steps; that branch has the database test tier (`010c9008`). `docs/BUGS.md` diverges too: that branch has `WH-B` rows this one lacks (five mentions), including `WH-B3` (retention gap, "latent, not live"), and a header of 610 / 607 / 4 open against this branch's 684 / 676 / 2. | `git diff fix/e2e-elysium feat/quick-capture-and-referral-events -- .github/workflows/ci.yml` |
| | `spec/gdpr-data-rights-person-stub` — 2 commits (`mise.toml`; six plan/analysis docs never added). The main checkout `/home/pascal/projekte/jobsync` sits on this branch, idle since 2026-08-31. | `git worktree list` |
| | `docs-spotlight-research` — 3 docs-only commits (Spotlight 2.20 research, F.7 notes). | |
| D2 | **Combobox architecture — Axis 1 first** (shell component / headless hook / descriptor contract). Full option space, evidence and the DDD reading in GitHub issue [#2](https://github.com/rorar/jobsync/issues/2) and `docs/ROADMAP.md:2835` (`Discovery: Combobox-Konsolidierung …`). This replaces the older "Option A / Option B" framing in `docs/knip-unused-ui-primitives.md` § 5.5. | Blocks M8's framing (not its fact) and the knip ignore entry in D6. |
| D3 | **What `TriggerAriaExpanded` means** (`specs/ui-combobox-keyboard.allium:362`): "declares `type="button"` in JSX" or "renders it". Three of fourteen triggers (`WizardShell.tsx:269`, `InterviewForm.tsx:270`, `:450`) only render it because Radix injects it. Decide in an `allium:weed` pass. | `docs/knip-unused-ui-primitives.md` § 5.5, "Three separate facts" |
| D4 | **Which prevention measures to build** (from the 2026-09-28 discussion): (A) a doc-citation integrity check · (B) graph staleness hook that acts instead of warns · (C) warnings at the point of confusion · (D) deferral entries must name what they unblock · (E) sub-agent briefing rules · (F) document the search-tool traps — **with the mechanism measured on 2026-09-28, which differs from how the 2026-09-27/28 records describe it.** The `grep` shell function runs `( exec -a ugrep "$CLAUDE_CODE_EXECPATH" … )` and falls back to `/home/pascal/.local/bin/claude` when that path is not executable. Since 2026-09-22 that fallback is a 177-byte `sh` wrapper (the session-handoff launcher), and `exec -a` does not survive a script, so the Claude CLI receives the flags: every call fails with `error: unknown option '-G'`, and `-v` prints the Claude version. It is not about clustered flags — `grep -n -i` failed too. It hit the tmux session because that process ran 2.1.270, whose binary the updater had removed from `~/.local/share/claude/versions/`; with `CLAUDE_CODE_EXECPATH` pointing at an existing version, `-ci`, `-n -i` and `-v` all work (verified). Any long-running session whose version gets pruned will hit it again. Separately, even a working `grep` passes `--ignore-files`: `grep -rl BUILD_ID .next-e2e` finds 28 files where `command grep` finds 33. And `awk` is `mawk`: `IGNORECASE` is silently ignored — use `tolower($0) ~ /…/`. Two facts bear on this: M1 below needs no new mechanism and should come first; and a reference checker already exists twice across branches (D1a), while neither checks `path:line` citations in Markdown. | |
| D5 | **CHANGELOG policy.** The newest section is `[2026-05-10]`; nothing since (Waves 1–5, the E2E work) is recorded. Revive or declare frozen. Two false shipped-fix claims were found in it this month: `CHANGELOG.md:491` (WEED-1, corrected 2026-09-14) and `CHANGELOG.md:429` (M3). | |
| D6 | **GitHub issue [#1](https://github.com/rorar/jobsync/issues/1)** (LinguiJS: knip ignore, three false doc claims, migration scope), open since 2026-09-02. None of its three parts is done — `knip.ts:27-30` still ignores only the EURES generated file. Part 1 edits the same `knip.ts` block as the `base-combobox.tsx` ignore (gated on D2), so the two could share a commit. | |
| D7 | **Public API v1 route-stack dedup** (UUID validation ×6, ownership check ×5, JSON parsing ×4, Zod formatting ×3+3 → `src/lib/api/helpers.ts`). Optional, deferred. | `docs/handoff-2026-09-14-e2e-fixture-consolidation.md:228` |

---

## 3. Unblocked — mechanical, no decision needed

| # | Item | Where |
|---|---|---|
| M1 | **`CLAUDE.md` has drifted from the E2E code**, and it is the one file every agent reads first. `CLAUDE.md:975` lists a `login` export from `e2e/helpers/index.ts` that `ec823595` removed (no such export exists). § E2E Test Infrastructure (`:968`) mentions none of ADR-046, `deleteJobViaApi`, `testWithCleanup`, `activity-fixture`, `cleanup-fixture` or `api-key-fixture`, although ADR-046's plan listed that update as required collateral. `:1077` describes cleanup only as "in one test body", without the `afterEach` / fixture nets ADR-045 and ADR-046 rely on. | `CLAUDE.md` |
| M2 | The understand-anything graph is 317 commits behind (`fca5b10f` vs `efcd2570`) and contains two false edges: `.understand-anything/knowledge-graph.json:16888` and `:16937` say `country-select.tsx` and `currency-select.tsx` are "built on BaseCombobox"; neither imports it. Regenerate or move aside. | `bash scripts/understand-staleness-check.sh` |
| M3 | `CHANGELOG.md:429` claims "Public API search case-insensitive (`mode: 'insensitive'` on SQLite)" as a shipped fix. E2E-B48 found that exact query shape returned 500 on SQLite on every call. Correct in place, as `:491` was. | `docs/BUGS.md` E2E-B48 row |
| M4 | `docs/knip-connector-facades.md:3` still reads "Status: decision brief. Nothing has been changed." Both files it discusses were deleted on 2026-09-13. Related trap worth recording in the knip docs: `e4fe2a23` ("delete three unused UI primitives") deleted **13** files, including both facades; `9c81dd2a` ("delete two unused registry facades") deleted none — it added the orchestrator guard and edited `CLAUDE.md`, a test and `register-all.ts`. Both are pushed and cannot be reworded; `git log --diff-filter=D` on a facade file points at a commit titled "UI primitives". | `git show --stat e4fe2a23 9c81dd2a` |
| M5 | `e2e/crud/keyboard-ux.spec.ts:133-135` says all three reference deletes refuse on "WorkExperience or Education" and cites `jobtitle.actions.ts:120-131`. Only `deleteJobLocationById` guards on both; `deleteJobTitleById` and `deleteCompanyById` guard on WorkExperience only, and the job-title guard runs at `:124-134`. This was parked as "bundle with whatever is decided for this file" (`docs/handoff-2026-09-14-post-job-teardown-migration.md` § 3.3); the decision was to leave the file on `afterEach`, so the bundle will never come. One-comment fix. | |
| M6 | **Correction of a claim made on 2026-09-28:** `docs/BACKLOG.md:241` is **not** a phantom citation. Its revisit trigger names "the BaseCombobox consolidation (§G) introducing server-side company search". The false claim came from a search that was *meant* to be case-insensitive and silently was not: the `grep` shell function had failed (see D4 (F)), so the fallback was `awk 'BEGIN{IGNORECASE=1} /combobox/'` — and `awk` here is `mawk` 1.3.4, which ignores the gawk-only `IGNORECASE` without a warning (1 hit; `tolower($0) ~` gives 7). The line itself had been in view minutes earlier, in an `awk 'NR>=238 && NR<=245'` read whose output was cut off after line 239. It was corrected in issue #2 on 2026-09-28; it survives uncorrected in the immutable session-handoff record named above. `docs/knip-unused-ui-primitives.md:309-311` needs no change. | `awk 'tolower($0) ~ /combobox/' docs/BACKLOG.md` |
| M7 | No test pins Radix's injection of `type="button"` / `aria-expanded` (`@radix-ui/react-popover` 1.1.15, `dist/index.mjs:89,91,94`). If it stopped, three triggers inside real `<form onSubmit>` would become submit buttons silently. Pin the dependency behaviour, not a call site. | `docs/knip-unused-ui-primitives.md` § 5.5 |
| M8 | A fact-only header note on `specs/base-combobox.allium`: which file implements the rules today (`src/components/ComboBox.tsx`) and that `base-combobox.tsx` implements only the shell. The fact is unblocked; any SDK / connector framing waits for D2. Must go through `allium:tend`. | |
| M9 | `docs/BUGS.md` small drift: header says "Updated 2026-09-13" but the file changed on 2026-09-14 (`c027690c`, `518ddd98`); `:39-40` says "the three remaining open items are the two …"; `PRE-1` (`:1357`) still reads "Open — investigate in S3", is not among the header's 2 open (`FL-1`, `FL-2`, `:1135-1136`), and its two tests (`__tests__/ActivityForm.spec.tsx:154,183`) exist and pass in the green suite. Five section headings still announce open work their rows no longer hold: `:72` "(21 found, 20 fixed, 1 open)" and `:95` "Open — 1 item" (the block table says 21 / 21 / 0; `E2E-B11` was fixed 2026-09-08), `:119` "13 fixed, 7 open" (block table: 17 fixed, 0 open, 5 other), `:1584` and `:1620` "## Open — Reported 2026-03-25/26" (every row below them is marked fixed). `PRE-1` is the only row-level discrepancy; the header's "2 open" otherwise holds. | |

---

## 4. Housekeeping — low priority, or leave alone

- `.next-e2e/` is 1.4 GB (gitignored build output; delete when disk matters).
- `scripts/install-hooks.sh` is still unrun, deliberately: `core.hooksPath` is per-repository, so installing from a worktree arms the main checkout too (`docs/handoff-2026-09-08-open-items.md` § 2.3).
- Three stash entries from 2026-03/04 belong to other sessions. The stash is shared across worktrees — do not touch.
- `PublicApiKey.permissions` is unused; this is documented (`specs/api-key-management.allium:110`), not hidden.
- `TEST_USER_EMAIL` is duplicated as a literal (`e2e/global-setup.ts:12`, `prisma/seed-e2e.ts:41`); ADR-046's plan accepted this as the existing convention.

---

## 5. Settled — do not reopen without new evidence

- The four `afterEach` ordering-trap specs (`activity-crud`, `task-crud`, `keyboard-ux`, `profile-crud`) stay on `afterEach`. Three named conditions would reopen it: `docs/handoff-2026-09-14-e2e-fixture-consolidation.md:234`.
- The Job teardown migration (ADR-046) is done and measured.
- `docs/handoff-2026-09-08-open-items.md` § 2.1 and § 2.2 are closed (T1, T2, T6 and T9 re-checked against the code on 2026-09-28).
- All 13 knip deletions are applied (`e4fe2a23`, plus `7b19a067` for `@radix-ui/react-avatar`); `src/components/ui/base-combobox.tsx` is kept pending D2.

---

## 6. Not verified

- Whether the sibling-branch content in D1a is superseded or missing.
- The manual check ADR-046's plan asked for (break the seeded key, confirm the warnings distinguish 401 / 0 matches / 2+ matches / non-204) is not recorded anywhere.
- Whether `bun knip` currently reports `base-combobox.tsx` (not run since 2026-09-13).
- `UI-B1..UI-B17` were not re-checked item by item; the closure rests on `docs/BUGS.md`.
- The Sprint 2/4/5 "open follow-ups" bullet lists in `docs/BUGS.md` (`:486`, `:600`, `:752`, `:875`, `:923`) were not audited item by item. They belong to the pre-E2E block the file itself carries forward without a recount, and `CLAUDE.md` § Deferred Sprint Work is their index.

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
