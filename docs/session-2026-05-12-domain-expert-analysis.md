# Domain Expert Cross-Domain Analysis — 2026-05-12

**Method:** 9 persistent domain expert agents, each holding one bounded context of the full codebase. Two rounds of cross-domain gap detection queries + targeted follow-ups.

**Agents:** crm, job-aggregate, connectors, pipeline, notifications, events, security, ui-infra, testing

**Domain mapping persisted:** `.domain-experts/domains.json`

---

## CRITICAL Findings

### G1 — 4 of 5 Status-Change Paths Bypass Event Bus / Audit Trail

**Consensus:** 5/9 agents (job-aggregate, security, pipeline, crm, events)

The `JobStatusChanged` event is the primary bridge between the Job aggregate and CRM/Notifications. Only 2 of 5 status-change paths fire it correctly.

| Path | `computeTransitionSideEffects` | `JobStatusHistory` | `JobStatusChanged` Event |
|------|-------------------------------|--------------------|-----------------------|
| `changeJobStatus` (job.actions.ts:698) | Yes (L754) | Yes (L778) | Yes (L792) |
| `updateKanbanOrder` cross-column (job.actions.ts:931) | Yes (L948) | Yes (L972) | Yes (L986) |
| **`updateJob`** (job.actions.ts:429) | **NO** | **NO** | **NO** |
| **API v1 `POST /jobs/:id/status`** (status/route.ts) | Yes (L80-83) | Yes (L97-105) | **NO** |
| **`promoter.ts`** (L135-168) | N/A (initial) | Yes (L140) | **NO** (only `VacancyPromoted`) |

**Additional API v1 gaps** (from security agent):

| API Route | Events skipped vs internal action | Other data skipped |
|-----------|----------------------------------|-------------------|
| `POST /jobs` | `JobStatusChanged` + `CompanyCreated` | Initial `JobStatusHistory` row |
| `PATCH /jobs/:id` | `CompanyCreated` (on new company via findOrCreate) | -- |
| `DELETE /jobs/:id` | -- | Divergent cascades (interviews vs jobContacts) |
| `POST /jobs/:id/notes` | -- | -- |
| `POST /jobs/:id/status` | `JobStatusChanged` | -- (sideEffects correct) |

**Consequences:**
- CRM timeline has holes for status changes via edit form, API v1, and promoted jobs
- Notifications never fire for these paths
- `applied`/`appliedDate` side-effects missing in `updateJob` -> Dashboard queries miss jobs
- Promoted jobs have no initial `JobStatusChanged` event -> CRM activity logger never records promotion as a status change

**Fix approach (from job-aggregate agent):**
- `updateJob`: detect status change at L500, delegate to `changeJobStatus` internally
- API v1 status route: add `emitEvent(createEvent("JobStatusChanged", {...}))` after transaction
- Promoter: add second `emitEvent` for `JobStatusChanged` after `VacancyPromoted`
- API v1 POST /jobs: add `JobStatusHistory` creation + `JobStatusChanged` + `CompanyCreated` events

---

### G2 — `anonymizePerson` Does Not Detach `CrmInterview.personId` (GDPR Art. 17)

**Consensus:** 2/9 agents (crm, events)

`person.actions.ts:353-386` cascade-deletes NoteTargets, TaskTargets, JobContacts, and anonymizes ActivityLog references, but **does not null out `CrmInterview.personId`**. After anonymization, interviews still reference the anonymized person via FK.

**Evidence:** `mergePersons` (L459-461) correctly handles interviews via `crmInterview.updateMany`, proving awareness of the relationship. The anonymize path omits it.

**GDPR impact:** `specs/crm-gdpr.allium:258-323` FulfillErasureRequest requires all person references nulled. Interview rows still correlate job + date + user to the anonymized person's UUID.

**Fix (exact, from crm agent):** Add one line to the transaction array in `person.actions.ts`, between L363-364:
```typescript
prisma.crmInterview.updateMany({
  where: { personId },
  data: { personId: null },
}),
```

---

### G2b — AI Provider Modules Bypass Degradation Entirely

**Source:** connectors agent

OpenAI/DeepSeek modules return `{ success: false, error: { type: "auth_failed" } }` on 401/403, but this result is silently consumed by `getModel()` in `providers.ts:13-18` which throws a generic `Error`. The degradation system (`handleAuthFailure`) is never called.

**Impact:** Expired AI API keys cause silent failures — no automation paused, no notification, no `AutomationDegraded` event. Spec violation: `AuthFailureEscalation` rule requires immediate pause for `credential.required: true` modules.

**Root cause:** AI modules use legacy `resolveApiKey` (no auth-failure callback) instead of manifest-driven `resolveCredential`. No AI-specific runner bridges `auth_failed` results to `degradation.ts`.

**Fix:** Wire `handleAuthFailure(moduleId, error)` into each AI module's 401/403 branch, or create an AI runner that catches `auth_failed` results.

---

## HIGH Findings

### G3 — Degradation Notifications Only Reach InApp Channel

**Source:** notifications agent

5 legacy direct-writer sites bypass ChannelRouter (in-app only):
- `degradation.ts:165` — `auth_failure` (createMany)
- `degradation.ts:301` — `consecutive_failures` (create)
- `degradation.ts:412` — `cb_escalation` (createMany)
- `webhook.channel.ts:216` — delivery failure (by design, recursion protection)
- `webhook.channel.ts:260` — endpoint auto-deactivation (by design)

The 3 degradation sites produce the highest-severity operational alerts. Users who configured email/push specifically for automation failures receive nothing on those channels.

All 8 notification dispatcher subscriptions correctly route through ChannelRouter -> all 4 channels.

**Fix:** Add `AutomationDegraded` subscription to notification-dispatcher, replace direct writes with event emission.

---

### G4 — CRM: Zero E2E Tests + Missing Cleanup Infrastructure

**Source:** testing agent

- 0 E2E tests for Person, CrmInterview, CrmTask, CrmNote, CrmActivityLog, CrmBlocklist
- `e2e/cleanup-stale-data.ts` does not clean up any CRM entities (8 Prisma models missing)
- Routes exist: `/dashboard/contacts`, `/dashboard/contacts/[id]`, `/dashboard/interviews`, `/dashboard/crm-tasks`
- Future E2E tests or side-effect-creating code paths will accumulate phantom data

---

### G5 — `newJobsCount` Silently Always Zero

**Source:** pipeline agent

`src/app/dashboard/automations/[id]/page.tsx:222`:
```typescript
const newJobsCount = jobs.filter((j) => j.discoveryStatus === "new").length;
```
`discoveryStatus` is a deprecated field from `DiscoveredJob` type. At runtime, data is `StagedVacancyWithAutomation` which has `status` not `discoveryStatus`. Result: badge never shows, user sees "0 new" when there are unreviewed vacancies.

**Fix:** `jobs.filter((j) => j.status === "staged").length`

---

### G8 — `ApiKeyModuleId` Missing `logo_dev`

**Source:** connectors agent

`logo_dev` is declared in the Logo.dev manifest (`credential.moduleId: "logo_dev"`) but NOT in:
- `src/models/apiKey.model.ts` TypeScript union: `"openai" | "deepseek" | "ollama" | "rapidapi"`
- `src/models/apiKey.schema.ts` Zod enum: same 4 values

Users cannot save a Logo.dev API key — Zod validation rejects `moduleId: "logo_dev"`.

**Fix:** Add `"logo_dev"` to both the TypeScript union and Zod enum.

---

### G9 — `ContactDeleted` Has No CRM Activity Logger Consumer

**Source:** events agent (Bucket B classification)

`ContactDeleted` is published by `anonymizePerson` and `mergePersons`, but the CRM Activity Logger does not subscribe to it. `ContactCreated` and `ContactUpdated` both project to the timeline. Anonymization/merge events are invisible in the CRM timeline.

---

### G10 — Zero CRM Fixtures in `testFixtures.ts`

**Source:** testing agent

`src/lib/data/testFixtures.ts` (1,314 lines) has fixtures for 18 entity types but zero CRM entities: no Person, CrmInterview, CrmTask, CrmNote, CrmActivityLog, JobContact, CrmBlocklist, ConnectedAccount. The 227 CRM unit tests use inline mocks -> fixture drift risk when models change.

---

## MEDIUM Findings

| ID | Finding | Source | Detail |
|----|---------|--------|--------|
| G6 | `NotificationCreated` event: dead code (Bucket C) | events | Defined + typed + in spec, 0 publishers + 0 consumers. Wire or delete. |
| G7 | 14 hardcoded English strings in 7 files | ui-infra | Top: `ai.utils.ts` (6), `dialog.tsx`/`sheet.tsx` sr-only "Close" (2), `ComboBox.tsx` aria-live (1), `command.tsx` (2), `toast.tsx` (1), `DisplaySettings.tsx` (1), `NumberCard.tsx` (1) |
| G11 | `validate-edit-transition.ts` missing `expired` status | crm (2x) | Code has `expired` in canonical machine, duplicate lacks it |
| G12 | `reference-data.ts` vs `promoter.ts` duplication | pipeline (2x) | `findOrCreate*` functions duplicated — promoter has race-condition handling, reference-data doesn't |
| G13 | Webhook events missing 5 CRM types | notifications | `VALID_NOTIFICATION_TYPES` has 10 of 15 types |
| G14 | Push notifications always `/dashboard` | notifications | `PushChannel` hardcodes URL, doesn't use deep links |
| G15 | No notification retention cleanup | notifications | Spec: 30 days, no implementation |
| G16 | `event-bus.allium` spec drift (20 vs 28 types) | events | 9 CRM events missing from spec |
| G17 | `rescheduled -> rescheduled` transition missing | crm (2x) | Spec when-guard accepts it, transition table doesn't |
| G18 | `PersonDetailClient` hardcoded `toLocaleDateString()` | crm (2x) | 4 sites should use `formatDateShort(date, locale)` |
| G23 | API v1 DELETE divergent cascades | security | Route deletes interviews, internal action deletes jobContacts |
| G24 | `Company.logoUrl` mutation has no event (latent) | connectors | `logo-writeback.ts` writes directly, no `CompanyUpdated` event exists |

---

## Event System Health

```
28 defined events
  A (Published + real consumer):     18
  B (Published, only AuditLogger):   10
    - 5 intentional (Scheduler/Enrichment operational)
    - 4 design decision (Vacancy lifecycle -> CRM?)
    - 1 gap: ContactDeleted
  C (Never published):                1
    - NotificationCreated (dead code)
```

---

## Cross-Reference: New vs Previously Known

| Finding | Status |
|---------|--------|
| G1 updateJob bypass | **NEW** — not in any prior deferred list |
| G1 API v1 status bypass | **NEW** |
| G1 promoter bypass | **NEW** |
| G1 API v1 POST /jobs bypass | **NEW** |
| G2 anonymizePerson GDPR | **NEW** — not caught by prior security audits |
| G2b AI degradation bypass | **NEW** |
| G3 degradation InApp-only | KNOWN — deferred as "AutomationDegraded -> CRM" |
| G4 CRM E2E | KNOWN — deferred |
| G5 newJobsCount | **NEW** |
| G6 NotificationCreated dead | **NEW** |
| G7 hardcoded English | Partially known (ai.utils.ts new, dialog/sheet new) |
| G8 ApiKeyModuleId | **NEW** |
| G9 ContactDeleted no consumer | **NEW** |
| G10 CRM fixtures | **NEW** |
| G11 expired transition | **NEW** |
| G12 reference-data duplication | KNOWN — deferred |
| G13-G18 | Mix of new and known |

**New findings this session: 12 of 24** (50% net-new discoveries from 9-agent analysis)

---

## Round 3 — Targeted Follow-Up Queries (all 9 agents)

### G2c — CrmActivityLog Text Fields Retain Person PII After Anonymization

**Source:** crm agent, Round 3

`anonymizePerson` nulls `targetPersonId` on CrmActivityLog but does NOT scrub `details` (JSON String) or `linkedRecordName` (String). If the CRM activity logger wrote "Interview scheduled with Alice Smith" into these fields, that PII survives anonymization. The spec at `specs/crm-gdpr.allium:301-306` has the same gap — it only requires `ta.target_person = null`.

**Fix:** Add `details: null, linkedRecordName: null` to the `crmActivityLog.updateMany` data block in the anonymize transaction (`person.actions.ts:361-364`). Update spec to match.

### G25 — mergePersons Creates Duplicate CrmTaskTarget/CrmNoteTarget Rows

**Source:** crm agent, Round 3

When both winner and loser have targets on the same CrmTask or CrmNote, `mergePersons` transfers loser's targets to winner without dedup check. Result: task/note appears to have the winner listed twice. Not a GDPR issue but a data integrity gap.

**Fix:** Pre-read conflicting target rows (like the existing `duplicateJobIds` dedup for JobContact at `person.actions.ts:440-445`) and delete them before transferring.

### G26 — Env-Var Startup Validation Gaps

**Source:** security agent, Round 3

| Env Var | Checked at startup? | Failure mode |
|---------|--------------------|----|
| `AUTH_SECRET` | Docker only (`docker-entrypoint.sh:5`) | Ephemeral sessions or runtime error with `bun run dev` |
| `ENCRYPTION_KEY` | **Never** | Runtime throw on first encrypt/decrypt (deferred, user-facing) |
| `ADMIN_USER_IDS` | **Never** | Silent admin privilege revocation after 2nd user signup |
| `DATABASE_URL` | Prisma (immediate) | No gap |

**Fix location:** `instrumentation.ts` — runs once on Node.js startup regardless of deployment method. Add validation block before scheduler/event registration.

### G27 — CRM i18n Gaps

**Source:** ui-infra agent, Round 3

**2 missing keys** (render as raw key strings in all locales):
- `crm.errors.companyNotFound` — used in `crmTask.actions.ts:82`, `crmNote.actions.ts:71`
- `crm.errors.multiplePrimaryCompanies` — used in `person.actions.ts:84,245`

**21 dead/pre-provisioned keys** in `crm.ts`:
- Blocklist UI (9 keys) — no component exists yet
- Notes CRUD (7 keys) — tab is read-only, no inline editing
- Merge contacts UI (3 keys) — action exists, no UI button
- Misc (2 keys) — `crm.save`, `crm.addSocialProfile` unused

**7 hardcoded English strings** in CRM components:
- `InterviewsPageClient.tsx:160,170,192,212` — `"Error"` toast fallbacks
- `InterviewsPageClient.tsx:130` — `"Failed to load interviews"`
- `InterviewsPageClient.tsx:315` — `<span className="sr-only">Actions</span>`
- `InterviewsPageClient.tsx:380` — `Retry` button label
- `CrmTasksPageClient.tsx:105` — `"Unknown error"` fallback
- `PersonDetailClient.tsx:296` — `<CardTitle>GDPR</CardTitle>` hardcoded
- `PersonDetailClient.tsx:309` — `toLocaleDateString()` without locale

### G28 — CRM E2E Cleanup FK Dependency Order

**Source:** testing agent, Round 3

`e2e/cleanup-stale-data.ts` needs 8 new steps inserted after existing Step 3 (Task), before Step 4 (old Interview):

```
CRM-1: CrmActivityLog   (references Person, Company, Job)
CRM-2: JobContact        (required FKs to Job + Person)
CRM-3: CrmInterview      (required FK to Job, NO onDelete:Cascade)
CRM-4: CrmNote           (CrmNoteTarget auto-cascades)
CRM-5: CrmTask           (CrmTaskTarget auto-cascades)
CRM-6: Person            (now free of inbound references)
CRM-7: CrmBlocklist      (User-only FK)
CRM-8: ConnectedAccount  (User-only FK)
```

**Critical:** `CrmInterview` has NO `onDelete: Cascade` — will block Job deletion at existing Step 6 with FK violation if not cleaned first.

### G29 — DiscoveredJob Type Cast Masks Compile-Time Errors

**Source:** pipeline agent, Round 3

`automations/[id]/page.tsx:96` uses `as unknown as DiscoveredJob[]` cast, erasing type safety. `discoveryStatus` is the only current broken access, but any future deprecated field access would compile silently.

**Fix:** Change type to `StagedVacancyWithAutomation[]` and remove the cast. Update the `newJobsCount` filter to `status === "staged"`.

### Additional Expert Context (for implementation reference)

**deleteJobById test root cause** (job-aggregate agent): Mock client missing `jobContact: { deleteMany: jest.fn() }`. Array elements in `$transaction([...])` evaluate eagerly, so `prisma.jobContact.deleteMany(...)` throws `TypeError` before transaction executes. Fix: add mock + `$transaction` implementation that resolves the array.

**extractDomain Unicode fix** (connectors agent): Add `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` between `.toLowerCase()` (L26) and `.replace(/[^a-z0-9]/g, "")` (L27) in `domain-extractor.ts`. Plus `.replace(/ß/g, "ss")` before normalize for German names.

**retention_expired semantics fix scope** (notifications agent): 10 files — type union, dispatcher maps (3), deep-links, severity, email subject+message keys, i18n × 4 locales, optionally webhook event types + allium spec. `follow_up_due` reason is dead code in type union.

**Consumer test strategy** (events agent): Real eventBus + mocked Prisma for `crm-activity-logger` (pattern from `degradation-coordinator.spec.ts`). Real SQLite for `crm-cron` (idempotency guards depend on DB engine).

---

## GDPR Compliance Audit (8 Domain Experts)

Full report: `docs/gdpr-audit-report.md`

**Results:** 22 FAIL / 20 PARTIAL / 13 PASS across 60 checks in 8 domains.

**6 systemische Kern-Probleme:**
- S1: Kein Account-Deletion-Feature (31/35 User-FK ohne Cascade) — Art. 17
- S2: Kein Data Export/Portability — Art. 15, 20
- S3: Resume PII unredacted an OpenAI/DeepSeek — Art. 5(1)(c), 28, 44
- S4: Keine Retention Policies (Jobs, Notifications, EnrichmentLogs) — Art. 5(1)(e)
- S5: Person-PII ueberlebt Anonymisierung (6 Cascade-Gaps) — Art. 17
- S6: Kein GDPR Audit Trail — Art. 5(2)
