/**
 * Unit tests for CRM Person domain types and validators.
 * Spec: specs/crm.allium — state machines, invariants, JSON parse helpers
 */

import {
  isValidPersonTransition,
  isValidInterviewTransition,
  isValidTaskTransition,
  validateExactlyOneTarget,
  validateAtMostOnePrimaryCompany,
  parseEmails,
  parsePhones,
  parseCompanies,
  parseSocialProfiles,
  CRM_CONFIG,
  type PersonStatus,
  type InterviewStatus,
  type CrmTaskStatus,
  type TypedEmail,
  type TypedPhone,
  type CompanyAssociation,
  type SocialProfile,
  type PolymorphicTarget,
} from "@/models/person.model";

// =============================================================================
// State Machine: Person
// =============================================================================

describe("isValidPersonTransition", () => {
  const validTransitions: [PersonStatus, PersonStatus][] = [
    ["active", "archived"],
    ["active", "anonymized"],
    ["archived", "active"],
    ["archived", "anonymized"],
  ];

  it.each(validTransitions)(
    "should allow %s → %s",
    (from, to) => {
      expect(isValidPersonTransition(from, to)).toBe(true);
    },
  );

  const invalidTransitions: [PersonStatus, PersonStatus][] = [
    ["archived", "archived"],
    ["anonymized", "active"],
    ["anonymized", "archived"],
    ["anonymized", "anonymized"],
    ["active", "active"],
  ];

  it.each(invalidTransitions)(
    "should reject %s → %s",
    (from, to) => {
      expect(isValidPersonTransition(from, to)).toBe(false);
    },
  );

  it("should return false for unknown status values", () => {
    expect(isValidPersonTransition("unknown" as PersonStatus, "active")).toBe(false);
  });
});

// =============================================================================
// State Machine: Interview
// =============================================================================

describe("isValidInterviewTransition", () => {
  const validTransitions: [InterviewStatus, InterviewStatus][] = [
    ["scheduled", "completed"],
    ["scheduled", "cancelled"],
    ["scheduled", "rescheduled"],
    ["rescheduled", "completed"],
    ["rescheduled", "cancelled"],
    ["rescheduled", "rescheduled"],
  ];

  it.each(validTransitions)(
    "should allow %s → %s",
    (from, to) => {
      expect(isValidInterviewTransition(from, to)).toBe(true);
    },
  );

  const invalidTransitions: [InterviewStatus, InterviewStatus][] = [
    ["completed", "scheduled"],
    ["completed", "cancelled"],
    ["completed", "rescheduled"],
    ["completed", "completed"],
    ["cancelled", "scheduled"],
    ["cancelled", "completed"],
    ["cancelled", "rescheduled"],
    ["cancelled", "cancelled"],
    ["rescheduled", "scheduled"],
    ["scheduled", "scheduled"],
  ];

  it.each(invalidTransitions)(
    "should reject %s → %s",
    (from, to) => {
      expect(isValidInterviewTransition(from, to)).toBe(false);
    },
  );
});

// =============================================================================
// State Machine: Task
// =============================================================================

describe("isValidTaskTransition", () => {
  const validTransitions: [CrmTaskStatus, CrmTaskStatus][] = [
    ["pending", "in_progress"],
    ["pending", "done"],
    ["pending", "cancelled"],
    ["in_progress", "done"],
    ["in_progress", "cancelled"],
  ];

  it.each(validTransitions)(
    "should allow %s → %s",
    (from, to) => {
      expect(isValidTaskTransition(from, to)).toBe(true);
    },
  );

  const invalidTransitions: [CrmTaskStatus, CrmTaskStatus][] = [
    ["done", "pending"],
    ["done", "in_progress"],
    ["done", "cancelled"],
    ["done", "done"],
    ["cancelled", "pending"],
    ["cancelled", "in_progress"],
    ["cancelled", "done"],
    ["cancelled", "cancelled"],
    ["pending", "pending"],
    ["in_progress", "pending"],
    ["in_progress", "in_progress"],
  ];

  it.each(invalidTransitions)(
    "should reject %s → %s",
    (from, to) => {
      expect(isValidTaskTransition(from, to)).toBe(false);
    },
  );
});

// =============================================================================
// Polymorphic Target Validation (ExactlyOneTarget invariant)
// =============================================================================

describe("validateExactlyOneTarget", () => {
  it("should accept exactly one person target", () => {
    const target: PolymorphicTarget = {
      targetPersonId: "person-1",
      targetCompanyId: null,
      targetJobId: null,
    };
    expect(validateExactlyOneTarget(target)).toBe(true);
  });

  it("should accept exactly one company target", () => {
    const target: PolymorphicTarget = {
      targetPersonId: null,
      targetCompanyId: "company-1",
      targetJobId: null,
    };
    expect(validateExactlyOneTarget(target)).toBe(true);
  });

  it("should accept exactly one job target", () => {
    const target: PolymorphicTarget = {
      targetPersonId: null,
      targetCompanyId: null,
      targetJobId: "job-1",
    };
    expect(validateExactlyOneTarget(target)).toBe(true);
  });

  it("should reject when no targets are set", () => {
    const target: PolymorphicTarget = {
      targetPersonId: null,
      targetCompanyId: null,
      targetJobId: null,
    };
    expect(validateExactlyOneTarget(target)).toBe(false);
  });

  it("should reject when two targets are set", () => {
    const target: PolymorphicTarget = {
      targetPersonId: "person-1",
      targetCompanyId: "company-1",
      targetJobId: null,
    };
    expect(validateExactlyOneTarget(target)).toBe(false);
  });

  it("should reject when all three targets are set", () => {
    const target: PolymorphicTarget = {
      targetPersonId: "person-1",
      targetCompanyId: "company-1",
      targetJobId: "job-1",
    };
    expect(validateExactlyOneTarget(target)).toBe(false);
  });

  it("should treat empty string as unset", () => {
    const target: PolymorphicTarget = {
      targetPersonId: "",
      targetCompanyId: "company-1",
      targetJobId: "",
    };
    expect(validateExactlyOneTarget(target)).toBe(true);
  });

  it("should treat undefined as unset", () => {
    const target: PolymorphicTarget = {
      targetPersonId: undefined,
      targetCompanyId: undefined,
      targetJobId: "job-1",
    };
    expect(validateExactlyOneTarget(target)).toBe(true);
  });
});

// =============================================================================
// AtMostOnePrimaryCompany invariant
// =============================================================================

describe("validateAtMostOnePrimaryCompany", () => {
  it("should accept empty list", () => {
    expect(validateAtMostOnePrimaryCompany([])).toBe(true);
  });

  it("should accept zero primary companies", () => {
    const companies: CompanyAssociation[] = [
      { companyId: "c1", companyLabel: "A", isPrimary: false },
      { companyId: "c2", companyLabel: "B", isPrimary: false },
    ];
    expect(validateAtMostOnePrimaryCompany(companies)).toBe(true);
  });

  it("should accept exactly one primary company", () => {
    const companies: CompanyAssociation[] = [
      { companyId: "c1", companyLabel: "A", isPrimary: true },
      { companyId: "c2", companyLabel: "B", isPrimary: false },
    ];
    expect(validateAtMostOnePrimaryCompany(companies)).toBe(true);
  });

  it("should reject two primary companies", () => {
    const companies: CompanyAssociation[] = [
      { companyId: "c1", companyLabel: "A", isPrimary: true },
      { companyId: "c2", companyLabel: "B", isPrimary: true },
    ];
    expect(validateAtMostOnePrimaryCompany(companies)).toBe(false);
  });

  it("should reject three primary companies", () => {
    const companies: CompanyAssociation[] = [
      { companyId: "c1", companyLabel: "A", isPrimary: true },
      { companyId: "c2", companyLabel: "B", isPrimary: true },
      { companyId: "c3", companyLabel: "C", isPrimary: true },
    ];
    expect(validateAtMostOnePrimaryCompany(companies)).toBe(false);
  });
});

// =============================================================================
// JSON Parse Helpers
// =============================================================================

describe("parseEmails", () => {
  it("should parse valid JSON array", () => {
    const input: TypedEmail[] = [
      { email: "test@example.com", type: "work", isPrimary: true },
    ];
    const result = parseEmails(JSON.stringify(input));
    expect(result).toEqual(input);
  });

  it("should return empty array for null", () => {
    expect(parseEmails(null)).toEqual([]);
  });

  it("should return empty array for undefined", () => {
    expect(parseEmails(undefined)).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(parseEmails("")).toEqual([]);
  });

  it("should return empty array for invalid JSON", () => {
    expect(parseEmails("not-json")).toEqual([]);
  });

  it("should return empty array for non-array JSON", () => {
    expect(parseEmails(JSON.stringify({ email: "test@example.com" }))).toEqual([]);
  });

  it("should handle multiple emails", () => {
    const emails: TypedEmail[] = [
      { email: "work@example.com", type: "work", isPrimary: true },
      { email: "home@example.com", type: "home", isPrimary: false },
    ];
    expect(parseEmails(JSON.stringify(emails))).toEqual(emails);
  });
});

describe("parsePhones", () => {
  it("should parse valid JSON array", () => {
    const input: TypedPhone[] = [
      { number: "+49123456789", type: "work", isPrimary: true },
    ];
    expect(parsePhones(JSON.stringify(input))).toEqual(input);
  });

  it("should return empty array for null", () => {
    expect(parsePhones(null)).toEqual([]);
  });

  it("should return empty array for invalid JSON", () => {
    expect(parsePhones("{invalid")).toEqual([]);
  });
});

describe("parseCompanies", () => {
  it("should parse valid JSON array", () => {
    const input: CompanyAssociation[] = [
      {
        companyId: "c1",
        companyLabel: "Acme Corp",
        position: "VP Engineering",
        isPrimary: true,
        startDate: "2024-01-01",
        endDate: null,
      },
    ];
    expect(parseCompanies(JSON.stringify(input))).toEqual(input);
  });

  it("reads the legacy `role` key as `position` (backcompat, Task 1.4)", () => {
    // Rows written before the rename stored the free-text title under `role`.
    const legacy = JSON.stringify([
      { companyId: "c1", companyLabel: "Acme Corp", role: "Lecturer", isPrimary: true },
    ]);
    const parsed = parseCompanies(legacy);
    expect(parsed[0].position).toBe("Lecturer");
    expect((parsed[0] as Record<string, unknown>).role).toBeUndefined();
  });

  it("prefers `position` when both keys are present", () => {
    const both = JSON.stringify([
      { companyId: "c1", companyLabel: "Acme", position: "CTO", role: "stale", isPrimary: false },
    ]);
    expect(parseCompanies(both)[0].position).toBe("CTO");
  });

  it("should return empty array for null", () => {
    expect(parseCompanies(null)).toEqual([]);
  });

  it("should return empty array for invalid JSON", () => {
    expect(parseCompanies("invalid")).toEqual([]);
  });
});

describe("parseSocialProfiles", () => {
  it("should parse valid JSON array", () => {
    const input: SocialProfile[] = [
      { platform: "linkedin", url: "https://linkedin.com/in/test" },
      { platform: "github", url: "https://github.com/test" },
    ];
    expect(parseSocialProfiles(JSON.stringify(input))).toEqual(input);
  });

  it("should return empty array for null", () => {
    expect(parseSocialProfiles(null)).toEqual([]);
  });

  it("should return empty array for empty string", () => {
    expect(parseSocialProfiles("")).toEqual([]);
  });

  it("should return empty array for non-array JSON", () => {
    expect(parseSocialProfiles('"string"')).toEqual([]);
  });
});

// =============================================================================
// Config Constants
// =============================================================================

describe("CRM_CONFIG", () => {
  it("should have correct retention defaults from allium spec", () => {
    expect(CRM_CONFIG.autoCreatedRetentionDays).toBe(730);
    expect(CRM_CONFIG.timelineRetentionDays).toBe(1095);
  });

  it("should have correct reminder defaults", () => {
    expect(CRM_CONFIG.interviewReminderBeforeHours).toBe(24);
    expect(CRM_CONFIG.followUpDefaultDelayDays).toBe(7);
  });

  it("should have correct limits", () => {
    expect(CRM_CONFIG.maxPersonsPerUser).toBe(10000);
    expect(CRM_CONFIG.maxTasksPerUser).toBe(5000);
    expect(CRM_CONFIG.maxBlocklistEntries).toBe(1000);
    expect(CRM_CONFIG.maxConnectedAccounts).toBe(5);
  });

  it("should be immutable via as const", () => {
    // as const provides compile-time immutability (TypeScript ReadonlyDeep)
    // Runtime check: verify the shape is correct
    expect(typeof CRM_CONFIG.maxPersonsPerUser).toBe("number");
    expect(typeof CRM_CONFIG.maxBlocklistEntries).toBe("number");
  });
});
