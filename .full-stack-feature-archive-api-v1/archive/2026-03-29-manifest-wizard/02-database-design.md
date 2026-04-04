# Database Design: scheduleFrequency Migration (Phase 0e)

## Overview

This document specifies the single schema change required for the Manifest-Driven AutomationWizard feature: extracting `scheduleFrequency` from the `connectorParams` JSON blob into a first-class column on the `Automation` model.

**No new tables are created.** Only the `Automation` model is modified.

## Current State

### Schema

```prisma
model Automation {
  // ...
  connectorParams String?
  scheduleHour    Int
  // ...
}
```

### Data Flow (before)

1. **Wizard writes:** `scheduleFrequency` is serialized into `connectorParams` JSON alongside module-specific params:
   ```json
   { "scheduleFrequency": "weekly", "language": "de" }
   ```
   The wizard only writes non-`"daily"` values to keep the common case lean (line 276 of `AutomationWizard.tsx`).

2. **Runner reads:** `runner.ts:142` parses `connectorParams` JSON and extracts `scheduleFrequency`:
   ```typescript
   const connectorParams = automation.connectorParams ? JSON.parse(automation.connectorParams) : {};
   const scheduleFrequency: ScheduleFrequency = connectorParams.scheduleFrequency || "daily";
   ```

3. **Scheduler calls:** `runDueAutomations()` in `src/lib/scheduler/index.ts` passes the full `Automation` object to `runAutomation()`. It does not read `scheduleFrequency` directly.

4. **finalizeRun computes:** `calculateNextRunAt(scheduleHour, scheduleFrequency)` determines the next execution time.

### Problem

`scheduleFrequency` is a **system scheduling concern** (it controls when the next run happens), not a module connector parameter. No module's `search()` method ever reads it. Storing it in `connectorParams` JSON:
- Makes it invisible to database queries (cannot index or filter by frequency)
- Mixes domain boundaries (scheduling vs. search configuration)
- Forces the runner to parse JSON just to extract a scheduling field
- Will be validated against module `connectorParamsSchema` once the schema becomes typed (Phase 0d), causing false validation errors

---

## Target State

### Schema Change

```prisma
model Automation {
  id     String @id @default(uuid())
  userId String
  user   User   @relation(fields: [userId], references: [id])

  name           String
  jobBoard       String
  keywords       String
  location       String
  connectorParams String?
  resumeId       String
  resume         Resume @relation(fields: [resumeId], references: [id])
  matchThreshold Int    @default(80)

  scheduleHour      Int
  scheduleFrequency String  @default("daily")   // <-- NEW COLUMN
  nextRunAt         DateTime?
  lastRunAt         DateTime?

  status      String  @default("active")
  pauseReason String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  runs             AutomationRun[]
  discoveredJobs   Job[]
  stagedVacancies  StagedVacancy[]

  @@index([userId])
  @@index([status, nextRunAt])
}
```

**Column details:**

| Property | Value |
|---|---|
| Column name | `scheduleFrequency` |
| Type | `String` (TEXT in SQLite) |
| Default | `"daily"` |
| Nullable | No (`@default("daily")` ensures all rows have a value) |
| Valid values | `"6h"`, `"12h"`, `"daily"`, `"2d"`, `"weekly"` |
| Position | After `scheduleHour`, before `nextRunAt` (logical grouping) |

**Why `String` instead of an enum?** SQLite does not have native enum support. Prisma on SQLite stores enums as strings anyway. Using `String` with application-level validation (via the `ScheduleFrequency` TypeScript type) is the established pattern in this codebase (see `status`, `pauseReason`, `jobBoard`).

---

## Prisma Migration

### Migration SQL

File: `prisma/migrations/YYYYMMDDHHMMSS_add_schedule_frequency/migration.sql`

```sql
-- Add scheduleFrequency column with default value
ALTER TABLE "Automation" ADD COLUMN "scheduleFrequency" TEXT NOT NULL DEFAULT 'daily';
```

This is a single `ALTER TABLE ADD COLUMN` statement. SQLite supports `ADD COLUMN` with a `DEFAULT` clause, which means:
- All existing rows get `"daily"` as their `scheduleFrequency` value immediately
- No table rebuild is needed
- The operation is fast even on large tables

**Important:** The `DEFAULT 'daily'` in the SQL handles the majority of existing automations correctly, since `"daily"` was already the fallback in `runner.ts:142` (`connectorParams.scheduleFrequency || "daily"`). However, automations that explicitly use non-daily frequencies (stored in `connectorParams` JSON) need a data migration to extract the correct value.

### Generating the Migration

```bash
cd /home/pascal/projekte/jobsync
source scripts/env.sh
npx prisma migrate dev --name add_schedule_frequency
```

---

## Data Migration Script

File: `scripts/migrate-schedule-frequency.ts`

This script runs **after** the Prisma migration and **before** deploying the updated runner code. It extracts `scheduleFrequency` from `connectorParams` JSON and writes it to the new column, then removes it from the JSON blob.

### Logic

```typescript
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_FREQUENCIES = new Set(["6h", "12h", "daily", "2d", "weekly"]);

async function migrate() {
  console.log("[migrate-schedule-frequency] Starting...");

  // Find all automations that have connectorParams containing scheduleFrequency
  const automations = await prisma.automation.findMany({
    where: {
      connectorParams: { not: null },
    },
    select: {
      id: true,
      connectorParams: true,
      scheduleFrequency: true,
    },
  });

  let migrated = 0;
  let skipped = 0;
  let cleaned = 0;
  let errors = 0;

  for (const automation of automations) {
    try {
      const params = JSON.parse(automation.connectorParams!);

      // Skip if no scheduleFrequency in connectorParams
      if (!params.scheduleFrequency) {
        skipped++;
        continue;
      }

      const frequency = String(params.scheduleFrequency);

      // Validate the frequency value
      if (!VALID_FREQUENCIES.has(frequency)) {
        console.warn(
          `[migrate-schedule-frequency] Invalid frequency "${frequency}" for automation ${automation.id}, defaulting to "daily"`
        );
      }

      const validFrequency = VALID_FREQUENCIES.has(frequency) ? frequency : "daily";

      // Remove scheduleFrequency from connectorParams
      const { scheduleFrequency: _, ...remainingParams } = params;

      // Determine new connectorParams value
      // If the remaining params are empty, set to null
      const newConnectorParams = Object.keys(remainingParams).length > 0
        ? JSON.stringify(remainingParams)
        : null;

      // Update the automation
      await prisma.automation.update({
        where: { id: automation.id },
        data: {
          scheduleFrequency: validFrequency,
          connectorParams: newConnectorParams,
        },
      });

      migrated++;

      if (newConnectorParams === null && automation.connectorParams !== null) {
        cleaned++;
      }
    } catch (err) {
      console.error(
        `[migrate-schedule-frequency] Error processing automation ${automation.id}:`,
        err
      );
      errors++;
    }
  }

  console.log(`[migrate-schedule-frequency] Complete.`);
  console.log(`  Migrated: ${migrated}`);
  console.log(`  Skipped (no scheduleFrequency in JSON): ${skipped}`);
  console.log(`  Cleaned (connectorParams set to null): ${cleaned}`);
  console.log(`  Errors: ${errors}`);
  console.log(`  Total processed: ${automations.length}`);
}

migrate()
  .catch((err) => {
    console.error("[migrate-schedule-frequency] Fatal error:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
```

### Running the Script

```bash
cd /home/pascal/projekte/jobsync
source scripts/env.sh

# 1. Run Prisma migration first (adds the column with DEFAULT 'daily')
npx prisma migrate dev --name add_schedule_frequency

# 2. Run data migration (extracts non-daily frequencies from JSON)
npx tsx scripts/migrate-schedule-frequency.ts
```

### Idempotency

The script is idempotent:
- If `scheduleFrequency` is not in `connectorParams` JSON, the row is skipped
- If run a second time after a successful first run, all rows will be skipped (0 migrated)
- The script never overwrites a column value that was already migrated

---

## Model & Type Changes

### 1. Prisma Schema (`prisma/schema.prisma`)

Add one line to the `Automation` model:

```diff
  scheduleHour Int
+ scheduleFrequency String  @default("daily")
  nextRunAt    DateTime?
```

### 2. Domain Model (`src/models/automation.model.ts`)

Add `scheduleFrequency` to the `Automation` interface:

```diff
  export interface Automation {
    // ...
    scheduleHour: number;
+   scheduleFrequency: string;
    nextRunAt: Date | null;
    // ...
  }
```

### 3. Zod Schema (`src/models/automation.schema.ts`)

Add `scheduleFrequency` to the `CreateAutomationSchema`:

```diff
  export const CreateAutomationSchema = z.object({
    name: z.string().min(1, "Name is required").max(100),
    jobBoard: JobBoardSchema,
    keywords: z.string().min(1, "Keywords are required").max(500),
    location: z.string().min(1, "Location is required").max(200),
    connectorParams: z.string().optional(),
    resumeId: z.string().uuid("Invalid resume"),
    matchThreshold: z.number().min(0).max(100),
    scheduleHour: z.number().min(0).max(23),
+   scheduleFrequency: z.enum(["6h", "12h", "daily", "2d", "weekly"]).default("daily"),
  });
```

### 4. Test Fixtures (`src/lib/data/testFixtures.ts`)

Add `scheduleFrequency` to all `Automation` fixtures:

```diff
  export const mockAutomation: Automation = {
    // ...
    scheduleHour: 8,
+   scheduleFrequency: "daily",
    nextRunAt: new Date("2024-06-20T08:00:00.000Z"),
    // ...
  };
```

Same for `mockAutomationPaused`, `mockAutomationEures`, `mockAutomationHighThreshold`, `mockAutomationNeverRun`.

---

## Data Access Pattern Changes

### Runner (`src/lib/connector/job-discovery/runner.ts`)

**Before:**
```typescript
const connectorParams = automation.connectorParams ? JSON.parse(automation.connectorParams as string) : {};
const scheduleFrequency: ScheduleFrequency = connectorParams.scheduleFrequency || "daily";
```

**After:**
```typescript
const scheduleFrequency: ScheduleFrequency = (automation.scheduleFrequency as ScheduleFrequency) || "daily";
```

The runner no longer extracts `scheduleFrequency` from JSON. It reads directly from the typed field on the `Automation` object. The JSON parse of `connectorParams` on line 141 can be removed entirely since it was only done to extract `scheduleFrequency`. The later parse on line 219 (for `connector.search()`) remains.

### Server Actions (`src/actions/automation.actions.ts`)

**createAutomation:**
```diff
  const automation = await prisma.automation.create({
    data: {
      userId: user.id,
      name: validated.name,
      jobBoard: validated.jobBoard,
      keywords: validated.keywords,
      location: validated.location,
      connectorParams: validated.connectorParams,
      resumeId: validated.resumeId,
      matchThreshold: validated.matchThreshold,
      scheduleHour: validated.scheduleHour,
+     scheduleFrequency: validated.scheduleFrequency,
      nextRunAt,
      status: "active",
    },
    // ...
  });
```

**updateAutomation:**
```diff
  const updateData: Record<string, unknown> = { ...validated };

+ // Recalculate nextRunAt when scheduleHour OR scheduleFrequency changes
- if (validated.scheduleHour !== undefined) {
-   updateData.nextRunAt = calculateNextRunAt(validated.scheduleHour);
- }
+ if (validated.scheduleHour !== undefined || validated.scheduleFrequency !== undefined) {
+   const hour = validated.scheduleHour ?? existing.scheduleHour;
+   const freq = validated.scheduleFrequency ?? existing.scheduleFrequency;
+   updateData.nextRunAt = calculateNextRunAt(hour, freq as ScheduleFrequency);
+ }
```

Note: `calculateNextRunAt` already accepts an optional `ScheduleFrequency` parameter (`schedule.ts:7`). The `createAutomation` action currently calls `calculateNextRunAt(validated.scheduleHour)` without frequency -- this should also be updated:

```diff
- const nextRunAt = calculateNextRunAt(validated.scheduleHour);
+ const nextRunAt = calculateNextRunAt(validated.scheduleHour, validated.scheduleFrequency as ScheduleFrequency);
```

### Scheduler (`src/lib/scheduler/index.ts`)

The scheduler passes the full automation object to `runAutomation()`. After the schema change, `automation.scheduleFrequency` will automatically be included in the Prisma result (since it has a `@default("daily")` and is a non-nullable column). No code change needed in the scheduler itself -- the runner will read `automation.scheduleFrequency` directly.

### API Route (`src/app/api/automations/[id]/run/route.ts`)

Same as scheduler -- the API route passes the full automation object to `runAutomation()`. The new `scheduleFrequency` field is automatically included from the Prisma query. No code changes needed.

However, both the scheduler (line 48-65) and the API route (line 72-89) manually construct an `Automation` object to pass to `runAutomation()`. After adding `scheduleFrequency` to the `Automation` interface, these call sites must include the new field:

**Scheduler:**
```diff
  const result = await runAutomation({
    id: automation.id,
    // ... existing fields ...
    scheduleHour: automation.scheduleHour,
+   scheduleFrequency: automation.scheduleFrequency,
    nextRunAt: automation.nextRunAt,
    // ...
  });
```

**API Route:**
```diff
  const result: RunnerResult = await runAutomation({
    id: automation.id,
    // ... existing fields ...
    scheduleHour: automation.scheduleHour,
+   scheduleFrequency: automation.scheduleFrequency,
    nextRunAt: automation.nextRunAt,
    // ...
  });
```

### Wizard (`src/components/automations/AutomationWizard.tsx`)

**Before:** The wizard stores `scheduleFrequency` in `connectorParams` JSON via `updateConnectorParams({ scheduleFrequency: freq })`.

**After:** The wizard writes `scheduleFrequency` as a top-level form field:

```diff
- const handleScheduleFrequencyChange = (freq: ScheduleFrequency) => {
-   setScheduleFrequency(freq);
-   updateConnectorParams({ scheduleFrequency: freq });
- };
+ const handleScheduleFrequencyChange = (freq: ScheduleFrequency) => {
+   setScheduleFrequency(freq);
+   form.setValue("scheduleFrequency", freq);
+ };
```

**On submit** (remove the special-case injection):
```diff
-     // Only persist non-daily frequencies
-     const currentParams = tryParseConnectorParams(data.connectorParams) ?? {};
-     if (scheduleFrequency !== "daily") {
-       data.connectorParams = JSON.stringify({ ...currentParams, scheduleFrequency });
-     }
+     // scheduleFrequency is now a top-level field, no need to inject into connectorParams
```

**On edit load** (read from the automation object instead of connectorParams JSON):
```diff
-     const editFrequency = editParams?.scheduleFrequency ?? "daily";
+     const editFrequency = editAutomation?.scheduleFrequency ?? "daily";
```

### resumeAutomation (`src/actions/automation.actions.ts`)

Currently calculates `nextRunAt` without `scheduleFrequency`:
```diff
- const nextRunAt = calculateNextRunAt(automation.scheduleHour);
+ const nextRunAt = calculateNextRunAt(
+   automation.scheduleHour,
+   automation.scheduleFrequency as ScheduleFrequency
+ );
```

This is a **bug fix** -- currently, resuming a paused automation always schedules the next run as "daily", ignoring the configured frequency.

---

## Backward Compatibility

### During Transition (between migration and code deploy)

1. **Prisma migration runs first:** Adds `scheduleFrequency` column with `DEFAULT 'daily'`. All existing rows immediately get `"daily"`.

2. **Data migration script runs:** Extracts non-`"daily"` frequencies from `connectorParams` JSON and writes them to the new column. Removes `scheduleFrequency` from the JSON blob.

3. **Old code is still running (until deploy):** The old runner reads `scheduleFrequency` from `connectorParams`. For automations that had the data migration run:
   - If the frequency was `"daily"`: the old runner reads `connectorParams.scheduleFrequency` which is now absent, falls back to `"daily"` -- **correct behavior**.
   - If the frequency was non-`"daily"` (e.g., `"weekly"`): the old runner reads `connectorParams.scheduleFrequency` which is now absent, falls back to `"daily"` -- **temporarily incorrect**. This is a brief window (minutes) during deployment. Mitigation: deploy during off-peak hours, or deploy the data migration script and code deploy atomically.

4. **New code deploys:** The new runner reads `automation.scheduleFrequency` directly -- all values are correct.

### Defensive Read Pattern (optional hardening)

If zero-downtime deployment is critical, the runner can use a defensive pattern during the transition window:

```typescript
// Prefer the new column, fall back to connectorParams JSON for backward compatibility
const scheduleFrequency: ScheduleFrequency =
  (automation.scheduleFrequency as ScheduleFrequency) ||
  (() => {
    const params = automation.connectorParams ? JSON.parse(automation.connectorParams) : {};
    return params.scheduleFrequency || "daily";
  })();
```

This pattern can be removed in a follow-up cleanup once all deployments are confirmed.

### connectorParams Cleanup

After the data migration script runs, `connectorParams` JSON no longer contains `scheduleFrequency`. For automations where `scheduleFrequency` was the **only** key in the JSON:
- Example before: `{"scheduleFrequency": "weekly"}` -> after: `null`
- Example before: `{"scheduleFrequency": "12h", "language": "de"}` -> after: `{"language": "de"}`

The `connectorParams` column remains nullable and continues to hold module-specific params (e.g., `language` for EURES, `umkreis` for Arbeitsagentur). Its JSON shape is now cleaner -- it contains only what modules actually use.

---

## Validation Changes

### params-validator.ts

The `validateConnectorParams` function currently iterates `Object.entries(schema)` on a `Record<string, unknown>`. After Phase 0d converts the schema to `ConnectorParamField[]` (Array format), the validator will iterate the array.

**Key point for this migration:** `scheduleFrequency` was never declared in any module's `connectorParamsSchema`. It was silently passed through because the validator only rejects unknown keys that conflict with declared fields. After extraction to its own column, `scheduleFrequency` will no longer appear in `connectorParams` at all, so no validator changes are needed for this specific migration.

However, if an old client (pre-deploy) sends `scheduleFrequency` inside `connectorParams`, the validator should not reject it. The current pass-through behavior handles this correctly: undeclared keys are ignored, not rejected.

---

## Files Modified (Summary)

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `scheduleFrequency String @default("daily")` to Automation |
| `prisma/migrations/.../migration.sql` | `ALTER TABLE ADD COLUMN` (auto-generated) |
| `scripts/migrate-schedule-frequency.ts` | NEW: Data migration script |
| `src/models/automation.model.ts` | Add `scheduleFrequency: string` to `Automation` interface |
| `src/models/automation.schema.ts` | Add `scheduleFrequency` to `CreateAutomationSchema` |
| `src/lib/connector/job-discovery/runner.ts` | Read `automation.scheduleFrequency` instead of parsing JSON |
| `src/actions/automation.actions.ts` | Write `scheduleFrequency` on create/update; fix `resumeAutomation` nextRunAt |
| `src/lib/scheduler/index.ts` | Add `scheduleFrequency` to the `runAutomation()` call |
| `src/app/api/automations/[id]/run/route.ts` | Add `scheduleFrequency` to the `runAutomation()` call |
| `src/components/automations/AutomationWizard.tsx` | Write as form field instead of JSON; read from automation on edit |
| `src/lib/data/testFixtures.ts` | Add `scheduleFrequency` to all Automation fixtures |

---

## Testing Checklist

- [ ] Prisma migration applies cleanly: `npx prisma migrate dev`
- [ ] Data migration script runs idempotently: `npx tsx scripts/migrate-schedule-frequency.ts`
- [ ] `scheduleFrequency` defaults to `"daily"` for new automations
- [ ] Non-daily frequencies are persisted and read correctly
- [ ] Existing `scheduleHour`-only logic still works (daily is the default)
- [ ] `calculateNextRunAt` receives correct frequency from runner
- [ ] `resumeAutomation` now uses the correct frequency (bug fix)
- [ ] All test fixtures compile with the new field
- [ ] `bash scripts/test.sh --no-coverage` passes
- [ ] `source scripts/env.sh && bun run build` has zero type errors
- [ ] `connectorParams` JSON no longer contains `scheduleFrequency` after migration
- [ ] Automations with empty `connectorParams` after extraction have `null` (not `"{}"`)
