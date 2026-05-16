/**
 * Domain Event Types — Discriminated Union
 *
 * Every domain event carries a `type` discriminant and a typed `payload`.
 * Consumers subscribe to specific types and receive narrowed payloads.
 *
 * Spec: specs/event-bus.allium (value DomainEvent, typed payloads)
 */

import type { AutomationRunStatus } from "@/models/automation.model";

/** Inline definition to avoid bidirectional dependency with scheduler/types */
type RunSource = "scheduler" | "manual";

// ---------------------------------------------------------------------------
// Event Type Enum
// ---------------------------------------------------------------------------

export const DomainEventType = {
  VacancyPromoted: "VacancyPromoted",
  VacancyDismissed: "VacancyDismissed",
  VacancyStaged: "VacancyStaged",
  VacancyArchived: "VacancyArchived",
  VacancyTrashed: "VacancyTrashed",
  VacancyRestoredFromTrash: "VacancyRestoredFromTrash",
  BulkActionCompleted: "BulkActionCompleted",
  ModuleDeactivated: "ModuleDeactivated",
  ModuleReactivated: "ModuleReactivated",
  RetentionCompleted: "RetentionCompleted",
  // NotificationCreated removed — never published/subscribed (G6, see commit history)
  // Scheduler Coordination (spec: scheduler-coordination.allium)
  SchedulerCycleStarted: "SchedulerCycleStarted",
  SchedulerCycleCompleted: "SchedulerCycleCompleted",
  AutomationRunStarted: "AutomationRunStarted",
  AutomationRunCompleted: "AutomationRunCompleted",
  // Degradation ↔ RunCoordinator bridge (spec: module-lifecycle.allium)
  AutomationDegraded: "AutomationDegraded",
  // CRM Core (spec: crm-workflow.allium)
  JobStatusChanged: "JobStatusChanged",
  // Data Enrichment (spec: data-enrichment)
  CompanyCreated: "CompanyCreated",
  EnrichmentCompleted: "EnrichmentCompleted",
  EnrichmentFailed: "EnrichmentFailed",
  // CRM Core (spec: crm.allium)
  ContactCreated: "ContactCreated",
  ContactUpdated: "ContactUpdated",
  ContactDeleted: "ContactDeleted",
  InterviewScheduled: "InterviewScheduled",
  InterviewCompleted: "InterviewCompleted",
  ReminderTriggered: "ReminderTriggered",
  CrmTaskCreated: "CrmTaskCreated",
  CrmTaskCompleted: "CrmTaskCompleted",
  CrmNoteCreated: "CrmNoteCreated",
} as const;

export type DomainEventType = (typeof DomainEventType)[keyof typeof DomainEventType];

// ---------------------------------------------------------------------------
// Typed Payloads
// ---------------------------------------------------------------------------

export interface VacancyPromotedPayload {
  stagedVacancyId: string;
  jobId: string;
  userId: string;
}

export interface VacancyDismissedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyStagedPayload {
  stagedVacancyId: string;
  userId: string;
  sourceBoard: string;
  automationId: string | null;
}

export interface VacancyArchivedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyTrashedPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface VacancyRestoredFromTrashPayload {
  stagedVacancyId: string;
  userId: string;
}

export interface BulkActionCompletedPayload {
  actionType: string;
  itemIds: string[];
  userId: string;
  succeeded: number;
  failed: number;
}

export interface ModuleDeactivatedPayload {
  moduleId: string;
  /**
   * Human-readable module display name (e.g. "EURES", "Logo.dev") resolved
   * from the manifest at publish time. Optional because pre-Sprint-3 emit
   * sites may not yet carry it and the dispatcher falls back to `moduleId`
   * (the slug) for those. See Sprint 3 M-A-02 — consumers rendering a user-
   * facing `titleParams.moduleName` should prefer this over the slug so
   * users see "EURES" instead of "eures".
   */
  moduleName?: string;
  userId: string;
  affectedAutomationIds: string[];
}

export interface ModuleReactivatedPayload {
  moduleId: string;
  /**
   * Human-readable module display name — see `ModuleDeactivatedPayload.moduleName`.
   * Optional for backward compat; consumers MUST fall back to `moduleId`.
   */
  moduleName?: string;
  userId: string;
  pausedAutomationCount: number;
}

export interface RetentionCompletedPayload {
  userId: string;
  purgedCount: number;
  hashesCreated: number;
}

// Scheduler Coordination payloads (spec: scheduler-coordination.allium)

export interface SchedulerCycleStartedPayload {
  queueDepth: number;
  automationIds: string[];
}

export interface SchedulerCycleCompletedPayload {
  processedCount: number;
  failedCount: number;
  skippedCount: number;
  durationMs: number;
}

export interface AutomationRunStartedPayload {
  automationId: string;
  userId: string;
  moduleId: string;
  runSource: RunSource;
}

export interface AutomationRunCompletedPayload {
  automationId: string;
  userId: string;
  moduleId: string;
  runSource: RunSource;
  status: AutomationRunStatus;
  jobsSaved: number;
  durationMs: number;
}

export interface AutomationDegradedPayload {
  automationId: string;
  userId: string;
  reason: "auth_failure" | "cb_escalation" | "consecutive_failures" | "health_unreachable";
  // Notification-relevant fields (Sprint C: degradation → event-based notifications)
  moduleId?: string;
  automationName: string;
  message: string;
  titleKey: string;
  titleParams?: Record<string, string | number>;
  actorType: "module" | "automation";
  actorId: string;
  reasonKey?: string;
  severity: "error" | "warning";
  moduleName?: string;
  failureCount?: number;
}

// CRM Core payloads (spec: crm-workflow.allium)

export interface JobStatusChangedPayload {
  jobId: string;
  userId: string;
  previousStatusValue: string | null;
  newStatusValue: string;
  note?: string;
  historyEntryId: string;
}

// Data Enrichment payloads (spec: data-enrichment)

export interface CompanyCreatedPayload {
  companyId: string;
  companyName: string;
  userId: string;
}

export interface EnrichmentCompletedPayload {
  requestId: string;
  dimension: string;
  moduleId: string;
  userId: string;
  domainKey: string;
}

export interface EnrichmentFailedPayload {
  requestId: string;
  dimension: string;
  userId: string;
  domainKey: string;
}

// CRM Core payloads (spec: crm.allium)

export interface ContactCreatedPayload {
  personId: string;
  userId: string;
  source: "manual" | "auto_created" | "imported";
}

export interface ContactUpdatedPayload {
  personId: string;
  userId: string;
}

export interface ContactDeletedPayload {
  personId: string;
  userId: string;
  reason: "anonymized" | "merged" | "deleted";
}

export interface InterviewScheduledPayload {
  interviewId: string;
  jobId: string;
  userId: string;
  personId?: string;
  interviewDate: string;
}

export interface InterviewCompletedPayload {
  interviewId: string;
  jobId: string;
  userId: string;
  outcome: string;
}

export interface ReminderTriggeredPayload {
  userId: string;
  reason: "interview_upcoming" | "task_overdue" | "retention_expired" | "follow_up_due";
  targetJobId?: string;
  targetPersonId?: string;
  interviewId?: string;
  taskId?: string;
}

export interface CrmTaskCreatedPayload {
  taskId: string;
  userId: string;
  title: string;
  targetPersonId?: string;
  targetJobId?: string;
}

export interface CrmTaskCompletedPayload {
  taskId: string;
  userId: string;
  title: string;
  targetPersonId?: string;
  targetJobId?: string;
}

export interface CrmNoteCreatedPayload {
  noteId: string;
  userId: string;
  targetPersonId?: string;
  targetJobId?: string;
}

// ---------------------------------------------------------------------------
// Payload Map (type → payload shape)
// ---------------------------------------------------------------------------

export interface EventPayloadMap {
  VacancyPromoted: VacancyPromotedPayload;
  VacancyDismissed: VacancyDismissedPayload;
  VacancyStaged: VacancyStagedPayload;
  VacancyArchived: VacancyArchivedPayload;
  VacancyTrashed: VacancyTrashedPayload;
  VacancyRestoredFromTrash: VacancyRestoredFromTrashPayload;
  BulkActionCompleted: BulkActionCompletedPayload;
  ModuleDeactivated: ModuleDeactivatedPayload;
  ModuleReactivated: ModuleReactivatedPayload;
  RetentionCompleted: RetentionCompletedPayload;
  SchedulerCycleStarted: SchedulerCycleStartedPayload;
  SchedulerCycleCompleted: SchedulerCycleCompletedPayload;
  AutomationRunStarted: AutomationRunStartedPayload;
  AutomationRunCompleted: AutomationRunCompletedPayload;
  AutomationDegraded: AutomationDegradedPayload;
  JobStatusChanged: JobStatusChangedPayload;
  CompanyCreated: CompanyCreatedPayload;
  EnrichmentCompleted: EnrichmentCompletedPayload;
  EnrichmentFailed: EnrichmentFailedPayload;
  ContactCreated: ContactCreatedPayload;
  ContactUpdated: ContactUpdatedPayload;
  ContactDeleted: ContactDeletedPayload;
  InterviewScheduled: InterviewScheduledPayload;
  InterviewCompleted: InterviewCompletedPayload;
  ReminderTriggered: ReminderTriggeredPayload;
  CrmTaskCreated: CrmTaskCreatedPayload;
  CrmTaskCompleted: CrmTaskCompletedPayload;
  CrmNoteCreated: CrmNoteCreatedPayload;
}

// ---------------------------------------------------------------------------
// Domain Event (discriminated union base)
// ---------------------------------------------------------------------------

export interface DomainEvent<T extends DomainEventType = DomainEventType> {
  readonly type: T;
  readonly timestamp: Date;
  readonly payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Handler Types
// ---------------------------------------------------------------------------

export type EventHandler<T extends DomainEventType = DomainEventType> = (
  event: DomainEvent<T>,
) => void | Promise<void>;

export type Unsubscribe = () => void;

// ---------------------------------------------------------------------------
// Convenience: typed event constructors
// ---------------------------------------------------------------------------

export function createEvent<T extends DomainEventType>(
  type: T,
  payload: T extends keyof EventPayloadMap ? EventPayloadMap[T] : Record<string, unknown>,
): DomainEvent<T> {
  return Object.freeze({ type, timestamp: new Date(), payload });
}
