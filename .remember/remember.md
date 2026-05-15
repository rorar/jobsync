# Handoff

## State
Session 2026-05-15 Review Fix-All done. 7 commits on `main` (`3c0543f`..`1248d00`). 241 suites, 4666 tests (+40 new). Build green (0 new tsc errors). 25 findings from 6-agent comprehensive review fixed across 6 work packages. 1 blind spot found and fixed (crm-cron.ts F-07). 1 new finding documented (BS-01: deleteFile ADR-019).

## Next
1. **P0 CRITICAL**: G1 (status-change bypass, 4 sites), G2b (AI degradation bypass) — see `project_next_session_planning.md`
2. **BS-01 NEW**: `deleteFile` in profile.actions.ts — same ADR-019 pattern as SEC-05. Accepts optional `callerUserId?`, skips ownership when omitted. MEDIUM.
3. **HIGH Domain Expert:** G9 (ContactDeleted no CRM logger, 30min), G10 (0 CRM fixtures, ½ day). See `docs/open-items-2026-05-13.md`.
4. **Remaining IF findings:** IF-5 (errorCode in actionToResponse), IF-6 (CompanyCreated from Promoter), IF-7 (shared NotificationType constant), IF-8 (webhook GDPR allowlist)
5. **S2 UX Polish:** `~/s2-ux-polish-session.md` — 19 features, 52+ components.
6. **Allium V3 Overhaul:** `notification-dispatch.allium` (160 errors), `scheduler-coordination.allium` (97 errors). 1-2h with `/allium:tend`.
7. **Allium spec gaps from weed:** crm.allium needs Job-deletion cascade rules for Interview, JobContact, TaskTarget, NoteTarget. job-aggregate.allium DeleteJob rule needs CRM cascade targets.

## Context
- Session 2026-05-14: All 12 F/CQ closed. 17 commits. New utilities: `src/lib/rate-limit.ts` (factory), `src/lib/storage.ts` (DATA_DIR), `src/lib/assets/orphan-finder.ts`, `src/lib/assets/file-cleanup.ts`, `registerProjection()` in crm-activity-logger, shared test fixtures in testFixtures.ts. `docs/NOT-PLANNED.md` tracked in CLAUDE.md. NP-2 resolved (LOGO_PRUNE_LEVELS). CQ-16 fix exposed hidden `aiSettings.provider` legacy bug. 10 unconsumed event types in `docs/event-consumer-analysis.md`. `project_deferred_sprints_for_future_sessions.md` § "makeTestDispatchContext" is RESOLVED.
- Session 2026-05-15: GDPR Sprint Phase 1 (S2/S3/S4) fully implemented. 5 commits (`494079a`..`2b6b638`). 235 suites, 4608 tests.
- S1 (2026-05-15): Migration `20260513170926_s1_account_deletion_cascades` adds Cascade to all 37 User FKs. `deleteAccount()` in `src/actions/account.actions.ts`. UI in `AccountDeletionSettings.tsx`.
- Flashlight found Job→Company/JobTitle Restrict ordering risk — fixed by explicit `tx.job.deleteMany()` before `tx.user.delete()`.
- S2 (2026-05-15): `exportUserData()` in `src/lib/export/collect-user-data.ts`. ZIP via archiver. Rate limit 1/h. UI in `DataExportSettings.tsx`.
- S3 (2026-05-15): `isLocal` on AiManifest. `convertResumeToText()` strips PII for cloud providers. `stripEmailPhonePatterns()`. TEXT_LIMITS activated.
- S4 (2026-05-15): `retention-cron.ts` with 7 rules daily 03:30. Allium spec: `specs/gdpr-data-rights.allium`.
- Allium specs NOT updated — pre-existing V3 parse errors: `notification-dispatch.allium` (160), `scheduler-coordination.allium` (97). Deferred.
- Session 2026-05-13: Sprint C + IF-2/5/6/7/8 + 2× comprehensive review (32 findings, all fixed). 14 commits (`0b186e5`..`9532b96`), 231 suites, 4569 tests.
- IF-2 DONE: 29 Zod schemas with `satisfies z.ZodType<X>`, 20 consumer casts→safeParsePayload, 7 typed emits, EventPayloadSchemas registry.
- IF-3 DONE: 3 migrations. CrmInterview/JobContact → Cascade. ALL 6 polymorphic target FKs → Cascade (join rows). ActivityLog/StagedVacancy → SetNull.
- IF-4 DONE: degradation.ts routes through `channelRouter.route()`. All 4 channels receive degradation alerts.
- Quick Wins DONE: `retention_expired` own NotificationType, 2 missing i18n keys, 7 hardcoded strings replaced, 21 dead keys removed.
- `follow_up_due` is NOT dead code (confirmed: cron → event → dispatcher → notification chain is wired).
- deleteJobById + API v1 DELETE unified: both rely on DB cascades, no manual cleanup.
- E2E cleanup has 9 CRM steps added (defense-in-depth).
- Pre-existing: merge creates duplicate CrmTaskTarget/CrmNoteTarget rows, `e2e/CONVENTIONS.md` doesn't exist on disk.
- Session 2026-05-15 Review Fix-All: 7 commits. SEC-05 (uploadFile→server-only), rate-limiter migration (factory+SEC-09 rightmost IP), 40 new tests (rate-limit, storage, upload, crm-activity-logger), 9 batch LOW fixes, 4 moderate LOW fixes. Blind spot: crm-cron.ts F-07 parentheses, BS-01 deleteFile ADR-019 (documented, not fixed — needs same treatment as uploadFile).
