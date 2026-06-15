/**
 * jobContactRole.spec.ts — Welle 5 (Inside Track) Phase 1, Task 1.1
 *
 * Runtime membership validation for the erased JobContactRole union (ADR-019).
 * Controlled vocabulary for a Person's function in a hiring process (the
 * JobContact link). SoT: specs/crm.allium `enum JobContactRole`. There is
 * deliberately NO `other` member (Allium: force ambiguity into the open).
 */

import {
  JOB_CONTACT_ROLES,
  isValidJobContactRole,
} from "@/models/job.model";

describe("JOB_CONTACT_ROLES + isValidJobContactRole", () => {
  it("exposes the canonical contact roles (crm.allium SoT)", () => {
    expect(JOB_CONTACT_ROLES).toEqual([
      "recruiter",
      "hiring_manager",
      "hr",
      "referral",
      "tipster",
      "interviewer",
      "decision_maker",
    ]);
  });

  it("accepts every canonical value", () => {
    for (const value of JOB_CONTACT_ROLES) {
      expect(isValidJobContactRole(value)).toBe(true);
    }
  });

  it("rejects unknown strings (boundary defence)", () => {
    expect(isValidJobContactRole("other")).toBe(false);
    expect(isValidJobContactRole("manager")).toBe(false);
    expect(isValidJobContactRole("")).toBe(false);
    expect(isValidJobContactRole("Recruiter")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidJobContactRole(null)).toBe(false);
    expect(isValidJobContactRole(undefined)).toBe(false);
    expect(isValidJobContactRole(0)).toBe(false);
    expect(isValidJobContactRole({})).toBe(false);
    expect(isValidJobContactRole(["recruiter"])).toBe(false);
  });
});
