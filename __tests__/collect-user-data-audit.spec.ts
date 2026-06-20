/**
 * Welle 1 (S6b) — Full-data-export Person PII-read GDPR audit trail.
 *
 * `collectUserData(userId)` reads every Person's PII for a GDPR Art. 15/20
 * export. Per specs/audit-trail.allium (AuditPersonPiiRead), it MUST emit one
 * `person.pii_read` entry per returned Person, with targetType "person" and
 * targetId = person.id, and MUST NEVER copy PII (name/email/phone) into the
 * audit payload (DataMinimisation invariant).
 *
 * Strategy: mock @/lib/db so every findMany/findFirst/count resolves; the person
 * query returns two Persons carrying PII. data-audit writer is mocked so we can
 * assert call shapes + recursively scan all call args for PII leakage.
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/audit/data-audit", () => ({
  writeDataAuditLog: jest.fn(),
}));

// db mock — a Proxy that returns a model stub with the three read methods used
// by collectUserData. The person model is overridden below to return PII rows.
jest.mock("@/lib/db", () => {
  const emptyArray = () => jest.fn().mockResolvedValue([]);
  const zero = () => jest.fn().mockResolvedValue(0);
  const nullVal = () => jest.fn().mockResolvedValue(null);

  const makeModel = () => ({
    findMany: emptyArray(),
    findFirst: nullVal(),
    count: zero(),
  });

  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (prop === "__esModule") return true;
      if (prop === "default") return proxy;
      if (!(prop in target)) target[prop] = makeModel();
      return target[prop];
    },
  };
  const proxy: Record<string, unknown> = new Proxy({}, handler);
  return proxy;
});

import { collectUserData } from "@/lib/export/collect-user-data";
import { writeDataAuditLog } from "@/lib/audit/data-audit";
import db from "@/lib/db";

const auditMock = writeDataAuditLog as jest.Mock;

// PII values that must never appear in any audit payload.
const PII_VALUES = [
  "Alice",
  "Anderson",
  "alice@example.com",
  "+1-555-0100",
  "Bob",
  "Brown",
  "bob@example.com",
  "+1-555-0200",
  "123 Main St",
];

const persons = [
  {
    id: "person-1",
    firstName: "Alice",
    lastName: "Anderson",
    headline: "Recruiter",
    emails: JSON.stringify([{ type: "work", value: "alice@example.com" }]),
    phones: JSON.stringify([{ type: "mobile", value: "+1-555-0100" }]),
    companies: JSON.stringify([]),
    socialProfiles: JSON.stringify([]),
    status: "active",
    dataSource: "manual",
    processingBasis: "legitimate_interest",
    retentionExpiresAt: null,
    createdAt: new Date("2026-01-01"),
  },
  {
    id: "person-2",
    firstName: "Bob",
    lastName: "Brown",
    headline: "Hiring Manager",
    emails: JSON.stringify([{ type: "work", value: "bob@example.com" }]),
    phones: JSON.stringify([{ type: "mobile", value: "+1-555-0200" }]),
    companies: JSON.stringify([]),
    socialProfiles: JSON.stringify([]),
    status: "active",
    dataSource: "manual",
    processingBasis: "legitimate_interest",
    retentionExpiresAt: null,
    createdAt: new Date("2026-01-02"),
  },
];

describe("collectUserData → person.pii_read audit (S6b)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Override the person model so its findMany returns the PII rows.
    (db as unknown as { person: { findMany: jest.Mock } }).person.findMany.mockResolvedValue(persons);
  });

  it("emits one person.pii_read audit entry per returned Person with the right shape", async () => {
    await collectUserData("user-id");

    expect(auditMock).toHaveBeenCalledTimes(persons.length);

    for (const p of persons) {
      expect(auditMock).toHaveBeenCalledWith({
        actorId: "user-id",
        action: "person.pii_read",
        targetType: "person",
        targetId: p.id,
      });
    }
  });

  it("never carries a before/after snapshot on a pii_read entry (DataMinimisation)", async () => {
    await collectUserData("user-id");

    for (const call of auditMock.mock.calls) {
      expect(call[0].beforeAfter).toBeUndefined();
    }
  });

  it("never leaks any PII (name/email/phone/address) into any audit payload", async () => {
    await collectUserData("user-id");

    const serialized = auditMock.mock.calls
      .map((call) => JSON.stringify(call[0]))
      .join("\n");

    for (const pii of PII_VALUES) {
      expect(serialized).not.toContain(pii);
    }
  });

  it("emits no audit entries when there are no Persons", async () => {
    (db as unknown as { person: { findMany: jest.Mock } }).person.findMany.mockResolvedValue([]);

    await collectUserData("user-id");

    expect(auditMock).not.toHaveBeenCalled();
  });
});

describe("collectUserData → Inside Track export (Art. 15/20)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (db as unknown as { person: { findMany: jest.Mock } }).person.findMany.mockResolvedValue([]);
  });

  it("includes referrals and personConnections in the export", async () => {
    (db as unknown as { referral: { findMany: jest.Mock } }).referral.findMany.mockResolvedValue([
      { id: "r1", kind: "insider_relay", status: "open" },
    ]);
    (
      db as unknown as { personConnection: { findMany: jest.Mock } }
    ).personConnection.findMany.mockResolvedValue([
      { id: "pc1", fromPersonId: "a", toPersonId: "b", kind: "friend", strength: "close" },
    ]);

    const result = await collectUserData("user-id");

    expect(result.referrals).toHaveLength(1);
    expect(result.referrals[0].id).toBe("r1");
    expect(result.personConnections).toHaveLength(1);
    expect(result.personConnections[0].id).toBe("pc1");
  });

  it("scopes the referral + connection queries to the user (ADR-015)", async () => {
    await collectUserData("user-xyz");
    expect(
      (db as unknown as { referral: { findMany: jest.Mock } }).referral.findMany,
    ).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-xyz" } }));
    expect(
      (db as unknown as { personConnection: { findMany: jest.Mock } }).personConnection.findMany,
    ).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-xyz" } }));
  });
});
