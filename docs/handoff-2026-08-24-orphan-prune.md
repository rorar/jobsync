# Handoff — CRM orphan-note prune (W-D2 … W-D7) + full review

**Date:** 2026-08-21 → 2026-08-24
**Branch:** `feat/quick-capture-and-referral-events` — **everything is pushed** (`origin` = fork
`rorar/jobsync`; upstream untouched).
**HEAD at handoff:** `ce63e947`
**Working tree:** clean except pre-existing, unrelated files (see §9).

Written so this can be picked up cold. Every claim below was verified at the cited line during the
session; where something was *not* verified, it says so.

---

## 1. What this work was

It started as a spec↔code reconciliation (`allium:weed` findings W-D2/W-D3) and turned into a bug
hunt with a full review. Two things came out of it that matter more than the individual fixes:

1. **The first version of the fix was worse than the bug it fixed**, and shipped to the remote branch
   before review caught it.
2. **The repo had no test that touched a database.** Three of the defects lived exclusively in
   database behaviour, so 5,700 passing tests could not see them.

### The domain problem

`CrmNoteTarget` / `CrmTaskTarget` are polymorphic join rows (`prisma/schema.prisma:1177-1231`).
Their three target FKs are `onDelete: Cascade`, so deleting a Person, Company or Job removes the join
rows. A **note** whose only target was that entity then survives with zero targets — unreachable,
because every note read filters by target — while still holding its free-text body. On the GDPR
erasure path that body is free text *about the person being erased*.

`CreateNote` requires `targets.count > 0` (`specs/crm.allium:913`) and creation is atomic (nested
`targets: { create: [...] }`), so a zero-target note is unreachable by any legal action — it is
residue, and it is pruned.

**A task is not residue** and must never be pruned — see §3, OP-B1.

---

## 2. Commits (chronological, all pushed)

| Commit | What |
|---|---|
| `81ad0940` | **W-D3 v1** — orphan prune, notes *and* tasks, per-user sweep. **Contained OP-B1, OP-B5, OP-B6, OP-B7.** |
| `740ae4dc` | **W-D2** — removed the tautological `ConvertedReferralHasJob` invariant; guarantee moved to `TipReifiesToJob` prose |
| `d7126096` | UI — converted referral whose Job was deleted now explains the missing link (`insideTrack.workspace.convertedJobDeleted`, 4 locales) |
| `d3242c86` | Docs — ROADMAP undo guardrail corrected, W-D3 recorded |
| `d20892f2` | **OP-B1 fix** — stop pruning tasks; `withOrphanedCrmPrune` wrapper owns the last position |
| `741c904e` | **OP-B7 fix** — two-phase collect-then-prune, scoped to the deleted entity |
| `645cb45f` | **W-D6** — `invariant NoteHasAtLeastOneTarget` in `crm.allium` |
| `b08e5645` | **W-D4 + W-D5 + ghost rows** — erasure scrub, `person.anonymize` audit action, `NO_LIVE_TARGET` |
| `f51bbf29` | **W-D7** — `@@index([userId, id])` on CrmNote + CrmTask, `PRAGMA optimize` |
| `fffbab60` | **First database-backed test** — 7 cases, real SQLite |
| `217319c9` | BUGS.md session entry; W-G3 spec reconciled |
| `485c307e` | **OP-B8** — ADR-015 scoping on four lookup delete guards |
| `47713c49` | **ADR-040** — the database-backed test tier |
| `ce63e947` | Blind-spot fixes — `getCrmNotes` requires a target; CI skip hardening; corrections to the record |

---

## 3. Findings — complete, with disposition

IDs: `W-*` = weed board (`docs/weed-findings-2026-08-17.md`), `OP-*` = BUGS.md
(§ Session 2026-08-21/23), `§*` = blind-spot pass.

| ID | Sev | Finding | Status |
|---|---|---|---|
| **OP-B1** | HIGH | Prune hard-deleted **visible, non-terminal `CrmTask`s**. The premise "unreachable on every timeline" is true for notes, false for tasks: `CrmTasksPageClient.tsx:101` calls `getCrmTasks()` **unfiltered**, the board renders the zero-target case at `:214`, and `crm-cron.ts:240` selects on status+dueDate alone. It also bypassed `rule DeleteTask` (`crm.allium:987`, terminal-only) — **re-opening the guard W-A1 had just closed**, via a second path. | ✅ `d20892f2` |
| **OP-B7** | HIGH | Prune was a **per-user sweep**, not a cascade — deleting job A reaped a note orphaned weeks earlier by job B, and swallowed evidence of any other defect. | ✅ `741c904e` |
| **OP-B3 / W-D4** | HIGH | Free text about an erased person survived on multi-target records **and is emitted by the Art. 15 export**: `src/lib/export/collect-user-data.ts:346` reads `crmNote.findMany({ where: { userId } })` with **no target filter**, selecting `title` and `body`. | ✅ `b08e5645` — scrub, not delete |
| **OP-B4 / W-D5** | HIGH | `anonymizePerson` (`person.actions.ts:541-688`) wrote **no audit entry at all**, while `job.delete` is fully attributed. Art. 5(2) accountability gap. | ✅ `b08e5645` |
| **OP-B6 / W-D7** | HIGH | `id IN (…) AND userId = ?` abandons the primary key at **≥3 candidates** and scans the user's whole table (correlated `NOT EXISTS` once per row owned), inside the write transaction. Root cause: no `sqlite_stat1`. | ✅ `f51bbf29` |
| **OP-B5** | MED | Legacy **all-null ghost join rows** (FKs were `ON DELETE SET NULL` in migrations `20260510092100`/`20260512221118` before `20260512224224`) made `targets: { none: {} }` false and spared the note. | ✅ `b08e5645` — `NO_LIVE_TARGET` |
| **OP-B2** | MED | The original orphan bug (notes orphaned on delete). | ✅ `81ad0940` + `741c904e` |
| **OP-B8** | MED | Four lookup delete guards counted **across all users** (7 call sites): `company`, `jobtitle`, `jobLocation`, `jobSource` actions. Another user's resume/job could block a delete. | ✅ `485c307e` |
| **W-D2** | MED-HI | `ConvertedReferralHasJob` residue predicate was a **tautology** (`target_job` is *defined* as `Job with source_referral = this`; `sourceReferralId` is `@unique`). A construct the checker cannot falsify reads as a live guard. | ✅ `740ae4dc` — invariant removed, prose on `TipReifiesToJob` |
| **W-D6** | MED | No construct in `crm.allium` described the prune — which is how the task bug got past `allium check`. | ✅ `645cb45f` |
| **W-G3** | MED | `forwarded_to` settable at creation, never after (`referral.actions.ts:87` is the only writer). Spec promised "filled in later". | ✅ prose reconciled `217319c9`; feature stays an `open question` (`inside-track.allium:817`) |
| **§1.1** | MED | The prune's safety rests on "every note read is filtered" — enforced by nothing, and two tests pinned the unfiltered branch as supported. | ✅ `ce63e947` |
| **§6.1** | MED | Integration test **skipped silently** without `sqlite3` — in CI that is a green run with the tier never executed. | ✅ `ce63e947` — throws when `process.env.CI` |
| **§3** | MED→LOW | No backfill migration for pre-existing orphans. **Moot**: zero notes exist (see §5). | Accepted |
| **arch M1** | MED | Cross-aggregate write: Job/Company/Person repositories write to a CRM aggregate. | **Accepted** — rationale now in the module header (`orphan-targets.ts`), because `.full-review/` is gitignored |
| **perf F4/F6** | MED/LOW | Candidate list over-collected; collect read index-driven but not covering. | **Accepted** — bounded by notes-per-entity |
| **§2** | LOW | A Company delete nulls `Referral.targetCompanyId` (`SetNull`); `ConvertTip` requires it and nothing can set it afterwards → tip permanently unconvertible. UI *does* explain it, but only `sr-only`. | Recorded as `open question` in `inside-track.allium` |
| **§7 / arch L1,L2** | LOW | Module name; **no `import "server-only"`** on `orphan-targets.ts` unlike sibling modules. | L2 **open** |
| **W-D5 residue** | LOW | The prune's own count is not reported anywhere. | Open, low value now that the erasure is audited |
| **W-F2** | — | Aspirational, not a bug (the suppression path has no producer). | Unchanged |

Weed board tally: **39 findings, 38 resolved, 0 open, 1 aspirational.**
BUGS.md tally: **607 found, 606 fixed, 2 open (accepted risk).**

---

## 4. Code map

### The module

`src/lib/crm/orphan-targets.ts` — read its header first, it carries the reasoning.

| Export | Purpose |
|---|---|
| `collectOrphanCandidateNoteIds(db, userId, where)` | Call **BEFORE** the delete. Adds `note: { userId }` **after** the caller's `where`, so a caller cannot override ownership. |
| `withOrphanedCrmPrune(db, userId, candidateNoteIds, ops)` | Returns `[...ops, prune]`. The helper **owns the last position** — a `PrismaPromise` is lazy, so a mispositioned or dropped op is a *silent no-op*, not an error. Variadic tuple type preserves caller destructuring. |
| `pruneOrphanedCrmNotesByIds(db, userId, ids)` | For callers not building a transaction array (`mock.actions`). |
| `NO_LIVE_TARGET` (private) | `none: { OR: [three FKs not null] }` — not `none: {}`, because of ghost rows. |

### The five delete paths

| Path | File |
|---|---|
| `deleteJobById` | `src/actions/job.actions.ts` |
| `DELETE /api/v1/jobs/:id` | `src/app/api/v1/jobs/[id]/route.ts` |
| `deleteCompanyById` | `src/actions/company.actions.ts` |
| `anonymizePerson` (GDPR) | `src/actions/person.actions.ts` |
| `clearMockProfileDataAction` | `src/actions/mock.actions.ts` |

`mergePersons` is **not** affected — it dedupes and transfers targets to the winner
(`person.actions.ts` ≈ 726-843) before deleting the loser. Verified twice, independently.

### Tests

- `__tests__/crm-orphan-prune.integration.spec.ts` — **the important one.** Real SQLite; schema built
  by replaying `prisma/migrations/*/migration.sql` in filename order (~0.75 s). 7 cases. The
  load-bearing one puts the prune **first** instead of last and asserts the note survives — a claim
  about SQLite, not about our own code, which a mocked `$transaction` cannot falsify.
- `__tests__/crm-orphan-prune.spec.ts` — unit tests for the helpers.
- Per-call-site assertions in `job.actions.spec.ts`, `api-v1-jobs.spec.ts`, `company.actions.spec.ts`,
  `person.actions.spec.ts`, `mock.actions.spec.ts`, `job-audit.spec.ts`.

### Specs touched

- `specs/crm.allium` — `invariant NoteHasAtLeastOneTarget` (with the *no Task counterpart* rationale)
- `specs/inside-track.allium` — `ConvertedReferralHasJob` removed; `TipReifiesToJob` guidance; two
  `open question`s (W-G3 sibling / target_company)
- `specs/audit-trail.allium` — `person.anonymize` in `enum AuditAction`, `rule AuditPersonAnonymise`,
  `DataMinimisation` widened

### Migration

`prisma/migrations/20260823210341_add_crm_userid_id_indexes/` — two `CREATE INDEX`, additive.

---

## 5. Live-exposure qualifier — read before citing any of this

`CrmNote` has **no creation surface and never has had one**: `createCrmNote` has **zero callers** in
`src/`, and `prisma/dev.db` holds `CrmNote = 0`, `CrmNoteTarget = 0`.

So every note-side finding (OP-B2, OP-B3, OP-B5, OP-B7, CrmNote half of OP-B6) describes behaviour
over rows that **cannot currently exist**. The fixes are a go-forward guarantee, not remediation of
live loss.

**OP-B1 and OP-B4 were genuinely live** — tasks are creatable and visible, and the erasure wrote no
audit row regardless of notes.

This also means the *next* person here is whoever builds the notes UI, and §1.1 exists precisely for
them: the moment an unfiltered `getCrmNotes()` appears, the prune flips from "reaps residue" to
"deletes visible data". `getCrmNotes` now requires exactly one target, by type **and** by a runtime
guard (ADR-019 — the union is erased at runtime).

---

## 6. Two corrections to the record — both mine

1. **"The guards leaked the cross-tenant count back to the caller" is false.** `handleError`
   (`src/lib/utils.ts:60-90`) returns `{ success: false, message: <the caller's translation key> }`
   and never returns `error.message`. The interpolated count reached `console.error` on the server
   only. Removing it was still right (log hygiene; the strings were raw English, not i18n keys), but
   it was never a client-visible disclosure. I repeated the security audit's wording without checking
   the error path.
2. **The present-tense framing of OP-B3 overstated the exposure** — see §5.

Both corrections are in `docs/BUGS.md` and in the commit messages, not only here.

---

## 7. Verification — commands that actually work

```bash
# Typecheck — NEVER bare `npx tsc` (CLAUDE.md); empty output = clean
bash scripts/typecheck-safe.sh

# Full suite. Outside the devenv shell PRISMA_QUERY_ENGINE_LIBRARY must be set,
# or ~15 unrelated-looking component suites fail with
# "Prisma Client could not locate the Query Engine".
bash scripts/setup-prisma-engines.sh        # once, if /tmp/prisma-engines is gone
PRISMA_QUERY_ENGINE_LIBRARY=/tmp/prisma-engines/libquery_engine.so.node \
  nice -n 19 ionice -c3 env NODE_OPTIONS=--max-old-space-size=3072 bash scripts/test.sh

allium check specs/       # expect 0 errors
allium analyse specs/inside-track.allium   # 2 pre-existing unreachable_trigger findings, unchanged
```

**Last green state at `ce63e947`:** 311 suites / 5,711 passed + 2 todo / 0 fail (~195 s) ·
`typecheck-safe` 0 · eslint clean · `allium check specs/` 0.

`ProfilePreferencesCard.spec.tsx` failed once in a full run and passed alone and in every later run —
**flake**, not a regression.

---

## 8. Open items

### 8.1 W-H1 — the one real decision left (needs @rorar)

**Question as originally posed:** `crm-gdpr.allium` declares no surfaces, so `withdrawConsent` and
`reinstateConsent` (called from `PersonDetailClient.tsx:140,150`) exist at no declared boundary.

**The answer is not the two options I first proposed.** `crm-gdpr.allium`'s own header says:

> "Dependencies: CRM entities from future crm.allium … Once crm.allium exists, replace external
> entities with: `use "./crm.allium" as crm`"

`crm.allium` has existed since Welle 3. The migration never happened, and I assumed it was blocked by
a cycle (`crm.allium:21` imports `crm-gdpr`). **The cycle is not real:** that import has *zero*
qualified references (`gdpr/…`) — as do all four of `crm.allium`'s other imports. Every cross-spec
link in that file is a prose comment. The `use` line is decorative and can be dropped.

**Evidence that the stub approach has already failed** (a stub is a copy, and copies drift):

| `external entity Person` (crm-gdpr:35-42) | real `Person` (crm.allium) |
|---|---|
| `name: String?` | `name: FullName` |
| `emails: List<String>` | `emails: List<TypedEmail>` |
| `job_title: String?` | **gone** → `headline` (Welle 3, Kette B) |
| `city: String?` | **gone** → `address: Address?` |
| — | missing: `user_id`, `status`, `processing_basis`, `retention_expires_at`, … |

And it is not cosmetic: `crm-gdpr.allium:262` and `:431` build the **Art. 15 DSAR payload** from
`person.job_title` and `person.city` — fields that no longer exist. The code moved on
(`collect-user-data.ts` exports `headline`, `companies`, `socialProfiles`); only the spec is stale,
**because the stub decoupled them**. The missing `user_id` in the stub is also the mechanical cause
of W-H1: no ownership field → no ownership predicate → no surface.

**Recommended path (my recommendation, not yet decided):**

1. Drop the unused `use "./crm-gdpr.allium" as gdpr` from `crm.allium`.
2. In `crm-gdpr.allium`: `use "./crm.allium" as crm`, delete the 12 `external entity` stubs,
   reference `crm/Person`.
3. Dissolve `PersonGdprExtension` into `Person` — those fields already live on Person in
   `crm.allium` **and** in Prisma. The two-entity split exists only in this one spec.
4. `crm-gdpr` then has a real actor + ownership predicate and can declare its own consent surface.
   **W-H1 closes as a by-product.**

**Cost, honestly:** 661 lines, 14 rules, 8 invariants, 12 stubs. Step 2 will surface every rule
written against the stale shape — that is the value, but it is its own session, and it should run
through `allium:tend`. **Do not hang it on this branch**, which is thematically closed.
Start with a drift inventory before rewriting anything.

### 8.2 `/understand` graph refresh

Not done. Due at Welle end per the standing rule, and overdue — much code changed. Four
`.understand-anything/*.json` files were already modified-uncommitted when this session started (not
from this work). Check `bash scripts/understand-staleness-check.sh` first.

### 8.3 Smaller open items

- `orphan-targets.ts` lacks `import "server-only"` (sibling modules have it). Adding it needs the unit
  test to mock `server-only`.
- The prune's count is not reported anywhere.
- ADR-040 records an open end: the database-backed tier is **not wired into a documented CI step**, so
  a runner without `sqlite3` would skip it — the `process.env.CI` throw only fires if `CI` is set.
- No E2E test for the converted-banner fallback (`d7126096`).
- **`docs/architecture/public-api-v1.md:500-510` documents the wrong DELETE contract** (pre-existing,
  not from this work): it shows `200` with a JSON body `{ success: true, data: { deleted: true } }`.
  The route returns `noContentResponse()` — `204`, no body — and the tests pin that
  (`api-v1-jobs.spec.ts:979,994`). Anyone implementing against the doc waits for a body that never
  arrives. The same section says "delete a job and all its associated notes (cascading)", which refers
  to `Note` (job notes); the CrmNote prune is not mentioned. One-line fix plus a sentence.

### 8.4 API-level note for later — the guard has a door the type system does not watch

`getCrmNotes` requires a target by type **and** by a runtime guard, which is what keeps the prune safe
(see §5). That protects **server actions only**.

API v1 routes deliberately bypass server actions and query Prisma directly — CLAUDE.md: *"Phase 1 uses
direct Prisma queries (not server actions) because `getCurrentUser()` depends on NextAuth session."*
So a future CrmNote endpoint could read notes with no target filter, and nothing would stop it: not the
type, not a test, not `allium check`. Same class as blind-spot §1.1, through a different door.

**Current state is clean** — verified: only four v1 routes exist, all jobs-scoped, and none touches
`CrmNote` / `CrmTask` / `Person`. `/api/v1/jobs/[id]/notes` uses `prisma.note` (job notes), a different
model. `DELETE /api/v1/jobs/:id` is the only deleting route and the prune is wired into it
(`route.ts:126,131`), with the 204 response shape unchanged.

The risk resolves itself once the `AsyncLocalStorage` bridge announced in CLAUDE.md (API Phase 2) routes
API handlers through the server actions. **Until then: any new API route that reads `CrmNote` must
apply a target filter explicitly.**
- `.full-review/` is **gitignored** — `01a-quality.md`, `01b-architecture.md`, `02a-security.md`,
  `02b-performance.md`, `05-final-report-wd3-orphan-prune.md`, `06-blindspot.md` are **local only**
  and will not survive a fresh clone. Their substance is in this handout, BUGS.md and the weed board.

---

## 9. Working tree — not from this work, deliberately untouched

`docs/handoff-2026-08-18.md` (modified), `docs/handoff-2026-08-19.md`,
`docs/superpowers/plans/*` (3), `docs/superpowers/specs/*` (1),
`docs/twenty-crm-implementation-patterns.md`, `.understand-anything/*.json` (4).

---

## 10. Process notes worth keeping

- **`allium check` passing ≠ correct.** W-D2's residue predicate passed cleanly and was a tautology.
- **A precedent can fail to transfer.** I reused the `TipReifiesToJob` prose argument to justify
  leaving the prune unspecified. The architecture reviewer showed the two differ: that obligation
  compares two moments in time and is inexpressible; "a note has at least one target" is a
  single-moment, falsifiable predicate and belongs in an invariant.
- **A "product decision" can be a compliance defect in disguise.** W-D4 was parked as a DPO call until
  the audit supplied the missing fact (the export has no target filter), which removed the judgement.
- **Mocked tests can encode the same assumption as the code.** The ordering assertion checked an
  operation's *position in an array* and called that "ordering verified".
- **A diff-scoped review has a structural blind spot.** Three reviewers looked at the diff; only the
  blind-spot pass asked whether any notes can exist at all (§5) and whether `handleError` actually
  returns the message (§6).
- **Resource discipline (CLAUDE.md):** always the `scripts/*` wrappers. A bare `npx tsc` in this
  session had to be killed.
