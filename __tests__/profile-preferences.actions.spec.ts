/**
 * profile-preferences.actions.spec.ts — Welle 2 (ADR-034)
 *
 * Tests getProfilePreferences + updateProfilePreferences:
 *   - auth gate (ADR-019)
 *   - ADR-015 userId scoping (findFirst read; atomic upsert by unique userId)
 *   - lazy-Profile: single upsert (Arch H2 — Profile.userId @unique)
 *   - boundary validation: country /^[A-Z]{2}$/, currency via CUR module,
 *     subdivision forced null when no country, case normalization
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    profile: {
      findFirst: jest.fn(),
      upsert: jest.fn().mockResolvedValue({}),
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
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });

  it("upserts atomically scoped by the unique userId with normalized codes (Arch H2)", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: "de",
      addressSubdivisionCode: "by",
      preferredCurrency: "eur",
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      update: {
        addressCountryCode: "DE",
        addressSubdivisionCode: "BY",
        preferredCurrency: "EUR",
      },
      create: {
        userId: "user-1",
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

  it("forces subdivision to null when no country is given", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: null,
      addressSubdivisionCode: "BY", // orphaned region — must be dropped
      preferredCurrency: null,
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-1" },
        update: {
          addressCountryCode: null,
          addressSubdivisionCode: null,
          preferredCurrency: null,
        },
      }),
    );
  });

  it("accepts an all-null input (clears all three fields)", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: null,
      addressSubdivisionCode: null,
      preferredCurrency: null,
    });
    expect(res.success).toBe(true);
    expect(prisma.profile.upsert).toHaveBeenCalled();
  });

  it("rejects a malformed country code without writing", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: "X",
      addressSubdivisionCode: null,
      preferredCurrency: null,
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("VALIDATION_ERROR");
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });

  it("rejects an unknown currency code without writing", async () => {
    const res = await updateProfilePreferences({
      addressCountryCode: "DE",
      addressSubdivisionCode: null,
      preferredCurrency: "XYZ",
    });
    expect(res.success).toBe(false);
    expect(res.errorCode).toBe("VALIDATION_ERROR");
    expect(prisma.profile.upsert).not.toHaveBeenCalled();
  });
});
