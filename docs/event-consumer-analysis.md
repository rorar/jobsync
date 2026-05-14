# Event Consumer Analysis — Flashlight Report (2026-05-14)

## Overview

24 event subscriptions across 6 consumer modules. Analysis performed to evaluate which consumers benefit from declarative projection patterns.

## Consumer Inventory

| Consumer | File | Subscriptions | Pattern | Declarative? |
|----------|------|--------------|---------|-------------|
| CRM Activity Logger | `src/lib/events/consumers/crm-activity-logger.ts` | 10 | subscribe→parse→create CrmActivityLog | **YES — refactored** (`d370eb0`) |
| Notification Dispatcher | `src/lib/events/consumers/notification-dispatcher.ts` | 9 | subscribe→parse→buildCtx→ChannelRouter.route | No — own routing pattern |
| Enrichment Trigger | `src/lib/events/consumers/enrichment-trigger.ts` | 2 | subscribe→parse→fire-and-forget orchestrator | No — semaphore-gated |
| Logo Asset Subscriber | `src/lib/assets/logo-asset-subscriber.ts` | 1 | subscribe→parse→guard→download | No — filtered, complex |
| Audit Logger | `src/lib/events/consumers/audit-logger.ts` | 1 | wildcard→console.debug | No — already minimal |
| Run Coordinator | `src/lib/scheduler/run-coordinator.ts` | 1 | subscribe→parse→state mutation | No — in-memory only |

## Unconsumed Event Types (10)

Event types defined in `DomainEventType` enum but with zero subscribers:

| Event Type | Payload Interface | Potential Future Use |
|-----------|-------------------|-------------------|
| NotificationCreated | NotificationCreatedPayload | Dead event — wire or delete (G6) |
| VacancyDismissed | VacancyDismissedPayload | CRM Timeline: "vacancy dismissed" |
| VacancyArchived | VacancyArchivedPayload | CRM Timeline: "vacancy archived" |
| VacancyTrashed | VacancyTrashedPayload | CRM Timeline: "vacancy trashed" |
| VacancyRestoredFromTrash | VacancyRestoredFromTrashPayload | CRM Timeline: "vacancy restored" |
| SchedulerCycleStarted | SchedulerCycleStartedPayload | Observability / Admin dashboard |
| SchedulerCycleCompleted | SchedulerCycleCompletedPayload | Observability / Admin dashboard |
| AutomationRunStarted | AutomationRunStartedPayload | CRM Timeline: "automation started" |
| AutomationRunCompleted | AutomationRunCompletedPayload | CRM Timeline: "automation completed" |
| EnrichmentFailed | EnrichmentFailedPayload | CRM Timeline: "enrichment failed" |

**Action required:** Either add consumers or remove unused types. Publishing events without consumers is dead code (deferred item G6).

## Projection Pattern (registerProjection)

Introduced in commit `d370eb0`. Generic function in `crm-activity-logger.ts`:

```typescript
function registerProjection<T>(
  eventType: DomainEventType,
  schema: z.ZodType<T>,
  activityType: string,
  mapToData: (payload: T) => Promise<ActivityData> | ActivityData,
): void
```

Adding a new CRM timeline projection = 1 function call (5-8 lines). No boilerplate.

### When to use registerProjection vs other patterns

| Scenario | Pattern | Location |
|----------|---------|----------|
| New CRM timeline entry | `registerProjection()` | crm-activity-logger.ts |
| New notification type | `handleX()` + subscribe | notification-dispatcher.ts |
| New enrichment trigger | Custom handler with semaphore | enrichment-trigger.ts |
| New file download trigger | Custom handler with guards | logo-asset-subscriber.ts |

## Cross-References

- CRM Activity Logger deferred items: `project_deferred_sprints_for_future_sessions.md` § "CRM Consumer + Cron test coverage"
- AutomationDegraded → CRM Timeline: deferred item in same file
- Event spec drift: `specs/event-bus.allium` has 20 types, code has 28
