# Open items — session 2026-08-17 (referral events + quick-capture provenance `tend` pass)

Everything left open by the session that specced `docs/inside-track-implementation-debt.md` §F and
the contact half of §G. Written so the next session does not have to re-derive any of it.

**Nothing in this session was committed.** All spec + doc changes are in the working tree.

---

## 0. What the session delivered (uncommitted)

| File | Change |
|---|---|
| `specs/event-bus.allium` | `referral_recorded` + `referral_status_changed` on `DomainEventType`; `ReferralRecordedPayload` + `ReferralStatusChangedPayload`; `ContactCreatedPayload.source` comment extended for `quick_capture` |
| `specs/inside-track.allium` | 9 event emissions — `ReferralRecorded` from both record rules, `ReferralStatusChanged` from all 7 status-transitioning rules; documented non-emission on the GDPR cascade |
| `specs/crm.allium` | `quick_capture` on `DataSource`; `rule QuickCapturePerson`; `surface PersonQuickCapture`; `referral_recorded` + `referral_status_changed` on `ActivityType`; `RecordReferralRecorded` + `RecordReferralStatusChange`; provenance question resolved to a DECIDED block + 2 narrower open questions |
| `docs/BUGS.md` | New session section with IT-B1..IT-B4 (found, none fixed) |
| `docs/adr/039-…-quick-capture-provenance.md` | ADR-039 — records the 5 decisions below + 6 rejected alternatives |
| `docs/weed-findings-2026-08-17.md` | 31 spec↔code divergences from the pre-commit `allium:weed` pass (none fixed, none caused by this session) |

Key architectural decision, currently justified in spec comments only (see item E-2): **events register
in `event-bus.allium`, projections live in `crm.allium`, and `inside-track.allium` never writes into
crm's read model.** `inside-track` imports `crm`, not the reverse; crm already consumes three foreign
events unqualified (`JobStatusChanged`, `VacancyPromoted`, `AutomationDegraded`) with no import.

---

## 1. Verified clean — do NOT re-check these

Each was confirmed against code this session. Re-verifying is wasted budget.

| Claim | Evidence |
|---|---|
| Referral mutation is owner-only | `referral.actions.ts` `transitionReferral` → `findFirst({ where: { id, userId: user.id } })` |
| Referral status literals match the spec | `insideTrack.model.ts:21-29` = `open engaged relayed in_review converted declined stale` |
| The stale sweep is a system cron | `crm-cron.ts:111-122` `flagStaleReferrals` |
| Retention would NOT touch `quick_capture` Persons | `crm-cron.ts:56` guards `dataSource: "auto_created"` |
| `ActorSource` in code matches the spec enum exactly | `person.model.ts:86-94` = `manual import api system workflow email calendar` |
| §F's claim that referrals emit no lifecycle events | `referral.actions.ts` imports the event bus but emits only `JobStatusChanged` (line 307) |
| Only one doc carries the §F/§G gates | grep over `docs/` + `specs/` → `docs/inside-track-implementation-debt.md` only; ROADMAP 2.20 does not reference the provenance gate |
| `getPersons` default status filter | `person.actions.ts:239` — `if (filters?.status)`, i.e. no default |

### Validation baselines (`allium check specs/`, directory mode)

| File | Before | After |
|---|---|---|
| `specs/crm.allium` | 0 errors / 5 warn / 23 info | 0 errors / 5 warn / **25** info |
| `specs/inside-track.allium` | 0 errors / 0 warn / 11 info | unchanged |
| `specs/event-bus.allium` | 0 errors / 30 warn / 0 info | 0 errors / **32** warn / 0 info |

The +2 crm infos are `allium.rule.unreachableTrigger` on the two new projections — the same accepted
kind as the three existing cross-spec projections. The +2 event-bus warnings are `definition.unused`
on the two new payload value types, matching the 28 already there (payload values in that file are
documentation-only). `allium analyse` returns **0 findings** on both edited specs.

---

## 2. Group A — mechanical, no decision needed

| # | Item | File | Effort |
|---|---|---|---|
| A-1 | Make the spec **witness** `updated_by_*`: add to the `ensures` of the 7 referral transition rules. Code sets these on all 4 write paths; the spec is silent, so this is spec-behind-code drift. Only the misleading *wording* was fixed this session. | `specs/inside-track.allium` (via `allium:tend`) | ~10 min |
| A-2 | Update §F and §G: both gates are now open. Add the two newly-known implementation costs — the `findMany`-before-update rewrite and the 8 new i18n keys. | `docs/inside-track-implementation-debt.md` | ~10 min |
| A-3 | `CLAUDE.md` says "publishes **29** event types"; code has **33** (35 once this session's +2 land). Already stale by four before this session. | `CLAUDE.md:819` | 1 min |
| A-4 | Give the timeline label lookup a fallback. `t(\`crm.activity.${type}\`)` has none, while the icon lookup does (`ACTIVITY_ICONS[type] ?? ActivityIcon`). Independent of how IT-B3 is resolved. | `ActivityTimeline.tsx:137` | 5 min |
| A-5 | Wire `onCreate` on the company picker in `TipCaptureForm`. The delta's standalone cheap win — never spec-gated, capability already built (`findOrCreateCompany`), passed at exactly one other call site (`PersonForm.tsx:549`). | `TipCaptureForm.tsx:199` | ~15 min + test |

---

## 3. Group B — fixable, but needs a decision

| # | Decision | Recommendation | Cost |
|---|---|---|---|
| B-1 | Does `quick_capture` land in code this session, or stay spec-only? | — | 5 files |
| B-2 | Add a runtime membership guard for `DataSource`? It has none, unlike `isValidReferralKind` / `isValidReferralStatus` (ADR-019 pattern). | Yes, ride along with B-1 | small |
| B-3 | IT-B1 fix shape: filter at the 3 picker call sites, or flip `getPersons` to active-by-default with opt-in inclusion? | **Flip the default** — today's default is fail-open, and every caller wanting all statuses already passes one explicitly. Changes a shared repository contract, hence your call. | ~30 min + tests |
| B-4 | IT-B3 direction: make the projection emit `vacancy_promoted` (+4 i18n keys), or delete the dead enum member from the spec? | Either is defensible; deleting is cheaper and nothing depends on it | 15–30 min |
| B-5 | `quick_capture` retention posture. | **Manual-like (no expiry).** Quick capture is a deliberate user act for a legitimate purpose; incompleteness is a data-*quality* issue, not a lawfulness one. Auto-created differs precisely because no human chose it. Current behaviour already is manual-like → **zero code**. Needs a documented balancing rationale beside the existing LIA note. | ~20 min (`specs/crm-gdpr.allium`) |

**B-1 detail — the `quick_capture` rollout is not free:**

| Site | Why it blocks |
|---|---|
| `event-schemas.ts:230` | `z.enum(["manual","auto_created","imported"])` — **runtime validator rejects the value** |
| `person.model.ts:83` | `DataSource` TS union |
| `event-types.ts:223` | `source` union |
| `i18n/dictionaries/crm.ts` | `crm.dataSource.*` keys exist → 4 new translations |
| `ContactsPageClient.tsx:57,224` | switch + filter `SelectItem` |

---

## 4. Group C — genuinely open, needs design

- **C-1 — Polymorphic `ActivityLog` target seam.** Recorded as an open question in `specs/crm.allium`.
  `ActivityLog` has only `target_person` / `target_company` / `target_job`; a `target_referral` field
  would make `crm.allium` depend on `inside-track.allium` (wrong direction). The projections therefore
  carry the referral identity in `details`. Deferred with a trigger: **a second non-crm context wanting
  to project, or a click-through requirement on timeline entries.** A nullable-FK seam mirroring
  `TaskTarget`/`NoteTarget` is the candidate.
- **C-2 — Anonymization empties referral timeline entries.** `anonymizePerson`'s cascade does
  `crmActivityLog.updateMany({ where: { targetPersonId }, data: { targetPersonId: null, details: null,
  linkedRecordName: null } })` (`person.actions.ts`). Since the referral id lives in `details`, an
  anonymized tipster's referral entries keep `targetCompanyId` + type + timestamp but lose both the
  person **and** the referral link — a row you can see but cannot navigate. Correct minimal
  de-identification, or should those entries be deleted? **Decide before the projections ship.**
  Strengthens the case for C-1.
- **C-3 — `updated_by_*` is spec-silent on three more models.** `CrmInterview` (`schema.prisma:1118`),
  `CrmTask` (`:1164`), `CrmNote` (`:1205`), written at 9 further code sites. Same drift as A-1, wider
  scope. Belongs in a broader `weed` pass, not a targeted fix.

---

## 5. Group D — gaps in this session's own work

- **D-1 — CRM slice 2 was never checked.** The delta claimed the `tend` pass unblocks **three** items:
  §F, §G-contact, and CRM slice 2. The first two were delivered; **slice 2 was never looked at.** Its
  actual blocked/unblocked status is unknown.
- ~~**D-2 — `allium:weed` was never run.**~~ **DONE** → **`docs/weed-findings-2026-08-17.md`**
  (31 findings, none fixed). The suspicion was right: every drift finding *before* the pass came from
  ad-hoc grepping while reading nearby code, and the systematic pass found ~26 more. 5 were
  independently re-verified by the main thread and all 5 landed exactly as reported.
  **None was caused by this session's changes.** Load-bearing consequences for the items below:
  - **W-C1** — the `DeleteCrmContact` drift note in `inside-track.allium:491-493` cites a rule that
    **does not exist**; there is no drift. Sits in a file this session is about to commit.
  - **W-F1** — `crm.allium`'s `BlocklistType` lacks `pattern` and its
    `BlocklistSuppressesAutoCreation` contradicts the same-named invariant in `crm-gdpr.allium`.
    Also in a file about to be committed.
  - **W-G1** — `TipReifiesToJob` seeds `JobStatusHistory` + emits `JobStatusChanged` in code, witnessed
    by no `ensures`. This session's `RecordReferralStatusChange` guidance reasons about that entry, so
    it leans on an unspecified effect.
  - ~~**W-D1** (High) — `MergePersons` orphans Referrals and hard-deletes PersonConnections~~
    **FIXED 2026-08-18** (spec + code + 5 regression tests verified to fail without the fix).
- **D-3 — Unverified descriptive claims remain in the invented surface.** One fabricated literal was
  found and fixed (`kind` was written as `"InsiderRelay" | "NetworkPath"`; code uses
  `insider_relay` / `network_path`). But `PersonQuickCapture`'s `exposes` list (`name`,
  `primary_email`, `primary_company`) was written from the spec's vocabulary, **not read off
  `ContactPicker`'s actual option shape**. Same error class, lower stakes, still unverified.
- **D-4 — i18n keys not written.** 4 for `crm.dataSource.quick_capture`, 8 for the two new activity
  types (2 types × 4 locales). Gated on B-1 / B-4 but outstanding.
- **D-5 — New find, not yet in BUGS.md (candidate IT-B5, LOW, test-only).**
  `testFixtures.ts:1444` writes `createdBySource: "auto_created"`, but `createdBySource` is an
  **ActorSource** column (`manual | import | api | ...`) and `auto_created` is a **DataSource** value —
  the two axes are crossed. Invisible to `tsc` because the fixture field is typed `createdBySource:
  string` (`testFixtures.ts:1352`).

---

## 6. Group E — process obligations not met

- **E-1 — Nothing committed, no grouping proposed.** Convention is logical grouping, so roughly:
  (a) event registry + payloads, (b) referral events + projections, (c) quick-capture provenance,
  (d) BUGS entries, (e) this file.
- ~~**E-2 — An ADR is arguably owed** for the dependency-direction decision in §0.~~ **DONE** →
  `docs/adr/039-cross-context-timeline-projection-and-quick-capture-provenance.md` (5 decisions,
  6 rejected alternatives; extends ADR-038 / ADR-035). No `docs/adr/README.md` index exists in this
  repo, so there was no index to update.
- **E-3 — No blind-spot pass, no formal honesty gate.** The gate is pre-push, so not overdue — but it
  has not happened, and the session accumulated enough change to warrant it.
- **E-4 — No tests, and CI spec-validation was never checked.** Spec-only changes plausibly need none,
  but "no tests needed" is an **assumption**: whether `allium check` runs in CI was not verified.
- **E-5 — Any IT-B1 / IT-B2 fix is a UI change** → the ui-design agent must be consulted first per
  project rule. This constrains how those two get done.

---

## 7. Group F — hygiene and tooling gotchas

- **F-1 — `.understand-anything/` is dirty and looks wrong.** `knowledge-graph.json` shows
  **−77,032 lines**. That is not a refresh, it is a truncated or failed rebuild. Recommend discarding
  and regenerating at Welle end per the per-Welle graph rule. **Untouched this session.**
- **F-2 — `allium check <single-file>` emits 5 spurious `use.unresolvedPath` warnings** because imports
  are not in the check set. Only `allium check specs/` resolves them. A future session checking one
  file could read those as real, or miss cross-file errors. Same shape as the `PIPESTATUS` trap: a
  signal answering a different question than the one asked. **Always check the directory.**
- **F-3 — `docs/BUGS.md` counts do not close arithmetically** (594 fixed + 6 open = 600 vs 599 found).
  Inherited — the previous header had the same off-by-one. The basis was kept rather than silently
  re-derived.
- **F-4 — The delta file is now stale.** `.remember/delta-for-jobsync-next.md` says "entry point is the
  `/tend` pass over `crm.allium` + `inside-track.allium`" (done) and describes the §F/§G gates as
  closed (now open).

---

## 8. Suggested entry point for the next session

~~Run `allium:weed` …~~ **Done** — see D-2 and `docs/weed-findings-2026-08-17.md`.

Revised entry point, in order:

1. **Decide whether W-C1 + W-F1 ride along with this session's commit.** Both are cheap spec
   corrections *inside files already being committed*; shipping without them means knowingly
   committing a spec that makes a false statement about a sibling spec (W-C1). **Recommended: fix
   both, then commit.**
2. **Commit the session's work** as the five-commit grouping in E-1.
3. **Promote the weed findings into `docs/BUGS.md`** — the 6 code-side bugs (+7 that are both) belong
   in the project's single source of truth (IT-B5 onward); the 18 spec-side ones are better batched
   into one `allium:tend` pass.
   Deliberately *not* done yet: it would rewrite the BUGS status header and counts a second time in
   one session, which is your call to make.
4. **Triage W-D1 (High) as its own change** — silent data loss, and the only finding that destroys
   user data rather than mis-recording it.
5. Then A-1..A-5 (mechanical) and the Group B decisions.
