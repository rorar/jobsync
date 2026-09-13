# Handoff — 2026-09-13, session resume after multi-day gap

**Worktree:** `/home/pascal/projekte/jobsync-e2e` · **Branch:** `fix/e2e-elysium`
**HEAD at handoff:** `d5497bdf` · **45 commits ahead of `origin/fix/e2e-elysium`, 0 behind**
**Working tree:** clean except 3 untracked files (see §3)
**Gates, re-verified this session after the gap:** `scripts/test.sh` → **319 suites / 5905 tests (2 todo) / 0 failed, `[test.sh] EXIT=0`**

This is a continuation handoff. A prior handoff, `docs/handoff-2026-09-08-open-items.md`, covered
the state as of 2026-09-08 and is **superseded** by everything below — its open items (T1-T9,
the admin reference screen defects) are now **closed**; see §1 for the closing commits. Read this
file, not that one, for current state. That file is kept for its historical citations, not as a
task list.

---

## 1. What closed since 2026-09-08 (verified against the commit log, not memory)

Three work streams, all committed, all gate-verified. In commit order (oldest first):

### Stream A — Admin reference-screen a11y/i18n pass (commits `0121ff8a` .. `473b3a99`, 2026-09-08)
Fixed the six admin reference tabs (Companies/JobTitles/Locations/Sources/Skills/ActivityTypes):
spinner bugs, missing translations, missing empty states, keyboard-focus loss on Load More,
delete-dialog wording, and the "Load More" pagination blanking the whole list on click. Recorded
as `UI-B1` through `UI-B16` (plus `E2E-B46`) in `docs/BUGS.md`. **This is old news relative to this
handoff's purpose** — it's here only so the commit range makes sense to a fresh reader.

### Stream B — Heading hierarchy across the whole app (commits `0121ff8a` .. `d18b71b5`, 2026-09-09)
The real work of this stream, in order of discovery:

1. **Settings panels**: 39 section titles `h3`→`h2` across 18 files (`ef76db26`).
2. **Section cards**: 28 `CardTitle` instances + 4 empty-states promoted to `h2` across
   dashboard/admin/automations/developer/CRM (`c258223e`).
3. **Two detail routes had NO `h1` at all** — `/dashboard/myjobs/[id]` and
   `/dashboard/profile/resume/[id]`. Found by an independent closure-walk of every import
   reachable from each route's `page.tsx`, verified twice (once by the investigating sub-agent,
   once independently by me with a separate script) because it contradicted a written status.
   Fixed by giving each route's own `CardTitle` `as="h1"` (`dd9689a5`).
4. **Self-inflicted regression, caught and fixed same day**: promoting `JobDetails.tsx`'s "AI
   match analysis" heading to `h2` opened a NEW gap under it — `MatchDetails.tsx`'s five `h5`
   headings went from a legal one-level step to an illegal three-level skip. Resolved by moving
   `MatchDetails` to `h3`, the one level that satisfies both of its parent contexts (`d89cf820`).
5. **New permanent E2E guard**: `e2e/crud/heading-order.spec.ts` renders every real route and
   asserts no heading skips a level — this is the test that would have caught #4 automatically
   (`1ed52f4e`).
6. **`docs/BUGS.md`**: `UI-B17` (React `act()` console noise — see below) closed, heading work
   recorded, closing commit `d18b71b5`.
7. **One more self-correction** (`b7a6858a`, same day): the profile page's card ordering put a
   secondary heading before the page's own `h1`; fixed by reordering the page sections rather
   than the heading levels, since the levels were already correct — it was a DOM-order bug, not
   a heading-level bug.

**Also in this stream, unrelated to headings but committed alongside** (`a4969155`): removed a
React `act()` environment warning that was firing on ~93% of all console output during test runs,
making genuine warnings unreadable. Root-caused to a test double not wrapping a state update;
fixed at the source rather than suppressed.

### Stream C — E2E test-infrastructure debt closeout: T1-T9 + "T8" (commits `5b9c6f51` .. `d5497bdf`, 2026-09-09)

This is the stream most relevant to picking up work today. Two related but separate efforts:

**T1-T9** (from `docs/handoff-2026-09-08-open-items.md` §2.1-2.2) — all closed:
- Retired the last private copy of admin-reference deletion helpers, now shared (`5b9c6f51`).
- Raised `automation-crud`'s teardown timeout budget; deleted 3 dead UI slots found while there
  (`1eddd501`).
- Consolidated `ensureEnglishLocale`, which existed as **16 separate copy-pasted definitions**
  across spec files, into one shared helper; deleted the dead `login()` export from
  `e2e/helpers/index.ts` (`ec823595`).

**"T8" — the Job-teardown residue debt, the largest single piece of work in this stream:**

`docs/BUGS.md` / `scripts/check-e2e-residue.sh` carried `Job:E2E-B38` in `KNOWN_DEBT` — a
tolerated, unenforced leak — with a stated justification. **That justification was independently
verified and found to be already-false at the moment it was written**, in the same commit that
introduced it. The actual sequence, in the order it really happened (verified against commit
timestamps, not assumed):

1. **`92fe99aa` (13:05):** nine E2E spec files carried a comment wrongly explaining Playwright's
   hook-timeout semantics (claiming `test.setTimeout()` inside a hook inherits/extends the
   *test's* budget). It doesn't — hooks get their own timeout window. All nine comments
   corrected so nobody re-derives a wrong mental model from them. Done first because the
   Job-teardown fix below needed correct timeout headroom in its own hooks.
2. **`240abfef` (13:37) — the actual T8 fix:** Job deletion in `job-crud`, `job-detail-panels`,
   and `enrichment` specs moved from ad-hoc inline cleanup into the shared `afterEach` teardown
   hook pattern, matching what `kanban` and `job-status-crud` already did. **In this same
   commit**, `Job:E2E-B38` was removed from `KNOWN_DEBT` — the residue gate started **enforcing**
   zero Job leakage right here, not at the end of the stream.
3. **`ec41e13c` (17:20), pure docs, no code change:** `docs/BUGS.md` and the 2026-09-08 handoff
   doc updated to record T8 as closed and explain why the original justification was wrong.
4. **`5a81d456` (17:54) — filed as `E2E-B47`, found ~4.5 hours AFTER enforcement was already
   live:** a follow-up hardening pass turned up a genuinely new, previously-undetected bug:
   `ensureTableView()` (the helper that switches the Jobs page from Kanban to Table view before
   asserting on rows) could silently land in the wrong view mode and then report a job as
   "not found / already deleted" when it had never been deleted at all. Its own root cause: the
   E2E auth storage state (`e2e/.auth/user.json`) has an empty `origins: []`, so
   `getPersistedViewMode()` defaults to Kanban view on every fresh test, and the helper's
   3-second wait for the Table-view toggle would silently give up and leave the assertions
   running against the wrong DOM. Fixed by making the helper return `Promise<boolean>` (did the
   view switch actually succeed?) instead of assuming success. **Important nuance for anyone
   auditing this stream:** Job enforcement was live in the gate for several hours *before* this
   fix landed — nothing failed in the meantime because the specs happened not to trigger the
   false-negative during that window, but the false-negative was real and is now closed.
5. **`d5497bdf` (17:58):** `CLAUDE.md` updated to mark the LinguiJS scaffold
   (`src/i18n/lingui.ts` + `src/i18n/messages/*.ts`) as **intentionally staged, not dead** — per
   your explicit confirmation that the Lingui migration is planned and tracked via a GitHub
   issue. This closes the "is this dead code?" question that `bun knip` would otherwise keep
   raising.

**Net effect of Stream C:** the E2E suite's residue-detection gate is now measurably stricter
(one more model class enforced instead of tolerated), one real flakiness source was closed after
being found by deliberately stress-testing the newly-enforced gate rather than by accident, and a
wrong piece of institutional knowledge (the hook-timeout comment) was corrected across every file
that repeated it.

---

## 2. Current gate status (re-verified this session, not carried over from memory)

| Gate | Result | When verified |
|---|---|---|
| `scripts/test.sh` | **319 suites / 5905 tests (2 todo) / 0 failed**, `[test.sh] EXIT=0` | 2026-09-13, this session, after a multi-day gap (Prisma engines had gone stale and were re-fetched automatically by `env.sh`) |
| `git status` | clean except 3 untracked docs (§3) | 2026-09-13 |
| `origin/fix/e2e-elysium` | 45 commits behind local `HEAD`, 0 ahead | 2026-09-13 |

**Not re-run this session:** `scripts/typecheck-safe.sh`, `scripts/test-e2e.sh` (Playwright),
`bun knip`. All three passed as of the 2026-09-09 work; nothing has touched `src/` since then
except what's listed in §1, all of which was gate-verified at the time. Re-run before trusting
them if more time passes or before pushing/merging.

---

## 3. Open work — three uncommitted investigation documents, zero deletions applied

**Nothing is broken. Nothing is blocking. These are decisions, not defects.**

At the end of the 2026-09-09 session, three sub-agents independently investigated every file
`bun knip` flags as unused, using git archaeology (origin commit, when/why it lost its last
importer, what replaced it) rather than import-count alone — because this codebase has documented
false-positive shapes for knip (dynamic imports, ambient `.d.ts` files, framework entry points;
see `CLAUDE.md` § Dead Code Detection). **All three documents are written but uncommitted, and
zero files have actually been deleted.**

```
docs/knip-connector-facades.md       (317 lines) — untracked
docs/knip-unused-ui-primitives.md    (368 lines) — untracked
docs/knip-demo-data-and-strays.md    (445 lines) — untracked
```

### TL;DR — `docs/knip-connector-facades.md`

Two files: `src/lib/connector/data-enrichment/registry.ts` and
`src/lib/connector/reference-data/registry.ts`. Both export facade functions
(`getActiveEnrichmentModules()`, `getEnrichmentModuleByDimension()`) that **zero code calls** —
`orchestrator.ts:12` bypasses the facade and imports `moduleRegistry` directly instead. This was
already flagged as a known asymmetry in `CLAUDE.md` (the `job-discovery/` and `ai-provider/`
facades ARE consumed; these two are not). **Decision needed:** either (a) start routing new
enrichment/reference-data code through these facades as originally intended, or (b) delete both
files and the `CLAUDE.md` paragraph that promises a seam nothing uses. No code currently breaks
either way — this is purely "does the abstraction earn its keep."

### TL;DR — `docs/knip-unused-ui-primitives.md`

Four shadcn-vendored UI components, each investigated separately (git-archaeology confidence in
parens):

| File | Verdict | Why |
|---|---|---|
| `src/components/ui/avatar.tsx` (+ `@radix-ui/react-avatar` dep) | **DELETE** (high) | Vendored 2024-05-23, used by `RecentJobsCard`; last real importer replaced by `CompanyLogo` on 2026-04-06. Zero references anywhere since — no code, docs, specs, or tests. |
| `src/components/ui/pagination.tsx` | **DELETE** (high) | Vendored with its only consumer `TablePagination.tsx`; that consumer was deleted 2026-02-11 and this primitive was simply forgotten underneath it. |
| `src/components/ui/calendar2.tsx` | **DELETE** (see `docs/BUGS.md:582` — already flagged as deferred-design cruft) | |
| `src/components/ui/base-combobox.tsx` | **KEEP** (medium-high) | Referenced by ADR-038 §4 and mentioned in the CHANGELOG — this one has a design-intent trail, not just orphaned code. Do not delete without re-reading ADR-038 first. |

### TL;DR — `docs/knip-demo-data-and-strays.md`

Eight files, independently re-confirmed zero-reference (grepped every module specifier across
`src/`, `__tests__/`, `e2e/`, `scripts/`, `prisma/` — no hits outside the file itself). Five
distinct stories, not one:

| File | Story | Verdict | Confidence |
|---|---|---|---|
| `src/lib/data/activitiesData.ts` | Demo fixture; consumer switched to a real DB query in 2024-12 | **DELETE** | High |
| `src/lib/data/barChartData.ts` | Fixture orphaned when its consumer component was deleted (2026-02) and the fixture wasn't cleaned up with it | **DELETE** | High |
| `src/components/dashboard/NumberCard.tsx` | Superseded by `NumberCardToggle.tsx` in the same commit that created it (2026-01-27); **upstream (`fe8a329a`) already deleted this exact file** | **DELETE** | Very high |
| `src/components/kanban/index.ts` | Barrel file, born with zero importers — every caller imports Kanban components by direct path instead, consistent with the rest of the codebase | **DELETE the barrel only** (the 6 components inside are all live and untouched) | Very high |
| `src/hooks/useDialogPromise.ts` | Commit message says "extract" this hook from `StagingContainer.tsx`, but nothing ever actually imported it — `StagingContainer` still hand-rolls the same pattern twice, today | **DELETE**, or adopt it properly (needs a signature change either way) | High |
| `src/utils/company.ts` | Real export for exactly 1 day (2024-06-03→04), then commented out by its own author and left as a note; both things its comment references no longer exist | **DELETE** | Very high |
| `src/utils/localstorage.utils.ts` | Not replaced by a single winner — its job was redistributed to 7 call sites that each inline their own guarded localStorage access | **DELETE** | High |
| `types/index.t.ts` | Ambient global types from the original scaffold, used by `Header`/`Sidebar` for 9 days in 2024-05, then commented out; every consumer now uses local `interface XProps` instead | **DELETE** (removes the `types/` directory entirely) | Very high |

**Two files worth deciding together, not separately**, per the doc's own framing:
`utils/company.ts` + `types/index.t.ts` (same story: 100%-comment corpses, both upstream-authored,
both deliberately preserved as notes-to-self by the same author) and `kanban/index.ts` +
`useDialogPromise.ts` (same story: both born unreferenced inside a commit that shipped real
working code around them).

### What to actually do with these three documents

1. **Commit the three documents as-is first** — they are research, zero risk, and valuable even
   if nobody acts on the recommendations for weeks.
2. **Decide per cluster**, not per file in isolation — the docs group correctly:
   - Connector facades → architectural decision (route through vs. delete), not urgent.
   - UI primitives → 3 clear deletes + 1 clear keep (`base-combobox.tsx` — check ADR-038 first).
   - Demo data & strays → 8 files, all lean DELETE, two pairs to decide together.
3. If you approve deletions, this is exactly the kind of parallel, low-risk, well-scoped work
   that suits 2 sub-agents at once (per your standing constraint) — one doing the UI-primitives
   cluster, one doing demo-data-and-strays, connector-facades done separately since it's a design
   call rather than a cleanup.

---

## 4. Open work — API-based E2E teardown (discussed, NOT built)

Separate from the knip cleanup. During Stream C's `ensureTableView` bugfix, the fragility of
UI-driven test cleanup (a helper had to click through a view-mode toggle correctly just to
delete a row) prompted a question: **should E2E job cleanup go through `/api/v1/jobs/:id` DELETE
instead of clicking through the UI?**

**Status: mechanism understood, nothing implemented.**

- **What it would need:** a `PublicApiKey` seeded specifically for the test environment, used via
  the `Authorization: Bearer <key>` header that `withApiAuth()` (`src/lib/api/with-api-auth.ts`)
  already expects. No such seeding currently exists in `prisma/seed-e2e.ts` or
  `e2e/global-setup.ts`.
- **Why it's not a slam dunk:** it would *replace* the UI-driven teardown that Stream C just
  finished hardening, not merely add a fallback to it. That's a net-new test-auth code path
  purely for cleanup convenience — a real architectural tradeoff (extra credential-seeding
  surface, an API key with delete permission living in test fixtures) versus the fragility it
  removes. Given that the UI teardown is now correct (§1, Stream C item 2) and gate-enforced,
  this is **not urgent** — it would be a robustness/speed improvement, not a bugfix.
- **If picked up:** start by reading `src/lib/api/with-api-auth.ts` and
  `src/actions/publicApiKey.actions.ts` to confirm key format, then decide where a test-only key
  gets seeded and whether it should be scoped to a dedicated test user rather than the shared
  E2E fixture user.

**Recommendation: leave this alone unless E2E teardown flakiness reappears.** It was a good idea
surfaced by a bugfix, not a bug itself.

---

## 5. Everything else — no change since 2026-09-08

`docs/handoff-2026-09-08-open-items.md` §2.3 (housekeeping: `install-hooks.sh` not run,
`.next-e2e/` disk usage, understand-anything graph staleness) and §2.4 (larger deferrals — see
`CLAUDE.md` § Deferred Sprint Work) are **unchanged** — nobody touched them this session or last.
Still true:

- `scripts/install-hooks.sh` has still not been run (deliberately — see that doc for why).
- The `understand-anything` graph is stale (285 commits behind `HEAD` as of this session's start
  per the SessionStart hook). Per `CLAUDE.md`'s Feeding Rule, don't hand its content to a
  sub-agent without attaching the staleness verdict.
- `docs/BUGS.md` totals as of this handoff: **682 found / 674 fixed / 2 open** (the 2 open are
  the long-standing "accepted risk" pair, unrelated to this session's work) / 4 closed-as-decided
  / 1 closed-by-premise-disappearing / 1 reclassified.

---

## 6. Standing constraints (unchanged, repeated here because compaction is about to happen)

From this session's conversation, still in force:
- **Max 2 sub-agents concurrently.** Stop each with `TaskStop` immediately after its report (not
  kill — that leaves the TUI entry dangling).
- **Sub-agents never run tests, builds, typechecks, or dev servers.** Only the orchestrator
  (main thread) runs `scripts/test.sh`, `scripts/typecheck-safe.sh`, `scripts/test-e2e.sh`,
  `scripts/build-safe.sh`.
- **Verify every agent claim against the actual code/commit before it goes into a report or
  commit message.** This session caught agents overclaiming twice (§1 Stream B item #3 — the
  "no h1" finding was independently re-verified before trusting it; the T8 justification was
  checked against the actual commit, not taken at face value).
- **Fix incidental findings on the spot, but report each one individually** — this is how the
  `ensureTableView` bug, the 3 dead UI slots, and the 9 wrong hook-timeout comments all got fixed
  as part of larger streams rather than filed and forgotten.
- Never edit `scripts/*.sh` while it's running.
- Push only when explicitly asked — **45 commits are sitting unpushed right now, by design.**

---

## 7. One-paragraph summary if you read nothing else

Everything committed as of `d5497bdf` is done, tested, and stable (319/319 Jest suites just
re-verified green after a multi-day gap). Three streams closed since the 2026-09-08 handoff:
app-wide heading-hierarchy fixes with a new permanent E2E guard, and a full closeout of E2E
test-infrastructure debt (`T1-T9` plus the larger "Job residue" enforcement gap, which turned up
one real bug — `ensureTableView` — fixed along the way). The only genuinely open items are (1)
three fully-researched-but-uncommitted knip cleanup documents recommending ~13 file deletions
across three decision clusters, and (2) a discussed-but-unbuilt idea to move E2E job cleanup from
UI clicks to a direct API call, which is a nice-to-have, not a fix for anything currently broken.
Nothing is red, nothing is half-done, nothing needs to happen before you can safely step away or
hand this to someone else.
