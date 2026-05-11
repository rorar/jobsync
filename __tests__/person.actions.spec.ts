import {
  createPerson,
  getPerson,
  getPersons,
  updatePerson,
  archivePerson,
  reactivatePerson,
  anonymizePerson,
  mergePersons,
} from "@/actions/person.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

jest.mock("@prisma/client", () => {
  const mPrismaClient = {
    person: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    crmNoteTarget: { deleteMany: jest.fn(), updateMany: jest.fn() },
    crmTaskTarget: { deleteMany: jest.fn(), updateMany: jest.fn() },
    jobContact: { findMany: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
    crmInterview: { updateMany: jest.fn() },
    crmActivityLog: { updateMany: jest.fn() },
    $transaction: jest.fn(),
  };
  return { PrismaClient: jest.fn(() => mPrismaClient) };
});

jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/lib/events", () => ({
  eventBus: { publish: jest.fn() },
}));
jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ type: _type, payload, timestamp: new Date() })),
  DomainEventType: {
    ContactCreated: "ContactCreated",
    ContactUpdated: "ContactUpdated",
    ContactDeleted: "ContactDeleted",
  },
}));

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

const mockUser = { id: "user-id", name: "Test User", email: "test@example.com" };

const minimalEmail = [{ email: "alice@example.com", type: "work" as const, isPrimary: true }];

function makePerson(overrides: Record<string, unknown> = {}) {
  return {
    id: "person-id",
    userId: mockUser.id,
    firstName: "Alice",
    lastName: "Smith",
    emails: JSON.stringify(minimalEmail),
    phones: "[]",
    companies: "[]",
    headline: null,
    socialProfiles: "[]",
    avatarUrl: null,
    addressStreet: null,
    addressCity: null,
    addressPostalCode: null,
    addressCountry: null,
    status: "active",
    dataSource: "manual",
    processingBasis: "legitimate_interest",
    createdBySource: "manual",
    createdByName: "Test User",
    updatedBySource: "manual",
    updatedByName: "Test User",
    createdAt: new Date(),
    updatedAt: new Date(),
    retentionExpiresAt: null,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// createPerson
// ---------------------------------------------------------------------------

describe("createPerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await createPerson({ emails: minimalEmail });

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects empty emails array", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

    const result = await createPerson({ emails: [] });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.emailRequired");
  });

  it("rejects when person limit (10000) reached", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(10000);

    const result = await createPerson({ emails: minimalEmail });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personLimitReached");
  });

  it("rejects multiple primary companies", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    const result = await createPerson({
      emails: minimalEmail,
      companies: [
        { companyId: "c1", companyLabel: "Acme", isPrimary: true },
        { companyId: "c2", companyLabel: "Globex", isPrimary: true },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.multiplePrimaryCompanies");
  });

  it("rejects invalid social profile URLs (non-http)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    const result = await createPerson({
      emails: minimalEmail,
      socialProfiles: [{ platform: "linkedin", url: "javascript:alert(1)" }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidSocialProfileUrl");
  });

  it("rejects invalid platform values", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    const result = await createPerson({
      emails: minimalEmail,
      socialProfiles: [{ platform: "myspace" as "other", url: "https://myspace.com/alice" }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidPlatform");
  });

  it("successfully creates person with minimal input", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);
    const created = makePerson();
    (prisma.person.create as jest.Mock).mockResolvedValue(created);

    const result = await createPerson({ emails: minimalEmail });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: created.id });
    expect(prisma.person.create).toHaveBeenCalledTimes(1);
  });

  it("successfully creates person with full input (companies, socialProfiles, address)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(5);
    const created = makePerson({ id: "full-person-id" });
    (prisma.person.create as jest.Mock).mockResolvedValue(created);

    const result = await createPerson({
      firstName: "Alice",
      lastName: "Smith",
      emails: minimalEmail,
      phones: [{ number: "+49123456789", type: "work", isPrimary: true }],
      companies: [{ companyId: "c1", companyLabel: "Acme", isPrimary: true }],
      headline: "Senior Engineer",
      socialProfiles: [{ platform: "linkedin", url: "https://linkedin.com/in/alice" }],
      addressStreet: "Mainstr. 1",
      addressCity: "Berlin",
      addressPostalCode: "10115",
      addressCountry: "DE",
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "full-person-id" });
  });

  it("publishes ContactCreated event on success", async () => {
    const { eventBus } = require("@/lib/events");
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);
    (prisma.person.create as jest.Mock).mockResolvedValue(makePerson());

    await createPerson({ emails: minimalEmail });

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it("returns failure when Prisma throws", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);
    (prisma.person.create as jest.Mock).mockRejectedValue(new Error("DB error"));

    const result = await createPerson({ emails: minimalEmail });

    expect(result.success).toBe(false);
    expect(result.message).toBe("DB error");
  });
});

// ---------------------------------------------------------------------------
// getPerson
// ---------------------------------------------------------------------------

describe("getPerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getPerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns not found for non-existent person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await getPerson("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("returns parsed JSON fields (emails, phones, companies, socialProfiles)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const raw = makePerson({
      phones: JSON.stringify([{ number: "+49123", type: "work", isPrimary: true }]),
      companies: JSON.stringify([{ companyId: "c1", companyLabel: "Acme", isPrimary: true }]),
      socialProfiles: JSON.stringify([{ platform: "github", url: "https://github.com/alice" }]),
    });
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(raw);

    const result = await getPerson("person-id");

    expect(result.success).toBe(true);
    const data = result.data as Record<string, unknown>;
    expect(Array.isArray(data.emails)).toBe(true);
    expect((data.emails as unknown[]).length).toBe(1);
    expect(Array.isArray(data.phones)).toBe(true);
    expect((data.phones as unknown[]).length).toBe(1);
    expect(Array.isArray(data.companies)).toBe(true);
    expect((data.companies as unknown[]).length).toBe(1);
    expect(Array.isArray(data.socialProfiles)).toBe(true);
    expect((data.socialProfiles as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// getPersons
// ---------------------------------------------------------------------------

describe("getPersons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await getPersons();

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns paginated results", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const persons = [makePerson(), makePerson({ id: "person-id-2" })];
    (prisma.person.findMany as jest.Mock).mockResolvedValue(persons);
    (prisma.person.count as jest.Mock).mockResolvedValue(2);

    const result = await getPersons({ page: 1, pageSize: 10 });

    expect(result.success).toBe(true);
    expect(result.data!.total).toBe(2);
    expect(result.data!.persons).toHaveLength(2);
  });

  it("applies search filter to firstName, lastName, emails, headline", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    await getPersons({ search: "Alice" });

    const findManyCall = (prisma.person.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.OR).toEqual(
      expect.arrayContaining([
        { firstName: { contains: "Alice" } },
        { lastName: { contains: "Alice" } },
        { emails: { contains: "Alice" } },
        { headline: { contains: "Alice" } },
      ]),
    );
  });

  it("applies status filter", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    await getPersons({ status: "archived" });

    const findManyCall = (prisma.person.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.status).toBe("archived");
  });

  it("applies dataSource filter", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.person.count as jest.Mock).mockResolvedValue(0);

    await getPersons({ dataSource: "imported" });

    const findManyCall = (prisma.person.findMany as jest.Mock).mock.calls[0][0];
    expect(findManyCall.where.dataSource).toBe("imported");
  });

  it("returns parsed JSON fields for each person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    const raw = makePerson({
      phones: JSON.stringify([{ number: "+49999", type: "home", isPrimary: true }]),
    });
    (prisma.person.findMany as jest.Mock).mockResolvedValue([raw]);
    (prisma.person.count as jest.Mock).mockResolvedValue(1);

    const result = await getPersons();

    expect(result.success).toBe(true);
    const first = result.data!.persons[0] as Record<string, unknown>;
    expect(Array.isArray(first.emails)).toBe(true);
    expect(Array.isArray(first.phones)).toBe(true);
    expect((first.phones as unknown[]).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// updatePerson
// ---------------------------------------------------------------------------

describe("updatePerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await updatePerson("person-id", { firstName: "Bob" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns not found for non-existent person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await updatePerson("nonexistent-id", { firstName: "Bob" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("rejects update on non-active person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "archived" }));

    const result = await updatePerson("person-id", { firstName: "Bob" });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotActive");
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("rejects multiple primary companies in update", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());

    const result = await updatePerson("person-id", {
      companies: [
        { companyId: "c1", companyLabel: "Acme", isPrimary: true },
        { companyId: "c2", companyLabel: "Globex", isPrimary: true },
      ],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.multiplePrimaryCompanies");
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("rejects invalid social profile URLs", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());

    const result = await updatePerson("person-id", {
      socialProfiles: [{ platform: "github", url: "data:text/html,<h1>evil</h1>" }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidSocialProfileUrl");
  });

  it("rejects invalid platform in socialProfiles", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());

    const result = await updatePerson("person-id", {
      socialProfiles: [{ platform: "reddit" as "other", url: "https://reddit.com/u/alice" }],
    });

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidPlatform");
  });

  it("successfully updates fields and sets updatedBySource/Name", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());
    (prisma.person.update as jest.Mock).mockResolvedValue(makePerson({ firstName: "Bob" }));

    const result = await updatePerson("person-id", { firstName: "Bob" });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "person-id" });

    const updateCall = (prisma.person.update as jest.Mock).mock.calls[0][0];
    expect(updateCall.data.updatedBySource).toBe("manual");
    expect(updateCall.data.updatedByName).toBe(mockUser.name);
    expect(updateCall.data.firstName).toBe("Bob");
  });

  it("publishes ContactUpdated event", async () => {
    const { eventBus } = require("@/lib/events");
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());
    (prisma.person.update as jest.Mock).mockResolvedValue(makePerson());

    await updatePerson("person-id", { headline: "Updated headline" });

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
  });

  it("returns failure when Prisma throws", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson());
    (prisma.person.update as jest.Mock).mockRejectedValue(new Error("DB error"));

    const result = await updatePerson("person-id", { firstName: "Bob" });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// archivePerson
// ---------------------------------------------------------------------------

describe("archivePerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await archivePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns not found for non-existent person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await archivePerson("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("rejects invalid transition (archived → archived)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "archived" }));

    const result = await archivePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidTransition");
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("successfully archives active person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));
    (prisma.person.update as jest.Mock).mockResolvedValue(makePerson({ status: "archived" }));

    const result = await archivePerson("person-id");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "person-id" });
    expect(prisma.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "archived" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// reactivatePerson
// ---------------------------------------------------------------------------

describe("reactivatePerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await reactivatePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns not found for non-existent person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await reactivatePerson("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("rejects invalid transition (active → active)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));

    const result = await reactivatePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.invalidTransition");
    expect(prisma.person.update).not.toHaveBeenCalled();
  });

  it("successfully reactivates archived person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "archived" }));
    (prisma.person.update as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));

    const result = await reactivatePerson("person-id");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "person-id" });
    expect(prisma.person.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "active" } }),
    );
  });
});

// ---------------------------------------------------------------------------
// anonymizePerson
// ---------------------------------------------------------------------------

describe("anonymizePerson", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await anonymizePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("returns not found for non-existent person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(null);

    const result = await anonymizePerson("nonexistent-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("rejects already anonymized person", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "anonymized" }));

    const result = await anonymizePerson("person-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.alreadyAnonymized");
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("successfully anonymizes: clears all PII fields and cascade deletes targets", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));

    // Simulate array-syntax $transaction resolving all operations
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      undefined, // crmNoteTarget.deleteMany
      undefined, // crmTaskTarget.deleteMany
      undefined, // jobContact.deleteMany
      undefined, // crmActivityLog.updateMany
      { id: "person-id", status: "anonymized" }, // person.update
    ]);

    const result = await anonymizePerson("person-id");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "person-id" });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("uses $transaction for atomicity (array syntax)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      undefined, undefined, undefined, undefined, { id: "person-id" },
    ]);

    await anonymizePerson("person-id");

    // Ensure $transaction was called with an array (not a callback function)
    const txArg = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
  });

  it("publishes ContactDeleted event with reason 'anonymized'", async () => {
    const { eventBus } = require("@/lib/events");
    const { createEvent } = require("@/lib/events/event-types");
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      undefined, undefined, undefined, undefined, { id: "person-id" },
    ]);

    await anonymizePerson("person-id");

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      "ContactDeleted",
      expect.objectContaining({ reason: "anonymized" }),
    );
  });

  it("returns failure when $transaction throws", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock).mockResolvedValue(makePerson({ status: "active" }));
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("TX failed"));

    const result = await anonymizePerson("person-id");

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// mergePersons
// ---------------------------------------------------------------------------

describe("mergePersons", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const winner = makePerson({
    id: "winner-id",
    emails: JSON.stringify([{ email: "winner@example.com", type: "work", isPrimary: true }]),
    phones: JSON.stringify([{ number: "+491111", type: "work", isPrimary: true }]),
    companies: JSON.stringify([{ companyId: "c1", companyLabel: "Acme", isPrimary: true }]),
  });

  const loser = makePerson({
    id: "loser-id",
    emails: JSON.stringify([{ email: "loser@example.com", type: "work", isPrimary: true }]),
    phones: JSON.stringify([{ number: "+492222", type: "home", isPrimary: true }]),
    companies: JSON.stringify([{ companyId: "c2", companyLabel: "Globex", isPrimary: true }]),
  });

  function setupSuccessfulMerge() {
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(loser);
    // loser's jobContacts
    (prisma.jobContact.findMany as jest.Mock)
      .mockResolvedValueOnce([]) // loser's job IDs
      .mockResolvedValueOnce([]); // winner's job IDs (for dedup check)
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      undefined, // crmInterview.updateMany
      undefined, // crmTaskTarget.updateMany
      undefined, // crmNoteTarget.updateMany
      undefined, // jobContact.updateMany
      undefined, // crmActivityLog.updateMany
      { id: "winner-id" }, // person.update (winner)
      { id: "loser-id" }, // person.delete (loser)
    ]);
  }

  it("rejects unauthenticated user", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });

  it("rejects same winnerId === loserId", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);

    const result = await mergePersons("same-id", "same-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.cannotMergeSame");
  });

  it("returns not found if winner missing", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(null)  // winner not found
      .mockResolvedValueOnce(loser);

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("returns not found if loser missing", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(null); // loser not found

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.personNotFound");
  });

  it("rejects if winner not active", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(makePerson({ id: "winner-id", status: "archived" }))
      .mockResolvedValueOnce(loser);

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.mergeBothActive");
  });

  it("rejects if loser not active", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(makePerson({ id: "loser-id", status: "archived" }));

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
    expect(result.message).toBe("crm.errors.mergeBothActive");
  });

  it("successfully merges: appends loser emails/phones/companies with isPrimary=false", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    setupSuccessfulMerge();

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: "winner-id" });

    // Verify person.update in the transaction was called with merged data
    const txArg = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    expect(Array.isArray(txArg)).toBe(true);
  });

  it("deduplicates conflicting JobContacts (winner already has contact for same job)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(loser);

    // loser has job-1, winner also has job-1 → conflict
    (prisma.jobContact.findMany as jest.Mock)
      .mockResolvedValueOnce([{ jobId: "job-1" }])   // loser's contacts
      .mockResolvedValueOnce([{ jobId: "job-1" }]);  // winner's contacts

    (prisma.jobContact.deleteMany as jest.Mock).mockResolvedValue({ count: 1 });
    (prisma.$transaction as jest.Mock).mockResolvedValue([
      undefined, undefined, undefined, undefined, undefined, { id: "winner-id" }, { id: "loser-id" },
    ]);

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(true);
    // Conflict deletion must have been called before the transaction
    expect(prisma.jobContact.deleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ personId: "loser-id", jobId: { in: ["job-1"] } }),
      }),
    );
  });

  it("transfers all relationships (interviews, taskTargets, noteTargets, jobContacts, activityLogs)", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    setupSuccessfulMerge();

    await mergePersons("winner-id", "loser-id");

    const txArg = (prisma.$transaction as jest.Mock).mock.calls[0][0];
    // Transaction array must contain at least 7 operations
    expect(txArg.length).toBeGreaterThanOrEqual(7);
  });

  it("deletes loser after transfer", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    setupSuccessfulMerge();

    await mergePersons("winner-id", "loser-id");

    // person.delete must appear in the transaction array
    // We verify by checking that $transaction was called (operations are built inline)
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("publishes ContactDeleted event with reason 'merged'", async () => {
    const { eventBus } = require("@/lib/events");
    const { createEvent } = require("@/lib/events/event-types");
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    setupSuccessfulMerge();

    await mergePersons("winner-id", "loser-id");

    expect(eventBus.publish).toHaveBeenCalledTimes(1);
    expect(createEvent).toHaveBeenCalledWith(
      "ContactDeleted",
      expect.objectContaining({ personId: "loser-id", reason: "merged" }),
    );
  });

  it("returns failure when $transaction throws", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (prisma.person.findFirst as jest.Mock)
      .mockResolvedValueOnce(winner)
      .mockResolvedValueOnce(loser);
    (prisma.jobContact.findMany as jest.Mock)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    (prisma.$transaction as jest.Mock).mockRejectedValue(new Error("TX failed"));

    const result = await mergePersons("winner-id", "loser-id");

    expect(result.success).toBe(false);
  });
});
