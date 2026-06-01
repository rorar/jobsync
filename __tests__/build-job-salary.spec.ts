/**
 * build-job-salary.spec.ts — Welle 2 Phase 4 (full-review F1/F4)
 *
 * `buildJobSalaryData` is the SERVER-SIDE validation boundary for the salary
 * fields on every Job write path (addJob/updateJob Server Actions, the /api/v1
 * legacy-fallback branch, and the promoter). Because the internal actions do not
 * re-`safeParse` the form (ADR-019), this builder must defensively sanitise each
 * field and never throw. These tests lock that contract.
 */

import { buildJobSalaryData } from "@/lib/salary/build-job-salary";

describe("buildJobSalaryData — amount sanitisation", () => {
  it("passes through valid finite, non-negative amounts", () => {
    const r = buildJobSalaryData({ salaryMin: 50000, salaryMax: 70000 });
    expect(r.salaryMin).toBe(50000);
    expect(r.salaryMax).toBe(70000);
  });

  it("drops negative / NaN / Infinity amounts to null", () => {
    expect(buildJobSalaryData({ salaryMin: -1 }).salaryMin).toBeNull();
    expect(buildJobSalaryData({ salaryMin: NaN }).salaryMin).toBeNull();
    expect(buildJobSalaryData({ salaryMin: Infinity }).salaryMin).toBeNull();
    expect(buildJobSalaryData({ salaryMax: -Infinity }).salaryMax).toBeNull();
  });

  it("swaps an inverted range so salaryMax >= salaryMin (SalaryMaxGteMin)", () => {
    const r = buildJobSalaryData({ salaryMin: 90000, salaryMax: 50000 });
    expect(r.salaryMin).toBe(50000);
    expect(r.salaryMax).toBe(90000);
  });
});

describe("buildJobSalaryData — currency + period sanitisation", () => {
  it("uppercases and accepts an active ISO-4217 code", () => {
    expect(buildJobSalaryData({ salaryMin: 1, salaryCurrency: "eur" }).salaryCurrency).toBe("EUR");
  });

  it("drops a well-formed but non-existent currency code to null", () => {
    expect(buildJobSalaryData({ salaryMin: 1, salaryCurrency: "ZZZ" }).salaryCurrency).toBeNull();
  });

  it("drops a salaryPeriod not in SALARY_PERIODS to null", () => {
    // @ts-expect-error — exercising the runtime guard against an erased union
    expect(buildJobSalaryData({ salaryMin: 1, salaryPeriod: "weekly" }).salaryPeriod).toBeNull();
    expect(buildJobSalaryData({ salaryMin: 1, salaryPeriod: "yearly" }).salaryPeriod).toBe("yearly");
  });
});

describe("buildJobSalaryData — bonus + deprecated salaryRange", () => {
  it("serializes a valid bonus and drops an invalid one", () => {
    expect(buildJobSalaryData({ salaryBonus: { kind: "fixed", amount: 5000 } }).salaryBonus).toBe(
      JSON.stringify({ kind: "fixed", amount: 5000 }),
    );
    expect(buildJobSalaryData({ salaryBonus: { kind: "fixed", amount: null } }).salaryBonus).toBeNull();
  });

  it("computes salaryRange from structured amounts", () => {
    const r = buildJobSalaryData({ salaryMin: 50000, salaryMax: 70000, salaryCurrency: "EUR" });
    expect(r.salaryRange).toBeTruthy();
  });

  it("nulls salaryRange when there are no amounts and no fallback", () => {
    expect(buildJobSalaryData({ salaryCurrency: "EUR" }).salaryRange).toBeNull();
  });

  it("retains an unparseable free-text fallback when no amounts were derived (F4)", () => {
    const r = buildJobSalaryData({ salaryRangeFallback: "  competitive  " });
    expect(r.salaryMin).toBeNull();
    expect(r.salaryMax).toBeNull();
    expect(r.salaryRange).toBe("competitive");
  });

  it("prefers structured amounts over the fallback", () => {
    const r = buildJobSalaryData({ salaryMin: 60000, salaryRangeFallback: "competitive" });
    expect(r.salaryMin).toBe(60000);
    expect(r.salaryRange).not.toBe("competitive");
  });
});
