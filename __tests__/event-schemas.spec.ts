/**
 * Event Schemas Tests
 *
 * Tests: Zod runtime validation for all 29 domain event payload schemas,
 * plus the safeParsePayload() helper.
 *
 * Spec: specs/event-bus.allium (IF-2 — Zod runtime validation)
 */

import {
  // Vacancy lifecycle
  VacancyPromotedPayloadSchema,
  VacancyDismissedPayloadSchema,
  VacancyStagedPayloadSchema,
  VacancyArchivedPayloadSchema,
  VacancyTrashedPayloadSchema,
  VacancyRestoredFromTrashPayloadSchema,
  // Bulk action
  BulkActionCompletedPayloadSchema,
  // Module lifecycle
  ModuleDeactivatedPayloadSchema,
  ModuleReactivatedPayloadSchema,
  // Retention
  RetentionCompletedPayloadSchema,
  // Notification
  NotificationCreatedPayloadSchema,
  // Scheduler coordination
  SchedulerCycleStartedPayloadSchema,
  SchedulerCycleCompletedPayloadSchema,
  AutomationRunStartedPayloadSchema,
  AutomationRunCompletedPayloadSchema,
  AutomationDegradedPayloadSchema,
  // CRM workflow
  JobStatusChangedPayloadSchema,
  // Data enrichment
  CompanyCreatedPayloadSchema,
  EnrichmentCompletedPayloadSchema,
  EnrichmentFailedPayloadSchema,
  // CRM core
  ContactCreatedPayloadSchema,
  ContactUpdatedPayloadSchema,
  ContactDeletedPayloadSchema,
  InterviewScheduledPayloadSchema,
  InterviewCompletedPayloadSchema,
  ReminderTriggeredPayloadSchema,
  CrmTaskCreatedPayloadSchema,
  CrmTaskCompletedPayloadSchema,
  CrmNoteCreatedPayloadSchema,
  // Helper
  safeParsePayload,
  // Registry
  EventPayloadSchemas,
} from "@/lib/events/event-schemas";

// ---------------------------------------------------------------------------
// Vacancy Lifecycle Schemas
// ---------------------------------------------------------------------------

describe("VacancyPromotedPayloadSchema", () => {
  it("accepts a valid payload", () => {
    const result = VacancyPromotedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload missing jobId", () => {
    const result = VacancyPromotedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload missing stagedVacancyId", () => {
    const result = VacancyPromotedPayloadSchema.safeParse({
      jobId: "job-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload missing userId", () => {
    const result = VacancyPromotedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      jobId: "job-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects non-string values", () => {
    const result = VacancyPromotedPayloadSchema.safeParse({
      stagedVacancyId: 123,
      jobId: "job-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("VacancyDismissedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = VacancyDismissedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload missing stagedVacancyId", () => {
    const result = VacancyDismissedPayloadSchema.safeParse({ userId: "user-1" });
    expect(result.success).toBe(false);
  });
});

describe("VacancyStagedPayloadSchema", () => {
  it("accepts payload with null automationId", () => {
    const result = VacancyStagedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
      sourceBoard: "eures",
      automationId: null,
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with string automationId", () => {
    const result = VacancyStagedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
      sourceBoard: "eures",
      automationId: "auto-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload missing sourceBoard", () => {
    const result = VacancyStagedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
      automationId: null,
    });
    expect(result.success).toBe(false);
  });

  it("rejects payload with undefined automationId (must be null or string)", () => {
    const result = VacancyStagedPayloadSchema.safeParse({
      stagedVacancyId: "sv-1",
      userId: "user-1",
      sourceBoard: "eures",
      automationId: undefined,
    });
    expect(result.success).toBe(false);
  });
});

describe("VacancyArchivedPayloadSchema", () => {
  it("accepts valid payload", () => {
    expect(VacancyArchivedPayloadSchema.safeParse({ stagedVacancyId: "sv-1", userId: "u" }).success).toBe(true);
  });

  it("rejects empty object", () => {
    expect(VacancyArchivedPayloadSchema.safeParse({}).success).toBe(false);
  });
});

describe("VacancyTrashedPayloadSchema", () => {
  it("accepts valid payload", () => {
    expect(VacancyTrashedPayloadSchema.safeParse({ stagedVacancyId: "sv-1", userId: "u" }).success).toBe(true);
  });
});

describe("VacancyRestoredFromTrashPayloadSchema", () => {
  it("accepts valid payload", () => {
    expect(VacancyRestoredFromTrashPayloadSchema.safeParse({ stagedVacancyId: "sv-1", userId: "u" }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Bulk Action Schema
// ---------------------------------------------------------------------------

describe("BulkActionCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = BulkActionCompletedPayloadSchema.safeParse({
      actionType: "archive",
      itemIds: ["id-1", "id-2"],
      userId: "user-1",
      succeeded: 2,
      failed: 0,
    });
    expect(result.success).toBe(true);
  });

  it("accepts empty itemIds array", () => {
    const result = BulkActionCompletedPayloadSchema.safeParse({
      actionType: "trash",
      itemIds: [],
      userId: "user-1",
      succeeded: 0,
      failed: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects non-number succeeded field", () => {
    const result = BulkActionCompletedPayloadSchema.safeParse({
      actionType: "archive",
      itemIds: [],
      userId: "user-1",
      succeeded: "two",
      failed: 0,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing failed field", () => {
    const result = BulkActionCompletedPayloadSchema.safeParse({
      actionType: "archive",
      itemIds: [],
      userId: "user-1",
      succeeded: 0,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Module Lifecycle Schemas
// ---------------------------------------------------------------------------

describe("ModuleDeactivatedPayloadSchema", () => {
  it("accepts payload with optional moduleName", () => {
    const result = ModuleDeactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      moduleName: "EURES",
      userId: "user-1",
      affectedAutomationIds: ["a-1", "a-2"],
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload without optional moduleName", () => {
    const result = ModuleDeactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      userId: "user-1",
      affectedAutomationIds: [],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing affectedAutomationIds", () => {
    const result = ModuleDeactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("ModuleReactivatedPayloadSchema", () => {
  it("accepts payload with optional moduleName", () => {
    const result = ModuleReactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      moduleName: "EURES",
      userId: "user-1",
      pausedAutomationCount: 3,
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload without optional moduleName", () => {
    const result = ModuleReactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      userId: "user-1",
      pausedAutomationCount: 0,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing pausedAutomationCount", () => {
    const result = ModuleReactivatedPayloadSchema.safeParse({
      moduleId: "eures",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Retention Schema
// ---------------------------------------------------------------------------

describe("RetentionCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = RetentionCompletedPayloadSchema.safeParse({
      userId: "user-1",
      purgedCount: 5,
      hashesCreated: 5,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing hashesCreated", () => {
    const result = RetentionCompletedPayloadSchema.safeParse({
      userId: "user-1",
      purgedCount: 5,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Notification Schema
// ---------------------------------------------------------------------------

describe("NotificationCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = NotificationCreatedPayloadSchema.safeParse({
      notificationId: "notif-1",
      userId: "user-1",
      notificationType: "module_deactivated",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing notificationType", () => {
    const result = NotificationCreatedPayloadSchema.safeParse({
      notificationId: "notif-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Scheduler Coordination Schemas
// ---------------------------------------------------------------------------

describe("SchedulerCycleStartedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = SchedulerCycleStartedPayloadSchema.safeParse({
      queueDepth: 3,
      automationIds: ["a-1", "a-2", "a-3"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing queueDepth", () => {
    const result = SchedulerCycleStartedPayloadSchema.safeParse({
      automationIds: ["a-1"],
    });
    expect(result.success).toBe(false);
  });
});

describe("SchedulerCycleCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = SchedulerCycleCompletedPayloadSchema.safeParse({
      processedCount: 3,
      failedCount: 1,
      skippedCount: 0,
      durationMs: 1500,
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing durationMs", () => {
    const result = SchedulerCycleCompletedPayloadSchema.safeParse({
      processedCount: 3,
      failedCount: 1,
      skippedCount: 0,
    });
    expect(result.success).toBe(false);
  });
});

describe("AutomationRunStartedPayloadSchema", () => {
  it("accepts valid payload with scheduler runSource", () => {
    const result = AutomationRunStartedPayloadSchema.safeParse({
      automationId: "auto-1",
      userId: "user-1",
      moduleId: "eures",
      runSource: "scheduler",
    });
    expect(result.success).toBe(true);
  });

  it("accepts valid payload with manual runSource", () => {
    const result = AutomationRunStartedPayloadSchema.safeParse({
      automationId: "auto-1",
      userId: "user-1",
      moduleId: "eures",
      runSource: "manual",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid runSource value", () => {
    const result = AutomationRunStartedPayloadSchema.safeParse({
      automationId: "auto-1",
      userId: "user-1",
      moduleId: "eures",
      runSource: "cron",
    });
    expect(result.success).toBe(false);
  });
});

describe("AutomationRunCompletedPayloadSchema", () => {
  it("accepts valid payload with all AutomationRunStatus values", () => {
    const statuses = [
      "running",
      "completed",
      "failed",
      "completed_with_errors",
      "blocked",
      "rate_limited",
    ] as const;

    for (const status of statuses) {
      const result = AutomationRunCompletedPayloadSchema.safeParse({
        automationId: "auto-1",
        userId: "user-1",
        moduleId: "eures",
        runSource: "scheduler",
        status,
        jobsSaved: 5,
        durationMs: 2000,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid status value", () => {
    const result = AutomationRunCompletedPayloadSchema.safeParse({
      automationId: "auto-1",
      userId: "user-1",
      moduleId: "eures",
      runSource: "scheduler",
      status: "unknown_status",
      jobsSaved: 0,
      durationMs: 100,
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing jobsSaved", () => {
    const result = AutomationRunCompletedPayloadSchema.safeParse({
      automationId: "auto-1",
      userId: "user-1",
      moduleId: "eures",
      runSource: "manual",
      status: "completed",
      durationMs: 100,
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// AutomationDegradedPayloadSchema — all required + optional fields
// ---------------------------------------------------------------------------

describe("AutomationDegradedPayloadSchema", () => {
  const minimalValid = {
    automationId: "auto-1",
    userId: "user-1",
    reason: "auth_failure" as const,
    automationName: "My Automation",
    message: "Auth failed",
    titleKey: "automations.degraded.authFailure",
    actorType: "module" as const,
    actorId: "eures",
    severity: "error" as const,
  };

  it("accepts minimal payload (required fields only)", () => {
    const result = AutomationDegradedPayloadSchema.safeParse(minimalValid);
    expect(result.success).toBe(true);
  });

  it("accepts full payload with all optional fields", () => {
    const result = AutomationDegradedPayloadSchema.safeParse({
      ...minimalValid,
      moduleId: "eures",
      titleParams: { moduleName: "EURES", count: 3 },
      reasonKey: "automations.degraded.authFailureReason",
      moduleName: "EURES",
      failureCount: 5,
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid reason enum values", () => {
    const reasons = ["auth_failure", "cb_escalation", "consecutive_failures"] as const;
    for (const reason of reasons) {
      const result = AutomationDegradedPayloadSchema.safeParse({ ...minimalValid, reason });
      expect(result.success).toBe(true);
    }
  });

  it("rejects missing reason field", () => {
    const { reason: _removed, ...withoutReason } = minimalValid;
    const result = AutomationDegradedPayloadSchema.safeParse(withoutReason);
    expect(result.success).toBe(false);
  });

  it("rejects invalid reason enum value", () => {
    const result = AutomationDegradedPayloadSchema.safeParse({
      ...minimalValid,
      reason: "network_timeout",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid severity value", () => {
    const result = AutomationDegradedPayloadSchema.safeParse({
      ...minimalValid,
      severity: "info",
    });
    expect(result.success).toBe(false);
  });

  it("rejects invalid actorType value", () => {
    const result = AutomationDegradedPayloadSchema.safeParse({
      ...minimalValid,
      actorType: "system",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing automationName", () => {
    const { automationName: _removed, ...withoutName } = minimalValid;
    const result = AutomationDegradedPayloadSchema.safeParse(withoutName);
    expect(result.success).toBe(false);
  });

  it("accepts titleParams with mixed string/number values", () => {
    const result = AutomationDegradedPayloadSchema.safeParse({
      ...minimalValid,
      titleParams: { moduleName: "EURES", failureCount: 5 },
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CRM Workflow Schemas
// ---------------------------------------------------------------------------

describe("JobStatusChangedPayloadSchema", () => {
  it("accepts valid payload with null previousStatusValue", () => {
    const result = JobStatusChangedPayloadSchema.safeParse({
      jobId: "job-1",
      userId: "user-1",
      previousStatusValue: null,
      newStatusValue: "applied",
      historyEntryId: "hist-1",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload with string previousStatusValue and optional note", () => {
    const result = JobStatusChangedPayloadSchema.safeParse({
      jobId: "job-1",
      userId: "user-1",
      previousStatusValue: "applied",
      newStatusValue: "interviewing",
      note: "Phone screen passed",
      historyEntryId: "hist-2",
    });
    expect(result.success).toBe(true);
  });

  it("rejects payload missing historyEntryId", () => {
    const result = JobStatusChangedPayloadSchema.safeParse({
      jobId: "job-1",
      userId: "user-1",
      previousStatusValue: null,
      newStatusValue: "applied",
    });
    expect(result.success).toBe(false);
  });

  it("rejects undefined previousStatusValue (must be null or string)", () => {
    const result = JobStatusChangedPayloadSchema.safeParse({
      jobId: "job-1",
      userId: "user-1",
      previousStatusValue: undefined,
      newStatusValue: "applied",
      historyEntryId: "hist-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Data Enrichment Schemas
// ---------------------------------------------------------------------------

describe("CompanyCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = CompanyCreatedPayloadSchema.safeParse({
      companyId: "company-1",
      companyName: "Acme Corp",
      userId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing companyName", () => {
    const result = CompanyCreatedPayloadSchema.safeParse({
      companyId: "company-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("EnrichmentCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = EnrichmentCompletedPayloadSchema.safeParse({
      requestId: "req-1",
      dimension: "logo",
      moduleId: "logo-dev",
      userId: "user-1",
      domainKey: "acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing domainKey", () => {
    const result = EnrichmentCompletedPayloadSchema.safeParse({
      requestId: "req-1",
      dimension: "logo",
      moduleId: "logo-dev",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("EnrichmentFailedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = EnrichmentFailedPayloadSchema.safeParse({
      requestId: "req-1",
      dimension: "logo",
      userId: "user-1",
      domainKey: "acme.com",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing requestId", () => {
    const result = EnrichmentFailedPayloadSchema.safeParse({
      dimension: "logo",
      userId: "user-1",
      domainKey: "acme.com",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// CRM Core Schemas
// ---------------------------------------------------------------------------

describe("ContactCreatedPayloadSchema", () => {
  it("accepts all valid source enum values", () => {
    const sources = ["manual", "auto_created", "imported"] as const;
    for (const source of sources) {
      const result = ContactCreatedPayloadSchema.safeParse({
        personId: "person-1",
        userId: "user-1",
        source,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid source value", () => {
    const result = ContactCreatedPayloadSchema.safeParse({
      personId: "person-1",
      userId: "user-1",
      source: "scraped",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing source", () => {
    const result = ContactCreatedPayloadSchema.safeParse({
      personId: "person-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("ContactUpdatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = ContactUpdatedPayloadSchema.safeParse({
      personId: "person-1",
      userId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing personId", () => {
    const result = ContactUpdatedPayloadSchema.safeParse({ userId: "user-1" });
    expect(result.success).toBe(false);
  });
});

describe("ContactDeletedPayloadSchema", () => {
  it("accepts all valid reason enum values", () => {
    const reasons = ["anonymized", "merged", "deleted"] as const;
    for (const reason of reasons) {
      const result = ContactDeletedPayloadSchema.safeParse({
        personId: "person-1",
        userId: "user-1",
        reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects invalid reason value", () => {
    const result = ContactDeletedPayloadSchema.safeParse({
      personId: "person-1",
      userId: "user-1",
      reason: "archived",
    });
    expect(result.success).toBe(false);
  });
});

describe("InterviewScheduledPayloadSchema", () => {
  it("accepts payload with optional personId", () => {
    const result = InterviewScheduledPayloadSchema.safeParse({
      interviewId: "int-1",
      jobId: "job-1",
      userId: "user-1",
      personId: "person-1",
      interviewDate: "2026-06-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("accepts payload without optional personId", () => {
    const result = InterviewScheduledPayloadSchema.safeParse({
      interviewId: "int-1",
      jobId: "job-1",
      userId: "user-1",
      interviewDate: "2026-06-15T10:00:00Z",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing interviewDate", () => {
    const result = InterviewScheduledPayloadSchema.safeParse({
      interviewId: "int-1",
      jobId: "job-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("InterviewCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = InterviewCompletedPayloadSchema.safeParse({
      interviewId: "int-1",
      jobId: "job-1",
      userId: "user-1",
      outcome: "passed",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing outcome", () => {
    const result = InterviewCompletedPayloadSchema.safeParse({
      interviewId: "int-1",
      jobId: "job-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ReminderTriggeredPayloadSchema — enum + optionals
// ---------------------------------------------------------------------------

describe("ReminderTriggeredPayloadSchema", () => {
  it("accepts valid payload with required fields only", () => {
    const result = ReminderTriggeredPayloadSchema.safeParse({
      userId: "user-1",
      reason: "interview_upcoming",
    });
    expect(result.success).toBe(true);
  });

  it("accepts all valid reason enum values", () => {
    const reasons = [
      "interview_upcoming",
      "task_overdue",
      "retention_expired",
      "follow_up_due",
    ] as const;

    for (const reason of reasons) {
      const result = ReminderTriggeredPayloadSchema.safeParse({
        userId: "user-1",
        reason,
      });
      expect(result.success).toBe(true);
    }
  });

  it("accepts payload with all optional fields", () => {
    const result = ReminderTriggeredPayloadSchema.safeParse({
      userId: "user-1",
      reason: "task_overdue",
      targetJobId: "job-1",
      targetPersonId: "person-1",
      interviewId: "int-1",
      taskId: "task-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects invalid reason enum value", () => {
    const result = ReminderTriggeredPayloadSchema.safeParse({
      userId: "user-1",
      reason: "unknown_reason",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing reason", () => {
    const result = ReminderTriggeredPayloadSchema.safeParse({
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects missing userId", () => {
    const result = ReminderTriggeredPayloadSchema.safeParse({
      reason: "interview_upcoming",
    });
    expect(result.success).toBe(false);
  });
});

describe("CrmTaskCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = CrmTaskCreatedPayloadSchema.safeParse({
      taskId: "task-1",
      userId: "user-1",
      title: "Follow up",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing title", () => {
    const result = CrmTaskCreatedPayloadSchema.safeParse({
      taskId: "task-1",
      userId: "user-1",
    });
    expect(result.success).toBe(false);
  });
});

describe("CrmTaskCompletedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = CrmTaskCompletedPayloadSchema.safeParse({
      taskId: "task-1",
      userId: "user-1",
      title: "Follow up",
    });
    expect(result.success).toBe(true);
  });
});

describe("CrmNoteCreatedPayloadSchema", () => {
  it("accepts valid payload", () => {
    const result = CrmNoteCreatedPayloadSchema.safeParse({
      noteId: "note-1",
      userId: "user-1",
    });
    expect(result.success).toBe(true);
  });

  it("rejects missing noteId", () => {
    const result = CrmNoteCreatedPayloadSchema.safeParse({ userId: "user-1" });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// safeParsePayload() helper
// ---------------------------------------------------------------------------

describe("safeParsePayload()", () => {
  beforeEach(() => {
    jest.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns parsed data when payload is valid", () => {
    const result = safeParsePayload(VacancyPromotedPayloadSchema, {
      type: "VacancyPromoted",
      payload: {
        stagedVacancyId: "sv-1",
        jobId: "job-1",
        userId: "user-1",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.stagedVacancyId).toBe("sv-1");
    expect(result?.jobId).toBe("job-1");
    expect(result?.userId).toBe("user-1");
  });

  it("returns null when payload is invalid", () => {
    const result = safeParsePayload(VacancyPromotedPayloadSchema, {
      type: "VacancyPromoted",
      payload: { stagedVacancyId: "sv-1" }, // missing jobId, userId
    });

    expect(result).toBeNull();
  });

  it("logs a console.error with event type and issue paths when validation fails", () => {
    const consoleSpy = jest.spyOn(console, "error");

    safeParsePayload(VacancyPromotedPayloadSchema, {
      type: "VacancyPromoted",
      payload: { stagedVacancyId: "sv-1" },
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[EventBus] Payload validation failed for VacancyPromoted"),
      expect.any(String),
    );
  });

  it("returns null when payload is null", () => {
    const result = safeParsePayload(VacancyPromotedPayloadSchema, {
      type: "VacancyPromoted",
      payload: null,
    });
    expect(result).toBeNull();
  });

  it("returns null when payload is a string instead of object", () => {
    const result = safeParsePayload(VacancyPromotedPayloadSchema, {
      type: "VacancyPromoted",
      payload: "not-an-object",
    });
    expect(result).toBeNull();
  });

  it("works with complex schemas like AutomationDegradedPayloadSchema", () => {
    const validPayload = {
      automationId: "auto-1",
      userId: "user-1",
      reason: "auth_failure" as const,
      automationName: "My Automation",
      message: "Auth failed",
      titleKey: "automations.degraded.authFailure",
      actorType: "module" as const,
      actorId: "eures",
      severity: "error" as const,
    };

    const result = safeParsePayload(AutomationDegradedPayloadSchema, {
      type: "AutomationDegraded",
      payload: validPayload,
    });

    expect(result).not.toBeNull();
    expect(result?.reason).toBe("auth_failure");
    expect(result?.severity).toBe("error");
  });

  it("returns null and logs for AutomationDegradedPayload missing reason", () => {
    const consoleSpy = jest.spyOn(console, "error");

    const result = safeParsePayload(AutomationDegradedPayloadSchema, {
      type: "AutomationDegraded",
      payload: {
        automationId: "auto-1",
        userId: "user-1",
        // reason is missing
        automationName: "My Automation",
        message: "Auth failed",
        titleKey: "automations.degraded.authFailure",
        actorType: "module",
        actorId: "eures",
        severity: "error",
      },
    });

    expect(result).toBeNull();
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("AutomationDegraded"),
      expect.any(String),
    );
  });

  it("works with ReminderTriggeredPayloadSchema accepting enum", () => {
    const result = safeParsePayload(ReminderTriggeredPayloadSchema, {
      type: "ReminderTriggered",
      payload: {
        userId: "user-1",
        reason: "interview_upcoming",
        targetJobId: "job-1",
      },
    });

    expect(result).not.toBeNull();
    expect(result?.reason).toBe("interview_upcoming");
    expect(result?.targetJobId).toBe("job-1");
  });

  it("returns null for ReminderTriggered with invalid enum", () => {
    const result = safeParsePayload(ReminderTriggeredPayloadSchema, {
      type: "ReminderTriggered",
      payload: {
        userId: "user-1",
        reason: "not_a_valid_reason",
      },
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// EventPayloadSchemas registry completeness
// ---------------------------------------------------------------------------

describe("EventPayloadSchemas registry", () => {
  it("contains all 29 event type schemas", () => {
    const expectedKeys = [
      "VacancyPromoted",
      "VacancyDismissed",
      "VacancyStaged",
      "VacancyArchived",
      "VacancyTrashed",
      "VacancyRestoredFromTrash",
      "BulkActionCompleted",
      "ModuleDeactivated",
      "ModuleReactivated",
      "RetentionCompleted",
      "NotificationCreated",
      "SchedulerCycleStarted",
      "SchedulerCycleCompleted",
      "AutomationRunStarted",
      "AutomationRunCompleted",
      "AutomationDegraded",
      "JobStatusChanged",
      "CompanyCreated",
      "EnrichmentCompleted",
      "EnrichmentFailed",
      "ContactCreated",
      "ContactUpdated",
      "ContactDeleted",
      "InterviewScheduled",
      "InterviewCompleted",
      "ReminderTriggered",
      "CrmTaskCreated",
      "CrmTaskCompleted",
      "CrmNoteCreated",
    ];

    expect(Object.keys(EventPayloadSchemas)).toHaveLength(29);

    for (const key of expectedKeys) {
      expect(EventPayloadSchemas).toHaveProperty(key);
    }
  });

  it("each schema has a safeParse method (is a Zod schema)", () => {
    for (const [key, schema] of Object.entries(EventPayloadSchemas)) {
      expect(typeof (schema as any).safeParse).toBe("function");
    }
  });
});
