# JobSync — Konsolidiertes Backlog

**Erstellt:** 2026-05-31 | **Verifiziert gegen:** HEAD `663ff21` (Knowledge-Graph `c8e99df` + Code-grep)
**Methode:** 2 Runden, 9 parallele Scan-Agenten über ALLE `.md` (539 Repo + 8 Home-Dir) + Knowledge-Graph + Code-grep-Konfliktauflösung.
**Runde 2 (lückenlos):** 64 ungescannte Repo-Docs (ADRs/architecture/alte-prompts/specs) + 8 Home-Dir-Docs + WCAG-35 + Tech-Debt-Claims einzeln code-verifiziert.

> **Drift-Quote gemessen:** Scan-Agenten meldeten ~38 längst-gefixte Items als offen (lasen stale
> Analyse-Docs). Einzel-Verifikation: WCAG 11/35 gefixt (31%), Tech-Debt 11/20 gefixt (55%),
> Home-Dir 4/4 "neue" Items gefixt (100%). **Code-grep = einzige Wahrheit.** Alles unten verifiziert.

> **Single Source of Truth.** Diese Datei ersetzt verstreute Offene-Items-Listen aus:
> `s2-ux-polish-session.md`, `add-job-modal-ux-findings.md`, `open-items-2026-05-13.md`,
> `session-2026-05-12-open-items.md`, `gdpr-audit-report.md`, `interface-fragility-analysis.md`,
> `project_deferred_sprints_for_future_sessions.md`, `project_next_session_planning.md`,
> `project_s5b_deferred_items.md` + Memory-Handoffs.
> Quell-Dateien bleiben als Detail-Referenz; Status-Wahrheit lebt HIER.

> **Verifikations-Disziplin (Lehre dieser Session):** Doku-Wort "DONE"/"FIXED"/"FAIL" ist KEIN
> Beweis. Jeder Status unten ist code-grep-verifiziert. Scan-Agenten meldeten 9 längst-gefixte
> Items als "CRITICAL OPEN" (sie lasen veraltete Analyse-Docs). Code gewinnt immer.

---

## 0. Doku-Drift bereinigt (verifiziert ERLEDIGT, war fälschlich als offen gelistet)

Diese Items wurden von Scan-Agenten als offen/FAIL gemeldet, sind aber code-verifiziert **erledigt**.
Quell-Docs sollten entsprechend aktualisiert/markiert werden.

| Item | Behauptet offen in | Code-Beweis | Verdikt |
|------|--------------------|-------------|---------|
| Account Deletion (Art. 17) | gdpr-audit-report | `account.actions.ts` + `lib/account/execute-deletion.ts` | ERLEDIGT |
| DSAR Data-Export (Art. 15/20) | gdpr-audit, B2-scan | `lib/export/collect-user-data.ts` + `api/users/export/route.ts` | ERLEDIGT |
| PII-Egress Redaction | gdpr-audit | `lib/pii/index.ts` @ 3 AI-egress sites | ERLEDIGT |
| Retention-Cron | gdpr-audit, B2-scan | `instrumentation.ts:33-34` `startRetentionCron()` | ERLEDIGT |
| G1/IF-1 Event-Bus-Bypass (updateJob) | domain-expert, B2-scan | `job.actions.ts:524` statusChanged + `:593` emit | ERLEDIGT |
| F8 addJob statusId-Validierung | test-blindspots, B6-scan | `job.actions.ts:367-372` statusExists | ERLEDIGT |
| IF-3 CrmInterview.jobId Cascade | interface-fragility, B6-scan | `schema.prisma:1013` `onDelete: Cascade` | ERLEDIGT |
| IF-8 Notification.data Webhook-PII | interface-fragility, B6-scan | `webhook.channel.ts:97` `filterWebhookData` + allowlist | ERLEDIGT |
| Gap-2 Company.domain | crm-gap-analysis, B6-scan | `schema.prisma:306` + `enrichment-trigger.ts:214` autofill | ERLEDIGT |
| PERF-3 DispatchContext | s5b-report, B5-scan | `lib/notifications/dispatch-context.ts` | ERLEDIGT |
| PERF-2 async pbkdf2 | s5b-report, B5-scan | Memory `30ef25e` (LRU derived-key cache) | ERLEDIGT |
| G2/G2a/G2c anonymizePerson cascades | gdpr-audit | `person.actions.ts:382-428` | ERLEDIGT |
| G5 newJobsCount, G7 i18n, G9 ContactDeleted consumer | domain-expert | siehe project_next_session verifications | ERLEDIGT |
| F-AJ-01 Titel volle Breite | add-job-findings (frühere Session) | `AddJob.tsx:277` `md:col-span-2` | ERLEDIGT |
| email.ts multi-prefix split, CRM-Cron guards | deferred-memory | `35a5d55`, `crm-cron.ts:28-42/308` | ERLEDIGT |
| **— Runde-2 verifiziert ERLEDIGT (waren in §4/§5 falsch offen): —** | | | |
| IF-2 Event-Payload unsafe casts | interface-fragility, B6 | `crm-activity-logger.ts:30-32` safeParsePayload | ERLEDIGT |
| IF-4 degradation ChannelRouter-Bypass | interface-fragility, B6 | `degradation.ts:53-60` AutomationDegraded-Events (Sprint C) | ERLEDIGT |
| IF-6 Promoter JobStatusChanged+CompanyCreated skip | B6 | `promoter.ts:162-179` + `:288-302` beide emittiert | ERLEDIGT |
| IF-9 AI-Module Auth-Failure (G2b-Rest) | interface-fragility, B6 | `ai-provider/providers.ts:21-24` handleAuthFailure | ERLEDIGT |
| IF-11 State-Machine-Dup | interface-fragility, B6 | `validate-edit-transition.ts:11` import single-source | ERLEDIGT |
| DAU-2 changeJobStatus expectedFromStatusId | test-blindspots, B6 | `job.actions.ts:768/800` guard | ERLEDIGT |
| F1-partial errors.* 4-Locale | test-blindspots | zu Domain-Namespaces migriert | ERLEDIGT |
| Test-Fixture-Dup makeTestDispatchContext | s5-simplify-memory, B6 | `testFixtures.ts:1874` zentral | ERLEDIGT |
| CRM-ActivityLogger Unit-Tests | review-memory, B6 | `__tests__/crm-activity-logger.spec.ts` | ERLEDIGT |
| Gap-2 Company.domain | crm-gap, B6 | `schema.prisma:306` + autofill | ERLEDIGT |
| Gap-3 headline vs role | crm-gap, B6 | `schema.prisma:960` headline + role in CompanyAssociation | ERLEDIGT |
| Gap-4 socialProfiles multi-platform | crm-gap, B6 | `schema.prisma:961` + SocialProfile-VO | ERLEDIGT |
| WCAG O-1/O-2/O-3/O-4/O-7/P-5/R-1/R-2 (Kanban aria/labels) | kanban-audit, B3 | KanbanCard/Column/Board aria + sr-only verifiziert | ERLEDIGT (8) |
| WCAG A03/A06/A10 (SMTP toggle/contrast/form) | s5b-audit, B3 | SmtpSettings `<form>` + kein tabIndex + #636363 | ERLEDIGT (3) |
| CrmActivityLog.targetCompanyId FK | s3-handoff (home) | `@relation("ActivityLogCompany")` | ERLEDIGT |
| PersonDirectory companies JSON-Search | s3-handoff (home) | `person.actions.ts:204` `{companies:{contains}}` | ERLEDIGT |
| EURES Translator Feld-Mapping | eures-api-missing-fields (home) | 16 Feld-Mappings im Translator | ERLEDIGT (Notiz veraltet) |
| G3 degradation ChannelRouter (=IF-4) | gdpr/domain-expert | `degradation.ts` AutomationDegraded-Events | ERLEDIGT |
| G6 NotificationCreated dead event | domain-expert | `event-types.ts:30` entfernt | ERLEDIGT |
| G26 ENCRYPTION_KEY Startup-Check | domain-expert | `instrumentation.ts:3-5` throw | ERLEDIGT |
| G27 CRM i18n keys (companyNotFound/multiplePrimary) | domain-expert | `crm.ts:237/238` ×4 Locales | ERLEDIGT |
| API-v1 Cache-Control no-store (PII) | gdpr-audit | `with-api-auth.ts:99` | ERLEDIGT |
| **— Runde-3 verifiziert ERLEDIGT (Tabellen §4/§1b nach Welle 1 nicht gepruned; §296 sagte längst DONE; Session 2026-06-14, code-grep): —** | | | |
| IF-5 ActionResult.message typed key-union | §4 (war HIGH offen) | `actionResult.ts:42` `message?: TranslationKeyStrict` (Union aus 16 dict-`keyof`, `dictionaries.ts:829`) — Welle 1 | ERLEDIGT |
| IF-7 NotificationType 13-Datei-Fragment | §4 (war HIGH offen) | genau **1** Def `notification.model.ts:1`, 13 Importer, **0** Redefs — Welle 1 | ERLEDIGT |
| S6a Job-CRUD GDPR-Audit-Trail | §1b (war HIGH offen) | `lib/audit/data-audit.ts`→`adminAuditLog.create`; wired job.actions **5×**/api-v1 **4×**/stagedVacancy/note; `schema:969`; spec `audit-trail.allium` — Welle 1 | ERLEDIGT |
| S6b CRM-PII-Read Audit | §1b (war HIGH offen) | `person.pii_read` wired `person.actions:166,240` + `collect-user-data:507`; DataMinimisation am Sink erzwungen — Welle 1 | ERLEDIGT |
| GDPR-JWT id-only Token | §1b (war MEDIUM offen) | `auth.config.ts:53-54` `delete token.name; delete token.email;`; Display-Felder DB-resolved in session-callback — Welle 1 | ERLEDIGT |
| G28 E2E-CRM-Cleanup FK-Reihenfolge | §1b (war LOW offen) | `e2e/cleanup-stale-data.ts` löscht 8 CRM-Entities child→parent (5a–5h) + RESTRICT-guards | ERLEDIGT |
| **— Runde-4 IMPLEMENTIERT (Tech-Debt-Cleanup-Track clusters 1-5 + full-review; Session 2026-06-14; branch `tech-debt-cleanup`): —** | | | |
| IF-12 DiscoveredJob `as unknown as` casts | §4 | 3 Komponenten auf `StagedVacancyWithAutomation` umgetypt, 3 Casts weg, Legacy-Typ gelöscht (`340e3bf`) | ERLEDIGT |
| D1/D2 runner.ts AI-SDK + Resume-Cast | §4 | `result.experimental_output`→`result.output` (AI-SDK v6, Context7-verifiziert); typed `RESUME_MATCH_INCLUDE` + `Prisma.ResumeGetPayload` (`40a1dae`) | ERLEDIGT |
| IF-10 emitEvent fire-and-forget | §4 | Contract dokumentiert + Guard-Test (awaitable Pfad = `eventBus.publish`) (`fc724ba`) | ERLEDIGT |
| D5 enrichment-trigger A-05 bounded-context | §4 | `Company.domain`-Write über server-only `company-repository.ts` (`setCompanyDomainIfUnset`, createdBy-scoped, ADR-015) (`cab8915`) | ERLEDIGT |
| D4 shared-entities.allium Company.domain Spec-Drift | §4 | weed+tend: Kommentar+`@invariant DomainPopulatedOnce`; producer-rule in data-enrichment.allium (`423e54d`) | ERLEDIGT |
| GDPR-Consent (Art. 7(3)) | §1b | `consentWithdrawnAt` + withdraw/reinstate + Enforcement (updatePerson/scheduleInterview/createCrmTask/createCrmNote/crm-cron) + UI + i18n×4 + crm-gdpr.allium + ADR-037 (`d4460dc`,`e34fb5f`) | ERLEDIGT |
| G25 mergePersons Target-Dedup | §1b | CrmTaskTarget/CrmNoteTarget dedup wie JobContact (pre-read overlap + delete pre-transfer) (`a0e79bf`) | ERLEDIGT |
| G26b ADMIN_USER_IDS Startup-Validierung | §1b | `assertAdminUserIdsValid()` fail-fast, in instrumentation nodejs-branch (`54a6fc0`) | ERLEDIGT |
| F6 Toast "Dismiss" hardcoded | §4 Test-Lücken | ToastClose self-translate `common.dismiss` (`375eecc`) | ERLEDIGT |
| CRM-Cron 0 Unit-Tests | §4 Test-Lücken | `__tests__/crm-cron.spec.ts`: 3 Regeln + 24h-Idempotenz + Consent-Exclusion (`8d5845b`) | ERLEDIGT |
| D3 notification-dispatch.allium v3-Parse | §4 (war LOW offen, "160 Parse-Errors") | `allium analyse` → `findings:[]`, Header `-- allium: 3` (bereits v3; 160-Fehler-Notiz stale) | ERLEDIGT |

**→ TODO:** Quell-Docs mit `[SUPERSEDED → BACKLOG.md]` markieren (separater Schritt).
Bes. veraltet: `gdpr-audit-report.md`, `interface-fragility-analysis.md`, `crm-gap-analysis-twenty.md`,
beide WCAG-Audits (teil-fixed), Home-Dir s3-handoffs + eures-api-missing-fields.

---

## 1. CRITICAL — Security

### BS-01 — deleteFile latente IDOR (ADR-019) — ✅ ERLEDIGT (Welle 0, 2026-05-31)
- **Fix:** `deleteFile` nach `src/lib/profile/delete-file.ts` (`server-only`-Leaf, ADR-019 Pattern A)
  verschoben → KEIN Server-Action-Export mehr. `callerUserId` jetzt **required**; where-clause IMMER
  `{ id: fileId, Resume: { profile: { userId } } }`; `if (!file) return` = No-op für fremde/fehlende Files
  (kein unlink, kein DB-delete). Beide Caller auf Leaf umgestellt (`profile.actions.ts:399` +
  `api/profile/resume/route.ts:42` mit definite-userId-Guard).
- **Test:** `__tests__/delete-file-idor.spec.ts` (4 Cases: scope, IDOR-no-op, owner-happy, fs-missing).
- **Flashlight:** projektweit gegrept — `deleteFile` war einziger use-server-Export mit raw-userId-Pattern.
- **Spec:** `profile-resume.allium` (3 Comment-Sites aktualisiert, allium check clean).
- **Verify:** 256 Suites / 5031 Tests grün, tsc 0 Errors.
- **Quelle:** s5-pre-implementation-checkup, BUGS.md

### 1b. GDPR-Long-Tail (verifiziert offen — aus gdpr-audit + domain-expert)
Runde-2 verifiziert: G3/G6/G27/Cache-Control/ENCRYPTION_KEY-startup = ERLEDIGT (→ §0).
Runde-3 (2026-06-14): **S6a/S6b/GDPR-JWT/G28 = ERLEDIGT in Welle 1** (→ §0, code-verifiziert).
Runde-4 (2026-06-14): **GDPR-Consent/G25/G26b = IMPLEMENTIERT** (Tech-Debt-Track cluster 4 → §0). **Echt offen:**

| ID | Titel | Artikel | Datei | Severity |
|----|-------|---------|-------|----------|
| GDPR-KeyRotation | Encryption-Key-Rotation nur dokumentiert, keine Infra | Art. 32 | encryption.ts | DEFERRED |

---

## 2. UX/UI — verifiziert offen

### 2a. S2-Pre-Audit P0 (9 Findings) — ✅ ALLE ERLEDIGT (Welle 0, 2026-05-31)
Ursprung `s2-ux-polish-session.md` Pre-Audit. ui-design design-review konsultiert (Patterns aus
WebhookSettings/PushSettings/ApiKeySettings/AiSettings übernommen), dann implementiert. 7 neue i18n-Keys
×4 Locales. +6 Regression-Tests. 256 Suites / 5037 Tests grün, tsc 0 Errors.

| ID | Finding | Fix |
|----|---------|-----|
| P0-1 | NotificationSettings: kein Error-State bei Fetch-Failure | ✅ `isError`-State + `role="alert"` + Retry-Button (`fetchPrefs` → useCallback) |
| P0-2 | NotificationSettings: kein Confirm bei Global-Disable | ✅ AlertDialog-Confirm nur bei Disable (Enable bleibt instant) |
| P0-3 | PushSettings: `bg-green-600` ohne dark:-Variante (Kontrast 3:1) | ✅ `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200` (≥7:1) |
| P0-4 | StagedVacancyDetailSheet: Silent Error in runAction | ✅ destructive Toast + Sheet bleibt offen (onOpenChange nur bei Success) |
| P0-5 | NotificationDropdown: Fetch-Failure (Desc-Korrektur: KEIN Spinner-forever, `finally` clear loading; echtes Bug = fehlendes `catch` → unhandled rejection + stille leere Liste) | ✅ `catch` + `hasError`-State + distinct Error/Retry |
| P0-6 | NotificationBell: Silent Error bei Poll-Failure | ✅ try/catch, fail-silent (Count bleibt, kein Reset auf 0, kein Toast) |
| P0-7 | ActivityTimeline: Select `w-[200px]` Overflow @375px | ✅ `w-full min-w-[120px] sm:w-[200px]` |
| P0-8 | NotificationSettings: natives `<select>` statt Shadcn | ✅ Shadcn `<Select>` (29 Optionen → Select korrekt, nicht Combobox) |
| P0-9 | NotificationSettings: `grid-cols-3` zu eng @375px | ✅ `grid-cols-1 sm:grid-cols-3` |

### 2b. WCAG-Compliance — Welle 0 verifiziert + behoben (Disposition: `.ui-design/audits/wcag-backlog-2b-verified-2026-05-31.md`)
**Code-Verifikation der 23 (Audits 2026-04-02/05, stale): nur 3 echt offen auf AA-Niveau.** Rest erledigt/false/kontextuell — klassisches Stale-Audit-Over-Report (`feedback_verify_index_against_code`).

**✅ BEHOBEN (Welle 0, 2026-05-31), +4 Regression-Guards:**
- **P-4** (motion-reduce fehlt): `alert-dialog.tsx` Overlay+Content + `toast.tsx` → `motion-reduce:animate-none`.
- **P-3** (amber dark-contrast): KanbanCard `dark:bg-amber-900/50 text-amber-300` → `dark:bg-amber-900 text-amber-200` (≥4.5:1).
- **A02**: SmtpSettings fromAddress `autoComplete="email"`.

**✅ war bereits erledigt (nicht erneut fixen):** A11 (=P0-3 Welle 0), O-5 (`onDragOver` hat Handler), U-3 (EmptyState hat CTA), R-3 (toaster nutzt `t("common.dismiss")`), O-6 (`group` in `region` = valides ARIA).

**❌ FALSE:** P-1 (Status NICHT color-only — `KanbanColumn:56` rendert Status-Label als Text + aria-label; Card-Border = Verstärkung → 1.4.1 erfüllt).

**Kontextuell/AAA-not-AA/design-gated (dokumentiert, deferred):** P-2 (text-[10px] — kein harter WCAG-Min, design-gated), A05 (36px > AA-24px → besteht AA), A13 (h3 kontextuell), A01 (kein Per-Field-Validation-Model → aria-invalid N/A), A04 (aria-live minor enhancement), U-1/U-2 (Radix alertdialog announced; minor), A07/A09 (Email dark/dir — alle 4 Locales LTR, low-prio).

### 2c. Add-Job-Modal (F-AJ, offen-Teil)
Voll-Detail + Chains: `docs/add-job-modal-ux-findings.md`. Verifizierter Status:

| F-AJ | Status | Kern |
|------|--------|------|
| 01 Titel-Breite | **ERLEDIGT** | `md:col-span-2` da |
| 02 Applied-Toggle → Status-ComboBox | **ERLEDIGT** (Welle 4) | `StatusStageCombobox` (`AddJob.tsx:663`); kein manueller Applied-Toggle mehr — `applied` abgeleitet via `applyStatusToApplied()` (`:371`) aus `status.category.isAppliedStage` |
| 03 Status über Date Applied | **ERLEDIGT** (Welle 4) | `status`-Feld (`AddJob.tsx:659`) direkt über `dateApplied` (`:715`) — Kommentar `:650` |
| 04 Due Date optional + Reset | **ERLEDIGT** (Welle 0) | `dueDate: z.date().optional()`; DatePicker `allowClear` Ghost-Button (ui-design-reviewed); `updateJob` `dueDate ?? null` (Clear persistiert); `jobs.clearDate` ×4; +5 Tests |
| 05 Salary Slider+Währung+Fixum | **ERLEDIGT** (Welle 2) | strukturierte Salary min/max/currency/period + Fixum + JSON-Bonus; Parser `parse-salary-range.ts` + Migration `20260601191028` (salaryRange RETAINED deprecated); `JobSalaryFields.tsx`; shared `build-job-salary.ts` als server-seitige Validierungs-Boundary (ISO-4217/period/finite/min≤max-swap) über job.actions + /api/v1 + promoter; `fixumDisablesRange` UserSetting; `specs/compensation.allium`; E2E happy-path grün |
| 06 Profil Adresse+Währung | **ERLEDIGT** (Welle 2, ADR-034) | home location + `preferredCurrency` auf Profile-Aggregat (Migration `20260601134805`); `getProfilePreferences`/`updateProfilePreferences` (atomic upsert, `Profile.userId @unique` Migration `20260601205337`); `CurrencySelect` + `ProfilePreferencesCard` |
| CUR ISO-4217 Währungsquelle | **ERLEDIGT** (Welle 2) | Reference-Data-Module `reference-data/modules/currency/` (native `Intl`, zero-dep, 162 Codes); OHS-Actions `getCurrencyOptions`/`getCurrencyInfo` (auth-gated); `isValidCurrencyCode` als Validator wiederverwendet |
| 07 CRM-Person im Add Job | **ERLEDIGT** (Welle 3) | `JobContactPicker` gerendert (`AddJob.tsx:858`); `addJobContact()` (`:332`, create-only) |
| 08 Recruiter-Dreieck | **ERLEDIGT** (Welle 3) | Form `:799/:829`; persistiert `job.actions.ts:412-413` (IDOR `:376` + runtime-validate `:359`); Schema FK `:412` + index `:464`; E2E `job-crud.spec.ts:548` |
| 09 Custom JobStatus | **ERLEDIGT** (Welle 4) | per-user `JobStatus`/`JobStatusCategory` (`schema:307/:329`); dyn. Kanban `job.actions.ts:1130` (kein hardcoded STATUS_ORDER) |

---

## 3. Abhängigkeitsketten (für Umsetzungs-Reihenfolge)

```mermaid
flowchart TD
  subgraph KetteA["Kette A — Status-Workflow"]
    F09[F-AJ-09 Custom JobStatus<br/>+ category] --> F02[F-AJ-02 Status ComboBox<br/>Applied-Logik]
    F02 --> F03[F-AJ-03 Layout]
    F09 --> KAN[dyn. Kanban-Spalten<br/>+ Nav-Badges]
  end
  subgraph KetteB["Kette B — Salary + Profil"]
    F06[F-AJ-06 User-Profil<br/>Adresse+Währung] --> F05[F-AJ-05 Salary<br/>Slider+Währung]
    GEO[GeoCode 1.21<br/>CountrySelect] -.wiederverwenden.-> F06
    CUR[NEU: ISO-4217<br/>Währungsquelle] --> F06
    FSR[format-salary-range.ts] -.wiederverwenden.-> F05
    F05 --> JOBMIG[Job-Model<br/>salaryRange→min/max/cur]
  end
  subgraph KetteC["Kette C — CRM-Verbindung"]
    JC[JobContact-Backend<br/>fertig] --> F07[F-AJ-07 Person<br/>in AddJob]
    F07 --> F08[F-AJ-08 Recruiter-<br/>Dreieck]
    F08 --> CD[CompanyDetail-Page<br/>+ JobDetail CRM-Tab]
  end
  subgraph KetteD["Kette D — unabhängig (parallel)"]
    BS01[BS-01 IDOR-Fix]
    P0[S2-P0 9 Bugfixes]
    WCAG[WCAG 35 Findings]
    F01b[F-AJ-04 Due Date]
  end
```

**Regel:** F-AJ-09 VOR F-AJ-02 (sonst Applied-Logik gegen feste Status, später Rewrite).
Kette D jederzeit parallel (kein Rewrite-Risiko). Kette A/B parallel zueinander; C wartet auf CRM-Basis.

---

## 4. Architektur / Tech-Debt (verifiziert offen)

Runde-2 verifiziert: IF-2/IF-4/IF-6/IF-9/IF-11 ERLEDIGT (→ §0).
Runde-3 (2026-06-14): IF-5/IF-7 = ERLEDIGT in Welle 1, D3 = ERLEDIGT (→ §0).
Runde-4 (2026-06-14): **IF-10/IF-12/D1/D2/D4/D5 + Test-Lücken F6/CRM-Cron = IMPLEMENTIERT** (Tech-Debt-Track clusters 1-3+5 → §0). **✅ §4 vollständig abgearbeitet — keine offenen Tech-Debt-Items mehr.**

**Architektur-Note (kein Crash):** `audit-logger` konsumiert ALLE Events → jedes hat ≥1 Consumer.
Aber ReminderTriggered/NotificationCreated haben keinen FUNKTIONALEN Consumer über Logging hinaus. Spec-Drift (akzeptiert).

**Test-Lücken:** F6 + CRM-Cron ✅ ERLEDIGT (Runde-4 → §0). DAU-2, F1-partial, Test-Fixture-Dup = ERLEDIGT (→ §0).

---

## 5. CRM-Gaps (Twenty-Vergleich, blockieren ROADMAP 5.x)

Runde-2 verifiziert: Gap-2/Gap-3/Gap-4 ERLEDIGT (→ §0). **Echt offen:**

| Gap | Titel | Blockiert | Status |
|-----|-------|-----------|--------|
| Gap-1 | Person→Job "Point of Contact" | 5.1/5.4/5.7 | ✅ DONE (Welle 3 F-AJ-07: JobContactPicker in AddJob, two-tier + wider search) |
| Gap-5 | CompanyTimeline UI + JobDetail CRM-Tab | 5.1/5.5 | ✅ DONE (Welle 3: ActivityTimeline gains targetCompanyId; JobDetails CRM section; 8 projections resolve company) |
| Gap-6 | CrmBlocklist Domain-Pattern (nur exact `handle`) | 1.12 | ✅ DONE (Welle 3: domain-suffix + glob `pattern` matcher, ReDoS-safe; primitive only — no auto-creation flow yet, paired w/ 1.12) |
| Gap-7 | updatedBy FK-Tracking (nur Name-based actor) | 1.12/5.7 | ✅ DONE (Welle 3: ActorType provenance type+id on CrmInterview/Task/Note, ADR-035; Person keeps name-string by design) |
| F-AJ-08 | Recruiter-Dreieck (recruitingCompany + relationshipType) | — | ✅ DONE (Welle 3: migration + addJob/updateJob + JOB_*_SELECT + AddJob UI + job-aggregate.allium) |

### CRM follow-ups (Welle 3 deferred — durable record)

Decided-deferred during Welle 3 (CRM-Verbindung). Not bugs — scoped-out with a trigger.

| Item | Trigger / why deferred | Pointer |
|------|------------------------|---------|
| **Company-targeted task/note on the Company timeline** | ✅ **Event plumbing PRE-STAGED** (2026-06-12): the 3 payloads `CrmTaskCreated`/`CrmTaskCompleted`/`CrmNoteCreated` (+ Zod schemas + `event-bus.allium`) now carry optional `targetCompanyId`; the emitters set it for a direct company target; the projection prefers the explicit value and falls back to job→company resolution. **Read surface still gated on ROADMAP 2.20 CompanyDetail** — no company-timeline UI yet (the `CompanyTimeline` surface is already declared in `specs/crm.allium`). When 2.20 lands, just render it. | `crm-activity-logger.ts`, `event-types.ts`, `event-schemas.ts`, `event-bus.allium`, `crmTask/crmNote.actions.ts` |
| **User-Guide CRM section** | Picker / recruiter-triangle / CRM-timeline are user-facing but undocumented for end users. | README / User-Guide |
| **API v1 recruiter write** | ✅ DONE (post-Welle-3 follow-up, merged `3b099f2`) — POST/PATCH `/api/v1/jobs` set `recruitingCompany`+`relationshipType`. | — |
| **`SelectFormCtrl` hardcoded "Select " prefix** | ✅ DONE (2026-06-12) — i18n'd via a new `forms.*` namespace using the project's `{label}` interpolation idiom (German verb-final word order correct). Flashlight also caught + fixed `ComboBox.tsx` (Select/Search/Create/No-results/announcements) and a hardcoded `placeholder="Select activityType"` in `TaskForm`; translated `label` wired into all combobox callers (AddJob, AddExperience, AddEducation, ActivityForm, TaskForm). | `forms.ts`, `Select.tsx`, `ComboBox.tsx` |
| **E2E recruiter-triangle path** | ✅ DONE (2026-06-12) — dedicated test `should create a job with a recruiter triangle and prefill it on edit (F-AJ-08)` creates with `recruitingCompany`+`relationshipType` and asserts edit-prefill round-trip through `JOB_*_SELECT`. | `e2e/crud/job-crud.spec.ts:548` |

---

## 6. Dedizierte Sprints (zu groß für Cleanup-Pass)

| Item | Effort | Entry-Criteria |
|------|--------|----------------|
| H-P-09 Observability (OTel/Prometheus) | 2-3 Wochen | Stack-Entscheidung |
| PII-at-Rest (Person field-encryption, Art. 32) | multi-day | Design-Phase → Migration. Plan: `2026-05-30-next-sprint-pii-at-rest.md` |
| M-A-09 undoStore split-brain pipe-through | 2-3 Tage | ADR-030-Amendment + Migration |
| getStagedVacancies Cursor-Pagination | 2-3 Tage | User-Scale/Perf (präemptiv, kein Report) |
| 3.11 Session-Recovery (Stale-Session Guard + usePersistedForm) | M | siehe ROADMAP 3.11 |

> ~~F-AJ-09 Custom JobStatus~~ → **ERLEDIGT Welle 4** (per-user JobStatus + Kategorien + dyn. Kanban + API; `specs/job-aggregate.allium`). Aus Sprint-Liste entfernt.

---

## 7. ROADMAP-Vorwärts-Features (geplant, kein Bug/Drift)

`docs/ROADMAP.md` ist code-verifiziert präzise (DONE-Marker stimmen). Offene Vorwärts-Arbeit:
- **Connectors 1.x:** Job-Discovery-Module (StepStone/Indeed), 1.2 Workflow (n8n/Zapier),
  1.7 Calendar (blockt 5.2), 1.12 Communication/Gmail-Sync (blockt 5.1)
- **UX 2.x:** Map, File-Explorer, Marketplace (je teilweise), CompanyDetail-Page
- **QoL 3.x:** Job-Gruppierung, Dedup-Fuzzy, Tiptap-Ausbau, CV-Parsing, Link-Autofill, Offline-CRUD
- **Docs 7.x:** API v1 Phase 2+, OpenAPI-Spec

→ Detail + Status in `docs/ROADMAP.md` (nicht hier duplizieren).

### 7a. Spec-derived deferred (Autopilot/Communication-Spec-Layer, 2026-06-15)

Implementierungs-Details aus den neuen Allium-Specs (cv-document / application-documents / automation-modes / communication-connector). Domain-Verhalten ist gespect; diese sind „Wie", an der Implementierung zu klären — KEINE Spec-Lücken.

- **G1 — SMTP-Transport-Sharing 1.12 ↔ 0.6** *(Backlog, Implementierung)*: Nutzt das 1.12-Email-Modul (Application-Communication) denselben `SmtpConfig`/Transport wie der 0.6-Notification-Email-Channel (System-Notifications), oder eigene Send-/Receive-Credentials (Application-Email will oft andere From-Adresse + IMAP-Receive, das Notifications nie brauchen)? **Boundary ist gespect** (`InboundFeedsCrmNotNotifications` in `communication-connector.allium`); nur das physische Transport-Sharing ist offen. Entscheidung beim Bau des 1.12-Email-Moduls.
- **G2-Refinement — Recipient-Resolution-Precedence** *(Backlog, klein)*: `ResolveRecipient`/`Recipient.resolve` ist gespect (JobContact-Email → Company-Domain); die exakte Fallback-Reihenfolge inkl. Portal-Handle (1.9) ist Feinarbeit.
- **Channel-Selection-Policy** *(Backlog/Design)*: per-Automation/User-Channel-Priority (config) vs. per-Job-Auto-Detection (Portal-Link → Portal, sonst Email). Relevant für `automation-modes` (übergibt den Channel) + 1.9/1.17.
- **Delivery-Confirmation-Tiefe** *(Backlog)*: `delivered`-Status (Read-Receipts/DSN) als optionale Modul-Capability (Manifest-deklariert, wie `availabilityCheck` in 0.4) modellieren — Email liefert das selten zuverlässig.

→ Spec-Details + gelöste Open Questions in den jeweiligen `specs/*.allium`.

---

## 8. NOT-PLANNED + Design-Gated (NICHT als neu re-vorschlagen)

- **`docs/NOT-PLANNED.md`** — bewusst abgelehnt, mit Re-Eval-Triggern.
- **Design-gated** (brauchen Human-Entscheidung): 6× 40×40 Settings-Buttons (Input h-11 bump),
  react-day-picker cell-size, TasksTable density-toggle, Dark-Mode MatchScoreRing Kontrast-Audit.
- **Akzeptierte Risiken:** FL-1 google-favicon SSRF (domain-constructed), FL-2 Ollama IPv4-mapped-IPv6 (localhost by design).

---

## Statistik (verifiziert)

| Kategorie | Anzahl |
|-----------|--------|
| Doku-Drift bereinigt (verifiziert war falsch-offen) | ~50 |
| Implementiert (Tech-Debt-Track Runde-4, 2026-06-14) | 10 (IF-10/12, D1/D2, D4, D5, GDPR-Consent, G25, G26b, F6, CRM-Cron) |
| CRITICAL Security offen | 0 (BS-01 ✅ erledigt Welle 0) |
| GDPR-Long-Tail offen | 0 + 1 deferred (KeyRotation) — Consent/G25/G26b ✅ Track cluster 4 |
| UX offen (S2-P0 ✅ + WCAG ✅3/~8 deferred + F-AJ ✅) | ~8 (alle F-AJ 01-09 erledigt Welle 0/2/3/4; S2-P0 9 ✅; WCAG-Rest verifiziert kontextuell/false) |
| Arch/Tech-Debt offen | 0 — §4 vollständig abgearbeitet (Track Runde-4) |
| Test-Lücken offen | 0 (F6, CRM-Cron ✅ Track cluster 5) |
| CRM-Gaps offen | 0 (Gap-1/5/6/7 + F-AJ-08 alle DONE — Welle 3) |
| Dedizierte Sprints | 5 (F-AJ-09 ✅ Welle 4 entfernt) |
| ROADMAP-Vorwärts-Features | ~38 |
| Design-gated/Akzeptiert | ~10 |

**Verifikations-Vollständigkeit:** 539 Repo-`.md` + 8 Home-Dir-`.md` + 30 Allium-Specs gescannt.
319 Archive bewusst ausgeschlossen (historisch). 0 ungescannte Nicht-Archiv-Dateien verbleibend.
Jeder OFFEN/ERLEDIGT-Status code-grep-verifiziert (keine Doku-Wort-Vertrauen).

---

## Welle 1 — erledigt (2026-06-01, branch welle-1-foundation-gdpr)

IF-5 (typed `ActionResult.message`), IF-7 (NotificationType drift-proof), Audit-Spec
(`specs/audit-trail.allium`, ADR-033), **S6a** (Job-CRUD Audit), **S6b** (Person-PII-Read
Audit inkl. Export), **GDPR-JWT** (id-only Token) — alle erledigt. tsc 0, 265 Suites/5118
Tests grün, Build grün. Full-Review (Security + Architecture) Findings gefixt.

### Neue Follow-ups (aus Welle-1-Review, bewusst deferred)
- **IF-5b — `t()` global typisieren** gegen `TranslationKeyStrict` (bleibt aktuell `string`;
  hunderte `t("…")`-Sites + dynamische Keys → eigener Migrations-Task).
- **handleError schluckt geworfene i18n-Keys:** ~17 `throw new Error("errors.notAuthenticated")`
  in `job.actions.ts` (+ vereinzelt andere) werden von `handleError()` verschluckt → User sieht
  Fallback-Key statt Auth-Fehler. Pre-existing (war vorher gleich). Fix = throw→return-Refactor
  pro Guard. M.
- **person.pii_read Listen-Audit:** N Einzel-`create` statt `createMany` (≤100/Seite, fire-and-forget).
  LOW Perf-Optimierung.
- **gdpr-audit-report.md:** S6a/S6b/JWT in RoPA/DSAR-Abschnitt dokumentieren (Doku-Task).
- **/understand-Graph-Refresh:** Welle-1-Code noch nicht in den Graph eingespeist (Token-Budget);
  beim nächsten Session-Start refreshen (staleness-check flaggt es bereits).

---

## Welle 4 (Custom JobStatus XL) — deferred follow-ups (2026-06-13)

From the Welle 4 comprehensive-review (security clean; one HIGH fixed → W4-B1 in BUGS.md).
These are deliberate deferrals, not bugs:

- ~~**MED — Wire `allows_self_transition` (multi-round interviewing as SAME-status re-selection).**~~
  ✅ DONE 2026-06-13 (branch `welle4-self-transition`). Re-selecting a job's CURRENT status now logs a
  new round (`JobStatusHistory` + `JobStatusChanged`) **only** on a self-transition stage (interviewing);
  every other stage's same-status re-selection stays a benign no-op; `applied`/`appliedDate` immutability
  preserved. Wired through: adapter `isValidCategoryTransitionByKind` (`sameStatus` opt) +
  `changeJobStatus`/`updateJob`/`updateKanbanOrder` (`job.actions.ts`) + `api/v1/jobs/[id]/status/route.ts`
  + `getValidTransitions` (current status surfaced only on a self-transition stage). Unit + action + API
  tests added; `allium:weed` 0 drift (spec already permitted it → ADR-036 known-limitation closed).
  **Live triggers:** the job edit form via an explicit **"Log a new interview round"** Switch (shown only
  when re-selecting the current interviewing status) + the public API + the dedicated
  `changeJobStatus`/`updateKanbanOrder` self-transition for any caller passing the same status id. The
  edit-form toggle is gated by a transient `logInterviewRound` flag (`addJobForm.schema`) so a same-status
  save WITHOUT the toggle is a plain field update — no phantom round on unrelated edits (the original
  edge-case risk, now closed). Kanban *same-column drag* stays a pure reorder (passes no `newStatusId`) so
  reordering interviewing cards never spams rounds.
- ~~**LOW — Orphan "Other" Kanban column partial cast.**~~ ✅ FIXED 2026-06-13 — `useKanbanState.ts`
  now gives the synthetic "Other" column a real neutral `category` object (grey, archived semantics,
  sorts last), so consumers reading `column.status.category.*` never hit undefined.
- ~~**LOW — reorder integer-collision.**~~ ✅ FIXED 2026-06-13 — the management UI now calls a new
  `reorderJobStatuses(orderedIds)` bulk action that **renormalizes** the stage to contiguous
  `0..N-1` in one transaction (no fractional midpoints → no collision class). The old
  `computeReorderSortValue` ×1000 helper (`reorder.ts`) is removed. Single `reorderJobStatus` is
  retained for the Allium `ReorderJobStatus` rule / public-API PATCH surface.
- ~~**E2E run-deferred.**~~ ✅ RUN GREEN 2026-06-13. `e2e/crud/job-status-crud.spec.ts` now has TWO
  passing tests: (1) create status → set on job → see Kanban column, and (2) **self-transition** —
  create → edit to Interview (round toggle hidden while status changes) → edit again (toggle appears) →
  toggle + save → job-detail Status-History timeline shows exactly 3 entries (initial + move + round).
  Full run `10 passed` (8 smoke + 2 crud) via `scripts/dev-e2e.sh` + `--project=crud --workers=1` after
  `source scripts/env.sh`. NB: on a degraded server the signin smoke can flake (Tailscale-redirect) —
  restart the dev server and re-run (env note, not a regression).
- **Real-browser visual smoke** ✅ done 2026-06-13 (chromium screenshots, /tmp/welle4-smoke). Verified
  rendering of: Settings→Job-Statuses (7 stage groups in workflow order, correct colours, "Marks as
  applied" badges on the 4 applied stages, Default badge + disabled-trash on Bookmarked, per-row
  reorder/star/edit/delete + job counts); grouped status ComboBox (stage headings, colour dots, search,
  marks-applied); applied indicator flip Not-Applied→Applied + purple interviewing dot + Date-Applied
  auto-enable; dynamic Kanban (per-user columns, `--stage-color` tints, default-collapsed Rejected/
  Archived/Expired pills, count badges, collapse chevrons). Two findings:
  - ~~**LOW (visual) — status ComboBox trigger clips the selected label.**~~ ✅ FIXED 2026-06-13
    (`14d3c6b`). The fixed-width `w-[200px]` trigger squeezed the `truncate` label to zero behind the
    `shrink-0` "Marks as applied" Badge on applied stages. Removed the redundant badge from the TRIGGER
    (it stays in the dropdown options; the separate "Status: Applied" indicator conveys applied-ness).
    Label now always shows (verified visually — trigger renders "● Interview"). Spec updated.
  - ~~**Test-data debt** — orphan custom `E2E Stage …` statuses accumulate from prior E2E runs.~~
    ✅ FIXED 2026-06-13 (`4d7c345`). Added a guarded `jobStatus.deleteMany` step (6aa) to
    `e2e/cleanup-stale-data.ts` (label `startsWith "E2E "`, `isDefault:false`, `jobs:none`,
    `historyAsNew:none` — RESTRICT-safe, never the default) so globalSetup purges them each run, and
    cleared the 4 existing orphans from dev.db (verified 0 remaining).

## Blind-Spot Sweep — Welle 5 wrap (2026-06-20)

Project-wide pattern hunt (4 agents, graph-scoped + grep-verified) after the Inside Track feature.
**Fixed inline:** `PushSettings.handleUnsubscribe` fired the success toast + flipped the UI regardless
of the `unsubscribePush` result; settings health-check toasts dropped the misleading "Check Now" title
(the description already carries the outcome). Two **systemic** items tracked for a dedicated pass —
deliberately NOT fixed piecemeal at the feature tail (scope + consumer-coupling + false-positive risk):

- **ADR-019 `select`-hygiene sweep** (~20 client-returned reads with no explicit `select`, leaking
  `createdBy`/`userId`/internal FKs): `getPerson`/`getPersons`, `getAllTags`/`JobTitles`/`Companies`/
  `Locations`/`ActivityTypes`, `getCompanyById`, task/activity/note lists, `getDiscoveredJobs`,
  `getBlocklist`, `getAutomationRuns`, + the `countBy`-undefined branches of the paginated lookups.
  **LOW severity** — all userId/createdBy-scoped (own-data, not cross-user IDOR; defense-in-depth).
  Each fix must curate the `select` to what consumers actually read (e.g. PersonDetailClient renders
  `processingBasis`/`consentWithdrawnAt`) → consumer-coupled; careful per-action pass, not bulk.
- **i18n dead-key sweep (knip-guarded)** (~146 orphaned keys; **0 missing** — no runtime raw-key bugs):
  largest clusters `smtp.*` (26, migrated to `settings.smtp*`), `enrichment.*` old naming (16) +
  scattered; incl. ~10 this-session `insideTrack.*` keys for deferred UI (via field, lifecycle badges,
  workspace labels). **Do NOT bulk-delete from the hunt list** — it false-positived ≥1 used key
  (`commitToApplyConfirmDescription`); run `bun knip` + the dictionary-completeness test as guards.
