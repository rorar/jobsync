# Session Prompt — Domain Expert Schnittstellen-Analyse + P0 Critical Fixes

Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstütze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen fuer JobSync, einer SaaS-Plattform fuer die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories ein.
[ ] Bei Entscheidungen waehlst du nicht den einfacheren Weg; Du waehlst den Weg des Nachhaltigkeitsprinzip.
[ ] Vermeide server tanking bzw. race conditions und stoppe vorher den Server, wenn du `tsc` laufen laesst.
[ ] Hard Constraints: Lade und Beachte **Kritische Regeln**, schreibe diese als Bestaetigung.

## Kontext

Letzte Session war eine **reine Analyse-Session** mit 9 Domain-Expert-Agents (3 Runden Cross-Domain + GDPR-Audit). Keine Code-Aenderungen. Ergebnisse:

- **Cross-Domain Analysis:** 29 Findings (G1-G29), davon 3 CRITICAL, 7 HIGH. Report: `docs/session-2026-05-12-domain-expert-analysis.md`
- **GDPR Audit:** 22 FAIL / 20 PARTIAL / 13 PASS ueber 60 Checks in 8 Domains. 6 systemische Kern-Probleme. Report: `docs/gdpr-audit-report.md`
- **Domain Mapping:** `.domain-experts/domains.json` (wiederverwendbar mit Drift-Check)
- **Handoff:** `.remember/remember.md` + Memory-Files aktualisiert

## Phase 1: Domain Experts respawnen + Schnittstellen-Analyse

### 1.1 Respawne Domain Experts

Rufe `/domain-experts` auf. Das domains.json existiert bereits — waehle Option 1 (Use this mapping) mit Drift-Check. Das spart ~10 Minuten gegenueber einem Neuaufbau.

### 1.2 Schnittstellen-Analyse (NICHT in der letzten Session gemacht)

Sende an ALLE 9 Agents (inkl. testing) die folgende Frage:

> "Hier sind die Reports aus der letzten Session: `docs/session-2026-05-12-domain-expert-analysis.md` und `docs/gdpr-audit-report.md`. Lies beide Reports. Dann beantworte: Welche Schnittstellen zwischen deiner Domain und den anderen Domains sind die fragilsten? Wo wuerde eine Aenderung in deiner Domain unbemerkt etwas in einer anderen Domain kaputtmachen? Nenne die 3 gefaehrlichsten Koppelungspunkte mit file:line Referenzen."

Synthese die Antworten aller 9 Agents und persistiere in `docs/interface-fragility-analysis.md`.

## Phase 2: P0 Critical Fixes implementieren

Nutze `/full-stack-orchestration:full-stack-feature` fuer die Implementierung. Die Findings sind bereits exakt dokumentiert mit file:line Referenzen.

### Sprint 1: Event Bus Bypass (G1) — ~1 Tag

4 Status-Change-Pfade fixen:

| Pfad | Fix |
|------|-----|
| `updateJob` (job.actions.ts:429) | Detect status change at L500, delegate to `changeJobStatus` or inline History+Event+SideEffects |
| API v1 `POST /jobs/:id/status` (status/route.ts) | Add `emitEvent(createEvent("JobStatusChanged", {...}))` after transaction |
| API v1 `POST /jobs` (jobs/route.ts) | Add `JobStatusHistory` creation + `JobStatusChanged` + `CompanyCreated` events |
| `promoter.ts` (L158) | Add second `emitEvent` for `JobStatusChanged` after `VacancyPromoted` |

### Sprint 2: GDPR Critical (G2, S5) — ~2 Stunden

Fix `anonymizePerson` Transaction in `person.actions.ts:353-386`:
```
+ prisma.crmInterview.updateMany({ where: { personId }, data: { personId: null, notes: null, outcomeNotes: null } }),
+ prisma.crmBlocklist.deleteMany({ where: { userId: user.id, handle: { in: personEmails } } }),
```
Und in der bestehenden `crmActivityLog.updateMany` die data erweitern:
```
  data: { targetPersonId: null, details: null, linkedRecordName: null },
```

### Sprint 3: AI Degradation Bypass (G2b) — ~1 Stunde

Wire `handleAuthFailure(moduleId, error)` in `openai/index.ts:35-40` und `deepseek/index.ts:35-40` bei 401/403 Errors.

### Sprint 4: Quick Wins — ~1 Stunde

- G5: `discoveryStatus` → `status === "staged"` in `[id]/page.tsx:222` + Cast zu `StagedVacancyWithAutomation[]`
- G8: Add `logo_dev` zu `apiKey.model.ts` TypeScript Union + `apiKey.schema.ts` Zod enum
- G26: Env-var Startup-Checks in `instrumentation.ts` (ENCRYPTION_KEY, AUTH_SECRET)
- deleteJobById Test: Add `jobContact: { deleteMany: jest.fn() }` zu Mock
- extractDomain: `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` + `ß→ss`

## Phase 3: Falls noch Context uebrig

Waehle EINE dieser Optionen:
- A) CRM Cron Hardening: globalThis guard + Promise.allSettled (~15 min)
- B) retention_expired eigener NotificationType (~30 min, 10 Dateien)
- C) Notification Retention Cron (~1 Stunde, Delete > 30 Tage)

## Uebergreifende Regeln

- Committe haeufig mit logischer Gruppierung
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS** tests+builds parallel — VM Resource Limits, single worker
- **NIEMALS** PRs gegen upstream Gsync/jobsync
- `/full-stack-orchestration:full-stack-feature` fuer ALLE Implementierung
- Honesty Gate VOR Push
- Server stoppen vor `tsc`

## Referenz-Dokumente (lies diese ZUERST)

1. `.remember/remember.md` — Handoff mit allen Context-Details
2. `docs/session-2026-05-12-domain-expert-analysis.md` — Cross-Domain Findings (G1-G29)
3. `docs/gdpr-audit-report.md` — GDPR Audit (60 Checks, 8 Domains)
4. `docs/session-2026-05-12-open-items.md` — 23 Open Items aus Prior Session
5. `project_deferred_sprints_for_future_sessions.md` — Alle Deferred Items konsolidiert
6. `.domain-experts/domains.json` — Domain Mapping fuer Agent Respawn
