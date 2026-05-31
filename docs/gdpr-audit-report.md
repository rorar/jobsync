> **[SUPERSEDED → docs/BACKLOG.md]** (2026-05-31) — Status hier VERALTET. Mehrere FAIL/PARTIAL
> sind code-verifiziert erledigt (Account-Deletion, DSAR, Retention-Cron, PII-Egress, G3/G6/G27,
> Cache-Control). Echt offene GDPR-Items in BACKLOG §1b. Dieses Dokument nur als Audit-Historie.

# GDPR Compliance Audit Report — JobSync

**Date:** 2026-05-12
**Method:** 8 domain expert agents, each auditing their bounded context against GDPR checklist derived from `/hr-legal-compliance:gdpr-data-handling` skill.
**Scope:** Full codebase (887 source files across 9 domains, testing domain excluded from GDPR audit).

---

## Executive Summary

| Domain | FAIL | PARTIAL | PASS | Total Checks |
|--------|------|---------|------|-------------|
| CRM | 4 | 3 | 2 | 10 |
| Job Aggregate | 4 | 2 | 0 | 7 |
| Connectors | 4 | 1 | 0 | 7 |
| Pipeline | 2 | 2 | 2 | 6 |
| Notifications | 3 | 2 | 2 | 7 |
| Events | 2 | 1 | 3 | 6 |
| Security | 2 | 6 | 0 | 9 |
| UI Infrastructure | 1 | 3 | 4 | 8 |
| **TOTAL** | **22** | **20** | **13** | **60** |

---

## Systemische Kern-Probleme (domain-uebergreifend)

### S1 — Kein Account-Deletion-Feature (Art. 17)

**Severity:** CRITICAL
**Affected:** ALL 8 domains

No `deleteUser`, `deleteAccount`, or `purgeUserData` function exists anywhere in the codebase. 31 of 35 User FK relations in the Prisma schema lack `onDelete: Cascade`. A `prisma.user.delete()` call would fail with FK constraint errors on Job, Note, Automation, StagedVacancy, ApiKey, EnrichmentResult, EnrichmentLog, LogoAsset, Notification, UserSettings, and many more.

Only 4 models cascade: WebhookEndpoint, SmtpConfig, VapidConfig, WebPushSubscription.

The `invalidateAllChannels(userId)` method on ChannelRouter is documented as "GDPR Art. 17 preparation (Roadmap 6.1)" but the feature it prepares for does not exist.

### S2 — Kein Data Export/Portability (Art. 15, 20)

**Severity:** HIGH
**Affected:** crm, job-aggregate, ui-infra

No DSAR handler, no "Export my data" button, no structured data export. `getJobsIterator` covers only core Job fields (no Notes, Activities, Tasks, Questions, StatusHistory, matchData). CRM has no `exportPersonData` function despite the spec defining `PersonDataExport` at `specs/crm-gdpr.allium:94-111`. The `DataSubjectRequest` entity from the spec has no Prisma model.

### S3 — Resume PII an Cloud-APIs (Art. 5(1)(c), 28, 44) — RESOLVED (2026-05-29)

**Severity:** HIGH → **RESOLVED**
**Affected:** connectors

**Original finding:** `convertResumeToText()` included full name, email, phone, address, employment history, sent verbatim to OpenAI (US) and DeepSeek (China). No PII stripping.

**Resolution (GDPR S3 sprint + PII-Egress-Härtung):** Direct identifiers are now redacted on every cloud transfer. The redaction policy is centralised in the dependency-free leaf `src/lib/pii` (`redactContact` → `[NAME]/[EMAIL]/[PHONE]/[ADDRESS]`; `scrubFreeText`/`stripEmailPhonePatterns` for email+phone in free text). Applied as `stripPii = !isLocal` at all **three** AI-transfer sites: `resume/review` + `resume/match` route handlers and the automation runner's `convertResumeForMatch`/`matchJobToResume`. Local Ollama keeps full fidelity (no third-party transfer). `TEXT_LIMITS` are applied (`resumeCharLimit`/`jobCharLimit`). Authoritative spec: `specs/ai-provider.allium` `@invariant CloudTransferDataMinimization`.

**Residual risk (accepted, documented):** names/addresses voluntarily embedded in free text, Unicode/IDN emails (ASCII regex), and Art. 9 special-category data — reliable NER detection is disproportionate and would corrupt the professional content the model needs.

**Art. 13/30 recipient declaration (DSAR/RoPA — for the operator's privacy notice):** When a cloud AI module is configured and active, the resume/job text (with direct identifiers redacted per above) is transmitted to a third-party recipient acting as a **processor**:

| Recipient | Role | Country (Art. 44 transfer) | Data transferred | Trigger |
|---|---|---|---|---|
| OpenAI | Processor | USA | Redacted resume + job text | Active `openai` AI module on resume review / job match / automation AI scoring |
| DeepSeek | Processor | China | Redacted resume + job text | Active `deepseek` AI module on the same paths |
| Ollama (self-hosted) | — (no transfer) | local | Full-fidelity resume + job text | Default; stays on the operator's own infrastructure |

Operators using a cloud AI module MUST list the configured provider as a recipient in their privacy notice (Art. 13(1)(e)) and Record of Processing (Art. 30), and ensure an Art. 28 DPA + Art. 44+ transfer safeguard is in place. No cloud transfer occurs with the default local Ollama configuration.

### S4 — Keine Retention Policies (Art. 5(1)(e))

**Severity:** HIGH
**Affected:** job-aggregate, notifications, connectors, events

- Jobs, Notes, Activities, Tasks, Questions: accumulate indefinitely, no TTL, no purge
- Notifications: spec says 30 days (`notification-dispatch.allium:79`), no implementation
- EnrichmentLog: append-only, no cleanup code exists
- AdminAuditLog: `@@index([timestamp])` comment references "retention sweep" that doesn't exist
- CrmActivityLog: `timelineRetentionDays: 1095` defined in config, not enforced

### S5 — Person-PII ueberlebt Anonymisierung (Art. 17)

**Severity:** CRITICAL
**Affected:** crm, events

6 specific gaps in `anonymizePerson` at `person.actions.ts:353-386`:

| Entity | Field | Gap |
|--------|-------|-----|
| CrmInterview | personId | FK not nulled |
| CrmInterview | notes | Free-text not scrubbed |
| CrmInterview | outcomeNotes | Free-text not scrubbed |
| CrmActivityLog | details | JSON not scrubbed (may contain person name) |
| CrmActivityLog | linkedRecordName | Stores person full name, not scrubbed |
| CrmBlocklist | handle | Email/phone of anonymized person persists |

The CRM Activity Logger at `crm-activity-logger.ts:57-67` writes person full name into `linkedRecordName` on ContactCreated events. This PII survives anonymization because the anonymize transaction only nulls `targetPersonId`, not the text fields.

### S6 — Kein GDPR Audit Trail (Art. 5(2))

**Severity:** HIGH
**Affected:** job-aggregate, security, crm

- Job CRUD: no audit logging. Job deletion leaves zero record the data ever existed.
- Note CRUD: no audit logging.
- CRM read access: no logging of who viewed person data.
- CRM modifications: domain events exist but may not be persisted.
- AdminAuditLog retains `actorEmail` indefinitely with no anonymization path and no documented legal basis.

---

## Per-Domain Audit Details

### CRM Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | PASS | 14 Basic PII fields on Person, all classified. No sensitive/criminal/children's data. |
| 2 | Legal Basis | PARTIAL | `processingBasis` tracked but never enforced. Write-only metadata. No consent withdrawal. |
| 3 | Right to Erasure | FAIL | 6 cascade gaps (CrmInterview FK+notes, ActivityLog text, Blocklist handle). `person.actions.ts:353-386` |
| 4 | Right to Access | FAIL | No export function. Spec defines `PersonDataExport` but no implementation. |
| 5 | Right to Rectification | PARTIAL | Direct PII fields updatable. Immutable ActivityLog retains old names. |
| 6 | Data Retention | PARTIAL | `retentionExpiresAt` field exists. Timeline retention config defined but not enforced. |
| 7 | Encryption at Rest | FAIL | All Person PII plaintext in SQLite. Only ConnectedAccount tokens encrypted. |
| 8 | Data Minimization | PASS | Only email required for creation. All other fields optional. |
| 9 | Audit Logging | FAIL | No read-access logging. No field-level change tracking. Actor fields overwritten on each update. |
| 10 | Consent Management | FAIL | Static enum, no timestamp, no withdrawal mechanism, no enforcement, no granularity. |

### Job Aggregate Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | PARTIAL | Free-text PII in Note.content, Job.description, Job.matchData, StatusHistory.note. Not classified. |
| 2 | Right to Erasure | FAIL | No user deletion flow. No cascade for Activity, Task, Question, Company, Blacklist. Interview FK blocks Job deletion. |
| 3 | Right to Access | PARTIAL | `getJobsIterator` exports core fields only. Notes, Activities, Tasks, Questions, StatusHistory, matchData missing. |
| 4 | Data Retention | FAIL | Zero retention policy on any entity. All data accumulates indefinitely. |
| 5 | Encryption at Rest | FAIL | No Job aggregate field encrypted despite free-text PII. |
| 6 | Data Minimization | PARTIAL | List/Kanban views well-minimized. `getJobDetails` over-exposes matchData. Dashboard uses broad `include`. |
| 7 | Audit Logging | FAIL | Zero GDPR audit trail for any CRUD operation. |

### Connectors Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | FAIL | Resume PII (name, email, phone, address) sent unredacted to cloud APIs. `preprocessing.ts:96-194` |
| 2 | DPA Documentation | FAIL | No DPA registry, no privacy impact assessment, no sub-processor documentation. |
| 3 | Encryption at Rest | PARTIAL | API keys AES-encrypted. But ApiKey, EnrichmentResult, EnrichmentLog, LogoAsset lack `onDelete: Cascade`. |
| 4 | Data Minimization | FAIL | `TEXT_LIMITS` defined but never applied. Full resume with contact PII sent to cloud. |
| 5 | Right to Erasure | FAIL | No cascade on User deletion. Logo files on disk have no bulk cleanup. |
| 6 | Third-Party Transfers | PARTIAL | Logo.dev/Google Favicon receive company domains linked to user activity. Not documented. |
| 7 | Retention | FAIL | EnrichmentLog append-only, no cleanup. EnrichmentResult TTL not enforced in DB. |

### Pipeline Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | PARTIAL | matchData is unclassified derived PII from user resume. |
| 2 | Right to Erasure | PARTIAL | No cascade on User deletion for StagedVacancy, DedupHash, Automation. |
| 3 | Data Retention | PASS | DedupHash truly one-way SHA-256 of source IDs. Full vacancy data purged. |
| 4 | AI Matching Data | FAIL | matchData persists indefinitely on promoted vacancies. No erasure path. |
| 5 | Automation Logs | PASS | Ephemeral in-memory, never persisted, auto-expire after 1 hour. |
| 6 | Undo Store | FAIL | No `purgeByUserId`. Compensation closures hold user references. |

### Notifications Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | PARTIAL | `note` and `automationName` in Notification.data are potential PII. Credentials encrypted. |
| 2 | Right to Erasure | FAIL | Notification model lacks `onDelete: Cascade`. No account deletion feature. |
| 3 | Webhook Delivery | FAIL | Entire `notification.data` blob sent verbatim to external URLs. No field filtering. |
| 4 | Email Content | PARTIAL | Allowlist limits interpolation. `automationName` passes through. User-to-self lower risk. |
| 5 | Push Notifications | PASS | Payload contains only i18n message + fixed URL. No caching. |
| 6 | Retention | FAIL | Spec says 30 days, no implementation. PII accumulates forever. |
| 7 | Encryption | PASS | All credentials AES-256-GCM encrypted. Decrypted only at send time in server-only modules. |

### Events Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Event Payload PII | PASS | Payloads carry IDs not names. Caveat: `companyName` and task `title` are free-text. |
| 2 | AuditLogger Persistence | FAIL | Logs ALL event payloads to stdout unconditionally. No disable mechanism. No retention. |
| 3 | CrmActivityLog PII | FAIL | `linkedRecordName` stores person full name. Survives anonymization. `crm-activity-logger.ts:57-67` |
| 4 | Notification Dispatcher | PARTIAL | `note` field transits into persistent Notification.data. No scrubbing. |
| 5 | Enrichment Trigger | PASS | Company.domain is not PII for incorporated entities. |
| 6 | Scheduler | PASS | RunLock ephemeral in-memory. Per-user SSE filtering. |

### Security Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | PII Inventory | PARTIAL | No formal ROPA. PII locations identified by code inspection only. |
| 2 | Password Security | PARTIAL | bcrypt 10 rounds PASS. No data export/portability FAIL. |
| 3 | Right to Erasure | FAIL | No account deletion. 31/35 FK relations lack cascade. AdminAuditLog retains actorEmail by design. |
| 4 | API Key Security | PARTIAL | SHA-256 hashing solid. Correlation risk (keyPrefix+lastUsedAt) undisclosed. |
| 5 | Encryption Module | PARTIAL | Strong crypto. No key rotation. Key change = permanent data loss. |
| 6 | Admin Audit Log | FAIL | PII (actorEmail) retained indefinitely. No retention policy. No anonymization. No documented legal basis. |
| 7 | Session Data | PARTIAL | Cookie flags delegated to NextAuth defaults (adequate but implicit). Session lifetime undocumented. |
| 8 | Security Headers | PARTIAL | Missing CSP. Other headers adequate. |
| 9 | Rate Limiting IPs | PARTIAL | Auth rate limiter: unbounded IP accumulation, no cleanup. API limiter: has cleanup. No legal basis documented. |

### UI Infrastructure Domain

| # | Check | Verdict | Evidence |
|---|-------|---------|----------|
| 1 | Local Storage | PASS | 5 keys, all UI preferences, zero PII. |
| 2 | Cookies | PARTIAL | JWT contains email+name via NextAuth default. Only `id` needed by app. |
| 3 | Error Reporting | PASS | Dev-only, in-memory, no external service. |
| 4 | Browser Cache | PARTIAL | `/api/v1/*` routes lack `Cache-Control: no-store` on PII responses. |
| 5 | Console Logging | PASS | No PII interpolated in client console calls. |
| 6 | Form Data | PARTIAL | CRM forms pre-fill third-party PII with no `autocomplete="off"`. |
| 7 | Data Export | FAIL | No GDPR Art. 20 data portability/export function in UI. |
| 8 | Third-Party Scripts | PASS | Zero external analytics, tracking, or CDN dependencies. |

---

## Priority Fix Roadmap

### Phase 1 — CRITICAL (Art. 17 Erasure Compliance)

1. **Fix anonymizePerson cascade** — Add CrmInterview.personId null, scrub notes/outcomeNotes, scrub ActivityLog details/linkedRecordName, clean CrmBlocklist handle. `person.actions.ts:353-386`. Effort: 2 hours.
2. **Add `onDelete: Cascade` to all User FK relations** — Migration adding cascade to 31 relations. Prerequisite for account deletion. Effort: 1 day (migration + test all cascades).
3. **Implement deleteAccount server action** — Ordered deletion following FK dependency chain, fire-and-forget logo file cleanup, event emission. Effort: 1 day.

### Phase 2 — HIGH (Data Minimization + Access)

4. **Strip PII from AI prompts** — Add `stripContactPII()` before `buildJobMatchPrompt`/`buildResumeReviewPrompt`. Apply `TEXT_LIMITS`. Effort: 2 hours.
5. **Implement DSAR data export** — `exportUserData()` action aggregating Jobs, Notes, Activities, Tasks, Questions, CRM Persons, Automations into JSON. Effort: 1 day.
6. **Add notification retention cron** — Delete notifications older than 30 days. Effort: 1 hour.
7. **Add EnrichmentLog cleanup** — Purge entries older than 90 days. Effort: 1 hour.
8. **Webhook payload field filtering** — Add allowlist matching email template pattern. Effort: 2 hours.

### Phase 3 — MEDIUM (Audit + Compliance Documentation)

9. **Add env-var startup validation** — ENCRYPTION_KEY + AUTH_SECRET checks in `instrumentation.ts`. Effort: 30 min.
10. **Add GDPR audit logging** — Log PII access/modification events for Job and CRM domains. Effort: 1 day.
11. **Document DPA registry** — Which APIs receive what PII categories. Effort: 2 hours (documentation only).
12. **Add CSP header** — Content-Security-Policy in middleware. Effort: 2 hours.
13. **Add API v1 Cache-Control headers** — `no-store` on all PII-returning routes. Effort: 30 min.
14. **JWT PII minimization** — Strip `token.name`/`token.email` from NextAuth JWT (only `id` needed). Effort: 30 min.
15. **AdminAuditLog retention policy** — Anonymize actorEmail after configurable period. Document legal basis. Effort: 2 hours.
