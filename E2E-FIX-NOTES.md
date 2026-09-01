# E2E Fix Notes — branch `fix/e2e-elysium`

Running log. Appended as work proceeds, per STEP 0 of `E2E-FIX-BRIEF.md`.

Baseline claimed by the brief: 74 passed / 38 failed (`--project=crud`, 112 tests).

## Log

### 2026-08-31 — session start

- Created this file before touching anything else.
- Next: verify the environment claims (worktree, branch, dev server, Playwright chromium path).

### Environment verification (against source, not the brief)

| Brief claim | Verified? | Detail |
|---|---|---|
| Worktree `/home/pascal/projekte/jobsync-e2e`, branch `fix/e2e-elysium` @ `e85ca27b` | ✅ | `git log -1` = `e85ca27b`, branch matches |
| Dev server on :3737 | ✅ | `GET /signin` → 200 |
| tmux session `e2e` | ✅ | 5 windows (brief said 4 — cosmetic) |
| Chromium at `~/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome` | ✅ | exists, executable |
| `@playwright/test` "(^1.49.1)" | ⚠️ **partly wrong** | `package.json` range is `^1.49.1`, but the *installed* version is **1.57.0**. The range statement is right, the implication ("predates Ubuntu 26") is about the installed build, which is recent. Did not re-test `playwright install`; the executable path works, so it is moot. |
| `--project=crud` is 112 tests | pending | crud has `dependencies: ["smoke"]`, so a `--project=crud` invocation also runs the 8 smoke tests first. |

### Cluster 1 — root cause confirmed at source

`src/components/profile/CreateResume.tsx:207-221` renders **two** `type="submit"` buttons inside
the same `DialogFooter`:

- `{t("common.save")}` → `"Save"`
- `{t("profile.saveAndOpen")}` → `"Save & Open"` (only when `!resumeToEdit`)

So `getByRole("button", { name: "Save" })` (substring match) matches both.

**Consequence for the fix choice:** the brief suggests dialog-scoping as the more robust
alternative. It does **not** work here — *both* buttons live inside the same dialog. `exact: true`
is the only locator that disambiguates. Every CreateResume-dialog site therefore gets
`exact: true`.

**Where the 17 sites actually live** (verified by reading each, not by grep count alone):

- 6 spec files (`automation-crud`, `automation-wizard-modules`, `job-detail-panels`,
  `keyboard-ux`, plus `enrichment` and `job-crud` which already pass `exact: true`) each carry a
  near-identical private copy of `ensureResumeExists()` / `deleteResume()`. Same dialog, same bug.
- `profile-crud.spec.ts` has 11 sites — that spec *is* the profile aggregate, so its Save clicks
  span several different dialogs, not only CreateResume. Needs per-site reading.
- `question-crud.spec.ts` (2 sites) is in the Add/Edit **Question** dialog, whose only Save-ish
  button is `questions.save` = `"Save"`. **That is why it appears in the grep but not in the
  failure list** — answering the brief's open question. No ambiguity there today.

### Cluster 2 — root cause established at source (before seeing the new run)

`page.waitForLoadState("networkidle")` **can never resolve on any `/dashboard/*` page**:

- `src/components/Header.tsx:76` mounts `<SchedulerStatusBar />` on every dashboard page.
- `SchedulerStatusBar` calls `useSchedulerStatus()` (`src/hooks/use-scheduler-status.ts`), whose
  first subscriber opens a shared `EventSource("/api/scheduler/status")`.
- `src/app/api/scheduler/status/route.ts` keeps that stream open for **10 minutes** before it
  sends `event: close`, and the client reconnects *immediately* ("immediate reconnect, no delay").

So there is a permanently pending request; Playwright's `networkidle` (no connections for 500 ms)
never triggers. A 15 s `safeWait` is guaranteed to throw.

This is **already documented in this repo** — `e2e/crud/job-crud.spec.ts:11-15` carries the exact
explanation and waits for `add-job-btn` instead. The M-T-04 `waitForTimeout` sweep introduced
`safeWait(page, { loadState: "networkidle" })` in the specs that *didn't* have that comment.

Sites (13): `keyboard-ux` ×11, `job-detail-panels` ×3 (one of them a raw
`page.waitForLoadState("networkidle")` at :194), `automation-crud` ×2, `enrichment` ×1,
`company-crud` ×1.

`company-crud`'s site is inside a `Load More` pagination loop that only runs when the button is
present — that is why the spec passes today despite containing the same bug. It is still wrong
and gets fixed.

**Fix direction:** replace each with the concrete condition the wait is standing in for
(a selector / a response / an assertion). Not a timeout raise; timeouts are irrelevant here
because the condition is unreachable, not slow.

### Planned replacements for cluster 2 (designed against source, before the baseline finished)

Rule applied: replace the unreachable wait with the *observable* condition it was standing in
for. Where the next statement is already that condition (an `expect(...)` with its own timeout, or
a `waitFor`), the wait is simply removed — a wait that can never resolve contributes nothing.

| Site | Replacement | Why |
|---|---|---|
| `keyboard-ux` 218, 241, 306, 629, 665, 705, 712, 758 | delete | next statement is already `expect(...).toContainText/toBeVisible` or a `waitFor` with its own timeout |
| `keyboard-ux` 401 | `await expect(page.getByText(skill).first()).toBeVisible({ timeout: 10000 })` | inside a 3-iteration loop; the next iteration types over the field, so the chip must be committed first. Same assertion the sibling test at :453 already uses. |
| `keyboard-ux` 453 | delete | the preceding line already asserts the chip is visible |
| `keyboard-ux` 513, 557 | `await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null)` | ESCO proxy fetch + debounce; this is verbatim the reference pattern in `selectOrCreateComboboxOption` that the brief points at. `.catch` because an empty result list is legitimate. |
| `job-detail-panels` 21, 31 | delete | `add-job-btn` visible / `table` visible are already awaited immediately above — exactly the `job-crud` precedent |
| `job-detail-panels` 194 | `domcontentloaded` | after `waitForURL` onto the detail page; callers assert their own content |
| `job-detail-panels` 363 | delete, and give `changeJobStatus` a post-condition: `expectToast(page, /Job has been updated successfully/)` | `JobsContainer.onChangeJobStatus` toasts `jobs.updatedSuccess` only after the server action resolves — that *is* "the action completed". Putting it in the helper fixes the class. |
| `automation-crud` 355, 374 | `expectToast(page, /Automation paused/)` / `/Automation resumed/` | `AutomationList.handlePause/handleResume` toast `automations.automationPaused/Resumed` after `await pauseAutomation(id)` resolves |
| `enrichment` 25 | delete | `add-job-btn` visible already awaited above |
| `company-crud` 52 | poll until the table row count grows | pagination path; currently unreachable-but-dormant (the `Load More` button is rarely present, which is why this spec passes today) |

Pre-existing issues noticed while reading, **left alone** (out of scope, not causing failures):

- `keyboard-ux` 215, 401(pre), 722, 769 etc. use `await page.waitForLoadState("domcontentloaded")`
  as a "wait for UI to settle". On an already-loaded page that resolves instantly — it is a no-op,
  i.e. the M-T-04 sweep removed the sleep without putting a condition in its place. Harmless, but
  it is not the wait the comment claims it is.
- `keyboard-ux` 729-733 and 765-775 swallow failures into `console.log("Note: …")`. That is the
  silent-skip pattern `e2e/CONVENTIONS.md` warns about. Pre-existing; flagged, not changed.

### Process notes

- **CPU cap (user request, 2026-08-31 23:51):** the agent/test tmux scope
  `tmux-spawn-89f0339d-…scope` now has `CPUQuota=480%` (80 % of 6 cores), applied live with
  `systemctl --user set-property`. The dev server sits in a *different* scope
  (`tmux-spawn-794445a7-…`) and is deliberately left uncapped — throttling the app under test
  would distort the very timings being measured. Playwright also runs under `nice -n 10`.

- **`--reporter=list` prints failure details only at the end of the run.** The per-test
  `test-results/<name>/error-context.md` files contain a page snapshot, *not* the error message.
  So a killed run yields no diagnosis. I let the baseline run to completion for that reason.
  Partial snapshots were copied to the scratchpad before any further run, per the brief's warning.

- Docs-only edits (`e2e/CONVENTIONS.md`) were made while the baseline ran; spec and helper edits
  were held until it finished, because a one-worker Playwright run `require()`s spec files lazily
  and would otherwise have picked up half-applied changes.

### Class-level fix applied to `e2e/CONVENTIONS.md`

The conventions file itself **recommended** `await safeWait(page, { loadState: "networkidle" })`
as the "GOOD — wait for full page load" example. That is where the sweep got the pattern. Changed
the example to `domcontentloaded` and added a section explaining why `networkidle` can never
resolve behind the dashboard shell, with a table of what to wait for instead.

---

## Baseline re-run (mine) — 2026-08-31 23:28 → 2026-09-01 00:09, 40.6 min

```
66 passed / 46 failed   (112 tests, --project=crud --workers=1, nice -n 10)
```

**The brief's baseline (74 / 38) did NOT reproduce.** Eight more tests failed here. Per-spec:

| Spec | Brief | Mine | Δ |
|---|---|---|---|
| keyboard-ux | 15 | 15 | — |
| profile-crud | 8 | 8 | — |
| automation-crud | 5 | 5 | — |
| job-detail-panels | 3 | 3 | — |
| automation-wizard-modules | 2 | 2 | — |
| enrichment / kanban / staging-details-sheet / staging-layout-toggle | 1 each | 1 each | — |
| **job-crud** | **1** | **6** | **+5** |
| **task-crud** | **0** | **2** | **+2** |
| **webhook-settings** | **0** | **1** | **+1** |

Error histogram: 20 × `strict mode violation … name: 'Save'` (brief said 22), 9 ×
`page.waitForLoadState` timeout (matches), 5 × `locator.fill` timeout, 4 × `locator.click`
timeout, 4 × `element(s) not found`, 4 × `toBeVisible` failed, 3 × `locator.waitFor` timeout,
1 × `toBe()`, 1 × `browserContext.close`.

### The +8 are almost certainly load/timing, not new defects

All eight fail on **actionability**, not on a selector that resolves to the wrong thing:

- `job-crud` ×5: `locator.fill` times out with the log `locator resolved to <input …
  data-testid="resume-title-input" …>` then `waiting for element to be visible, enabled and
  editable`. The element is found; it just never becomes actionable inside 10 s.
- `task-crud` ×2: `click({ force: true })` on a **resolved** `add-task-btn` hangs after
  `performing click action`. force:true skips actionability, so this is a blocked main thread.
- `webhook-settings` ×1: the secret dialog does not appear within 15 s.

Ruled out by measurement, not by assumption:

- **Not DB bloat.** `sqlite3 prisma/dev.db`: Job 4, JobTitle 17, Company 14, Resume 6, Tag 25,
  Person 34, StagedVacancy 51. Nothing accumulated.
- **Not a wedged dev server.** The tmux `e2e:1` log shows `POST /dashboard/settings 200` in
  160–3000 ms throughout, and tests 39–43 and 45 passed *between* the failing ones.
- Individual job-crud tests took 1.6 – 3.1 min, versus seconds for the same shape of test
  elsewhere. That is the signature of contention, not of a broken locator.

Contributing factor I introduced myself: I was grepping the repo throughout the run, and applied
the `CPUQuota=480%` cap **mid-run** at 23:51. Both add load the brief's runs did not have.

**Action:** treat these 8 as unverified. Re-run `job-crud`, `task-crud` and `webhook-settings`
in isolation on a quiet machine before claiming anything about them.

### Newly diagnosed (clusters 3-5)

**`staging-layout-toggle.spec.ts:51` — genuine test-vs-product divergence, NOT a flake.**
The spec waits for `getByRole("radio", { name: /Comfortable/i })`. The product no longer has a
radiogroup: `src/components/staging/StagingLayoutToggle.tsx` is now a **single icon Button**
(`data-testid="staging-layout-toggle"`) whose `aria-label` names the *next* state, and whose
doc-comment says the three-option `ToolbarRadioGroup` was removed as confusing. So `role=radio`
and `aria-checked` no longer exist. Decision needed — see Open Questions.

**`kanban.spec.ts:166`** — `locator("table").first()` not visible after `switchToTableView`.
**`staging-details-sheet.spec.ts:103`** — the vacancy title is not inside the opened sheet.
Both still to be re-checked after clusters 1-2 land, since both sit downstream of shared state.

### Why the +8 almost certainly were load — measured after the run

At 00:23, right after the baseline finished:

```
load average: 24.44, 33.04, 26.63     # on 6 cores
Mem: 31Gi total, 27Gi used, 3.8Gi available
next-server (dev)  RSS 7.75 GB  (23.6 % of RAM), up 1 h 23 m
```

The dev server's own log corroborates it independently:

```
[NODE-CRON] [WARN] missed execution at Tue Sep 01 2026 00:15:00 …!
Possible blocking IO or high CPU
```

Three other `claude` processes were also running on this box, so the contention was not all mine.

**Restarted the dev server** in tmux `e2e:1` via `scripts/dev-e2e.sh` (the brief explicitly
allows this; the script pkills `next dev` itself and re-`exec`s in the foreground of that
window). `✓ Ready in 7.4s`, `/signin` → 200. RSS dropped 7.75 GB → 1.6 GB, available RAM
3.8 GB → 9.8 GB, load 24 → 10.

This matters for interpreting the verification run: it is **not** run under the same conditions
as the baseline. The honest comparison is baseline-numbers-with-that-caveat, and I re-run the
three suspect specs in isolation rather than claiming I "fixed" them.

Also worth recording: `scripts/typecheck-safe.sh` opens its **own** `systemd-run --user --scope`,
which is a sibling of the capped tmux scope, so the 480 % CPU cap does not apply to it. It is
`nice -n 19 ionice -c3` internally, so this is fine — but the cap is not global.

---

## Findings that the brief did not have

### A. `898a5119` broke **two** things, not one

The brief attributes cluster 1 to `898a5119` *"feat(profile): add Save & Open button"*. That same
commit also **renamed the success toast**: it introduced `profile.resumeCreated`
("Resume created successfully") in place of the old "Resume title has been created".

Four specs still asserted the old string, which the app has not rendered since 2026-04-06:

- `profile-crud.spec.ts:82` `/Resume title has been created/`
- `automation-crud.spec.ts:39`, `automation-wizard-modules.spec.ts:39`,
  `job-detail-panels.spec.ts:56` `/Resume title has been/`

`job-crud` and `enrichment` already used `/Resume created successfully/` — the same two copies
that already had `exact: true`. So one commit's blast radius was partially repaired in two of six
duplicated helpers and left in the other four.

Verified the old string exists nowhere in `src/i18n/dictionaries/` before changing anything.
Changed all four to `/Resume created successfully/`.

### B. `e2e/cleanup-stale-data.ts` could kill the whole suite (found by running it)

After the first single-spec re-run, **`globalSetup` itself started throwing**:

```
PrismaClientKnownRequestError: Invalid `prisma.company.deleteMany()` invocation
  at e2e/cleanup-stale-data.ts:124   Foreign key constraint violated
```

`WorkExperience.companyId → Company` has no `onDelete`, i.e. Restrict. Step 6a guarded
`jobsApplied` and `recruitingJobs` but not `workExperiences`. Step 7 does not save it either: it
only deletes resumes whose **title** starts with `"E2E "`, and `profile-crud` names its resumes
`Resume Full <uid>`. So a `profile-crud` test that fails before its inline cleanup leaves a
`WorkExperience` row pinning `"E2E Corp"` **permanently**, and every later run dies in
`globalSetup` — failing 112 tests because of one leak.

Fixed by adding `workExperiences: { none: {} }` to the guard: the company survives instead of the
suite dying. This is infrastructure, not a test weakening — no assertion changed.

This is a latent landmine the brief's two runs never hit, and it would have blocked the next
person regardless of the 38 failures.

### C. `scripts/dev-e2e.sh` did not pin the auth origin — smoke could fail, taking `crud` with it

`e2e/smoke/signin.spec.ts:28` intermittently failed with the dashboard still rendered instead of
the "Welcome back" heading. Cause:

- `.env` here holds `NEXTAUTH_URL=http://100.76.113.93:3737` (Tailscale, so the app is reachable
  from other devices).
- `src/components/Header.tsx:84` builds the sign-out redirect from
  `AUTH_URL ?? NEXTAUTH_URL ?? "http://localhost:3737"` — **server-side**.
- So logging out of `http://localhost:3737` redirects to a different origin; the session cookie
  does not travel and the test asserts against the wrong page.

The brief's own commit `ec52926f` "pin NEXTAUTH_URL for the run" pins it in the **Playwright**
process. That cannot work: the redirect is computed on the server, which reads its own env.

Fixed in `scripts/dev-e2e.sh` (`export NEXTAUTH_URL="${E2E_BASE_URL:-http://localhost:3737}"`,
overridable). A real process env var beats a `.env` entry in Next.js, so this takes effect without
editing the gitignored `.env`. Dev server restarted; `✓ Ready in 8.4s`.

This matters out of proportion to one test: `crud` declares `dependencies: ["smoke"]`, so a smoke
failure makes the entire 104-test crud project not run.

### D. Product bug found by the suite: an untranslated error toast

`src/components/settings/ApiKeySettings.tsx` rendered `description: result.message || …`.
`result.message` from `module.actions.ts:210` is an **i18n key**, so the user saw the literal
string `settings.moduleActivationRequiresCredential`. Captured verbatim in the Playwright
accessibility snapshot. The key exists in all four locales; the neighbouring
`AutomationList.handlePause` already does `t(result.message)`.

Wrapped both toast sites in `t()`. This is the project's own rule (all server-action `message`
values are i18n keys — see CLAUDE.md / `feedback_i18n_error_messages`).

### E. `automation-wizard-modules` poisoned its own fixture

The "should only show active modules" test deactivates JSearch, then **unconditionally**
re-activates it. JSearch declares `credential.type: api_key`, and `activateModule` refuses with
`settings.moduleActivationRequiresCredential` when no key is stored. So:

1. a run that found JSearch active deactivated it and failed to restore it;
2. `ModuleRegistration.jsearch` stayed `inactive` in `prisma/dev.db` (confirmed by query);
3. every later run then failed on the restore step, forever.

Fixed by guarding the restore on `wasActive` — restore the original state rather than assume one.
The test's actual assertion (JSearch absent from the wizard while inactive) still runs.

### F. `automation-crud` card locator no longer matched the markup

`page.locator("a", { hasText: name })` selected the automation card. `AutomationList.tsx:167`
now renders the card as `<div role="article" aria-label={automation.name}>`, with the `<a>` being
only the title link — the module Badge, the status Badge and the Actions button are all
**siblings** of it. So `card.getByText("arbeitsagentur")` and `card.getByRole("button")` looked
inside an anchor that contains nothing but the name.

Switched all five sites to `page.getByRole("article", { name })` — a stronger locator, not a
looser one. Also replaced `card.getByRole("button").first()` with
`card.getByRole("button", { name: "Actions" })`: the file's own comment said "the last button",
the code said `.first()`, and a paused automation renders a pause-reason Info button ahead of it.

### G. keyboard-ux — 15 failures, four distinct causes

1. **9 of them were cluster 1 / cluster 2** (Save ambiguity + `networkidle`).
2. **ESCO combobox, 4 tests:** `getByRole("combobox").filter({ hasText:
   /Search occupations|keyword/i })` matched **two** controls — the occupation trigger and the
   "Keyword search scope" select rendered from the module manifest. A strict-mode violation, not a
   missing element. Also worth noting: the first alternative never matched anything, because the
   trigger's placeholder reads "Search **ESCO** occupations or type keywords…". Narrowed to
   `/Search ESCO occupations/i`.
3. **sr-only announcement:** `ComboBox.tsx:66` announces
   `t("forms.optionCreated").replace("{label}", …)` = `"<label> created"`. The test checked
   case-sensitively for `"Created"`. **Verified empirically** with a standalone probe rather than
   from the source: the live announcement is `"KBProbe Title mthuvquu created"`.
4. **TagInput duplicate path:** the second `Enter` did nothing at all — the failure snapshot still
   showed the *create* announcement (`"Created KBDupe …, 1 of 10"`) and only one chip. TagInput's
   handler bails on an empty `inputValue`, and `handleCreate`'s `startTransition` clears the field
   when it resolves, so the re-fill raced the clear. Now waits for the clear and asserts the value
   landed before each `Enter`.
5. **Mobile viewport, 2 tests:** clicking `add-job-btn` at 375×667 does not open the dialog.
   Reproduced outside Playwright's test runner with a standalone script: **identical script, the
   dialog opens when two `evaluate()` round-trips precede the click and does not when they do
   not.** `add-job-btn` is server-rendered, so waiting for it to be visible does not prove React
   has hydrated and attached the handler.

   **This is a real user-facing risk, not only a test artifact** — a user who taps "New Job" early
   on a phone gets nothing. Filed here rather than fixed: the fix belongs in the app (a
   hydration-gated disabled state), and guessing at it is out of scope for this task.

### H. Also found, deliberately NOT fixed (out of scope, reported instead)

- `src/components/myjobs/TagInput.tsx:147,162` build sr-only announcements from **hardcoded
  English** (`` `${inputValue.trim()} already selected` ``, `` `Maximum ${MAX_TAGS} skills
  reached` ``, `` `Created ${newTag.label}, …` ``). Screen-reader users on DE/FR/ES get English.
  That violates the project's own i18n rule; fixing it needs four new keys in four locales, which
  is a change of a different kind than this task.

### I. The runner itself hung — worth knowing before the next session

A four-spec run (`job-crud`, `task-crud`, `webhook-settings`, `job-detail-panels`) completed 17
tests, then **stopped**: the log file's mtime froze at 01:30, the runner node process and its
worker child both sat at **0 % CPU** for 40 minutes, and the machine was otherwise idle
(load 4.9, 5 GB RAM free). No timeout fired — `test.setTimeout(120_000)` was exceeded twentyfold.
The runner had to be killed manually.

`next-server` was again at **5.8 GB RSS after 1 h 12 m** of E2E traffic. This matches the
"Next-dev hang" recorded for the Welle 4 session in project memory. Restarting the dev server
between long runs is not hygiene theatre here, it is load-bearing.

Trap for the next agent: `pgrep -f "playwright test"` **matches your own shell command line**, so
it reports RUNNING forever. Judge by the log file's mtime (`stat -c %y`) or by the runner's CPU
time, not by pgrep.

### J. The +8 were load, confirmed by re-running them on a quiet machine

- `task-crud` (2 baseline failures) and `webhook-settings` (1): **21 passed, 0 failed** with no
  code change to either spec. They were contention artifacts, as suspected.
- `job-crud` (6 baseline failures): 5 pass unchanged. The 6th was a real drift — the brief's
  single `locator.fill: Element is not an <input>` — see below.

### K. `job-crud` point-of-contact — the last genuine drift

`page.getByLabel("Role").fill("Recruiter")`. Role is a `SelectFormCtrl` (Radix Select) whose
trigger is a `role="combobox"` button with `aria-label = t("forms.selectPlaceholder")` =
"Select Role". A substring `getByLabel("Role")` resolves to that button, and `fill()` then rejects
it. Replaced with open-select-then-click-option.

---

## Verification gate

| Check | Result |
|---|---|
| `bash scripts/typecheck-safe.sh` | exit 0, banner only — **clean** |
| `bun run lint` | **exactly 5** errors, all `no-empty` in `src/lib/connector/arbeitsagentur-account/cdp-scripts/` (WH-B1, fixed on another branch). Nothing new. |
| `bash scripts/test.sh` | see below |
| `--project=crud --workers=1` | see below |

### L. The Jest suite could not run in this worktree at all

`bash scripts/test.sh` reported:

```
No tests found, exiting with code 1
  1827 files checked.
  testMatch: ... - 342 matches
  testPathIgnorePatterns: /node_modules/, /.next/, e2e, \.tracks/, __tests__/helpers - 0 matches
```

`jest.config.ts:209` had `testPathIgnorePatterns: ["e2e", …]`. Those are regexes matched against
**absolute** paths, and this worktree lives at `/home/pascal/projekte/jobsync-**e2e**`. So the
bare `"e2e"` matched every path in the checkout and ignored all 342 test files.

342 matched by `testMatch`, 0 surviving the ignore list — the two numbers in that message are the
tell.

Anchored to `"<rootDir>/e2e/"`. Anyone whose checkout directory happens to contain "e2e" hit this;
the brief's own instruction to expect "314 suites / 5777 passed" was unreachable here until it
was fixed.

Final results:

```
bash scripts/typecheck-safe.sh   exit 0, banner only
bun run lint                     5 pre-existing no-empty errors (WH-B1), nothing new
bash scripts/test.sh             Test Suites: 314 passed, 314 total
                                 Tests: 2 todo, 5777 passed, 5779 total
npx playwright test --project=crud --workers=1
                                 112 passed (30.7m)      <- 0 failed
```

---

# FINAL REPORT

## Numbers

| | Passed | Failed |
|---|---|---|
| Brief's stated baseline | 74 | 38 |
| **My baseline** (2026-08-31 23:28, same tree, under load) | **66** | **46** |
| **After the fixes** (2026-09-01 03:03, quiet machine, fresh dev server) | **112** | **0** |

Jest: 314 suites / 5777 tests, all passing (and runnable in this worktree for the first time).
Typecheck: clean. Lint: 5 pre-existing WH-B1 errors, no new ones.

## Commits (10, on `fix/e2e-elysium`, nothing pushed)

| SHA | Subject |
|---|---|
| `df42d441` | fix(e2e): repair both CreateResume regressions from 898a5119 |
| `6d9adc62` | fix(e2e): stop waiting for a load state the dashboard never reaches |
| `c537e4b5` | fix(settings): translate the module activation/deactivation error toasts |
| `3c506592` | fix(e2e): make the fixture self-healing and pin the auth origin |
| `0f16dabc` | fix(e2e): match the current markup for automation cards and panels |
| `3bf95a1b` | fix(jobs): recover the jobs list when getJobsList rejects |
| `273eaa7c` | fix(e2e): address the kanban and staging failures at their real cause |
| `8eabed4d` | fix(e2e): fix the four keyboard-ux drifts behind its 15 failures |
| `d01040b7` | fix(e2e): pick the contact Role from its Select instead of typing into it |
| `0e27fe13` | fix(test): anchor the e2e ignore pattern to the project's own directory |

Three of the ten touch **product** code, not tests:

- `c537e4b5` — an i18n key was rendered raw in a toast.
- `3bf95a1b` — a rejected server action left the jobs list stuck on its spinner forever.
- `0e27fe13` — Jest config (build tooling, not shipped code).

No assertion was deleted, no `test.skip` added, no timeout raised. Two locators became *stricter*
(`role=article` + accessible name; `role=combobox` + accessible name) rather than looser.

## Risks

1. **The comparison is not like-for-like.** My baseline ran under load average 24 with a dev server
   at 7.75 GB RSS; the verification run had a freshly restarted server on an idle box. The 38 → 0
   claim is honest for *this* machine state; on a loaded machine some of the actionability-timeout
   failures (job-crud, task-crud, webhook-settings) can plausibly come back. They pass without any
   change to their specs, which is the evidence that they are environmental — but it is evidence,
   not proof.
2. **The mobile hydration retry treats a symptom.** `openAddJobDialog` now retries the click. The
   underlying issue — a server-rendered button that does nothing until React hydrates — is still in
   the product. See finding G5.
3. **Deleted `networkidle` waits changed timing everywhere they were removed.** Where the next
   statement was already the real condition I removed the wait outright. Each of those specs was
   re-run and passes, and the full suite passes, but these are the sites most likely to surface a
   race on a much slower machine.
4. **`expect.poll` on row count in `company-crud`** replaced a wait on a code path that almost never
   executes (the "Load More" button is rarely present). It is therefore the **least-exercised** of
   my changes — it was green in the full run only because the loop did not run.
5. **`e2e/cleanup-stale-data.ts` now leaks "E2E " companies** that a `WorkExperience` pins. That is
   deliberate: leaking a row is better than killing all 112 tests. Someone should later extend
   step 7 to cover resumes that do not carry the "E2E " title prefix.

## Open questions

1. **Why does the Playwright runner hang?** Finding I: a run stopped after 17 tests with both node
   processes at 0 % CPU and no timeout firing, and had to be killed. It did not recur after the
   dev server was restarted, so the working hypothesis is dev-server memory pressure — but I did
   not prove it, and I do not know what the runner was blocked on.
2. **Should the AddJob button be disabled until hydrated?** That is a product/UX decision (G5).
3. **`TagInput` announcements are hardcoded English** (finding H). Fixing needs four keys × four
   locales — a different kind of change than this task, so I only reported it.
4. **`profile-crud` cleans up inline, not in `afterEach`.** That is what let a failing test pin
   "E2E Corp" and break `globalSetup` for every later run. `CONVENTIONS.md` already recommends
   `afterEach` for critical cleanup; the spec does not follow it. Not changed — it is a rewrite of
   eight tests, and the cleanup guard makes it non-fatal.

## Shortcuts taken — blunt

- **I did not extract the six duplicated `ensureResumeExists` / `deleteResume` copies into a shared
  helper**, even though the brief explicitly invited that ("prefer fixing the class over the
  instance") and `CONVENTIONS.md` mandates sharing at 3+ specs. Six near-identical copies with four
  *different* post-conditions are exactly what let `898a5119` be half-repaired for five months, and
  it will happen again. I judged a six-file refactor too risky against a suite I can only validate
  in ~30-minute runs, and prioritised getting the 46 failures green. **This is the single largest
  piece of unfinished work.**
- **I applied the CPU cap in the middle of the baseline run**, and grepped the repo throughout it.
  Both added load the brief's runs did not have, and I cannot cleanly separate that contribution
  from the +8 discrepancy. I should have run the baseline on an idle machine and left it alone.
- **I restarted the dev server three times.** Permitted by the brief, and each time the reason is
  recorded above — but it does mean the baseline and the final run are not the same environment.
- **I did not diagnose the runner hang**, only worked around it (finding I).
- **I did not re-run the two mobile keyboard-ux tests enough times to characterise the hydration
  race.** I proved it exists with a standalone script and made the test robust; I did not measure
  how wide the window is.
- **The final run had no retries configured** (`retries: 0` outside CI), so 112/112 is one sample.
  A second full run would strengthen the claim; I did not spend the 30 minutes on it.

## Where the brief was wrong

Checked against source, in the order I hit them:

1. **"74 passed, 38 failed … These are not flakes. They reproduce."** They did not reproduce here:
   I measured **66 / 46**. The extra 8 were load-sensitive and pass unchanged on a quiet machine.
2. **"22 strict-mode violations on Save."** It is **20**.
3. **`898a5119` "added the Save & Open button"** — true, but incomplete. The *same* commit also
   renamed the success toast to `profile.resumeCreated`, and four specs still asserted the old
   string. The brief attributes only half of that commit's blast radius.
4. **"some may be better served by scoping to a dialog (`page.getByRole("dialog")…`), which is more
   robust than exactness."** Not for this dialog: `CreateResume.tsx` renders **both** buttons inside
   the same `DialogFooter`, so dialog-scoping does not disambiguate them at all. `exact: true` is
   the only thing that works there.
5. **"`question-crud` appears in that list but not in the failure list — check why."** Answered: the
   Add/Edit Question dialog has exactly one Save-ish button (`questions.save`). No ambiguity, so no
   failure. I left it unchanged.
6. **"`@playwright/test` (^1.49.1) predates [Ubuntu 26]."** `^1.49.1` is the *range* in
   `package.json`; the **installed** build is **1.57.0**. I did not re-test `playwright install`, so
   whether it still fails is unverified — the executable path works, which makes it moot.
7. **`ec52926f` "pin NEXTAUTH_URL for the run."** Pinning it in the Playwright process cannot work:
   the sign-out redirect is computed **server-side** from the dev server's own env. Moved into
   `scripts/dev-e2e.sh` (finding C).
8. **"tmux session `e2e` · `0:work` `1:dev` `2:runs` `3:status`."** There are five windows; a
   `4:fixer` also exists. Cosmetic.
9. Not wrong, but missing: the brief's verification recipe (`bash scripts/test.sh` → 314 suites)
   **could not run at all** in this worktree until `jest.config.ts` was fixed (finding L).


---

# Extraction — shared resume fixture

Second session, `E2E-EXTRACT-BRIEF.md`. Running log, appended as work proceeds (STEP 0).

## Session start — 2026-09-01

- Appended this heading before touching anything else.
- Next: verify the environment claims, then read all seven specs that reference
  `ensureResumeExists` / `deleteResume` before writing a line.

### Environment — verified, not assumed

| Claim | Result |
|---|---|
| worktree + branch `fix/e2e-elysium` @ `3cc594ef` | ✅ `git log -1` matches, tree clean apart from the brief + this file |
| dev server on :3737 | ✅ `GET /signin` → 200 |
| tmux `e2e:1` | ✅ 5 windows |
| baseline "112 passed, 0 failed" | not re-run yet — that is the verification gate, below |

Machine state at 08:54: load average 7.32 on 6 cores, 3.3 GB available RAM, and `next-server`
already at **7.29 GB RSS after 47 min**. That is the same figure the previous session tied to the
runner hang (finding I). The dev server gets restarted with `scripts/dev-e2e.sh` before the
verification run, not after a hang.

### The seven copies, diffed rather than eyeballed

Each fixture was cut out of its spec with `sed` and `diff -u`-ed against the `job-crud` copy, so
the differences below are byte-exact, not impressions.

**`ensureResumeExists` — six copies.** Identical core in all six: `goto /dashboard/profile` →
`domcontentloaded` → probe `getByRole("row", {name: /title/i})` for 3 000 ms → early-return if
present → `New Resume` → fill `Ex: Full Stack Developer` → click `Save` with `exact: true`.

| Copy | Returns | Post-condition after Save |
|---|---|---|
| `job-crud` | `void` | `expect(getByText(/Resume created successfully/i).first()).toBeVisible({10000})` |
| `enrichment` | `void` | same |
| `job-detail-panels` | `void` | same |
| `automation-crud` | `Promise<string>` | same, only wrapped differently |
| `automation-wizard-modules` | `Promise<string>` | `expectToast(page, /Resume created successfully/)` |
| `keyboard-ux` | `Promise<string>` | **`expect(getByRole("row", {name:/title/i}).first()).toBeVisible({10000})`** |

**`deleteResume` — seven copies.** Six are the same tolerant teardown (5 000 ms probe, whole body
in `try/catch`, no post-assertion). `profile-crud`'s is a different function wearing the same name.

| | six fixture copies | `profile-crud` |
|---|---|---|
| missing row | swallowed — `catch { /* skip cleanup */ }` | **fails the test** (no catch) |
| probe timeout | 5 000 ms | 10 000 ms |
| after confirming | nothing | **`await expect(row).not.toBeVisible({10000})`** |

### Incidental vs essential — the decision, and why

**Incidental (converged):**

- Three wordings of the same doc comment; the `exact: true` explanation present in one copy only.
- `return;` vs `return resumeTitle;`. The function returns the argument it was handed — it cannot
  return anything else. Converged on returning the title: the three `void` callers ignore it, the
  three `const createdResume = await …` callers keep working unchanged.
- `expect(page.getByText(p).first()).toBeVisible({timeout:10000})` vs `expectToast(page, p)`.
  `expectToast` **is** that expression, with the same 10 000 ms default (`helpers/index.ts:18-24`).
  Byte-different, semantically identical. Converged on `expectToast`.
- `/Resume created successfully/i` vs the same regex without `i`. The rendered string is exactly
  `Resume created successfully` (`profile.resumeCreated`), so the flag is inert. Kept the
  case-insensitive form — it is the tolerant one, and dropping it would be a (tiny) tightening.
- Line-wrapping, blank lines, and whether the row locator is constructed inside or outside the
  `try`. Constructing a Playwright locator cannot throw — it is lazy — so that placement carries
  no behaviour.

**Essential (preserved):**

1. **`keyboard-ux` waits for the resume ROW, not the toast.** The row appearing proves the profile
   list re-rendered; the toast only proves the server action resolved. It is a later and different
   signal, and all four of its call sites navigate straight to `/dashboard/automations` to click a
   button that is disabled until a resume exists. Flattening this to the toast would weaken it, and
   forcing the other five onto the row wait would *add* an assertion to five specs. Both are
   forbidden by the brief. → one named option, `confirmWith: "toast" | "row"`, default `"toast"`.
2. **`profile-crud.deleteResume` is an assertion, not a teardown.** It is the Profile aggregate's
   own delete flow: a missing row must fail, and the row must be gone afterwards. Sharing the
   tolerant helper there would silently delete an assertion and wrap the whole flow in a `catch`.
   → it does **not** share. Per the brief's third acceptable outcome, it keeps its own copy.

So: **one shared helper with one boolean-ish named option, plus one honest local exception.**
Not six flags, not four helpers.

`profile-crud`'s local copy is renamed `deleteResumeAndVerifyGone` (8 call sites, pure rename, no
runtime effect). Two functions named `deleteResume` with opposite failure semantics is precisely
the trap that let `898a5119` be half-repaired for five months: the next person greps the name,
finds two definitions, and unifies the wrong pair. The name now states which one it is.
`profile-crud.createResume` also stays local — it is the unconditional create *under test*, with no
existence probe and no post-condition, not a fixture.

### Home for the shared code

`e2e/helpers/` is the existing home (`CONVENTIONS.md`: "Shared utilities (import from here, never
duplicate)", and "only add helpers used by 3+ spec files" — this is 6). But rule 7 also says only
*truly generic* helpers belong in `helpers/index.ts`, and a resume fixture is a Profile-aggregate
page flow, not a primitive.

New file `e2e/helpers/resume-fixture.ts`, imported directly as `../helpers/resume-fixture`.
**Not re-exported from `helpers/index.ts`**: the fixture needs `expectToast` *from* `index.ts`, so
re-exporting would make `index.ts → resume-fixture.ts → index.ts` a cycle. ESM tolerates that;
it is still a trap worth not setting. Two import lines in a spec is the cheaper price.

### Interruption — 2026-09-01 ~09:00 to 13:38

The session timed out mid-task (right after the extraction-range check, before any spec was
edited), and in the meantime the operator `pkill`ed `tsserver` and `next-server` because the box
was overloaded, and closed the dev-server tmux window with `ctrl+d` (EOF to the foreground
`bun run dev` — that ends it, it does not detach).

State on resume: working tree intact, `resume-fixture.ts` present, **no** spec edits had landed.
Dev server down, `:3737` dead, tmux `e2e` down to 4 windows. RAM back to 15 GB available, load
7.6 falling from 23. Nothing to recover; the spec edits do not need a server.

### What was actually changed

- **New** `e2e/helpers/resume-fixture.ts` — `ensureResumeExists(page, title, { confirmWith })`
  and the tolerant `deleteResume(page, title)`.
- Six specs lost their private copies and import the shared pair:
  `job-crud` (7 + 7 sites), `automation-crud` (5 + 5), `keyboard-ux` (4 + 4),
  `job-detail-panels` (3 + 3), `automation-wizard-modules` (2 + 2), `enrichment` (1 + 1).
  Call-site counts before and after are identical; nothing was inlined or dropped.
- `keyboard-ux`'s four call sites pass `{ confirmWith: "row" }` — its post-condition, preserved
  verbatim. No comment repeated at the four sites: the reasoning lives in the helper's JSDoc, one
  copy of it, which is the point of the exercise.
- `automation-wizard-modules` lost its now-unused `expectToast` import (it used it in exactly one
  place: inside the fixture).
- `profile-crud.deleteResume` → `deleteResumeAndVerifyGone`, 8 call sites, with a comment stating
  why it does not share. Pure rename, no runtime effect.
- `CONVENTIONS.md` gained a "Shared Fixtures" section: where fixtures live, the option-vs-copy
  rule, and the `898a5119` history as the reason.

Net: **304 deletions, 155 insertions**, of which the notes and CONVENTIONS are 126 of the
insertions. The spec+helper code is ~90 lines replacing ~300.

### Static gates

| Check | Result |
|---|---|
| `bash scripts/typecheck-safe.sh` | exit 0, banner only — clean |
| `bun run lint` | exactly 5 `no-empty` errors, all in `cdp-scripts/` (WH-B1). Nothing new. |
| `bash scripts/test.sh` | **314 suites / 5777 passed, 2 todo** — identical to the pre-refactor number. Jest never sees `e2e/`, so this only proves nothing else regressed. |

The E2E run is the gate that actually exercises this change. Started 13:44 via
`scripts/test-e2e.sh --project=crud --reporter=list` (not the bare `npx playwright` from the
brief — CLAUDE.md forbids the bare tool, and the wrapper does the same thing plus `nice`/`ionice`,
a pinned `NEXTAUTH_URL`, and a `nohup`ed dev server that survives the shell). Chromium pinned to
the brief's `~/.cache/ms-playwright/...` path via `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, which the
wrapper honours as an override.

### Resource limiting (operator request, 2026-09-01 13:45)

Measured first, 2 min into the verification run:

```
next-server   RSS 3.30 GB after 2 min, 70.8 % CPU     <- the hog
playwright + chromium (5 procs)  ~0.9 GB total
host: 5 cores, 31 GB RAM, NO SWAP, load 9.9, 10 GB available
```

`next-server` and Playwright were in the **same** tmux scope, because `test-e2e.sh` starts the
dev server with `nohup` out of the caller's shell.

**Applied live, to the running scope:** `MemoryHigh=10G` + `MemoryMax=12G`
(`systemctl --user set-property`). Deliberately *not* a CPU quota: the previous session recorded
that applying one mid-run made its baseline incomparable, and the same would apply here.
`MemoryHigh` was first set to 8G and immediately raised to 10G — current usage was already
5.8 GB and **this host has no swap**, so a soft limit that close would have thrown the dev server
into reclaim stalls and produced actionability timeouts that look like test failures.

**Baked into the scripts, for future runs** (both were `exec`-ed away, so editing them mid-run
could not corrupt the running suite — checked with `ps` first):

- `scripts/dev-e2e.sh` — the dev server now runs in its **own** transient scope with
  `MemoryMax=8G` (default, `E2E_DEV_MEM_MAX`), and, more importantly, with
  `--max-old-space-size=3072` (`E2E_DEV_NODE_HEAP`).
  The heap cap is the primary lever and the cgroup only a backstop: `next dev` is a Node process,
  so bounding V8 makes it *collect* rather than grow, whereas a cgroup limit alone leaves the heap
  just as large and makes the kernel stall on reclaim — worthless without swap. The cgroup covers
  Turbopack's native allocations, which V8 flags do not.
  CPU is **not** capped by default (`E2E_DEV_CPU_QUOTA` opt-in): this is the application under
  test, and throttling it distorts the timings the suite measures.
- `scripts/test-e2e.sh` — the Playwright side gets its own scope, `MemoryMax=6G`
  (`E2E_MEM_MAX`) + `CPUQuota=400%` (`E2E_CPU_QUOTA`) on top of the existing `nice`/`ionice`.
  Separate scopes mean a runaway browser cannot starve the app under test, or the reverse.

Both follow `typecheck-safe.sh`'s fallback ladder (`--user` scope → system scope → unconfined) so
nothing NixOS-specific changed; the NixOS chromium detection and `env.sh` sourcing are untouched.
One deliberate difference from `typecheck-safe.sh`: neither script *aborts* when no transient
scope is available — without a dev server there is no E2E run at all, so they warn and degrade.

**Not yet proven:** this verification run started under the *old* scripts, so the new confinement
is unexercised. It gets a smoke test after the run finishes, not before — restarting the dev
server now would kill the run (`dev-e2e.sh` starts with `pkill -f "next dev"`).

### Verification run 1 — 111 passed, 1 failed (13:44 → 14:10, 26.6 min)

```
1 failed
  [crud] › e2e/crud/webhook-settings.spec.ts:229:7 › should expand endpoint details …
111 passed (26.6m)
```

The baseline to hold was 112/0, so this is a deviation and gets treated as mine until proven
otherwise.

What is established by inspection, not inference:

- `webhook-settings.spec.ts` is **not one of the seven files this task touches** (`git status`
  shows it unmodified) and it contains **zero** references to `ensureResumeExists`,
  `deleteResume` or `resume-fixture`. There is no code path from the change to that test.
- The failure is `locator.fill: Timeout 10000ms exceeded — waiting for getByLabel('Endpoint URL')`
  inside `createWebhookEndpoint`. `navigateToWebhooks` had already found the "Webhooks" heading,
  so the page rendered but the form did not, in time.
- The previous session recorded this exact spec as one of three that fail under load and pass
  unchanged on a quiet machine (finding J).

Re-run in isolation on the **same** server: `webhook-settings` never ran, because **smoke** failed
first (`Signin and out from app` — "Welcome back" heading not found after logout, 10 s), and
`crud` depends on `smoke`. That same smoke test had passed on that same server 28 minutes earlier.

The common factor is measured, not guessed:

```
next-server  RSS 7.27 GB after 27:47      <- the balloon from finding I, again
```

Two different tests, in two files, neither touched by this change, both failing on "the page did
not render in time", on a dev server that had grown to 7.3 GB. That is the environment, not the
refactor.

**Restarted the dev server with the new `dev-e2e.sh`** — sanctioned by the brief, and it doubles
as the proof that the new confinement works:

```
[dev-e2e] heap=3072MB mem-backstop=8G cpu=uncapped
[dev-e2e] confined via systemd --user scope
scope run-p361132….scope (jobsync-dev-e2e): MemoryMax=8G MemorySwapMax=0 MemoryCurrent=1.89G
dev server env: NODE_OPTIONS=--max-old-space-size=3072 --enable-source-maps
                E2E_AUTH_RATE_LIMIT_BYPASS=1  NEXTAUTH_URL=http://localhost:3737
```

env.sh's own `--enable-source-maps` survived the prepend, and the auth bypass and pinned origin
are intact. `test-e2e.sh`'s new limits also took effect on the retry: `[test-e2e] limits: mem=6G
cpu=400%`.

Trap worth repeating: the first cgroup check said the server was still in the tmux scope. It was
not — `pgrep -f next-server` had matched **my own command line**. Same self-match trap as finding
I. Read `/proc/<pid>/cgroup` for a PID you got from a listing you can see.

### Finding — `webhook-settings` has a missing post-condition (recorded, NOT fixed)

The preserved snapshot from the one failure says exactly what the page was showing:

```
- heading "Webhooks" [level=3] [ref=e138]
- paragraph: Configure webhook endpoints to receive notifications via HTTP.
- generic [ref=e143]: Loading...
```

Confirmed at source: `src/components/settings/WebhookSettings.tsx:72` starts `isLoading = true`
and `:281` returns an early loading block, so the "Endpoint URL" field is **not mounted at all**
until the fetch resolves. The product is behaving correctly — a loading state is not a bug.

The test is the weak part. `navigateToWebhooks` (`webhook-settings.spec.ts:18-30`) waits for
`getByText("Webhooks", { exact: true }).first()`, and that text is already on the page as the
sidebar button *and* the panel heading **while `isLoading` is still true**. So the helper returns
before the panel is ready, and `createWebhookEndpoint` then races the fetch. On a fast server the
race is always won; on a 7.3 GB dev server it is not.

Fix belongs in that spec: wait for the form (`getByLabel("Endpoint URL")`) or for the absence of
the loading text, instead of for a string the shell renders early. **Not done here** — this task
is a refactor of the resume fixture, and mixing an unrelated spec fix into it makes both
unreviewable (brief rule). It is also not what caused the deviation: it only made the spec the
first casualty of the memory balloon.

### The missing post-condition is a class, not one spec (verified against source)

A read-only subagent was asked to find every other instance. Its five findings were then checked
line by line against the files — all five are real, nothing fabricated:

| Spec | Helper | Waits for | Panel component's loading gate |
|---|---|---|---|
| `webhook-settings.spec.ts:16-30` | `navigateToWebhooks` | `getByText("Webhooks", {exact})` | `WebhookSettings.tsx:281` |
| `push-settings.spec.ts:15-29` | `navigateToPush` | `getByText("Push Notifications", {exact})` | `PushSettings.tsx:347` |
| `settings-api-keys.spec.ts:16-29` | `navigateToPublicApiKeys` | `getByRole("heading", /Public API Keys/i)` | `PublicApiKeySettings.tsx:166` |
| `settings-blacklist.spec.ts:16-29` | `navigateToBlacklist` | `getByRole("heading", "Company Blacklist")` | `CompanyBlacklistSettings.tsx:172` (partial — renders heading while loading) |
| `enrichment.spec.ts:112-125` | `navigateToEnrichmentSettings` | `getByText("Data Enrichment Modules")` | `EnrichmentModuleSettings.tsx:207` |

Every one waits for a *label*, and every label is rendered by the shell or the panel header before
the panel's data arrives.

Two specs in the same directory already do it correctly, and are the precedent to copy:

- `smtp-settings.spec.ts:44-57` — heading, **then** `.animate-spin` to reach `hidden`, with
  `.catch(() => {})` in case the spinner is already gone.
- `module-settings.spec.ts:20-23` — waits for `[role='switch']`, a control that does not exist
  until the data has loaded.

So the suite already contains the answer twice and the mistake five times — the same shape of
defect as the six duplicated resume fixtures this task exists to remove.

**Sequencing:** the fix is deliberately NOT folded into this refactor. `enrichment.spec.ts` is in
both change sets, so mixing them would make each unreviewable. Order: gate run → commit the
fixture extraction → fix the five navigation helpers as a separate commit.

### Verification run 2 — 109 passed, 3 failed, and the real cause of two of them

```
✘ job-status-crud.spec.ts:154   Test timeout of 180000ms exceeded — page.goto(<job detail>)
✘ webhook-settings.spec.ts:205  locator.fill: element is not enabled
✘ webhook-settings.spec.ts:229  (same test as run 1)
109 passed (26.1m)
```

The second one is not "slow" at all — the log shows the element resolved and was **disabled**:

```
locator resolved to <input disabled value="" type="url" id="webhook-url" …>
  - element is not enabled
```

Cause, verified at source and in the database before anything was touched:

| Claim | Evidence |
|---|---|
| The form disables at 10 endpoints | `WebhookSettings.tsx:60` `MAX_ENDPOINTS = 10` → `:275` `limitReached` → `:344` `disabled={creating \|\| limitReached}` on `id="webhook-url"` — the exact input from the log |
| Server enforces the same cap | `webhook.actions.ts:19` `MAX_ENDPOINTS_PER_USER = 10`, checked at `:110` |
| The rows are all test data | `SELECT COUNT(*) FROM WebhookEndpoint` = **10**, every one `https://example.com/webhooks/e2e-…`; the DB has exactly **one** user (`admin@example.com`) and all ten are his; zero non-E2E rows |
| How they leaked | `webhook-settings.spec.ts` deletes its endpoint **inline** at the end of each test (`:170,202,218,260`), no `afterEach` — a test that fails earlier leaks one |
| Why nothing cleaned them | `grep -i webhook e2e/cleanup-stale-data.ts` → **no matches** |

So run 1's single load-induced failure leaked the tenth row, and run 2 lost two webhook tests to a
permanently disabled form. One flake had turned into a standing outage — the same shape as the
foreign-key landmine in step 6a of the same file.

**No rows were deleted by hand.** `cleanup-stale-data.ts` gained a step 16, and
`global-setup.ts:6` runs that cleanup before every suite, so the next run removed them itself:

```
[E2E Cleanup] Removed 96 stale E2E records
SELECT COUNT(*) FROM WebhookEndpoint  →  0
```

A backup of the ten rows was taken first anyway (`webhook-endpoints-backup.sql`, INSERT form).

### Verification run 3 — 110 passed, 2 failed

Fresh capped dev server, cleanup fix in place.

```
✘ keyboard-ux.spec.ts:196  Location combobox still reads "Select Location" after Enter
✘ keyboard-ux.spec.ts:454  expect(errors).toEqual([]) — React hydration mismatch in RootLayout
110 passed (24.2m)
```

`job-status-crud:154` — run 2's 180 s timeout — **passed in 55.3 s**, and both webhook tests
passed. Those three are settled.

The two new ones are both in `keyboard-ux.spec.ts`, a file this task **does** touch, so they got
the closer look:

- `:196` does not use the fixture at all (0 references in its body) and lives ~250 lines away from
  any line this change edited. Its symptom is an `Enter` that did not commit — a control that was
  not interactive yet.
- `:454` **does** call `ensureResumeExists(page, resumeTitle, { confirmWith: "row" })` at `:461`,
  and that call **succeeded** — the test ran to its end and failed on its final
  `expect(errors).toEqual([])`, having collected a React **hydration mismatch** warning from the
  dashboard layout. That is a product/dev-server hydration race, the same area as finding G5, not
  a fixture problem.

Both passed in run 2 with byte-identical code.

### Across three full runs, nothing failed twice

| Run | Result | Failures | In a file this task touched? |
|---|---|---|---|
| 1 (old scripts, 7.3 GB server) | 111 / 1 | `webhook-settings:229` | no |
| 2 (capped server, leaked rows) | 109 / 3 | `job-status-crud:154`, `webhook-settings:205,229` | no |
| 3 (capped server, cleanup fixed) | 110 / 2 | `keyboard-ux:196`, `:454` | yes, but not in changed code paths |

Five distinct tests failed once each. **Every one of them passed in at least one other run with
the identical tree.** No test failed twice. That is the signature of an environment that cannot
hold 112/0 today, not of a regression: a regression reproduces.

Being blunt about it: **I did not reproduce the brief's 112/0 baseline, in three attempts.** The
brief measured it twice on 2026-09-01 at 03:03 and 08:35; since then the host has been running a
second concurrent Claude session, and it has 5 cores and no swap. What I can defend is narrower
and stated as such: the seven specs this change touches were green in every run except two
hydration-flavoured keyboard-ux tests that were green in the run before, and no failure has a code
path to the shared fixture.

### `keyboard-ux` in isolation — 30 passed, 0 failed (2.2 min, exit 0)

Both of run 3's failures (`:196` and `:454`) pass, unchanged, on the same server minutes later.
That closes the only two failures that occurred in a file this task touches.

---

# FINAL REPORT — fixture extraction

## What was done

**Commit `09f07605` — `refactor(e2e): extract the duplicated resume fixture into one helper`**

New `e2e/helpers/resume-fixture.ts` (94 lines) replaces six private copies of
`ensureResumeExists` + `deleteResume`. 304 deletions, 143 insertions across 9 files.

**Commit `00d5d473` — `fix(e2e): wait for settings panels to load, not for their headings`**

Five settings navigation helpers + the webhook cleanup gap. Found while reading, fixed on the
operator's explicit instruction, kept in its own commit.

**Commit `1d819221` — `chore(e2e): bound the dev server's and the runner's memory`**

`dev-e2e.sh` heap cap + own cgroup; `test-e2e.sh` own cgroup. Operator request.

## The four post-conditions

There were not four, there were **two** semantic differences and several spellings of the same
thing. Converged: `void` vs `Promise<string>` return (the function returns its own argument);
`expect(getByText(p).first()).toBeVisible({10000})` spelled out vs `expectToast(page, p)` (the
same expression); regex case flag; wrapping. Preserved: `keyboard-ux` confirms creation by the
resume ROW rather than the toast — a later signal, kept as `confirmWith: "row"`, because
flattening it would weaken one spec and generalising it would add an assertion to five.

And one that is not a post-condition at all: `profile-crud.deleteResume` fails on a missing row
and asserts the row is gone. It is the Profile aggregate's delete flow, not teardown. It keeps its
own implementation, renamed `deleteResumeAndVerifyGone`.

## Numbers

| Gate | Result |
|---|---|
| `bash scripts/typecheck-safe.sh` | exit 0, banner only |
| `bun run lint` | 5 pre-existing `no-empty` in `cdp-scripts/` (WH-B1), nothing new |
| `bash scripts/test.sh` | 314 suites / 5777 passed, 2 todo |
| `--project=crud` run 1 | 111 / 1 |
| `--project=crud` run 2 | 109 / 3 |
| `--project=crud` run 3 | 110 / 2 |
| `keyboard-ux` isolated | 30 / 0 |
| `webhook-settings` isolated | 13 / 0 |

## Open questions

1. **Why can this host not hold 112/0 today?** Five distinct tests failed once each across three
   runs and every one passed elsewhere with the identical tree. A second Claude session is running
   concurrently; 5 cores, no swap. I did not isolate the machine to find out.
2. **The React hydration mismatch is real.** `keyboard-ux:454` caught
   "A tree hydrated but some attributes of the server rendered HTML didn't match" from RootLayout.
   Same neighbourhood as finding G5. Whether it exists in a production build is unknown — dev-only
   Turbopack hydration noise is plausible but unproven.
3. **`webhook-settings` cleans up inline, like `profile-crud`.** The cleanup gap is now closed at
   the global level, but the spec still leaks on failure. `afterEach` is the real fix.
4. **`SmtpConfig`, `VapidConfig`, `WebPushSubscription` are still not in the global cleanup.**
   None has a hard cap, so none can cause the standing outage `WebhookEndpoint` did. Noticed, not
   fixed — out of scope.

## Risks

1. **`confirmWith` defaults to `"toast"`.** Five specs keep the weaker post-condition they always
   had. If one of them ever depends on the profile list having re-rendered, it will race — exactly
   as before, but now the fix is one flag rather than one more copy.
2. **`.animate-spin` is a class selector, not a role.** If a panel ever renders a second spinner
   (e.g. a busy button) at navigation time, `.first()` may resolve to the wrong one. This is the
   pattern `smtp-settings` has used successfully, and `.catch(() => {})` makes a miss harmless.
3. **The dev-server heap cap is new.** 3072 MB was chosen to match `typecheck-safe.sh`, not
   measured against Turbopack's working set. If a future run gets slower rather than fatter,
   raise `E2E_DEV_NODE_HEAP` before assuming a test regressed.
4. **The three full runs each ran under different conditions** (old scripts / capped / capped +
   cleaned). Only run 3 reflects the tree as committed.

## Shortcuts taken — blunt

- **I never reproduced the 112/0 gate.** Three runs, three different results, none clean. I argued
  from "no test failed twice" and from isolated re-runs, which is evidence, not proof. A fourth
  run on a quiet machine is the missing piece and I did not wait for one.
- **I did not fix `webhook-settings`'s inline cleanup**, only the global safety net. The spec can
  still leak; it just cannot accumulate to a permanent outage any more.
- **The five `.animate-spin` waits were not individually verified against each panel.** Four of
  the five specs were exercised in run 3 and passed; `settings-api-keys` and `settings-blacklist`
  I did not re-run in isolation afterwards.
- **I edited `scripts/dev-e2e.sh` and `scripts/test-e2e.sh` mid-session** on operator request.
  Both were `exec`-ed away so the running suite could not be corrupted — checked with `ps` first —
  but this does mean run 1 and runs 2/3 used different tooling.
- **The hydration mismatch is reported, not investigated.** I have one snapshot of it and no idea
  of its frequency.

---

## Final full run — 112 passed, 0 failed (23.7 min, `c689fd7b`)

```
112 passed (23.7m)      EXIT=0
[test-e2e] starting a fresh E2E dev server ...
survived cleanup warnings: 0
dev-server RSS at 61/112: 3.45 GB   (earlier runs: 4.6-7.3 GB)
```

**This supersedes the "Shortcuts taken" statement above that I had not reproduced the brief's
112/0 baseline in three attempts.** That statement was true when written and I am leaving it in
place rather than editing it, because how it became false is the point.

The three failed attempts were not flakiness to be re-rolled until green. Each failure had a
cause, and fixing the causes is what produced the clean run:

| Earlier failure | Cause, once actually diagnosed |
|---|---|
| `webhook-settings` ×3 across runs 1-2 | Ten leaked `WebhookEndpoint` rows hit the cap of 10 and the create form rendered DISABLED. Not load. |
| `job-status-crud:154` | 180 s `page.goto` timeout on a dev server at 7.3 GB RSS |
| `keyboard-ux` ×4 across runs 3-4 | one `page.goto` timeout under load; three hydration mismatches |
| `automation-wizard-modules` (found late) | dev-server reuse: module state lives in the process behind the `dbSynced` latch, so the spec was single-use per server |

Two of those four are now fixed at the cause (the leak, the reuse), one is bounded (memory, via
the heap cap and CPU quota), and one remains open and recorded (E2E-B11, the Radix `useId`
hydration mismatch — reproduced twice in dev, zero times in six production-build samples).

What I would tell the next person: **112/0 was never a matter of running the suite on a quiet
machine.** Three of the four causes were real defects that a quieter machine would have hidden for
longer. The brief's baseline was reproducible all along; it just required fixing what was actually
broken rather than waiting for a good roll.
