# Requirements: ROADMAP 0.10 — Scheduler Transparency & Run Coordination

## Problem Statement

Der Scheduler ist eine Black Box. User sehen keinen Fortschritt, keine Queue-Position, keine Warnungen bei Konflikten. Manuelle Runs und Scheduler können dieselbe Automation parallel ausführen (Double-Run). "Run Now" zeigt 30-90s Spinner ohne Fortschritt oder Modul-Kontention-Warnung.

**User:** Alle Nutzer der App, die Automationen erstellen und manuell triggern.

**Pain Points:**
1. Keine Sichtbarkeit was der Scheduler gerade tut
2. Kein Schutz vor Doppel-Ausführung (Scheduler + Manual)
3. Kein Feedback während laufender Runs (außer LogsTab SSE)
4. Keine Warnung wenn Module von mehreren Automationen geteilt werden

## Acceptance Criteria

- [ ] RunCoordinator verhindert Double-Execution derselben Automation (Mutex)
- [ ] Manuelle Runs geben 409 mit Info wenn Automation bereits läuft
- [ ] Jeder AutomationRun hat ein `runSource` Feld (scheduler | manual)
- [ ] 4 neue Domain Events: SchedulerCycleStarted/Completed, AutomationRunStarted/Completed
- [ ] SSE-Endpoint `/api/scheduler/status` liefert SchedulerSnapshot in Echtzeit
- [ ] `useSchedulerStatus()` Client-Hook für alle Automation-UI-Seiten
- [ ] RunStatusBadge zeigt "Running"/"Queued" pro Automation
- [ ] ModuleBusyBanner warnt bei Modul-Kontention (informational, nicht blockierend)
- [ ] RunHistoryList zeigt runSource-Badge (Scheduled/Manual)
- [ ] Alle UI-Strings in 4 Locales (en, de, fr, es)
- [ ] Allium Spec `scheduler-coordination.allium` als Single Source of Truth
- [ ] Tests für alle neuen Komponenten (Unit, Component, Integration)

## Scope

### In Scope
- RunCoordinator Singleton (In-Memory Mutex, State Tracking)
- Prisma Migration (runSource auf AutomationRun)
- Runner-Signatur-Erweiterung (RunOptions mit runSource + bypassCache-Slot für 0.9)
- Domain Events (4 neue Typen)
- SSE Endpoint + Client Hook
- UI Components (RunStatusBadge, ModuleBusyBanner, ConflictWarning)
- i18n in 4 Locales
- Allium Spec
- Unit + Component Tests

### Out of Scope
- Response Caching (0.9) — nur Signatur-Vorbereitung
- Administrative Queue (8.4) — nur Interface-Design für Zukunftsfähigkeit
- Worker Pool / parallele Automation-Ausführung
- Distributed Locking (Multi-Instance)
- React Query Migration (2.19)

## Technical Constraints
- SQLite Database (kein distributed locking)
- Single Node.js Process (In-Memory-State reicht)
- bun als Package Manager
- Next.js 15 App Router
- Shadcn UI Components
- Bestehende Patterns: EventBus (TypedEventBus), ActionResult<T>, Manifest-driven
- DDD Principles: Allium Specs als Source of Truth

## Technology Stack
- **Frontend:** Next.js 15, React 19, Shadcn UI, Tailwind CSS
- **Backend:** Next.js API Routes, Server Actions
- **Database:** Prisma + SQLite
- **State:** In-Memory Singletons (AutomationLogger, ModuleRegistry, RunCoordinator)
- **Events:** TypedEventBus (in-process)
- **Streaming:** SSE (Server-Sent Events)
- **Testing:** Jest + Testing Library
- **i18n:** Dictionary-based adapter pattern (@/i18n, @/i18n/server)

## Dependencies
- 0.5 Vacancy Pipeline (KERN DONE) — Runner schreibt in StagedVacancy
- 0.6 Event Bus (PHASE 1 DONE) — TypedEventBus existiert
- 0.4 Module Lifecycle (DONE) — Manifests, Registry, Degradation Rules
- 0.9 Response Caching — Runner-Signatur wird vorbereitet (RunOptions.bypassCache)
- 8.4 Administrative Queue — RunCoordinator Interface-Design für Zukunftsfähigkeit

## Configuration
- Stack: nextjs-15-prisma-sqlite-shadcn
- API Style: REST (API Routes + Server Actions)
- Complexity: complex
