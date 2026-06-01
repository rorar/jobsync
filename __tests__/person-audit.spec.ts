/**
 * person-audit.spec.ts — Welle 1 S6b: Person-PII read-access GDPR audit trail.
 *
 * Verifies that the Person read entry points that EXPOSE PII (detail view +
 * list-with-PII) fire writeDataAuditLog with action "person.pii_read",
 * targetType "person", the correct person id, and NO before/after snapshot or
 * PII content (DataMinimisation invariant, Art. 5(1)(c)).
 *
 * Spec: specs/audit-trail.allium (rule AuditPersonPiiRead, invariant
 * DataMinimisation).
 */
jest.mock("server-only", () => ({}));

import { getPerson, getPersons } from "@/actions/person.actions";
import { getCurrentUser } from "@/utils/user.utils";
import db from "@/lib/db";
import { writeDataAuditLog } from "@/lib/audit/data-audit";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    person: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/audit/data-audit", () => ({
  writeDataAuditLog: jest.fn(),
}));

jest.mock("@/lib/events", () => ({
  eventBus: { publish: jest.fn() },
}));

jest.mock("@/lib/events/event-types", () => ({
  createEvent: jest.fn((_type: string, payload: unknown) => ({ payload })),
  DomainEventType: {},
}));

const mockDb = db as unknown as {
  person: { findFirst: jest.Mock; findMany: jest.Mock; count: jest.Mock };
};

const mockWrite = writeDataAuditLog as jest.Mock;

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const USER = {
  id: "user-1",
  email: "viewer@example.com",
  name: "Viewer",
};

// A person row WITH realistic PII so we can assert none of it leaks into audit.
const personRow = (id: string) => ({
  id,
  userId: USER.id,
  status: "active",
  firstName: "Alice",
  lastName: "Schmidt",
  headline: "Recruiter",
  emails: JSON.stringify([{ email: "alice.secret@corp.com", isPrimary: true }]),
  phones: JSON.stringify([{ number: "+49 170 1234567", isPrimary: true }]),
  companies: JSON.stringify([{ name: "ACME GmbH" }]),
  socialProfiles: JSON.stringify([{ platform: "linkedin", url: "https://x.test/a" }]),
  addressStreet: "12 Privatstrasse",
  addressCity: "Berlin",
  addressPostalCode: "10115",
});

// Every PII string a leak check must never find inside an audit call.
const PII_STRINGS = [
  "Alice",
  "Schmidt",
  "Recruiter",
  "alice.secret@corp.com",
  "+49 170 1234567",
  "ACME GmbH",
  "Privatstrasse",
  "Berlin",
  "10115",
  "linkedin",
];

/** Recursively flatten any value to a string for PII leak inspection. */
function deepString(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function assertNoPiiInCalls(): void {
  for (const call of mockWrite.mock.calls) {
    const serialized = deepString(call);
    for (const pii of PII_STRINGS) {
      expect(serialized).not.toContain(pii);
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue(USER);
});

// ---------------------------------------------------------------------------
// getPerson — detail read (one entry)
// ---------------------------------------------------------------------------

describe("getPerson — PII read audit (detail view)", () => {
  it("writes exactly one person.pii_read row for the read person", async () => {
    mockDb.person.findFirst.mockResolvedValue(personRow("person-1"));

    const result = await getPerson("person-1");

    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith({
      actorId: USER.id,
      actorEmail: USER.email,
      action: "person.pii_read",
      targetType: "person",
      targetId: "person-1",
    });
  });

  it("passes NO before/after snapshot (DataMinimisation)", async () => {
    mockDb.person.findFirst.mockResolvedValue(personRow("person-1"));

    await getPerson("person-1");

    const arg = mockWrite.mock.calls[0][0];
    expect(arg).not.toHaveProperty("beforeAfter");
  });

  it("never passes any PII string into the audit call", async () => {
    mockDb.person.findFirst.mockResolvedValue(personRow("person-1"));

    await getPerson("person-1");

    assertNoPiiInCalls();
    // sanity: only id, actor, action, targetType keys present
    expect(Object.keys(mockWrite.mock.calls[0][0]).sort()).toEqual(
      ["action", "actorEmail", "actorId", "targetId", "targetType"].sort(),
    );
  });

  it("does NOT audit when the person is not found", async () => {
    mockDb.person.findFirst.mockResolvedValue(null);

    const result = await getPerson("missing");

    expect(result.success).toBe(false);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("does NOT audit when the user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    await getPerson("person-1");

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDb.person.findFirst).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getPersons — list-with-PII read (one entry per person returned)
// ---------------------------------------------------------------------------

describe("getPersons — PII read audit (list-with-PII)", () => {
  it("writes one person.pii_read row per person returned", async () => {
    const rows = [personRow("p-a"), personRow("p-b"), personRow("p-c")];
    mockDb.person.findMany.mockResolvedValue(rows);
    mockDb.person.count.mockResolvedValue(3);

    const result = await getPersons();

    expect(result.success).toBe(true);
    expect(mockWrite).toHaveBeenCalledTimes(3);
    const targetIds = mockWrite.mock.calls.map((c) => c[0].targetId).sort();
    expect(targetIds).toEqual(["p-a", "p-b", "p-c"]);
    for (const call of mockWrite.mock.calls) {
      expect(call[0]).toMatchObject({
        actorId: USER.id,
        actorEmail: USER.email,
        action: "person.pii_read",
        targetType: "person",
      });
    }
  });

  it("passes NO before/after snapshot and NO PII for any list entry", async () => {
    mockDb.person.findMany.mockResolvedValue([personRow("p-a"), personRow("p-b")]);
    mockDb.person.count.mockResolvedValue(2);

    await getPersons();

    for (const call of mockWrite.mock.calls) {
      expect(call[0]).not.toHaveProperty("beforeAfter");
    }
    assertNoPiiInCalls();
  });

  it("writes no audit rows for an empty result set", async () => {
    mockDb.person.findMany.mockResolvedValue([]);
    mockDb.person.count.mockResolvedValue(0);

    const result = await getPersons();

    expect(result.success).toBe(true);
    expect(mockWrite).not.toHaveBeenCalled();
  });

  it("does NOT audit when the user is not authenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    await getPersons();

    expect(mockWrite).not.toHaveBeenCalled();
    expect(mockDb.person.findMany).not.toHaveBeenCalled();
  });
});
