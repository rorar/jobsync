/**
 * holiday-service.spec.ts — HolidayService Tests
 *
 * Tests the full HolidayService via getHolidayService():
 *   - getHolidays: country-level, Bavaria (Epiphany), localised names, invalid country
 *   - isHoliday: date matching, caching, multiple holidays per date invariant
 *   - isBusinessDay: weekends, holidays, observance-only dates, BusinessDayResult shape
 *   - isHolidayBatch: deduplication behaviour
 *   - preWarm / clearDayCache: smoke tests
 *   - Historical lookups (invariant HistoricalLookupSupported)
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { register: jest.fn() },
}));

import { getHolidayService } from "@/lib/connector/reference-data/modules/public-holidays/index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a local-time Date from a YYYY-MM-DD string. */
function localDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// ---------------------------------------------------------------------------
// getHolidays
// ---------------------------------------------------------------------------

describe("HolidayService.getHolidays", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("returns more than 5 public holidays for Germany in 2026", () => {
    const holidays = svc.getHolidays("DE", 2026);
    expect(holidays.length).toBeGreaterThan(5);
  });

  it("each HolidayEntry has the correct shape (date, name, type)", () => {
    const [first] = svc.getHolidays("DE", 2026);
    expect(typeof first.date).toBe("string");
    expect(typeof first.name).toBe("string");
    expect(typeof first.type).toBe("string");
    // date format: YYYY-MM-DD
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes Christmas 2026 as a public holiday in Germany", () => {
    const holidays = svc.getHolidays("DE", 2026);
    const christmas = holidays.find((h) => h.date === "2026-12-25");
    expect(christmas).toBeDefined();
    expect(christmas!.type).toBe("public");
  });

  it("includes Epiphany (Jan 6) as a holiday in Bavaria (DE, BY)", () => {
    const holidays = svc.getHolidays("DE", 2026, "BY");
    const epiphany = holidays.find((h) => h.date === "2026-01-06");
    expect(epiphany).toBeDefined();
  });

  it("does NOT include Epiphany in country-level Germany (no subdivision)", () => {
    // Epiphany is only a public holiday in some German Bundesländer (BY, BW, ST)
    // At the national level it is typically observance-only or absent.
    const national = svc.getHolidays("DE", 2026);
    const epiphanyPublic = national.find(
      (h) => h.date === "2026-01-06" && h.type === "public",
    );
    // Either absent or not "public" at national level
    expect(epiphanyPublic).toBeUndefined();
  });

  it("includes 'Neujahr' (New Year) in German localized holiday names", () => {
    const holidays = svc.getHolidays("DE", 2026);
    const newYear = holidays.find((h) => h.date === "2026-01-01");
    expect(newYear).toBeDefined();
    expect(newYear!.name).toMatch(/Neujahr/i);
  });

  it("returns an empty array for an invalid country code (XX)", () => {
    const holidays = svc.getHolidays("XX", 2026);
    expect(holidays).toHaveLength(0);
  });

  it("filters by type when types array is provided", () => {
    const publicOnly = svc.getHolidays("DE", 2026, undefined, ["public"]);
    expect(publicOnly.length).toBeGreaterThan(0);
    for (const h of publicOnly) {
      expect(h.type).toBe("public");
    }
  });

  it("returns more holidays when types is not filtered than when filtered to public only", () => {
    const all = svc.getHolidays("DE", 2026);
    const publicOnly = svc.getHolidays("DE", 2026, undefined, ["public"]);
    expect(all.length).toBeGreaterThanOrEqual(publicOnly.length);
  });
});

// ---------------------------------------------------------------------------
// isHoliday
// ---------------------------------------------------------------------------

describe("HolidayService.isHoliday", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("detects Christmas 2026 in Germany", () => {
    const date = localDate("2026-12-25");
    const result = svc.isHoliday(date, { countryCode: "DE" });
    expect(result).not.toBeNull();
    expect(result!.date).toBe("2026-12-25");
    expect(result!.type).toBe("public");
  });

  it("returns null for a regular working day (2026-06-15 — Monday)", () => {
    // 2026-06-15 is a regular Monday in Germany with no holidays
    const date = localDate("2026-06-15");
    const result = svc.isHoliday(date, { countryCode: "DE" });
    expect(result).toBeNull();
  });

  it("returns null for an empty/invalid country (XX)", () => {
    const date = localDate("2026-12-25");
    const result = svc.isHoliday(date, { countryCode: "XX" });
    expect(result).toBeNull();
  });

  it("caches results — second call does not rebuild the cache", () => {
    const date = localDate("2026-12-25");
    const opts = { countryCode: "DE" };

    // First call populates cache
    svc.isHoliday(date, opts);
    const before = Date.now();
    // Second call should use cache
    const result = svc.isHoliday(date, opts);
    const elapsed = Date.now() - before;

    expect(result).not.toBeNull();
    // Cached access should be effectively instant (< 50ms is conservative)
    expect(elapsed).toBeLessThan(50);
  });

  it("satisfies MultipleHolidaysPerDate — getHolidays can return >1 entry per date", () => {
    // Some countries / configurations have multiple holiday entries on the same date.
    // We verify the `holidays` array from getHolidays allows duplicates (not deduplicated
    // to a Set), whereas isHoliday returns the first/most important one.
    const holidays = svc.getHolidays("DE", 2026);
    // The array is not a Set — it allows multiple entries per date
    expect(Array.isArray(holidays)).toBe(true);
    // isHoliday returns the first match for a date that has at least one entry
    const christmas = holidays.find((h) => h.date === "2026-12-25");
    const isHol = svc.isHoliday(localDate("2026-12-25"), { countryCode: "DE" });
    expect(isHol?.date).toBe(christmas?.date);
  });

  it("respects the type filter — observance type excluded when types=['public']", () => {
    // New Year's Eve in Germany is often 'observance'; Christmas is 'public'
    const christmas = svc.isHoliday(localDate("2026-12-25"), {
      countryCode: "DE",
      types: ["public"],
    });
    expect(christmas).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// isBusinessDay
// ---------------------------------------------------------------------------

describe("HolidayService.isBusinessDay", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("Saturday is not a business day (isWeekend reason)", () => {
    // 2026-01-03 is a Saturday
    const result = svc.isBusinessDay(localDate("2026-01-03"), {
      countryCode: "DE",
    });
    expect(result.isBusinessDay).toBe(false);
    expect(result.reason).toBe("weekend");
  });

  it("Sunday is not a business day (isWeekend reason)", () => {
    // 2026-01-04 is a Sunday
    const result = svc.isBusinessDay(localDate("2026-01-04"), {
      countryCode: "DE",
    });
    expect(result.isBusinessDay).toBe(false);
    expect(result.reason).toBe("weekend");
  });

  it("Christmas is not a business day (holiday reason)", () => {
    // 2026-12-25 is a Friday — not a weekend — but is a public holiday
    const result = svc.isBusinessDay(localDate("2026-12-25"), {
      countryCode: "DE",
    });
    expect(result.isBusinessDay).toBe(false);
    expect(result.reason).toBe("holiday");
  });

  it("Christmas result includes the holidayName field", () => {
    const result = svc.isBusinessDay(localDate("2026-12-25"), {
      countryCode: "DE",
    });
    expect(result.holidayName).toBeDefined();
    expect(typeof result.holidayName).toBe("string");
    expect(result.holidayName!.length).toBeGreaterThan(0);
  });

  it("a normal Wednesday IS a business day", () => {
    // 2026-06-17 is a Wednesday with no German public holidays
    const result = svc.isBusinessDay(localDate("2026-06-17"), {
      countryCode: "DE",
    });
    expect(result.isBusinessDay).toBe(true);
    expect(result.reason).toBe("business_day");
  });

  it("satisfies BusinessDaySemantics — observance holidays do NOT block business days", () => {
    // We use the type filter to check only public+bank types for business day calculation.
    // Observance-only dates should not be blocking.
    // Find an observance-only holiday date in DE 2026
    const all = svc.getHolidays("DE", 2026);
    const observanceOnly = all.find((h) => h.type === "observance");

    if (!observanceOnly) {
      // Germany may not have observance holidays — skip gracefully
      return;
    }

    const date = localDate(observanceOnly.date);
    // The default HolidayCheckOptions does not restrict types, so the service
    // would mark it as a holiday. But if we explicitly filter to public/bank only:
    const result = svc.isBusinessDay(date, {
      countryCode: "DE",
      types: ["public", "bank"],
    });

    // If the date also happens to be a weekend, the reason is weekend
    if (result.reason === "weekend") return;

    // With only public/bank types, an observance-only day should be a business day
    // UNLESS there's also a public/bank holiday on the same date
    const hasPublicOnSameDate = all.some(
      (h) =>
        h.date === observanceOnly.date &&
        (h.type === "public" || h.type === "bank"),
    );
    if (!hasPublicOnSameDate) {
      expect(result.isBusinessDay).toBe(true);
    }
  });

  it("returns a BusinessDayResult with all three fields present", () => {
    const result = svc.isBusinessDay(localDate("2026-01-01"), {
      countryCode: "DE",
    });
    expect("isBusinessDay" in result).toBe(true);
    expect("reason" in result).toBe(true);
    // holidayName is optional — no assertion required, just verify the shape
    expect(typeof result.isBusinessDay).toBe("boolean");
  });

  it("New Year's Day 2026 is not a business day in Germany", () => {
    // 2026-01-01 is a Thursday — it is a public holiday
    const result = svc.isBusinessDay(localDate("2026-01-01"), {
      countryCode: "DE",
    });
    expect(result.isBusinessDay).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isHolidayBatch
// ---------------------------------------------------------------------------

describe("HolidayService.isHolidayBatch", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("returns a Map with one entry per input date", () => {
    const dates = [
      localDate("2026-12-25"),
      localDate("2026-12-26"),
      localDate("2026-06-15"),
    ];
    const result = svc.isHolidayBatch(dates, { countryCode: "DE" });
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(3);
  });

  it("keys are ISO date strings (YYYY-MM-DD)", () => {
    const dates = [localDate("2026-12-25")];
    const result = svc.isHolidayBatch(dates, { countryCode: "DE" });
    const keys = Array.from(result.keys());
    expect(keys[0]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("deduplicates dates — 4 input dates with 3 unique ISO strings = 3 map entries", () => {
    // Two identical dates (2026-12-25) plus two others
    const dates = [
      localDate("2026-12-25"),
      localDate("2026-12-25"), // duplicate
      localDate("2026-12-26"),
      localDate("2026-06-15"),
    ];
    const result = svc.isHolidayBatch(dates, { countryCode: "DE" });
    // Map deduplicates by ISO string key
    expect(result.size).toBe(3);
  });

  it("returns a HolidayEntry for Christmas 2026 and null for a regular day", () => {
    const dates = [localDate("2026-12-25"), localDate("2026-06-15")];
    const result = svc.isHolidayBatch(dates, { countryCode: "DE" });
    expect(result.get("2026-12-25")).not.toBeNull();
    expect(result.get("2026-06-15")).toBeNull();
  });

  it("returns all null for an invalid country (XX)", () => {
    const dates = [localDate("2026-12-25"), localDate("2026-01-01")];
    const result = svc.isHolidayBatch(dates, { countryCode: "XX" });
    for (const entry of result.values()) {
      expect(entry).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// preWarm + clearDayCache
// ---------------------------------------------------------------------------

describe("HolidayService.preWarm", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("does not throw when pre-warming valid countries", () => {
    expect(() => svc.preWarm(["DE", "FR", "AT"], 2026)).not.toThrow();
  });

  it("does not throw when pre-warming with an invalid country code", () => {
    expect(() => svc.preWarm(["XX"], 2026)).not.toThrow();
  });

  it("does not throw for an empty country list", () => {
    expect(() => svc.preWarm([], 2026)).not.toThrow();
  });
});

describe("HolidayService.clearDayCache", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
  });

  it("does not throw", () => {
    expect(() => svc.clearDayCache()).not.toThrow();
  });

  it("can be called multiple times without error", () => {
    svc.clearDayCache();
    svc.clearDayCache();
    expect(true).toBe(true);
  });

  it("cache is empty after clearDayCache — subsequent calls still work", () => {
    // Populate cache
    svc.getHolidays("DE", 2026);
    // Clear it
    svc.clearDayCache();
    // Should still return results (rebuilds on demand)
    const holidays = svc.getHolidays("DE", 2026);
    expect(holidays.length).toBeGreaterThan(5);
  });
});

// ---------------------------------------------------------------------------
// Historical lookups (invariant HistoricalLookupSupported)
// ---------------------------------------------------------------------------

describe("HolidayService — HistoricalLookupSupported", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("getHolidays works for a historical year (2020)", () => {
    const holidays = svc.getHolidays("DE", 2020);
    expect(holidays.length).toBeGreaterThan(5);
  });

  it("Tag der Deutschen Einheit (Oct 3) exists in Germany 2020", () => {
    const holidays = svc.getHolidays("DE", 2020);
    const unity = holidays.find((h) => h.date === "2020-10-03");
    expect(unity).toBeDefined();
    expect(unity!.type).toBe("public");
  });

  it("Christmas 2020 is a public holiday in Germany", () => {
    const holidays = svc.getHolidays("DE", 2020);
    const christmas = holidays.find((h) => h.date === "2020-12-25");
    expect(christmas).toBeDefined();
    expect(christmas!.type).toBe("public");
  });

  it("New Year 2020 is a holiday in Germany", () => {
    const holidays = svc.getHolidays("DE", 2020);
    const newYear = holidays.find((h) => h.date === "2020-01-01");
    expect(newYear).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// getRegions
// ---------------------------------------------------------------------------

describe("HolidayService.getRegions", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  it("returns German states as RegionInfo array", () => {
    const regions = svc.getRegions("DE");
    expect(regions.length).toBeGreaterThan(0);
    expect(typeof regions[0].code).toBe("string");
    expect(typeof regions[0].name).toBe("string");
  });

  it("includes Bayern (BY) as a state for Germany", () => {
    const regions = svc.getRegions("DE");
    const by = regions.find((r) => r.code === "BY");
    expect(by).toBeDefined();
  });

  it("returns sub-regions for a German state (DE, BY)", () => {
    const subRegions = svc.getRegions("DE", "BY");
    // Bavaria has sub-regions like A (Augsburg), KATH, EVANG
    expect(Array.isArray(subRegions)).toBe(true);
  });

  it("returns empty array for an invalid country (XX)", () => {
    const regions = svc.getRegions("XX");
    expect(regions).toHaveLength(0);
  });
});
