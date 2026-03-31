import {
  matchesBlacklistEntry,
  isCompanyBlacklisted,
} from "@/models/companyBlacklist.model";

describe("CompanyBlacklist Model — matchesBlacklistEntry", () => {
  it("matches exact company name (case-insensitive)", () => {
    expect(
      matchesBlacklistEntry("Acme Corp", { pattern: "Acme Corp", matchType: "exact" }),
    ).toBe(true);
  });

  it("matches exact with different casing", () => {
    expect(
      matchesBlacklistEntry("ACME CORP", { pattern: "acme corp", matchType: "exact" }),
    ).toBe(true);
  });

  it("does not match partial with exact type", () => {
    expect(
      matchesBlacklistEntry("Acme Corporation", { pattern: "Acme Corp", matchType: "exact" }),
    ).toBe(false);
  });

  it("matches substring with contains type", () => {
    expect(
      matchesBlacklistEntry("Acme Corporation", { pattern: "Acme", matchType: "contains" }),
    ).toBe(true);
  });

  it("matches substring case-insensitively", () => {
    expect(
      matchesBlacklistEntry("Global Staffing Solutions", { pattern: "staffing", matchType: "contains" }),
    ).toBe(true);
  });

  it("does not match when substring not found", () => {
    expect(
      matchesBlacklistEntry("Google LLC", { pattern: "Staffing", matchType: "contains" }),
    ).toBe(false);
  });

  it("trims whitespace from both inputs", () => {
    expect(
      matchesBlacklistEntry("  Acme Corp  ", { pattern: "  Acme Corp  ", matchType: "exact" }),
    ).toBe(true);
  });
});

describe("CompanyBlacklist Model — isCompanyBlacklisted", () => {
  const entries = [
    { pattern: "Acme Corp", matchType: "exact" as const },
    { pattern: "Staffing", matchType: "contains" as const },
  ];

  it("returns true for exact match entry", () => {
    expect(isCompanyBlacklisted("Acme Corp", entries)).toBe(true);
  });

  it("returns true for contains match entry", () => {
    expect(isCompanyBlacklisted("Global Staffing Agency", entries)).toBe(true);
  });

  it("returns false for non-matching company", () => {
    expect(isCompanyBlacklisted("Google LLC", entries)).toBe(false);
  });

  it("returns false for null company name", () => {
    expect(isCompanyBlacklisted(null, entries)).toBe(false);
  });

  it("returns false for undefined company name", () => {
    expect(isCompanyBlacklisted(undefined, entries)).toBe(false);
  });

  it("returns false for empty string company name", () => {
    expect(isCompanyBlacklisted("", entries)).toBe(false);
  });

  it("returns false when blacklist is empty", () => {
    expect(isCompanyBlacklisted("Acme Corp", [])).toBe(false);
  });
});
