/**
 * RED phase test — Finding F10: AddJobFormSchema default should not be "draft"
 *
 * The AddJobFormSchema still uses .default("draft") for the status field.
 * After the CRM status rename (S3), the initial status was renamed from
 * "draft" to "bookmarked". The schema default was never updated.
 *
 * While "draft" is mapped as a legacy value in the status machine's
 * VALID_TRANSITIONS, the form schema should use the canonical status name
 * "bookmarked" as its default — not the legacy "draft".
 *
 * This test SHOULD FAIL because the schema still defaults to "draft".
 */

import { AddJobFormSchema } from "@/models/addJobForm.schema";

describe("AddJobFormSchema defaults — F10", () => {
  // Minimal valid input that triggers all defaults
  const minimalValidInput = {
    title: "Software Engineer",
    company: "Acme Corp",
    location: "Berlin",
    type: "FT",
    source: "LinkedIn",
    // status intentionally omitted — should use default
    dueDate: new Date("2026-06-01"),
    salaryRange: "50000-70000",
    jobDescription: "A great job opportunity for experienced engineers",
  };

  it("default status should not be 'draft' (renamed to 'bookmarked')", () => {
    const result = AddJobFormSchema.parse(minimalValidInput);
    // The default should be "bookmarked", not the legacy "draft" value
    expect(result.status).not.toBe("draft");
  });

  it("default status should be 'bookmarked' (canonical name after CRM rename)", () => {
    const result = AddJobFormSchema.parse(minimalValidInput);
    expect(result.status).toBe("bookmarked");
  });

  // F-AJ-04: due date is optional (Job.dueDate is DateTime? in the DB).
  it("parses successfully when dueDate is omitted (optional)", () => {
    const { dueDate, ...withoutDueDate } = minimalValidInput;
    void dueDate;
    const result = AddJobFormSchema.parse(withoutDueDate);
    expect(result.dueDate).toBeUndefined();
  });

  it("still accepts a provided dueDate", () => {
    const result = AddJobFormSchema.parse(minimalValidInput);
    expect(result.dueDate).toEqual(new Date("2026-06-01"));
  });

  // F-AJ-04: the Clear button emits null (RHF ignores undefined). The schema
  // must accept null so a cleared due date validates on submit.
  it("accepts null dueDate (the value the Clear action emits)", () => {
    const result = AddJobFormSchema.parse({ ...minimalValidInput, dueDate: null });
    expect(result.dueDate).toBeNull();
  });
});
