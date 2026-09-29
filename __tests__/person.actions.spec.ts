/**
 * person.actions.spec.ts — ADR-015 IDOR ownership enforcement tests
 *
 * Verifies that anonymizePerson and mergePersons include userId in ALL
 * Prisma updateMany/deleteMany WHERE clauses (defense-in-depth).
 */
import { anonymizePerson, mergePersons, updatePerson, withdrawConsent, reinstateConsent } from "@/actions/person.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
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
    company: { count: jest.fn() },
    crmBlocklist: { deleteMany: jest.fn() },
    referral: { updateMany: jest.fn() },
    personConnection: { deleteMany: jest.fn(), findMany: jest.fn(), updateMany: jest.fn() },
    crmNote: { deleteMany: jest.fn(), updateMany: jest.fn() },
    crmTask: { deleteMany: jest.fn(), updateMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/audit/data-audit", () => ({
  writeDataAuditLog: jest.fn(),
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
  company: { count: jest.Mock };
  crmBlocklist: { deleteMany: jest.Mock };
  referral: { updateMany: jest.Mock };
  personConnection: { deleteMany: jest.Mock; findMany: jest.Mock; updateMany: jest.Mock };
  crmNote: { deleteMany: jest.Mock; updateMany: jest.Mock };
  crmTask: { deleteMany: jest.Mock; updateMany: jest.Mock };
  $transaction: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const USER = { id: "user-1", email: "user-1@example.com" };
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
    mockDb.crmNote.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.crmNote.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmTask.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmTask.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.crmInterview.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmActivityLog.updateMany.mockResolvedValue({ count: 0 });
    mockDb.jobContact.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.jobContact.findMany.mockResolvedValue([]);
    mockDb.jobContact.updateMany.mockResolvedValue({ count: 0 });
    mockDb.crmBlocklist.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.referral.updateMany.mockResolvedValue({ count: 0 });
    mockDb.personConnection.deleteMany.mockResolvedValue({ count: 0 });
    mockDb.personConnection.findMany.mockResolvedValue([]);
    mockDb.personConnection.updateMany.mockResolvedValue({ count: 0 });
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

    it("writes an attributable audit entry for the erasure, with no snapshot (Art. 5(2))", async () => {
      await anonymizePerson(PERSON_ID);

      expect(writeDataAuditLog).toHaveBeenCalledWith({
        actorId: USER.id,
        actorEmail: USER.email,
        action: "person.anonymize",
        targetType: "person",
        targetId: PERSON_ID,
      });
      // No before/after: an erasure snapshot would preserve the very PII the
      // erasure removes (audit-trail.allium DataMinimisation).
      const call = (writeDataAuditLog as jest.Mock).mock.calls[0][0];
      expect(call.beforeAfter).toBeUndefined();
    });

    it("scrubs free text on notes and tasks that named this person (GDPR Art. 17)", async () => {
      mockDb.crmNoteTarget.findMany.mockResolvedValue([{ noteId: "note-1" }]);
      mockDb.crmTaskTarget.findMany.mockResolvedValue([{ taskId: "task-1" }]);

      await anonymizePerson(PERSON_ID);

      // A record that ALSO targets a Job survives the target removal, so the
      // prune (zero targets) never reaches it — but it still holds free text
      // about the erased person, and the Art. 15 export reads notes by userId
      // with no target filter. Scrub rather than retain.
      expect(mockDb.crmNote.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["note-1"] }, userId: USER.id },
        data: {
          title: null,
          body: "",
          updatedByType: "system",
          updatedById: USER.id,
        },
      });
      // Tasks are scrubbed, never deleted — rule DeleteTask permits a hard
      // delete only from a terminal status, and the board renders the row.
      expect(mockDb.crmTask.updateMany).toHaveBeenCalledWith({
        where: { id: { in: ["task-1"] }, userId: USER.id },
        data: {
          title: "",
          description: null,
          updatedByType: "system",
          updatedById: USER.id,
        },
      });
      expect(mockDb.crmTask.deleteMany).not.toHaveBeenCalled();
    });

    it("scrubs before the targets are removed, so the ids still name the records", async () => {
      mockDb.crmNoteTarget.findMany.mockResolvedValue([{ noteId: "note-1" }]);

      await anonymizePerson(PERSON_ID);

      const ops = mockDb.$transaction.mock.calls[0][0];
      const scrub = mockDb.crmNote.updateMany.mock.results[0].value;
      const targetDelete = mockDb.crmNoteTarget.deleteMany.mock.results[0].value;
      expect(ops.indexOf(scrub)).toBeLessThan(ops.indexOf(targetDelete));
    });

    it("prunes notes orphaned by the target removal, last in the tx (W-D3)", async () => {
      await anonymizePerson(PERSON_ID);

      // Removing the person's note targets can leave a note with zero targets —
      // unreachable in the UI, yet still holding free text about the erased
      // person (GDPR Art. 17). It must be pruned in the same tx.
      expect(mockDb.crmNoteTarget.findMany).toHaveBeenCalledWith({
        where: { targetPersonId: PERSON_ID, note: { userId: USER.id } },
        select: { noteId: true },
      });
      expect(mockDb.crmNote.deleteMany).toHaveBeenCalledWith({
        where: {
          id: { in: [] },
          userId: USER.id,
          targets: {
            none: {
              OR: [
                { targetPersonId: { not: null } },
                { targetCompanyId: { not: null } },
                { targetJobId: { not: null } },
              ],
            },
          },
        },
      });

      // Tasks are NOT pruned: an orphaned task stays visible on the board and
      // still fires overdue reminders, and rule DeleteTask forbids hard-deleting
      // a non-terminal task.
      expect(mockDb.crmTask.deleteMany).not.toHaveBeenCalled();

      // The prune's no-live-target predicate only holds once the
      // target rows are gone — it must be the LAST op in the transaction array.
      const ops = mockDb.$transaction.mock.calls[0][0];
      expect(ops[ops.length - 1]).toBe(mockDb.crmNote.deleteMany.mock.results[0].value);
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

    it("removes blocklist entries for the person's email AND its domain (W-C3)", async () => {
      mockDb.person.findFirst.mockResolvedValue(
        basePerson(PERSON_ID, {
          emails: JSON.stringify([{ email: "alice@example.com", isPrimary: true, label: "work" }]),
        }),
      );

      await anonymizePerson(PERSON_ID);

      expect(mockDb.crmBlocklist.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          userId: USER.id,
          handle: { in: expect.arrayContaining(["alice@example.com", "example.com"]) },
        }),
      });
    });

    it("removes blocklist entries for the person's phone handles too (W-C3)", async () => {
      mockDb.person.findFirst.mockResolvedValue(
        basePerson(PERSON_ID, {
          emails: JSON.stringify([{ email: "bob@acme.io", isPrimary: true, label: "work" }]),
          phones: JSON.stringify([{ number: "+49 170 1234567", type: "work", isPrimary: true }]),
        }),
      );

      await anonymizePerson(PERSON_ID);

      const call = mockDb.crmBlocklist.deleteMany.mock.calls[0][0];
      const handles: string[] = call.where.handle.in;
      expect(handles).toEqual(
        expect.arrayContaining(["bob@acme.io", "acme.io", "+49 170 1234567"]),
      );
    });

    it("marks the anonymized person's last actor as the system (W-C4)", async () => {
      await anonymizePerson(PERSON_ID);

      expect(mockDb.person.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "anonymized",
            updatedBySource: "system",
          }),
        }),
      );
    });

    // Inside Track (Welle 5) — AnonymizeCascadesToInsideTrack (specs/inside-track.allium)
    it("hard-removes PersonConnection edges touching the person (userId-scoped)", async () => {
      await anonymizePerson(PERSON_ID);
      expect(mockDb.personConnection.deleteMany).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          OR: [{ fromPersonId: PERSON_ID }, { toPersonId: PERSON_ID }],
        },
      });
    });

    it("severs forwarded_to and insider Person references on referrals", async () => {
      await anonymizePerson(PERSON_ID);
      expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
        where: { userId: USER.id, forwardedToId: PERSON_ID },
        data: { forwardedToId: null },
      });
      expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
        where: { userId: USER.id, insiderId: PERSON_ID },
        data: { insiderId: null },
      });
    });

    it("de-identifies a still-working tipster referral AND declines it", async () => {
      await anonymizePerson(PERSON_ID);
      expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          tipsterId: PERSON_ID,
          status: { notIn: ["converted", "declined"] },
        },
        data: { tipsterId: null, status: "declined" },
      });
    });

    it("de-identifies a terminal tipster referral WITHOUT changing its status", async () => {
      await anonymizePerson(PERSON_ID);
      expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
        where: {
          userId: USER.id,
          tipsterId: PERSON_ID,
          status: { in: ["converted", "declined"] },
        },
        data: { tipsterId: null },
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

    // -----------------------------------------------------------------------
    // Inside Track cascade — regression for weed W-D1.
    // Before the fix the merge transferred five CRM relations and then deleted
    // the loser, leaving Referral/PersonConnection to raw referential actions:
    // Referral person links are onDelete:SetNull (warm path LOST, not
    // transferred) and PersonConnection endpoints are onDelete:Cascade (the
    // loser's edges deleted outright). Spec: specs/inside-track.allium
    // MergeCascadesToInsideTrack.
    // -----------------------------------------------------------------------
    describe("Inside Track cascade (W-D1)", () => {
      it("transfers referral tipster/insider/forwardedTo to the winner", async () => {
        await mergePersons(WINNER_ID, LOSER_ID);

        expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
          where: { tipsterId: LOSER_ID, userId: USER.id },
          data: { tipsterId: WINNER_ID },
        });
        expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
          where: { insiderId: LOSER_ID, userId: USER.id },
          data: { insiderId: WINNER_ID },
        });
        expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
          where: { forwardedToId: LOSER_ID, userId: USER.id },
          data: { forwardedToId: WINNER_ID },
        });
      });

      it("transfers an ordinary network edge instead of losing it", async () => {
        mockDb.personConnection.findMany
          .mockResolvedValueOnce([
            { id: "edge-1", fromPersonId: LOSER_ID, toPersonId: "other-person" },
          ]) // loser's edges
          .mockResolvedValueOnce([]); // winner holds none

        await mergePersons(WINNER_ID, LOSER_ID);

        expect(mockDb.personConnection.updateMany).toHaveBeenCalledWith({
          where: { id: { in: ["edge-1"] }, fromPersonId: LOSER_ID, userId: USER.id },
          data: { fromPersonId: WINNER_ID },
        });
        expect(mockDb.personConnection.deleteMany).not.toHaveBeenCalled();
      });

      it("drops an edge BETWEEN the two merged persons (would self-connect)", async () => {
        mockDb.personConnection.findMany
          .mockResolvedValueOnce([
            { id: "edge-self", fromPersonId: LOSER_ID, toPersonId: WINNER_ID },
          ])
          .mockResolvedValueOnce([
            { id: "edge-self", fromPersonId: LOSER_ID, toPersonId: WINNER_ID },
          ]);

        await mergePersons(WINNER_ID, LOSER_ID);

        expect(mockDb.personConnection.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: ["edge-self"] }, userId: USER.id },
        });
        expect(mockDb.personConnection.updateMany).not.toHaveBeenCalled();
      });

      it("drops a duplicate edge and re-points `via` at the survivor BEFORE deleting it", async () => {
        mockDb.personConnection.findMany
          .mockResolvedValueOnce([
            { id: "edge-loser", fromPersonId: LOSER_ID, toPersonId: "insider-1" },
          ])
          .mockResolvedValueOnce([
            { id: "edge-winner", fromPersonId: WINNER_ID, toPersonId: "insider-1" },
          ]);

        await mergePersons(WINNER_ID, LOSER_ID);

        // The duplicate is removed, not transferred (DistinctEndpointsPerUser).
        expect(mockDb.personConnection.deleteMany).toHaveBeenCalledWith({
          where: { id: { in: ["edge-loser"] }, userId: USER.id },
        });
        // ...and any NetworkPath routed along it now points at the survivor.
        expect(mockDb.referral.updateMany).toHaveBeenCalledWith({
          where: { viaId: "edge-loser", userId: USER.id },
          data: { viaId: "edge-winner" },
        });

        // ORDER IS THE POINT: re-pointing must be queued before the delete, or
        // onDelete:SetNull nulls viaId first and the warm path is lost anyway.
        const repointOrder = mockDb.referral.updateMany.mock.calls.findIndex(
          ([arg]) => arg?.where?.viaId === "edge-loser",
        );
        expect(repointOrder).toBeGreaterThanOrEqual(0);
        const repointInvocation =
          mockDb.referral.updateMany.mock.invocationCallOrder[repointOrder];
        const deleteInvocation =
          mockDb.personConnection.deleteMany.mock.invocationCallOrder[0];
        expect(repointInvocation).toBeLessThan(deleteInvocation);
      });

      it("scopes both connection pre-reads by userId (ADR-015)", async () => {
        await mergePersons(WINNER_ID, LOSER_ID);

        const calls = mockDb.personConnection.findMany.mock.calls;
        expect(calls.length).toBe(2);
        expect(calls[0][0]).toEqual({
          where: { userId: USER.id, OR: [{ fromPersonId: LOSER_ID }, { toPersonId: LOSER_ID }] },
          select: { id: true, fromPersonId: true, toPersonId: true },
        });
        expect(calls[1][0]).toEqual({
          where: { userId: USER.id, OR: [{ fromPersonId: WINNER_ID }, { toPersonId: WINNER_ID }] },
          select: { id: true, fromPersonId: true, toPersonId: true },
        });
      });
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

    /**
     * The company array arrives from the client wholesale. PersonForm can only
     * offer the user's own companies, but a "use server" export is callable
     * from the browser — so the UI guarantee is not a guarantee (ADR-015).
     */
    describe("company association boundary", () => {
      beforeEach(() => {
        mockDb.person.findFirst.mockResolvedValue({
          id: PERSON_ID,
          status: "active",
          processingBasis: "legitimate_interest",
          consentWithdrawnAt: null,
        });
      });

      it("rejects a company id the caller does not own", async () => {
        mockDb.company.count.mockResolvedValue(0); // foreign id -> not owned

        const result = await updatePerson(PERSON_ID, {
          companies: [
            { companyId: "someone-elses-company", companyLabel: "Acme", isPrimary: true },
          ],
        });

        expect(result.success).toBe(false);
        expect(result.message).toBe("crm.errors.companyNotFound");
        expect(mockDb.person.update).not.toHaveBeenCalled();
        expect(mockDb.company.count).toHaveBeenCalledWith({
          where: { id: { in: ["someone-elses-company"] }, createdBy: USER.id },
        });
      });

      it("rejects an association with neither an id nor a label", async () => {
        const result = await updatePerson(PERSON_ID, {
          companies: [{ companyId: "", companyLabel: "", isPrimary: true }],
        });

        expect(result.success).toBe(false);
        expect(result.message).toBe("crm.errors.invalidCompanyAssociation");
        expect(mockDb.person.update).not.toHaveBeenCalled();
      });

      it("accepts an owned company id", async () => {
        mockDb.company.count.mockResolvedValue(1);

        const result = await updatePerson(PERSON_ID, {
          companies: [{ companyId: "own-company", companyLabel: "Acme", isPrimary: true }],
        });

        expect(result.success).toBe(true);
        expect(mockDb.person.update).toHaveBeenCalled();
      });

      it("accepts a legacy label-only row without querying companies", async () => {
        const result = await updatePerson(PERSON_ID, {
          companies: [{ companyId: "", companyLabel: "Old Freetext Ltd", isPrimary: true }],
        });

        expect(result.success).toBe(true);
        expect(mockDb.company.count).not.toHaveBeenCalled();
        expect(mockDb.person.update).toHaveBeenCalled();
      });
    });

    // W-H2: create rejects a subdivision without a country; update must be
    // symmetric — over the effective (post-update) state, not just the input.
    // The boundary regex answers "well-formed?", not "real?". NT (Neutral Zone,
    // withdrawn 1993) and YD (South Yemen, withdrawn 1990) pass it, and ICU still
    // holds week data for them -- so an unreal country yielded a plausible
    // business calendar rather than an error. Membership now gates both write
    // paths; this block covers update, and createPerson carries the same gate.
    describe("country code must be a live ISO 3166-1 alpha-2", () => {
      const stubExisting = {
        id: PERSON_ID,
        status: "active",
        processingBasis: "legitimate_interest",
        consentWithdrawnAt: null,
        addressCountryCode: null,
        addressSubdivisionCode: null,
      };

      it.each(["NT", "YD", "XX", "ZZ"])(
        "rejects the well-formed but non-existent code %s without writing",
        async (code) => {
          mockDb.person.findFirst.mockResolvedValue(stubExisting);

          const result = await updatePerson(PERSON_ID, { addressCountryCode: code });

          expect(result.success).toBe(false);
          expect(result.message).toBe("crm.errors.invalidCountryCode");
          expect(mockDb.person.update).not.toHaveBeenCalled();
        },
      );

      it("still accepts a real country code in lower case", async () => {
        mockDb.person.findFirst.mockResolvedValue(stubExisting);

        const result = await updatePerson(PERSON_ID, { addressCountryCode: "de" });

        expect(result.success).toBe(true);
      });
    });

    describe("subdivision requires country (W-H2)", () => {
      it("rejects a subdivision when neither input nor existing supplies a country", async () => {
        mockDb.person.findFirst.mockResolvedValue({
          id: PERSON_ID,
          status: "active",
          processingBasis: "legitimate_interest",
          consentWithdrawnAt: null,
          addressCountryCode: null,
          addressSubdivisionCode: null,
        });

        const result = await updatePerson(PERSON_ID, { addressSubdivisionCode: "BY" });

        expect(result.success).toBe(false);
        expect(result.message).toBe("crm.errors.subdivisionWithoutCountry");
        expect(mockDb.person.update).not.toHaveBeenCalled();
      });

      it("rejects nulling the country while a subdivision remains set", async () => {
        mockDb.person.findFirst.mockResolvedValue({
          id: PERSON_ID,
          status: "active",
          processingBasis: "legitimate_interest",
          consentWithdrawnAt: null,
          addressCountryCode: "DE",
          addressSubdivisionCode: "BY",
        });

        const result = await updatePerson(PERSON_ID, { addressCountryCode: null });

        expect(result.success).toBe(false);
        expect(result.message).toBe("crm.errors.subdivisionWithoutCountry");
        expect(mockDb.person.update).not.toHaveBeenCalled();
      });

      it("accepts a subdivision paired with a country in the same update", async () => {
        mockDb.person.findFirst.mockResolvedValue({
          id: PERSON_ID,
          status: "active",
          processingBasis: "legitimate_interest",
          consentWithdrawnAt: null,
          addressCountryCode: null,
          addressSubdivisionCode: null,
        });

        const result = await updatePerson(PERSON_ID, {
          addressCountryCode: "DE",
          addressSubdivisionCode: "BY",
        });

        expect(result.success).toBe(true);
        expect(mockDb.person.update).toHaveBeenCalled();
      });
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
      // M1: emits ContactUpdated so the activity-logger projects the change.
      expect(jest.requireMock("@/lib/events").eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it("returns the i18n fallback when the update throws (M2 error path)", async () => {
      mockDb.person.findFirst.mockResolvedValue({ processingBasis: "consent", consentWithdrawnAt: null });
      mockDb.person.update.mockRejectedValueOnce(new Error("db down"));

      const result = await withdrawConsent(PERSON_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.withdrawConsent");
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
      // M1: emits ContactUpdated.
      expect(jest.requireMock("@/lib/events").eventBus.publish).toHaveBeenCalledTimes(1);
    });

    it("returns the i18n fallback when the update throws (M2 error path)", async () => {
      mockDb.person.findFirst.mockResolvedValue({ processingBasis: "consent", consentWithdrawnAt: new Date() });
      mockDb.person.update.mockRejectedValueOnce(new Error("db down"));

      const result = await reinstateConsent(PERSON_ID);

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.reinstateConsent");
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
