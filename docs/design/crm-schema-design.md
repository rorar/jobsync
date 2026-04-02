# CRM Schema Design: Job Status Workflow + Kanban Board

**Date:** 2026-04-02
**Scope:** Database schema additions for ROADMAP 5.3 (Job Status Workflow) and 5.6 (Kanban Board)
**Status:** Design (pre-implementation)

## Current State Analysis

### Existing JobStatus Model

The `JobStatus` model is **global** (not user-scoped). It has `id`, `label`, and `value` (unique). All users share the same status rows.

**Current seed values** (from `prisma/seed.ts` and `src/lib/constants.ts`):

| label | value |
|---|---|
| Draft | draft |
| Applied | applied |
| Interview | interview |
| Offer | offer |
| Rejected | rejected |
| Expired | expired |
| Archived | archived |

**Observation:** The promoter (`src/lib/connector/job-discovery/promoter.ts`) and reference-data (`src/lib/connector/job-discovery/reference-data.ts`) already look for `"bookmarked"` as the default status for promoted vacancies, with a fallback to `"new"`, and will auto-create `"bookmarked"` if neither exists. The seed, however, uses `"draft"` as the initial status. This inconsistency must be resolved.

### Existing Job Model

- Has `statusId` (FK to `JobStatus`) -- current status
- Has `applied` (Boolean) and `appliedDate` (DateTime?) -- set as side-effects of status transitions
- Has indexes on `[userId, automationId]` and `[userId, discoveryStatus]`
- Has NO `sortOrder` field (no Kanban ordering)
- Has NO status history tracking

### Current Status Transition Logic

`updateJobStatus()` in `src/actions/job.actions.ts` performs a direct update with side-effects:
- `"applied"` sets `applied = true, appliedDate = now()`
- `"interview"` sets `applied = true`
- All others: only `statusId` changes

No transition validation exists. No history is recorded.

---

## Schema Additions

### 1. JobStatusHistory Model (New)

Append-only audit log for status transitions. Enables the Timeline view (ROADMAP 5.9) and provides accountability for status changes.

```prisma
model JobStatusHistory {
  id               String     @id @default(cuid())
  jobId            String
  job              Job        @relation(fields: [jobId], references: [id], onDelete: Cascade)
  userId           String
  user             User       @relation(fields: [userId], references: [id])
  previousStatusId String?
  previousStatus   JobStatus? @relation("PreviousStatus", fields: [previousStatusId], references: [id])
  newStatusId      String
  newStatus        JobStatus  @relation("NewStatus", fields: [newStatusId], references: [id])
  note             String?
  changedAt        DateTime   @default(now())

  @@index([jobId, changedAt])
  @@index([userId, changedAt])
  @@index([jobId, userId])
}
```

**Design decisions:**

- **`cuid()` instead of `uuid()`:** CUIDs are time-sortable, which aligns with the append-only nature. They also avoid the potential for UUID v4 index fragmentation on SQLite. This matches the pattern used by other audit-style tables.
- **`onDelete: Cascade` on job relation:** When a Job is deleted, its history is meaningless. Cascade prevents orphans.
- **No `onDelete` on user relation:** Users are never deleted in the current system. If user deletion is added later, history should be preserved (soft-delete the user, don't cascade).
- **No `onDelete` on status relations:** JobStatus rows are global seed data and should never be deleted. If a status is retired in the future, history rows must remain valid (the FK stays intact, the status row just becomes unused for new transitions).
- **`previousStatusId` is nullable:** The first history entry for a Job (created at Job creation time) has no previous status.
- **`note` field:** Optional free-text note for the transition. Enables the "Notes per Status-Transition" requirement from ROADMAP 5.3. Distinct from the existing Note entity -- these are short, inline transition comments, not full rich notes.

### 2. Job Model Extension

Add to the existing Job model:

```prisma
model Job {
  // ... existing fields ...

  sortOrder      Float  @default(0)
  statusHistory  JobStatusHistory[]

  // ... existing indexes ...
  @@index([userId, statusId, sortOrder])
}
```

**New fields:**

- **`sortOrder` (Float):** Position within a Kanban column. Float enables midpoint insertion without reindexing adjacent rows. Default `0` for all existing jobs.
- **`statusHistory` (relation):** Back-relation for the JobStatusHistory entries.

**New index:**

- **`[userId, statusId, sortOrder]`:** THE composite index for Kanban board queries. Allows SQLite to satisfy "get all jobs for user X with status Y, ordered by sortOrder" using a single index scan. Without this, the Kanban query would require a full table scan + sort per column.

### 3. JobStatus Model Update

Add back-relations for the history table:

```prisma
model JobStatus {
  id    String @id @default(uuid())
  label String
  value String @unique
  jobs  Job[]

  // New: back-relations for history
  historyAsPrevious JobStatusHistory[] @relation("PreviousStatus")
  historyAsNew      JobStatusHistory[] @relation("NewStatus")
}
```

No structural changes to the model itself. The `value` field already exists and is unique, which is sufficient for transition validation in application code.

### 4. User Model Update

Add the back-relation for history:

```prisma
model User {
  // ... existing fields ...
  JobStatusHistory JobStatusHistory[]
}
```

---

## Complete Copy-Pasteable Schema Additions

Below is everything that needs to be added/modified in `schema.prisma`. Existing fields are shown only for context; only the lines marked with `// NEW` are additions.

```prisma
// ============================================================
// NEW MODEL: JobStatusHistory
// ============================================================

model JobStatusHistory {
  id               String     @id @default(cuid())
  jobId            String
  job              Job        @relation(fields: [jobId], references: [id], onDelete: Cascade)
  userId           String
  user             User       @relation(fields: [userId], references: [id])
  previousStatusId String?
  previousStatus   JobStatus? @relation("PreviousStatus", fields: [previousStatusId], references: [id])
  newStatusId      String
  newStatus        JobStatus  @relation("NewStatus", fields: [newStatusId], references: [id])
  note             String?
  changedAt        DateTime   @default(now())

  @@index([jobId, changedAt])
  @@index([userId, changedAt])
  @@index([jobId, userId])
}

// ============================================================
// MODIFIED MODEL: User — add back-relation
// ============================================================

model User {
  // ... all existing fields unchanged ...
  JobStatusHistory JobStatusHistory[]  // NEW
}

// ============================================================
// MODIFIED MODEL: Job — add sortOrder + statusHistory + index
// ============================================================

model Job {
  // ... all existing fields unchanged ...

  sortOrder      Float  @default(0)               // NEW
  statusHistory  JobStatusHistory[]                // NEW

  // ... existing indexes unchanged ...
  @@index([userId, statusId, sortOrder])           // NEW
}

// ============================================================
// MODIFIED MODEL: JobStatus — add history back-relations
// ============================================================

model JobStatus {
  id    String @id @default(uuid())
  label String
  value String @unique
  jobs  Job[]

  historyAsPrevious JobStatusHistory[] @relation("PreviousStatus")  // NEW
  historyAsNew      JobStatusHistory[] @relation("NewStatus")       // NEW
}
```

---

## Migration Strategy

### Step 1: Add New Status Values

The task description calls for these Kanban-oriented statuses: `bookmarked`, `applied`, `interview`, `offer`, `accepted`, `rejected`, `archived`.

**Comparison with existing values:**

| Existing | Target | Action |
|---|---|---|
| `draft` | `bookmarked` | Rename: `draft` -> `bookmarked` |
| `applied` | `applied` | Keep as-is |
| `interview` | `interview` | Keep as-is |
| `offer` | `offer` | Keep as-is |
| (none) | `accepted` | Add new |
| `rejected` | `rejected` | Keep as-is |
| `expired` | (keep) | Keep -- still useful for Job Expiry Check (3.8) |
| `archived` | `archived` | Keep as-is |

### Step 2: Migration SQL

The Prisma migration will be generated automatically, but the data migration requires manual SQL in the migration file:

```sql
-- 1. Schema changes (auto-generated by Prisma)
-- ALTER TABLE "Job" ADD COLUMN "sortOrder" REAL NOT NULL DEFAULT 0;
-- CREATE TABLE "JobStatusHistory" ( ... );
-- CREATE INDEX ...

-- 2. Data migration: rename "draft" -> "bookmarked"
UPDATE "JobStatus" SET label = 'Bookmarked', value = 'bookmarked'
  WHERE value = 'draft';

-- 3. Data migration: add "accepted" status
INSERT INTO "JobStatus" (id, label, value)
  VALUES (lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))), 'Accepted', 'accepted');

-- 4. Backfill: create initial history entries for existing jobs
INSERT INTO "JobStatusHistory" (id, jobId, userId, previousStatusId, newStatusId, changedAt)
  SELECT
    lower(hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)),2) || '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)),2) || '-' || hex(randomblob(6))),
    j.id,
    j.userId,
    NULL,
    j.statusId,
    j.createdAt
  FROM "Job" j;
```

**Note on the UUID generation:** SQLite has no `gen_random_uuid()`. The `hex(randomblob(...))` pattern generates a valid UUID v4. In practice, we will use Prisma's `cuid()` for new rows, but the backfill migration runs raw SQL.

### Step 3: Update Application Constants

Files to update after migration:

| File | Change |
|---|---|
| `src/lib/constants.ts` | Update `JOB_STATUSES` array: rename `draft` -> `bookmarked`, add `accepted` |
| `src/lib/data/jobStatusesData.ts` | Same rename + add |
| `prisma/seed.ts` | Update `JOB_STATUSES` array |
| `src/lib/connector/job-discovery/reference-data.ts` | Remove fallback to `"new"` (no longer needed) |
| `src/lib/connector/job-discovery/promoter.ts` | Same cleanup |
| `src/i18n/dictionaries/jobs.ts` | Add `statusBookmarked`, `statusAccepted` keys (all 4 locales) |

### Step 4: Resolve the Promoter Inconsistency

The promoter already expects `"bookmarked"` -- once the migration renames `"draft"` to `"bookmarked"`, the fallback chain in `getDefaultJobStatus()` and `getDefaultJobStatusTx()` simplifies to:

```typescript
export async function getDefaultJobStatus(): Promise<string> {
  let status = await db.jobStatus.findFirst({ where: { value: "bookmarked" } });
  if (!status) {
    status = await db.jobStatus.create({
      data: { label: "Bookmarked", value: "bookmarked" },
    });
  }
  return status.id;
}
```

---

## Index Justification

### JobStatusHistory Indexes

| Index | Query Pattern | Justification |
|---|---|---|
| `[jobId, changedAt]` | Timeline query: "Show status history for job X, ordered by time" | Most common history query. The Kanban detail panel and Timeline view (5.9) will call this on every job detail open. Covering `changedAt` in the index avoids a separate sort step. |
| `[userId, changedAt]` | Activity feed: "Show all status changes by user X in the last 7 days" | Powers the dashboard activity feed and the user-scoped Timeline. Without this, a user activity query would scan all history rows. |
| `[jobId, userId]` | IDOR-safe lookup: "Verify user X owns history entries for job Y" | Required for the security invariant. Every history read must be scoped to the authenticated user. This composite index allows `findMany({ where: { jobId, userId } })` to use an index scan. |

### Job Model New Index

| Index | Query Pattern | Justification |
|---|---|---|
| `[userId, statusId, sortOrder]` | Kanban board: "Get all jobs for user X with status Y, ordered by position" | This is THE critical performance index. The Kanban board fires one query per visible column (status). Without this three-column index, each column query would do: (1) filter by userId (using existing index), (2) filter by statusId (table scan), (3) sort by sortOrder (filesort). With this index, SQLite does a single range scan. For a user with 500 jobs across 7 statuses, this is the difference between 7 table scans and 7 index range scans. |

### Why NOT Additional Indexes

- **`[userId, statusId]` without `sortOrder`:** Already subsumed by the three-column index. SQLite can use the leftmost prefix.
- **`[statusId]` alone:** Never queried without `userId` (IDOR invariant). A bare statusId index would only serve cross-user queries, which are not permitted.
- **`[sortOrder]` alone:** Meaningless without userId + statusId context.

---

## Query Patterns

### 1. Kanban Board Query

Load all jobs for a user, grouped by status column, ordered by `sortOrder` within each column.

```typescript
// Option A: Single query, group in application code (preferred for < 1000 jobs)
const jobs = await prisma.job.findMany({
  where: { userId: user.id },
  include: {
    JobTitle: true,
    Company: true,
    Status: true,
    Location: true,
    tags: true,
  },
  orderBy: { sortOrder: "asc" },
});

// Group by status in application code
const columns = new Map<string, Job[]>();
for (const job of jobs) {
  const statusValue = job.Status.value;
  if (!columns.has(statusValue)) {
    columns.set(statusValue, []);
  }
  columns.get(statusValue)!.push(job);
}
```

```typescript
// Option B: Per-column query (preferred for large datasets or lazy-loading columns)
async function getKanbanColumn(userId: string, statusValue: string) {
  const status = await prisma.jobStatus.findFirst({
    where: { value: statusValue },
  });
  if (!status) return [];

  return prisma.job.findMany({
    where: {
      userId,
      statusId: status.id,
    },
    include: {
      JobTitle: true,
      Company: true,
      Status: true,
      Location: true,
      tags: true,
    },
    orderBy: { sortOrder: "asc" },
  });
}
```

**Recommendation:** Start with Option A. Most users will have fewer than 500 total jobs. A single query that fetches all jobs and groups in-memory is simpler and avoids N+1 for column counts. Switch to Option B only if profiling shows performance issues.

### 2. Status Transition (with History)

Update a job's status and create a history entry in a single transaction. This is the replacement for the current `updateJobStatus()`.

```typescript
export async function transitionJobStatus(
  jobId: string,
  newStatusValue: string,
  note?: string,
): Promise<ActionResult<JobResponse>> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const newStatus = await prisma.jobStatus.findFirst({
    where: { value: newStatusValue },
  });
  if (!newStatus) {
    return { success: false, error: "Invalid status" };
  }

  // Fetch current job (ownership check + get previous status)
  const currentJob = await prisma.job.findFirst({
    where: { id: jobId, userId: user.id },
    select: { statusId: true },
  });
  if (!currentJob) {
    return { success: false, error: "Job not found" };
  }

  // No-op if status unchanged
  if (currentJob.statusId === newStatus.id) {
    return { success: true, data: /* ... */ };
  }

  // TODO: Validate transition against allowed transitions (Allium spec)

  // Side-effect data based on target status
  const sideEffects = computeSideEffects(newStatusValue);

  const job = await prisma.$transaction(async (tx) => {
    // 1. Update the job
    const updated = await tx.job.update({
      where: { id: jobId, userId: user.id },
      data: {
        statusId: newStatus.id,
        ...sideEffects,
      },
      include: {
        JobTitle: true,
        Company: true,
        Status: true,
        Location: true,
        tags: true,
      },
    });

    // 2. Create history entry
    await tx.jobStatusHistory.create({
      data: {
        jobId,
        userId: user.id,
        previousStatusId: currentJob.statusId,
        newStatusId: newStatus.id,
        note: note ?? null,
      },
    });

    return updated;
  });

  return { success: true, data: job };
}

function computeSideEffects(statusValue: string) {
  switch (statusValue) {
    case "applied":
      return { applied: true, appliedDate: new Date() };
    case "interview":
      return { applied: true };
    default:
      return {};
  }
}
```

### 3. Timeline Query (Job History)

Get the full status history for a job, ordered chronologically.

```typescript
export async function getJobStatusHistory(
  jobId: string,
): Promise<JobStatusHistory[]> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  // IDOR: scope by userId
  return prisma.jobStatusHistory.findMany({
    where: {
      jobId,
      userId: user.id,
    },
    include: {
      previousStatus: true,
      newStatus: true,
    },
    orderBy: { changedAt: "asc" },
  });
}
```

### 4. Kanban Reorder (Drag-and-Drop)

Update a job's `sortOrder` when dragged within or between columns.

```typescript
export async function reorderJob(
  jobId: string,
  newStatusValue: string,
  newSortOrder: float,
  note?: string,
): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");

  const newStatus = await prisma.jobStatus.findFirst({
    where: { value: newStatusValue },
  });
  if (!newStatus) {
    return { success: false, error: "Invalid status" };
  }

  const currentJob = await prisma.job.findFirst({
    where: { id: jobId, userId: user.id },
    select: { statusId: true, sortOrder: true },
  });
  if (!currentJob) {
    return { success: false, error: "Job not found" };
  }

  const statusChanged = currentJob.statusId !== newStatus.id;

  await prisma.$transaction(async (tx) => {
    // 1. Update position (and optionally status)
    await tx.job.update({
      where: { id: jobId, userId: user.id },
      data: {
        sortOrder: newSortOrder,
        ...(statusChanged ? { statusId: newStatus.id } : {}),
      },
    });

    // 2. If status changed, record history
    if (statusChanged) {
      await tx.jobStatusHistory.create({
        data: {
          jobId,
          userId: user.id,
          previousStatusId: currentJob.statusId,
          newStatusId: newStatus.id,
          note: note ?? null,
        },
      });
    }
  });

  return { success: true };
}
```

---

## sortOrder Strategy: Float-Based Ordering

### How It Works

Each job has a `Float` sortOrder value. When a job is placed between two others, it gets the midpoint of their values.

**Initial state** (jobs in a column):

```
Job A: sortOrder = 1.0
Job B: sortOrder = 2.0
Job C: sortOrder = 3.0
```

**User drags Job C between A and B:**

```
Job A: sortOrder = 1.0
Job C: sortOrder = 1.5   <-- midpoint of 1.0 and 2.0
Job B: sortOrder = 2.0
```

**User drags a new Job D to the top (before A):**

```
Job D: sortOrder = 0.5   <-- midpoint of 0.0 and 1.0
Job A: sortOrder = 1.0
Job C: sortOrder = 1.5
Job B: sortOrder = 2.0
```

### Midpoint Calculation

```typescript
function calculateSortOrder(
  before: number | null,  // sortOrder of the job ABOVE (null = top of column)
  after: number | null,   // sortOrder of the job BELOW (null = bottom of column)
): number {
  const STEP = 1024;  // Large step for appends

  if (before === null && after === null) {
    // Empty column — first job
    return STEP;
  }
  if (before === null) {
    // Dropped at top — half the first item's value
    return after! / 2;
  }
  if (after === null) {
    // Dropped at bottom — add STEP to the last item
    return before + STEP;
  }
  // Dropped between two items — midpoint
  return (before + after) / 2;
}
```

### Precision Exhaustion and Periodic Reindexing

IEEE 754 double-precision floats have 53 bits of significand. After ~50 consecutive midpoint insertions between the same two values, precision loss becomes a risk (values become indistinguishable).

**Detection:** After calculating a midpoint, check:

```typescript
const EPSILON = 1e-10;
if (Math.abs(newOrder - before) < EPSILON || Math.abs(newOrder - after) < EPSILON) {
  // Precision exhausted — trigger reindex for this column
  await reindexColumn(userId, statusId);
}
```

**Reindexing:** Reset all sortOrder values in a column to evenly-spaced integers:

```typescript
async function reindexColumn(userId: string, statusId: string) {
  const jobs = await prisma.job.findMany({
    where: { userId, statusId },
    orderBy: { sortOrder: "asc" },
    select: { id: true },
  });

  const STEP = 1024;
  await prisma.$transaction(
    jobs.map((job, index) =>
      prisma.job.update({
        where: { id: job.id },
        data: { sortOrder: (index + 1) * STEP },
      })
    )
  );
}
```

**Frequency:** In practice, reindexing is extremely rare. A user would need to perform ~50 consecutive drag operations between the exact same two cards. Using a step size of 1024 for appends gives even more headroom. Reindexing a column of 100 jobs is 100 UPDATE statements in a transaction -- negligible for SQLite.

### Why Float, Not Integer?

| Approach | Pros | Cons |
|---|---|---|
| **Float midpoint** | Single UPDATE per drag. No cascading updates. | Precision exhaustion after ~50 midpoints (rare, mitigated by reindex). |
| **Integer with gaps** | No precision issues. | Still needs reindex when gaps close. Same complexity. |
| **Integer reorder all** | Always clean values. | N UPDATEs per drag (one per item in column). Expensive for large columns. |
| **Linked list** | Clean ordering. | Complex queries, no index-based sort. SQLite cannot do recursive CTEs efficiently for ordering. |
| **Array/JSON** | Simple reorder. | SQLite has no native array type. Would require JSON parsing on every query. |

**Conclusion:** Float midpoint is the standard approach for relational databases without array types. It is used by Notion, Linear, Trello, and other Kanban tools.

---

## Transition Validation (Application Layer)

Since SQLite has no CHECK constraints with subqueries, transition validation happens in the server action, not the database.

### Allowed Transitions Map

Defined as a constant (derived from the Allium spec):

```typescript
// src/lib/constants.ts (or a new src/lib/status-transitions.ts)

export const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  bookmarked: ["applied", "archived"],
  applied:    ["interview", "offer", "rejected", "archived"],
  interview:  ["offer", "rejected", "archived"],
  offer:      ["accepted", "rejected", "archived"],
  accepted:   ["archived"],
  rejected:   ["bookmarked", "archived"],
  expired:    ["bookmarked", "archived"],
  archived:   ["bookmarked"],
} as const;
```

**Validation in transitionJobStatus:**

```typescript
function isTransitionAllowed(fromValue: string, toValue: string): boolean {
  const allowed = ALLOWED_TRANSITIONS[fromValue];
  if (!allowed) return false;
  return allowed.includes(toValue);
}
```

**Note:** This map is enforced in server actions, NOT in the database. The Kanban UI should also use it to grey out invalid drop targets, but the server is the authoritative check.

---

## Backfill Strategy for Existing Data

### sortOrder Backfill

All existing jobs get `sortOrder = 0`. Since they have no prior Kanban ordering, this is acceptable. When the Kanban board first loads, jobs within each column will be ordered by `sortOrder` (all 0) and then by a secondary sort (e.g., `createdAt DESC`). The first drag operation establishes real ordering.

**Alternative:** Backfill with sequential values based on `createdAt`:

```sql
-- Optional: assign sequential sortOrder based on creation date
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY userId, statusId ORDER BY createdAt DESC) * 1024 AS newOrder
  FROM "Job"
)
UPDATE "Job" SET sortOrder = (SELECT newOrder FROM ranked WHERE ranked.id = "Job".id);
```

**Recommendation:** Use the `DEFAULT 0` approach for simplicity. Add the `createdAt`-based backfill only if the UX review identifies that initial Kanban column ordering matters for first impressions.

### History Backfill

The migration creates one history entry per existing job, recording its current status as the initial state (`previousStatusId = NULL`). This ensures the Timeline view has at least one entry for every job.

---

## Open Design Questions

### Q1: Should the initial history entry be created at Job creation time?

**Recommendation: Yes.** When `createJob()` is called, insert a `JobStatusHistory` entry with `previousStatusId = null` and `newStatusId = initialStatus`. This establishes a complete audit trail from day one.

### Q2: Should Kanban column order be user-configurable?

**Current design:** Column order is hardcoded in the UI based on the `ALLOWED_TRANSITIONS` map (natural workflow left-to-right). If users want custom column order, that is a separate feature (UserSettings JSON field).

### Q3: Should we add `sortOrder` to JobStatus for column ordering?

**Not now.** Column order in the Kanban board should follow the natural workflow progression. If custom column ordering is needed later, add `sortOrder` to JobStatus or store it in UserSettings.

### Q4: What happens to the `applied` and `appliedDate` fields on Job?

**Keep them.** They are used in dashboard queries and the jobs list. The status history is an audit log, not a replacement for these denormalized fields. The `computeSideEffects()` function continues to set them during transitions.

### Q5: Relation naming -- PascalCase or camelCase?

The existing schema uses PascalCase for some relations (`JobTitle`, `Company`, `Status`) and camelCase for others (`job`, `user`, `tags`). The new `JobStatusHistory` model follows the existing pattern: PascalCase for the relation names on the parent side (`JobStatusHistory` on User), camelCase on the child side (`job`, `user`, `previousStatus`, `newStatus`).
