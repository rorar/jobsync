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
  // getWeekendDays should consult the runtime's own locale data rather than
  // going straight to the bundled CLDR table. TC39 moved this proposal from a
  // `weekInfo` getter to a `getWeekInfo()` method and both shapes ship in the
  // wild — V8 12.4 (Node 22.23) has the getter, newer V8 has the method — so
  // spy on whichever this runtime provides. Pinning the test to one shape made
  // it fail on a runtime the implementation handles correctly, which is exactly
  // what the NixOS → Ubuntu 26 host move produced.
  // -----------------------------------------------------------------------
  it("W-1.1: uses the runtime's Intl.Locale week info as the primary source", () => {
    const proto = Intl.Locale.prototype as any;
    const hasMethod = typeof proto.getWeekInfo === "function";
    const hasGetter =
      !hasMethod &&
      typeof Object.getOwnPropertyDescriptor(proto, "weekInfo")?.get === "function";

    const weekendModule = require("@/lib/connector/reference-data/modules/public-holidays/weekend");

    // No runtime week info at all: the implementation is required to fall back,
    // and W-1.3 is the test that covers that path.
    if (!hasMethod && !hasGetter) {
      weekendModule.clearWeekendCaches();
      expect(getWeekendDays("FI")).toEqual([6, 7]);
      return;
    }

    const spy = hasMethod
      ? jest.spyOn(proto, "getWeekInfo")
      : jest.spyOn(proto, "weekInfo", "get");

    try {
      // Clear module-level caches to force a fresh lookup
      weekendModule.clearWeekendCaches();

      // Call with a fresh country code not previously cached
      getWeekendDays("FI");

      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
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
  // W-1.3: CLDR fallback when the runtime exposes no week info at all.
  // Both shapes have to go, or this stops testing the fallback the moment the
  // implementation learns to read the other one. `weekInfo` is an accessor, so
  // assigning `undefined` to it does not hide it — deleting the property and
  // restoring its descriptor is the only correct way in and back out.
  // -----------------------------------------------------------------------
  it("W-1.3: falls back to CLDR when the runtime exposes no week info", () => {
    const proto = Intl.Locale.prototype as any;
    const methodDesc = Object.getOwnPropertyDescriptor(proto, "getWeekInfo");
    const getterDesc = Object.getOwnPropertyDescriptor(proto, "weekInfo");
    if (methodDesc) delete proto.getWeekInfo;
    if (getterDesc) delete proto.weekInfo;

    const weekendModule = require("@/lib/connector/reference-data/modules/public-holidays/weekend");

    try {
      // Guard the guard: if either shape survived the delete, this test would
      // pass through the primary path and prove nothing.
      expect(typeof proto.getWeekInfo).not.toBe("function");
      expect(Object.getOwnPropertyDescriptor(proto, "weekInfo")).toBeUndefined();

      // Need fresh lookup — the cache would otherwise answer from the primary path
      weekendModule.clearWeekendCaches();

      // Should still return the correct result via CLDR
      const days = getWeekendDays("DE");
      expect(days).toContain(6);
      expect(days).toContain(7);
      expect(days).toHaveLength(2);
    } finally {
      if (methodDesc) Object.defineProperty(proto, "getWeekInfo", methodDesc);
      if (getterDesc) Object.defineProperty(proto, "weekInfo", getterDesc);
      // Leave no CLDR-sourced entries behind for the tests that follow
      weekendModule.clearWeekendCaches();
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
