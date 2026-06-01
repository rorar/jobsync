/**
 * profile-preferences.actions.spec.ts — Welle 2 (ADR-034)
 *
 * Tests getProfilePreferences + updateProfilePreferences:
 *   - auth gate (ADR-019)
 *   - ADR-015 userId scoping (findFirst by userId; update by profile id)
 *   - lazy-Profile: update if exists, else create
 *   - boundary validation: country /^[A-Z]{2}$/, currency via CUR module,
 *     subdivision forced null when no country, case normalization
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    profile: {
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("next/cache", () => ({
  revalidatePath: jest.fn(),
}));

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import {
  getProfilePreferences,
  updateProfilePreferences,
} from "@/actions/profile.actions";

const USER = { id: "user-1" };

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue(USER);
});

// ---------------------------------------------------------------------------
// getProfilePreferences
// ---------------------------------------------------------------------------

describe("getProfilePreferences", () => {
  it("returns null when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect(await getProfilePreferences()).toBeNull();
    expect(prisma.profile.findFirst).not.toHaveBeenCalled();
  });

  it("returns all-null when the user has no Profile row yet", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue(null);
    expect(await getProfilePreferences()).toEqual({
      addressCountryCode: null,
      addressSubdivisionCode: null,
      preferredCurrency: null,
    });
  });

  it("scopes the read by userId and returns the stored preferences", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue({
      addressCountryCode: "DE",
      addressSubdivisionCode: "BY",
      preferredCurrency: "EUR",
    });
    const result = await getProfilePreferences();
    expect(prisma.profile.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-1" } }),
    );
    expect(result).toEqual({
      addressCountryCode: "DE",
      addressSubdivisionCode: "BY",
      preferredCurrency: "EUR",
    });
  });
});

// ---------------------------------------------------------------------------
// updateProfilePreferences
// ---------------------------------------------------------------------------

describe("updateProfilePreferences", () => {
  it("rejects an unauthenticated caller without writing", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    const res = await updateProfilePreferences({
      addressCountryCode: "DE",
      addressSubdivisionCode: "BY",
      preferredCurrency: "EUR",
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("UNAUTHORIZED");
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  it("updates the existing Profile (scoped by its id) with normalized codes", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue({ id: "profile-1" });
    const res = await updateProfilePreferences({
      addressCountryCode: "de",
      addressSubdivisionCode: "by",
      preferredCurrency: "eur",
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        addressCountryCode: "DE",
        addressSubdivisionCode: "BY",
        preferredCurrency: "EUR",
      },
    });
    expect(res.data).toEqual({
      addressCountryCode: "DE",
      addressSubdivisionCode: "BY",
      preferredCurrency: "EUR",
    });
  });

  it("creates a Profile (lazy-creation) when none exists, scoped by userId", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue(null);
    const res = await updateProfilePreferences({
      addressCountryCode: "FR",
      addressSubdivisionCode: null,
      preferredCurrency: "EUR",
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.create).toHaveBeenCalledWith({
      data: {
        userId: "user-1",
        addressCountryCode: "FR",
        addressSubdivisionCode: null,
        preferredCurrency: "EUR",
      },
    });
  });

  it("forces subdivision to null when no country is given", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue({ id: "profile-1" });
    const res = await updateProfilePreferences({
      addressCountryCode: null,
      addressSubdivisionCode: "BY", // orphaned region — must be dropped
      preferredCurrency: null,
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.update).toHaveBeenCalledWith({
      where: { id: "profile-1" },
      data: {
        addressCountryCode: null,
        addressSubdivisionCode: null,
        preferredCurrency: null,
      },
    });
  });

  it("accepts an all-null input (clears all three fields)", async () => {
    (prisma.profile.findFirst as jest.Mock).mockResolvedValue({ id: "profile-1" });
    const res = await updateProfilePreferences({
      addressCountryCode: null,
      addressSubdivisionCode: null,
      preferredCurrency: null,
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.update).toHaveBeenCalled();
  });

  it("rejects a malformed country code without writing", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: "X",
      addressSubdivisionCode: null,
      preferredCurrency: null,
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("VALIDATION_ERROR");
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown currency code without writing", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: "DE",
      addressSubdivisionCode: null,
      preferredCurrency: "XYZ",
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("VALIDATION_ERROR");
    expect(prisma.profile.update).not.toHaveBeenCalled();
    expect(prisma.profile.create).not.toHaveBeenCalled();
  });
});
