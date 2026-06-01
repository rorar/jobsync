/**
 * bonus.spec.ts — Welle 2 Phase 3, Task 3.4
 *
 * The flexible Job bonus value object (JSON-backed). Mirrors the
 * compensation.allium invariants:
 *   - fixed      → requires amount
 *   - percentage → requires percentage
 *   - mixed      → requires amount AND percentage
 */

import {
  parseBonus,
  serializeBonus,
  isValidBonus,
  formatBonus,
  type JobBonus,
} from "@/lib/salary/bonus";

describe("isValidBonus", () => {
  it("accepts a fixed bonus with an amount", () => {
    expect(isValidBonus({ kind: "fixed", amount: 5000 })).toBe(true);
  });
  it("rejects a fixed bonus without an amount", () => {
    expect(isValidBonus({ kind: "fixed", amount: null })).toBe(false);
  });
  it("accepts a percentage bonus with a percentage", () => {
    expect(isValidBonus({ kind: "percentage", percentage: 30 })).toBe(true);
  });
  it("rejects a percentage bonus without a percentage", () => {
    expect(isValidBonus({ kind: "percentage" })).toBe(false);
  });
  it("accepts a mixed bonus with both", () => {
    expect(isValidBonus({ kind: "mixed", amount: 5000, percentage: 30 })).toBe(true);
  });
  it("rejects a mixed bonus missing one part", () => {
    expect(isValidBonus({ kind: "mixed", amount: 5000 })).toBe(false);
  });
  it("rejects an unknown kind", () => {
    expect(isValidBonus({ kind: "bogus" as never, amount: 1 })).toBe(false);
  });
});

describe("parseBonus / serializeBonus", () => {
  it("round-trips a valid bonus", () => {
    const b: JobBonus = { kind: "mixed", amount: 5000, percentage: 30, condition: "after goal" };
    const json = serializeBonus(b);
    expect(json).not.toBeNull();
    expect(parseBonus(json)).toEqual(b);
  });
  it("returns null for null / empty / invalid JSON", () => {
    expect(parseBonus(null)).toBeNull();
    expect(parseBonus("")).toBeNull();
    expect(parseBonus("not json")).toBeNull();
  });
  it("returns null for structurally invalid bonus (fixed without amount)", () => {
    expect(parseBonus(JSON.stringify({ kind: "fixed" }))).toBeNull();
  });
  it("serializeBonus returns null for an invalid bonus (no silent bad write)", () => {
    expect(serializeBonus({ kind: "percentage" } as JobBonus)).toBeNull();
  });
  it("drops unknown extra keys on parse", () => {
    const parsed = parseBonus(JSON.stringify({ kind: "fixed", amount: 100, evil: "x" }));
    expect(parsed).toEqual({ kind: "fixed", amount: 100 });
  });
});

describe("formatBonus", () => {
  it("formats a fixed bonus with the currency", () => {
    expect(formatBonus({ kind: "fixed", amount: 5000 }, "EUR", "en")).toBe("€5,000");
  });
  it("formats a percentage bonus", () => {
    expect(formatBonus({ kind: "percentage", percentage: 30 }, "EUR", "en")).toBe("30%");
  });
  it("formats a mixed bonus", () => {
    expect(formatBonus({ kind: "mixed", amount: 5000, percentage: 30 }, "USD", "en")).toBe("$5,000 + 30%");
  });
  it("appends the condition in parentheses", () => {
    expect(formatBonus({ kind: "percentage", percentage: 30, condition: "after reaching goal" }, "EUR", "en"))
      .toBe("30% (after reaching goal)");
  });
  it("returns '' for an invalid/empty bonus", () => {
    expect(formatBonus(null, "EUR", "en")).toBe("");
    expect(formatBonus({ kind: "fixed" } as JobBonus, "EUR", "en")).toBe("");
  });
});
