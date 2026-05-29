/**
 * runner-pii-redaction.spec.ts — GDPR S3 on the AUTOMATION path (flashlight).
 *
 * The automation runner serializes the resume for AI matching via its own
 * convertResumeForMatch(). Before this fix it emitted the contact's real
 * name/email/phone + all free text unconditionally and sent it to the user's
 * AI module — which can be a cloud provider (OpenAI/DeepSeek). This pins the
 * cloud-path redaction (stripPii) so the leak cannot regress.
 */

// Heavy runner imports stubbed at module load (mirrors runner-dedup-bounds.spec).
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: { findMany: jest.fn() },
    job: { findMany: jest.fn() },
    dedupHash: { findMany: jest.fn() },
    resume: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    automationRun: { create: jest.fn(), update: jest.fn() },
    automation: { update: jest.fn() },
  },
}));
jest.mock("@/lib/connector/register-all", () => ({}));
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { get: jest.fn(), create: jest.fn() },
}));
jest.mock("@/lib/connector/credential-resolver", () => ({ resolveCredential: jest.fn() }));
jest.mock("@/lib/connector/degradation", () => ({ checkConsecutiveRunFailures: jest.fn() }));
// IMPORTANT: provide the REAL scrubber so convertResumeForMatch can redact.
jest.mock("@/lib/connector/ai-provider", () => ({
  getModel: jest.fn(),
  JobMatchSchema: {},
  JOB_MATCH_SYSTEM_PROMPT: "",
  buildJobMatchPrompt: jest.fn(),
  stripEmailPhonePatterns: jest.requireActual(
    "@/lib/connector/ai-provider/tools/text-processing",
  ).stripEmailPhonePatterns,
}));
jest.mock("@/lib/automation-logger", () => ({
  automationLogger: { startRun: jest.fn(), endRun: jest.fn(), log: jest.fn() },
}));
jest.mock("@/lib/events", () => ({ emitEvent: jest.fn(), createEvent: jest.fn() }));
jest.mock("@/lib/debug", () => ({ debugLog: jest.fn() }));
jest.mock("@/lib/scheduler/run-coordinator", () => ({
  runCoordinator: { reportProgress: jest.fn() },
}));
jest.mock("@/lib/blacklist-query", () => ({
  getBlacklistEntriesForUser: jest.fn().mockResolvedValue([]),
}));
jest.mock("@/models/companyBlacklist.model", () => ({
  isCompanyBlacklisted: jest.fn().mockReturnValue(false),
}));
jest.mock("@/lib/connector/cache", () => ({
  connectorCache: { getOrFetch: jest.fn() },
  ConnectorCache: { buildKey: jest.fn() },
}));
jest.mock("@/lib/connector/job-discovery/staged-vacancy-mapper", () => ({
  mapDiscoveredVacancyToStagedInput: jest.fn(),
}));
jest.mock("@/lib/connector/job-discovery/schedule", () => ({ calculateNextRunAt: jest.fn() }));
jest.mock("ai", () => ({ generateText: jest.fn(), Output: { object: jest.fn() } }));

import { _testConvertResumeForMatch } from "@/lib/connector/job-discovery/runner";

// Minimal ResumeWithSections-shaped fixture (only the fields the serializer reads).
const makeResume = () =>
  ({
    title: "CV +49 151 22223333",
    ContactInfo: {
      firstName: "Jane",
      lastName: "Doe",
      headline: "Senior Dev | reachme@private.com",
      email: "jane.doe@example.com",
      phone: "+49 170 1234567",
    },
    ResumeSections: [
      { sectionType: "summary", summary: { content: "Engineer. Direct line: backdoor@gmail.com" } },
      {
        sectionType: "experience",
        workExperiences: [
          {
            Company: { label: "Acme Corp" },
            jobTitle: { label: "Backend Dev" },
            location: { label: "Berlin" },
            description: "Built APIs. Personal: jane.private@work.io (555) 987-6543.",
          },
        ],
      },
      {
        sectionType: "education",
        educations: [
          {
            institution: "TU Berlin",
            degree: "B.Sc.",
            fieldOfStudy: "Computer Science",
            description: "Advisor: advisor@tu-berlin.de",
          },
        ],
      },
    ],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;

describe("convertResumeForMatch — GDPR S3 cloud redaction (automation path)", () => {
  it("redacts contact fields + free-text email/phone when stripPii=true (cloud provider)", () => {
    const text = _testConvertResumeForMatch(makeResume(), true);

    // Structured contact fields → placeholders
    expect(text).toContain("[NAME]");
    expect(text).toContain("[EMAIL]");
    expect(text).toContain("[PHONE]");
    expect(text).not.toContain("Jane Doe");
    expect(text).not.toContain("jane.doe@example.com");
    expect(text).not.toContain("+49 170 1234567");

    // Free-text PII (title, headline, summary, experience, education) → scrubbed
    expect(text).not.toContain("reachme@private.com");
    expect(text).not.toContain("backdoor@gmail.com");
    expect(text).not.toContain("jane.private@work.io");
    expect(text).not.toContain("(555) 987-6543");
    expect(text).not.toContain("advisor@tu-berlin.de");
    expect(text).not.toContain("+49 151 22223333"); // in the title

    // Legitimate non-PII labels preserved
    expect(text).toContain("Acme Corp");
    expect(text).toContain("Backend Dev");
    expect(text).toContain("TU Berlin");
    expect(text).toContain("Computer Science");
  });

  it("keeps full fidelity when stripPii=false (local Ollama)", () => {
    const text = _testConvertResumeForMatch(makeResume(), false);

    expect(text).toContain("Jane Doe");
    expect(text).toContain("jane.doe@example.com");
    expect(text).toContain("+49 170 1234567");
    expect(text).toContain("backdoor@gmail.com");
    expect(text).toContain("jane.private@work.io");
    expect(text).toContain("advisor@tu-berlin.de");
  });

  it("defaults to full fidelity (stripPii omitted) — back-compat", () => {
    const text = _testConvertResumeForMatch(makeResume());
    expect(text).toContain("jane.doe@example.com");
  });
});
