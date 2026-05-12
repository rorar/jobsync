# Interface Fragility Analysis — 2026-05-12

**Method:** 9 persistent domain expert agents, each queried independently: "Welche Schnittstellen zwischen deiner Domain und den anderen Domains sind die fragilsten? Wo wuerde eine Aenderung in deiner Domain unbemerkt etwas in einer anderen Domain kaputtmachen? Nenne die 3 gefaehrlichsten Koppelungspunkte mit file:line Referenzen."

**Agents:** crm, job-aggregate, connectors, pipeline, notifications, events, security, ui-infra, testing

**Total findings:** 27 coupling points (3 per agent). After deduplication and consensus analysis: **12 unique fragility clusters**.

---

## Consensus Summary

| ID | Fragility | Agents (consensus) | Severity |
|----|-----------|-------------------|----------|
| IF-1 | Event Bus Bypass: 4+ status-change paths skip `JobStatusChanged` | events, crm, job-aggregate, security, pipeline | **CRITICAL (5/9)** |
| IF-2 | Event Payload unsafe `as`-casts — no runtime validation | events, job-aggregate, pipeline | **HIGH (3/9)** |
| IF-3 | `CrmInterview.jobId` FK without `onDelete: Cascade` — blocks Job deletion | crm, job-aggregate, testing | **HIGH (3/9)** |
| IF-4 | `degradation.ts` direct-writes bypass ChannelRouter (InApp only) | connectors, notifications | **HIGH (2/9)** |
| IF-5 | `ActionResult.message` untyped cross-domain i18n contract | ui-infra, security | **HIGH (2/9)** |
| IF-6 | Promoter `findOrCreateCompany` skips `CompanyCreated` event | pipeline, security | **HIGH (2/9)** |
| IF-7 | `NotificationType` union fragmented across 7+ files | notifications | **HIGH (1/9)** |
| IF-8 | `Notification.data` blob leaked to webhooks without GDPR filter | notifications | **HIGH (1/9)** |
| IF-9 | AI modules bypass degradation bridge (`providers.ts:getModel()`) | connectors | **HIGH (1/9, = G2b)** |
| IF-10 | `emitEvent` fire-and-forget race with `acknowledgeExternalStop` | events | **MEDIUM (1/9)** |
| IF-11 | State Machine duplicate (`validate-edit-transition.ts` vs `status-machine.ts`) | crm | **MEDIUM (1/9)** |
| IF-12 | `DiscoveredJob` `as unknown as` type-cast on Automations page | pipeline | **MEDIUM (1/9, = G5)** |

---

## Detailed Findings

### IF-1 — Event Bus Bypass: Status-Change Paths Without Events (CRITICAL, 5/9 consensus)

**The single most dangerous coupling in the codebase.** Five agents independently identified that status changes via certain code paths bypass the event bus, leaving CRM timeline, notifications, and dashboard analytics blind.

| Path | Missing | Agents |
|------|---------|--------|
| `updateJob` (`job.actions.ts:514`) | `JobStatusChanged` + `JobStatusHistory` + side effects | crm, job-aggregate, events |
| API v1 `POST /jobs/:id/status` (`status/route.ts:86`) | `JobStatusChanged` event (history + side effects are correct) | security, crm, events |
| `promoter.ts:159` | `JobStatusChanged` for initial status (only emits `VacancyPromoted`) | events, pipeline |
| API v1 `POST /jobs` (`jobs/route.ts:89`) | `JobStatusChanged` + `CompanyCreated` + initial `JobStatusHistory` | security |

**Downstream impact:**
- `crm-activity-logger.ts:33` — CRM timeline has holes for these paths
- `notification-dispatcher.ts:554` — no notifications fire
- `dashboard.actions.ts` — `appliedDate` never set via `updateJob`, dashboard queries miss jobs
- All 4 notification channels (InApp, Webhook, Email, Push) affected

**Cross-references:** G1 in `session-2026-05-12-domain-expert-analysis.md`

---

### IF-2 — Event Payload Unsafe `as`-Casts (HIGH, 3/9 consensus)

All event consumers use `event.payload as XPayload` TypeScript casts without runtime validation. If a publisher changes the payload shape, consumers silently read `undefined` fields.

**Key coupling points:**
- `crm-activity-logger.ts:34` — `as JobStatusChangedPayload` (reads `previousStatusValue`, `historyEntryId`)
- `crm-activity-logger.ts:94` — `as InterviewScheduledPayload` (reads `jobId`, does DB lookup)
- `crm-activity-logger.ts:175` — `as CrmNoteCreatedPayload` (reads `noteId`, does 2 DB lookups)
- `notification-dispatcher.ts:433` — `as JobStatusChangedPayload`
- `enrichment-trigger.ts` — `as VacancyPromotedPayload` (reads `jobId`, `userId`)

**Additional risk from pipeline agent:** `promoter.ts:159` uses legacy `emitEvent()` with untyped object literal instead of `createEvent()` factory, so TypeScript doesn't validate the payload at the publisher side either.

**IDOR sub-finding (pipeline agent):** `crm-activity-logger.ts:198` uses `findUnique({ where: { id: payload.jobId } })` **without `userId`**, while `enrichment-trigger.ts` correctly uses `findFirst` with `userId`. Inconsistent ownership enforcement on event consumer side.

---

### IF-3 — `CrmInterview.jobId` FK Without Cascade (HIGH, 3/9 consensus)

`prisma/schema.prisma:972` — `CrmInterview.jobId` has no `onDelete: Cascade` or `onDelete: SetNull`.

**Impact:**
- `deleteJobById` (`job.actions.ts:573-581`) deletes `JobContact` but not `CrmInterview` — FK constraint crash if interviews exist
- API v1 DELETE (`route.ts:108-110`) deletes legacy `Interview` but not `CrmInterview` — same crash
- `e2e/cleanup-stale-data.ts:55` — E2E cleanup crashes on Jobs with CRM data, blocking entire E2E suite

**Testing agent adds:** The cleanup file needs 8 new deletion steps (ActivityLog, JobContact, CrmInterview, CrmNote, CrmTask, Person, CrmBlocklist, ConnectedAccount) before Job deletion. Currently has 0 of these.

**Cross-references:** G23 (divergent cascades), G28 (E2E cleanup order)

---

### IF-4 — `degradation.ts` Direct-Writes Bypass ChannelRouter (HIGH, 2/9 consensus)

Three sites in `degradation.ts` write notifications directly to DB, bypassing the `ChannelRouter`:
- `degradation.ts:165` — `auth_failure` (createMany)
- `degradation.ts:301` — `consecutive_failures` (create)
- `degradation.ts:412` — `cb_escalation` (createMany)

**Impact:** The highest-severity operational alerts (auth failure, circuit breaker) only reach InApp channel. Users who configured Email/Push/Webhook for automation failures receive nothing.

**Connectors agent adds:** These sites also use string literals for `pauseReason` (`"auth_failure"`, `"consecutive_failures"`, `"cb_escalation"`) and `titleKey` (`"notifications.authFailure.title"` etc.) as implicit contracts with the Pipeline UI and i18n system. Adding a new `pauseReason` string compiles cleanly but breaks the UI.

**Cross-references:** G3 in `session-2026-05-12-domain-expert-analysis.md`

---

### IF-5 — `ActionResult.message` Untyped Cross-Domain i18n Contract (HIGH, 2/9 consensus)

`ActionResult.message` carries either an i18n key (e.g., `"errors.duplicateEntry"`) or an English plaintext string (e.g., `"Failed to get resume list."`), with no type-level distinction.

**UI-infra agent identifies 3 sub-problems:**
1. `handleError` (`utils.ts:44-77`) mixes i18n keys and English strings in the same field
2. Half of consumers call `t(result.message)` (correct for keys), half display `result.message` directly (correct for plaintext)
3. CRM actions return keys that don't exist in the dictionary (`crm.errors.companyNotFound`, `crm.errors.multiplePrimaryCompanies`)

**Security agent identifies:** `inferErrorStatus` (`response.ts:118-149`) derives HTTP status codes via substring matching on `result.message` strings. Renaming an i18n key changes the HTTP status silently. `ActionResult.errorCode` exists but is ignored.

**Root cause (ui-infra agent):** `TranslationKey = string` — no compile-time key safety. Open Question Q4 in `specs/i18n-system.allium:304-306`.

---

### IF-6 — Promoter `findOrCreateCompany` Skips `CompanyCreated` Event (HIGH, 2/9 consensus)

`promoter.ts:228-266` creates Companies via `db.company.create()` without emitting `CompanyCreated`. The regular path (`company.actions.ts:151`) does emit it.

**Impact:** ~90% of Companies are created through the Promoter (automation pipeline). `enrichment-trigger.ts:196-248` subscribes to `CompanyCreated` for logo enrichment — never triggered for pipeline-created companies.

**Workaround exists:** `enrichment-trigger.ts:287-336` handles `VacancyPromoted` and extracts the company, but this is a secondary path that doesn't fire a generic `CompanyCreated` event.

**API v1 has the same gap:** `helpers.ts:32-38` `findOrCreate("company", ...)` also skips the event.

---

### IF-7 — `NotificationType` Union Fragmented Across 7+ Files (HIGH, 1/9)

The authoritative union (`notification.model.ts:1-18`, 15 members) is duplicated in:
- `webhook.actions.ts:22-33` — `VALID_NOTIFICATION_TYPES` (flat array, missing 5 CRM types)
- `WebhookSettings.tsx:63-74` — `WEBHOOK_EVENT_TYPES` (same gap)
- `deep-links.ts:198-347` — `buildNotificationActions()` switch (default: empty array)
- `templates.ts:28-44` — `SUBJECT_KEYS` Record
- `templates.ts:248-264` — `messageKeyMap` Record

Adding a new `NotificationType` requires updating 7 files manually. CRM notification types (`job_status_changed`, `interview_scheduled`, etc.) are already missing from webhook allowlists.

---

### IF-8 — `Notification.data` Blob Leaked to Webhooks Without GDPR Filter (HIGH, 1/9)

`webhook.channel.ts:303` sends `notification.data ?? {}` verbatim to external URLs. This blob contains:
- `payload.note` (user free-text from status changes)
- `automationName` (user-given name from degradation)
- Future: `personName`, `interviewNotes` (as CRM events expand)

No allowlist mechanism exists for webhook payloads. Email templates have `ALLOWED_DATA_FIELDS` but webhooks don't.

**GDPR Art. 5(1)(c) violation** — PII sent to user-controlled external endpoints without data minimization.

---

### IF-9 — AI Modules Bypass Degradation Bridge (HIGH, 1/9, = G2b)

`providers.ts:12-18` converts `{ success: false, error: { type: "auth_failed" } }` into a generic `throw new Error()`. The error type is lost. `handleAuthFailure()` in `degradation.ts` is never called for AI modules.

**Impact:** Expired OpenAI/DeepSeek API keys cause silent failures — no automation paused, no notification, no `AutomationDegraded` event.

**Cross-references:** G2b in `session-2026-05-12-domain-expert-analysis.md`

---

### IF-10 — `emitEvent` Fire-and-Forget Race With `acknowledgeExternalStop` (MEDIUM, 1/9)

`emitEvent()` (`events/index.ts:54-58`) is fire-and-forget (`.catch()`, no `await`). When `degradation.ts:173` calls it, `acknowledgeExternalStop` runs asynchronously. If someone changes to `await eventBus.publish()` (which the codebase recommends), the execution order changes deterministically, causing double `AutomationRunCompleted` events and corrupted `SchedulerSnapshot`.

**Events agent assessment:** "Die scheinbar harmlose Aenderung von `emitEvent()` zu `await eventBus.publish()` macht die Race Condition deterministisch statt probabilistisch und zerstoert die Scheduler-Buchhaltung."

---

### IF-11 — State Machine Duplicate Without Sync Test (MEDIUM, 1/9)

`validate-edit-transition.ts:11-21` is a deliberate duplicate of `status-machine.ts:22-34`. The edit-form version already lacks the `expired` status. No automated test ensures the two stay in sync.

Adding a new status (e.g., `withdrawn`) to the canonical machine makes it work everywhere except the edit form, where users get `errors.invalidTransition` with no explanation.

---

### IF-12 — `DiscoveredJob` `as unknown as` Type-Cast (MEDIUM, 1/9, = G5)

`automations/[id]/page.tsx:96` casts `StagedVacancyWithAutomation[]` to `DiscoveredJob[]` via `as unknown as`. The `discoveryStatus` field doesn't exist on the actual object, so `newJobsCount` badge always shows 0.

**Cross-references:** G5 in `session-2026-05-12-domain-expert-analysis.md`

---

## Additional Single-Agent Findings (Not Clustered)

| Agent | Finding | Risk |
|-------|---------|------|
| testing | `testFixtures.ts:916-936` MockConnector interfaces diverge from real `RegisteredModule` — tests compile with wrong shapes | HIGH |
| testing | 6 copies of `ensureResumeExists` across E2E specs — Toast text change in profile domain cascades to 5 files | MEDIUM |
| connectors | `EnrichmentCompleted` payload carries only lookup keys, not data — JSON blob `logoUrl` field is untyped contract | MEDIUM |
| connectors | Dual credential resolver (`credential-resolver.ts` vs `api-key-resolver.ts`) with duplicated logic | LOW |
| ui-infra | `not-found.tsx` and `error.tsx` have hardcoded English strings | LOW |
| ui-infra | Notification `titleKey` strings are literals without compile-time key existence check | MEDIUM |

---

## Priority Fix Roadmap

### Immediate (aligns with P0 fixes in next-session-prompt.md)

1. **IF-1 → Sprint 1:** Fix 4 event bus bypass paths (= G1)
2. **IF-3 partial → Sprint 2:** Add `CrmInterview` to `anonymizePerson` transaction (= G2/S5)
3. **IF-9 → Sprint 3:** Wire `handleAuthFailure` into AI modules (= G2b)
4. **IF-12 → Sprint 4:** Fix `discoveryStatus` cast (= G5)

### Next Sprint (dedicated)

5. **IF-2:** Add Zod runtime validation on event consumer side (or use `createEvent` factory consistently)
6. **IF-3 full:** Add `onDelete: Cascade` or manual cleanup for `CrmInterview.jobId` + update `deleteJobById` + E2E cleanup
7. **IF-4:** Route degradation notifications through `ChannelRouter` instead of direct Prisma writes
8. **IF-5:** Use `ActionResult.errorCode` in `actionToResponse` instead of `inferErrorStatus` substring matching
9. **IF-7:** Extract `NotificationType` allowlist into a shared constant used by webhook actions + settings UI

### Backlog

10. **IF-6:** Emit `CompanyCreated` from Promoter and API v1 `findOrCreate`
11. **IF-8:** Add webhook payload allowlist (similar to email `ALLOWED_DATA_FIELDS`)
12. **IF-10:** Document `emitEvent` vs `eventBus.publish()` contract, add architectural guard
13. **IF-11:** Add sync test between `validate-edit-transition.ts` and `status-machine.ts`

---

## Cross-References

- Prior analysis: `docs/session-2026-05-12-domain-expert-analysis.md` (G1-G29)
- GDPR audit: `docs/gdpr-audit-report.md` (S1-S6)
- Domain mapping: `.domain-experts/domains.json`
- Deferred items: `project_deferred_sprints_for_future_sessions.md`
