# Handoff

## State
Session 2026-05-14 done. 12 commits on `main` (`2b6b638`..`1cc021d`). 237 suites, 4626 tests, 51 migrations. Build green. Code Quality refactoring session: CQ-8/9/14/15 fixed, file-cleanup + test fixtures extracted, DomainEventType casts fixed.

## Next
1. **Offene F/CQ**: CQ-7 (unused param), CQ-16 (`as any`), F-3 (file placement) — @rorar decides NOT-PLANNED or fix
2. **Full review** not yet run (`/comprehensive-review:full-review`) — required per `feedback_full_review_after_sprints.md`
3. **P0 CRITICAL**: G1 (status-change bypass, 4 sites), G2b (AI degradation bypass) — see `project_next_session_planning.md`
4. **HIGH Domain Expert:** G9 (ContactDeleted no CRM logger, 30min), G10 (0 CRM fixtures, ½ day). See `docs/open-items-2026-05-13.md`.
5. **S2 UX Polish:** `~/s2-ux-polish-session.md` — 19 features, 52+ components.
6. **Allium V3 Overhaul:** `notification-dispatch.allium` (160 errors), `scheduler-coordination.allium` (97 errors). 1-2h with `/allium:tend`.

## Context
- Session 2026-05-15: GDPR Sprint Phase 1 (S2/S3/S4) fully implemented. 5 commits (`494079a`..`2b6b638`). 235 suites, 4608 tests.
- S1 (2026-05-15): Migration `20260513170926_s1_account_deletion_cascades` adds Cascade to all 37 User FKs. `deleteAccount()` in `src/actions/account.actions.ts`. UI in `AccountDeletionSettings.tsx`.
- S2 (2026-05-15): `exportUserData()` in `src/lib/export/collect-user-data.ts`. ZIP via archiver. Rate limit 1/h. UI in `DataExportSettings.tsx`.
- S3 (2026-05-15): `isLocal` on AiManifest. `convertResumeToText()` strips PII for cloud providers. `stripEmailPhonePatterns()`. TEXT_LIMITS activated.
- S4 (2026-05-15): `retention-cron.ts` with 7 rules daily 03:30. Allium spec: `specs/gdpr-data-rights.allium`.
- Flashlight found Job→Company/JobTitle Restrict ordering risk — fixed by explicit `tx.job.deleteMany()` before `tx.user.delete()`.
- Allium specs NOT updated — pre-existing V3 parse errors: `notification-dispatch.allium` (160), `scheduler-coordination.allium` (97). Deferred.
- Pre-existing: merge creates duplicate CrmTaskTarget/CrmNoteTarget rows, `e2e/CONVENTIONS.md` doesn't exist on disk.
- Session 2026-05-13: Sprint C + IF-2/5/6/7/8 + 2× comprehensive review (32 findings, all fixed). 14 commits (`0b186e5`..`9532b96`), 231 suites, 4569 tests.
- IF-2: 29 Zod schemas with `satisfies z.ZodType<X>`, 20 consumer casts→safeParsePayload, 7 typed emits, EventPayloadSchemas registry.
- Session 2026-05-14: `docs/NOT-PLANNED.md` now tracked in CLAUDE.md. 10 unconsumed event types in `docs/event-consumer-analysis.md`. `project_deferred_sprints_for_future_sessions.md` § "makeTestDispatchContext" is now RESOLVED.
