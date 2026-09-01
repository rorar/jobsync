# Brief: fix the 38 failing E2E tests

You are working in a dedicated git worktree, in a tmux session, on a branch that exists only for
this task. Everything below was verified on this machine today — but verify it again yourself
before acting on it. Roughly one claim in six in this repo's history turned out wrong, and every
correction came from someone reading source instead of trusting prose.

---

## STEP 0 — MANDATORY, BEFORE ANYTHING ELSE

Create `E2E-FIX-NOTES.md` in this worktree and append findings to it **as you go**, not at the
end. Earlier in this project nine agents ran; seven hit a session limit and four lost all their
work. The differentiator was whether the brief made them write to disk first. If you are cut off,
that file is the deliverable.

---

## Where you are

| | |
|---|---|
| Worktree | `/home/pascal/projekte/jobsync-e2e` |
| Branch | `fix/e2e-elysium`, branched from `e85ca27b` |
| Main worktree | `/home/pascal/projekte/jobsync` on `spec/gdpr-data-rights-person-stub` — **do not touch it** |
| tmux session | `e2e` · `0:work` `1:dev` `2:runs` `3:status` |

**A dev server is already running** in window `e2e:1`, from this worktree, on port 3737, started
with `scripts/dev-e2e.sh` (which sets `E2E_AUTH_RATE_LIMIT_BYPASS=1`). Reuse it. If you must
restart it, use window `e2e:1` and `scripts/dev-e2e.sh` — not `scripts/dev.sh`, which lacks the
E2E environment and makes the failure surface far from its cause as a hanging login.

This worktree has its **own** `prisma/dev.db`, copied so E2E writes cannot touch the main
database. `.env` is copied too and is gitignored.

`./e2e-status.sh` prints a one-shot progress summary from the run log. Cheap; it starts nothing.

---

## How to run things — HARD CONSTRAINTS

This host has 31 GB RAM and **no swap**, so exceeding a cgroup cap is a clean OOM-kill rather
than a thrash. The wrappers exist because the bare commands have taken hosts down.

| Never | Always |
|---|---|
| `npx tsc --noEmit` | `bash scripts/typecheck-safe.sh` (empty output above the banner = clean) |
| `npx jest`, `bun test` | `bash scripts/test.sh` (defaults to `--maxWorkers=1`) |
| `bun run build` | `bash scripts/build-safe.sh` |

- **Never raise a cap or a timeout** to make something fit (`TSC_MEM_MAX`, `TSC_TIMEOUT`).
- **Never run tests and a build at the same time.**
- Never re-run a verification command without having changed a file in between.
- Never background a build or typecheck with `setsid`/`nohup`/`disown`.

E2E runs need two environment variables, because this host is Ubuntu 26 and the installed
`@playwright/test` (^1.49.1) predates it — `npx playwright install chromium` fails with
*"does not support chromium on ubuntu26.04-x64"*:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
export NEXTAUTH_URL=http://localhost:3737
npx playwright test --project=crud --workers=1 --reporter=list 2>&1 | tee /tmp/e2e-run-N.log
```

Use a **new log filename per run**. And note: **Playwright clears `test-results/` at the start of
every run.** If a full run produces failures worth studying, copy that directory aside before you
run any single spec — I destroyed 38 error-context snapshots by not doing this.

A full `--project=crud` run is 112 tests and takes ~22 minutes at one worker. Run single specs
while iterating; run the full suite to confirm.

---

## What is broken, and what is already known

Two full runs, in different worktrees against different database copies, produced **identical**
results: **74 passed, 38 failed**, with the same distribution spec by spec. These are not flakes.
They reproduce.

| Spec | Failures |
|---|---|
| `keyboard-ux.spec.ts` | 15 |
| `profile-crud.spec.ts` | 8 |
| `automation-crud.spec.ts` | 5 |
| `job-detail-panels.spec.ts` | 3 |
| `automation-wizard-modules.spec.ts` | 2 |
| `staging-layout-toggle.spec.ts`, `staging-details-sheet.spec.ts`, `kanban.spec.ts`, `job-crud.spec.ts`, `enrichment.spec.ts` | 1 each |

Clustered by the actual error message:

| Cause | Count |
|---|---|
| `strict mode violation` on `getByRole('button', { name: 'Save' })` | **22** |
| `TimeoutError: page.waitForLoadState` | 9 |
| `element(s) not found` | 4 |
| `expect(locator).toBeVisible()` failed | 4 |
| `locator.fill: Element is not an <input>…`, `locator.waitFor` timeout, `expect(received).toBe()` | 1 each |

### Cluster 1 — 22 failures, root cause established

`getByRole("button", { name: "Save" })` matches **two** buttons: `Save` and `Save & Open`.
Playwright's `name` is a substring match unless `exact: true` is passed, and Playwright's own
error message names the fix: `aka getByRole('button', { name: 'Save', exact: true })`.

The second button arrived in commit **`898a5119`, 2026-04-06**, *"feat(profile): add Save & Open
button to Create Resume dialog"* (`src/components/profile/CreateResume.tsx:219`, i18n key
`profile.saveAndOpen`). That commit is on `origin/main`. So these tests have been broken for
almost five months and nobody saw it, because the suite could not be run on the old host.

**This is a test-side defect, not a product defect.** The product legitimately has two buttons;
the locator was ambiguous from the start and only worked while exactly one button happened to
match. Do not remove or rename the product button.

There are **17** occurrences of `name: "Save" }` across six spec files: `job-detail-panels`,
`profile-crud`, `automation-wizard-modules`, `automation-crud`, `question-crud`, `keyboard-ux`.
Note `question-crud` appears in that list but not in the failure list — check why before changing
it, and do not assume the answer.

**Do not blanket-replace.** For each occurrence, establish which button the test actually means.
Most will want `exact: true`; some may be better served by scoping to a dialog or form
(`page.getByRole("dialog").getByRole("button", …)`), which is more robust than exactness because
it survives the next button whose label starts with "Save". Choose per site and say why.

### Cluster 2 — 9 `waitForLoadState` timeouts

`docs/BUGS.md` (search for "E2E waitForTimeout sweep") records that a previous session replaced
65+ `waitForTimeout` calls with condition-based waits across exactly the specs that dominate this
failure list, and self-flagged the risk: *"some replacements may expose CI races — follow-up if
keyboard-ux tests go flaky post-merge."* That prediction appears to have come true.

**Do not fix these by raising timeouts.** That is explicit project policy — the same rule is
recorded for WH-B2 in `docs/BUGS.md` and as TODO-12 in
`../jobsync/docs/handoff-2026-08-30-retention.md`. Raising a timeout hides which cause is real.
Diagnose each: is the awaited condition wrong (e.g. `waitForLoadState("networkidle")` on a page
that holds a long-lived connection), or is the app genuinely slow at that point? The reference
pattern the sweep was supposed to follow is `selectOrCreateComboboxOption` — read it first.

### Clusters 3–5 — 12 remaining

Not yet diagnosed. Treat each on its own evidence. Some may be downstream of cluster 1: a test
that fails at the Save click never reaches its later assertions, so fixing cluster 1 may change
what these report. **Re-run before diagnosing them**, and re-derive the counts rather than
trusting the table above once you have changed anything.

---

## Rules for the fixes themselves

- **Never weaken a test to make it pass.** Do not delete assertions, do not add `test.skip`, do
  not raise timeouts, do not replace a specific locator with a loose one. If a test is asserting
  something that is no longer true of the product, say so and stop — that is a decision, not a
  fix.
- `e2e/CONVENTIONS.md` is the house style. Read it. It records a throw-vs-skip rule that exists
  because silent skips previously masked broken selectors.
- Prefer fixing the *class* over the *instance*. If six specs share an ambiguous locator, ask
  whether a shared helper belongs in `e2e/` rather than six edits.
- Match the surrounding code's idiom, comment density and naming.
- After changing a spec, run **that spec alone** first, then the full suite before committing.

## Verification before you commit

```bash
bash scripts/typecheck-safe.sh                 # exit 0, empty output
bash scripts/test.sh                            # 314 suites / 5777 passed / 0 failed
bun run lint                                    # 5 pre-existing no-empty errors in
                                                # src/lib/connector/arbeitsagentur-account/cdp-scripts/
                                                # are WH-B1, fixed on another branch. Nothing new.
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=... NEXTAUTH_URL=http://localhost:3737 \
  npx playwright test --project=crud --workers=1 --reporter=list
```

Baseline to beat: 74 passed / 38 failed. State the new numbers plainly, including any test you
could not fix and why.

## Commits

Conventional Commits. Subject ≤ 72 characters. The body explains **why**, not what — the diff
already says what. End every message with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

Commit in coherent batches (e.g. cluster 1 as one commit), not one commit per file and not one
giant commit. **Do not push.** Do not merge. Do not create branches.

## When you are done

Write a final section in `E2E-FIX-NOTES.md` and state, explicitly:

- Commit SHAs and the before/after test numbers.
- **Open questions** — anything you could not resolve.
- **Risks** — anything you are unsure about.
- **Shortcuts taken** — anything you skipped and why. Be blunt. In this project an agent's honest
  self-report of its own rule violations proved more useful than its deliverable.
- **Anything in this brief that was wrong** when you checked it against source. I wrote it from
  two test runs and a git archaeology pass; treat it as a hypothesis, not as ground truth.
