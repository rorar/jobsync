# Handoff — W-H1 follow-through, retention, and the GDPR decisions
**Session:** 2026-08-25 → 2026-08-30 · **Author:** Claude (with @rorar)
**Branches:** three, all pushed to the fork, none merged.

> **Read this first if you are resuming.** Two rules earned the hard way this session, both
> non-negotiable for whoever continues:
>
> 1. **Every subagent brief must order the agent to write findings to disk BEFORE acting.**
>    Nine agents ran; seven hit a session limit at least once. Those whose briefs required a
>    disk write kept their work; the four earliest, which had no such instruction, lost
>    everything — including a full architecture review that had to be re-run.
> 2. **Verify every claim in a brief, including mine.** Roughly one claim in six turned out
>    wrong — mine and the agents'. Every correction in this session came from someone checking
>    source instead of trusting prose. See §7.

---

## 1. Branch state

| Branch | HEAD | Pushed | Contains |
|---|---|---|---|
| `feat/quick-capture-and-referral-events` | `d6f41879` | yes | orphan-prune leftovers, §8.3 items, the CI reference resolver, three doc corrections, WH-B1/B3/B4 |
| `spec/w-h1-crm-gdpr-dependency-flip` | `d2cd1ae8` | yes | the W-H1 dependency flip, ADR-041, the independent assessment, the tasklist |
| `spec/gdpr-data-rights-person-stub` | tip | yes | the stub audit, WH-B3 analysis, user-configurable retention, the last-activity clock, ADR-042 |

The third row said `669104a0` and was stale by the time this file was committed — the commit
that added it moved the branch. `6a30e6e4` records the identical failure on the previous
handoff. A HEAD SHA in prose is a hand-maintained copy of `git rev-parse`; run that instead.
Pinned measurements below keep their SHAs, because a figure attached to a SHA never rots.

Branch three descends from branch two. Branch one is independent. **Nothing is merged to `main`.**
Per `feedback_no_upstream_prs`: merge into the fork's `main` only, never a PR against `Gsync/jobsync`.

Green state at `669104a0`: **314 suites / 5767 passed / 0 fail** · `typecheck-safe` exit 0 (28 s)
· `allium check` 0 errors, 269 warnings · `check-spec-refs` 38 resolved / 0 dangling.

Re-verified at `310d6f67` on the new host (§3a): **314 suites / 5767 passed / 0 fail** in 107 s
· `typecheck-safe` exit 0 (28 s) · lint unchanged. One failure appeared on the move and was
fixed there, not worked around — see §3a.

**Lint is red on branches two and three** — 5 pre-existing `no-empty` errors in
`src/lib/connector/arbeitsagentur-account/cdp-scripts/`. Fixed on branch one (`036e6b91`), which
is not on that lineage. Not a regression; it resolves on merge.

---

## 1a. Reproducing the green state — and one trap

```bash
bash scripts/typecheck-safe.sh                      # empty output above the banner = clean
PRISMA_QUERY_ENGINE_LIBRARY=/tmp/prisma-engines/libquery_engine.so.node \
  nice -n 19 ionice -c3 env NODE_OPTIONS=--max-old-space-size=3072 bash scripts/test.sh
allium check specs/ | grep -c '"severity": "error"'  # 0
```

`/tmp/prisma-engines/` is created by `scripts/env.sh` (auto-downloads and patches the engines for
NixOS). If Jest fails with ~15 unrelated Prisma errors, that variable is missing — the failures
point nowhere near the cause.

**THE TRAP — `scripts/check-spec-refs.mjs` does not exist on the branch where the spec work
happens.** It lives on `feat/quick-capture-and-referral-events` (branch one); every spec change in
this session was made on branch three, which does not have it. Until the branches merge, run it by
extracting it first:

```bash
git show feat/quick-capture-and-referral-events:scripts/check-spec-refs.mjs > /tmp/csr.mjs
node /tmp/csr.mjs specs        # expect: 38 resolved, 0 dangling
```

Any absolute `/tmp/claude-*/…` path quoted in a subagent brief this session was a per-session
scratchpad and **is already gone**. Re-extract; do not copy those paths forward.

### Merge order

Branch one is independent; branch three descends from branch two.

1. **`feat/quick-capture-and-referral-events`** first — it carries the lint fix (`036e6b91`) and
   `check-spec-refs.mjs`. Merging it first turns branches two/three green on lint and puts the
   resolver on the branch that needs it.
2. **`spec/w-h1-crm-gdpr-dependency-flip`** — ancestor of three, so it merges cleanly or is
   subsumed.
3. **`spec/gdpr-data-rights-person-stub`** last.

After the first merge, re-run the resolver: it will then be a normal `bun run check:spec-refs`, and
CI runs it on every push to `main`/`dev`.

---

## 2. What shipped

### 2.1 W-H1 — the spec dependency flip (branch two)

`specs/crm-gdpr.allium` used to hand-copy 12 CRM entities as `external entity` stubs because
`crm.allium` did not exist when it was written. It has existed since Welle 3. The copies drifted
in four classes; the worst was a **contradiction**: the GDPR spec said retention expiry raises an
erasure request ending in `anonymized` (terminal), while `crm.allium` and the code say `archived`
(reversible). A reader consulting the GDPR spec — the natural place to look — was told the
opposite of what ships.

Now: `use "./crm.allium" as crm`, nine stubs became qualified references, three stay external,
`PersonGdprExtension` dissolved into `crm/Person`, and a `surface ConsentManagement` was added.

Full rationale: **`docs/adr/041-crm-gdpr-spec-dependency-direction.md`**.
Evidence and alternatives: `docs/w-h1-crm-gdpr-drift-inventory.md` (superseded banner, kept as a
dated snapshot — see TODO-8).

### 2.2 The tooling gap that reframed everything

**`allium check` does not resolve qualified cross-spec references.** Verified empirically:
injecting `crm/TotallyBogusEntity.nonexistent_field` yields 0 errors and zero mentions,
byte-identical to a clean run (allium 3.2.3).

So the green check everyone had been citing — including me, repeatedly — never meant what we
thought. `scripts/check-spec-refs.mjs` (branch one) now resolves them in CI, and found two real
dangling references on its first run.

**Read the header of that script before touching this area.** It records why the earlier
"the flip traded loud failure for silent failure" framing was *wrong*: stubs were **uncheckable**
(no resolvable link existed, and name-matching would be unsound — `external entity Attachment`
in `crm-gdpr.allium` deliberately does NOT correspond to `application-documents.allium`'s
`Attachment`). The flip traded *uncheckable* for *checkable-but-unchecked*, and CI closed it.
A strict improvement, not a regression needing compensation.

### 2.3 The stub mechanism survives in three more specs

W-H1 removed one stub cluster. `grep -l "external entity Person" specs/*.allium` returns four
files; the three outside W-H1's scope declare no `use` line at all:

| Spec | Verdict |
|---|---|
| `gdpr-data-rights.allium` | **FIXED** in `dcedc8b6` — dead `Person` and `Job` stubs deleted with tombstone pointers, one `use` line added for `CrmActivityLog` (the only one genuinely dereferenced), every survivor annotated `OWNER: file:line`. Warnings 285 → 269. |
| `audit-trail.allium` | **Good stub** — minimal, and documents why it deliberately mirrors no PII. Needs only a `user` vs `user_id` alignment. Lowest priority. |
| `application-documents.allium` | **OPEN — see TODO-5.** Declares `gender: String?`, which exists nowhere. |

A **third class of stub defect** surfaced in `dcedc8b6` and is worth knowing: `LogoAsset` declared
`company_id: String?` while `logo-asset-cache.allium:73` and `prisma/schema.prisma:937` both say
non-null. The nullability was **invented so that `CleanOrphanedLogoAssetFiles` could write
`la.company_id = null` as its guard**. Correcting the stub leaves that guard unsatisfiable — the
rule could never have fired — and the code does something else entirely
(`retention-cron.ts:218-222` scans *files* with no row). Not stale drift, not a smuggled
requirement: a stub **weakened to make a rule expressible**. Neither `allium check` nor
`check-spec-refs.mjs` catches it. Filed as an open question in `gdpr-data-rights.allium`.

### 2.4 Retention: erase on expiry, with an off switch (branch three)

Two commits: `72f4138f` (the feature) and `669104a0` (the clock).

**The defect.** `ExpireAutoCreatedPersons` flipped a Person to `archived` and stopped. `archived`
restricts nothing — such contacts are still listed, searched, exported and un-archived in one
click. Worse, `crm-cron.ts` wrote the person's full name into a `CrmActivityLog` row **in the same
transaction**, `happenedAt` defaulting to `now`, starting a fresh 1095-day clock. **Expiry
lengthened the identifier's life by up to three years.**

**Now.** Expiry erases via `anonymizePersonCascade`, the name-write is **deleted** (not scrubbed —
the PII-free audit row comes from the `ContactDeleted` → `contact_deleted` projection at
`src/lib/events/consumers/crm-activity-logger.ts:226-238`), the `select` no longer reads names, and
the guard widened from `status: "active"` to `status: { not: "anonymized" }` so manually-archived
records cannot escape.

**Settings** (`PrivacySettings`, `src/models/userSettings.model.ts`) — toggle plus a period of
180/365/730/1095 days, in the existing **privacy** section, actions in
`src/actions/privacy.actions.ts` (**not** `userSettings.actions.ts`). No migration: `UserSettings`
is a per-user JSON blob (`prisma/schema.prisma:109`). i18n: 11 keys × 4 locales, German informal
`du` to match the existing 46/0 split.

**"Off" does not mean "forever."** `retentionExpiresAt` is still written, still advanced, still
displayed; only the unattended erasure stops. If "off" deleted the policy, the Art. 5(2) argument
("the system does not enforce its own declared retention policy") collapses into "there is no
policy", which is worse — Art. 5(1)(e) applies regardless. **Default is ON.**

**The structural change.** `anonymizePerson` opened with `getCurrentUser()`, and a cron has no
session. Body extracted to `src/lib/crm/anonymize-person.ts` (`server-only`, takes `userId`);
`anonymizePerson` stays a thin auth wrapper. Precedent: `src/lib/account/execute-deletion.ts`,
which `crm-cron.ts` already imported. **Gotcha found by the agent:** the cascade ends with
`writeDataAuditLog({ actorId, actorEmail })` and a cron has no `user.email`, so the helper takes an
explicit actor descriptor.

**The last-activity clock** (`669104a0`) is wired at 8 sites by a *principle*, not a list — the
clock advances when a deliberate act by the authenticated user creates a new durable association
with that Person, or refreshes the record. `updatePerson`, `reactivatePerson`, `addJobContact`,
`createCrmNote`, `createCrmTask`, `scheduleInterview`, `addPersonConnection` (both endpoints),
`recordInsiderTip`/`recordNetworkTip`. Safety: every touch runs after its write, never in a consent
guard's path; best-effort `try/catch`; `where` carries `userId` (ADR-015) **and**
`dataSource: "auto_created"`; `updateMany` so a non-match cannot throw.

**Not on the candidate list, added deliberately:** `reactivatePerson`. The cron guards only on
`status != anonymized`, so the clock keeps running while archived — reactivating a Person one day
before their deadline would erase them the next, contradicting the intent just expressed. Live bug.

**`mergePersons` rejected** as a touch site and filed as an open question: the correct operation is
`max(winner.deadline, loser.deadline)`, not `now + days` — touching would let de-duplication
*extend* retention.

**No `Person.lastActivityAt` column.** `retentionExpiresAt` already encodes it losslessly
(`lastActivity == retentionExpiresAt - days`) and `rebaseCrmRetention` depends on that identity.
A column is redundant derived state — a second owner, therefore a drift mechanism, at 8
double-write sites, for no new fact.

**This feature is forward-looking and the code says so.** Nothing writes `retentionExpiresAt` or
`dataSource: "auto_created"` in production (`src/actions/person.actions.ts:170` hardcodes
`"manual"`), so the sweep matches zero rows on any live install. That is exactly why it was safe to
change now — and it is the last cheap moment.

---

## 3. Infrastructure findings — read before blaming an agent

The VM hung three times. **None of it was agent misbehaviour**, and I wrongly accused an agent of
it once (see §7).

1. **`/tmp/node-compile-cache` held 4.9 GB on a tmpfs `/`** — i.e. 4.9 GB of RAM. Deleting it:
   RAM used 11.8 GB → 5.9 GB, available 4.2 → 10.1 GB, **swap 2047 MB → 13 MB**, rootfs 77 % → 15 %.
   `typecheck-safe` went from SIGTERM-after-3m26s to **exit 0 in 28 s**. Set `NODE_COMPILE_CACHE` to
   a disk path, or this regrows into RAM. **TODO-10.**
2. **`jobsync-dashboard.service`** — a Vite dev server in a crash-restart loop
   (`ERR_MODULE_NOT_FOUND: Cannot find package 'vite'`), burning **95 % of a core continuously**.
   Stopped; returns on next boot if enabled. **TODO-11.**
3. **`CLAUDE.md` said "8 GB no-swap VM"** in two places. It is **16 GB, 4 cores, 4 GB swap**
   (corrected in `aba8aa31`). This matters: with swap present a process can thrash *before* hitting
   its cgroup cap, so `typecheck-safe`'s 4 G and `build-safe`'s 7 G give a weaker guarantee than
   they read. **Concurrency is the thing to watch, not per-process size.**

**Diagnostic pattern worth reusing:** these failures were `SIGTERM (143)`, not OOM-kill (137), with
`sys ≈ real` and `user ≈ 0`. That profile means the process is in the kernel paging, not computing.
**Raising memory or timeout caps cannot fix it and makes it worse.**

---

---

## 3a. The host changed — what in §3 still applies

On 2026-08-31 the project moved from **zeldris (NixOS)** to **elysium (Ubuntu 26.04.1 LTS)**, an
LXC container on an Unraid kernel. Verified, not assumed: 6 cores, 31 GB RAM, **no swap**, `/` on
ZFS at 4 % used, `/tmp` still tmpfs (16 G). `systemd-run --user --scope` works, so the cgroup
wrappers are intact. Toolchain complete (bun 1.4.0, node 22.23.2, allium 3.2.3).

What this does to §3:

- **§3.1 (`/tmp/node-compile-cache` on a tmpfs `/`) is half obsolete.** `/` is no longer tmpfs, so
  the rootfs-pressure half is gone. `/tmp` still is, so **TODO-10 stands** — a compile cache there
  is still RAM.
- **§3.2 (`jobsync-dashboard.service`) is moot** on this host; it was a zeldris unit.
- **§3.3 is now wrong in a third way, and has been retired rather than corrected.** Three hosts,
  three different figures, and the doc was wrong after two of the three moves — on two branches
  simultaneously at one point. `19cc6fe3` removes the numbers from `CLAUDE.md` and five script
  headers and names the command that answers the question instead. Same reasoning as §7's closing
  paragraph: do not correct a hand-maintained copy, remove it.
- **The §3 diagnostic pattern is retired with the swap.** `SIGTERM (143)` with `sys ≈ real` and
  `user ≈ 0` meant swap thrash. With no swap there is no such path: over-cap now means a clean
  OOM-kill inside the scope. The wrappers' documented promise holds literally for the first time —
  not because anyone fixed them, but because the host underneath changed.

`node_modules` did not survive the move. `bun install --frozen-lockfile` then
`bunx prisma generate`; the latter works **natively** here, no `scripts/env.sh` override needed —
the `/tmp/prisma-engines/` patchelf path is a NixOS workaround (`19cc6fe3` marks it conditional).

**One real failure surfaced on the move and was fixed at the source** (`310d6f67`):
`__tests__/weekend-service.spec.ts` W-1.1 died on `Property 'getWeekInfo' does not exist`. Not a
flake and not the environment misbehaving — TC39 moved the Intl Locale Info proposal from getters
(`locale.weekInfo`) to methods (`locale.getWeekInfo()`), both shapes ship, and this Node/V8 has the
getter. `getWeekendDays` probed only the method, so the primary path was **silently unreachable**
and every lookup fell through to the bundled CLDR table while the file went on promising
"auto-updates with CLDR". The test noticed for the wrong reason (its spy target was absent, not
"production took the fallback"). Both shapes are now probed; ICU 78.2 and cldr-core 48.2.0 were
checked to agree on DE/FI/IR/SA/AF/IN/US/IL/BD/NP first, so no assertion changed value.

---

## 4. Decisions still open — @rorar only

Criterion @rorar set for all of these: *"most flexible and long-lasting BUT completely GDPR
compliant."* That criterion may **invert** a pragmatic reading; it did once already (§4.1).

### 4.1 Timeline-activity retention — ownership settled, policy open
**Ownership needs no judgement**: `gdpr-data-rights.allium`'s own Scope S4 explicitly lists
`CrmActivityLog`, and `crm-gdpr.allium` excludes system-wide retention. So `crm-gdpr`'s
`ExpireOldTimelineActivities` is trespassing → delete it, express the hand-off with Allium's
`deferred`, drop the duplicated `timeline_retention` config (Allium `patterns.md` Pattern 8:
reference the owner's config, don't copy).

**Policy is the real question.** `crm-gdpr` anonymises in place; `gdpr-data-rights.allium:404` and
`retention-cron.ts:203` hard-delete. Decisive fact: `CrmActivityLog` has **three** PII carriers
(`targetPersonId`, `details`, `linkedRecordName`) and the anonymise rule nulls only the first,
while `crm/AnonymizePerson` scrubs all three. **Anonymise-as-specified is worse than deleting.**
Any anonymise answer must scrub all three.

### 4.2 Art. 15 export completeness
**13 of 27 Prisma `Person` scalar columns are unexported** — six `address*`, `avatarUrl`,
`createdBySource`/`createdByName`, `updatedBySource`/`updatedByName`, `updatedAt`, `userId`.
Earlier statements of "omits address and avatar_url" understated it **twice**.

`createdByName`/`updatedByName` are a case nobody raised: Art. 15(1)(g) entitles a subject whose
data was not collected from them to information about its source.

**Do not settle this by auditing the list** — two careful reviews each named two of thirteen. The
durable fix is a test asserting every scalar column on Prisma `Person` is either exported or in a
documented exclusion set (note: a naive grep that drops lines containing `[]` misses the four
JSON columns `emails`/`phones`/`companies`/`socialProfiles` and yields 23 instead of 27 — that
miscount was made twice while writing this handoff), scoped at **field** level over models already in
`src/lib/export/collect-user-data.ts`. The model list *has* been maintained (Welle 5 added Referral
and PersonConnection); columns added to an existing model (ROADMAP 1.21's `addressCountryCode`) are
invisible to whoever edits the export. Home: `__tests__/collect-user-data-audit.spec.ts`.

### 4.3 WH-B3 — recommendation made, not yet fully implemented
`docs/wh-b3-retention-analysis.md` recommends **(a)+(e)**, and `72f4138f` + `669104a0` implement
most of it. Its compliance argument is the least contestable one available and is *not* the one I
had been making: **the system fails to enforce its own declared retention policy** — Art. 5(2)
accountability before Art. 5(1)(e) storage limitation. That holds regardless of the household
exemption, which is unavailable anyway since `crm-gdpr.allium:23` declares Art. 6(1)(f).

**A correction that matters historically:** W-H1 deleted `ExpireAutoCreatedContacts`, which said
expiry raises an erasure request. That was the *lawful* position, deleted on sound spec-hygiene
grounds — a normative question settled by a hygiene criterion. WH-B3 was the bill. The repair was
correctly **not** to restore the duplicate (that recreates the two-owner defect) but to strengthen
the sole owner in `crm.allium`.

### 4.4 Converted-referral dead end
`converted` is terminal (`src/models/insideTrack.model.ts:82`, no outgoing edges). A referral whose
Job was deleted shows *"The job application it created has since been deleted"*
(`src/i18n/dictionaries/insideTrack.ts:113`) with **no route back** — `commitReferralToApply` is
blocked at `src/actions/referral.actions.ts:295` (`isValidReferralTransition(status, "converted")`)
and `reviveReferral` at `:269-270` (`transitionReferral(id, "open")`, blocked by the same table). Mostly a
product question W-D2 Decision C never asked. Decide whether the state is recoverable or
terminal-by-design, and say so in the UI either way.

---

## 5. TODOs

Ordered by value. Sequencing constraint noted where it exists.

| # | Task | Where | Notes |
|---|---|---|---|
| ~~**1**~~ | ~~**ADR for the retention change**~~ | **DONE** — `docs/adr/042-crm-retention-erasure-and-last-activity-clock.md` | Written 2026-08-31. Records four decisions (erase-not-archive on expiry; "off" suspends the erasure, not the policy; the clock advances on a principle with 8 wired sites and its rejections; no `Person.lastActivityAt` column) plus the session-free cascade extraction. Correction found while writing it: `669104a0`’s body cites `crm.allium:851-854` for the "second owner" wording — the real references are `:891` (the phrase) and `:1963` (the column rejection quoting it). Also: `docs/BUGS.md` has no WH-B3 entry on this branch; it exists only on `feat/quick-capture-and-referral-events`. |
| **2** | Timeline retention (§4.1) | `crm-gdpr.allium`, `gdpr-data-rights.allium` | @rorar decision |
| **3** | Art. 15 completeness (§4.2) | `collect-user-data.ts`, `__tests__/collect-user-data-audit.spec.ts` | @rorar decision; build the field-level guard, don't audit the list |
| **4** | **Settings are invisible to Allium** | `crm.allium:1965` | Two live gates unspec'd: `ExpireAutoCreatedPersons` is skipped entirely when `crm_retention_enabled` is false, and the period is a per-user 180/365/730/1095 rather than `config.auto_created_retention`. Both live only in `@guidance`. `cooling_off_days` is equally unspec'd — **a pattern, not a one-off.** Decide: model `UserSettings` as an Allium entity rules may read, or declare user configuration out of scope once, centrally. |
| **5** | `application-documents.allium` `gender` stub | that spec, `:67-68`, `:115`, `:403`, `:541` | `gender` exists in no spec, no `schema.prisma`, no model — yet a salutation feature is built on it. Not drift: a **requirement smuggled into a stub**. Benign until ROADMAP 4.2 starts. Decide whether `Person` gains the field (with its GDPR weight) or the feature derives formality without it. **Do not resolve by deleting the stub field** — the feature depends on it. |
| **6** | Converted-referral dead end (§4.4) | `insideTrack.model.ts:82` | @rorar decision |
| **7** | Pre-expiry notice | not started | Deliberately deferred. **Carries a trap:** a `Notification` row persists 30 days, so a notice fired 14 days before expiry leaves a **named residue ~16 days after erasure** unless it uses the late-binding pattern with `personId` in `titleParams`. `ReminderTriggered(reason: "retention_expired")` is kept and documented at `src/lib/events/event-types.ts:272` as reserved for exactly this. Shipping it half-right is worse than not shipping it. |
| **8** | Drift inventory: keep or fold | `docs/w-h1-crm-gdpr-drift-inventory.md` | Two defensible views. `rev-arch`: fold §1/§1b/§5/§7 into ADR-041 and delete the rest, since §2/§3/§4 are restated inline in the specs' tombstones — two copies of a finding is the failure mode W-H1 exists to end. `wh1-final`: keep as a dated snapshot, marked superseded (what it did). ADR-041 already cites it, so the duplication is live. |
| **9** | E2E for retention settings | `e2e/` | CLAUDE.md wants ≥1 per feature. Not run — the VM could not take a Playwright pass concurrently. Low risk (a shadcn Switch+Select in an existing section) but the gap is real. |
| **10** | `NODE_COMPILE_CACHE` off tmpfs | env / devenv | §3.1. Regrows into RAM otherwise. **Still open on elysium** — `/` is no longer tmpfs but `/tmp` is (16 G), so the cache is still RAM. See §3a. |
| **11** | ~~`jobsync-dashboard.service`~~ | — | **Moot.** It was a zeldris unit; the host is gone. See §3a. |
| **14** | No ADR index anywhere | `docs/adr/`, `CLAUDE.md:542` | Found while writing ADR-042. `CLAUDE.md` lists only the five security ADRs 015–019; 033, 037, 040, 041 and 042 appear in no index at all, so an ADR is discoverable only by knowing it exists. Deliberately not created — an index is a new hand-maintained copy of a directory listing, which is the failure mode §7 names. Decide: generate it from the directory, or drop the idea and rely on `ls docs/adr/`. |
| **12** | WH-B2 flake | `__tests__/TasksPageClient.spec.tsx:524` | Exceeds 5000 ms under full-suite load, passes 16/16 in isolation. **Do not fix by raising the timeout** — that masks which cause is real (genuine `TasksContainer` slowness, evidenced by many `not wrapped in act(...)` warnings from its `useEffect` fetch chain, vs. resource starvation). Note TODO-10 changes what "starvation" means. Passed on the last two full runs. |
| **13** | `session/s5a-resume-verification` | that branch | One unpushed commit from 2026-04-05 adding a resource guard to `scripts/sessions/run-session.sh`. **That script is referenced by nothing** — the whole directory is April-era and unreferenced. `bun knip` would flag it. Decide whether `scripts/sessions/` should exist at all. |

---

## 6. Cross-references

**Specs → docs**
- `crm.allium` `ExpireAutoCreatedPersons` → `docs/wh-b3-retention-analysis.md` (why it erases)
- `crm.allium:1961`, `:1963` → `docs/fix-1-clock-notes.md` (activity set; no-column decision — both marked RESOLVED, kept as the record of rejected alternatives)
- `crm.allium:1965` → TODO-4
- `crm-gdpr.allium` tombstones → `docs/adr/041-…` and `docs/w-h1-crm-gdpr-drift-inventory.md`
- `gdpr-data-rights.allium` `OWNER:` annotations → each names its real declaration; trust but re-verify after any rename

**Docs → docs**
- `docs/TASKLIST-2026-08-26.md` — the tasklist this handoff supersedes. Items 1, 2, 5, 7, 10 done.
- `docs/wh1-independent-assessment.md` — where the "loud vs silent" framing was overturned and the three surviving stubs were found
- `docs/retention-settings-plan.md` — D1–D8 design decisions, the four-locale warning text, what was deliberately left
- `docs/fix-1-clock-notes.md` — the activity principle, the rejections, and an honest self-logged record of three resource-rule violations
- `docs/BUGS.md` — WH-B1 (fixed), WH-B2 (open, TODO-12), WH-B3 (open, escalated then latency-qualified), WH-B4 (fixed)

**ADRs**
- ADR-015 ownership scoping · ADR-019 `server-only` / runtime-erased unions · ADR-037 consent withdrawal (amended by `e952a488`) · ADR-040 DB-backed integration tests (bullet corrected — see §7) · **ADR-041** the dependency direction

**Memory** (`~/.claude/projects/-home-pascal/memory/`)
- `project_jobsync_open_gdpr_decisions.md` — §4 here, in shorter form
- `feedback_test_build_resources.md`, `feedback_verify_index_against_code.md`, `feedback_allium_via_tend.md`

---

## 7. Meta — what went wrong, so it is not repeated

**Seven of nine agents hit a session limit at least once; four lost all work.** The differentiator was whether the brief ordered
them to write to disk first. It is not optional; put it as the first line of every brief.

**`allium:tend` agents CAN run `python3`, `grep`, `sed`, `git`.** I told two of them they could
not. One replied that this misapprehension *"is plausibly what killed the earlier runs' value: an
agent told it cannot verify will reason from the brief instead of from the bytes."* Probably cost
two runs.

**I corrected a claim and introduced a false one three times.** WH-B4 (the cascade list claimed
tags cascade; they don't — `Tag` is many-to-many), ADR-040 (I wrote that an open-risk bullet was
"wrong when written"; git says the risk was real and my own later commit closed it), and the
cascade list *again* (omitted `Interview`). Every one was caught by re-verifying the *replacement*.
**Correcting a statement is not the same as verifying the correction.**

**I escalated WH-B3 in the present tense without checking reachability.** Nothing writes
`retentionExpiresAt` in production, so the defect is latent. That is precisely the live-exposure
check the orphan-prune work applied to `CrmNote` two sessions earlier, and I did not repeat it.

**I accused an agent of tanking the host. It had followed the rules.** It never ran bare
`tsc`/`jest`; the cause was §3.1. It did commit three real violations (re-running a passing
command, raising `TSC_MEM_MAX` above free memory — which defeats the exact guard the rule protects —
and detaching a process with `setsid nohup & disown`), and it logged all three itself unprompted.
**Check the machine before blaming the agent.**

**The finding that recurs.** Not one of these drifts came from a wrong *value*. Every one came from
a **hand-maintained copy** — the stubs, the duplicated config, the duplicated invariant, the API
doc, the ADR bullet, the export allow-list. The fix is to make the copy impossible or make
divergence loud, never to correct the copy. `scripts/check-spec-refs.mjs` is that lesson in CI
form; TODO-3's field-level guard is the same lesson for the export.
