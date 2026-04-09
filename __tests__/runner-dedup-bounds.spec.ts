/**
 * Runner dedup scan time-bound regression guard (Sprint 2 H-P-07).
 *
 * The dedup scan in job-discovery/runner.ts used to pull every
 * non-dismissed StagedVacancy the user had ever received for a sourceBoard,
 * which scaled unboundedly with staging history. This spec pins the
 * 90-day window and the status exclusion set so future changes cannot
 * regress the bound.
 */

// ---------------------------------------------------------------------------
// Mock Prisma + heavy runner imports (AI, scheduler, modules)
// ---------------------------------------------------------------------------

const mockStagedFindMany = jest.fn();
const mockJobFindMany = jest.fn();
const mockDedupHashFindMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: { findMany: (...args: unknown[]) => mockStagedFindMany(...args) },
    job: { findMany: (...args: unknown[]) => mockJobFindMany(...args) },
    dedupHash: { findMany: (...args: unknown[]) => mockDedupHashFindMany(...args) },
    // Stubs for the remaining surface the runner imports at module load
    resume: { findUnique: jest.fn() },
    userSettings: { findUnique: jest.fn() },
    automationRun: { create: jest.fn(), update: jest.fn() },
    automation: { update: jest.fn() },
  },
}));

// The runner pulls in AI, scheduler, and module registration at the top of
// the file. Stub them out so the spec can import only the dedup helper.
jest.mock("@/lib/connector/register-all", () => ({}));
jest.mock("@/lib/connector/registry", () => ({
  moduleRegistry: { get: jest.fn(), create: jest.fn() },
}));
jest.mock("@/lib/connector/credential-resolver", () => ({
  resolveCredential: jest.fn(),
}));
jest.mock("@/lib/connector/degradation", () => ({
  checkConsecutiveRunFailures: jest.fn(),
}));
jest.mock("@/lib/connector/ai-provider", () => ({
  getModel: jest.fn(),
  JobMatchSchema: {},
  JOB_MATCH_SYSTEM_PROMPT: "",
  buildJobMatchPrompt: jest.fn(),
}));
jest.mock("@/lib/automation-logger", () => ({
  automationLogger: { startRun: jest.fn(), endRun: jest.fn(), log: jest.fn() },
}));
jest.mock("@/lib/events", () => ({ emitEvent: jest.fn() }));
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
jest.mock("@/lib/connector/job-discovery/schedule", () => ({
  calculateNextRunAt: jest.fn(),
}));
jest.mock("ai", () => ({
  generateText: jest.fn(),
  Output: { object: jest.fn() },
}));

// Import after mocks
import { _testGetExistingVacancyKeys } from "@/lib/connector/job-discovery/runner";

describe("runner.getExistingVacancyKeys — H-P-07 bounded dedup scan", () => {
  const userId = "user-1";
  const sourceBoard = "eures";

  beforeEach(() => {
    jest.clearAllMocks();
    mockStagedFindMany.mockResolvedValue([]);
    mockJobFindMany.mockResolvedValue([]);
    mockDedupHashFindMany.mockResolvedValue([]);
  });

  it("bounds the StagedVacancy scan to the last 90 days via createdAt", async () => {
    const before = Date.now();

    await _testGetExistingVacancyKeys(userId, sourceBoard);

    expect(mockStagedFindMany).toHaveBeenCalledTimes(1);
    const call = mockStagedFindMany.mock.calls[0][0];
    expect(call.where.userId).toBe(userId);
    expect(call.where.sourceBoard).toBe(sourceBoard);

    // Must include a createdAt gte constraint (the fix for H-P-07)
    expect(call.where.createdAt).toBeDefined();
    expect(call.where.createdAt.gte).toBeInstanceOf(Date);

    const cutoff = (call.where.createdAt.gte as Date).getTime();

    // The production code uses `date.setDate(date.getDate() - 90)` which is
    // calendar-aware (handles DST transitions by keeping local time
    // constant). Raw ms subtraction (90 * 86400 * 1000) drifts by the DST
    // offset on transition days — which breaks this test in Europe/Berlin
    // for any spring-forward or fall-back day. Mirror the production logic
    // when computing the expected cutoff so the assertion is DST-stable.
    const expectedCutoff = new Date(before);
    expectedCutoff.setDate(expectedCutoff.getDate() - 90);
    expect(
      Math.abs(cutoff - expectedCutoff.getTime()),
    ).toBeLessThan(60 * 1000);
  });

  it("excludes dismissed AND promoted statuses from the dedup scan", async () => {
    await _testGetExistingVacancyKeys(userId, sourceBoard);

    const call = mockStagedFindMany.mock.calls[0][0];
    // Status filter must be notIn ["dismissed", "promoted"] — dismissed
    // rows are retention-purged (handled via DedupHash arm), promoted
    // rows live in the Job aggregate (handled via Job.jobUrl arm).
    expect(call.where.status).toEqual({
      notIn: ["dismissed", "promoted"],
    });
  });

  it("also bounds the Job arm and DedupHash arm to 90 days (symmetry)", async () => {
    await _testGetExistingVacancyKeys(userId, sourceBoard);

    const jobCall = mockJobFindMany.mock.calls[0][0];
    expect(jobCall.where.userId).toBe(userId);
    expect(jobCall.where.createdAt.gte).toBeInstanceOf(Date);

    const dedupCall = mockDedupHashFindMany.mock.calls[0][0];
    expect(dedupCall.where.userId).toBe(userId);
    expect(dedupCall.where.sourceBoard).toBe(sourceBoard);
    expect(dedupCall.where.createdAt.gte).toBeInstanceOf(Date);
  });

  it("returns populated key/hash sets from the three arms", async () => {
    mockStagedFindMany.mockResolvedValueOnce([
      { externalId: "ext-1", sourceUrl: "https://example.com/a" },
      { externalId: null, sourceUrl: "https://example.com/b" },
    ]);
    mockJobFindMany.mockResolvedValueOnce([
      { jobUrl: "https://example.com/promoted" },
    ]);
    mockDedupHashFindMany.mockResolvedValueOnce([
      { hash: "abc123" },
      { hash: "def456" },
    ]);

    const result = await _testGetExistingVacancyKeys(userId, sourceBoard);

    expect(result.keys.has("ext-1")).toBe(true);
    expect(result.dedupHashes.has("abc123")).toBe(true);
    expect(result.dedupHashes.has("def456")).toBe(true);
  });
});
