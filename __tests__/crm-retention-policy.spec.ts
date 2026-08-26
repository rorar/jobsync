/**
 * CRM retention policy — the user-configurable half of
 * specs/crm.allium rule ExpireAutoCreatedPersons.
 *
 * Covers:
 *  - the pure deadline arithmetic
 *  - policy resolution from PrivacySettings (incl. the defaults path)
 *  - the last-activity clock (touchPersonRetention)
 *  - the delta re-base (rebaseCrmRetention) and its idempotency —
 *    the regression that matters most: re-basing must NOT walk the clock
 *    forward each time the settings page is saved.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    person: { findMany: jest.fn(), updateMany: jest.fn() },
  },
}));
jest.mock("@/lib/account/privacy-helpers", () => ({
  getPrivacySettingsForUser: jest.fn(),
}));
jest.mock("@/lib/debug", () => ({ debugLog: jest.fn(), debugError: jest.fn() }));

import db from "@/lib/db";
import { getPrivacySettingsForUser } from "@/lib/account/privacy-helpers";
import {
  getCrmRetentionPolicy,
  retentionDeadline,
  computeRetentionExpiry,
  touchPersonRetention,
  rebaseCrmRetention,
} from "@/lib/crm/retention-policy";
import { defaultPrivacySettings } from "@/models/userSettings.model";

const mockDb = db as unknown as {
  person: { findMany: jest.Mock; updateMany: jest.Mock };
};
const mockPrivacy = getPrivacySettingsForUser as jest.Mock;

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  mockPrivacy.mockResolvedValue(defaultPrivacySettings);
  mockDb.person.updateMany.mockResolvedValue({ count: 1 });
  mockDb.person.findMany.mockResolvedValue([]);
});

describe("retentionDeadline", () => {
  it("adds whole days", () => {
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(retentionDeadline(from, 730).toISOString()).toBe(
      new Date(from.getTime() + 730 * DAY).toISOString(),
    );
  });
});

describe("getCrmRetentionPolicy", () => {
  it("defaults to enabled at 730 days — today's declared policy, unchanged", async () => {
    expect(await getCrmRetentionPolicy("u1")).toEqual({ enabled: true, days: 730 });
  });

  it("reflects a user who disabled automatic erasure", async () => {
    mockPrivacy.mockResolvedValue({
      ...defaultPrivacySettings,
      crmRetentionEnabled: false,
      crmRetentionDays: 180,
    });
    // Disabled still reports the DECLARED period — "off" is not "forever".
    expect(await getCrmRetentionPolicy("u1")).toEqual({ enabled: false, days: 180 });
  });
});

describe("computeRetentionExpiry", () => {
  it("returns a deadline even when erasure is disabled (policy stays declared)", async () => {
    mockPrivacy.mockResolvedValue({
      ...defaultPrivacySettings,
      crmRetentionEnabled: false,
      crmRetentionDays: 365,
    });
    const from = new Date("2026-01-01T00:00:00.000Z");
    const out = await computeRetentionExpiry("u1", from);
    expect(out.getTime()).toBe(from.getTime() + 365 * DAY);
  });
});

describe("touchPersonRetention", () => {
  it("re-bases the deadline to now + period, scoped to auto_created + userId", async () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    await touchPersonRetention("u1", "p1", now);

    expect(mockDb.person.updateMany).toHaveBeenCalledTimes(1);
    const arg = mockDb.person.updateMany.mock.calls[0][0];
    // ADR-015: userId in the where.
    expect(arg.where).toEqual({ id: "p1", userId: "u1", dataSource: "auto_created" });
    expect(arg.data.retentionExpiresAt.getTime()).toBe(now.getTime() + 730 * DAY);
  });

  it("never throws when the write fails — a clock failure must not fail the edit", async () => {
    mockDb.person.updateMany.mockRejectedValue(new Error("db down"));
    await expect(touchPersonRetention("u1", "p1")).resolves.toBeUndefined();
  });
});

describe("rebaseCrmRetention", () => {
  it("no-ops when the period did not change", async () => {
    expect(await rebaseCrmRetention("u1", 730, 730)).toBe(0);
    expect(mockDb.person.findMany).not.toHaveBeenCalled();
  });

  it("shifts stored deadlines by the delta when the period is shortened", async () => {
    const deadline = new Date("2028-01-01T00:00:00.000Z");
    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", updatedAt: new Date("2026-01-01T00:00:00.000Z"), retentionExpiresAt: deadline },
    ]);

    const count = await rebaseCrmRetention("u1", 730, 180);

    expect(count).toBe(1);
    const arg = mockDb.person.updateMany.mock.calls[0][0];
    expect(arg.where).toEqual({ id: "p1", userId: "u1" });
    expect(arg.data.retentionExpiresAt.getTime()).toBe(
      deadline.getTime() - (730 - 180) * DAY,
    );
  });

  it("REGRESSION: repeated saves do not walk the clock forward", async () => {
    // Recomputing from Person.updatedAt would drift, because the re-base write
    // itself bumps updatedAt — fiddling with the setting would EXTEND retention.
    // The delta form is exact, so 730 -> 365 -> 730 must land back where it began.
    const original = new Date("2028-01-01T00:00:00.000Z");

    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", updatedAt: new Date("2027-12-31T00:00:00.000Z"), retentionExpiresAt: original },
    ]);
    await rebaseCrmRetention("u1", 730, 365);
    const afterFirst = mockDb.person.updateMany.mock.calls[0][0].data.retentionExpiresAt;

    mockDb.person.findMany.mockResolvedValue([
      // updatedAt has moved (the write above bumped it) — must not matter.
      { id: "p1", updatedAt: new Date("2029-06-01T00:00:00.000Z"), retentionExpiresAt: afterFirst },
    ]);
    await rebaseCrmRetention("u1", 365, 730);
    const afterSecond = mockDb.person.updateMany.mock.calls[1][0].data.retentionExpiresAt;

    expect(afterSecond.getTime()).toBe(original.getTime());
  });

  it("excludes already-anonymized tombstones from the re-base", async () => {
    mockDb.person.findMany.mockResolvedValue([]);
    await rebaseCrmRetention("u1", 730, 365);
    expect(mockDb.person.findMany.mock.calls[0][0].where).toEqual({
      userId: "u1",
      dataSource: "auto_created",
      status: { not: "anonymized" },
    });
  });

  it("seeds from updatedAt when a row has no stored deadline (defensive fallback)", async () => {
    const updatedAt = new Date("2026-03-01T00:00:00.000Z");
    mockDb.person.findMany.mockResolvedValue([
      { id: "p1", updatedAt, retentionExpiresAt: null },
    ]);
    await rebaseCrmRetention("u1", 730, 365);
    expect(
      mockDb.person.updateMany.mock.calls[0][0].data.retentionExpiresAt.getTime(),
    ).toBe(updatedAt.getTime() + 365 * DAY);
  });

  it("never throws — the settings save has already succeeded by then", async () => {
    mockDb.person.findMany.mockRejectedValue(new Error("db down"));
    await expect(rebaseCrmRetention("u1", 730, 365)).resolves.toBe(0);
  });
});
