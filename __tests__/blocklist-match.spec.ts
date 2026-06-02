/**
 * blocklist-match.spec.ts — Welle 3 Phase 4 (Gap-6), Task 4.1
 *
 * Pure CrmBlocklist matcher: exact, domain-suffix, and ReDoS-safe glob patterns.
 */

jest.mock("server-only", () => ({}));

import {
  extractEmailDomain,
  matchGlobPattern,
  isBlockedByEntries,
} from "@/lib/crm/blocklist-match";

describe("extractEmailDomain", () => {
  it("returns the lower-cased domain of an email", () => {
    expect(extractEmailDomain("Jane@Acme.com")).toBe("acme.com");
    expect(extractEmailDomain("x@eu.acme.com")).toBe("eu.acme.com");
  });
  it("returns null for non-emails", () => {
    expect(extractEmailDomain("not-an-email")).toBeNull();
    expect(extractEmailDomain("trailing@")).toBeNull();
  });
});

describe("matchGlobPattern (ReDoS-safe)", () => {
  it("matches literal (no wildcard) exactly", () => {
    expect(matchGlobPattern("acme.com", "acme.com")).toBe(true);
    expect(matchGlobPattern("acme.com", "acme.org")).toBe(false);
  });
  it("matches prefix / suffix / middle wildcards", () => {
    expect(matchGlobPattern("recruiter*", "recruiter@acme.com")).toBe(true);
    expect(matchGlobPattern("*@acme.com", "jane@acme.com")).toBe(true);
    expect(matchGlobPattern("*@*.acme.com", "x@eu.acme.com")).toBe(true);
    expect(matchGlobPattern("no*reply", "no-spam-reply")).toBe(true);
  });
  it("rejects non-matches", () => {
    expect(matchGlobPattern("*@acme.com", "jane@globex.com")).toBe(false);
    expect(matchGlobPattern("recruiter*", "the-recruiter")).toBe(false);
  });
  it("is case-insensitive", () => {
    expect(matchGlobPattern("*@ACME.com", "Jane@acme.COM")).toBe(true);
  });
  it("returns quickly on a pathological input (no catastrophic backtracking)", () => {
    const pattern = "*".repeat(50) + "x";
    const value = "a".repeat(50_000); // no trailing x → no match
    const start = Date.now();
    expect(matchGlobPattern(pattern, value)).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("isBlockedByEntries", () => {
  const entries = [
    { type: "email", handle: "spam@acme.com" },
    { type: "phone", handle: "+15550001111" },
    { type: "domain", handle: "blocked.com" },
    { type: "pattern", handle: "noreply*@*" },
  ];

  it("matches exact email + phone", () => {
    expect(isBlockedByEntries("spam@acme.com", entries)).toBe(true);
    expect(isBlockedByEntries("+15550001111", entries)).toBe(true);
  });
  it("matches a domain entry against an email + its subdomains", () => {
    expect(isBlockedByEntries("x@blocked.com", entries)).toBe(true);
    expect(isBlockedByEntries("y@eu.blocked.com", entries)).toBe(true);
    expect(isBlockedByEntries("blocked.com", entries)).toBe(true); // bare domain handle
  });
  it("matches a glob pattern entry", () => {
    expect(isBlockedByEntries("noreply123@anything.io", entries)).toBe(true);
  });
  it("passes non-matching handles", () => {
    expect(isBlockedByEntries("jane@globex.com", entries)).toBe(false);
    expect(isBlockedByEntries("", entries)).toBe(false);
  });
  it("normalises case on the input handle", () => {
    expect(isBlockedByEntries("SPAM@ACME.com", entries)).toBe(true);
    expect(isBlockedByEntries("Z@Blocked.com", entries)).toBe(true);
  });
});
