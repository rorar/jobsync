/**
 * person.actions.spec.ts — ADR-015 IDOR ownership enforcement tests
 *
 * Verifies that anonymizePerson and mergePersons include userId in ALL
 * Prisma updateMany/deleteMany WHERE clauses (defense-in-depth).
 */
import { anonymizePerson, mergePersons, updatePerson, withdrawConsent, reinstateConsent } from "@/actions/person.actions";
import { getCurrentUser } from "@/utils/user.utils";
import db from "@/lib/db";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    person: {
      findFirst: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    crmNoteTarget: { deleteMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    crmTaskTarget: { deleteMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    crmInterview: { updateMany: jest.fn() },
    crmActivityLog: { updateMany: jest.fn() },
    jobContact: { deleteMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    crmBlocklist: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: jest.fn() },
}));

jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ payload })),
  DomainEventType: {
    ContactDeleted: "ContactDeleted",
    ContactUpdated: "ContactUpdated",
  },
}));

const mockDb = db as unknown as {
  person: { findFirst: jest.Mock; update: jest.Mock; delete: jest.Mock };
  crmNoteTarget: { deleteMany: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  crmTaskTarget: { deleteMany: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  crmInterview: { updateMany: jest.Mock };
  crmActivityLog: { updateMany: jest.Mock };
  jobContact: { deleteMany: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  crmBlocklist: { deleteMany: jest.Mock };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: "user-1" };
const PERSON_ID = "person-1";
const WINNER_ID = "winner-1";
const LOSER_ID = "loser-1";

const basePerson = (id: string, overrides?: Record<string, unknown>) => ({
  id,
  userId: USER.id,
  status: "active",
  emails: "[]",
  phones: "[]",
  companies: "[]",
  socialProfiles: "[]",
  ...overrides,
});

/**
 * Wire $transaction to capture the array of Prisma client-level calls
 * so we can inspect what WHERE clauses each operation received.
 */
function wireTransaction(): void {
  mockDb.$transaction.mockImplementation(async (operations: unknown[]) => {
    return Promise.all(operations as Promise<unknown>[]);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("person.actions — ADR-015 IDOR ownership enforcement", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(USER);
    wireTransaction();
    // Default mocks for successful operations
    mockDb.crmNoteTarget.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.crmNoteTarget.findMany.mockResolvedValue([]);
    mockDb.crmNoteTarget.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmTaskTarget.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.crmTaskTarget.findMany.mockResolvedValue([]);
    mockDb.crmTaskTarget.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmInterview.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmActivityLog.updateMany.mockResolvedValue({ count: 0 });
    mockDb.jobContact.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.jobContact.findMany.mockResolvedValue([]);
    mockDb.jobContact.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmBlocklist.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.person.update.mockResolvedValue({});
    mockDb.person.delete.mockResolvedValue({});
  });

  // =========================================================================
  // anonymizePerson
  // =========================================================================
  describe("anonymizePerson", () => {
    beforeEach(() => {
      mockDb.person.findFirst.mockResolvedValue(basePerson(PERSON_ID));
    });

    it("includes userId scoping in crmNoteTarget.deleteMany WHERE clause", async () => {
      await anonymizePerson(PERSON_ID);

      // CrmNoteTarget has no userId column — scoped via note: { userId }
      expect(mockDb.crmNoteTarget.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          targetPersonId: PERSON_ID,
          note: { userId: USER.id },
        }),
      });
    });

    it("includes userId scoping in crmTaskTarget.deleteMany WHERE clause", async () => {
      await anonymizePerson(PERSON_ID);

      // CrmTaskTarget has no userId column — scoped via task: { userId }
      expect(mockDb.crmTaskTarget.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          targetPersonId: PERSON_ID,
          task: { userId: USER.id },
        }),
      });
    });

    it("includes userId in jobContact.deleteMany WHERE clause", async () => {
      await anonymizePerson(PERSON_ID);

      expect(mockDb.jobContact.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id }),
      });
    });

    it("includes userId in crmInterview.updateMany WHERE clause", async () => {
      await anonymizePerson(PERSON_ID);

      expect(mockDb.crmInterview.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id }),
        data: expect.any(Object),
      });
    });

    it("includes userId in crmActivityLog.updateMany WHERE clause", async () => {
      await anonymizePerson(PERSON_ID);

      expect(mockDb.crmActivityLog.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id }),
        data: expect.any(Object),
      });
    });

    it("includes userId in crmBlocklist.deleteMany WHERE clause when person has emails", async () => {
      mockDb.person.findFirst.mockResolvedValue(
        basePerson(PERSON_ID, {
          emails: JSON.stringify([{ email: "alice@example.com", isPrimary: true, label: "work" }]),
        }),
      );

      await anonymizePerson(PERSON_ID);

      expect(mockDb.crmBlocklist.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: USER.id,
          handle: { in: ["alice@example.com"] },
        }),
      });
    });
  });

  // =========================================================================
  // mergePersons
  // =========================================================================
  describe("mergePersons", () => {
    beforeEach(() => {
      mockDb.person.findFirst
        .mockResolvedValueOnce(basePerson(WINNER_ID))
        .mockResolvedValueOnce(basePerson(LOSER_ID));
    });

    it("includes userId in pre-read jobContact.findMany for loser", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      // First findMany call is for loserId job contacts
      const calls = mockDb.jobContact.findMany.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[0][0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER.id }),
        }),
      );
    });

    it("includes userId in pre-read jobContact.findMany for winner", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      const calls = mockDb.jobContact.findMany.mock.calls;
      expect(calls.length).toBeGreaterThanOrEqual(2);
      expect(calls[1][0]).toEqual(
        expect.objectContaining({
          where: expect.objectContaining({ userId: USER.id }),
        }),
      );
    });

    it("includes userId in crmInterview.updateMany WHERE clause during merge", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.crmInterview.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id, personId: LOSER_ID }),
        data: expect.objectContaining({ personId: WINNER_ID }),
      });
    });

    it("includes userId scoping in crmTaskTarget.updateMany WHERE clause during merge", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      // CrmTaskTarget has no userId column — scoped via task: { userId }
      expect(mockDb.crmTaskTarget.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          targetPersonId: LOSER_ID,
          task: { userId: USER.id },
        }),
        data: { targetPersonId: WINNER_ID },
      });
    });

    it("includes userId scoping in crmNoteTarget.updateMany during merge", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      // CrmNoteTarget has no direct userId — scoped via note: { userId }
      expect(mockDb.crmNoteTarget.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          targetPersonId: LOSER_ID,
          note: { userId: USER.id },
        }),
        data: { targetPersonId: WINNER_ID },
      });
    });

    it("includes userId in jobContact.updateMany WHERE clause during merge", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.jobContact.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id }),
        data: { personId: WINNER_ID },
      });
    });

    it("includes userId in crmActivityLog.updateMany WHERE clause during merge", async () => {
      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.crmActivityLog.updateMany).toHaveBeenCalledWith({
        where: expect.objectContaining({ userId: USER.id }),
        data: { targetPersonId: WINNER_ID },
      });
    });

    it("includes userId in duplicate jobContact.deleteMany WHERE clause", async () => {
      // Simulate duplicate: loser has a contact for job-1, winner also has one
      mockDb.jobContact.findMany
        .mockReset()
        .mockResolvedValueOnce([{ jobId: "job-1" }])
        .mockResolvedValueOnce([{ jobId: "job-1" }]);

      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.jobContact.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: USER.id,
          personId: LOSER_ID,
          jobId: { in: ["job-1"] },
        }),
      });
    });

    // G25 — task/note target dedup
    it("dedups CrmTaskTarget: deletes the loser's colliding task target before transfer", async () => {
      // Both loser and winner target task "task-1" → after transfer that would
      // leave two winner rows. The loser's colliding row must be removed first.
      mockDb.crmTaskTarget.findMany
        .mockResolvedValueOnce([{ taskId: "task-1" }]) // loser's targets
        .mockResolvedValueOnce([{ taskId: "task-1" }]); // winner's targets

      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.crmTaskTarget.deleteMany).toHaveBeenCalledWith({
        where: {
          targetPersonId: LOSER_ID,
          taskId: { in: ["task-1"] },
          task: { userId: USER.id },
        },
      });
    });

    it("dedups CrmNoteTarget: deletes the loser's colliding note target before transfer", async () => {
      mockDb.crmNoteTarget.findMany
        .mockResolvedValueOnce([{ noteId: "note-1" }]) // loser's targets
        .mockResolvedValueOnce([{ noteId: "note-1" }]); // winner's targets

      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.crmNoteTarget.deleteMany).toHaveBeenCalledWith({
        where: {
          targetPersonId: LOSER_ID,
          noteId: { in: ["note-1"] },
          note: { userId: USER.id },
        },
      });
    });

    it("does NOT delete task targets when there is no overlap", async () => {
      mockDb.crmTaskTarget.findMany
        .mockResolvedValueOnce([{ taskId: "task-loser" }])
        .mockResolvedValueOnce([{ taskId: "task-winner" }]);

      await mergePersons(WINNER_ID, LOSER_ID);

      expect(mockDb.crmTaskTarget.deleteMany).not.toHaveBeenCalled();
    });
  });
});

// ===========================================================================
// GDPR-Consent (DSGVO Art. 7(3)) — withdrawal, reinstatement, enforcement
// ===========================================================================
describe("person.actions — GDPR-Consent (Art. 7(3))", () => {
  const PERSON_ID = "person-1";

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(USER);
    mockDb.person.update.mockResolvedValue({});
  });

  describe("updatePerson enforcement", () => {
    it("blocks edits when consent is withdrawn (consent-blocked)", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        id: PERSON_ID,
        status: "active",
        processingBasis: "consent",
        consentWithdrawnAt: new Date(),
      });

      const result = await updatePerson(PERSON_ID, { firstName: "Nope" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.consentWithdrawn");
      expect(mockDb.person.update).not.toHaveBeenCalled();
    });

    it("allows edits when consent basis but NOT withdrawn", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        id: PERSON_ID,
        status: "active",
        processingBasis: "consent",
        consentWithdrawnAt: null,
      });

      const result = await updatePerson(PERSON_ID, { firstName: "Ok" });

      expect(result.success).toBe(true);
      expect(mockDb.person.update).toHaveBeenCalled();
    });
  });

  describe("withdrawConsent", () => {
    it("sets consentWithdrawnAt (owner-scoped) when basis=consent and not withdrawn", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        processingBasis: "consent",
        consentWithdrawnAt: null,
      });

      const result = await withdrawConsent(PERSON_ID);

      expect(result.success).toBe(true);
      expect(mockDb.person.update).toHaveBeenCalledWith({
        where: { id: PERSON_ID, userId: USER.id },
        data: expect.objectContaining({ consentWithdrawnAt: expect.any(Date) }),
      });
    });

    it("rejects when basis is not consent", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        processingBasis: "legitimate_interest",
        consentWithdrawnAt: null,
      });

      const result = await withdrawConsent(PERSON_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.consentNotApplicable");
      expect(mockDb.person.update).not.toHaveBeenCalled();
    });

    it("rejects when consent already withdrawn", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        processingBasis: "consent",
        consentWithdrawnAt: new Date(),
      });

      const result = await withdrawConsent(PERSON_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.consentAlreadyWithdrawn");
      expect(mockDb.person.update).not.toHaveBeenCalled();
    });
  });

  describe("reinstateConsent", () => {
    it("clears consentWithdrawnAt when currently withdrawn", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        processingBasis: "consent",
        consentWithdrawnAt: new Date(),
      });

      const result = await reinstateConsent(PERSON_ID);

      expect(result.success).toBe(true);
      expect(mockDb.person.update).toHaveBeenCalledWith({
        where: { id: PERSON_ID, userId: USER.id },
        data: expect.objectContaining({ consentWithdrawnAt: null }),
      });
    });

    it("rejects when consent was not withdrawn", async () => {
      mockDb.person.findFirst.mockResolvedValue({
        processingBasis: "consent",
        consentWithdrawnAt: null,
      });

      const result = await reinstateConsent(PERSON_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.consentNotWithdrawn");
      expect(mockDb.person.update).not.toHaveBeenCalled();
    });
  });
});
