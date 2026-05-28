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

// ---------------------------------------------------------------------------
// W-1: Intl.Locale.getWeekInfo() as primary source
// ---------------------------------------------------------------------------

describe("W-1: Intl.Locale.getWeekInfo() as primary source", () => {
  // -----------------------------------------------------------------------
  // W-1.1: Intl primary verification
  // On Node.js 22+, getWeekendDays should use Intl.Locale.getWeekInfo()
  // as the primary source. We verify by spying on the Intl.Locale prototype.
  // -----------------------------------------------------------------------
  it("W-1.1: uses Intl.Locale.getWeekInfo() as primary source on Node 22+", () => {
    // getWeekInfo exists on Node.js 21+. If it's available,
    // the implementation should call it rather than falling back to CLDR.
    const getWeekInfoSpy = jest.spyOn(
      Intl.Locale.prototype,
      "getWeekInfo" as keyof Intl.Locale,
    );

    // Clear module-level caches to force a fresh lookup
    // (This will fail if clearWeekendCaches is not exported — TDD RED)
    const weekendModule = require("@/lib/connector/reference-data/modules/public-holidays/weekend");
    if (typeof weekendModule.clearWeekendCaches === "function") {
      weekendModule.clearWeekendCaches();
    }

    // Call with a fresh country code not previously cached
    getWeekendDays("FI");

    // The implementation should have used Intl.Locale.getWeekInfo()
    // This will FAIL because the current code only uses CLDR, never Intl
    expect(getWeekInfoSpy).toHaveBeenCalled();

    getWeekInfoSpy.mockRestore();
  });

  // -----------------------------------------------------------------------
  // W-1.2: Non-standard weekends via Intl
  // Countries with non-Sat/Sun weekends must return correct ISO days.
  // -----------------------------------------------------------------------
  it("W-1.2a: Iran (IR) returns [5] — Friday-only weekend", () => {
    const days = getWeekendDays("IR");
    expect(days).toEqual([5]);
  });

  it("W-1.2b: Saudi Arabia (SA) returns [5, 6] — Friday+Saturday weekend", () => {
    const days = getWeekendDays("SA");
    expect(days).toEqual([5, 6]);
  });

  it("W-1.2c: Afghanistan (AF) returns [4, 5] — Thursday+Friday weekend", () => {
    const days = getWeekendDays("AF");
    expect(days).toEqual([4, 5]);
  });

  // -----------------------------------------------------------------------
  // W-1.3: CLDR fallback when getWeekInfo is unavailable
  // When Intl.Locale.prototype.getWeekInfo is absent, getWeekendDays
  // should still work via the CLDR fallback path.
  // This test will PASS because the current code ONLY uses CLDR.
  // Included for completeness to ensure fallback survives refactoring.
  // -----------------------------------------------------------------------
  it("W-1.3: falls back to CLDR when getWeekInfo is unavailable", () => {
    // Save and remove getWeekInfo
    const original = Intl.Locale.prototype.getWeekInfo;
    (Intl.Locale.prototype as any).getWeekInfo = undefined;

    try {
      // Need fresh lookup — clear caches if possible
      const weekendModule = require("@/lib/connector/reference-data/modules/public-holidays/weekend");
      if (typeof weekendModule.clearWeekendCaches === "function") {
        weekendModule.clearWeekendCaches();
      }

      // Should still return correct result via CLDR
      const days = getWeekendDays("DE");
      expect(days).toContain(6);
      expect(days).toContain(7);
      expect(days).toHaveLength(2);
    } finally {
      // Restore
      Intl.Locale.prototype.getWeekInfo = original;
    }
  });

  // -----------------------------------------------------------------------
  // W-1 isWeekend integration with non-standard countries
  // -----------------------------------------------------------------------
  it("W-1.4: isWeekend returns true for Friday in Iran", () => {
    // 2026-01-09 is a Friday
    const friday = new Date(2026, 0, 9);
    expect(isWeekend(friday, "IR")).toBe(true);
  });

  it("W-1.5: isWeekend returns false for Saturday in Iran", () => {
    // 2026-01-03 is a Saturday — NOT a weekend in Iran
    const saturday = new Date(2026, 0, 3);
    expect(isWeekend(saturday, "IR")).toBe(false);
  });

  it("W-1.6: isWeekend returns true for Thursday in Afghanistan", () => {
    // 2026-01-08 is a Thursday
    const thursday = new Date(2026, 0, 8);
    expect(isWeekend(thursday, "AF")).toBe(true);
  });
});
