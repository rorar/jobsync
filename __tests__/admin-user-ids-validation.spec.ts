/**
 * G26b — ADMIN_USER_IDS startup validation.
 *
 * `assertAdminUserIdsValid()` fails fast when ADMIN_USER_IDS is SET but yields
 * zero usable IDs (only commas/whitespace), which would otherwise silently fall
 * through to the single-user (Tier B) / fail-closed (Tier C) admin tiers and
 * mask an operator misconfiguration. Unset/empty is valid (intentional Tier B/C).
 */

jest.mock("server-only", () => ({}));
jest.mock("@/lib/db", () => ({ __esModule: true, default: {} }));

import { assertAdminUserIdsValid } from "@/lib/auth/admin";

describe("assertAdminUserIdsValid (G26b)", () => {
  const ORIGINAL = process.env.ADMIN_USER_IDS;

  afterEach(() => {
    if (ORIGINAL === undefined) delete process.env.ADMIN_USER_IDS;
    else process.env.ADMIN_USER_IDS = ORIGINAL;
  });

  it("passes when unset (Tier B/C)", () => {
    delete process.env.ADMIN_USER_IDS;
    expect(() => assertAdminUserIdsValid()).not.toThrow();
  });

  it("passes when empty string (treated as unset)", () => {
    process.env.ADMIN_USER_IDS = "";
    expect(() => assertAdminUserIdsValid()).not.toThrow();
  });

  it("passes with a single id", () => {
    process.env.ADMIN_USER_IDS = "user-1";
    expect(() => assertAdminUserIdsValid()).not.toThrow();
  });

  it("passes with multiple ids and surrounding whitespace", () => {
    process.env.ADMIN_USER_IDS = " user-1 , user-2 ";
    expect(() => assertAdminUserIdsValid()).not.toThrow();
  });

  it("throws when set to only commas/whitespace", () => {
    process.env.ADMIN_USER_IDS = ",, ,";
    expect(() => assertAdminUserIdsValid()).toThrow(/no valid user IDs/);
  });

  it("throws when set to only whitespace", () => {
    process.env.ADMIN_USER_IDS = "   ";
    expect(() => assertAdminUserIdsValid()).toThrow(/no valid user IDs/);
  });
});
