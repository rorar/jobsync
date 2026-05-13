# Offene Aufgaben — Stand 2026-05-13

> Referenz für die nächste Session. Erstellt nach Sprint C + IF-2/5/6/7/8 + 2× Comprehensive Review (0 Debt).
> Prior Session: `docs/session-2026-05-12-open-items.md`. Deferred Details: `project_deferred_sprints_for_future_sessions.md`.

---

## CRITICAL (vor nächster Feature-Arbeit)

| ID | Finding | Effort | Quelle |
|----|---------|--------|--------|
| ~~G1~~ | ~~Status-change Event Bus Bypass — 4 Pfade ohne `JobStatusChanged`~~ | ~~1 Tag~~ | **RESOLVED** (commit `4a5293a`, all 4 paths emit events correctly) |
| ~~G2~~ | ~~`anonymizePerson` GDPR — `CrmInterview.personId` nicht detached~~ | ~~15 min~~ | **RESOLVED** (code: `person.actions.ts:364-378`, "G2 fix" comment) |
| ~~G2b~~ | ~~AI Provider Degradation Bypass — OpenAI/DeepSeek 401 silently swallowed~~ | ~~1 Std~~ | **RESOLVED** (commit `3a81dd6`, handleAuthFailure wired in providers.ts) |
| ~~S1~~ | ~~Account Deletion (Art. 17) — kein deleteUser, 31/35 FK ohne Cascade~~ | ~~2-3 Tage~~ | **RESOLVED** (session 2026-05-14: 37 FK cascades, `deleteAccount()` + `requestAccountDeletion()` + Privacy Settings UI + F-1 audit + F-2 email confirm + F-4 cooling-off) |
| ~~S5~~ | ~~`anonymizePerson` 6 Cascade-Gaps~~ | ~~2 Std~~ | **RESOLVED** (all 6 fields handled: personId, notes, outcomeNotes, details, linkedRecordName, blocklist) |

**G1 Details:** All 4 paths fixed in `4a5293a`: updateJob wraps status changes in transaction with history + sideEffects + event; API v1 status route emits event; promoter emits JobStatusChanged; API v1 POST /jobs creates history + emits events. Ref: `docs/interface-fragility-analysis.md` IF-1.

---

## HIGH (nächster Sprint)

| ID | Finding | Effort |
|----|---------|--------|
| ~~G5~~ | ~~`newJobsCount` always 0 (`discoveryStatus` → `status === "staged"`)~~ | ~~5 min~~ | **RESOLVED** (filter changed to `["staged","processing","ready"]` matching staging page canonical definition) |
| ~~G8~~ | ~~`ApiKeyModuleId` missing `logo_dev`~~ | — | **RESOLVED** (already in `apiKey.model.ts:1` + `apiKey.schema.ts:6`) |
| G9 | `ContactDeleted` kein CrmActivityLogger consumer | 30 min |
| G10 | 0 CRM fixtures in `testFixtures.ts` | ½ Tag |
| S2 | No Data Export/Portability (DSAR) — kein Export-Button, kein Handler | 1-2 Tage |
| S3 | Resume PII unredacted to OpenAI/DeepSeek (Art. 5(1)(c)) | 1 Tag |
| S4 | No retention policies auf Jobs/Notifications/EnrichmentLogs | 1 Tag |
| H-P-09 | Observability — zero OpenTelemetry / Prometheus / tracing | 2-3 Wochen |

---

## MEDIUM (beim Berühren verwandten Codes)

| ID | Finding | Effort |
|----|---------|--------|
| G6 | `NotificationCreated` dead event (wire or delete) | 15 min |
| G7 | 8 hardcoded English strings in `ai.utils.ts` (Ollama errors) — domain expert overcounted, CRM UI files are clean | 30 min |
| G11 | `validate-edit-transition.ts` missing `expired` | 15 min |
| G14 | Push notifications hardcoded `/dashboard` (no deep links) | 30 min |
| G15 | No notification retention cleanup (spec: 30 days) | 1 Std |
| G17 | `rescheduled→rescheduled` transition missing in code (spec allows it) | 15 min |
| ~~G23~~ | ~~API v1 DELETE divergent cascades~~ | — | **Likely RESOLVED** — both paths now use "cascade via onDelete rules" (IF-3 migration added Cascade to all CRM FKs) |
| ~~#5~~ | ~~`extractDomain` Unicode bug~~ | — | **RESOLVED** — `normalize("NFD")` correctly produces "mullergmbh.com" not "mller.com" |
| #16 | `retention_expired` maps to `contact_from_job` (semantic mismatch) + missing `.title` i18n keys | 30 min |
| #18 | `AutomationDegraded` → CRM Timeline (moduleId now in payload, consumer subscription missing) | 30 min |
| #1-3 | Cleanup: `feature-map-and-gaps.md` untracked, `.full-review/` + `.full-stack-feature/` → `.gitignore` | 5 min |

---

## Architektur-Sprints (dediziert)

| Item | Effort |
|------|--------|
| M-A-09 undoStore split-brain (full pipe-through) | 2-3 Tage |
| `getStagedVacancies` cursor pagination | 2-3 Tage |
| Allium V3 Syntax Overhaul (`notification-dispatch`: 160 errors, `scheduler`: 97) | 1-2 Std |
| Event Payload fat refactor (7 thin payloads → DB lookups eliminieren) | ½ Tag |
| CRM Consumer + Cron test coverage (`crm-activity-logger` 9 subs, `crm-cron` 3 rules, 0 tests) | ½ Tag |

---

## Design-Gated (brauchen Human-Entscheidung)

| Item | Blocker |
|------|---------|
| 6 Input-adjacent Buttons 40×40 → 44×44 | Input h-10 → h-11 Bump — Design Review |
| react-day-picker `--cell-size` 2rem → 44px | User Testing — Popover-Breite |
| TasksTable Density Toggle | UX Design — wo lebt der Toggle? |
| Dark-mode MatchScoreRing Contrast | WCAG Audit — full dark-mode sweep |
| Plural Rules für i18n | LinguiJS ICU vs per-key `*One`/`*Many` Varianten |

---

## Dedizierte Sprints

| Sprint | Scope | Effort |
|--------|-------|--------|
| **GDPR Sprint cont.** | ~~S1 Account Deletion~~ (DONE) + S2 DSAR + S3 AI PII Strip + S4 Retention | 3-5 Tage |
| **S2 UX Polish** | 19 Features, 52+ Components, Add Job Dialog (7 Divergenzen) | 2-3 Tage |
| **Observability** | OpenTelemetry + Prometheus + Grafana + Alert Rules | 2-3 Wochen |

---

## Resolved in Session 2026-05-13

| ID | Finding | Commit |
|----|---------|--------|
| IF-2 | Zod runtime validation on event payloads (29 schemas, 20 casts, 7 emits) | `aa485c2`..`9532b96` |
| IF-5 | `errorCode` in `actionToResponse` | `e2c108d` |
| IF-6 | `CompanyCreated` vom Promoter | `e2c108d` |
| IF-7 | `NotificationType` shared constant | `866cbe8` |
| IF-8 | Webhook GDPR allowlist | `e2c108d` |
| G3 | Degradation InApp-only → event-basiert | `f08ccce` |
| G13 | Webhook events missing 5 CRM types | `866cbe8` |
| Sprint C | 30 FK indexes, Restrict, architecture decoupling, 4 pre-sprint bugs | `0b186e5`..`73ae0b4` |
| Reviews | 32 findings from 2× comprehensive review, all fixed | `f6e805e`, `0e8e53a`, `9532b96` |
| G1 | All 4 status-change paths emit JobStatusChanged + history + sideEffects | `4a5293a` |
| G2b | AI auth failures wired to degradation bridge | `3a81dd6` |
| G5 | newJobsCount filter fixed to `["staged","processing","ready"]` | session 2026-05-14 |
| S1 | Account Deletion: 37 FK cascades + deleteAccount + Privacy Settings (F-1/F-2/F-4) | session 2026-05-14 (`a1dc1b3`..`8f30f72`) |
