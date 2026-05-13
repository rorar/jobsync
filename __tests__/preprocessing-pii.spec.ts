import { convertResumeToText } from "@/lib/connector/ai-provider/tools/preprocessing";
import {
  stripEmailPhonePatterns,
  convertJobToText,
} from "@/lib/connector/ai-provider/tools/preprocessing-job";
import type { Resume, ContactInfo, ResumeSection } from "@/models/profile.model";
import { SectionType } from "@/models/profile.model";
import type { JobResponse } from "@/models/job.model";

// ---------------------------------------------------------------------------
// Helpers — inline mock data
// ---------------------------------------------------------------------------

const makeContactInfo = (
  overrides: Partial<ContactInfo> = {},
): ContactInfo => ({
  id: "ci-1",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  resumeId: "res-1",
  firstName: "Jane",
  lastName: "Doe",
  headline: "Senior Software Engineer",
  email: "jane.doe@example.com",
  phone: "+49 170 1234567",
  address: "Musterstr. 1, 10115 Berlin",
  ...overrides,
});

const makeResumeSections = (): ResumeSection[] => [
  {
    id: "sec-exp",
    resumeId: "res-1",
    sectionTitle: "Experience",
    sectionType: SectionType.EXPERIENCE,
    workExperiences: [
      {
        id: "we-1",
        createdAt: new Date("2023-01-01"),
        updatedAt: new Date("2023-01-01"),
        companyId: "comp-1",
        jobTitleId: "jt-1",
        locationId: "loc-1",
        resumeSectionId: "sec-exp",
        Company: { id: "comp-1", label: "Acme Corp", value: "acme-corp", createdBy: "user-1" },
        jobTitle: { id: "jt-1", label: "Backend Developer", value: "backend-developer", createdBy: "user-1" },
        location: { id: "loc-1", label: "Berlin", value: "berlin", createdBy: "user-1" },
        startDate: new Date("2021-03-01"),
        endDate: null,
        currentJob: true,
        description: "Built APIs and microservices.",
      },
    ],
  },
  {
    id: "sec-edu",
    resumeId: "res-1",
    sectionTitle: "Education",
    sectionType: SectionType.EDUCATION,
    educations: [
      {
        id: "edu-1",
        createdAt: new Date("2020-01-01"),
        updatedAt: new Date("2020-01-01"),
        locationId: "loc-2",
        resumeSectionId: "sec-edu",
        institution: "TU Berlin",
        degree: "B.Sc.",
        fieldOfStudy: "Computer Science",
        startDate: new Date("2017-10-01"),
        endDate: new Date("2021-02-28"),
        description: null,
        location: { id: "loc-2", label: "Berlin", value: "berlin", createdBy: "user-1" },
      },
    ],
  },
];

const makeResume = (overrides: Partial<Resume> = {}): Resume => ({
  id: "res-1",
  profileId: "prof-1",
  title: "My Resume",
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  FileId: null,
  ContactInfo: makeContactInfo(),
  ResumeSections: makeResumeSections(),
  ...overrides,
});

const makeJobResponse = (overrides: Partial<JobResponse> = {}): JobResponse => ({
  id: "job-1",
  userId: "user-1",
  JobTitle: { id: "jt-1", label: "Frontend Developer", value: "frontend-developer", createdBy: "user-1" },
  Company: { id: "comp-1", label: "Widget Inc", value: "widget-inc", createdBy: "user-1" },
  Status: { id: "st-1", label: "Applied", value: "applied" },
  Location: { id: "loc-1", label: "Munich", value: "munich", createdBy: "user-1" },
  jobType: "full-time",
  createdAt: new Date("2025-06-01"),
  appliedDate: null,
  dueDate: null,
  salaryRange: null,
  description: "We are looking for a Frontend Developer. Contact: hr@widget.com or call +49 89 12345678.",
  jobUrl: null,
  applied: false,
  ...overrides,
});

// ===========================================================================
// convertResumeToText — PII stripping
// ===========================================================================

describe("convertResumeToText (PII stripping)", () => {
  it("without stripPii returns full contact info", async () => {
    const resume = makeResume();
    const text = await convertResumeToText(resume);

    expect(text).toContain("Jane Doe");
    expect(text).toContain("jane.doe@example.com");
    expect(text).toContain("+49 170 1234567");
    expect(text).toContain("Musterstr. 1, 10115 Berlin");
  });

  it("with stripPii=true replaces contact fields with placeholders", async () => {
    const resume = makeResume();
    const text = await convertResumeToText(resume, { stripPii: true });

    expect(text).toContain("[NAME]");
    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[PHONE]");
    expect(text).toContain("[ADDRESS]");

    expect(text).not.toContain("Jane Doe");
    expect(text).not.toContain("jane.doe@example.com");
    expect(text).not.toContain("+49 170 1234567");
    expect(text).not.toContain("Musterstr. 1, 10115 Berlin");
  });

  it("with stripPii=true keeps headline", async () => {
    const resume = makeResume();
    const text = await convertResumeToText(resume, { stripPii: true });

    expect(text).toContain("Senior Software Engineer");
  });

  it("with resumeCharLimit truncates output", async () => {
    const resume = makeResume();
    const fullText = await convertResumeToText(resume);
    const limit = 100;
    const truncated = await convertResumeToText(resume, { resumeCharLimit: limit });

    expect(fullText.length).toBeGreaterThan(limit);
    expect(truncated.length).toBe(limit);
    expect(truncated).toBe(fullText.slice(0, limit));
  });

  it("handles missing/null contact info gracefully", async () => {
    const resume = makeResume({ ContactInfo: undefined });
    const text = await convertResumeToText(resume);

    expect(text).toContain("My Resume");
    expect(text).not.toContain("CONTACT");
  });

  it("handles contact info with missing optional fields", async () => {
    const resume = makeResume({
      ContactInfo: makeContactInfo({
        email: "",
        phone: "",
        address: null,
      }),
    });
    const text = await convertResumeToText(resume, { stripPii: true });

    expect(text).toContain("[NAME]");
    // Empty email/phone should not produce Email/Phone lines
    expect(text).not.toContain("Email:");
    expect(text).not.toContain("Phone:");
    expect(text).not.toContain("Address:");
  });

  it("preserves work experience with stripPii=true", async () => {
    const resume = makeResume();
    const text = await convertResumeToText(resume, { stripPii: true });

    expect(text).toContain("EXPERIENCE");
    expect(text).toContain("Acme Corp");
    expect(text).toContain("Backend Developer");
    expect(text).toContain("Built APIs and microservices.");
  });

  it("preserves education with stripPii=true", async () => {
    const resume = makeResume();
    const text = await convertResumeToText(resume, { stripPii: true });

    expect(text).toContain("EDUCATION");
    expect(text).toContain("TU Berlin");
    expect(text).toContain("B.Sc.");
    expect(text).toContain("Computer Science");
  });
});

// ===========================================================================
// stripEmailPhonePatterns
// ===========================================================================

describe("stripEmailPhonePatterns", () => {
  it("replaces email addresses with [EMAIL]", () => {
    const input = "Send your CV to jobs@acme.com or hr@sub.domain.co.uk for review.";
    const result = stripEmailPhonePatterns(input);

    expect(result).toContain("[EMAIL]");
    expect(result).not.toContain("jobs@acme.com");
    expect(result).not.toContain("hr@sub.domain.co.uk");
  });

  it("replaces phone numbers (7+ digits) with [PHONE]", () => {
    const input = "Call us at +49 89 12345678 or (555) 123-4567.";
    const result = stripEmailPhonePatterns(input);

    expect(result).toContain("[PHONE]");
    expect(result).not.toContain("+49 89 12345678");
    expect(result).not.toContain("(555) 123-4567");
  });

  it("does not replace short digit sequences (fewer than 7 digits)", () => {
    const input = "We need 5 developers for project 42.";
    const result = stripEmailPhonePatterns(input);

    expect(result).not.toContain("[PHONE]");
    expect(result).toContain("5 developers");
    expect(result).toContain("project 42");
  });

  it("preserves non-PII text", () => {
    const input = "We are looking for a skilled developer with 5 years of experience.";
    const result = stripEmailPhonePatterns(input);

    expect(result).toBe(input);
  });

  it("handles text with both email and phone", () => {
    const input = "Contact: info@company.de, +49 170 9876543";
    const result = stripEmailPhonePatterns(input);

    expect(result).toContain("[EMAIL]");
    expect(result).toContain("[PHONE]");
    expect(result).not.toContain("info@company.de");
    expect(result).not.toContain("+49 170 9876543");
  });
});

// ===========================================================================
// convertJobToText — PII pattern stripping + char limit
// ===========================================================================

describe("convertJobToText (PII pattern stripping)", () => {
  it("with stripPiiPatterns applies pattern stripping to description", async () => {
    const job = makeJobResponse();
    const text = await convertJobToText(job, { stripPiiPatterns: true });

    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[PHONE]");
    expect(text).not.toContain("hr@widget.com");
    expect(text).not.toContain("+49 89 12345678");
    // Non-PII content preserved
    expect(text).toContain("Frontend Developer");
    expect(text).toContain("Widget Inc");
    expect(text).toContain("Munich");
  });

  it("without stripPiiPatterns keeps original description", async () => {
    const job = makeJobResponse();
    const text = await convertJobToText(job);

    expect(text).toContain("hr@widget.com");
    expect(text).toContain("+49 89 12345678");
  });

  it("with jobCharLimit truncates output", async () => {
    const job = makeJobResponse();
    const fullText = await convertJobToText(job);
    const limit = 50;
    const truncated = await convertJobToText(job, { jobCharLimit: limit });

    expect(fullText.length).toBeGreaterThan(limit);
    expect(truncated.length).toBe(limit);
    expect(truncated).toBe(fullText.slice(0, limit));
  });
});
