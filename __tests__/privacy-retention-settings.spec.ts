/**
 * PrivacySettings retention round-trip + ADR-019 boundary validation.
 *
 * The boundary check is the security-relevant half: the
 * `180 | 365 | 730 | 1095` union is ERASED at runtime, so nothing but an
 * explicit membership check stands between a crafted server-action payload and
 * a retention period of, say, 3_650_000 days — i.e. "retain forever" smuggled
 * in as a configuration, which Art. 5(1)(e) does not permit.
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    userSettings: { findUnique: jest.fn(), upsert: jest.fn() },
    smtpConfig: { findUnique: jest.fn() },
  },
}));
jest.mock("@/utils/user.utils", () => ({ getCurrentUser: jest.fn() }));
jest.mock("@/lib/crm/retention-policy", () => ({ rebaseCrmRetention: jest.fn() }));
jest.mock("@/lib/utils", () => ({
  handleError: jest.fn(() => ({ success: false, message: "errors.generic" })),
}));

import db from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { rebaseCrmRetention } from "@/lib/crm/retention-policy";
import { getPrivacySettings, updatePrivacySettings } from "@/actions/privacy.actions";
import {
  ALLOWED_CRM_RETENTION_DAYS,
  defaultPrivacySettings,
  type PrivacySettings,
} from "@/models/userSettings.model";

const mockDb = db as unknown as {
  userSettings: { findUnique: jest.Mock; upsert: jest.Mock };
};
const mockUser = getCurrentUser as jest.Mock;
const mockRebase = rebaseCrmRetention as jest.Mock;

const valid: PrivacySettings = {
  auditAccountDeletion: true,
  emailConfirmationBeforeDeletion: false,
  coolingOffDays: 7,
  crmRetentionEnabled: true,
  crmRetentionDays: 365,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockUser.mockResolvedValue({ id: "u1", email: "u1@example.test" });
  mockDb.userSettings.findUnique.mockResolvedValue(null);
  mockDb.userSettings.upsert.mockResolvedValue({});
  mockRebase.mockResolvedValue(0);
});

describe("defaults", () => {
  it("ships enforcing: automatic erasure ON at 730 days", () => {
    // Deliberate: turning it off is opting OUT of a safeguard, so the safe
    // value must be the enforcing one (docs/retention-settings-plan.md D2).
    expect(defaultPrivacySettings.crmRetentionEnabled).toBe(true);
    // 730 == CRM_CONFIG.autoCreatedRetentionDays — unchanged declared policy.
    expect(defaultPrivacySettings.crmRetentionDays).toBe(730);
  });

  it("offers no unlimited period — Art. 5(1)(e) does not permit 'never'", () => {
    expect([...ALLOWED_CRM_RETENTION_DAYS]).toEqual([180, 365, 730, 1095]);
    for (const d of ALLOWED_CRM_RETENTION_DAYS) {
      expect(Number.isFinite(d)).toBe(true);
    }
    // Ceiling matches RETENTION_CONFIG.crmActivityLogRetentionDays, so a Person
    // is never retained longer than its own timeline.
    expect(Math.max(...ALLOWED_CRM_RETENTION_DAYS)).toBe(1095);
  });
});

describe("getPrivacySettings", () => {
  it("returns retention defaults when the user has no settings row", async () => {
    const result = await getPrivacySettings();
    expect(result.success).toBe(true);
    expect(result.data?.crmRetentionEnabled).toBe(true);
    expect(result.data?.crmRetentionDays).toBe(730);
  });

  it("back-fills retention defaults for a PRE-EXISTING row without the keys", async () => {
    // Migration-free rollout: an install that saved privacy settings before this
    // feature has no retention keys, and must not read back as undefined.
    mockDb.userSettings.findUnique.mockResolvedValue({
      settings: JSON.stringify({
        privacy: {
          auditAccountDeletion: false,
          emailConfirmationBeforeDeletion: false,
          coolingOffDays: 30,
        },
      }),
    });
    const result = await getPrivacySettings();
    expect(result.data).toMatchObject({
      auditAccountDeletion: false,
      coolingOffDays: 30,
      crmRetentionEnabled: true,
      crmRetentionDays: 730,
    });
  });

  it("round-trips a persisted retention choice", async () => {
    mockDb.userSettings.findUnique.mockResolvedValue({
      settings: JSON.stringify({
        privacy: { ...valid, crmRetentionEnabled: false, crmRetentionDays: 180 },
      }),
    });
    const result = await getPrivacySettings();
    expect(result.data?.crmRetentionEnabled).toBe(false);
    expect(result.data?.crmRetentionDays).toBe(180);
  });
});

describe("updatePrivacySettings — ADR-019 boundary validation", () => {
  it("accepts every allowed period", async () => {
    for (const days of ALLOWED_CRM_RETENTION_DAYS) {
      const result = await updatePrivacySettings({ ...valid, crmRetentionDays: days });
      expect(result.success).toBe(true);
    }
  });

  it.each([
    ["an out-of-range huge value ('forever' smuggled in)", 3_650_000],
    ["a plausible-but-unlisted value", 90],
    ["zero", 0],
    ["a negative period", -1],
    ["a non-integer", 365.5],
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
  ])("rejects %s", async (_label, days) => {
    const result = await updatePrivacySettings({
      ...valid,
      crmRetentionDays: days as PrivacySettings["crmRetentionDays"],
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_ERROR");
    expect(mockDb.userSettings.upsert).not.toHaveBeenCalled();
  });

  it.each([
    ["a string", "true"],
    ["undefined", undefined],
    ["null", null],
  ])("rejects a non-boolean crmRetentionEnabled (%s)", async (_label, value) => {
    const result = await updatePrivacySettings({
      ...valid,
      crmRetentionEnabled: value as unknown as boolean,
    });
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe("VALIDATION_ERROR");
    expect(mockDb.userSettings.upsert).not.toHaveBeenCalled();
  });

  it("requires authentication", async () => {
    mockUser.mockResolvedValue(null);
    const result = await updatePrivacySettings(valid);
    expect(result.success).toBe(false);
    expect(result.message).toBe("errors.notAuthenticated");
  });
});

describe("updatePrivacySettings — persistence + re-base", () => {
  it("persists both retention fields into the UserSettings JSON blob", async () => {
    await updatePrivacySettings({ ...valid, crmRetentionEnabled: false, crmRetentionDays: 1095 });

    const arg = mockDb.userSettings.upsert.mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1" }); // ADR-015
    const persisted = JSON.parse(arg.update.settings);
    expect(persisted.privacy.crmRetentionEnabled).toBe(false);
    expect(persisted.privacy.crmRetentionDays).toBe(1095);
  });

  it("re-bases existing deadlines when the period CHANGES", async () => {
    mockDb.userSettings.findUnique.mockResolvedValue({
      settings: JSON.stringify({ privacy: { ...valid, crmRetentionDays: 730 } }),
    });
    await updatePrivacySettings({ ...valid, crmRetentionDays: 180 });
    expect(mockRebase).toHaveBeenCalledWith("u1", 730, 180);
  });

  it("does NOT re-base when only the enable toggle changes", async () => {
    mockDb.userSettings.findUnique.mockResolvedValue({
      settings: JSON.stringify({ privacy: { ...valid, crmRetentionDays: 365 } }),
    });
    await updatePrivacySettings({ ...valid, crmRetentionEnabled: false });
    expect(mockRebase).not.toHaveBeenCalled();
  });

  it("treats a pre-feature row as the 730-day default when computing the delta", async () => {
    mockDb.userSettings.findUnique.mockResolvedValue({
      settings: JSON.stringify({
        privacy: { auditAccountDeletion: true, emailConfirmationBeforeDeletion: false, coolingOffDays: 0 },
      }),
    });
    await updatePrivacySettings({ ...valid, crmRetentionDays: 180 });
    expect(mockRebase).toHaveBeenCalledWith("u1", 730, 180);
  });
});
