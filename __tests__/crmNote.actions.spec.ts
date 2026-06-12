import {
  createCrmNote,
  updateCrmNote,
  deleteCrmNote,
  getCrmNotes,
} from "@/actions/crmNote.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    crmNote: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    crmActivityLog: { create: jest.fn() },
    person: { findFirst: jest.fn() },
    company: { findFirst: jest.fn() },
    job: { findFirst: jest.fn() },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ type: _type, payload })),
  DomainEventType: { CrmNoteCreated: "CrmNoteCreated" },
}));

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db", () => {
  const { PrismaClient } = jest.requireMock("@prisma/client");
  return new PrismaClient();
});
jest.mock("@/models/person.model", () => ({
  validateExactlyOneTarget: jest.fn(),
}));

import { validateExactlyOneTarget } from "@/models/person.model";

const prisma = new PrismaClient();

const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

describe("crmNote.actions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // createCrmNote
  // ---------------------------------------------------------------------------

  describe("createCrmNote", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await createCrmNote({
        body: "Note body",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("rejects empty targets array", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

      const result = await createCrmNote({ body: "Note body", targets: [] });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.targetRequired");
    });

    it("rejects invalid target (multiple fields set)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(false);

      const result = await createCrmNote({
        body: "Note body",
        targets: [{ targetPersonId: "p-1", targetJobId: "j-1" }],
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.exactlyOneTarget");
    });

    it("creates note with targets", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmNote.create as jest.Mock).mockResolvedValue({ id: "note-1" });

      const result = await createCrmNote({
        title: "Meeting notes",
        body: "Discussed timeline.",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "note-1" });
      expect(prisma.crmNote.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: mockUser.id,
            body: "Discussed timeline.",
            title: "Meeting notes",
          }),
        }),
      );
    });

    it("does not call crmActivityLog.create directly (activity log via consumer)", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmNote.create as jest.Mock).mockResolvedValue({ id: "note-2" });

      await createCrmNote({
        body: "Some note.",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(prisma.crmActivityLog.create).not.toHaveBeenCalled();
      expect(eventBus.publish).toHaveBeenCalled();
    });

    it("publishes CrmNoteCreated event", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmNote.create as jest.Mock).mockResolvedValue({ id: "note-3" });

      await createCrmNote({
        body: "Event note.",
        targets: [{ targetPersonId: "p-1" }],
      });

      expect(createEvent).toHaveBeenCalledWith(
        DomainEventType.CrmNoteCreated,
        expect.objectContaining({ noteId: "note-3", userId: mockUser.id }),
      );
      expect(eventBus.publish).toHaveBeenCalled();
    });

    // targetCompanyId pre-staging (ROADMAP 2.20 CompanyDetail) — additive + optional.
    it("publishes CrmNoteCreated with targetCompanyId for a company-targeted note", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.company.findFirst as jest.Mock).mockResolvedValue({ id: "co-1" });
      (prisma.crmNote.create as jest.Mock).mockResolvedValue({ id: "note-co" });

      await createCrmNote({ body: "Company note.", targets: [{ targetCompanyId: "co-1" }] });

      expect(createEvent).toHaveBeenCalledWith(
        DomainEventType.CrmNoteCreated,
        expect.objectContaining({ noteId: "note-co", targetCompanyId: "co-1" }),
      );
    });

    it("leaves targetCompanyId undefined for a person-targeted note", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (validateExactlyOneTarget as jest.Mock).mockReturnValue(true);
      (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "p-1" });
      (prisma.crmNote.create as jest.Mock).mockResolvedValue({ id: "note-p" });

      await createCrmNote({ body: "Person note.", targets: [{ targetPersonId: "p-1" }] });

      const call = (createEvent as jest.Mock).mock.calls.find(
        (c) => c[0] === DomainEventType.CrmNoteCreated,
      );
      expect(call?.[1].targetCompanyId).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // updateCrmNote
  // ---------------------------------------------------------------------------

  describe("updateCrmNote", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await updateCrmNote("note-1", { body: "Updated" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when note does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await updateCrmNote("note-1", { body: "Updated" });

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.noteNotFound");
    });

    it("updates title and body", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findFirst as jest.Mock).mockResolvedValue({ id: "note-1", userId: mockUser.id });
      (prisma.crmNote.update as jest.Mock).mockResolvedValue({});

      const result = await updateCrmNote("note-1", { title: "New Title", body: "New body" });

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "note-1" });
      expect(prisma.crmNote.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "note-1" },
          data: { updatedByType: "user", updatedById: mockUser.id, title: "New Title", body: "New body" },
        }),
      );
    });
  });

  // ---------------------------------------------------------------------------
  // deleteCrmNote
  // ---------------------------------------------------------------------------

  describe("deleteCrmNote", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await deleteCrmNote("note-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns not found when note does not belong to user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await deleteCrmNote("note-1");

      expect(result.success).toBe(false);
      expect(result.message).toBe("crm.errors.noteNotFound");
    });

    it("deletes successfully", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findFirst as jest.Mock).mockResolvedValue({ id: "note-1", userId: mockUser.id });
      (prisma.crmNote.delete as jest.Mock).mockResolvedValue({});

      const result = await deleteCrmNote("note-1");

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ id: "note-1" });
      expect(prisma.crmNote.delete).toHaveBeenCalledWith({ where: { id: "note-1" } });
    });
  });

  // ---------------------------------------------------------------------------
  // getCrmNotes
  // ---------------------------------------------------------------------------

  describe("getCrmNotes", () => {
    it("rejects unauthenticated user", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(null);

      const result = await getCrmNotes();

      expect(result.success).toBe(false);
      expect(result.message).toBe("errors.notAuthenticated");
    });

    it("returns notes with targets", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      const notes = [
        { id: "note-1", body: "First note", targets: [] },
        { id: "note-2", body: "Second note", targets: [] },
      ];
      (prisma.crmNote.findMany as jest.Mock).mockResolvedValue(notes);

      const result = await getCrmNotes();

      expect(result.success).toBe(true);
      expect(result.data).toEqual(notes);
      expect(prisma.crmNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ userId: mockUser.id }),
        }),
      );
    });

    it("filters by targetPersonId", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmNotes({ targetPersonId: "person-7" });

      expect(prisma.crmNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            targets: { some: { targetPersonId: "person-7" } },
          }),
        }),
      );
    });

    it("filters by targetJobId", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmNotes({ targetJobId: "job-42" });

      expect(prisma.crmNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            targets: { some: { targetJobId: "job-42" } },
          }),
        }),
      );
    });

    it("filters by targetCompanyId", async () => {
      (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
      (prisma.crmNote.findMany as jest.Mock).mockResolvedValue([]);

      await getCrmNotes({ targetCompanyId: "company-5" });

      expect(prisma.crmNote.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId: mockUser.id,
            targets: { some: { targetCompanyId: "company-5" } },
          }),
        }),
      );
    });
  });
});
