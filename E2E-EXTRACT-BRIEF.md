# Brief: extract the duplicated resume-fixture helpers

One refactor, no new behaviour. The suite is green right now and must stay green.

## STEP 0 — before anything else

Append to the existing `E2E-FIX-NOTES.md` under a new `## Extraction` heading, as you go, not at
the end. If you are cut off, that file is the deliverable.

## Why this task exists

The previous session fixed 38 failing E2E tests and closed with this in its own
"Shortcuts taken" section:

> I did not extract the six duplicated `ensureResumeExists` / `deleteResume` copies into a shared
> helper, even though the brief explicitly invited that and `CONVENTIONS.md` mandates sharing at
> 3+ specs. Six near-identical copies with four *different* post-conditions are exactly what let
> `898a5119` be half-repaired for five months, and it will happen again. **This is the single
> largest piece of unfinished work.**

Commit `898a5119` (2026-04-06) added a `Save & Open` button to the Create Resume dialog **and**
renamed the success toast. Six private copies of the same fixture each had to be found separately;
they were not, so the suite stayed broken for five months. The duplication is the defect. Read
`E2E-FIX-NOTES.md` first — it has the full history, and its "Where the brief was wrong" section
shows how much of a brief to distrust.

## Where you are

- Worktree `/home/pascal/projekte/jobsync-e2e`, branch `fix/e2e-elysium` (pushed, at `3cc594ef`).
- A dev server is running in tmux `e2e:1` on port 3737. Reuse it. To restart, use
  `scripts/dev-e2e.sh`, never `scripts/dev.sh`.
- Do **not** touch `/home/pascal/projekte/jobsync`.

## The work

Seven specs reference `ensureResumeExists` / `deleteResume`:

    automation-crud  automation-wizard-modules  enrichment
    job-crud  job-detail-panels  keyboard-ux  profile-crud

**Read all seven before writing anything.** The previous session recorded that the copies have
**four different post-conditions** — that is the whole difficulty. A helper that flattens those
differences will break tests; a helper with six flags is not an improvement over six copies.

Decide deliberately, and write the reasoning into the notes:

- Which differences are *incidental* (drift between copies that should converge)?
- Which are *essential* (a spec genuinely needs a different post-state)?
- Does one helper with a small, named option object cover it, or do you need two helpers with
  honest names? Both are acceptable outcomes. A third acceptable outcome is: *some* specs share
  and one keeps its own, with a comment saying why.

`profile-crud.spec.ts` is the profile aggregate itself and its Save clicks span several different
dialogs, not only CreateResume — treat it with particular care and do not assume it fits.

Home for the shared code: follow whatever `e2e/` already does for shared helpers. Look for an
existing fixtures/helpers module before creating a new one; `e2e/CONVENTIONS.md` is the house
style and it mandates sharing at 3+ specs.

## Rules

- **Behaviour must not change.** This is a refactor. No assertion added, removed or weakened, no
  `test.skip`, no timeout raised.
- Match the surrounding idiom, naming and comment density.
- If you find a genuine bug while reading, **do not fix it here** — record it in the notes and
  leave it. Mixing a refactor with a fix makes both unreviewable.

## Verification

Runs need this, because `@playwright/test` cannot install a browser on Ubuntu 26:

```bash
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=$HOME/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
npx playwright test --project=crud --workers=1 --reporter=list 2>&1 | tee /tmp/e2e-extract-N.log
```

Playwright clears `test-results/` on every start — copy it aside before drilling into a failure.
`./e2e-status.sh` gives a cheap progress read (point it at your log first).

Baseline to hold: **112 passed, 0 failed**, confirmed twice independently (2026-09-01 03:03 and
08:35, the second under load average 9). Anything less is a regression you caused.

Also required before committing:

```bash
bash scripts/typecheck-safe.sh     # exit 0, empty output above the banner
bash scripts/test.sh                # 314 suites / 5777 passed
bun run lint                        # 5 pre-existing no-empty errors in cdp-scripts/ are WH-B1
```

Never the bare tools. Never raise a cap or timeout. Never run tests and a build together.

## Finish

Conventional Commits, subject ≤ 72 chars, body explains *why*. End with:

```
Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
```

**Do not push.** Report: the commit SHA, the before/after test numbers, what you decided about the
four post-conditions and why, plus **Open questions**, **Risks**, **Shortcuts taken**, and
anything in this brief that was wrong when you checked it against source.
