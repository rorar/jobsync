import {
  addJobContact,
  removeJobContact,
  getJobContactsForPerson,
  getJobContactsForJob,
} from "@/actions/jobContact.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";
import { createEvent, DomainEventType } from "@/lib/events/event-types";
import { eventBus } from "@/lib/events";

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    job: { findFirst: jest.fn() },
    person: { findFirst: jest.fn() },
    jobContact: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      delete: jest.fn(),
    },
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/events", () => ({ eventBus: { publish: jest.fn() } }));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ type: _type, payload })),
  DomainEventType: { ContactUpdated: "ContactUpdated" },
}));

const prisma = new PrismaClient();
const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

beforeEach(() => {
  jest.clearAllMocks();
});

// ---------------------------------------------------------------------------
// addJobContact
// ---------------------------------------------------------------------------

describe("addJobContact", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await addJobContact("job-1", "person-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if job not found (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await addJobContact("job-missing", "person-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.jobNotFound");
  });

  it("rejects if person not found (IDOR)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await addJobContact("job-1", "person-missing");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("creates job contact successfully", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "person-1" });
    (prisma.jobContact.create as jest.Mock).mockResolvedValue({ id: "contact-1" });

    const result = await addJobContact("job-1", "person-1", "recruiter");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "contact-1" });
    expect(prisma.jobContact.create).toHaveBeenCalledWith({
      data: {
        userId: mockUser.id,
        jobId: "job-1",
        personId: "person-1",
        role: "recruiter",
      },
    });
  });

  it("creates job contact with null role (unspecified)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "person-1" });
    (prisma.jobContact.create as jest.Mock).mockResolvedValue({ id: "contact-1" });

    const result = await addJobContact("job-1", "person-1");

    expect(result.success).toBe(true);
    expect(prisma.jobContact.create).toHaveBeenCalledWith({
      data: { userId: mockUser.id, jobId: "job-1", personId: "person-1", role: null },
    });
  });

  it("rejects an invalid contact role at the boundary (ADR-019)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "person-1" });

    const result = await addJobContact("job-1", "person-1", "Recruiter");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidContactRole");
    expect(prisma.jobContact.create).not.toHaveBeenCalled();
  });

  it("handles P2002 unique constraint (already linked)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "person-1" });
    const p2002Error = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    (prisma.jobContact.create as jest.Mock).mockRejectedValue(p2002Error);

    const result = await addJobContact("job-1", "person-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.contactAlreadyLinked");
  });

  it("publishes ContactUpdated event after successful creation", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.job.findFirst as jest.Mock).mockResolvedValue({ id: "job-1" });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue({ id: "person-1" });
    (prisma.jobContact.create as jest.Mock).mockResolvedValue({ id: "contact-1" });

    await addJobContact("job-1", "person-1");

    // Welle 3 Task 1.5: payload carries jobId so the projection can write
    // targetJobId (+ resolve targetCompanyId) — link is visible on the Job timeline.
    expect(createEvent).toHaveBeenCalledWith(DomainEventType.ContactUpdated, {
      personId: "person-1",
      userId: mockUser.id,
      jobId: "job-1",
    });
    expect(eventBus.publish).toHaveBeenCalledWith({
      type: DomainEventType.ContactUpdated,
      payload: { personId: "person-1", userId: mockUser.id, jobId: "job-1" },
    });
  });
});

// ---------------------------------------------------------------------------
// removeJobContact
// ---------------------------------------------------------------------------

describe("removeJobContact", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await removeJobContact("contact-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects if entry not found", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.jobContact.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await removeJobContact("contact-missing");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.jobContactNotFound");
  });

  it("removes successfully and returns the id", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.jobContact.findFirst as jest.Mock).mockResolvedValue({
      id: "contact-1",
      personId: "person-1",
    });
    (prisma.jobContact.delete as jest.Mock).mockResolvedValue({ id: "contact-1" });

    const result = await removeJobContact("contact-1");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: { id: string } }).data).toEqual({ id: "contact-1" });
    expect(prisma.jobContact.delete).toHaveBeenCalledWith({ where: { id: "contact-1" } });
  });

  it("publishes ContactUpdated event after successful removal", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.jobContact.findFirst as jest.Mock).mockResolvedValue({
      id: "contact-1",
      personId: "person-1",
      jobId: "job-1",
    });
    (prisma.jobContact.delete as jest.Mock).mockResolvedValue({ id: "contact-1" });

    await removeJobContact("contact-1");

    // Welle 3 Task 1.5: unlink also carries jobId so the unlink shows on the Job timeline.
    expect(createEvent).toHaveBeenCalledWith(DomainEventType.ContactUpdated, {
      personId: "person-1",
      userId: mockUser.id,
      jobId: "job-1",
    });
    expect(eventBus.publish).toHaveBeenCalledWith({
      type: DomainEventType.ContactUpdated,
      payload: { personId: "person-1", userId: mockUser.id, jobId: "job-1" },
    });
  });
});

// ---------------------------------------------------------------------------
// getJobContactsForPerson
// ---------------------------------------------------------------------------

describe("getJobContactsForPerson", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getJobContactsForPerson("person-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns contacts with job includes", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const mockContacts = [
      {
        id: "contact-1",
        personId: "person-1",
        jobId: "job-1",
        job: {
          id: "job-1",
          JobTitle: { label: "Software Engineer" },
          Company: { label: "Acme Corp" },
          Status: { value: "applied", label: "Applied" },
        },
      },
    ];
    (prisma.jobContact.findMany as jest.Mock).mockResolvedValue(mockContacts);

    const result = await getJobContactsForPerson("person-1");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: unknown[] }).data).toEqual(mockContacts);
    expect(prisma.jobContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { personId: "person-1", userId: mockUser.id },
        include: expect.objectContaining({ job: expect.anything() }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// getJobContactsForJob
// ---------------------------------------------------------------------------

describe("getJobContactsForJob", () => {
  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getJobContactsForJob("job-1");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns contacts with person includes", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const mockContacts = [
      {
        id: "contact-1",
        jobId: "job-1",
        personId: "person-1",
        person: { id: "person-1", firstName: "Jane", lastName: "Doe", headline: "Recruiter" },
      },
    ];
    (prisma.jobContact.findMany as jest.Mock).mockResolvedValue(mockContacts);

    const result = await getJobContactsForJob("job-1");

    expect(result.success).toBe(true);
    expect((result as { success: true; data: unknown[] }).data).toEqual(mockContacts);
    expect(prisma.jobContact.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { jobId: "job-1", userId: mockUser.id },
        include: expect.objectContaining({ person: expect.anything() }),
      }),
    );
  });
});
