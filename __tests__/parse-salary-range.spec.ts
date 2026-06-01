/**
 * parse-salary-range.spec.ts — Welle 2 Phase 3, Task 3.2
 *
 * Best-effort parser for the legacy free-text `Job.salaryRange` → structured
 * { salaryMin, salaryMax, salaryCurrency, salaryPeriod }. Drives the migration
 * backfill. MUST preserve unparseable values (never silently drop): an
 * unparsed result flags `unparsed: true` and keeps the original string.
 *
 * Legacy `salaryRange` is a MIX of:
 *   1. SALARY_RANGES bucket ids ("1".."16")  — form-created jobs
 *   2. free-text ranges ("$90,000 - $120,000") — fixtures / imports
 *   3. promoter free-text (StagedVacancy.salary) — arbitrary job-board text
 */

import { parseSalaryRange } from "@/lib/salary/parse-salary-range";

describe("parseSalaryRange — empty / nullish", () => {
  it("returns an all-null, parsed (not unparsed) result for null/empty", () => {
    for (const v of [null, undefined, "", "   "]) {
      const r = parseSalaryRange(v as string | null | undefined);
      expect(r).toMatchObject({
        salaryMin: null,
        salaryMax: null,
        salaryCurrency: null,
        salaryPeriod: null,
        unparsed: false,
      });
    }
  });
});

describe("parseSalaryRange — SALARY_RANGES bucket ids", () => {
  it("maps bucket '6' to 50000–60000", () => {
    expect(parseSalaryRange("6")).toMatchObject({ salaryMin: 50000, salaryMax: 60000, unparsed: false });
  });
  it("maps bucket '1' to 0–10000", () => {
    expect(parseSalaryRange("1")).toMatchObject({ salaryMin: 0, salaryMax: 10000 });
  });
  it("maps the open-ended bucket '16' (> 150,000) to min only", () => {
    expect(parseSalaryRange("16")).toMatchObject({ salaryMin: 150000, salaryMax: null });
  });
});

describe("parseSalaryRange — free-text ranges", () => {
  it("parses '$90,000 - $120,000' with USD", () => {
    expect(parseSalaryRange("$90,000 - $120,000")).toMatchObject({
      salaryMin: 90000, salaryMax: 120000, salaryCurrency: "USD", unparsed: false,
    });
  });
  it("parses European '€50.000 – €60.000' with EUR (dot thousands, en-dash)", () => {
    expect(parseSalaryRange("€50.000 – €60.000")).toMatchObject({
      salaryMin: 50000, salaryMax: 60000, salaryCurrency: "EUR",
    });
  });
  it("parses 'k' suffixes '50k - 60k'", () => {
    expect(parseSalaryRange("50k - 60k")).toMatchObject({ salaryMin: 50000, salaryMax: 60000 });
  });
  it("parses a plain range with no currency", () => {
    expect(parseSalaryRange("90,000 - 100,000")).toMatchObject({
      salaryMin: 90000, salaryMax: 100000, salaryCurrency: null,
    });
  });
  it("parses an explicit ISO code '45000 - 55000 GBP'", () => {
    expect(parseSalaryRange("45000 - 55000 GBP")).toMatchObject({
      salaryMin: 45000, salaryMax: 55000, salaryCurrency: "GBP",
    });
  });
});

describe("parseSalaryRange — period detection", () => {
  it("detects yearly", () => {
    expect(parseSalaryRange("£45000 per year")).toMatchObject({ salaryCurrency: "GBP", salaryPeriod: "yearly" });
  });
  it("detects monthly", () => {
    expect(parseSalaryRange("3000 EUR / month")).toMatchObject({ salaryCurrency: "EUR", salaryPeriod: "monthly" });
  });
  it("detects hourly", () => {
    expect(parseSalaryRange("$25 per hour")).toMatchObject({ salaryCurrency: "USD", salaryPeriod: "hourly" });
  });
});

describe("parseSalaryRange — single value (fixum)", () => {
  it("treats a bare single amount as a fixum (min == max)", () => {
    expect(parseSalaryRange("55000 EUR")).toMatchObject({ salaryMin: 55000, salaryMax: 55000, salaryCurrency: "EUR" });
  });
  it("treats '> 80000' / 'from' as a lower bound (min only)", () => {
    expect(parseSalaryRange("> 80000")).toMatchObject({ salaryMin: 80000, salaryMax: null });
    expect(parseSalaryRange("from 80000")).toMatchObject({ salaryMin: 80000, salaryMax: null });
  });
});

describe("parseSalaryRange — unparseable (preserved, never dropped)", () => {
  it("flags non-numeric text as unparsed and keeps the original", () => {
    for (const v of ["Competitive", "DOE", "negotiable", "attraktives Gehalt"]) {
      const r = parseSalaryRange(v);
      expect(r.unparsed).toBe(true);
      expect(r.original).toBe(v);
      expect(r.salaryMin).toBeNull();
      expect(r.salaryMax).toBeNull();
    }
  });
});
