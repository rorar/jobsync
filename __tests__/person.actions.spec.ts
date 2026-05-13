/**
 * person.actions.spec.ts — ADR-015 IDOR ownership enforcement tests
 *
 * Verifies that anonymizePerson and mergePersons include userId in ALL
 * Prisma updateMany/deleteMany WHERE clauses (defense-in-depth).
 */
import { anonymizePerson, mergePersons } from "@/actions/person.actions";
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
    crmNoteTarget: { deleteMany: jest.fn(), updateMany: jest.fn() },
    crmTaskTarget: { deleteMany: jest.fn(), updateMany: jest.fn() },
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
  crmNoteTarget: { deleteMany: jest.Mock; updateMany: jest.Mock };
  crmTaskTarget: { deleteMany: jest.Mock; updateMany: jest.Mock };
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
    mockDb.crmNoteTarget.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmTaskTarget.deleteMany.mockResolvedValue({ count: 0 });
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
        data: { personId: WINNER_ID },
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
  });
});
