# IF-2: Zod Runtime Validation for Event Payloads

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Zod runtime validation to all 19 event consumer payload casts and fix 7 untyped emit sites, so payload shape mismatches are caught at runtime instead of silently reading `undefined`.

**Architecture:** Create Zod schemas co-located with TypeScript interfaces in `event-schemas.ts`. Add a `safeParsePayload()` helper that wraps Zod parse with structured error logging. Replace all `as XPayload` consumer casts with the helper. Fix untyped emit sites to use `createEvent()` factory.

**Tech Stack:** Zod 4.3.5 (already installed), TypeScript, Jest

**Exploration Findings (Fan-Out + Flashlight):**
- 19 unsafe `as *Payload` casts across 4 consumer files
- 7 untyped emit sites in 4 files bypassing `createEvent()` typed factory
- 1 untyped access in `run-coordinator.ts`
- All 29 payload interfaces documented in `event-types.ts`

---

## File Structure

| File | Responsibility |
|------|---------------|
| Create: `src/lib/events/event-schemas.ts` | Zod schemas for all 29 payload types |
| Modify: `src/lib/events/consumers/notification-dispatcher.ts` | Replace 8 `as` casts with `safeParsePayload()` |
| Modify: `src/lib/events/consumers/crm-activity-logger.ts` | Replace 9 `as` casts |
| Modify: `src/lib/events/consumers/enrichment-trigger.ts` | Replace 2 `as` casts |
| Modify: `src/lib/assets/logo-asset-subscriber.ts` | Replace 1 `as` cast |
| Modify: `src/lib/scheduler/run-coordinator.ts` | Type-narrow `event.payload` |
| Modify: `src/actions/stagedVacancy.actions.ts` | 4 untyped emit → `createEvent()` |
| Modify: `src/lib/connector/job-discovery/promoter.ts` | 1 untyped emit → `createEvent()` |
| Modify: `src/lib/connector/job-discovery/runner.ts` | 1 untyped emit → `createEvent()` |
| Modify: `src/lib/retention/retention.service.ts` | 1 untyped emit → `createEvent()` |
| Create: `__tests__/event-schemas.spec.ts` | Schema validation tests |
| Create: `__tests__/event-payload-validation.spec.ts` | Consumer parse failure tests |

---

### Task 1: Create Zod Schemas for Event Payloads

**Files:**
- Create: `src/lib/events/event-schemas.ts`

- [ ] **Step 1: Create `event-schemas.ts` with all 29 Zod schemas**

```typescript
/**
 * Zod schemas for domain event payloads.
 * Co-located with TypeScript interfaces in event-types.ts.
 * Used by consumers to validate payloads at runtime (IF-2).
 */
import { z } from "zod/v4";

// --- Vacancy Pipeline ---

export const VacancyPromotedPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  jobId: z.string(),
  userId: z.string(),
});

export const VacancyDismissedPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  userId: z.string(),
});

export const VacancyStagedPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  userId: z.string(),
  sourceBoard: z.string(),
  automationId: z.nullable(z.string()),
});

export const VacancyArchivedPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  userId: z.string(),
});

export const VacancyTrashedPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  userId: z.string(),
});

export const VacancyRestoredFromTrashPayloadSchema = z.object({
  stagedVacancyId: z.string(),
  userId: z.string(),
});

// --- Module Lifecycle ---

export const BulkActionCompletedPayloadSchema = z.object({
  actionType: z.string(),
  itemIds: z.array(z.string()),
  userId: z.string(),
  succeeded: z.number(),
  failed: z.number(),
});

export const ModuleDeactivatedPayloadSchema = z.object({
  moduleId: z.string(),
  moduleName: z.optional(z.string()),
  userId: z.string(),
  affectedAutomationIds: z.array(z.string()),
});

export const ModuleReactivatedPayloadSchema = z.object({
  moduleId: z.string(),
  moduleName: z.optional(z.string()),
  userId: z.string(),
  pausedAutomationCount: z.number(),
});

export const RetentionCompletedPayloadSchema = z.object({
  userId: z.string(),
  purgedCount: z.number(),
  hashesCreated: z.number(),
});

export const NotificationCreatedPayloadSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
  notificationType: z.string(),
});

// --- Scheduler Coordination ---

export const SchedulerCycleStartedPayloadSchema = z.object({
  queueDepth: z.number(),
  automationIds: z.array(z.string()),
});

export const SchedulerCycleCompletedPayloadSchema = z.object({
  processedCount: z.number(),
  failedCount: z.number(),
  skippedCount: z.number(),
  durationMs: z.number(),
});

export const AutomationRunStartedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  moduleId: z.string(),
  runSource: z.enum(["scheduler", "manual"]),
});

export const AutomationRunCompletedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  moduleId: z.string(),
  runSource: z.enum(["scheduler", "manual"]),
  status: z.string(),
  jobsSaved: z.number(),
  durationMs: z.number(),
});

export const AutomationDegradedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  reason: z.enum(["auth_failure", "cb_escalation", "consecutive_failures"]),
  moduleId: z.optional(z.string()),
  automationName: z.string(),
  message: z.string(),
  titleKey: z.string(),
  titleParams: z.optional(z.record(z.string(), z.union([z.string(), z.number()]))),
  actorType: z.enum(["module", "automation"]),
  actorId: z.string(),
  reasonKey: z.optional(z.string()),
  severity: z.enum(["error", "warning"]),
  moduleName: z.optional(z.string()),
  failureCount: z.optional(z.number()),
});

// --- CRM Core ---

export const JobStatusChangedPayloadSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  previousStatusValue: z.nullable(z.string()),
  newStatusValue: z.string(),
  note: z.optional(z.string()),
  historyEntryId: z.string(),
});

export const CompanyCreatedPayloadSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  userId: z.string(),
});

// --- Data Enrichment ---

export const EnrichmentCompletedPayloadSchema = z.object({
  requestId: z.string(),
  dimension: z.string(),
  moduleId: z.string(),
  userId: z.string(),
  domainKey: z.string(),
});

export const EnrichmentFailedPayloadSchema = z.object({
  requestId: z.string(),
  dimension: z.string(),
  userId: z.string(),
  domainKey: z.string(),
});

// --- CRM Events ---

export const ContactCreatedPayloadSchema = z.object({
  personId: z.string(),
  userId: z.string(),
  source: z.enum(["manual", "auto_created", "imported"]),
});

export const ContactUpdatedPayloadSchema = z.object({
  personId: z.string(),
  userId: z.string(),
});

export const ContactDeletedPayloadSchema = z.object({
  personId: z.string(),
  userId: z.string(),
  reason: z.enum(["anonymized", "merged", "deleted"]),
});

export const InterviewScheduledPayloadSchema = z.object({
  interviewId: z.string(),
  jobId: z.string(),
  userId: z.string(),
  personId: z.optional(z.string()),
  interviewDate: z.string(),
});

export const InterviewCompletedPayloadSchema = z.object({
  interviewId: z.string(),
  jobId: z.string(),
  userId: z.string(),
  outcome: z.string(),
});

export const ReminderTriggeredPayloadSchema = z.object({
  userId: z.string(),
  reason: z.enum(["interview_upcoming", "task_overdue", "retention_expired", "follow_up_due"]),
  targetJobId: z.optional(z.string()),
  targetPersonId: z.optional(z.string()),
  interviewId: z.optional(z.string()),
  taskId: z.optional(z.string()),
});

export const CrmTaskCreatedPayloadSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  title: z.string(),
});

export const CrmTaskCompletedPayloadSchema = z.object({
  taskId: z.string(),
  userId: z.string(),
  title: z.string(),
});

export const CrmNoteCreatedPayloadSchema = z.object({
  noteId: z.string(),
  userId: z.string(),
});

// --- Parse Helper ---

/**
 * Safely parse an event payload with a Zod schema.
 * On failure: logs a structured warning and returns null.
 * Consumers MUST check for null and skip processing.
 *
 * Pattern: `const payload = safeParsePayload(XSchema, event); if (!payload) return;`
 */
export function safeParsePayload<T>(
  schema: z.ZodType<T>,
  event: { type: string; payload: unknown },
): T | null {
  const result = schema.safeParse(event.payload);
  if (!result.success) {
    console.error(
      `[EventBus] Payload validation failed for ${event.type}:`,
      result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", "),
    );
    return null;
  }
  return result.data;
}
```

- [ ] **Step 2: Verify TypeScript compilation**

Run: `cd /home/pascal/projekte/jobsync && source scripts/env.sh && npx tsc --noEmit src/lib/events/event-schemas.ts 2>&1 | head -10`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add src/lib/events/event-schemas.ts
git commit -m "feat(IF-2): add Zod schemas for all 29 event payload types"
```

---

### Task 2: Schema Unit Tests

**Files:**
- Create: `__tests__/event-schemas.spec.ts`

- [ ] **Step 1: Write schema validation tests**

Test that each schema:
1. Accepts a valid payload (happy path)
2. Rejects a payload with missing required fields
3. `safeParsePayload()` returns null on invalid input and logs error

Cover at least these schemas (representative mix):
- `VacancyPromotedPayloadSchema` (simple, 3 required strings)
- `AutomationDegradedPayloadSchema` (complex, enums + optionals)
- `ReminderTriggeredPayloadSchema` (enum + multiple optionals)
- `BulkActionCompletedPayloadSchema` (array + numbers)

Test `safeParsePayload()` helper:
- Returns parsed data on valid input
- Returns null on invalid input
- Logs error with event type on failure

- [ ] **Step 2: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="event-schemas" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add __tests__/event-schemas.spec.ts
git commit -m "test(IF-2): schema validation tests for event payloads"
```

---

### Task 3: Replace Casts in notification-dispatcher.ts (8 sites)

**Files:**
- Modify: `src/lib/events/consumers/notification-dispatcher.ts`

- [ ] **Step 1: Add import**

```typescript
import {
  VacancyPromotedPayloadSchema,
  VacancyStagedPayloadSchema,
  BulkActionCompletedPayloadSchema,
  ModuleDeactivatedPayloadSchema,
  ModuleReactivatedPayloadSchema,
  RetentionCompletedPayloadSchema,
  JobStatusChangedPayloadSchema,
  ReminderTriggeredPayloadSchema,
  safeParsePayload,
} from "../event-schemas";
```

Remove the corresponding `*Payload` type-only imports from `"../event-types"` that are no longer needed (the Zod schemas carry the type via `z.infer`). Keep `AutomationDegradedPayload` import since it uses `DEGRADATION_REASON_TO_TYPE` mapping.

- [ ] **Step 2: Replace each `as XPayload` cast with `safeParsePayload()`**

For each of the 8 handlers, replace:
```typescript
// BEFORE:
const payload = event.payload as VacancyPromotedPayload;
```
with:
```typescript
// AFTER:
const payload = safeParsePayload(VacancyPromotedPayloadSchema, event);
if (!payload) return;
```

Apply to ALL 8 handlers:
1. `handleVacancyPromoted` (~line 212)
2. `handleVacancyStaged` (~line 247)
3. `handleBulkActionCompleted` (~line 273)
4. `handleModuleDeactivated` (~line 314)
5. `handleModuleReactivated` (~line 363)
6. `handleRetentionCompleted` (~line 407)
7. `handleJobStatusChanged` (~line 445)
8. `handleReminderTriggered` (~line 509)

Note: `handleAutomationDegraded` already uses `event.payload` directly (fixed in Sprint C) — leave it as-is since `DEGRADATION_REASON_TO_TYPE` provides compile-time safety.

- [ ] **Step 3: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="notification-dispatcher" 2>&1 | tail -15`
Expected: All pass (existing tests should work since mock payloads match schemas)

- [ ] **Step 4: Commit**

```bash
git add src/lib/events/consumers/notification-dispatcher.ts
git commit -m "refactor(IF-2): replace 8 unsafe payload casts in notification-dispatcher"
```

---

### Task 4: Replace Casts in crm-activity-logger.ts (9 sites)

**Files:**
- Modify: `src/lib/events/consumers/crm-activity-logger.ts`

- [ ] **Step 1: Add import**

```typescript
import {
  JobStatusChangedPayloadSchema,
  ContactCreatedPayloadSchema,
  ContactUpdatedPayloadSchema,
  InterviewScheduledPayloadSchema,
  InterviewCompletedPayloadSchema,
  CrmTaskCreatedPayloadSchema,
  CrmTaskCompletedPayloadSchema,
  CrmNoteCreatedPayloadSchema,
  VacancyPromotedPayloadSchema,
  safeParsePayload,
} from "../event-schemas";
```

- [ ] **Step 2: Replace each `as XPayload` cast**

Same pattern as Task 3 — replace `const payload = event.payload as XPayload` with `const payload = safeParsePayload(XSchema, event); if (!payload) return;` for all 9 handlers.

- [ ] **Step 3: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="crm-activity" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/events/consumers/crm-activity-logger.ts
git commit -m "refactor(IF-2): replace 9 unsafe payload casts in crm-activity-logger"
```

---

### Task 5: Replace Casts in enrichment-trigger.ts + logo-asset-subscriber.ts (3 sites)

**Files:**
- Modify: `src/lib/events/consumers/enrichment-trigger.ts`
- Modify: `src/lib/assets/logo-asset-subscriber.ts`

- [ ] **Step 1: Replace 2 casts in enrichment-trigger.ts**

Add imports for `CompanyCreatedPayloadSchema`, `VacancyPromotedPayloadSchema`, `safeParsePayload`.
Replace both `as` casts.

- [ ] **Step 2: Replace 1 cast in logo-asset-subscriber.ts**

Add import for `EnrichmentCompletedPayloadSchema`, `safeParsePayload`.
Replace the `as EnrichmentCompletedPayload` cast.

- [ ] **Step 3: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="enrichment|logo-asset" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/lib/events/consumers/enrichment-trigger.ts src/lib/assets/logo-asset-subscriber.ts
git commit -m "refactor(IF-2): replace 3 unsafe payload casts in enrichment + logo-asset"
```

---

### Task 6: Fix run-coordinator.ts Untyped Access

**Files:**
- Modify: `src/lib/scheduler/run-coordinator.ts`

- [ ] **Step 1: Type-narrow the payload access**

In `subscribeToEvents()`, the handler accesses `event.payload.automationId` without type narrowing. Add the import and use `safeParsePayload`:

```typescript
import { AutomationDegradedPayloadSchema, safeParsePayload } from "@/lib/events/event-schemas";

// In subscribeToEvents():
eventBus.subscribe(DomainEventType.AutomationDegraded, (event) => {
  const payload = safeParsePayload(AutomationDegradedPayloadSchema, event);
  if (!payload) return;
  this.acknowledgeExternalStop(payload.automationId);
});
```

- [ ] **Step 2: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="degradation-coordinator|run-coordinator" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add src/lib/scheduler/run-coordinator.ts
git commit -m "refactor(IF-2): add Zod validation to RunCoordinator event subscription"
```

---

### Task 7: Fix 7 Untyped Emit Sites (Flashlight Finding)

**Files:**
- Modify: `src/actions/stagedVacancy.actions.ts` (4 sites)
- Modify: `src/lib/connector/job-discovery/promoter.ts` (1 site)
- Modify: `src/lib/connector/job-discovery/runner.ts` (1 site)
- Modify: `src/lib/retention/retention.service.ts` (1 site)

- [ ] **Step 1: Replace inline object literals with `createEvent()` factory**

Each untyped emit site uses `emitEvent({ type: "X", timestamp: new Date(), payload: {...} })`. Replace with `emitEvent(createEvent(DomainEventType.X, {...}))`.

Example for `stagedVacancy.actions.ts`:
```typescript
// BEFORE:
emitEvent({ type: "VacancyDismissed", timestamp: new Date(), payload: { stagedVacancyId: id, userId: user.id } });

// AFTER:
emitEvent(createEvent(DomainEventType.VacancyDismissed, { stagedVacancyId: id, userId: user.id }));
```

Add imports to each file: `import { emitEvent, createEvent } from "@/lib/events"` and `import { DomainEventType } from "@/lib/events/event-types"` (if not already imported).

Apply to all 7 sites:
1. `stagedVacancy.actions.ts:205` — VacancyDismissed
2. `stagedVacancy.actions.ts:275` — VacancyArchived
3. `stagedVacancy.actions.ts:317` — VacancyTrashed
4. `stagedVacancy.actions.ts:346` — VacancyRestoredFromTrash
5. `promoter.ts:161` — VacancyPromoted (the manual emit, NOT the CompanyCreated which already uses `createEvent`)
6. `runner.ts:549` — VacancyStaged
7. `retention.service.ts:175` — RetentionCompleted

- [ ] **Step 2: Run build to verify type safety**

Run: `cd /home/pascal/projekte/jobsync && source scripts/env.sh && bun run build 2>&1 | grep -E "✓|error" | head -5`
Expected: `✓ Compiled successfully`

If any emit site has a payload field mismatch (e.g., missing field, wrong type), the `createEvent()` generic will produce a TypeScript error — that's the point. Fix any such errors.

- [ ] **Step 3: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="stagedVacancy|promoter|runner|retention" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 4: Commit**

```bash
git add src/actions/stagedVacancy.actions.ts src/lib/connector/job-discovery/promoter.ts src/lib/connector/job-discovery/runner.ts src/lib/retention/retention.service.ts
git commit -m "refactor(IF-2): replace 7 untyped emit sites with createEvent() factory"
```

---

### Task 8: Consumer Parse-Failure Integration Test

**Files:**
- Create: `__tests__/event-payload-validation.spec.ts`

- [ ] **Step 1: Write integration test**

Test that a consumer SKIPS processing when receiving an invalid payload shape:
1. Register notification-dispatcher
2. Publish an `AutomationDegraded` event with a MALFORMED payload (missing required `reason` field)
3. Assert `channelRouter.route` was NOT called (consumer bailed early)
4. Assert error was logged

This tests the full pipeline: event → consumer → safeParsePayload → skip.

- [ ] **Step 2: Run tests**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 --testPathPattern="event-payload-validation" 2>&1 | tail -15`
Expected: All pass

- [ ] **Step 3: Commit**

```bash
git add __tests__/event-payload-validation.spec.ts
git commit -m "test(IF-2): integration test for consumer parse-failure skip"
```

---

### Task 9: Full Verification + Final Commit

- [ ] **Step 1: Full build**

Run: `cd /home/pascal/projekte/jobsync && source scripts/env.sh && bun run build 2>&1 | grep -E "✓|error" | head -5`
Expected: `✓ Compiled successfully`

- [ ] **Step 2: Full test suite**

Run: `cd /home/pascal/projekte/jobsync && bash scripts/test.sh --workers=1 2>&1 | tail -10`
Expected: 230+ suites, all pass

- [ ] **Step 3: Verify zero remaining `as *Payload` casts in consumers**

Run: `grep -rn "as [A-Z].*Payload" src/lib/events/consumers/ src/lib/assets/logo-asset-subscriber.ts`
Expected: Zero matches (all replaced with `safeParsePayload()`)

- [ ] **Step 4: Verify zero untyped emit sites**

Run: `grep -rn 'emitEvent({' src/ | grep -v node_modules | grep -v __tests__`
Expected: Zero matches (all use `emitEvent(createEvent(...))`)

---

## Summary

| Task | Scope | Sites Fixed | Estimated |
|------|-------|-------------|-----------|
| 1 | Zod schemas + helper | 29 schemas | 10 min |
| 2 | Schema unit tests | 4 schemas + helper | 5 min |
| 3 | notification-dispatcher casts | 8 → `safeParsePayload()` | 5 min |
| 4 | crm-activity-logger casts | 9 → `safeParsePayload()` | 5 min |
| 5 | enrichment + logo-asset casts | 3 → `safeParsePayload()` | 3 min |
| 6 | run-coordinator access | 1 → `safeParsePayload()` | 2 min |
| 7 | Untyped emit sites | 7 → `createEvent()` | 5 min |
| 8 | Integration test | Parse-failure skip | 5 min |
| 9 | Verification | Full build + grep | 5 min |

**Total: 19 consumer casts + 7 emit sites + 1 untyped access = 27 fixes**
