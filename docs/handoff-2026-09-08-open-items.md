# Handoff — 2026-09-08, agent-swarm session on the open findings list

**Branch `fix/e2e-elysium`, worktree `~/projekte/jobsync-e2e`. HEAD `6e7b5cc4`, tree clean,
9 commits ahead of `origin/fix/e2e-elysium`, 0 behind. NOT PUSHED — Pascal pushes.**

Verify before trusting any SHA in this file: `git rev-parse HEAD && git status --porcelain`.

```
6e7b5cc4 docs(bugs): close E2E-B44, and file the three findings it turned up
5682c40a docs(spec): ActivityType, and the asymmetric cascade it is the only case of
69950151 test(e2e): sweep activity types, and seed the one two specs share
685cc407 fix(e2e): stamp the run database's provenance in milliseconds (E2E-B45)
a0faad5f feat(admin): give activity types the sixth reference tab, and a delete path
bcabca94 fix(security): scope two reference-delete guards to the requesting user (ADR-015)
5f2bf5a5 docs(bugs): close the open list, and split a product gap out of a test finding
3af92438 fix(e2e): gate the hydration oracle on the message shape, not on a flag
12c3f185 fix(e2e): the Trash2 selector that could never match, and the spec that owned nothing
```

Gates at hand-off, all on this tree: `scripts/typecheck-safe.sh` `EXIT=0`; `scripts/test.sh`
**316 suites / 5,838 passed / 2 todo** `EXIT=0`; `./scripts/test-e2e.sh` **113 passed in 8.7 min**,
`[residue] OK`, `EXIT=0`; `allium check specs/shared-entities.allium` 0 errors / 0 findings.

Tracker: **662 found / 654 fixed / 2 open / 4 closed as decided / 1 closed by premise /
1 corrected assumption** (`docs/BUGS.md`, header block table is the derivation).

---

## 1. What closed, and under what conditions it reopens

| id | disposition | reopens when |
|---|---|---|
| `E2E-B11` | Fixed | a PRODUCTION run reds on a hydration message — the dev-build prose is bucketed, `Minified React error #418` is not |
| `E2E-B22` | Closed as decided | a `deletePerson` path is ever added and the specs still do not use it |
| `E2E-B23` | Closed as decided | same, for `deleteReferral` |
| `E2E-B24` | Closed as decided | superseded in practice by `E2E-B44` — `ActivityType` now HAS a delete path; the row stays closed because its subject was the residue, not the product gap |
| `E2E-B36` | Fixed | a comment again explains behaviour by a deleted file |
| `E2E-B38` | Fixed | the residue gate reds on `Resume`/`Automation`/`JobTitle`/`Company`/`Location`/`JobSource` — they are ENFORCED now, not printed |
| `E2E-B42` | Closed as decided | the dev path (`E2E_PROD=0`) becomes load-bearing again |
| `E2E-B44` | Fixed | — |
| `E2E-B45` | Fixed | — |
| `SEC-B1`, `SEC-B2` | Fixed | — |

**Still open, and that is the whole open list: the two inherited "accepted risk" entries.**
They predate the E2E work and were never recounted — see the `Pre-E2E backlog — carried forward,
not recounted` row of the block table in `docs/BUGS.md`.

---

> **STATUS 2026-09-09.** Most of this section is now closed; the document is left as the
> snapshot it was rather than rewritten, so the reasoning that produced each item stays readable.
>
> - **§2.1 (the admin reference screen)** — closed. Recorded as `UI-B1`–`UI-B18` in `docs/BUGS.md`,
>   which supersedes the item list here.
> - **§2.2 T1–T7 and T9** — closed. Two premises here were stale by the time they were worked:
>   T5 said two specs carried private copies of the admin deleters, but `profile-crud` had already
>   been migrated in `45ba0653`, so only `keyboard-ux` remained; and T9's line number had drifted,
>   with the empty slot nested inside a second wrapper div, and the same dead slot present in two
>   further containers the item did not name.
> - **T8** stays open deliberately, for the reason it already gives.
> - **§2.3** — `bun knip` has now been run. It reports 21 unused files, 84 unused exports and 6
>   unused dependencies, but **none of the files this session added**, including
>   `e2e/helpers/console-oracle.ts`, which the note below suspected. All four of the false-positive
>   shapes `CLAUDE.md` § Dead Code Detection names are present in the output, so the list behaves
>   exactly as documented and must not be acted on by importer count. The rest is pre-existing.
>   `install-hooks.sh` is still deliberately not run.

## 2. Open items — not fixed, each with its citation

Nothing below is blocking. Every item was found by reading code this session and left alone
deliberately, either because it is out of the scope that was asked for or because it needs a
decision. **Each citation was verified against the file on 2026-09-08.** Re-verify line numbers
before acting: this file is prose and prose drifts.

### 2.1 The admin reference screen — five tabs carry defects the sixth deliberately does not

An accessibility review of the existing five ran before the sixth tab was written. It is the
source for D1–D8 and R1–R3 below. The new `ActivityTypesContainer`/`ActivityTypesTable` avoid
these; the five were left untouched, because fixing them is a separate pass and doing it in one
of six creates the inconsistency the review was trying to prevent.

| # | finding | where |
|---|---|---|
| **A1** | `setLoading(false)` sits INSIDE `if (data)`, so a rejected or empty fetch spins forever | `src/components/admin/JobSourcesContainer.tsx:32-37`, same shape in `JobTitlesContainer`, `CompaniesContainer`, `JobLocationsContainer`. `TagsContainer.tsx:28-37` has the `try/finally` that avoids it — copy that one |
| **A2** | Hardcoded English `<TableHead>` text; a screen reader announces English column names alongside every cell in DE/FR/ES | `src/components/admin/CompaniesTable.tsx:82,84`, `JobTitlesTable.tsx:72,74`, `JobLocationsTable.tsx:73-75`. Also `CompaniesContainer.tsx:68` (`<CardTitle>Companies</CardTitle>`) and `:94`. `JobSourcesTable` and `TagsTable` do it correctly |
| **A3** | The confirm dialog's accessible NAME is half-untranslated: `pageTitle` is interpolated into a translated sentence and every call site passes an English noun | `src/components/DeleteAlertDialog.tsx:15,25,39`; call sites `JobSourcesTable.tsx:111` `"source"`, `CompaniesTable.tsx:136` `"company"`, `JobTitlesTable.tsx:107` `"title"`, `JobLocationsTable.tsx:108` `"location"`, `TagsTable.tsx:112` `"skill"`. The new table sidesteps it by always passing an explicit translated `title` |
| **D1** | Focus lands on `document.body` after a delete: the dialog restores focus to the row's trash button, then the reload removes that row | all five tables, e.g. `JobSourcesTable.tsx:52-69`. By code inspection, not browser-verified |
| **D2** | Load More disables itself under the user's focus, and is removed from the DOM by the very click that fetches the last page | `JobSourcesContainer.tsx:84-96` |
| **D3** | Nothing announces loading or appended rows (SC 4.1.3): no `role="status"`, no `aria-live`, no accessible name | `src/components/Loading.tsx:3-9` — verified: zero matches for `role=` or `aria-live`. **One central fix covers all six tabs; highest value per line in the review** |
| **D4** | No empty state — an empty reference list renders a blank card | `JobSourcesContainer.tsx:63`, `CompaniesContainer.tsx:83`. The new `ActivityTypesContainer` has one; the five do not |
| **D7** | The blocked-branch dialog's only control says "Cancel" on a purely informational dialog | `src/components/DeleteAlertDialog.tsx:46-47` |
| **D8** | Page heading is an `<h3>` with no `h1`/`h2` above it, and the text is hardcoded English | `src/app/dashboard/admin/page.tsx:6-7` — verified |
| **R1** | Every delete button's accessible name is the bare string "Delete"; Tab traversal yields "Delete, button" N times with nothing to tell them apart | all six tables. **Worth doing — but only across all six in one commit**, otherwise the new tab diverges from the five |
| **R2** | Dark-mode `text-destructive` computes ≈ **2.86:1** against `--background`, under the 3:1 SC 1.4.11 needs for a graphical control indicator; the destructive confirm button is ≈ 3.60:1 in light mode against 4.5:1 | `src/app/globals.css:49` vs `:35`. Computed by hand from the tokens, NOT measured in a browser. Belongs to the dark-mode WCAG sweep already deferred in `CLAUDE.md` § Design-gated items, as a data point rather than a new finding |
| **R3** | Tabs are uncontrolled (`defaultValue`) while every change does `router.push`, and Radix Tabs activate on arrow. So arrowing across the tablist writes one history entry per key, and Back changes the URL without changing the rendered tab. `TabsList` is `inline-flex h-10` with no wrapping | `src/components/admin/AdminTabsContainer.tsx:30,34`; `src/components/ui/tabs.tsx:17`. **A sixth tab makes both worse** — six translated labels ("Aktivitätstypen") on a narrow viewport is an SC 1.4.10 reflow risk. Worth a `/responsive-design` pass on the tablist specifically |

### 2.2 Test-infrastructure debt

| # | finding | where |
|---|---|---|
| **T1** | **`admin` is absent from `namespaceDictionaries`**, so the per-namespace cross-locale parity / no-empty-value / prefix tests never run against it. A key added to `en` and forgotten in `fr` ships silently and falls back to the raw key string at runtime. **One line**, and it would cover the 12 keys this session added | `__tests__/dictionaries.spec.ts:31` (the map), `:152` (the loop that consumes it). Small risk it surfaces a pre-existing failure among the ~67 admin keys — that is information, not a reason to skip it |
| **T2** | Two uses of the deprecated `locator.type()`. Verified: **two**, not three — `:358` is `msg.type()` and is unrelated | `e2e/crud/keyboard-ux.spec.ts:598,997`. Replacement is `fill()` or `pressSequentially()`; both sites pass a `delay`, which is why they were written this way |
| **T3** | `login()` is a dead export — no spec imports it; the two smoke specs and `global-setup.ts` each inline their own | `e2e/helpers/index.ts:26`. Verified: zero importers |
| **T4** | `ensureEnglishLocale` is duplicated in **16** spec files. Verified by counting definitions | `e2e/crud/*.spec.ts` |
| **T5** | `keyboard-ux.spec.ts` and `profile-crud.spec.ts` carry private, already-diverged copies of the admin-cleanup functions | named at `e2e/helpers/admin-reference-cleanup.ts:16-33`. If a new tab is ever swept from either file, use the shared helper rather than a seventh copy |
| **T6** | `profile-crud.spec.ts` uses FIXED literals (`"Software Developer"`, `"Senior Engineer"`, `"MIT"`, `"Boston"`) where the comments claimed uid-suffixed names. The comments are corrected; **the hazard is not**: `deleteAdminReferenceRow` matches a case-insensitive SUBSTRING, so under `E2E_WORKERS>1` one worker's teardown can delete a row another worker's form is using. `"MIT"` is the shortest and most exposed. The suite is single-worker by default, which is why this has never been seen | `e2e/crud/profile-crud.spec.ts`, see the corrected note above `locationText` in "add education and edit school name" |
| **T7** | `automation-crud.spec.ts` is the only spec whose `afterEach` can navigate and delete yet never calls `test.setTimeout(testInfo.timeout + N)`. Unmeasured; flagged because the new instrumentation makes its teardown slower on a failing path | `e2e/crud/automation-crud.spec.ts`; compare `job-crud`, `profile-crud`, `job-detail-panels`, `kanban`, and the new `enrichment` hook |
| **T8** | `"Job:E2E-B38"` remains in `KNOWN_DEBT` **deliberately**. Its mechanism is unchanged: the Job is deleted inline in test bodies, so it leaks only when a body throws first, and a green run cannot distinguish "fixed" from "not exercised". Enforcing it would add a second red line to every genuine failure | `scripts/check-e2e-residue.sh:144` |
| **T9** | Dead empty action slot: `<div className="ml-auto flex items-center gap-2">` with no children. The new container dropped it rather than copying it | `src/components/admin/JobSourcesContainer.tsx:57` |

### 2.3 Housekeeping and process

- **Not pushed.** 9 commits. `git push` is the whole action.
- **`scripts/install-hooks.sh` has still not been run**, deliberately: `core.hooksPath` is
  per-repository and setting it from a worktree affects the main checkout too.
- **`.next-e2e/`** is ~1.3 GB and **`heap-snapshots/agg*.json`** ~8.7 MB. Both are gitignored
  build/measurement artefacts; delete when disk matters.
- **The understand-anything graph is stale** — it was 240 commits behind at session start and is
  further behind now. `bash scripts/understand-staleness-check.sh` prints the verdict. Per
  `CLAUDE.md` § Feeding Rule, do not feed it to a subagent without attaching that verdict.
- **`bun knip` has not been run** since the new files landed. `src/components/admin/ActivityTypesContainer.tsx`
  and `ActivityTypesTable.tsx` are reached only through `AdminTabsContainer`, so they should be
  visible to it — but `e2e/helpers/console-oracle.ts` has exactly one importer plus one Jest
  importer and may look orphaned. Read `CLAUDE.md` § Dead Code Detection before deleting anything
  knip names.

### 2.4 Larger deferrals, unchanged by this session

`CLAUDE.md` § Deferred Sprint Work is authoritative and was not touched. It holds H-P-09
(observability), M-A-09 (undoStore split-brain), `getStagedVacancies` cursor pagination, the
`email.ts` multi-prefix split, the design-gated items, and the latent items. `docs/NOT-PLANNED.md`
holds what was evaluated and rejected. **Read both before proposing anything as "new".**

---

## 3. Things this session established that are easy to get wrong later

**Production is the default E2E mode.** `./scripts/test-e2e.sh` builds and runs `next start`;
`E2E_PROD=0` opts into the dev server. Full reference: `docs/e2e-run-modes.md`.

**The console oracle is gated on the MESSAGE SHAPE, not on `E2E_PROD`.** React emits the
descriptive hydration prose only from a development build; production emits
`Minified React error #418`. So the dev-only rule is dev-only by construction, which matters
because `scripts/test-e2e.sh:333` warns that under `E2E_REUSE_SERVER=1` the variable "describes
this run's INTENT and not its server". Classifier and its reasoning:
`e2e/helpers/console-oracle.ts`; regression test `__tests__/console-oracle.spec.ts`.
**The cost, stated in `docs/BUGS.md` E2E-B11:** under `E2E_PROD=0` an APP-caused hydration
mismatch is now warned rather than failed. Under the default it still fails.

**`lucide-react` class names do not hyphenate before a digit.** `Trash2` renders
`lucide-trash2`, not `lucide-trash-2` (`node_modules/lucide-react/dist/esm/createLucideIcon.js:17`,
`shared/src/utils.js:8`). A selector on the wrong spelling matches nothing, and inside a
swallowing catch that is five green tests doing nothing. Only `automation-crud.spec.ts` uses
lucide class selectors; its other three are single-word and correct by accident.

**`ActivityType`'s two child FKs are asymmetric, and it is the only reference entity where a
child does not block.** `Activity.activityTypeId` is NOT NULL / `ON DELETE RESTRICT`;
`Task.activityTypeId` is nullable / `ON DELETE SET NULL`. Read this out of the generated SQL under
`prisma/migrations/`, not from the schema — Prisma's defaults are implicit. Spec:
`specs/shared-entities.allium`, `DeleteActivityType` and `OptionalReferenceClearedOnDeletion`.

**A fixture is not residue.** The shared `E2E Activity Type` string is seeded
(`prisma/seed-e2e.ts`) because two specs share it and neither may sweep what the other uses.
`seed-e2e.ts`'s own header states the rule: anything a spec needs must be declared there.

**Ownership columns are not uniform.** `Job.userId` but `Question.createdBy`;
`Education`/`WorkExperience` have no user column at all and are owned through
`ResumeSection -> Resume -> profile -> userId`. A guard fix that assumes one spelling is half
right — that is how `SEC-B2` nearly got a wrong patch.

**Guard tests in this repo assert the mocked count and not the WHERE clause**, which is why two
ADR-015 violations survived 316 green suites. New guard tests assert the query shape and were
verified red against the unfixed code.

**`allium check` proves the file parses. It does not prove its references resolve.** Say which
you mean. `CLAUDE.md` § Specification Pattern records the probes.

**Bash tool output is paraphrased.** Two greps for the same React string returned two different
renderings this session. When a comparison or an anchor is the point, print `repr()` from python
and hexdump anything a regex will depend on.

---

## 4. If you want a next task

Ordered by value per unit of risk, not by size:

1. **T1** — one line, closes the hole that would let a missing translation ship silently, and
   covers the 12 keys added today.
2. **D3** — `Loading.tsx` gets `role="status"` and an accessible name; fixes all six tabs at once
   and cannot diverge them.
3. **A1** — the spinner-forever bug, four containers, mechanical, `TagsContainer` is the template.
4. **A2 + A3** — the i18n defects a non-English screen-reader user actually meets.
5. **R1** — real improvement, but all six tables in one commit or not at all.
6. **R3** — needs a decision (`router.replace` vs `activationMode="manual"` vs controlled), and a
   `/responsive-design` pass on the tablist.
