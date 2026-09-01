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

