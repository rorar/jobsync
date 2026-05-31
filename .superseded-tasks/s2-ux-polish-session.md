Hey Claude, sei mein Full-Stack Senior Software Engineer und unterstütze mich bei der Planung, Architektur und Implementierung von neuen Features, Bugfixes und Verbesserungen für JobSync, einer SaaS-Plattform für die Automatisierung von Job-Discovery und Bewerbungsprozessen. Die Plattform ist in TypeScript mit Shadcn/Tailwind, Next.js und Prisma gebaut.

[ ] @projekte/jobsync Lies zuerst CLAUDE.md, reminders und die Memories (~/.claude/projects/-home-pascal-projekte-jobsync/memory/MEMORY.md) ein.
[ ] Bei Entscheidungen wählst du nicht den einfacheren Weg; Du wählst den Weg des Nachhaltigkeitsprinzip: Was ist die nachhaltigste, fundierteste und basierend auf DDD und auf der ROADMAP die beste Lösung? Macht es bei der Entscheidung Sinn /allium zu befragen?
[ ] Vermeide server tanking bzw. race conditions und stoppe vorher den Server, wenn du `tsc` laufen lässt - lasse `tsc` ressourcenschonend laufen.
[ ] Hard Constraints: Lade und Beachte **Kritische Regeln**, schreibe diese als Bestätigung.

## Quick-Verify

Führe aus:
```bash
git log --oneline -15
source scripts/env.sh && bun run build
bash scripts/test.sh --workers=1
```

Prüfe: Build grün? Tests grün (245+ Suites, 4729+ Tests)?

## Kontext

**Stand nach Session 2026-05-15:** CRM Core implementiert, alle P0/P1/P3 Domain Expert Findings geschlossen, GDPR Sprint (Account Deletion, Retention Cron, PII Redaction, DSAR Export), 5x Comprehensive Review, 245 Suites, 4729 Tests, 0 Failures. Codebase auf `main` @ `b4a69c8`.

Dies ist **Session S2** — systematische UX/UI-Qualitätsprüfung über ALLE Features die seit Sprint A (2026-03-29) gebaut oder signifikant geändert wurden — einschließlich der neuen CRM-Komponenten aus S3 + Twenty CRM UX-Erkenntnisse. Fokus AUSSCHLIESSLICH auf UX/UI.

**Twenty CRM Referenz-Erkenntnisse** (vollständige Analyse in `docs/twenty-crm-implementation-patterns.md`):
Die Analyse von Twenty's Codebase (16 spezialisierte Agents, 1218 Zeilen Dokumentation) hat konkrete UX-Verbesserungen identifiziert, die in diesem Sprint integriert werden sollen. Siehe "Schritt 5: Twenty-Enhancements" unten.

**Bekannte design-gated Items (NICHT fixen — brauchen User-Entscheidung):**
- 6 input-adjacent settings buttons at 40x40 (h-10 Input height alignment)
- react-day-picker --cell-size 2rem -> 44px (widens popover)
- TasksTable density toggle (neue UX-Feature, braucht Design)
- Dark-mode MatchScoreRing contrast audit (braucht full dark-mode WCAG sweep)
Siehe `project_deferred_sprints_for_future_sessions.md` für Details.

## Dein Auftrag

### Schritt 1: User Journeys für 21 Features

Erstelle für JEDES Feature User Journeys mit Edge Cases. Dokumentiere in `docs/user-journey-audit.md`.

**Methode pro Feature:**
1. Happy Path definieren (primärer Usecase als Schritt-für-Schritt)
2. Edge Cases aus 7 Dimensionen ableiten:
   - Leere Eingaben / Keine Daten (Empty State)
   - Netzwerk-Fehler / API nicht erreichbar
   - Gleichzeitiger Zugriff (concurrent mutations)
   - Extreme Datenmengen (Pagination, Performance)
   - Mobile vs Desktop (375px Breite)
   - Verschiedene Locales (DE/EN/FR/ES)
   - Externe API-Ausfälle (EURES, ESCO, AI Provider down)
3. Implementierung prüfen — ist der Edge Case im Code behandelt?
4. Test prüfen — ist der Edge Case getestet (Unit oder E2E)?
5. Fehlende Implementierung + Tests SOFORT fixen

**Feature-Liste (aktualisiert nach S3 + Twenty-Audit):**

| # | Feature | Tiefe | Schlüssel-Files |
|---|---------|-------|-----------------|
| 1 | JobDeck Swipe UI | Hoch | `DeckCard.tsx`, `DeckView.tsx`, `useDeckStack.ts`, `StagedVacancyDetailSheet.tsx` |
| 2 | SuperLike Celebration | Medium | `SuperLikeCelebration.tsx`, `SuperLikeCelebrationHost.tsx`, `useSuperLikeCelebrations.ts` |
| 3 | Staging Container (List + Deck + Bulk) | Hoch | `StagingContainer.tsx`, `BulkActionBar.tsx`, `StagingNewItemsBanner.tsx` |
| 4 | Kanban Board + Status Workflow | Hoch | `KanbanBoard.tsx`, `KanbanCard.tsx`, `StatusTransitionDialog.tsx`, `useKanbanState.ts` |
| 5 | SchedulerStatusBar + RunProgress | Medium | `SchedulerStatusBar.tsx`, `RunProgressPanel.tsx`, `use-scheduler-status.ts` |
| 6 | Automation Wizard (Manifest-Driven) | Hoch | `AutomationWizard.tsx`, `DynamicParamsForm.tsx`, `widget-registry.tsx` |
| 7 | EURES Comboboxes (Language + Location + Occupation) | Hoch | `EuresLanguageCombobox.tsx`, `EuresLocationCombobox.tsx`, `EscoOccupationCombobox.tsx` |
| 8 | Company Blacklist | Medium | `CompanyBlacklistSettings.tsx`, `companyBlacklist.actions.ts` |
| 9 | Public API + API Key Management | Hoch | `PublicApiKeySettings.tsx`, `src/lib/api/*`, `src/app/api/v1/*` |
| 10 | Notification Settings (4 Channels) | Hoch | `WebhookSettings.tsx`, `SmtpSettings.tsx`, `PushSettings.tsx`, `NotificationSettings.tsx` |
| 11 | NotificationBell + Dropdown | Medium | `NotificationBell.tsx`, `NotificationDropdown.tsx` |
| 12 | Data Enrichment + CompanyLogo | Medium | `EnrichmentModuleSettings.tsx`, `company-logo.tsx`, `LogoAssetSettings.tsx` |
| 13 | My Jobs (Table + Detail + Notes/Tags) | Hoch | `JobsContainer.tsx`, `MyJobsTable.tsx`, `JobDetails.tsx`, `AddJob.tsx` |
| 14 | Module Health + API Status | Medium | `ApiStatusOverview.tsx`, `ModuleBusyBanner.tsx` |
| 15 | CRM: PersonDirectory + PersonDetail | Hoch | Neue Komponenten aus S3 — Dateien prüfen |
| 16 | CRM: InterviewCalendar | Medium | Neue Komponente aus S3 |
| 17 | CRM: TaskBoard | Medium | Neue Komponente aus S3 |
| 18 | CRM: ActivityTimeline | Hoch | Neue Komponente aus S3 |
| 19 | CRM: BlocklistSettings | Niedrig | Neue Komponente aus S3 |
| 20 | **NEU: CompanyDetail Page** | Hoch | NEUE PAGE — `/dashboard/companies/[id]` mit Timeline Tab |
| 21 | **NEU: JobDetail CRM Integration** | Medium | ActivityTimeline in JobDetails einbetten |

### Schritt 2: UX 10-Punkte-Checkliste pro Komponente

Prüfe JEDE Komponente — sowohl die bestehenden (Sprint A-PERF-3) als auch die neuen CRM-Komponenten aus S3.

**Komponenten-Liste (50+ Komponenten, gruppiert):**

**Staging/Deck (15):**
DeckCard, DeckView, StagingContainer, ViewModeToggle, StagedVacancyCard, StagedVacancyDetailSheet, StagedVacancyDetailContent, SuperLikeCelebration, SuperLikeCelebrationHost, MatchScoreRing, PromotionDialog, BlockConfirmationDialog, BulkActionBar, StagingLayoutToggle, StagingNewItemsBanner

**Scheduler/Automations (8):**
SchedulerStatusBar, RunProgressPanel, AutomationList, AutomationWizard, ModuleBusyBanner, RunStatusBadge, RunHistoryList, ConflictWarningDialog

**EURES/Comboboxes (3):**
EuresLanguageCombobox, EuresLocationCombobox, EscoOccupationCombobox

**Settings (8):**
WebhookSettings, SmtpSettings, PushSettings, NotificationSettings, PublicApiKeySettings, CompanyBlacklistSettings, EnrichmentModuleSettings, LogoAssetSettings

**Jobs/Kanban (6):**
JobsContainer, MyJobsTable, KanbanBoard, KanbanCard, StatusTransitionDialog, JobDetails

**Notifications (2):**
NotificationBell, NotificationDropdown

**Shared UI (4):**
CompanyLogo, ChipList, ToolbarRadioGroup, BaseCombobox

**CRM (aus S3 — mindestens 6):**
PersonDirectory, PersonDetail, InterviewCalendar, TaskBoard, ActivityTimeline, BlocklistSettings

**10-Punkte-Checkliste pro Komponente:**

| # | Kriterium | Wie prüfen |
|---|-----------|-----------|
| 1 | **Loading State** | **Skeleton** (nicht Spinner!) für async Daten? Kein leerer Screen. Migriere `Loader2+animate-spin` → `<Skeleton />` wo möglich. |
| 2 | **Empty State** | Hilfreiche Nachricht + Call-to-Action wenn keine Daten? Illustration/Icon statt nur Text? |
| 3 | **Error State** | Toast + Retry-Möglichkeit bei Fehlern? **KEIN silent error logging** — Fehler MÜSSEN dem User gezeigt werden. |
| 4 | **Mobile (375px)** | Kein Overflow, kein abgeschnittener Text, Touch-Targets 44px+. Responsive Grids: `grid-cols-1 sm:grid-cols-N`. |
| 5 | **Keyboard Navigation** | Alle interaktiven Elemente per Tab erreichbar, Focus-Indicator sichtbar, `aria-label` auf Icon-Buttons. |
| 6 | **Dark Mode** | Theme korrekt? Kontrast ausreichend? Kein hardcoded `bg-green-600` — immer `dark:` Varianten. |
| 7 | **i18n** | Alle Strings übersetzt? Keine hardcoded English strings? Alle 4 Locales. |
| 8 | **Confirmation Dialogs** | Destruktive Aktionen (Delete, Revoke, Global Disable) haben Bestätigungsdialog? |
| 9 | **Feedback** | Jede User-Aktion hat visuelles Feedback (Toast, Animation, State Change)? Einheitliche Expand-Animation? |
| 10 | **Design System** | Folgt Shadcn/Tailwind Pattern? Konsistent mit anderen Komponenten? `data-*` Attribute für States? |

Fehlende Implementierungen SOFORT fixen. Committe nach jedem Fix-Block.

### Schritt 3: Spezialisierte UI-Reviews

- Starte `/ui-design:design-review` für alle Komponenten aus der Liste
- Starte `/ui-design:accessibility-audit` für WCAG-Compliance
- Starte `/ui-design:responsive-design` für Mobile-Audit (375px+)
- Fixe ALLE Findings

### Schritt 4: Bekannte P0-Fixes (aus Pre-Audit 2026-05-15)

Diese Findings wurden durch automatisierten Code-Audit gegen die 10-Punkte-Checkliste identifiziert. Fixe sie ZUERST bevor du mit der manuellen Checkliste weitergehst:

**P0 — CRITICAL (blocken UX-Qualität):**

| # | Komponente | Finding | Fix |
|---|-----------|---------|-----|
| 1 | `NotificationSettings.tsx` | **Kein Error State** — wenn `getNotificationPreferences()` fehlschlägt, zeigt User Defaults ohne Hinweis | Error Toast + Retry Button (wie WebhookSettings Pattern) |
| 2 | `NotificationSettings.tsx` | **Kein Confirmation bei Global Disable** — ein Klick deaktiviert ALLE Notifications ohne Warnung | AlertDialog Confirmation bei `enabled: true → false` |
| 3 | `PushSettings.tsx:414` | **Hardcoded `bg-green-600`** ohne `dark:` Variant | → `bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200` (Pattern aus PublicApiKeySettings) |
| 4 | `StagedVacancyDetailSheet.tsx:90` | **Silent Error** in `runAction` — Fehler geloggt, kein User-Feedback | Error Toast hinzufügen |
| 5 | `NotificationDropdown.tsx:171` | Fetch-Failure → Spinner zeigt FOREVER | Error State + Retry Button |
| 6 | `NotificationBell.tsx:52` | Silent Error bei Poll-Failure — Count bleibt stale | Graceful Degradation (last-known-good) |
| 7 | `ActivityTimeline.tsx:93` | Select `w-[200px]` überläuft 375px Viewport | → `w-full sm:w-[200px]` |
| 8 | `NotificationSettings.tsx:316` | Native `<select>` statt Shadcn Select | → Shadcn Select Component für Konsistenz |
| 9 | `NotificationSettings.tsx:283` | `grid-cols-3` Quiet Hours zu eng auf 375px | → `grid-cols-1 sm:grid-cols-3` |

### Schritt 5: Twenty-Enhancements (aus Twenty CRM Deep-Dive)

Nach den P0-Fixes und der Checkliste, integriere diese Twenty-inspirierten UX-Verbesserungen. Referenz: `docs/twenty-crm-implementation-patterns.md` §10-12.

**P1 — Hoher UX-Gewinn, geringer Aufwand:**

| # | Enhancement | Aktueller Stand | Was tun |
|---|------------|----------------|---------|
| 1 | **Spinner→Skeleton Migration** | Skeleton-Primitive existiert (`ui/skeleton.tsx`), aber 73x `Loader2+animate-spin` im Code | Top-10 sichtbarste Stellen migrieren: Dashboard, Jobs-Liste, Staging Queue, Settings-Seiten, PersonDirectory, InterviewCalendar |
| 2 | **Sticky Headers** auf MyJobsTable + KanbanBoard | Nicht sticky — Header scrollt mit Content | `sticky top-0 z-10 bg-background` auf Table Header + Kanban Column Headers |
| 3 | **CompanyDetail Page** | Route `/dashboard/companies/[id]` existiert NICHT | Neue Page: Overview + Timeline Tab (ActivityTimeline mit `targetCompanyId`) + Jobs Tab (Jobs gefiltert nach Company) |
| 4 | **JobDetail CRM Tab** | `ActivityTimeline` existiert, wird in JobDetails aber NICHT gemounted | Tab "Aktivitäten" in JobDetails → `<ActivityTimeline targetJobId={jobId} />` |
| 5 | **ActivityTimeline Month Grouping** | Flat List, max 100 Items, keine Monatsseparatoren | `groupEventsByMonth()` Utility (Twenty-Pattern), Monat-Separatoren, IntersectionObserver Infinite Scroll |
| 6 | **Hover-Reveal Actions** auf MyJobsTable | Row Actions immer sichtbar | `opacity-0 group-hover:opacity-100 transition-opacity duration-150` auf Action-Buttons |
| 7 | **Nav Sidebar Badge Counts** | Sidebar zeigt Links ohne Counts | Badge auf Staging-Link ("3 neue"), Interviews-Link (upcoming count), CRM Tasks (overdue count) |

**P2 — Nice-to-have, wenn Zeit bleibt:**

| # | Enhancement | Was tun |
|---|------------|---------|
| 8 | Keyboard Shortcut Help Dialog (Shift+?) | Shadcn Dialog mit gruppierter Shortcut-Liste (Deck, Navigation, Actions) |
| 9 | Settings Scroll Restoration | `useScrollRestoration(pageId)` Hook — Position pro Settings-Seite in sessionStorage merken |
| 10 | Kanban Column Aggregate Count | Zähler im Column Header ("3 Jobs") |
| 11 | Card Checkbox Hover-Reveal | StagedVacancyCard: Checkbox `opacity-0 group-hover:opacity-100` statt immer sichtbar |
| 12 | Settings Section H2Title Pattern | Klare `<Section>` + `H2Title` mit Beschreibung für visuelle Struktur |
| 13 | Extra Bottom Padding auf Settings | `pb-20` für angenehmes Scrolling am Seitenende |

**NICHT in S2 (bewusst ausgeschlossen):**
- Autosave Debounce in Settings (Architektur-Entscheidung: explicit Save vs Autosave)
- Context Menus / Right-Click (neues UX Pattern, braucht Design-Entscheidung)
- Floating UI Migration (Radix Popover reicht aktuell)
- Toast System Upgrade / Progress Bar (Custom Radix Toast funktioniert)
- Einheitliches AnimatedExpand Pattern (braucht framer-motion Entscheidung)

### Schritt 6: Output dokumentieren

Schreibe alles in `docs/user-journey-audit.md` mit dieser Struktur:

```markdown
# User Journey & UX Audit — Full Codebase (Sprint A through CRM Core + Twenty Enhancements)

## Feature: [Feature Name]
### Happy Path
1. Step 1...
2. Step 2...

### Edge Cases
| Dimension | Edge Case | Implemented? | Tested? | Fix |
|-----------|-----------|-------------|---------|-----|
| Empty data | ... | Yes/No | Unit/E2E/No | Was wurde gefixt |

## UX Checklist: [Component Name]
| # | Criterion | Status | Fix |
|---|-----------|--------|-----|
| 1 | Loading State | OK/Missing | Was wurde gefixt |

## Twenty Enhancement: [Enhancement Name]
| Status | Before | After | Files Changed |
|--------|--------|-------|--------------|
| DONE | Spinner | Skeleton | list of files |
```

## Übergreifende Regeln

### Git
- Committe häufig mit logischer Gruppierung
- Konventionelle Commits mit `Co-Authored-By: Claude Opus 4.6 (1M context) <noreply@anthropic.com>`
- Build + Tests VOR jedem Commit: `source scripts/env.sh && bun run build && bash scripts/test.sh --workers=1`
- **NIEMALS PRs gegen upstream Gsync/jobsync erstellen.** Nur in eigene Branches/main mergen.
- **NIEMALS tests+builds parallel** — VM Resource Limits, single worker

### Implementierung
- Verwende IMMER `/full-stack-orchestration:full-stack-feature` für Fixes die mehr als 3 Dateien betreffen
- ui-design Agent VOR UI-Änderungen konsultieren
- `import "server-only"` auf allen Server-Dateien
- Alle Prisma-Queries mit userId (ADR-015 IDOR)
- encrypt()/decrypt() sind async — immer awaiten

### i18n-Pflicht
Wenn du UI-Strings hinzufügst oder änderst, aktualisiere ALLE 4 Locales (EN, DE, FR, ES). Verwende `@/i18n` bzw. `@/i18n/server`.

### Allium-Check
Wenn du Code änderst für den ein Allium Spec existiert (prüfe `specs/`), führe nach den Änderungen `allium:weed` über die betroffenen Specs aus.

### Findings-Regel: ZERO TOLERANCE
Fixe ALLE Findings — auch kosmetische. UX-Qualität ist nicht optional.
**Ausnahme:** Die 4 design-gated Items (siehe Kontext oben) — diese nur dokumentieren, nicht fixen.
**Ausnahme:** Die "NICHT in S2" Items (siehe Schritt 5) — bewusst ausgeschlossen.

### Context-Exhaustion
Wenn du merkst dass der Context knapp wird:
1. Committe sofort alle fertigen Änderungen
2. Aktualisiere docs/BUGS.md mit verbleibenden Items
3. Schreibe eine Handoff-Notiz in .remember/remember.md
4. Starte KEINE neuen Fix-Zyklen — schließe sauber ab

### Autonomie
Arbeite VOLLSTÄNDIG autonom. Keine Rückfragen an den User. Maximale kognitive Anstrengung.

## Exit-Checkliste (MUSS vor Merge erfüllt sein)

- [ ] User Journeys dokumentiert in `docs/user-journey-audit.md` für alle 21 Features
- [ ] UX 10-Punkte-Checkliste bestanden für alle ~52 Komponenten
- [ ] Alle fehlenden Edge-Case-Implementierungen gefixt
- [ ] Alle fehlenden Tests hinzugefügt
- [ ] P0-Fixes (9 Findings aus Pre-Audit) alle geschlossen
- [ ] `/ui-design:design-review` durchgeführt, Findings gefixt
- [ ] `/ui-design:accessibility-audit` durchgeführt, Findings gefixt
- [ ] `/ui-design:responsive-design` durchgeführt, Findings gefixt
- [ ] Twenty-Enhancements P1 (7 Items) integriert
- [ ] Twenty-Enhancements P2 mindestens evaluiert, nach Möglichkeit integriert
- [ ] CompanyDetail Page erstellt mit Timeline + Jobs Tabs
- [ ] JobDetail CRM Tab mit ActivityTimeline eingebettet
- [ ] ActivityTimeline Month Grouping + Infinite Scroll implementiert
- [ ] Sidebar Badge Counts für Staging + Interviews + CRM Tasks
- [ ] Spinner→Skeleton Migration (Top-10 sichtbarste Stellen)
- [ ] Blind Spot Check: "Woran haben wir bei UX nicht gedacht?"
- [ ] i18n: Keine hardcoded Strings, alle 4 Locales komplett
- [ ] Design-gated Items dokumentiert (nicht gefixt, auf User-Entscheidung wartend)
- [ ] docs/BUGS.md aktualisiert
- [ ] CLAUDE.md aktualisiert falls UX-relevante Patterns dokumentiert werden müssen
- [ ] CHANGELOG.md Einträge
- [ ] Build grün + Tests grün
- [ ] Honesty Gate VOR Push durchgeführt
