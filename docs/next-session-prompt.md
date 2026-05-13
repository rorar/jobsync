# Session Prompt — CRITICAL Domain Expert Findings + GDPR Sprint

Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstuetze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen fuer JobSync, einer SaaS-Plattform fuer die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories ein.
[ ] Bei Entscheidungen waehlst du nicht den einfacheren Weg; Du waehlst den Weg des Nachhaltigkeitsprinzip.
[ ] Vermeide server tanking bzw. race conditions und stoppe vorher den Server, wenn du `tsc` laufen laesst.
[ ] Hard Constraints: Lade und Beachte **Kritische Regeln**, schreibe diese als Bestaetigung.

## Kontext

Letzte Session (2026-05-14) hat alle CRITICAL Domain Expert Findings + S1 GDPR Account Deletion abgeschlossen. 12 Commits, 232 Test Suites, 4580 Tests gruen, 51 Migrationen, 0 Review-Debt.

**G1, G2b, G5 waren bereits gefixt** (Commits `4a5293a`/`3a81dd6` vom 2026-05-12, Docs aktualisiert).
**S1 Account Deletion vollstaendig implementiert:** 37 FK Cascades, `deleteAccount()` + `requestAccountDeletion()` mit Privacy Settings (F-1 Audit Trail, F-2 Email Confirmation, F-4 Cooling-off Period), UI in Settings, 13 Tests, Allium Spec.

## Phase 1: GDPR Sprint Fortsetzung (S2, S3, S4)

Nutze `/full-stack-orchestration:full-stack-feature` + `/superpowers:test-driven-development`.

**S1 Account Deletion ist DONE** (Session 2026-05-14). Naechste GDPR-Items:

### 1.1 S2 — Data Export/Portability (Art. 15, 20)

Kein DSAR Handler, kein "Export my data" Button, kein strukturierter Export. `PersonDataExport` in `specs/crm-gdpr.allium:94-111` spezifiziert aber nicht implementiert.

### 1.2 S3 — Resume PII an Cloud-APIs (Art. 5(1)(c), 28, 44)

`convertResumeToText()` in `preprocessing.ts:96-194` sendet vollen Namen, Email, Telefon, Adresse an OpenAI/DeepSeek. `TEXT_LIMITS` config existiert aber wird nie importiert.

### 1.3 S4 — Retention Policies (Art. 5(1)(e))

Jobs, Notes, Activities, Notifications, EnrichmentLog akkumulieren unbegrenzt. Spec sagt 30 Tage fuer Notifications.

## Phase 2: HIGH Domain Expert Findings

Waehle aus (Prioritaet absteigend):
- A) G9: `ContactDeleted` kein CrmActivityLogger consumer (30 min)
- B) G10: 0 CRM fixtures in `testFixtures.ts` (½ Tag)
- C) G7: 8 hardcoded English Strings in `ai.utils.ts` (30 min)

## Weitere offene Sprints (Prioritaet nach Phase 1-3)

- **S2 UX Polish:** Prompt at `~/s2-ux-polish-session.md` — 19 Features, 52+ Components, Add Job Dialog (7 Divergenzen). Siehe auch `docs/open-items-2026-05-13.md` § Design-Gated.
- **Observability:** H-P-09 — OpenTelemetry + Prometheus + Grafana. 2-3 Wochen, braucht Stack-Entscheidung.
- **Allium V3 Overhaul:** `notification-dispatch.allium` (160 errors), `scheduler-coordination.allium` (97 errors). 1-2 Std mit `/allium:tend`.
- **G7 i18n:** 8 hardcoded English Strings in `src/utils/ai.utils.ts` (Ollama Fehlermeldungen). CRM UI Files sind sauber. 30 min.
- **crm.ts:** 40 pre-provisioned i18n Keys (Activity Timeline, Merge UI, GDPR UI) — kein Bug, architekturelle Vorbereitung. NICHT loeschen.

## Phase 4: Post-Sprint Pflicht-Skills

1. `/superpowers:verification-before-completion` — Build + Tests + notification-writers check
2. `/comprehensive-review:full-review` — Scoped auf Session-Commits
3. Flashlight Analyse zu JEDEM Step
4. `/remember:remember` — Session-State sichern (NUR Edit, NIE Write auf .remember!)

## Uebergreifende Regeln

- Committe haeufig mit logischer Gruppierung
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS** tests+builds parallel — VM Resource Limits, single worker
- **NIEMALS** PRs gegen upstream Gsync/jobsync
- `/full-stack-orchestration:full-stack-feature` fuer ALLE groesseren Implementierungen
- `/comprehensive-review:full-review` nach JEDEM Sprint
- Honesty Gate VOR Push
- Server stoppen vor `tsc`
- **Handoff/Memory-Dateien:** NUR gezielte Edits (Edit tool), NIE komplett ueberschreiben (Write tool) — Kritische Regel, 2x verletzt, 3. Mal NICHT.

## Referenz-Dokumente (lies diese ZUERST)

1. `docs/open-items-2026-05-13.md` — **Vollstaendige offene Punkte (priorisiert)**
2. `.remember/remember.md` — Handoff mit allen Context-Details
3. `docs/interface-fragility-analysis.md` — 12 Fragility-Cluster (IF-1 bis IF-12)
4. `docs/session-2026-05-12-domain-expert-analysis.md` — Cross-Domain Findings (G1-G29)
5. `docs/gdpr-audit-report.md` — GDPR Audit (60 Checks, 8 Domains)
6. `project_deferred_sprints_for_future_sessions.md` — Alle deferred Items konsolidiert
7. `.domain-experts/domains.json` — Domain Mapping fuer Agent Respawn
8. `docs/superpowers/plans/2026-05-13-if2-zod-event-validation.md` — IF-2 Plan (completed, Referenz)
9. `docs/superpowers/plans/2026-05-14-s1-account-deletion.md` — S1 Plan (completed, Referenz)
10. `.full-stack-feature/03-architecture.md` — Privacy Settings Architektur (completed, Referenz)
