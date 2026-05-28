/**
 * weekend-service.spec.ts — Weekend Detection Tests
 *
 * Tests getWeekendDays and isWeekend from the Holiday module's weekend.ts.
 * Verifies CLDR-based weekend detection per country, case-insensitivity,
 * and the default fallback (Sat+Sun) for unknown countries.
 */

import {
  getWeekendDays,
  isWeekend,
} from "@/lib/connector/reference-data/modules/public-holidays/weekend";

// ---------------------------------------------------------------------------
// getWeekendDays
// ---------------------------------------------------------------------------

describe("getWeekendDays", () => {
  it("returns [6, 7] (Saturday + Sunday) for Germany in ISO 8601", () => {
    const days = getWeekendDays("DE");
    expect(days).toContain(6); // Saturday (ISO)
    expect(days).toContain(7); // Sunday (ISO)
    expect(days).toHaveLength(2);
  });

  it("returns [6, 7] (Saturday + Sunday) for the United States in ISO 8601", () => {
    const days = getWeekendDays("US");
    expect(days).toContain(6);
    expect(days).toContain(7);
    expect(days).toHaveLength(2);
  });

  it("returns [6, 7] for France", () => {
    const days = getWeekendDays("FR");
    expect(days).toContain(6);
    expect(days).toContain(7);
    expect(days).toHaveLength(2);
  });

  it("returns [6, 7] for Austria", () => {
    const days = getWeekendDays("AT");
    expect(days).toContain(6);
    expect(days).toContain(7);
    expect(days).toHaveLength(2);
  });

  it("is case-insensitive — lowercase 'de' equals uppercase 'DE'", () => {
    const lower = getWeekendDays("de");
    const upper = getWeekendDays("DE");
    expect(lower).toEqual(upper);
  });

  it("defaults to [6, 7] (Sat + Sun) for an unknown country code (XX)", () => {
    const days = getWeekendDays("XX");
    // Falls back to CLDR "001" (World default = Sat+Sun)
    expect(days).toContain(6);
    expect(days).toContain(7);
  });

  it("returns a number[] array (not a Set)", () => {
    const days = getWeekendDays("DE");
    expect(Array.isArray(days)).toBe(true);
    expect(days).not.toBeInstanceOf(Set);
  });

  it("does NOT contain JS day 0 (old Sunday format)", () => {
    const days = getWeekendDays("DE");
    expect(days).not.toContain(0); // JS Sunday was 0, ISO Sunday is 7
  });

  it("is idempotent — calling twice returns equivalent results", () => {
    const first = getWeekendDays("DE");
    const second = getWeekendDays("DE");
    expect(first).toEqual(second);
  });
});

// ---------------------------------------------------------------------------
// isWeekend
// ---------------------------------------------------------------------------

describe("isWeekend", () => {
  it("Saturday (day 6) is a weekend day in Germany", () => {
    // 2026-01-03 is a Saturday
    const saturday = new Date(2026, 0, 3);
    expect(isWeekend(saturday, "DE")).toBe(true);
  });

  it("Sunday (day 0) is a weekend day in Germany", () => {
    // 2026-01-04 is a Sunday
    const sunday = new Date(2026, 0, 4);
    expect(isWeekend(sunday, "DE")).toBe(true);
  });

  it("Monday (day 1) is NOT a weekend day in Germany", () => {
    // 2026-01-05 is a Monday
    const monday = new Date(2026, 0, 5);
    expect(isWeekend(monday, "DE")).toBe(false);
  });

  it("Wednesday (day 3) is NOT a weekend day in Germany", () => {
    // 2026-01-07 is a Wednesday
    const wednesday = new Date(2026, 0, 7);
    expect(isWeekend(wednesday, "DE")).toBe(false);
  });

  it("Friday (day 5) is NOT a weekend day in Germany", () => {
    // 2026-01-09 is a Friday
    const friday = new Date(2026, 0, 9);
    expect(isWeekend(friday, "DE")).toBe(false);
  });

  it("is case-insensitive — 'de' behaves the same as 'DE'", () => {
    const saturday = new Date(2026, 0, 3);
    expect(isWeekend(saturday, "de")).toBe(isWeekend(saturday, "DE"));
  });
});
