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
    referral: { findMany: jest.fn(), update: jest.fn() },
    $transaction: jest.fn(),
  },
}));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((type: string, payload: unknown) => ({ type, payload })),
  DomainEventType: {
    ReminderTriggered: "ReminderTriggered",
    ReferralStatusChanged: "ReferralStatusChanged",
  },
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
  flagStaleReferrals,
} from "@/lib/scheduler/crm-cron";

const mockDb = db as unknown as {
  person: { findMany: jest.Mock; update: jest.Mock };
  crmInterview: { findMany: jest.Mock };
  crmTask: { findMany: jest.Mock };
  crmActivityLog: { findFirst: jest.Mock; create: jest.Mock };
  referral: { findMany: jest.Mock; update: jest.Mock };
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
    mockDb.crmTask.findMany.mockResolvedValue([{ id: "t1", userId: "u1", title: "Follow up", targets: [] }]);

    const count = await checkOverdueTasks();

    expect(count).toBe(1);
    expect(mockDb.crmActivityLog.create).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(1);
  });

  it("idempotency: skips when a reminder already exists within 24h", async () => {
    mockDb.crmTask.findMany.mockResolvedValue([{ id: "t1", userId: "u1", title: "Follow up", targets: [] }]);
    mockDb.crmActivityLog.findFirst.mockResolvedValue({ id: "existing" });

    const count = await checkOverdueTasks();

    expect(count).toBe(0);
    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
  });

  it("GDPR Art. 7(3): skips a task targeting a consent-blocked person", async () => {
    mockDb.crmTask.findMany.mockResolvedValue([
      {
        id: "t1",
        userId: "u1",
        title: "Follow up",
        targets: [{ targetPerson: { processingBasis: "consent", consentWithdrawnAt: new Date() } }],
      },
    ]);

    const count = await checkOverdueTasks();

    expect(count).toBe(0);
    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
  });
});

describe("flagStaleReferrals (ReferralGoesStale)", () => {
  afterEach(() => jest.useRealTimers());

  it("reads working-status referrals quiet past config.stale_after (21d) then flags each", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-06-15T12:00:00.000Z"));
    mockDb.referral.findMany.mockResolvedValue([
      { id: "r1", status: "open", userId: "u1", tipsterId: "p1", targetCompanyId: "c1" },
      { id: "r2", status: "relayed", userId: "u2", tipsterId: null, targetCompanyId: null },
    ]);
    mockDb.referral.update.mockResolvedValue({});

    const count = await flagStaleReferrals();

    expect(count).toBe(2);
    // Read filters the working set past the staleness threshold (now - 21d).
    const where = mockDb.referral.findMany.mock.calls[0][0].where;
    expect(where.status).toEqual({ in: ["open", "engaged", "relayed", "in_review"] });
    expect((where.lastActivityAt.lte as Date).toISOString()).toBe(
      new Date("2026-05-25T12:00:00.000Z").toISOString(),
    );
    // IT-B4: a system sweep attributes itself to `automation`, not the last human.
    expect(mockDb.referral.update).toHaveBeenCalledTimes(2);
    expect(mockDb.referral.update).toHaveBeenNthCalledWith(1, {
      where: { id: "r1" },
      data: { status: "stale", updatedByType: "automation", updatedById: null },
    });
  });

  it("emits a system-initiated ReferralStatusChanged per flagged referral with its previous status", async () => {
    mockDb.referral.findMany.mockResolvedValue([
      { id: "r1", status: "engaged", userId: "u1", tipsterId: "p1", targetCompanyId: "c1" },
    ]);
    mockDb.referral.update.mockResolvedValue({});

    await flagStaleReferrals();

    expect(mockPublish).toHaveBeenCalledTimes(1);
    expect(mockPublish.mock.calls[0][0]).toEqual({
      type: "ReferralStatusChanged",
      payload: {
        referralId: "r1",
        userId: "u1",
        previousStatus: "engaged",
        newStatus: "stale",
        systemInitiated: true,
        tipsterPersonId: "p1",
        targetCompanyId: "c1",
      },
    });
  });

  it("returns 0 and emits nothing when the working set is empty (idempotent re-run)", async () => {
    mockDb.referral.findMany.mockResolvedValue([]);
    expect(await flagStaleReferrals()).toBe(0);
    expect(mockDb.referral.update).not.toHaveBeenCalled();
    expect(mockPublish).not.toHaveBeenCalled();
  });
});
