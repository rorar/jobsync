# Database Design: ROADMAP 0.10 — Scheduler Transparency & Run Coordination

## Schema Change: AutomationRun

### Migration: Add `runSource` column

```prisma
model AutomationRun {
  id           String     @id @default(uuid())
  automationId String
  automation   Automation @relation(fields: [automationId], references: [id], onDelete: Cascade)

  jobsSearched     Int @default(0)
  jobsDeduplicated Int @default(0)
  jobsProcessed    Int @default(0)
  jobsMatched      Int @default(0)
  jobsSaved        Int @default(0)

  status        String  @default("running")
  errorMessage  String?
  blockedReason String?
  runSource     String  @default("scheduler")  // NEW: "scheduler" | "manual"

  startedAt   DateTime  @default(now())
  completedAt DateTime?

  @@index([automationId])
  @@index([startedAt])
}
```

### Migration Strategy
- **Non-breaking**: Add column with default value `"scheduler"`
- **Existing data**: All existing rows get `runSource = "scheduler"` (correct default — all historical runs were scheduler-initiated)
- **No index needed**: `runSource` is not queried independently; it's always part of a record already fetched by `automationId`
- **Rollback**: Simple column drop if needed

### Query Patterns
- No new query patterns — `runSource` is read from existing `AutomationRun` records
- Existing queries remain unchanged (the field has a default)
- Future: analytics queries filtering by `runSource` (0.18 Analytics)

## In-Memory State (NOT persisted)

The following state is held in memory only and resets on process restart. This is intentional — scheduler coordination state is ephemeral.

| Entity | Storage | Persistence | Rationale |
|--------|---------|-------------|-----------|
| SchedulerState | In-memory singleton | None (resets on restart) | Coordination state is process-scoped. On restart, no runs are active. |
| RunLock map | In-memory Map | None | Locks represent active Promises. On restart, all Promises are gone. |
| RunProgress | In-memory ref | None | Live counters during execution. Lost on crash = acceptable. |
| AutomationLogger | In-memory Map | None (existing) | Already ephemeral. 1-hour retention. |

No new Prisma tables needed. The `runSource` column on `AutomationRun` is the only schema change.
