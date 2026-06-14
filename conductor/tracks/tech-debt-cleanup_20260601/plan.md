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
- [ ] Task 3.2: D4 — `allium:weed` `specs/shared-entities.allium` `Company.domain`
      (`:68`) against `schema.prisma:306` + the enrichment autofill; reconcile the drift.

### Verification

- [ ] `allium:check` clean on both specs; `allium:weed` reports zero `Company.domain` drift.

## Phase 4: GDPR-LOW

### Tasks

- [ ] Task 4.1: GDPR-Consent (Art. 7) — add `processingBasis` enforcement + a withdrawal
      path. Test: a withdrawn/absent basis blocks the processing it gates; the withdrawal
      mutation is auth-gated (ADR-015 userId). Sites: `person.actions.ts`,
      `PersonDetailClient.tsx`, `collect-user-data.ts`.
- [ ] Task 4.2: G25 — dedup `CrmTaskTarget`/`CrmNoteTarget` in `mergePersons`
      (`person.actions.ts:444`) the way `JobContact` is already deduped; regression test
      merges two persons sharing a task/note target and asserts no duplicate row.
- [ ] Task 4.3: G26b — add `ADMIN_USER_IDS` startup validation in `instrumentation.ts`
      (mirror the `ENCRYPTION_KEY` throw at `:3-5`); test malformed/empty entries fail fast.

### Verification

- [ ] `processingBasis` is enforceable + revocable; merge never duplicates targets;
      malformed `ADMIN_USER_IDS` fails startup. All test-backed.

## Phase 5: i18n + test gaps

### Tasks

- [ ] Task 5.1: F6 — replace the `?? "Dismiss"` fallback at `toast.tsx:90` with the
      `common.dismiss` i18n key (confirm key ×4 locales); component test asserts the
      localised label with no `label` prop supplied.
- [ ] Task 5.2: CRM-Cron — add `__tests__/crm-cron.spec.ts` covering
      `ExpireAutoCreatedPersons` / `InterviewReminder` / `TaskOverdueReminder` + the
      24h-idempotency guard (functions exported at `crm-cron.ts:384`).
- [x] Task 5.3: G28 — DONE (verified 2026-06-14): `e2e/cleanup-stale-data.ts` deletes
      8 CRM entities child→parent (5a–5h) + RESTRICT-guards. Shipped (git `4d7c345`).

### Verification

- [ ] Toast label localised; `crm-cron.ts` has unit coverage; E2E cleanup runs clean.

## Final Verification

- [ ] All 12 items shipped, each with its own test + logical commit
      (NB 2026-06-14: D3 + G28 already DONE before track start → **10 items remain**)
- [ ] `bash scripts/test.sh` green; `bun run build` zero type errors
- [ ] `allium:check` clean on the two touched specs
- [ ] i18n dictionaries consistent across en/de/fr/es (F6)
- [ ] `bash scripts/check-notification-writers.sh` clean (Phase 2/3 touch notifications)
- [ ] Ready for review

---

_Generated by Conductor. Tasks will be marked [~] in progress and [x] complete._

## Phase 6: Wrap-Up (finale Phase — vor Merge/Push)

Per `conductor/workflow.md` § Wrap-Up-Phase. Run only after all prior phases pass.

### Tasks
- [ ] Task 6.1: Blind-Spot-Analyse — projektweit `grep` nach den Pattern-Fixes dieses Tracks; adjacent Lücken schließen.
- [ ] Task 6.2: `/comprehensive-review:full-review` (Architecture+Security+Performance+Testing+Best-Practices) — alle realen Findings autonom fixen; Agent-Claims gegen `git diff`/Code verifizieren (kein Fabrizieren).
- [ ] Task 6.3: `/understand` inkrementell-Refresh + Graph-Commit (1× am Welle-Ende, NICHT per-Commit; `autoUpdate` OFF).
- [ ] Task 6.4: Honesty-Gate voll ausführen (2 Fragen: Shortcuts/fehlende Skills/Gaps? Docs/Handoff?).
- [ ] Task 6.5: Push eigenständig — nach Gate, Fork `main`, NIE upstream.
- [ ] Task 6.6: Doku-Update (README/User-Guide/API/ADR wo nötig) + `docs/BACKLOG.md` + `docs/BUGS.md` + Memory-Handoff aktualisieren.

### Verification
- [ ] full-review: keine offenen Critical/High. Honesty-Gate sauber. Auf Fork `main` gepusht. BACKLOG/BUGS/Docs synchron.
