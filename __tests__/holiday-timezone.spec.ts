/**
 * holiday-timezone.spec.ts — D-TZ (TimezoneAwareness)
 *
 * Pure timezone helper used to compute "today" in a contact country's local
 * calendar, fixing the off-by-one near midnight when the server clock differs
 * from the contact country's timezone. No clock mocking needed — `now` is an
 * explicit argument, so these tests are deterministic regardless of the runner's
 * own TZ.
 */

jest.mock("server-only", () => ({}));

jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { register: jest.fn() },
}));

import { dateInTimeZone } from "@/lib/connector/reference-data/modules/public-holidays/timezone";
import { getHolidayService } from "@/lib/connector/reference-data/modules/public-holidays/index";

describe("dateInTimeZone", () => {
  it("returns the calendar date in a timezone AHEAD of UTC", () => {
    // 2026-05-29T23:30Z is already 2026-05-30 in UTC+14 (Kiritimati)
    const d = dateInTimeZone(new Date("2026-05-29T23:30:00Z"), "Pacific/Kiritimati");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4); // May (0-indexed)
    expect(d.getDate()).toBe(30);
  });

  it("returns the calendar date in a timezone BEHIND UTC", () => {
    // 2026-05-29T00:30Z is still 2026-05-28 in UTC-10 (Honolulu)
    const d = dateInTimeZone(new Date("2026-05-29T00:30:00Z"), "Pacific/Honolulu");
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(4);
    expect(d.getDate()).toBe(28);
  });

  it("sets the time to local noon (DST-safe day-of-week)", () => {
    const d = dateInTimeZone(new Date("2026-05-29T10:00:00Z"), "Europe/Berlin");
    expect(d.getHours()).toBe(12);
  });

  it("falls back to the input instant on an invalid timezone (no throw)", () => {
    const now = new Date("2026-05-29T12:00:00Z");
    const d = dateInTimeZone(now, "Not/AZone");
    expect(d instanceof Date).toBe(true);
    expect(Number.isNaN(d.getTime())).toBe(false);
  });
});

describe("HolidayService.getPrimaryTimezone", () => {
  const svc = getHolidayService();

  it("returns the representative IANA timezone for a country", () => {
    expect(svc.getPrimaryTimezone("DE")).toBe("Europe/Berlin");
  });

  it("is case-insensitive on the country code", () => {
    expect(svc.getPrimaryTimezone("de")).toBe("Europe/Berlin");
  });

  it("returns null for an unknown country", () => {
    expect(svc.getPrimaryTimezone("ZZ")).toBeNull();
  });
});
