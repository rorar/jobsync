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
    person: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
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
jest.mock("@/lib/crm/anonymize-person", () => ({ anonymizePersonCascade: jest.fn() }));
jest.mock("@/lib/crm/retention-policy", () => ({ getCrmRetentionPolicy: jest.fn() }));
jest.mock("@/lib/account/execute-deletion", () => ({ executeAccountDeletion: jest.fn() }));
jest.mock("@/lib/auth/admin", () => ({ writeAdminAuditLog: jest.fn() }));
jest.mock("@/lib/debug", () => ({ debugLog: jest.fn(), debugError: jest.fn() }));

import db from "@/lib/db";
import { eventBus } from "@/lib/events";
import { anonymizePersonCascade } from "@/lib/crm/anonymize-person";
import { getCrmRetentionPolicy } from "@/lib/crm/retention-policy";
import {
  expireAutoCreatedPersons,
  checkInterviewReminders,
  checkOverdueTasks,
  flagStaleReferrals,
} from "@/lib/scheduler/crm-cron";

const mockDb = db as unknown as {
  person: { findMany: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
  crmInterview: { findMany: jest.Mock };
  crmTask: { findMany: jest.Mock };
  crmActivityLog: { findFirst: jest.Mock; create: jest.Mock };
  referral: { findMany: jest.Mock; update: jest.Mock };
  $transaction: jest.Mock;
};
const mockPublish = (eventBus as unknown as { publish: jest.Mock }).publish;
const mockCascade = anonymizePersonCascade as jest.Mock;
const mockPolicy = getCrmRetentionPolicy as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  // $transaction executes the operation array (the ops are themselves mocked).
  mockDb.$transaction.mockImplementation(async (ops: unknown[]) => Promise.all(ops as Promise<unknown>[]));
  mockDb.person.update.mockReturnValue(Promise.resolve({}));
  mockDb.person.findFirst.mockResolvedValue({ emails: "[]", phones: "[]" });
  mockDb.crmActivityLog.create.mockResolvedValue({});
  mockDb.crmActivityLog.findFirst.mockResolvedValue(null);
  mockCascade.mockResolvedValue(undefined);
  mockPolicy.mockResolvedValue({ enabled: true, days: 730 });
});

describe("expireAutoCreatedPersons", () => {
  const expiredRow = { id: "p1", userId: "u1" };

  it("ERASES via the AnonymizePerson cascade instead of archiving", async () => {
    // W-B3: `archived` is a UI filter facet, not a retention outcome — an
    // archived Person is still listed, searched, exported (Art. 15) and one
    // click from restoration, so archiving on expiry never ended the
    // processing. Expiry must erase.
    mockDb.person.findMany.mockResolvedValue([expiredRow]);

    const count = await expireAutoCreatedPersons();

    expect(count).toBe(1);
    expect(mockCascade).toHaveBeenCalledTimes(1);
    expect(mockCascade).toHaveBeenCalledWith(
      "u1",
      "p1",
      { emails: "[]", phones: "[]" },
      { reason: "retention_expired", actorEmail: null },
    );
    // The old behaviour is gone: no status flip to archived.
    expect(mockDb.person.update).not.toHaveBeenCalled();
  });

  it("REGRESSION (V1b): writes NO activity-log row, so no name outlives the erasure", async () => {
    // The deleted write put `linkedRecordName: "First Last"` into a
    // CrmActivityLog row whose happenedAt defaulted to now — starting a fresh
    // 1095-day clock on the very name the expiry was meant to retire. Expiry
    // used to EXTEND the name's life. The PII-free audit row is produced
    // instead by the ContactDeleted -> contact_deleted projection.
    mockDb.person.findMany.mockResolvedValue([expiredRow]);

    await expireAutoCreatedPersons();

    expect(mockDb.crmActivityLog.create).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("REGRESSION (V1b): never reads firstName/lastName", async () => {
    // They were selected ONLY to build the deleted log row. Reading them at all
    // is how that row came to exist.
    mockDb.person.findMany.mockResolvedValue([expiredRow]);

    await expireAutoCreatedPersons();

    const select = mockDb.person.findMany.mock.calls[0][0].select;
    expect(select).toEqual({ id: true, userId: true });
    expect(select).not.toHaveProperty("firstName");
    expect(select).not.toHaveProperty("lastName");
  });

  it("widened guard: a manually ARCHIVED expired Person is still erased", async () => {
    // The old `status: "active"` filter let exactly the records a user had
    // already set aside escape retention entirely. The predicate is now the
    // same one AnonymizePerson uses.
    mockDb.person.findMany.mockResolvedValue([expiredRow]);

    await expireAutoCreatedPersons();

    expect(mockDb.person.findMany.mock.calls[0][0].where).toEqual({
      status: { not: "anonymized" },
      dataSource: "auto_created",
      retentionExpiresAt: { lte: expect.any(Date) },
    });
  });

  it("does not erase when the user turned automatic erasure OFF", async () => {
    mockPolicy.mockResolvedValue({ enabled: false, days: 730 });
    mockDb.person.findMany.mockResolvedValue([expiredRow]);

    expect(await expireAutoCreatedPersons()).toBe(0);
    expect(mockCascade).not.toHaveBeenCalled();
  });

  it("resolves the policy once per USER, not once per Person", async () => {
    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", userId: "u1" },
      { id: "p2", userId: "u1" },
      { id: "p3", userId: "u2" },
    ]);

    expect(await expireAutoCreatedPersons()).toBe(3);
    expect(mockPolicy).toHaveBeenCalledTimes(2);
  });

  it("keeps sweeping after one person fails", async () => {
    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", userId: "u1" },
      { id: "p2", userId: "u1" },
    ]);
    mockCascade.mockRejectedValueOnce(new Error("boom"));

    expect(await expireAutoCreatedPersons()).toBe(1);
    expect(mockCascade).toHaveBeenCalledTimes(2);
  });

  it("no-ops when nothing is expired", async () => {
    mockDb.person.findMany.mockResolvedValue([]);
    expect(await expireAutoCreatedPersons()).toBe(0);
    expect(mockCascade).not.toHaveBeenCalled();
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
