# Session Prompt — Interface Fragility Fixes + Open Items

Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstuetze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen fuer JobSync, einer SaaS-Plattform fuer die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories ein.
[ ] Bei Entscheidungen waehlst du nicht den einfacheren Weg; Du waehlst den Weg des Nachhaltigkeitsprinzip.
[ ] Vermeide server tanking bzw. race conditions und stoppe vorher den Server, wenn du `tsc` laufen laesst.
[ ] Hard Constraints: Lade und Beachte **Kritische Regeln**, schreibe diese als Bestaetigung.

## Kontext

Letzte Session (2026-05-12b) hat die **3 CRITICAL Findings (G1, G2/S5, G2b)** gefixt + 5 Quick Wins + CRM Cron Hardening. 7 Commits, 228 Test Suites, 4459 Tests gruen. Zusaetzlich: 9-Agent Interface-Fragility-Analyse mit 12 Fragility-Clustern (IF-1 bis IF-12). Reports:

- `docs/interface-fragility-analysis.md` — 12 Fragility-Cluster mit Konsens-Bewertung
- `docs/session-2026-05-12-domain-expert-analysis.md` — Original Cross-Domain Findings (G1-G29)
- `docs/gdpr-audit-report.md` — GDPR Audit (60 Checks, 8 Domains)
- `.remember/remember.md` — Handoff mit allen Context-Details
- `.domain-experts/domains.json` — Domain Mapping (841 Dateien, drift-checked)

## Phase 1: IF-3 Full — CrmInterview FK Cascade (~2h)

Nutze `/full-stack-orchestration:full-stack-feature` + `/superpowers:test-driven-development`.

### 1.1 Prisma Migration

`CrmInterview.jobId` hat kein `onDelete: Cascade` (`prisma/schema.prisma:972`). Job-Delete crasht wenn Interviews existieren. 3/9 Agent-Konsens.

1. Erstelle Migration: `onDelete: Cascade` auf `CrmInterview.jobId` FK
2. Pruefe ob andere CRM-FKs auch betroffen sind: `CrmTaskTarget.targetJobId`, `CrmNoteTarget.targetJobId`, `CrmActivityLog.targetJobId`
3. `npx prisma migrate dev --name add-crm-cascade-deletes`

### 1.2 deleteJobById + API v1 DELETE vereinheitlichen

Aktuell divergente Cascades (G23):
- Internal `deleteJobById` (`job.actions.ts:573`): loescht `jobContact`, nicht `CrmInterview`
- API v1 DELETE (`route.ts:108`): loescht legacy `Interview`, nicht `jobContact`

Fix: Beide Pfade muessen identische Cleanup-Logik haben. Mit `onDelete: Cascade` auf der Migration werden die meisten CRM-Entities automatisch geloescht. Pruefe was noch manuell benoetigt wird.

### 1.3 E2E Cleanup

`e2e/cleanup-stale-data.ts` braucht 8 neue Steps VOR der Job-Deletion (exakte Reihenfolge aus remember.md):
`ActivityLog → JobContact → CrmInterview → CrmNote → CrmTask → Person → CrmBlocklist → ConnectedAccount`

## Phase 2: Open Quick Wins (~1h)

Nutze `/superpowers:dispatching-parallel-agents` fuer parallele Ausfuehrung.

| # | Item | Datei | Effort |
|---|------|-------|--------|
| 1 | `retention_expired` eigener NotificationType | 10 Dateien | 15 min |
| 2 | 2 fehlende i18n Keys (`crm.errors.companyNotFound`, `crm.errors.multiplePrimaryCompanies`) | `crm.ts` | 5 min |
| 3 | 7 hardcoded English strings in CRM UI | InterviewsPageClient 4x, CrmTasksPageClient 1x, PersonDetailClient 2x | 15 min |
| 4 | ROADMAP 5.4+5.9 Text-Updates | `docs/ROADMAP.md` | 10 min |
| 5 | 21 dead/pre-provisioned i18n keys in crm.ts aufraeumen | `crm.ts` | 10 min |

## Phase 3: IF-4 Degradation → ChannelRouter (~1h)

Nutze `/full-stack-orchestration:full-stack-feature`.

3 Sites in `degradation.ts` schreiben Notifications direkt in die DB und umgehen den ChannelRouter:
- `degradation.ts:165` — `auth_failure` (createMany)
- `degradation.ts:301` — `consecutive_failures` (create)
- `degradation.ts:412` — `cb_escalation` (createMany)

Fix: Ersetze die direkten Prisma-Writes durch `channelRouter.route()`. Dafuer braucht jede Site:
1. `buildDispatchContext(userId)` aufrufen
2. `NotificationDraft` erstellen (gleiche Felder wie bisher)
3. `channelRouter.route(draft, ctx)` statt `prisma.notification.create`

Vorsicht: `webhook.channel.ts` hat 2 weitere Direct-Writer-Sites die BY DESIGN sind (Rekursionsschutz). Diese NICHT aendern.

Nach dem Fix: `/allium:weed` gegen `specs/notification-dispatch.allium` laufen lassen.

## Phase 4: Falls noch Context uebrig

Waehle aus (Prioritaet absteigend):
- A) IF-5: `inferErrorStatus` → `errorCode` (~30 min)
- B) IF-7: `NotificationType` shared constant (~30 min)
- C) IF-6: `CompanyCreated` vom Promoter emittieren (~30 min)

## Uebergreifende Regeln

- Committe haeufig mit logischer Gruppierung
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS** tests+builds parallel — VM Resource Limits, single worker
- **NIEMALS** PRs gegen upstream Gsync/jobsync
- `/full-stack-orchestration:full-stack-feature` fuer ALLE Implementierung
- `/comprehensive-review:full-review` nach JEDEM Sprint
- Honesty Gate VOR Push
- Server stoppen vor `tsc`
- **Handoff/Memory-Dateien:** NUR gezielte Edits, NIE komplett ueberschreiben (Kritische Regel)

## Post-Sprint Pflicht-Skills

1. `/comprehensive-review:full-review` — Architecture+Security+Performance+Testing+Best Practices
2. `/allium:weed` — Spec-Code-Alignment pruefen (besonders nach Migration)
3. `/remember:remember` — Session-State sichern

## Referenz-Dokumente (lies diese ZUERST)

1. `.remember/remember.md` — Handoff mit allen Context-Details
2. `docs/interface-fragility-analysis.md` — 12 Fragility-Cluster (IF-1 bis IF-12)
3. `docs/session-2026-05-12-domain-expert-analysis.md` — Cross-Domain Findings (G1-G29)
4. `docs/gdpr-audit-report.md` — GDPR Audit (60 Checks, 8 Domains)
5. `docs/session-2026-05-12-open-items.md` — 23 Open Items aus Prior Session
6. `project_deferred_sprints_for_future_sessions.md` — Alle Deferred Items konsolidiert
7. `.domain-experts/domains.json` — Domain Mapping fuer Agent Respawn
