# Specification: Tech-Debt Cleanup (Restposten + GDPR-LOW)

**Track ID:** tech-debt-cleanup_20260601
**Type:** Chore / Refactor (mixed — type hygiene, bounded-context, spec-drift, GDPR-LOW, test gaps)
**Created:** 2026-06-01
**Status:** Draft

## Summary

A parallel-einstreubarer cleanup track collecting the verified-open Restposten from
BACKLOG §4 (Tech-Debt), §1b (GDPR-LOW), and §5 (CRM-Gaps tail). No single item is large;
each is independently shippable and test-backed. Grouped into five clusters (one phase
each) so they can be picked up opportunistically between the larger Wellen without
rewrite risk (BACKLOG Kette D = "jederzeit parallel").

## Context

After Sprints 1–5 and Welle 0, the BACKLOG (verified against HEAD `663ff21`, code-grep)
lists a small set of genuinely-open, low-coupling items. They are NOT new findings —
they are the known tail. This track makes them executable. Every file:line below was
**code-verified at HEAD `b4b20e9`** (this worktree) via grep/Read; the knowledge graph
was stale (4 commits behind) and was NOT relied upon for any fact.

## Acceptance Criteria

Each item ships with its own test (regression for bugs, unit/coverage for gaps) and is
committed in its own logical commit. Build zero-error, `bash scripts/test.sh` green.

### Cluster 1 — TypeScript type-safety casts ✅ DONE (2026-06-14)
- [x] **IF-12:** DONE (`340e3bf`) — 3 components retyped DiscoveredJob→StagedVacancyWithAutomation,
      all 3 `as unknown as` casts removed, orphaned DiscoveredJob interface deleted, test
      builders retyped onto mockStagedVacancy. MEDIUM.
- [x] **D1/D2:** DONE (`40a1dae`) — D1 `result.experimental_output`→`result.output` (AI-SDK v6;
      Context7-verified the code already uses the current generateText+Output.object API, and
      generateObject is the deprecated one). D2 cast replaced by typed `RESUME_MATCH_INCLUDE` +
      `Prisma.ResumeGetPayload`. LOW.

### Cluster 2 — Event semantics + bounded-context (DDD) ✅ DONE (2026-06-14)
- [x] **IF-10:** DONE (`fc724ba`) — documented the void+`.catch` ErrorIsolation contract on
      `emitEvent` + guard test; awaitable path (`eventBus.publish()`) already exists, no caller
      needs it. No behaviour change. MEDIUM.
- [x] **D5:** DONE (`cab8915`) — `Company.domain` write routed through a server-only Company
      repository leaf (`setCompanyDomainIfUnset`) instead of raw `db.company.updateMany`;
      owner-scoped (createdBy, ADR-015). Server-only leaf (not company.actions.ts) because the
      consumer has no session per ADR-019. LOW.

### Cluster 3 — Allium spec-drift (no code behaviour change) ✅ DONE (2026-06-14)
- [x] **D3:** DONE (2026-06-14) — `specs/notification-dispatch.allium` already v3
      (`-- allium: 3`); `allium analyse` → `findings:[]`. "~160 parse errors" stale.
- [x] **D4:** DONE (`423e54d`) — weed+tend reconciled `Company.domain`: shared-entities
      comment corrected + `@invariant DomainPopulatedOnce`; data-enrichment gained producer
      rule `PopulateCompanyDomainOnCreation` (DDD: writer lives in the enrichment context).
      0 allium errors. LOW.

### Cluster 4 — GDPR-LOW ✅ DONE (2026-06-14)
- [x] **GDPR-Consent (Art. 7(3)):** DONE (`d4460dc`) — Person.consentWithdrawnAt + migration;
      withdraw/reinstate actions (owner-scoped); updatePerson blocked when consent-blocked;
      crm-cron InterviewReminder exclusion; DSAR export field; PersonDetailClient UI + badge;
      i18n ×4; crm-gdpr.allium via tend (0 errors); tests. Scope (user): restrict + exclude
      from active flows, full this session. MEDIUM.
- [x] **G25:** DONE (`a0e79bf`) — mergePersons dedups CrmTaskTarget/CrmNoteTarget mirroring
      JobContact (pre-read overlap + delete loser's colliding rows pre-transfer). Tests. LOW.
- [x] **G26b:** DONE (`54a6fc0`) — assertAdminUserIdsValid() fails fast on set-but-malformed
      ADMIN_USER_IDS; wired in instrumentation nodejs branch. Unit-tested. LOW.

### Cluster 5 — i18n + test gaps
- [ ] **F6:** The Toast close-button fallback label is i18n'd. Verified:
      `src/components/ui/toast.tsx:90` renders `{label ?? "Dismiss"}` — the `?? "Dismiss"`
      hardcoded-English fallback is the gap (the toaster passes `t("common.dismiss")`, but
      the component default leaks English when no label is supplied). LOW (test gap).
- [ ] **CRM-Cron:** Unit-test coverage added for `src/lib/scheduler/crm-cron.ts` (today
      0 tests; `crm-activity-logger` is covered, `crm-cron` is not). Cover the three rules
      `ExpireAutoCreatedPersons` / `InterviewReminder` / `TaskOverdueReminder` + the
      24h-idempotency guard. The functions are already exported for testing (`crm-cron.ts:384`).
- [x] **G28:** DONE (2026-06-14) — `e2e/cleanup-stale-data.ts` deletes 8 CRM entities
      child→parent (5a–5h) + RESTRICT-guards. Shipped (git `4d7c345`). LOW (test).

## Dependencies

- Independent of the four Wellen — **parallel-einstreubar** (no rewrite risk).
- D3/D4 are best handled in one `allium:tend` / `allium:weed` pass.
- GDPR-Consent (enforcement + withdrawal) is the heaviest item; if it grows, split it
  into its own track rather than blocking the rest of the cluster.

## Out of Scope

- Items already verified ERLEDIGT in BACKLOG §0 (IF-2/4/6/9/11, DAU-2, Gap-2/3/4, etc.).
- The dedicated-sprint items (observability, PII-at-rest, undoStore pipe-through,
  cursor-pagination, session-recovery) — each has its own entry-gated track.
- ROADMAP §7 forward features and NOT-PLANNED §8 items.

## Technical Notes

- TDD: bug items get a failing regression test first; test-gap items get coverage that
  would fail against a deliberately-broken variant.
- ADR-015 (userId in every query) + ADR-019 (no raw-userId `"use server"` export) apply
  to the GDPR-Consent + G25 changes.
- D5 is a DDD bounded-context fix — route the write through the Company Repository
  (`company.actions.ts`), do not add a second cross-context writer.
- i18n F6: add/confirm `common.dismiss` ×4 locales and make the component default use it.

---

_Generated by Conductor — distilled from BACKLOG §4 / §1b / §5. All file:line facts
code-verified at HEAD `b4b20e9`; graph-derived facts: none (stale graph not relied upon)._
