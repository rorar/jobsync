# User-Configurable CRM Data Retention — Implementation Plan

**Branch:** `spec/gdpr-data-rights-person-stub` (do NOT switch, do NOT commit)
**Author:** retention-settings agent, session 2026-08-26
**Status:** IN PROGRESS — verification phase

## Request (verbatim, @rorar)

> "I'd like to have an option in the settings to enable/disable data retention PLUS an
> option how long the data should be retained; Warn users that depending on their country
> and chosen settings, corresponding laws might apply."

## Two halves

1. **Settings half** — enable/disable + duration picker + legal warning, in
   `PrivacySecuritySettings.tsx`, stored on the `UserSettings` JSON blob.
2. **Behaviour half** — spec'd by `docs/wh-b3-retention-analysis.md` recommendation (a)+(e):
   erase on expiry (not archive), clock from last activity (not creation).

## Verification log (claims from brief -> checked against code)

_(filled in below as I verify; brief warns several claims come from earlier agents and
this session has repeatedly caught briefs being wrong)_

### Verified TRUE

| Claim | Verdict |
|---|---|
| `crm-cron.ts:51-98` `expireAutoCreatedPersons` archives + writes `linkedRecordName` in the same `$transaction` | **TRUE.** `:55` `status: "active"`, `:58` `select {id,userId,firstName,lastName}`, `:73-81` the `crmActivityLog.create` with `linkedRecordName: [firstName,lastName].join(" ")`, `activityType: "reminder_triggered"`. |
| `retention-cron.ts` never touches Person | **TRUE.** `grep -c "person" src/lib/scheduler/retention-cron.ts` → 0. |
| Nothing writes `Person.retentionExpiresAt` / `dataSource: "auto_created"` in production | **TRUE** (see grep in §Verification below). `person.actions.ts` hardcodes `dataSource: "manual"`. |
| `event-types.ts:246` + `event-schemas.ts:246` hold the `ContactDeleted` reason enum, coupled by `satisfies` at `:247` | **TRUE — exact line numbers.** |
| `contact_deleted` projection (`crm-activity-logger.ts:226-238`) is PII-free | **TRUE.** `targetPersonId: null`, `linkedRecordName: null`, `details: {reason}` only. |
| `execute-deletion.ts` is the precedent, already imported at `crm-cron.ts:25` | **TRUE.** Header documents the exact ADR-019 rationale. |
| `PrivacySettings` at `userSettings.model.ts:62-70`, `coolingOffDays: 0\|7\|14\|30` at `:69`, `defaultPrivacySettings` at `:96-100`, `UserSettingsData.privacy?` at `:79` | **TRUE — exact.** |
| `UserSettings.settings String @default("{}")` — no migration needed | **TRUE** (`prisma/schema.prisma`). |
| `PrivacySecuritySettings` rendered at `settings/page.tsx:75` under `"privacy"` | **TRUE.** |
| `crm.allium` `rule ExpireAutoCreatedPersons` at `:813-832` is the sole owner | **TRUE.** |

### Verified FALSE / imprecise — corrections

| Brief said | Reality |
|---|---|
| "Actions: `src/actions/userSettings.actions.ts`" | **WRONG.** Privacy settings have their own Repository: **`src/actions/privacy.actions.ts`** (`getPrivacySettings`, `updatePrivacySettings`, `getSmtpAvailable`). `userSettings.actions.ts` has no privacy exports. Retention goes in `privacy.actions.ts`. |
| "`config auto_created_retention: Duration = 730.days`, **mirrored by `src/lib/scheduler/retention-config.ts` `RETENTION_CONFIG`**" | **WRONG.** `RETENTION_CONFIG` has **no** retention entry for Person. The 730 lives in **`CRM_CONFIG.autoCreatedRetentionDays` at `src/models/person.model.ts:342`**. `RETENTION_CONFIG` holds only notification/enrichment/staged/audit/timeline/logo values. |
| "it sits beside `AccountDeletionSettings`" | **IMPRECISE.** `AccountDeletionSettings` renders under the **separate `danger-zone`** section (`page.tsx:76`). What actually sits inside `PrivacySecuritySettings` is `DataExportSettings`. Placement conclusion unchanged (retention belongs in `privacy`), reasoning corrected. |
| `crm.allium` config name | The spec's `config` block name needs checking before I edit — see §Spec below. |

### Extra facts the brief did not mention (found during verification)

- `anonymizePerson` ends with **`writeDataAuditLog({ actorId: user.id, actorEmail: user.email, action: "person.anonymize", ... })`** (`person.actions.ts:~723`). A cron has **no `user.email`**. The extracted helper therefore needs an explicit actor descriptor, not just `userId`. I pass `actorEmail?: string | null` and let the cron pass `null` — the writer already types it `string | null | undefined`.
- The activity row the cron writes uses `activityType: "reminder_triggered"`, i.e. it is masquerading as a reminder. Deleting it also removes that mislabelling.
- `Person.is_retention_expired` derived field already exists at `crm.allium:290` and is unused.

---

## Design decisions (decided 2026-08-26, before any edit)

### D1 — Settings shape

```ts
export interface PrivacySettings {
  auditAccountDeletion: boolean;
  emailConfirmationBeforeDeletion: boolean;
  coolingOffDays: 0 | 7 | 14 | 30;
  /** NEW — whether auto-created CRM contacts are erased automatically on expiry */
  crmRetentionEnabled: boolean;
  /** NEW — days of inactivity before an auto-created contact expires */
  crmRetentionDays: 180 | 365 | 730 | 1095;
}
```

Defaults: `crmRetentionEnabled: true`, `crmRetentionDays: 730`.

- 730 preserves `CRM_CONFIG.autoCreatedRetentionDays` exactly, so an operator who never
  opens the setting gets today's declared policy.
- The union mirrors the `coolingOffDays` precedent: constrained union + array membership
  check at the server-action boundary (ADR-019 — unions are erased at runtime).
- **There is deliberately no "unlimited" / "forever" option in the duration list.** The
  analysis §2(f) is explicit: *"Must be bounded — Art. 5(1)(e) does not permit 'never', so
  a UI offering unlimited retention re-creates option (d) as a configuration."* The ceiling
  is 1095 days = the existing `RETENTION_CONFIG.crmActivityLogRetentionDays`, so a Person is
  never retained longer than its own timeline.

### D2 — What "off" means (the question the brief asked me to confront)

**Chosen: "off" = no automatic erasure. It does NOT mean unlimited retention, and it does
NOT stop the clock.**

Concretely, with `crmRetentionEnabled: false`:

1. `expireAutoCreatedPersons` does not erase anything for that user.
2. `retentionExpiresAt` is **still written and still advanced** by the last-activity clock.
   The date stays visible on the contact detail page (`PersonDetailClient.tsx:431` already
   renders it).
3. The record therefore still carries its "should have been reviewed by" date. The system
   simply stops acting on it unattended.

**Why this shape rather than "off = never expire":**

The tension the brief names is real: the analysis grounds non-compliance in Art. 5(2) —
*the system does not enforce its own declared retention policy*. If "off" deleted the
policy, the Art. 5(2) story would collapse into "there is no policy", which is worse, not
better: Art. 5(1)(e) storage limitation applies regardless of what the software offers.

Keeping the period declared and the deadline materialised while switching off only the
*automatic act* preserves a genuine, demonstrable policy. The operator can still answer
"how long do you keep this?" and "which records are past it?" — they have chosen periodic
manual review over unattended erasure, which is a legitimate controller choice. What they
cannot do through this UI is declare "forever".

**Default is ON, deliberately.** Turning it off is opting out of a safeguard, so the safe
value must be the enforcing one. This matches `auditAccountDeletion: true` in the same
interface. Making "off" the default would weaken the posture, which the brief forbids.

### D3 — Scope: auto-created contacts only

The rule keeps its `is_auto_created` guard (`crm.allium:818`). Manual and `quick_capture`
Persons are untouched — `quick_capture` retention is a **still-open question**
(`crm.allium:1858`) and I am not resolving it. The UI must therefore say *"contacts JobSync
created automatically"*, not *"your contacts"*. Anything vaguer would be a false claim.

### D4 — Last-activity clock (analysis option (e)), and its one honest limitation

`retentionExpiresAt` stays the single materialised deadline. Two mechanisms keep it honest:

- `touchPersonRetention(userId, personId)` pushes it to `now + days` when the user
  substantively interacts with an auto-created Person. **Wired at `updatePerson` only** —
  the unambiguous "the user still cares about this record" signal. The wider candidate list
  in analysis §4.7 (notes, tasks, interviews, job contacts, referrals) is a design decision,
  not a mechanical one; adding sites later is additive and needs no rework.
- **`updatePrivacySettings` re-bases** every auto-created Person's deadline when the period
  changes. Without this the setting would be a lie: an operator shortening 730 → 180 to be
  more protective would see nothing happen for years — which is precisely the
  "does not enforce its declared policy" defect being fixed, re-created as a config.

**Limitation, recorded as an `open question` in the spec rather than hidden:** the re-base
uses `Person.updatedAt` as the last-activity proxy, because it is the only such signal that
exists without a migration. `updatedAt` also bumps on system-driven cascade writes, so the
proxy errs toward retaining *slightly longer* than a true interaction clock would. A
dedicated `lastActivityAt` column is the correct fix and needs a migration slot.

### D5 — The legal warning

Rendered as a bordered advisory inside the retention card, always visible (not a tooltip,
not behind a disclosure) — @rorar asked for a warning, and a warning nobody sees is
decoration. Text is in §"Warning text" at the end of this file. It states four things and
nothing else: (1) self-hosted ⇒ the operator is the controller; (2) local law may impose
its own minimum or maximum that overrides this setting; (3) switching automatic erasure off
transfers the duty, it does not remove it; (4) this is not legal advice.

### D6 — Behaviour half (analysis (a)+(e)) — the site list I will execute

| # | File | Change |
|---|---|---|
| B1 | **NEW** `src/lib/crm/anonymize-person.ts` | `import "server-only"`; `anonymizePersonCascade(userId, personId, opts)`. Body moved from `person.actions.ts:555-737`. |
| B2 | `src/actions/person.actions.ts` | `anonymizePerson` becomes a thin auth wrapper (`getCurrentUser` + ownership `findFirst` + already-anonymized guard → delegate). |
| B3 | `src/lib/events/event-types.ts:246` | add `"retention_expired"` to `ContactDeletedPayload.reason`. |
| B4 | `src/lib/events/event-schemas.ts:246` | same addition (compile-error-coupled by `satisfies` at `:247`). |
| B5 | `src/lib/scheduler/crm-cron.ts:51-98` | erase not archive; `:55` guard → `{not: "anonymized"}`; `:58` select → `{id,userId}`; **DELETE** the `:73-81` `linkedRecordName` write; per-user setting gate. |
| B6 | **NEW** `src/lib/crm/retention-policy.ts` | server-only leaf: `getCrmRetentionPolicy`, `computeRetentionExpiry`, `touchPersonRetention`, `rebaseCrmRetention`. |
| B7 | `specs/crm.allium` | strengthen `ExpireAutoCreatedPersons` in place (sole owner); config becomes a default, not a constant. |
| B8 | `specs/crm-gdpr.allium:588-605` | correct the W-H1 tombstone's now-inaccurate reasoning. **Do NOT re-add the rule.** |

**ADR-019:** B1 and B6 both take a raw `userId` and therefore must NOT live in, or be
re-exported from, any `"use server"` file. Precedent: `src/lib/account/execute-deletion.ts`.
**ADR-015:** preserved — every inner `where` already carries `userId`.

### D7 — Extra actor problem the brief missed

`anonymizePerson` ends with `writeDataAuditLog({ actorId: user.id, actorEmail: user.email, … })`.
A cron has no `user.email`. `anonymizePersonCascade` therefore takes
`{ reason, actorEmail?: string | null }`; the cron passes `actorEmail: null` (already an
allowed type on `DataAuditInput.actorEmail`) and `reason: "retention_expired"`.

### D8 — Feature is forward-looking, and I will say so out loud

Nothing writes `retentionExpiresAt` or `dataSource: "auto_created"` today (verified). The
retention sweep therefore matches zero rows on any live install. That is exactly why this is
safe to change now, **and** it means the setting configures a policy that takes effect when
an auto-creation writer lands (invariant `AutoCreatedHasRetention` obliges that writer to
call `computeRetentionExpiry`). I am not going to dress this up as live behaviour.

---

## Implementation log

### Done — code

| File | Change |
|---|---|
| `src/models/userSettings.model.ts` | `PrivacySettings` + `crmRetentionEnabled: boolean`, `crmRetentionDays: 180\|365\|730\|1095`. Defaults `true` / `730`. New export `ALLOWED_CRM_RETENTION_DAYS` + type `CrmRetentionDays`. |
| **NEW** `src/lib/crm/retention-policy.ts` | server-only leaf. `getCrmRetentionPolicy`, `retentionDeadline` (pure), `computeRetentionExpiry`, `touchPersonRetention`, `rebaseCrmRetention`. |
| **NEW** `src/lib/crm/anonymize-person.ts` | server-only leaf. `anonymizePersonCascade(userId, personId, person, opts)` — body moved verbatim from `person.actions.ts`, `user.id` → `userId`, `reason`/`actorEmail` parameterised. |
| `src/actions/person.actions.ts` | `anonymizePerson` → thin auth wrapper (session + ownership + terminal guard → delegate). `updatePerson` → `await touchPersonRetention(...)` after the write. |
| `src/lib/events/event-types.ts:246` | `ContactDeletedPayload.reason` += `"retention_expired"`. |
| `src/lib/events/event-schemas.ts:246` | matching `z.enum` addition (compile-error-coupled). |
| `src/lib/scheduler/crm-cron.ts` | `expireAutoCreatedPersons` rewritten: guard `{not:"anonymized"}`, select `{id,userId}`, **`linkedRecordName` write DELETED**, per-user policy gate w/ per-sweep cache, erasure via `anonymizePersonCascade`. |
| `src/actions/privacy.actions.ts` | boundary validation for both new fields; `rebaseCrmRetention` on period change. |
| `src/i18n/dictionaries/settings.ts` | 11 new keys × 4 locales = 44. |
| `src/components/settings/PrivacySecuritySettings.tsx` | retention card: switch + period select + off-notice + always-visible legal advisory. |

**Two things I did NOT copy blindly from the analysis:**

1. `rebaseCrmRetention` shifts the **stored deadline by the delta** (`old - oldDays + newDays`)
   rather than recomputing from `Person.updatedAt`. Recomputing would have been a live bug:
   the re-base write itself bumps `updatedAt`, so each visit to the settings page would walk
   the clock forward — fiddling with the setting would *extend* retention, which is the
   inverse of the point. The delta form is exact and idempotent.
2. The interview scrub inside the cascade sets `updatedByType: "user"`. On the cron path
   there is no human, so it is now
   `reason === "retention_expired" ? "system" : "user"` — otherwise the erasure would write a
   false human attribution into the record, the same class of defect as the
   `linkedRecordName` row.

### Done — tests

| File | Coverage |
|---|---|
| **NEW** `__tests__/crm-retention-policy.spec.ts` | 12 tests, **PASS**. Deadline arithmetic; policy resolution incl. the disabled path (still reports the declared period); `touchPersonRetention` scoping (ADR-015 `userId` + `dataSource: auto_created`) and its never-throw contract; `rebaseCrmRetention` delta correctness, `anonymized` exclusion, null-deadline fallback, never-throw. **Key regression test: "repeated saves do not walk the clock forward"** — 730→365→730 must land exactly back on the original deadline. |
| **NEW** `__tests__/privacy-retention-settings.spec.ts` | 21 tests, **PASS**. Round-trip through the JSON blob; **back-fill for a pre-feature settings row** (migration-free rollout correctness); ADR-019 boundary rejection of 3 650 000 / 90 / 0 / −1 / 365.5 / NaN / Infinity and of non-boolean `crmRetentionEnabled`; auth gate; re-base fires on period change and NOT on toggle change; a pre-feature row is treated as 730 when computing the delta. |
| `__tests__/crm-cron.spec.ts` | `expireAutoCreatedPersons` block rewritten: 8 tests. Erasure-not-archival; **two explicit V1b regressions** (no `crmActivityLog.create` at all; `select` contains no `firstName`/`lastName`); widened guard asserted as an exact `where`; disabled-policy short-circuit; policy resolved once per *user* not per Person; sweep continues past a per-person failure. |

### Done — specs

`allium check specs/` → **0 errors, 269 warnings** (baseline preserved exactly).
`check-spec-refs.mjs specs` → **38 qualified references resolved, 0 dangling.**

| Site | Change |
|---|---|
| `crm.allium rule ExpireAutoCreatedPersons` | Rewritten. Doc-comment now says ERASE with the Art. 5(1)(e)/5(2) reasoning. `when:` uses the previously-unused derived field (`when: person: Person.is_retention_expired`) so the condition has one expression, not two. `requires: person.status = active` → `!= anonymized` (same predicate as the AnonymizePerson trigger). `ensures:` delegates — `AnonymizePerson(system, person, reason: retention_expired)` — instead of restating the cascade. `@guidance` fully rewritten. |
| `crm.allium rule AnonymizePerson` | `ContactDeleted(… reason: anonymized)` → `reason: reason`, caller-supplied, so the audit row distinguishes user-initiated erasure from automatic expiry. |
| `crm.allium config auto_created_retention` | Annotated: 730 is now the **default**, not a constant; the bounded 180/365/730/1095 choice and the no-"unlimited" reasoning are recorded here. |
| `crm.allium invariant AutoCreatedHasRetention` | Comment above it records the last-activity clock and states that coverage is partial. |
| `crm.allium` quick_capture open question | **Left open** (as instructed), extended with one sentence noting the last-activity clock removes the sharpest edge without answering it. |
| `crm.allium` **3 NEW open questions** | (1) last-activity clock wired at ONE site only; (2) no `lastActivityAt` column, `updatedAt` proxy errs long; (3) user-configurable settings have no Allium representation at all. |
| `crm-gdpr.allium` W-H1 tombstone | Reasoning corrected. **Rule NOT re-added.** |

**The `@guidance` on `ExpireAutoCreatedPersons` explicitly says the per-user gate is prose,
not a `requires:`, and why.** I did not invent a `retention_policy_of(...)` predicate: I
tried it, `allium check` rejected it, and on checking I found **no user-configurable setting
is spec'd anywhere in this codebase** — `coolingOffDays` has no spec coverage either. Minting
a bespoke predicate form for one rule would be spec machinery with nothing to keep it honest.
That became open question (3) instead.

### Tombstone correction — the trap I aimed at

The W-H1 tombstone said the deleted rule "CONTRADICTED" `crm.allium` because it prescribed
`anonymized` while `crm.allium` said `archived`. **After this change the deleted rule's
outcome is the one that won.** Left alone, the next careful reader concludes the deletion was
wrong and re-adds the rule — recreating the two-owner defect. The correction states outright:
*W-H1 removed a second owner, not a wrong answer; two modules independently specifying one
rule is a drift mechanism whichever of them is correct at any moment.* It also flags the
now-historical paragraph describing what the code used to do.

---

## Verification summary

| Gate | Result |
|---|---|
| `bash scripts/typecheck-safe.sh` | **exit 0**, banner-only output = clean |
| `allium check specs/` | **0 errors, 269 warnings** (baseline) |
| `check-spec-refs.mjs specs` | **0 dangling** |
| `__tests__/crm-retention-policy.spec.ts` | **12/12 pass** |
| `__tests__/privacy-retention-settings.spec.ts` | **21/21 pass** |
| `__tests__/crm-cron.spec.ts` | **17/17 pass** |
| `__tests__/person.actions.spec.ts` | **48/48 pass** (unchanged — refactor rule honoured) |
| `__tests__/event-schemas.spec.ts` | **107/107 pass** |
| `__tests__/crm-activity-logger.spec.ts` | **25/25 pass** |
| settings dictionary consistency | **271 keys × 4 locales, 11 retention keys each, 0 missing / extra / empty / duplicate** |

Full suite deliberately NOT run — team lead is running it.

---

## The warning text, all four locales

Key `settings.privacyRetentionLegalTitle` / `settings.privacyRetentionLegalBody`. Always
visible in an amber-bordered advisory with a `Scale` icon — not a tooltip, not behind a
disclosure.

**EN** — *You decide this, and you answer for it*
> JobSync runs on your own machine, so you — not this software — are the controller of the contact data it holds. Depending on where you and your contacts are based, rules such as the GDPR may require you to justify how long you keep details about people who never handed them to you directly, and may impose their own minimum or maximum periods that override whatever you pick here. Switching automatic erasure off moves that duty to you; it does not remove it. This is information, not legal advice — if the answer matters, ask a lawyer in your jurisdiction.

**DE** — *Du entscheidest das — und du stehst dafür gerade*
> JobSync läuft auf deiner eigenen Maschine. Verantwortlicher für die gespeicherten Kontaktdaten bist damit du, nicht diese Software. Je nachdem, wo du und deine Kontakte ansässig sind, kann etwa die DSGVO von dir verlangen zu begründen, wie lange du Daten über Personen aufbewahrst, die sie dir nie selbst gegeben haben — und eigene Mindest- oder Höchstfristen vorgeben, die deine Auswahl hier überlagern. Die automatische Löschung abzuschalten verlagert diese Pflicht auf dich; es hebt sie nicht auf. Das ist eine Information, keine Rechtsberatung — wenn es darauf ankommt, frag eine Anwältin oder einen Anwalt in deiner Rechtsordnung.

**FR** — *C'est vous qui décidez, et vous qui en répondez*
> JobSync s'exécute sur votre propre machine : c'est donc vous, et non ce logiciel, qui êtes responsable du traitement des données de contact conservées. Selon votre lieu d'établissement et celui de vos contacts, des règles comme le RGPD peuvent exiger que vous justifiiez la durée pendant laquelle vous conservez des informations sur des personnes qui ne vous les ont jamais transmises directement, et imposer leurs propres durées minimales ou maximales qui prévalent sur votre choix ici. Désactiver l'effacement automatique vous transfère cette obligation ; cela ne la supprime pas. Ceci est une information et non un conseil juridique — si la réponse compte, consultez un avocat de votre juridiction.

**ES** — *Tú lo decides y tú respondes por ello*
> JobSync se ejecuta en tu propia máquina, así que el responsable del tratamiento de los datos de contacto que guarda eres tú, no este software. Según dónde estéis tú y tus contactos, normas como el RGPD pueden exigirte justificar cuánto tiempo conservas datos de personas que nunca te los entregaron directamente, y fijar sus propios plazos mínimos o máximos que prevalecen sobre lo que elijas aquí. Desactivar el borrado automático traslada ese deber a ti; no lo elimina. Esto es información, no asesoramiento jurídico — si la respuesta importa, consulta a un abogado de tu jurisdicción.

**Design intent:** it names the operator's actual legal role (controller), names the actual
mechanism (contact data collected indirectly, which is the harder case to justify), states
that local law can override the picked value in *either* direction, and closes the "off is a
loophole" reading. It claims no certainty about any jurisdiction and does not pretend to be
advice.

There is also a separate `settings.privacyRetentionOffNotice`, shown only when the toggle is
off, restating D2 in user words: *"Automatic erasure is off. The retention period stays in
effect as your stated policy and each contact still shows its expiry date — JobSync just
stops acting on it. Reviewing and erasing expired contacts is now your job."* (translated in
all four locales).

---

## What I deliberately left

| Left | Why |
|---|---|
| **Pre-expiry notice** (analysis §4.6) | Recommended companion, explicitly *not required for compliance*. It also carries a real trap the analysis names — a `Notification` row persists 30 days, so a notice fired 14 days before expiry leaves a named residue ~16 days *after* erasure unless it uses the late-binding pattern with `personId` in `titleParams`. That is a design decision about notification copy, and shipping it half-right is worse than not shipping it. |
| **Last-activity clock at the other 6 candidate sites** | Analysis §4.7 says explicitly *"which of these counts is a design decision, not a mechanical one"*. Wired the one unambiguous site (`updatePerson`); recorded the gap as an open question rather than guessing. **This is the most consequential thing I left — see Risks below.** |
| **`Person.lastActivityAt` column** | Needs a migration slot. Recorded as an open question. |
| **Timeline-retention ownership** (`crm-gdpr.allium:987`) | Instructed not to resolve; awaits @rorar. Untouched. |
| **Art. 15 export completeness** | Same. Untouched. |
| **quick_capture retention** (`crm.allium` open question) | Instructed to leave open. Extended with one clarifying sentence only. |
| **`ReminderTriggered(reason: retention_expired)`** | The enum member still exists in `event-types.ts` / `event-schemas.ts` and `__tests__/notification-deep-links.spec.ts` still covers it, but **nothing emits it any more**. I did not remove it because it is the natural payload for the pre-expiry notice above. The analysis warns *"do not leave both live"* — they are not both live; the emit site is gone and only the unused enum member remains. If the pre-expiry notice is rejected, this member should be retired. |
| **ADR** | An ADR is arguably warranted (the erasure-vs-archive semantics change + the session-free helper extraction). Not written: I was told not to commit, and the CLAUDE.md rule is to run the `/architecture-decision-records` skill. Flagging it as a follow-up rather than silently skipping. |
| **E2E test** | CLAUDE.md wants ≥1 E2E per feature. Not run — the lead is running the suite and the VM cannot take a Playwright pass concurrently. The settings toggle is a plain shadcn Switch+Select in an existing section; the risk is low but the gap is real. |

## Risks a reviewer should weigh

1. **The last-activity clock is wired at one site only.** An auto-created contact you work
   with through notes, tasks and interviews for two years is still erased on the anniversary
   of the last time you edited their *name*. This is the necessity test failing in the case it
   most needs to hold. It is latent today (nothing creates auto-created Persons) but it must
   be closed before an auto-creation writer lands. Open question filed.
2. **`rebaseCrmRetention` is a read-then-write loop.** Bounded by `maxPersonsPerUser` (10 000)
   and by there being zero auto-created Persons today, but it runs inside the settings save.
   If auto-creation ever produces thousands of rows, this wants to become a background job.
3. **Erasure is irreversible and now automatic.** `anonymized` is terminal. The gate is
   correct (auto-created + past deadline + policy enabled) and defaults preserve today's
   730 days, but this converts a reversible outcome into an irreversible one. That is the
   whole point of the change, and it is the thing to be sure about.

## Corrections to the brief (all verified against code, not assumed)

1. **"Actions: `src/actions/userSettings.actions.ts`"** — wrong. Privacy settings have their
   own Repository, **`src/actions/privacy.actions.ts`**. That is where the work went.
2. **"`auto_created_retention` … mirrored by `retention-config.ts` `RETENTION_CONFIG`"** —
   wrong. `RETENTION_CONFIG` has no Person retention entry at all. The 730 lives in
   **`CRM_CONFIG.autoCreatedRetentionDays`, `src/models/person.model.ts:342`**.
3. **"it sits beside `AccountDeletionSettings`"** — imprecise. `AccountDeletionSettings`
   renders under the separate `danger-zone` section. `DataExportSettings` is what sits inside
   `PrivacySecuritySettings`. Placement conclusion unchanged, reasoning corrected.

Everything else in the brief checked out, including all the exact line numbers
(`event-types.ts:246`, `event-schemas.ts:246`, `userSettings.model.ts:62-70/:69/:79/:96-100`,
`crm-cron.ts:25/:55/:58/:73-81`, `settings/page.tsx:75`, `crm-activity-logger.ts:226-238`).

## Things I found that nobody had flagged

1. **`anonymizePerson` writes `actorEmail: user.email`.** A cron has no session, so the naive
   extraction would not compile. Handled via an explicit `actorEmail?: string | null` option;
   the cron passes `null`.
2. **The interview scrub inside the cascade sets `updatedByType: "user"`.** On the cron path
   that is a *false human attribution* written into the record — the same class of defect as
   the `linkedRecordName` row this change deletes. Now
   `reason === "retention_expired" ? "system" : "user"`.
3. **The deleted activity row used `activityType: "reminder_triggered"`** — i.e. the archival
   was masquerading as a reminder in the timeline. Deleting the row also removes that
   mislabelling.
4. **A naive `rebaseCrmRetention` would have been a live bug.** Recomputing deadlines from
   `Person.updatedAt` drifts, because the re-base write *itself* bumps `updatedAt` — every
   visit to the settings page would push retention further out. Fiddling with the setting
   would *extend* retention, the inverse of the point. Implemented as an exact delta shift and
   pinned by the regression test "repeated saves do not walk the clock forward".
5. **`DebugCategory` is a closed union** and had no suitable member. Added `"crm-retention"`
   rather than mislabelling these calls `"crm-cron"` — they fire from server actions
   (`updatePerson`, `updatePrivacySettings`) as well as from the cron.
6. **The `contact_deleted` timeline renderer does not surface `reason`** (`ActivityTimeline.tsx`
   maps the type to an icon and a single label). So analysis §4.5's "check whether the renderer
   surfaces reason; if so, 4 locales" resolves to **no new crm.ts keys needed**.

---

## Complete file list

**New (5):**
- `src/lib/crm/retention-policy.ts` — server-only policy leaf
- `src/lib/crm/anonymize-person.ts` — server-only erasure cascade
- `__tests__/crm-retention-policy.spec.ts` — 12 tests
- `__tests__/privacy-retention-settings.spec.ts` — 21 tests
- `docs/retention-settings-plan.md` — this file

**Modified (11):**
- `src/models/userSettings.model.ts` — `PrivacySettings` +2 fields, defaults, `ALLOWED_CRM_RETENTION_DAYS`
- `src/actions/privacy.actions.ts` — boundary validation + re-base on period change
- `src/actions/person.actions.ts` — `anonymizePerson` → thin wrapper; `updatePerson` → clock touch
- `src/lib/scheduler/crm-cron.ts` — `expireAutoCreatedPersons` erases, widened guard, log write deleted
- `src/lib/events/event-types.ts` — `ContactDeleted.reason += "retention_expired"`
- `src/lib/events/event-schemas.ts` — matching `z.enum`
- `src/lib/debug.ts` — `DebugCategory += "crm-retention"`
- `src/components/settings/PrivacySecuritySettings.tsx` — retention card + legal advisory
- `src/i18n/dictionaries/settings.ts` — 11 keys × 4 locales
- `specs/crm.allium` — rule strengthened, config/invariant annotated, 3 open questions
- `specs/crm-gdpr.allium` — W-H1 tombstone reasoning corrected (rule NOT re-added)
- `__tests__/crm-cron.spec.ts` — expire block rewritten (8 tests)

Nothing committed. Branch `spec/gdpr-data-rights-person-stub` throughout.
