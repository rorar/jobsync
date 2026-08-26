# `gdpr-data-rights.allium` — external-entity audit and Person stub fix

**Branch:** `spec/gdpr-data-rights-person-stub`
**Date:** 2026-08-26
**Status:** IN PROGRESS — appended continuously. If this file ends mid-section, the run was cut short.
**Baseline at start:** `allium check specs/` = 0 errors / 285 warnings / 945 infos.
`check-spec-refs.mjs specs` = 37 resolved / 0 dangling. Nothing committed.

Follows §9 of `docs/wh1-independent-assessment.md`, which found three surviving
`external entity Person` stubs after W-H1. This task takes the first of them.

---

## 0. Method

The brief asks for the whole mechanism, not the instance: audit **every** `external
entity` in the file, not just `Person`. The file declares **13** of them and has
**zero** `use` lines.

The naive classification test — "does some other spec declare this name as a real
`entity`?" — is not the right test, and I want to say why before using anything
else. `external entity` is not a defect marker. In Allium it is the legitimate way
to say *"another bounded context owns this; here is the narrow projection I need."*
A spec that imports every context it touches becomes coupled to all of them. This
file spans roughly eight contexts (auth, job aggregate, CRM, profile/resume, AI
provider, notification dispatch, data enrichment, vacancy pipeline, logo assets),
so a blanket "import everything" would be a genuine architectural regression, not
a fix.

The test that actually discriminates is:

> **Is the projection FAITHFUL to the source it projects?**
> A faithful narrow projection is the mechanism working. A projection whose field
> names or types contradict the source is a hand-maintained copy that has drifted —
> the exact W-H1 failure class.

So the audit is empirical: for each of the 13, find the authoritative declaration
(if any) and diff the fields. That also answers a question worth more than this one
file — *is the `external entity` mechanism healthy corpus-wide, or is `Person` just
the instance we happened to look at?*

---

## 1. Declaration census

Every name in the file, and where the corpus declares it for real
(`grep -rn "^entity NAME {" specs/*.allium`):

| # | Stub in this file | Authoritative `entity` declaration | Also stubbed elsewhere |
|---|---|---|---|
| 1 | `User` (:23) | `auth-session.allium:84` | 19 other specs |
| 2 | `Job` (:28) | `job-aggregate.allium:57` (+ `crm-workflow.allium:90`) | many |
| 3 | `Person` (:34) | **`crm.allium:242`** | `audit-trail`, `application-documents` |
| 4 | `Resume` (:40) | `profile-resume.allium:68` | several |
| 5 | `ContactInfo` (:45) | `profile-resume.allium:100` | — |
| 6 | `AiManifest` (:54) | **none** | — |
| 7 | `Notification` (:59) | `notification-dispatch.allium:181` (+ `module-lifecycle.allium:255`) | — |
| 8 | `EnrichmentResult` (:64) | `data-enrichment.allium:188` | `logo-asset-cache` |
| 9 | `EnrichmentLog` (:69) | `data-enrichment.allium:222` | — |
| 10 | `StagedVacancy` (:74) | `vacancy-pipeline.allium:200` | `job-aggregate` |
| 11 | `AdminAuditLog` (:81) | **none** | — |
| 12 | `CrmActivityLog` (:86) | **none found under that name** — see §2 | — |
| 13 | `LogoAsset` (:91) | `logo-asset-cache.allium:65` | — |

Ten of thirteen have an authoritative home. That number is *not* the finding —
see §0 for why. The field diffs are the finding.

---

## 2. Field-level diff: every stub against its source

`✓` = faithful. `✗` = diverges.

| Stub field (`gdpr-data-rights.allium`) | Authoritative | |
|---|---|---|
| **User** (:23) | `auth-session.allium:84` | |
| `id: String` | *(source declares no `id`)* | ✗ |
| `email: String` | `email: String` | ✓ |
| **Job** (:28) | `job-aggregate.allium:57` | |
| `user: User` | *(no `user` field; ownership is `@invariant OwnershipEnforced`)* | ✗ |
| `title: String?` | `title: JobTitle` | ✗ |
| `created_at: Timestamp` | `created_at: Timestamp` | ✓ |
| **Person** (:34) | `crm.allium:242` | |
| `user: User` | `user_id: String` | ✗ |
| `name: String?` | `name: FullName` | ✗ |
| `emails: List<String>` | `emails: List<TypedEmail>` | ✗ |
| **Resume** (:40) | `profile-resume.allium:68` | |
| `title: String` | `title: String` | ✓ |
| `contact_info: ContactInfo?` | `contact_info: ContactInfo with resume = this` | ✓ — see note |
| **ContactInfo** (:45) | `profile-resume.allium:100` | |
| all six fields | identical names **and** types | ✓✓✓✓✓✓ |
| **AiManifest** (:54) | *no allium owner*; `src/lib/connector/manifest.ts:196` | |
| `module_id: String` | `module_id: AiModuleId` on `ai-provider.allium:193` etc. | ~ |
| `is_local: Boolean` | `isLocal?: boolean` (TS, optional) | ~ |
| **Notification** (:59) | `notification-dispatch.allium:181` | |
| `user: User` | `user_id: String` | ~ (encoding) |
| `created_at: Timestamp` | `created_at: Timestamp` | ✓ |
| **EnrichmentResult** (:64) | `data-enrichment.allium:188` | |
| `user: User` | `userId: String` | ~ |
| `expires_at: Timestamp` | `expiresAt: Timestamp` | ~ (naming convention) |
| **EnrichmentLog** (:69) | `data-enrichment.allium:222` | |
| `user: User` | `userId: String` | ~ |
| `created_at: Timestamp` | `createdAt: Timestamp` | ~ |
| **StagedVacancy** (:74) | `vacancy-pipeline.allium:200` | |
| `user: User` | `user_id: String` | ~ |
| `status: String` | `status: StagedVacancyStatus` (enum, 5 members) | **✗ type weakened** |
| `trashed_at: Timestamp?` | `trashed_at: Timestamp?` | ✓ |
| `updated_at: Timestamp` | `updated_at: Timestamp` | ✓ |
| **AdminAuditLog** (:81) | `audit-trail.allium:78` — **named `AuditLogEntry`** | |
| `timestamp: Timestamp` | `timestamp: Timestamp` | ✓ |
| `action: String` | `action: AuditAction` (enum) | ✗ type weakened |
| **CrmActivityLog** (:86) | `crm.allium:419` — **named `ActivityLog`** | |
| `user: User` | `user_id: String` | ~ |
| `happened_at: Timestamp` | `happened_at: Timestamp` | ✓ |
| **LogoAsset** (:91) | `logo-asset-cache.allium:65` **and** `prisma/schema.prisma:937` | |
| `user: User` | `user_id: String` | ~ |
| `company_id: String?` | `company_id: String` (**non-null**, `@@unique([userId, companyId])`) | **✗ FABRICATED** |
| `file_path: String` | `file_path: String` | ✓ |
| `created_at: Timestamp` | `created_at: Timestamp` | ✓ |

**Correction made while writing this table.** I first marked `Resume.contact_info:
ContactInfo?` as a nullability divergence, because `profile-resume.allium` declares it
with `with resume = this`, which carries no `?`. That was wrong: the `with` form declares
a *relationship*, not a cardinality, and the same entity's `@invariant
OneContactInfoPerResume` says *"Each Resume has **at most** one ContactInfo"* — at most,
therefore optionally zero. The stub's `?` is faithful. `Resume` is a clean projection.
Leaving the correction visible because "the stub looks different from the source" is
precisely the reasoning that produces false drift reports.

I mark `user: User` vs `user_id: String` as `~` (cosmetic), not `✗`. They encode the same
fact — ownership — and a domain spec is entitled to model it as a relation where the
owning spec mirrors the Prisma column. Calling that "drift" would overclaim. The corpus
is simply inconsistent about it, and picking a convention is a corpus-wide decision, not
mine. Same for `expires_at`/`expiresAt`: `data-enrichment.allium` is the odd one out in
using camelCase field names; the rest of the corpus, including this file, uses snake_case.

## 3. What the diff shows about the mechanism

**Finding 3.1 — divergence tracks non-use, with exactly two exceptions, and the
exceptions are the interesting ones.**

Of the fields that genuinely diverge, nearly all are fields the checker reports as
`allium.field.unused`: `User.id`, `Job.user`, `Job.title`, all three `Person` fields,
`AdminAuditLog.action`. Meanwhile `ContactInfo` — six fields, none of them used by any
rule — is a **perfect** copy. So "unused" alone does not cause drift.

The two divergences in fields that rules *do* dereference are:

- `StagedVacancy.status: String` — used at :375 as `sv.status = "dismissed"`
- `LogoAsset.company_id: String?` — used at :423 as `la.company_id = null`

Both are cases where the true type made the intended sentence unsayable, and the stub was
weakened until it became sayable. That is the third class the brief named — **a
requirement smuggled into a stub** — and it is a strictly worse failure than staleness,
because staleness is a copy that fell behind while smuggling is a copy that was *never*
true.

So the generalisation is sharper than "copies drift":

> A copied field diverges for one of two reasons: nobody reads it (decoration), or
> somebody needed it to say something the real model forbids (smuggling). A field that is
> both read and honest does not drift, because writing the rule forces you to look at it.

**Finding 3.2 — `LogoAsset.company_id: String?` makes rule `CleanOrphanedLogoAssetFiles`
unsatisfiable, and it models the wrong thing entirely.**

`logo-asset-cache.allium:73` declares `company_id: String` and `prisma/schema.prisma:937`
declares `companyId String` (non-null) with `@@unique([userId, companyId])`. A `LogoAsset`
row with a null `company_id` cannot exist. The rule's guard is dead.

Worse, the concept is wrong. The rule's own `@guidance` already describes the real
behaviour — *"scan `/data/logos/` filesystem for files without matching LogoAsset DB
record (reverse orphan check)"* — and `src/lib/scheduler/retention-cron.ts` implements
exactly that: `prisma.logoAsset.findMany` builds a `Set` of known `filePath`s, then
`purgeOrphanedFiles(getLogosDir(), (p) => knownPaths.has(p), graceDays, LOGO_PRUNE_LEVELS)`
deletes **files on disk that are in no DB row**. An orphan is a file, not a row. The rule
iterates `LogoAssets` — the one collection guaranteed *not* to contain orphans.

**Finding 3.3 — two entities in this file are dead: `Person` and `Job`.**

`grep -n "Person" gdpr-data-rights.allium` returns five lines: the declaration at :34 and
four **comments** (:7, :13, :104, :240). No rule, no invariant, no value field, no other
entity's field has type `Person`. `Job` is the same: the declaration at :28 and one comment
at :302. (`BuildAiPrompt(resume, job, provider)` binds untyped trigger parameters — `job`
there is a parameter name, not a reference to the entity.)

So the `Person` stub is not merely stale. **It is dead.** Importing `crm.allium` to repair
it would add a cross-context dependency in exchange for nothing. The correct repair is
deletion — see §4, where I diverge from the brief's framing on this.

**Finding 3.4 (NEW, corpus-wide) — `allium.entity.unused` false-positives on plural
collection references, which is why 3.3 stayed buried.**

The checker reports `allium.entity.unused` for eleven of this file's thirteen entities,
including `Notification`, which two rules and one invariant iterate as
`for n in Notifications:`. Isolated reproduction:

```allium
-- allium: 3
external entity Thing { company_id: String  file_path: String }
rule R {
    when: Sweep()
    ensures:
        for t in Things:
            if t.company_id = null:
                delete_file(t.file_path)
}
```

→ `allium.entity.unused ... Entity 'Thing' is declared but not referenced elsewhere`,
despite `for t in Things`. The pluralised collection form is not counted as a reference.

This matters beyond cosmetics. `Person` and `Job` **are** genuinely dead, and the checker
**did** emit `entity.unused` for both — but it emitted the same warning for nine entities
that are alive, so the true signal was indistinguishable from noise. A diagnostic with a
~82% false-positive rate in this file trains readers to ignore it. That is the same shape
as the W-H1 lesson: the information was present and unusable.

**Finding 3.5 — the checker does not verify nullability in comparisons either.** The mini
spec above compares a **non-null** `company_id` to `null` and produces no error and no
warning. So fixing the `LogoAsset` stub to non-null will *not* surface the dead guard
automatically; it has to be written down. Recorded as a second instance of the
expression-position blind spot documented in `docs/wh1-independent-assessment.md` §2.

**Finding 3.6 — two entities are the same thing under two names.**

- `AdminAuditLog` here vs `AuditLogEntry` in `audit-trail.allium:78`. That file's header
  says explicitly *"Maps to the AdminAuditLog Prisma table"*. One table, two spec names.
- `CrmActivityLog` here vs `ActivityLog` in `crm.allium:419`. Same table.

`CLAUDE.md` has a Ubiquitous Language section precisely to stop this. Neither is a *drift*
— both projections are field-faithful — but a reader grepping for one name will not find
the other, which is how the timeline-retention contradiction survived as long as it did.
Choosing the winning name is a team decision; see §5 for what I did instead.

**Finding 3.7 — the good-stub pattern already exists in this corpus.** `crm.allium:36`:

```allium
external entity User {
    -- Authenticated user from session (auth-session.allium).
    -- All CRM operations are scoped by user_id (ADR-015).
}
```

An empty body and a pointer to the owner. It **cannot** drift, because it copies nothing,
and it is greppable, because it names its source file. `audit-trail.allium:41` does the
same for `Person` and states *why* it mirrors no PII. Both are better than anything in
this file. This is the fix pattern I apply in §5.

---

## 4. Where I diverge from the brief: the Person stub should be deleted, not imported

The brief frames this as *"fix the stub"*, with `use "./crm.allium" as crm` as the
expected shape of the fix, by analogy to W-H1. I think the analogy breaks, and the
evidence is Finding 3.3: **nothing in this file references `Person`.**

W-H1's flip was justified because `crm-gdpr.allium` *worked with* `Person` constantly —
its rules read `processing_basis`, `consent_withdrawn_at`, `retention_expires_at`. A wrong
shape there was actively load-bearing. Here the entity is inert. Importing `crm.allium` to
repair three field declarations that no expression reads would buy a cross-context
dependency and pay for it with nothing. The right repair for a dead declaration is to
delete it — the same judgement W-H1 made for the drifted stubs it removed rather than
corrected.

To be explicit about the risk in my own recommendation: deleting `Person` removes the only
textual hint in this file that CRM contacts are personal data. I am mitigating that by
keeping a one-line tombstone that points at `crm.allium` and `crm-gdpr.allium`, so the
grep still lands somewhere useful. That costs one line instead of one dependency.

`Job` (:28) is the same case and gets the same treatment.

### The import that *is* worth making

There is exactly one: **`CrmActivityLog`**. Unlike `Person`, it is genuinely dereferenced
(`cal.happened_at` at :411), it is genuinely owned by `crm.allium` (as `ActivityLog`,
:419), and the corpus already has the precedent — `crm-gdpr.allium:631` writes
`for ta in crm/ActivityLogs:` today, and `check-spec-refs.mjs` resolves it (its resolver
de-pluralises: `symbol.endsWith("s") ? symbol.slice(0, -1) : null`).

So the file gets one `use` line and one qualified reference, not eight and not zero.

**Cycle check, verified rather than assumed** (the brief asked me not to take its word):
`crm.allium` imports `crm-workflow.allium`, `event-bus.allium`, `shared-entities.allium`,
`notification-dispatch.allium` (lines 27-30). Each of those four declares **zero** `use`
lines, so the closure terminates there. No spec anywhere in `specs/` imports
`gdpr-data-rights.allium` (grep for the filename returns only two prose mentions, both in
`crm-gdpr.allium` open questions). **No cycle.** The brief's reading was correct.

### What I am deliberately NOT doing with that import

Switching `PurgeOldCrmActivityLogs` to iterate `crm/ActivityLogs` puts it and
`crm-gdpr.allium`'s `ExpireOldTimelineActivities` on the *same named collection*, which
makes the contradiction between them impossible to miss. That is a clarification, and the
brief invites clarification. It is **not** a resolution: both rules survive unchanged,
neither retention period moves, no owner is named, and anonymise-vs-hard-delete is
untouched. I have not edited `crm-gdpr.allium` at all.

