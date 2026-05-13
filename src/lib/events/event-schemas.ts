/**
 * Zod Schemas for Domain Event Payloads
 *
 * One schema per payload interface declared in event-types.ts.
 * Used for runtime validation of incoming event payloads to replace
 * unsafe `as XPayload` casts in event consumers.
 *
 * Spec: specs/event-bus.allium (IF-2 — Zod runtime validation)
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Vacancy Lifecycle Schemas
// ---------------------------------------------------------------------------

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
  automationId: z.string().nullable(),
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

// ---------------------------------------------------------------------------
// Bulk Action Schema
// ---------------------------------------------------------------------------

export const BulkActionCompletedPayloadSchema = z.object({
  actionType: z.string(),
  itemIds: z.array(z.string()),
  userId: z.string(),
  succeeded: z.number(),
  failed: z.number(),
});

// ---------------------------------------------------------------------------
// Module Lifecycle Schemas
// ---------------------------------------------------------------------------

export const ModuleDeactivatedPayloadSchema = z.object({
  moduleId: z.string(),
  moduleName: z.string().optional(),
  userId: z.string(),
  affectedAutomationIds: z.array(z.string()),
});

export const ModuleReactivatedPayloadSchema = z.object({
  moduleId: z.string(),
  moduleName: z.string().optional(),
  userId: z.string(),
  pausedAutomationCount: z.number(),
});

// ---------------------------------------------------------------------------
// Retention Schema
// ---------------------------------------------------------------------------

export const RetentionCompletedPayloadSchema = z.object({
  userId: z.string(),
  purgedCount: z.number(),
  hashesCreated: z.number(),
});

// ---------------------------------------------------------------------------
// Notification Schema
// ---------------------------------------------------------------------------

export const NotificationCreatedPayloadSchema = z.object({
  notificationId: z.string(),
  userId: z.string(),
  notificationType: z.string(),
});

// ---------------------------------------------------------------------------
// Scheduler Coordination Schemas
// ---------------------------------------------------------------------------

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

const RunSourceSchema = z.enum(["scheduler", "manual"]);

export const AutomationRunStartedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  moduleId: z.string(),
  runSource: RunSourceSchema,
});

const AutomationRunStatusSchema = z.enum([
  "running",
  "completed",
  "failed",
  "completed_with_errors",
  "blocked",
  "rate_limited",
]);

export const AutomationRunCompletedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  moduleId: z.string(),
  runSource: RunSourceSchema,
  status: AutomationRunStatusSchema,
  jobsSaved: z.number(),
  durationMs: z.number(),
});

export const AutomationDegradedPayloadSchema = z.object({
  automationId: z.string(),
  userId: z.string(),
  reason: z.enum(["auth_failure", "cb_escalation", "consecutive_failures"]),
  moduleId: z.string().optional(),
  automationName: z.string(),
  message: z.string(),
  titleKey: z.string(),
  titleParams: z.record(z.string(), z.union([z.string(), z.number()])).optional(),
  actorType: z.enum(["module", "automation"]),
  actorId: z.string(),
  reasonKey: z.string().optional(),
  severity: z.enum(["error", "warning"]),
  moduleName: z.string().optional(),
  failureCount: z.number().optional(),
});

// ---------------------------------------------------------------------------
// CRM Workflow Schemas
// ---------------------------------------------------------------------------

export const JobStatusChangedPayloadSchema = z.object({
  jobId: z.string(),
  userId: z.string(),
  previousStatusValue: z.string().nullable(),
  newStatusValue: z.string(),
  note: z.string().optional(),
  historyEntryId: z.string(),
});

// ---------------------------------------------------------------------------
// Data Enrichment Schemas
// ---------------------------------------------------------------------------

export const CompanyCreatedPayloadSchema = z.object({
  companyId: z.string(),
  companyName: z.string(),
  userId: z.string(),
});

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

// ---------------------------------------------------------------------------
// CRM Core Schemas
// ---------------------------------------------------------------------------

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
  personId: z.string().optional(),
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
  targetJobId: z.string().optional(),
  targetPersonId: z.string().optional(),
  interviewId: z.string().optional(),
  taskId: z.string().optional(),
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

// ---------------------------------------------------------------------------
// Schema Registry — maps DomainEventType to its Zod schema
// ---------------------------------------------------------------------------

export const EventPayloadSchemas = {
  VacancyPromoted: VacancyPromotedPayloadSchema,
  VacancyDismissed: VacancyDismissedPayloadSchema,
  VacancyStaged: VacancyStagedPayloadSchema,
  VacancyArchived: VacancyArchivedPayloadSchema,
  VacancyTrashed: VacancyTrashedPayloadSchema,
  VacancyRestoredFromTrash: VacancyRestoredFromTrashPayloadSchema,
  BulkActionCompleted: BulkActionCompletedPayloadSchema,
  ModuleDeactivated: ModuleDeactivatedPayloadSchema,
  ModuleReactivated: ModuleReactivatedPayloadSchema,
  RetentionCompleted: RetentionCompletedPayloadSchema,
  NotificationCreated: NotificationCreatedPayloadSchema,
  SchedulerCycleStarted: SchedulerCycleStartedPayloadSchema,
  SchedulerCycleCompleted: SchedulerCycleCompletedPayloadSchema,
  AutomationRunStarted: AutomationRunStartedPayloadSchema,
  AutomationRunCompleted: AutomationRunCompletedPayloadSchema,
  AutomationDegraded: AutomationDegradedPayloadSchema,
  JobStatusChanged: JobStatusChangedPayloadSchema,
  CompanyCreated: CompanyCreatedPayloadSchema,
  EnrichmentCompleted: EnrichmentCompletedPayloadSchema,
  EnrichmentFailed: EnrichmentFailedPayloadSchema,
  ContactCreated: ContactCreatedPayloadSchema,
  ContactUpdated: ContactUpdatedPayloadSchema,
  ContactDeleted: ContactDeletedPayloadSchema,
  InterviewScheduled: InterviewScheduledPayloadSchema,
  InterviewCompleted: InterviewCompletedPayloadSchema,
  ReminderTriggered: ReminderTriggeredPayloadSchema,
  CrmTaskCreated: CrmTaskCreatedPayloadSchema,
  CrmTaskCompleted: CrmTaskCompletedPayloadSchema,
  CrmNoteCreated: CrmNoteCreatedPayloadSchema,
} as const;

// ---------------------------------------------------------------------------
// safeParsePayload — runtime validation helper for event consumers
// ---------------------------------------------------------------------------

/**
 * Validates an event payload against the provided Zod schema.
 *
 * Returns the parsed (typed) data on success, or null on failure.
 * Validation errors are logged to stderr with the event type and issue paths.
 *
 * Usage in consumers:
 *   const payload = safeParsePayload(VacancyPromotedPayloadSchema, event);
 *   if (!payload) return; // validation failed, error already logged
 */
export function safeParsePayload<T>(
  schema: z.ZodType<T>,
  event: { type: string; payload: unknown },
): T | null {
  const result = schema.safeParse(event.payload);
  if (!result.success) {
    console.error(
      `[EventBus] Payload validation failed for ${event.type}:`,
      JSON.stringify(result.error?.issues?.map((i: any) => `${i.path?.join(".")}: ${i.message}`) ?? result.error),
    );
    return null;
  }
  return result.data;
}
