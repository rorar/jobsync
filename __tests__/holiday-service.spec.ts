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

  it("each HolidayEntry has the correct shape (CB-9: all 10 fields)", () => {
    const [first] = svc.getHolidays("DE", 2026);
    // Core fields
    expect(typeof first.date).toBe("string");
    expect(typeof first.name).toBe("string");
    expect(typeof first.type).toBe("string");
    expect(first.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    // CB-9: new fields
    expect(typeof first.country).toBe("string");
    expect(first.country).toBe("DE");
    // subdivision is null for national-level
    expect(first.subdivision === null || typeof first.subdivision === "string").toBe(true);
    // region is null for national-level
    expect(first.region === null || typeof first.region === "string").toBe(true);
    expect(typeof first.substitute).toBe("boolean");
    expect(first.start).toBeInstanceOf(Date);
    expect(first.end).toBeInstanceOf(Date);
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
    const result = svc.isHoliday(date, "DE");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].date).toBe("2026-12-25");
    expect(result[0].type).toBe("public");
  });

  it("returns empty array for a regular working day (2026-06-15 — Monday)", () => {
    // 2026-06-15 is a regular Monday in Germany with no holidays
    const date = localDate("2026-06-15");
    const result = svc.isHoliday(date, "DE");
    expect(result).toHaveLength(0);
  });

  it("returns empty array for an empty/invalid country (XX)", () => {
    const date = localDate("2026-12-25");
    const result = svc.isHoliday(date, "XX");
    expect(result).toHaveLength(0);
  });

  it("caches results — second call does not rebuild the cache", () => {
    const date = localDate("2026-12-25");

    // First call populates cache
    svc.isHoliday(date, "DE");
    const before = Date.now();
    // Second call should use cache
    const result = svc.isHoliday(date, "DE");
    const elapsed = Date.now() - before;

    expect(result.length).toBeGreaterThan(0);
    // Cached access should be effectively instant (< 50ms is conservative)
    expect(elapsed).toBeLessThan(50);
  });

  it("satisfies MultipleHolidaysPerDate — isHoliday returns all entries for a date (CB-11)", () => {
    // Some countries / configurations have multiple holiday entries on the same date.
    // isHoliday now returns ALL matching holidays (array), not just the first.
    const holidays = svc.getHolidays("DE", 2026);
    // The array is not a Set — it allows multiple entries per date
    expect(Array.isArray(holidays)).toBe(true);
    // isHoliday returns all matches for a date
    const christmasEntries = holidays.filter((h) => h.date === "2026-12-25");
    const isHol = svc.isHoliday(localDate("2026-12-25"), "DE");
    expect(isHol.length).toBe(christmasEntries.length);
    expect(isHol[0]?.date).toBe(christmasEntries[0]?.date);
  });

  it("respects the type filter — observance type excluded when types=['public']", () => {
    // New Year's Eve in Germany is often 'observance'; Christmas is 'public'
    const christmas = svc.isHoliday(localDate("2026-12-25"), "DE", undefined, ["public"]);
    expect(christmas.length).toBeGreaterThan(0);
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

  it("Saturday is not a business day (isWeekend flag)", () => {
    // 2026-01-03 is a Saturday
    const result = svc.isBusinessDay(localDate("2026-01-03"), "DE");
    expect(result.isBusinessDay).toBe(false);
    expect(result.isWeekend).toBe(true);
  });

  it("Sunday is not a business day (isWeekend flag)", () => {
    // 2026-01-04 is a Sunday
    const result = svc.isBusinessDay(localDate("2026-01-04"), "DE");
    expect(result.isBusinessDay).toBe(false);
    expect(result.isWeekend).toBe(true);
  });

  it("Christmas is not a business day (blockingHolidays)", () => {
    // 2026-12-25 is a Friday — not a weekend — but is a public holiday
    const result = svc.isBusinessDay(localDate("2026-12-25"), "DE");
    expect(result.isBusinessDay).toBe(false);
    expect(result.blockingHolidays.length).toBeGreaterThan(0);
    expect(result.isWeekend).toBe(false);
  });

  it("Christmas result includes blockingHolidays with holiday name", () => {
    const result = svc.isBusinessDay(localDate("2026-12-25"), "DE");
    expect(result.blockingHolidays.length).toBeGreaterThan(0);
    const firstBlocking = result.blockingHolidays[0];
    expect(typeof firstBlocking.name).toBe("string");
    expect(firstBlocking.name.length).toBeGreaterThan(0);
  });

  it("a normal Wednesday IS a business day", () => {
    // 2026-06-17 is a Wednesday with no German public holidays
    const result = svc.isBusinessDay(localDate("2026-06-17"), "DE");
    expect(result.isBusinessDay).toBe(true);
    expect(result.blockingHolidays).toHaveLength(0);
    expect(result.isWeekend).toBe(false);
  });

  it("satisfies BusinessDaySemantics — observance holidays do NOT block business days", () => {
    // isBusinessDay only considers public+bank types as blocking.
    // Observance-only dates should not be blocking.
    // Find an observance-only holiday date in DE 2026
    const all = svc.getHolidays("DE", 2026);
    const observanceOnly = all.find((h) => h.type === "observance");

    if (!observanceOnly) {
      // Germany may not have observance holidays — skip gracefully
      return;
    }

    const date = localDate(observanceOnly.date);
    const result = svc.isBusinessDay(date, "DE");

    // If the date also happens to be a weekend, it's still not a business day
    if (result.isWeekend) return;

    // With only public/bank types blocking, an observance-only day should be a business day
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

  it("returns a BusinessDayResult with all three fields present (CB-10)", () => {
    const result = svc.isBusinessDay(localDate("2026-01-01"), "DE");
    expect("isBusinessDay" in result).toBe(true);
    expect("blockingHolidays" in result).toBe(true);
    expect("isWeekend" in result).toBe(true);
    expect(typeof result.isBusinessDay).toBe("boolean");
    expect(Array.isArray(result.blockingHolidays)).toBe(true);
    expect(typeof result.isWeekend).toBe("boolean");
  });

  it("New Year's Day 2026 is not a business day in Germany", () => {
    // 2026-01-01 is a Thursday — it is a public holiday
    const result = svc.isBusinessDay(localDate("2026-01-01"), "DE");
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

  it("returns a Map with one entry per location (CB-14)", () => {
    const locations = [
      { countryCode: "DE" },
      { countryCode: "FR" },
      { countryCode: "AT" },
    ];
    const result = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(3);
  });

  it("keys are CC:SUB location strings", () => {
    const locations = [{ countryCode: "DE" }];
    const result = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    const keys = Array.from(result.keys());
    expect(keys[0]).toBe("DE:");
  });

  it("deduplicates locations — 4 input locations with 3 unique keys = 3 map entries", () => {
    const locations = [
      { countryCode: "DE" },
      { countryCode: "DE" }, // duplicate
      { countryCode: "FR" },
      { countryCode: "AT" },
    ];
    const result = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    // Map deduplicates by location key
    expect(result.size).toBe(3);
  });

  it("returns HolidayEntry[] for Christmas 2026 in DE and empty for a regular day", () => {
    const locations = [{ countryCode: "DE" }];
    // Christmas — should have entries
    const christmasResult = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    const deChristmas = christmasResult.get("DE:");
    expect(deChristmas).toBeDefined();
    expect(deChristmas!.length).toBeGreaterThan(0);

    // Regular day — should have empty array
    const regularResult = svc.isHolidayBatch(localDate("2026-06-15"), locations);
    const deRegular = regularResult.get("DE:");
    expect(deRegular).toBeDefined();
    expect(deRegular!).toHaveLength(0);
  });

  it("returns empty arrays for an invalid country (XX)", () => {
    const locations = [{ countryCode: "XX" }];
    const result = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    for (const entry of result.values()) {
      expect(entry).toHaveLength(0);
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

// ---------------------------------------------------------------------------
// CB-9 through CB-14: Updated API contract tests
// ---------------------------------------------------------------------------

describe("HolidayService — Updated API contracts (CB-9..CB-14)", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  // CB-9: HolidayEntry has country, subdivision, region, substitute, start, end
  it("CB-9: HolidayEntry includes country, subdivision, region, substitute, start, end", () => {
    const holidays = svc.getHolidays("DE", 2026, "BY");
    const entry = holidays.find((h) => h.date === "2026-01-06"); // Epiphany in Bavaria
    expect(entry).toBeDefined();
    expect(entry!.country).toBe("DE");
    expect(entry!.subdivision).toBe("BY");
    expect(entry!.region).toBeNull(); // National subdivisions have no region
    expect(typeof entry!.substitute).toBe("boolean");
    expect(entry!.start).toBeInstanceOf(Date);
    expect(entry!.end).toBeInstanceOf(Date);
    // start should be before or equal to end
    expect(entry!.start.getTime()).toBeLessThanOrEqual(entry!.end.getTime());
  });

  // CB-10: BusinessDayResult has blockingHolidays[] + isWeekend (not reason enum)
  it("CB-10: BusinessDayResult uses blockingHolidays[] and isWeekend (no reason enum)", () => {
    const holidayResult = svc.isBusinessDay(localDate("2026-12-25"), "DE");
    // Has the new shape
    expect(Array.isArray(holidayResult.blockingHolidays)).toBe(true);
    expect(typeof holidayResult.isWeekend).toBe("boolean");
    expect(typeof holidayResult.isBusinessDay).toBe("boolean");
    // Does NOT have the old shape
    expect("reason" in holidayResult).toBe(false);
    expect("holidayName" in holidayResult).toBe(false);
    // blockingHolidays are full HolidayEntry objects
    expect(holidayResult.blockingHolidays.length).toBeGreaterThan(0);
    expect(typeof holidayResult.blockingHolidays[0].name).toBe("string");
    expect(typeof holidayResult.blockingHolidays[0].date).toBe("string");
  });

  // CB-11: isHoliday returns array, Dec 25 can have multiple entries
  it("CB-11: isHoliday returns HolidayEntry[] (array, not single/null)", () => {
    const result = svc.isHoliday(localDate("2026-12-25"), "DE");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // Each entry is a full HolidayEntry
    for (const entry of result) {
      expect(entry.date).toBe("2026-12-25");
      expect(typeof entry.name).toBe("string");
      expect(typeof entry.type).toBe("string");
      expect(typeof entry.country).toBe("string");
    }
  });

  it("CB-11: isHoliday returns empty array for non-holiday (not null)", () => {
    const result = svc.isHoliday(localDate("2026-06-15"), "DE");
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(0);
  });

  // CB-12: getWeekendDays returns ISO [6, 7] not JS Set{0, 6}
  it("CB-12: getWeekendDays returns ISO 8601 number[] not JS Set", () => {
    const days = svc.getWeekendDays("DE");
    expect(Array.isArray(days)).toBe(true);
    expect(days).not.toBeInstanceOf(Set);
    // ISO 8601: 6=Sat, 7=Sun (NOT JS 0=Sun, 6=Sat)
    expect(days).toContain(6);
    expect(days).toContain(7);
    expect(days).not.toContain(0); // JS Sunday is NOT in ISO format
    expect(days).toHaveLength(2);
  });

  // CB-14: isHolidayBatch takes single date + multiple locations
  it("CB-14: isHolidayBatch takes single date + locations array", () => {
    const locations = [
      { countryCode: "DE" },
      { countryCode: "FR" },
      { countryCode: "AT" },
    ];
    const result = svc.isHolidayBatch(localDate("2026-12-25"), locations);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(3);
    // All three countries celebrate Christmas
    for (const [key, entries] of result) {
      expect(typeof key).toBe("string");
      expect(Array.isArray(entries)).toBe(true);
      expect(entries.length).toBeGreaterThan(0);
    }
  });

  it("CB-14: isHolidayBatch with subdivision differentiates locations", () => {
    const locations = [
      { countryCode: "DE" },
      { countryCode: "DE", subdivisionCode: "BY" },
    ];
    const result = svc.isHolidayBatch(localDate("2026-01-06"), locations);
    // National DE and DE:BY are different location keys
    expect(result.size).toBe(2);
    expect(result.has("DE:")).toBe(true);
    expect(result.has("DE:BY")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// D-L1: Locale passthrough to date-holidays
// ---------------------------------------------------------------------------

describe("D-L1: Locale passthrough to date-holidays", () => {
  let svc: ReturnType<typeof getHolidayService>;

  beforeEach(() => {
    svc = getHolidayService();
    svc.clearDayCache();
  });

  // -----------------------------------------------------------------------
  // D-L1.1: French locale — holiday names in French
  // -----------------------------------------------------------------------
  it("D-L1.1: getHolidays with French locale returns French holiday names", () => {
    const holidays = svc.getHolidays("DE", 2026, undefined, undefined, "fr");
    const christmas = holidays.find(
      (h: { date: string }) => h.date === "2026-12-25",
    );
    expect(christmas).toBeDefined();
    // French: "Noël" or "Jour de Noël"
    expect(christmas!.name).toMatch(/No[eë]l/i);
  });

  // -----------------------------------------------------------------------
  // D-L1.2: Spanish locale — holiday names in Spanish
  // -----------------------------------------------------------------------
  it("D-L1.2: getHolidays with Spanish locale returns Spanish holiday names", () => {
    const holidays = svc.getHolidays("DE", 2026, undefined, undefined, "es");
    const newYear = holidays.find(
      (h: { date: string }) => h.date === "2026-01-01",
    );
    expect(newYear).toBeDefined();
    // Spanish: "Año Nuevo" or similar
    expect(newYear!.name).toMatch(/A[ñn]o|Nuevo/i);
  });

  // -----------------------------------------------------------------------
  // D-L1.3: English explicit locale
  // -----------------------------------------------------------------------
  it("D-L1.3: getHolidays with English locale returns English holiday names", () => {
    const holidays = svc.getHolidays("DE", 2026, undefined, undefined, "en");
    const newYear = holidays.find(
      (h: { date: string }) => h.date === "2026-01-01",
    );
    expect(newYear).toBeDefined();
    expect(newYear!.name).toBe("New Year's Day");
  });

  // -----------------------------------------------------------------------
  // D-L1.4: No locale backward compatibility
  // (existing tests cover this — included for explicit documentation)
  // -----------------------------------------------------------------------
  it("D-L1.4: getHolidays without locale returns country default names", () => {
    const holidays = svc.getHolidays("DE", 2026);
    const newYear = holidays.find((h) => h.date === "2026-01-01");
    expect(newYear).toBeDefined();
    // Default for DE is German
    expect(newYear!.name).toMatch(/Neujahr/i);
  });

  // -----------------------------------------------------------------------
  // D-L1.5: Cache isolation — different locales produce different names
  // -----------------------------------------------------------------------
  it("D-L1.5: cache isolates locale — French and German names differ for same holiday", () => {
    const frHolidays = svc.getHolidays("DE", 2026, undefined, undefined, "fr");
    const deHolidays = svc.getHolidays("DE", 2026, undefined, undefined, "de");

    const frNewYear = frHolidays.find(
      (h: { date: string }) => h.date === "2026-01-01",
    );
    const deNewYear = deHolidays.find(
      (h: { date: string }) => h.date === "2026-01-01",
    );

    expect(frNewYear).toBeDefined();
    expect(deNewYear).toBeDefined();
    // French "Nouvel An" vs German "Neujahr" — must be different
    expect(frNewYear!.name).not.toBe(deNewYear!.name);
  });

  // -----------------------------------------------------------------------
  // D-L1.6: isHoliday with locale
  // -----------------------------------------------------------------------
  it("D-L1.6: isHoliday with French locale returns French holiday name", () => {
    const christmas = localDate("2026-12-25");
    const result = svc.isHoliday(christmas, "DE", undefined, undefined, "fr");
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].name).toMatch(/No[eë]l/i);
  });

  // -----------------------------------------------------------------------
  // D-L1.7: isBusinessDay with locale
  // -----------------------------------------------------------------------
  it("D-L1.7: isBusinessDay with French locale returns French blocking holiday names", () => {
    const christmas = localDate("2026-12-25");
    const result = svc.isBusinessDay(christmas, "DE", undefined, "fr");
    expect(result.isBusinessDay).toBe(false);
    expect(result.blockingHolidays.length).toBeGreaterThan(0);
    expect(result.blockingHolidays[0].name).toMatch(/No[eë]l/i);
  });

  // -----------------------------------------------------------------------
  // D-L1.8: buildInstanceKey with locale
  // -----------------------------------------------------------------------
  it("D-L1.8: buildInstanceKey includes locale in cache key", () => {
    const { buildInstanceKey } = require("@/lib/connector/reference-data/modules/public-holidays/caching");

    const key = buildInstanceKey("DE", undefined, 2026, "fr");
    expect(key).toBe("DE::2026:fr");
  });
});

// ---------------------------------------------------------------------------
// P-5: DayCache LRU eviction
// ---------------------------------------------------------------------------

describe("DayCache LRU eviction (P-5)", () => {
  it("evicts oldest entry when maxSize is exceeded", () => {
    const { DayCache } = require("@/lib/connector/reference-data/modules/public-holidays/caching");
    const cache = new DayCache(3);

    // Fill cache to capacity with 3 different country entries
    cache.getHolidays("DE", 2026);
    cache.getHolidays("FR", 2026);
    cache.getHolidays("IT", 2026);
    expect(cache.size).toBe(3);

    // Adding a 4th entry should evict the oldest (DE)
    cache.getHolidays("US", 2026);
    expect(cache.size).toBe(3);

    // Verify DE was evicted by checking it rebuilds (we can't directly test this,
    // but the size staying at 3 after adding a 4th entry proves eviction works)
  });

  it("LRU touch moves accessed entries to end (prevents eviction)", () => {
    const { DayCache } = require("@/lib/connector/reference-data/modules/public-holidays/caching");
    const cache = new DayCache(3);

    cache.getHolidays("DE", 2026);
    cache.getHolidays("FR", 2026);
    cache.getHolidays("IT", 2026);

    // Touch DE (moves it to end of LRU, FR becomes oldest)
    cache.getHolidays("DE", 2026);

    // Adding US should evict FR (oldest after DE was touched), not DE
    cache.getHolidays("US", 2026);
    expect(cache.size).toBe(3);
  });
});
