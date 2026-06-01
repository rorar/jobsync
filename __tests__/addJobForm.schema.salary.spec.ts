/**
 * addJobForm.schema.salary.spec.ts — Welle 2 Phase 4 (full-review F2)
 *
 * Locks the salary validation added to the shared Add/Edit-Job form schema:
 *   - salaryMax >= salaryMin (compensation.allium SalaryMaxGteMin) via superRefine
 *   - bonus.percentage capped at 1000
 *   - period restricted to SALARY_PERIODS
 */

import { AddJobFormSchema } from "@/models/addJobForm.schema";

const base = {
  title: "Senior Engineer",
  company: "Acme Corp",
  location: "Berlin",
  type: "Full-time",
  source: "Indeed",
  status: "bookmarked",
  jobDescription: "A sufficiently long job description.",
};

describe("AddJobFormSchema — salary", () => {
  it("accepts a valid structured range", () => {
    const r = AddJobFormSchema.safeParse({
      ...base,
      salaryMin: 50000,
      salaryMax: 70000,
      salaryCurrency: "EUR",
      salaryPeriod: "yearly",
    });
    expect(r.success).toBe(true);
  });

  it("accepts a Fixum (min === max)", () => {
    expect(
      AddJobFormSchema.safeParse({ ...base, salaryMin: 60000, salaryMax: 60000 }).success,
    ).toBe(true);
  });

  it("rejects an inverted range (min > max)", () => {
    const r = AddJobFormSchema.safeParse({ ...base, salaryMin: 90000, salaryMax: 50000 });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.some((i) => i.path.includes("salaryMax"))).toBe(true);
    }
  });

  it("rejects a negative amount", () => {
    expect(AddJobFormSchema.safeParse({ ...base, salaryMin: -1 }).success).toBe(false);
  });

  it("rejects a bonus percentage above 1000", () => {
    expect(
      AddJobFormSchema.safeParse({
        ...base,
        salaryBonus: { kind: "percentage", percentage: 5000 },
      }).success,
    ).toBe(false);
  });

  it("rejects an unknown period", () => {
    expect(
      AddJobFormSchema.safeParse({ ...base, salaryPeriod: "weekly" }).success,
    ).toBe(false);
  });
});
