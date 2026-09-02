# Handoff — E2E close-out: the fixture extraction, the leak it exposed, and the tooling that came out of it

**Session:** 2026-09-01 → 2026-09-02 · **Author:** Claude (with @rorar)
**Worktree:** `/home/pascal/projekte/jobsync-e2e` · **Branch:** `fix/e2e-elysium`
**Pushed up to `5e5d4ae8`; everything after it is local.** Run `git rev-parse HEAD` rather than
trusting a SHA written here — two previous handoffs recorded a HEAD that the committing act
itself invalidated (`6a30e6e4`, and §1 of `handoff-2026-08-30-retention.md`).

Do not `cd` into `/home/pascal/projekte/jobsync`; this is a worktree of the same repository and
the stash stack is shared.

> **Read this first if you are resuming.** One rule dominates everything below, and it is the
> only conclusion of this session I would defend without qualification:
>
> **Code is tested. Statements about code are not — so that is where the errors accumulate.**
> Three adversarial audits plus an independent Opus advisor produced 35+ findings and exactly
> **one** real code defect. Every other finding was a claim *about* code: a commit message, a
> checked-in comment, a spec citation, a threshold, a count. Two of my own corrections were
> themselves wrong in the same shape, and one of them shipped into an ADR before it was caught.

---

## 1. State

| | |
|---|---|
| E2E `--project=crud` | 110 passed / 2 failed, 23.6 min |
| Jest | 314 suites / 5 779 tests, `EXIT=0` |
| Typecheck | `EXIT=0` — and *armed*: a deliberate `TS2322` was injected and caught |
| Lint | 5 pre-existing `no-empty` in `cdp-scripts/` (WH-B1), unchanged |
| Cleanup warnings | 0 |

**The two E2E failures are contention, not defects, and this was established rather than
assumed.** `keyboard-ux.spec.ts:175` and `smtp-settings.spec.ts:237` were re-run in isolation
and passed in 2.9 s and 33.6 s. The container was measured at 2.86 of 3 available cores during
the full run. Neither test touches anything this session changed.

That distinction matters because the *previous* session made the opposite error in good faith:
it blamed machine load three times for failures that turned out to be three genuine defects. The
rule that came out of both sessions is not "load is never the cause" but **"prove which one it is
by re-running the failure alone, and record the number."**

## 2. What was found and fixed

Twenty-one findings, eighteen fixed, three open. The table with full mechanisms lives in
`docs/BUGS.md` § Session 2026-09-01/02; this section only groups them so you can judge relevance.

**The leak that started it** (E2E-B1..B4, two HIGH) — `WebhookEndpoint` rows leaked until they hit
the per-user cap of ten, at which point `WebhookSettings.tsx` renders the create form *disabled*
and every webhook test fails permanently, presenting as an application bug. `cleanup-stale-data.ts`
had no step for that model at all. `profile-crud.spec.ts` named its rows without the `E2E ` prefix
the purge filters on, so nothing had ever cleaned them.

**The global-state problem** (E2E-B4, ADR-043) — `ModuleRegistration` has no user column and no
name to prefix. Two specs deactivate a module and restore it under an `if (wasActive)` guard; a run
that dies in between leaves the next run reading `wasActive === false`, skipping the deactivation,
asserting an already-absent option is absent, passing, and skipping the restore. **A permanently
vacuous test that stays green forever.** Both `jsearch` and `google_favicon` were in that state.

**The one real code defect** (E2E-B14, HIGH) — a webhook toggle assertion satisfiable by the
*previous* action's success toast. It passed while testing nothing. `expectToast` now scopes to
Radix's `[role="region"][aria-label^="Notifications ("]` viewport, and its JSDoc records the
two-part rule a pattern must satisfy: it must match neither the neighbouring action's success
message nor any failure message the same action can produce.

**A product fix** (E2E-B18, `f56da9ff`) — `checkModuleHealth`'s upsert wrote `status` on its
`create` branch. Health observing lifecycle. See ADR-044; the finding's *original* mechanism was
wrong and is retracted in place rather than quietly edited.

## 3. Open — ranked, with what each actually needs

### 3.1 Decide E2E-B11, E2E-B12, E2E-B9

The only item where a **decision** is missing rather than work.

**E2E-B11** (React hydration mismatch) is root-caused: it comes from Next's dev-server tree shape,
provably outside application code. React 19's `useId` emits `_R_`-prefixed ids while hydrating and
`_r_` when rendering fresh on the client; the dev server's extra wrapper layers shift the tree bits
that `pushTreeId` packs, so the two prefixes disagree on a component the application never touches.

The open question is the **oracle**, not the bug. `filterCriticalErrors`
(`e2e/crud/keyboard-ux.spec.ts:90-97`, used at seven assertion sites) treats any dev-server React
warning as a product signal, so this artefact reds the suite roughly one run in three. Suppressing
it blinds the suite to a *future application-caused* mismatch, and the console message cannot
distinguish the two cases.

The principled fix is already on the roadmap — `docs/ROADMAP.md:2639`, "Production Build
(`next start`) statt Dev Server". It is blocked by a real interaction: `E2E_AUTH_RATE_LIMIT_BYPASS`
is gated on `NODE_ENV !== "production"` by design (see `CLAUDE.md` § E2E auth rate-limit bypass),
so a production build disables it and signin falls back to 5 per 15 minutes per IP. One run uses
two to three logins, so single runs pass and back-to-back runs trip. The same roadmap phase plans
`retries: 1`, which interacts with the deliberate `retries: 0` on
`automation-wizard-modules.spec.ts`.

**E2E-B12** (LOW) — `globalSetup` runs once per session in UI/watch mode, so re-runs inside one
session get no stale-data purge. Untouched; affects no path the wrapper uses.

**E2E-B9** (MEDIUM) — JSearch cannot be re-activated through the UI because it is credential-gated
(`credential.type: API_KEY, required: true`), which is why the spec's own restore could never
succeed. **This gained a new edge on 2026-09-02:** step 0b is now gated on
`E2E_ALLOW_DESTRUCTIVE=1`, which only `scripts/test-e2e.sh` sets. A hand-run of Playwright
therefore skips the module reset, and `automation-wizard-modules.spec.ts` fails its `wasActive`
precondition with no way to recover by hand. Re-run through the wrapper.

### 3.2 MOD-B1 — a real product defect, recorded but unfixed

`docs/BUGS.md:46`. Pre-existing; surfaced while auditing `f56da9ff`, not introduced by it.
`handleAuthFailure` sets the in-memory status to ERROR (`degradation.ts:89`), then wraps its own DB
write in a try/catch that logs and **continues** (`:101-103`) — it goes on to pause automations and
returns a success-shaped result while the error state lives only in memory. `deactivateModule` has
the same memory-before-DB order (`module.actions.ts:345` then `:348`) with no rollback, and
`:337-342` early-returns `success: true` when memory already says INACTIVE, so re-issuing the
deactivation writes nothing and reports success. Recovery requires activate-then-deactivate, which
nobody would guess.

Fix shape: persist before mutating memory, or roll memory back on write failure; and make the early
return distinguish "already inactive in DB" from "inactive in memory only".

It is filed as a BUGS row *and* an ADR-044 Negative deliberately — a finding recorded only inside a
Consequences section has been forgotten on purpose.

### 3.3 The unpushed block

Local commits since `5e5d4ae8` include product code (`f56da9ff`), the hook, the wrapper changes and
both ADRs. The original brief said do not push; that was lifted once, for the earlier block, on a
green run. Operator decision.

### 3.4 Small

- `E2E-EXTRACT-BRIEF.md` is untracked — commit it as the task record, or delete it.
- WH-B1: exactly 5 pre-existing `no-empty` lint errors in `cdp-scripts/`. Predate this session.
- The `.first()` calls in `webhook-settings.spec.ts` are redundant after the full-URL match, but
  removing them converts a benign duplicate into a strict-mode failure. Left deliberately.
- The two contention failures are understood, not eliminated. The untried lever is the container's
  CPU affinity: it holds 5 of 6 visible CPUs and `cpu.max` is unset, so widening the LXC affinity
  would give timing-sensitive assertions headroom without touching a single timeout.

## 4. Infrastructure this session added

**`scripts/guard-heavy-commands.sh`** — a `PreToolUse` hook, wired in the versioned
`.claude/settings.json`. Refuses bare `npx tsc|jest|playwright`, `bun test`, `bun run build|dev`
and `next build|dev`, naming the wrapper in each case; it also closes the aliases `bunx`, `bun x`,
`npm exec`, `npm x`, `pnpm exec`, `yarn`, and recurses into `sh -c`. Heredoc bodies and quoted
multi-line strings are treated as data, not commands, so `grep -n "npx tsc" …` keeps working.

**It is a guard rail, not enforcement, and the difference is deliberate.** It does not reach
`eval`, command substitution or hand-rolled absolute paths, and it fails *open* on parse errors and
harness timeouts. Anyone who wants to run the bare tool still can. Its job is to stop the honest
mistake at 2 a.m., not to win an argument with a determined caller.

**`scripts/lib-runtime-guard.sh`** — shared `guard_host_load` and `report_exit`, sourced by all four
wrappers. Two facts about it are worth more than the code:

1. **It measures cgroup v2 `cpu.stat`, never `/proc/loadavg`.** This project runs in an **LXC
   container**, where loadavg is not namespaced: it reports the *host's* load while `nproc` reports
   our affinity. The first version divided one by the other and blocked a legitimate run at "5.37
   over 3 cores" while this cgroup was using 0.05. The operator caught it with one sentence — "the
   overall load on Tower is around 20%".
2. **Thresholds must stay below 1.0** (warn 0.35, abort 0.60). Usage cannot exceed the allowance, so
   the original 1.2× abort was unreachable dead code that could never have fired.

The allowance comes from the affinity mask, not `nproc`, which is context-dependent here — it
returned 3 in one shell and 5 in another with identical affinity.

**`E2E_ALLOW_DESTRUCTIVE=1`** — set only by `scripts/test-e2e.sh`, and it gates the single unfiltered
delete in the whole cleanup file. ADR-043 originally called that delete "acceptable for a test
database", which was **a precondition stated and not implemented**: `DATABASE_URL` is
`file:./dev.db`, the same file the dev server uses, and nothing distinguished the two. There is a
second, older gate that was never documented: the whole function early-returns when the hardcoded
`admin@example.com` user is absent.

**ADR-043 carries a retraction; ADR-044 is new.** ADR-043 twice recorded a resurrection race that
does not exist. ADR-044 records the real justification for the health-monitor change: a five-month
divergence between the code and `specs/module-lifecycle.allium:765-768` — a **prose** invariant,
which is exactly why `allium check` never objected.

## 5. Traps that cost time. Do not rediscover them.

- **`cmd; echo "EXIT=$?"` and any trailing `| tail` report the wrong command's status.** This cost
  an hour: a Playwright browser install failed while the notification said "exit code 0", because
  the command ended in `tail`. Every wrapper now prints its own `[name] EXIT=<rc>` as its last
  line — **but not on the five early exits** (75 guard abort, 86 no systemd scope, 2 bad args,
  1 dev server not ready / no chromium). A run that ends without an `EXIT=` line failed *before* it
  started, and the reason is the last thing printed.
- **Exit 124 is `timeout`**, not a failure of the thing under test.
- **`pgrep`, `pkill` and `grep` match their own command line.** Use
  `ps -eo pid,cmd | awk '/pattern/ && !/awk/'`.
- **`TaskStop` is terminal.** A subagent that finishes on its own can be resumed with
  `SendMessage`; one you stopped cannot. Read the whole report *before* stopping — five of eight
  reports arrived truncated, and one unrecoverable disclosure was lost this way.
- **Agent briefs must name language-server-backed tools explicitly** (serena symbol tools, `LSP`,
  `get_diagnostics_for_file`). Two agents obeyed a brief that listed only CLI tools and still
  started `typescript-language-server` processes, which outlived them by eleven hours and flattened
  the host — the run that produced them returned 11 failures with durations like 14.9 minutes for a
  single test, numbers that measured contention and nothing else.
- **`pkill -f "next dev"` in `scripts/build-safe.sh:28-29` and `scripts/dev-e2e.sh:67` is path- and
  port-blind** and will kill a sibling worktree's dev server. Pre-existing (`b3293905`), but this
  session raised how often it fires.
- **Nothing runs in parallel on this host.** Stop every agent before a heavy run.

## 6. The failure mode, named

The advisor's phrasing is the most useful sentence produced this session:

> **traced the path far enough to look plausible, stopped before the thing that closes it.**

It is not a metaphor; it is the literal shape of four separate errors, three of them mine:

1. The original E2E-B18 finding described a resurrection through the background health check — and
   missed the `ModuleStatus.ACTIVE` guard one function down, present since `32426cca` (2026-03-29).
2. My *correction* of it narrowed the claim to a concurrent deactivation inside the probe's await
   window — and missed that every lifecycle writer's upsert asserts its own status in **both**
   branches, one step later, so the interleaving converges anyway.
3. A five-month-old Sprint 3 audit comment quoted the `update` payload of a two-branch upsert
   correctly, then generalised to "the health-monitor path". It audited one branch of two, and the
   invariant it justified was false for the other one for five months.
4. My "27 versus 25 bit" arithmetic correcting a subagent on the hydration mismatch was itself
   wrong.

The countermeasure that actually worked, every time, was mechanical: open the file and read the
next twenty lines. `git log -S` on the exact string. `sqlite3` against the database instead of
reasoning about what it probably contains — that one disproved a fabricated cause (that
`job-status-crud` needed a resume) by showing 63 of them.

## 7. Verification

```bash
bash scripts/typecheck-safe.sh          # banner + EXIT=0; it is armed
bash scripts/test.sh                    # applies its own nice/ionice/heap/cgroup — prepend nothing
./scripts/test-e2e.sh --project=crud    # ~24 min, single worker, restarts the dev server
```

Expect 110-112 passed and **zero** `survived cleanup` warnings. If a run goes red, re-run the
failing spec alone and record the duration before reaching for an explanation.

## 8. Related records

- `docs/BUGS.md` § Session 2026-09-01/02 — all 21 findings with mechanisms
- `docs/adr/043-e2e-global-state-reset-by-deletion.md` — reset by deletion, and its retraction
- `docs/adr/044-health-observation-must-not-assert-lifecycle.md` — the health/lifecycle separation
- `E2E-FIX-NOTES.md` § Extraction — the running log from the previous session
- `e2e/CONVENTIONS.md` — templates and anti-patterns; read before writing any E2E test
- `https://github.com/rorar/jobsync/issues/1` — the LinguiJS/knip work, deliberately not repeated
  here
