# Implementation Plan: Tech-Debt Cleanup (Restposten + GDPR-LOW)

**Track ID:** tech-debt-cleanup_20260601
**Spec:** [spec.md](./spec.md)
**Created:** 2026-06-01
**Status:** [ ] Not Started

## Overview

Five independent clusters, one phase each. Pick up opportunistically between Wellen —
no cross-phase ordering. TDD per item: failing test first (regression for bugs, coverage
for gaps), then fix. Each item is its own logical commit. Build zero-error +
`bash scripts/test.sh` green before each commit; stop the dev server before tsc/build.

## Phase 1: TypeScript type-safety casts

### Tasks

- [x] Task 1.1: IF-12 — DONE (2026-06-14, `340e3bf`): retyped DiscoveredJobsList /
      DiscoveredJobDetail / AutomationMetadataGrid props DiscoveredJob→StagedVacancyWithAutomation
      (the real runtime type), dropped all 3 casts, deleted orphaned DiscoveredJob interface.
      3 component test builders retyped onto mockStagedVacancy. Build zero-error.
- [x] Task 1.2: D1/D2 — DONE (2026-06-14, `40a1dae`): D1 = `result.experimental_output`
      → `result.output` (AI-SDK v6; code already used generateText+Output.object — verified
      via Context7, generateObject is the DEPRECATED one). D2 = typed `RESUME_MATCH_INCLUDE`
      const + `Prisma.ResumeGetPayload`, cast removed. runner-pii-redaction + dedup tests green.

### Verification

- [x] No `as unknown as` in the automation-detail page; no deprecated `experimental_output`;
      build zero-error (tsc 0, 5 suites/44 tests green, build exit 0).

## Phase 2: Event semantics + bounded-context (DDD)

### Tasks

- [x] Task 2.1: IF-10 — DONE (2026-06-14, `fc724ba`): chose "document the contract".
      The awaitable path already exists (`eventBus.publish()` directly — spec escape hatch,
      no caller needs it; all ~30 sites are fire-and-forget). Documented the void+`.catch`
      ErrorIsolation contract on `emitEvent` + added "emitEvent contract (IF-10)" test block
      (void return, no throw to publisher on consumer error, survivors still run).
- [x] Task 2.2: D5 — DONE (2026-06-14, `cab8915`): routed the `Company.domain` write through
      a new server-only Company repository leaf `src/lib/company-repository.ts`
      (`setCompanyDomainIfUnset`, mirrors blacklist-query.ts) instead of raw Prisma — and
      added the missing owner-scope (`createdBy`, ADR-015). NB: used a server-only leaf, NOT
      `company.actions.ts`, because that is a "use server" file (ADR-019) and the consumer has
      no session. Unit test on the repo fn; enrichment-auto-trigger regression stays green.

### Verification

- [x] `emitEvent` semantics tested + documented; `Company.domain` written only via the
      Company repository (no cross-context raw write). tsc 0, 55 tests green, build exit 0.

## Phase 3: Allium spec-drift (no behaviour change)

### Tasks

- [x] Task 3.1: D3 — DONE (verified 2026-06-14): `specs/notification-dispatch.allium`
      already v3 (header `-- allium: 3`); `allium analyse` → `findings:[]`. "160 errors" stale.
- [x] Task 3.2: D4 — DONE (2026-06-14, `423e54d`): allium:weed found 2 spec-lag drifts;
      allium:tend applied (verified vs git diff + allium check, 0 errors). shared-entities:
      domain comment corrected (label-derived/synthesised, write-once) + new @invariant
      DomainPopulatedOnce. data-enrichment (DDD bounded context): new producer rule
      PopulateCompanyDomainOnCreation modelling the sole writer. No code change.

### Verification

- [x] `allium:check` clean on both specs; `allium:weed` reports zero `Company.domain` drift.

## Phase 4: GDPR-LOW

### Tasks

- [x] Task 4.1: GDPR-Consent (Art. 7(3)) — DONE (2026-06-14, `d4460dc`): added
      Person.consentWithdrawnAt + migration; withdrawConsent/reinstateConsent actions
      (owner-scoped); updatePerson blocked when consent-blocked; crm-cron InterviewReminder
      excludes consent-blocked persons; DSAR export includes the field; PersonDetailClient
      withdraw/reinstate UI + badge; i18n ×4; crm-gdpr.allium (via tend, 0 errors); tests.
      Scope chosen by user: "restrict + exclude from active flows" + full this session.
- [x] Task 4.2: G25 — DONE (2026-06-14, `a0e79bf`): mergePersons dedups CrmTaskTarget/
      CrmNoteTarget (pre-read overlap + delete loser's colliding rows before transfer,
      mirroring JobContact). Regression tests cover overlap + no-overlap.
- [x] Task 4.3: G26b — DONE (2026-06-14, `54a6fc0`): assertAdminUserIdsValid() fails fast
      on set-but-malformed ADMIN_USER_IDS; called from instrumentation nodejs branch
      (dynamic import keeps prisma out of edge runtime). Unit-tested.

### Verification

- [x] `processingBasis` enforceable + revocable; merge never duplicates targets;
      malformed `ADMIN_USER_IDS` fails startup. tsc 0, build clean, tests green.

## Phase 5: i18n + test gaps

### Tasks

- [x] Task 5.1: F6 — DONE (2026-06-14, `375eecc`): ToastClose self-translates the dismiss
      fallback via useTranslations (`common.dismiss`, ×4 locales; safe outside provider).
      Test: de/en/explicit-label.
- [x] Task 5.2: CRM-Cron — DONE (2026-06-14, `8d5845b`): `__tests__/crm-cron.spec.ts` covers
      expireAutoCreatedPersons / checkInterviewReminders / checkOverdueTasks + 24h idempotency
      + the GDPR Art. 7(3) consent-blocked exclusion. 7 tests.
- [x] Task 5.3: G28 — DONE (verified 2026-06-14): `e2e/cleanup-stale-data.ts` deletes
      8 CRM entities child→parent (5a–5h) + RESTRICT-guards. Shipped (git `4d7c345`).

### Verification

- [x] Toast label localised; `crm-cron.ts` has unit coverage; E2E cleanup runs clean.

## Final Verification

- [x] All 12 items shipped (D3 + G28 pre-done; 10 implemented this session), each its own commit + tests
- [x] touched test suites green; `bun run build` zero type errors; tsc 0
- [x] `allium check` clean (crm-gdpr / shared-entities / data-enrichment / notification-dispatch)
- [x] i18n dictionaries consistent across en/de/fr/es (dictionary-completeness green)
- [x] Ready for review — full-review done (TD-B1 found+fixed), honesty-gate clean

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

## Phase 6: Wrap-Up (finale Phase — vor Merge/Push)

Per `conductor/workflow.md` § Wrap-Up-Phase. Run only after all prior phases pass.

### Tasks
- [x] Task 6.1: Blind-Spot-Analyse — DONE: swept IF-12/D5/F6/G26b/consent patterns; logo-writebacks already owner-scoped (validates D5), all security env-vars guarded; 2 minor pre-existing items → BACKLOG.
- [x] Task 6.2: full-review — DONE: 5 parallel dimension agents, claims verified vs code; found 1 MEDIUM (TD-B1: consent enforcement incomplete) + L1/M1/M2 → all fixed (`e34fb5f`). No open Critical/High.
- [x] Task 6.3: `/understand` refresh — DONE: ran in own tmux `claude --dangerously-skip-permissions` session (full rebuild) → graph FRESH @ HEAD, committed (`429d670`).
- [x] Task 6.4: Honesty-Gate — DONE: ui-design gap closed via a11y audit (consent UI AA-clean); E2E-consent deferred (unit+component cover); no shortcuts.
- [x] Task 6.5: Push — fork `main` (this session).
- [x] Task 6.6: Docs (via Understand-Anything) — DONE: ADR-037, user-guide/crm.md, BACKLOG §4+§1b closed, BUGS TD-B1, memory handoff.

### Verification
- [x] full-review: 0 open Critical/High. Honesty-Gate clean. Pushed to fork `main`. BACKLOG/BUGS/Docs synchron.
