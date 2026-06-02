/**
 * Tests for src/lib/events/consumers/crm-activity-logger.ts (T-3).
 *
 * Tests the registerProjection infrastructure: event subscription,
 * Zod payload validation, CrmActivityLog creation, DB lookup projections,
 * and error handling.
 */

jest.mock("server-only", () => ({}));

// Mock Prisma
const mockCreate = jest.fn().mockResolvedValue({ id: "log-1" });
const mockFindUnique = jest.fn().mockResolvedValue(null);
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    crmActivityLog: { create: (...args: unknown[]) => mockCreate(...args) },
    person: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    job: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
    crmNote: { findUnique: (...args: unknown[]) => mockFindUnique(...args) },
  },
}));

// Capture event subscriptions
type Handler = (event: unknown) => Promise<void>;
const subscriptions = new Map<string, Handler[]>();
jest.mock("@/lib/events", () => ({
  eventBus: {
    subscribe: (type: string, handler: Handler) => {
      const handlers = subscriptions.get(type) ?? [];
      handlers.push(handler);
      subscriptions.set(type, handlers);
    },
  },
}));

import { registerCrmActivityLogConsumers } from "@/lib/events/consumers/crm-activity-logger";
import { DomainEventType } from "@/lib/events/event-types";

// Helper to emit an event
async function emit(type: string, payload: Record<string, unknown>) {
  const handlers = subscriptions.get(type) ?? [];
  for (const handler of handlers) {
    await handler({ type, timestamp: new Date().toISOString(), payload });
  }
}

describe("crm-activity-logger", () => {
  beforeAll(() => {
    registerCrmActivityLogConsumers();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("subscribes to 11 event types", () => {
    const expectedTypes = [
      DomainEventType.JobStatusChanged,
      DomainEventType.ContactCreated,
      DomainEventType.ContactUpdated,
      DomainEventType.ContactDeleted,
      DomainEventType.InterviewScheduled,
      DomainEventType.InterviewCompleted,
      DomainEventType.CrmTaskCreated,
      DomainEventType.CrmTaskCompleted,
      DomainEventType.CrmNoteCreated,
      DomainEventType.VacancyPromoted,
      DomainEventType.AutomationDegraded,
    ];

    for (const type of expectedTypes) {
      expect(subscriptions.has(type)).toBe(true);
    }
  });

  it("creates activity log for JobStatusChanged", async () => {
    await emit(DomainEventType.JobStatusChanged, {
      jobId: "job-1",
      userId: "user-1",
      previousStatusValue: "applied",
      newStatusValue: "interview",
      historyEntryId: "hist-1",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "status_changed",
        userId: "user-1",
        actorId: "user-1",
        targetJobId: "job-1",
      }),
    });
  });

  it("creates activity log for ContactCreated with DB lookup", async () => {
    mockFindUnique.mockResolvedValueOnce({
      firstName: "Jane",
      lastName: "Doe",
    });

    await emit(DomainEventType.ContactCreated, {
      personId: "person-1",
      userId: "user-1",
      source: "manual",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "contact_created",
        userId: "user-1",
        targetPersonId: "person-1",
        linkedRecordName: "Jane Doe",
      }),
    });
  });

  it("creates activity log for ContactDeleted", async () => {
    await emit(DomainEventType.ContactDeleted, {
      personId: "person-1",
      userId: "user-1",
      reason: "deleted",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "contact_deleted",
        targetPersonId: null,
        details: JSON.stringify({ reason: "deleted" }),
      }),
    });
  });

  it("creates activity log for CrmTaskCreated", async () => {
    await emit(DomainEventType.CrmTaskCreated, {
      taskId: "task-1",
      userId: "user-1",
      title: "Follow up",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "task_created",
        linkedRecordName: "Follow up",
      }),
    });
  });

  it("creates activity log for VacancyPromoted with DB lookup", async () => {
    mockFindUnique.mockResolvedValueOnce({
      JobTitle: { label: "Senior Dev" },
      Company: { label: "ACME" },
    });

    await emit(DomainEventType.VacancyPromoted, {
      stagedVacancyId: "sv-1",
      jobId: "job-1",
      userId: "user-1",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "application_submitted",
        targetJobId: "job-1",
        linkedRecordName: "Senior Dev",
      }),
    });
  });

  it("skips silently on invalid payload (Zod validation failure)", async () => {
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await emit(DomainEventType.JobStatusChanged, {
      // Missing required historyEntryId, previousStatusValue, newStatusValue
      invalidField: "bad",
    });

    expect(mockCreate).not.toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  // Welle 3 Task 1.5: a job↔person link carries jobId so the contact_updated
  // row gets targetJobId + targetCompanyId (resolved from the job) → visible on
  // the Job and Company timelines, not just the Person timeline.
  it("creates contact_updated with targetJobId + resolved targetCompanyId when jobId present", async () => {
    mockFindUnique.mockResolvedValueOnce({ companyId: "company-1" });

    await emit(DomainEventType.ContactUpdated, {
      personId: "person-1",
      userId: "user-1",
      jobId: "job-1",
    });

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { id: "job-1" },
      select: { companyId: true },
    });
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "contact_updated",
        targetPersonId: "person-1",
        targetJobId: "job-1",
        targetCompanyId: "company-1",
      }),
    });
  });

  it("creates contact_updated with person target only when no jobId (backward compatible)", async () => {
    await emit(DomainEventType.ContactUpdated, {
      personId: "person-1",
      userId: "user-1",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "contact_updated",
        targetPersonId: "person-1",
      }),
    });
    // No job lookup when jobId absent.
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  it("logs error but does not throw when DB create fails", async () => {
    mockCreate.mockRejectedValueOnce(new Error("DB write failed"));
    const consoleSpy = jest.spyOn(console, "error").mockImplementation(() => {});

    await emit(DomainEventType.ContactUpdated, {
      personId: "person-1",
      userId: "user-1",
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("[crm-activity-logger]"),
      expect.any(Error),
    );
    consoleSpy.mockRestore();
  });

  it("handles null person lookup gracefully", async () => {
    mockFindUnique.mockResolvedValueOnce(null);

    await emit(DomainEventType.ContactCreated, {
      personId: "person-404",
      userId: "user-1",
      source: "manual",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        linkedRecordName: null,
      }),
    });
  });

  // R5-2: AutomationDegraded projection tests
  it("creates activity log for AutomationDegraded with moduleId as actorId", async () => {
    await emit(DomainEventType.AutomationDegraded, {
      automationId: "auto-1",
      userId: "user-1",
      reason: "consecutive_failures",
      moduleId: "eures",
      automationName: "EURES Daily",
      message: "5 consecutive failures",
      titleKey: "notifications.degraded.title",
      actorType: "module",
      actorId: "eures",
      severity: "warning",
      moduleName: "EURES",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "automation_degraded",
        userId: "user-1",
        actorId: "eures",
        linkedRecordName: "EURES Daily",
      }),
    });
    const details = JSON.parse(mockCreate.mock.calls[0][0].data.details);
    expect(details.reason).toBe("consecutive_failures");
    expect(details.moduleName).toBe("EURES");
    expect(details.automationId).toBe("auto-1");
  });

  it("falls back to userId as actorId when moduleId is absent (AutomationDegraded)", async () => {
    await emit(DomainEventType.AutomationDegraded, {
      automationId: "auto-2",
      userId: "user-1",
      reason: "auth_failure",
      automationName: "JSearch Weekly",
      message: "Auth failed",
      titleKey: "notifications.degraded.title",
      actorType: "automation",
      actorId: "auto-2",
      severity: "error",
    });

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        activityType: "automation_degraded",
        actorId: "user-1",
        linkedRecordName: "JSearch Weekly",
      }),
    });
  });
});
