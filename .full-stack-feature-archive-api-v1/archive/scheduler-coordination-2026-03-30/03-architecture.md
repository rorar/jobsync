# Architecture: ROADMAP 0.10 — Scheduler Transparency & Run Coordination

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Application Layer                           │
│                                                                     │
│  ┌──────────────┐    ┌──────────────────────────────────────────┐   │
│  │  Manual Run   │    │              Scheduler                   │   │
│  │  API Route    │    │  (node-cron, hourly)                    │   │
│  │  POST /api/   │    │  runDueAutomations()                    │   │
│  │  automations/ │    │                                          │   │
│  │  [id]/run     │    │                                          │   │
│  └──────┬───────┘    └──────────────┬───────────────────────────┘   │
│         │                           │                               │
│         └─────────┬─────────────────┘                               │
│                   ▼                                                  │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    RunCoordinator (Singleton)                   │  │
│  │                                                                │  │
│  │  requestRun(automation, options) → RunRequestResult            │  │
│  │  getState() → SchedulerSnapshot                               │  │
│  │  getRunStatus(automationId) → RunLock?                        │  │
│  │  getModuleBusy(moduleId) → RunLock[]                          │  │
│  │  reportProgress(automationId, progress) → void                │  │
│  │                                                                │  │
│  │  Internal: runLocks Map<automationId, RunLock>                │  │
│  │  Internal: schedulerPhase: SchedulerPhase                     │  │
│  │  Internal: currentCycleQueue: RunQueuePosition[]              │  │
│  └──────────────────────┬────────────────────────────────────────┘  │
│                         │                                           │
│              ┌──────────┴──────────┐                                │
│              ▼                     ▼                                │
│  ┌─────────────────┐   ┌──────────────────┐                       │
│  │  runAutomation() │   │    EventBus       │                       │
│  │  (runner.ts)     │   │  (TypedEventBus)  │                       │
│  │                  │   │                   │                       │
│  │  search → dedup  │   │  Events:          │                       │
│  │  → match → save  │   │  RunStarted       │                       │
│  │                  │   │  RunCompleted      │                       │
│  │  Reports progress│   │  CycleStarted     │                       │
│  │  via callback    │   │  CycleCompleted   │                       │
│  └─────────────────┘   └──────────────────┘                       │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    SSE: /api/scheduler/status                  │  │
│  │  Polls RunCoordinator.getState() every 2s                     │  │
│  │  Auth-gated, auto-close after 10min                           │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    Client: useSchedulerStatus()                │  │
│  │  EventSource → SSE endpoint                                   │  │
│  │  Returns { isConnected, state: SchedulerSnapshot | null }     │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │                    UI Components                               │  │
│  │  RunStatusBadge | ModuleBusyBanner | ConflictWarning          │  │
│  │  RunHistoryList (enhanced with runSource)                     │  │
│  └────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
```

## Backend Architecture

### New Files
| File | Type | Purpose |
|------|------|---------|
| `src/lib/scheduler/types.ts` | Types | RunSource, RunLock, SchedulerSnapshot, RunOptions, RunRequestResult, RunQueuePosition, RunProgress |
| `src/lib/scheduler/run-coordinator.ts` | Singleton Service | Central coordination: mutex, state tracking, event emission |

### Modified Files
| File | Changes |
|------|---------|
| `src/lib/scheduler/index.ts` | Replace direct `runAutomation()` with `runCoordinator.requestRun()`. Add SchedulerPhase transitions. |
| `src/lib/connector/job-discovery/runner.ts` | Accept `RunOptions` parameter. Pass `runSource` to `AutomationRun.create()`. Call `reportProgress()`. |
| `src/app/api/automations/[id]/run/route.ts` | Route through RunCoordinator. Handle 409 (already_running). |
| `src/lib/events/event-types.ts` | Add 4 new event types + payloads to EventPayloadMap. |
| `src/models/automation.model.ts` | Add `RunSource` type. Add `runSource` to `AutomationRun` interface. |
| `prisma/schema.prisma` | Add `runSource` column to AutomationRun. |

### RunCoordinator Design

```typescript
// Interface-first (future: reimplementable as TaskQueue adapter for 8.4)
interface IRunCoordinator {
  requestRun(automation: Automation, options: RunOptions): Promise<RunRequestResult>;
  getState(): SchedulerSnapshot;
  getRunStatus(automationId: string): RunLock | null;
  getModuleBusy(moduleId: string): RunLock[];
  reportProgress(automationId: string, progress: RunProgress): void;

  // Scheduler lifecycle (called by scheduler only)
  startCycle(dueAutomations: Automation[]): void;
  completeCycle(): void;
}
```

### Error Handling
- `requestRun()` wraps `runAutomation()` in try/finally — lock always released
- On crash: in-memory state resets on restart (acceptable for single-process)
- Lock timeout: optional watchdog timer (configurable, default disabled)

## Frontend Architecture

### New Files
| File | Type | Purpose |
|------|------|---------|
| `src/app/api/scheduler/status/route.ts` | API Route | SSE endpoint streaming SchedulerSnapshot |
| `src/hooks/use-scheduler-status.ts` | React Hook | EventSource lifecycle, reconnection, tab-visibility |
| `src/components/automations/RunStatusBadge.tsx` | Component | "Running" / "Queued" badge per automation |
| `src/components/automations/ModuleBusyBanner.tsx` | Component | Module contention warning banner |

### Modified Files
| File | Changes |
|------|---------|
| `src/components/automations/AutomationList.tsx` | Add RunStatusBadge per automation card |
| `src/app/dashboard/automations/[id]/page.tsx` | Add RunStatusBadge, ModuleBusyBanner, handle 409 |
| `src/components/automations/RunHistoryList.tsx` | Add runSource badge per run entry |
| `src/i18n/dictionaries/automations.ts` | New keys in 4 locales |

### State Management
- `useSchedulerStatus()` hook manages SSE connection lifecycle
- Returns reactive `SchedulerSnapshot` state
- Tab-visibility check pauses/resumes SSE polling
- Auto-reconnect on connection loss

### Component Hierarchy
```
AutomationList
  └─ AutomationCard
       └─ RunStatusBadge (uses useSchedulerStatus)

AutomationDetailPage
  ├─ RunStatusBadge
  ├─ ModuleBusyBanner (conditional)
  ├─ "Run Now" Button (disabled if already_running)
  └─ RunHistoryList
       └─ RunSourceBadge (per entry)
```

## Cross-Cutting Concerns

### Security
- SSE endpoint requires `auth()` check (same as existing logs route)
- No new sensitive data exposed (automation IDs + status are already visible to the user)

### Performance
- SSE polls in-memory Map (no DB queries) — negligible overhead
- 2s poll interval is conservative (could be 5s for lower overhead)
- Tab-visibility check prevents zombie connections

### i18n
- All new UI strings in 4 locales (en, de, fr, es)
- Follow existing pattern: namespace `automations.*`
