/**
 * CRM-Cron temporal rules — unit coverage (cluster 5 test gap).
 *
 * Covers the three CRM temporal rules + their 24h idempotency guard, plus the
 * GDPR-Consent exclusion (Art. 7(3)) added to InterviewReminder:
 *  - expireAutoCreatedPersons  (retention archival)
 *  - checkInterviewReminders   (upcoming-interview reminders; skips consent-blocked)
 *  - checkOverdueTasks         (overdue-task reminders)
 */

jest.mock("node-cron", () => ({ schedule: jest.fn() }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    person: { findMany: jest.fn(), update: jest.fn() },
    crmInterview: { findMany: jest.fn() },
    crmTask: { findMany: jest.fn() },
    crmActivityLog: { findFirst: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload })),
  DomainEventType: { ReminderTriggered: "ReminderTriggered" },
}));
jest.mock("@/lib/account/privacy-helpers", () => ({ getPrivacySettingsForUser: jest.fn() }));
jest.mock("@/lib/account/execute-deletion", () => ({ executeAccountDeletion: jest.fn() }));
jest.mock("@/lib/auth/admin", () => ({ writeAdminAuditLog: jest.fn() }));
jest.mock("@/lib/debug", () => ({ debugLog: jest.fn(), debugError: jest.fn() }));

import db from "@/lib/db";
import { eventBus } from "@/lib/events";
import {
  expireAutoCreatedPersons,
  checkInterviewReminders,
  checkOverdueTasks,
} from "@/lib/scheduler/crm-cron";

const mockDb = db as unknown as {
  person: { findMany: jest.Mock; update: jest.Mock };
  crmInterview: { findMany: jest.Mock };
  crmTask: { findMany: jest.Mock };
  crmActivityLog: { findFirst: jest.Mock; create: jest.Mock };
  $transaction: jest.Mock;
};
const mockPublish = (eventBus as unknown as { publish: jest.Mock }).publish;

beforeEach(() => {
  jest.clearAllMocks();
  // $transaction executes the operation array (the ops are themselves mocked).
  mockDb.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockDb.person.update.mockReturnValue(Promise.resolve({}));
  mockDb.crmActivityLog.create.mockResolvedValue({});
  mockDb.crmActivityLog.findFirst.mockResolvedValue(null);
});

describe("expireAutoCreatedPersons", () => {
  it("archives auto-created persons past retention + emits ReminderTriggered", async () => {
    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", userId: "u1", firstName: "E2E", lastName: "Old" },
    ]);

    const count = await expireAutoCreatedPersons();

    expect(count).toBe(1);
    expect(mockDb.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("no-ops when nothing is expired", async () => {
    mockDb.person.findMany.mockResolvedValue([]);
    expect(await expireAutoCreatedPersons()).toBe(0);
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });
});

describe("checkInterviewReminders", () => {
  const baseInterview = {
    id: "i1",
    userId: "u1",
    jobId: "j1",
    personId: "p1",
    interviewDate: new Date("2026-07-01T10:00:00Z"),
    job: { JobTitle: { label: "Engineer" } },
  };

  it("creates a reminder when none exists and the person is not consent-blocked", async () => {
    mockDb.crmInterview.findMany.mockResolvedValue([
      { ...baseInterview, person: { processingBasis: "legitimate_interest", consentWithdrawnAt: null } },
    ]);

    const count = await checkInterviewReminders();

    expect(count).toBe(1);
    expect(mockDb.crmActivityLog.create).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("GDPR Art. 7(3): skips reminders for a consent-blocked person", async () => {
    mockDb.crmInterview.findMany.mockResolvedValue([
      { ...baseInterview, person: { processingBasis: "consent", consentWithdrawnAt: new Date() } },
    ]);

    const count = await checkInterviewReminders();

    expect(count).toBe(0);
    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });

  it("idempotency: skips when a reminder already exists within 24h", async () => {
    mockDb.crmInterview.findMany.mockResolvedValue([
      { ...baseInterview, person: { processingBasis: "consent", consentWithdrawnAt: null } },
    ]);
    mockDb.crmActivityLog.findFirst.mockResolvedValue({ id: "existing" });

    const count = await checkInterviewReminders();

    expect(count).toBe(0);
    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
  });
});

describe("checkOverdueTasks", () => {
  it("creates a reminder for an overdue task when none exists", async () => {
    mockDb.crmTask.findMany.mockResolvedValue([{ id: "t1", userId: "u1", title: "Follow up" }]);

    const count = await checkOverdueTasks();

    expect(count).toBe(1);
    expect(mockDb.crmActivityLog.create).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("idempotency: skips when a reminder already exists within 24h", async () => {
    mockDb.crmTask.findMany.mockResolvedValue([{ id: "t1", userId: "u1", title: "Follow up" }]);
    mockDb.crmActivityLog.findFirst.mockResolvedValue({ id: "existing" });

    const count = await checkOverdueTasks();

    expect(count).toBe(0);
    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
  });
});
