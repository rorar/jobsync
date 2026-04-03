/**
 * Promoter — Initial JobStatusHistory entry test
 *
 * Verifies that promoteStagedVacancy() creates an initial
 * JobStatusHistory entry with previousStatusId: null when
 * promoting a staged vacancy to a Job. (S3-D7 fix)
 *
 * Spec: specs/crm-workflow.allium (rule InitialStatusOnPromotion)
 */

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

const mockFindFirst = jest.fn();
const mockUpdate = jest.fn();
const mockCreate = jest.fn();
const mockHistoryCreate = jest.fn();
const mockTx = {
  stagedVacancy: {
    findFirst: (...args: unknown[]) => mockFindFirst(...args),
    update: (...args: unknown[]) => mockUpdate(...args),
  },
  jobTitle: { findFirst: jest.fn(), create: jest.fn() },
  company: { findFirst: jest.fn(), create: jest.fn() },
  location: { findFirst: jest.fn(), create: jest.fn() },
  jobSource: { findFirst: jest.fn(), create: jest.fn() },
  jobStatus: { findFirst: jest.fn(), create: jest.fn() },
  job: { create: (...args: unknown[]) => mockCreate(...args) },
  jobStatusHistory: {
    create: (...args: unknown[]) => mockHistoryCreate(...args),
  },
};

const mockTransaction = jest.fn(
  async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findFirst: (...args: unknown[]) => mockFindFirst(...args),
    },
    $transaction: (...args: unknown[]) =>
      mockTransaction(args[0] as (tx: typeof mockTx) => Promise<unknown>),
  },
}));

jest.mock("@/lib/events", () => ({
  emitEvent: jest.fn(),
}));

// Import after mocks
import { promoteStagedVacancy } from "@/lib/connector/job-discovery/promoter";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("promoteStagedVacancy — initial history entry (S3-D7)", () => {
  const userId = "user-1";
  const vacancyId = "sv-1";
  const jobId = "job-1";
  const statusId = "status-bookmarked";

  beforeEach(() => {
    jest.clearAllMocks();

    // Staged vacancy found
    mockFindFirst.mockResolvedValue({
      id: vacancyId,
      userId,
      status: "staged",
      title: "Frontend Developer",
      employerName: "Acme Corp",
      location: "Berlin",
      sourceBoard: "eures",
      description: "A job",
      employmentType: "Full-time",
      salary: null,
      sourceUrl: "https://example.com/job/1",
    });

    // Reference data lookups
    mockTx.jobTitle.findFirst.mockResolvedValue({
      id: "jt-1",
      label: "Frontend Developer",
      value: "frontend developer",
    });
    mockTx.company.findFirst.mockResolvedValue({
      id: "co-1",
      label: "Acme Corp",
      value: "acme corp",
    });
    mockTx.location.findFirst.mockResolvedValue({
      id: "loc-1",
      label: "Berlin",
      value: "berlin",
    });
    mockTx.jobSource.findFirst.mockResolvedValue({
      id: "js-1",
      label: "Eures",
      value: "eures",
    });
    mockTx.jobStatus.findFirst.mockResolvedValue({
      id: statusId,
      value: "bookmarked",
      label: "Bookmarked",
    });

    // Job creation
    mockCreate.mockResolvedValue({ id: jobId });

    // History creation
    mockHistoryCreate.mockResolvedValue({ id: "hist-1" });

    // Staged vacancy update (processing + promoted)
    mockUpdate.mockResolvedValue({});
  });

  it("should create a JobStatusHistory entry with previousStatusId: null", async () => {
    await promoteStagedVacancy(
      { stagedVacancyId: vacancyId },
      userId,
    );

    expect(mockHistoryCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockHistoryCreate.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      jobId,
      userId,
      previousStatusId: null,
      newStatusId: statusId,
      note: null,
    });
    expect(createArgs.data.changedAt).toBeInstanceOf(Date);
  });

  it("should create history BEFORE linking the staged vacancy back", async () => {
    const callOrder: string[] = [];

    mockHistoryCreate.mockImplementation(async () => {
      callOrder.push("historyCreate");
      return { id: "hist-1" };
    });

    mockUpdate.mockImplementation(async (args: Record<string, unknown>) => {
      const data = (args as { data?: { status?: string } }).data;
      if (data?.status === "promoted") {
        callOrder.push("linkBack");
      }
      return {};
    });

    await promoteStagedVacancy(
      { stagedVacancyId: vacancyId },
      userId,
    );

    expect(callOrder).toEqual(["historyCreate", "linkBack"]);
  });

  it("should return the jobId and stagedVacancyId on success", async () => {
    const result = await promoteStagedVacancy(
      { stagedVacancyId: vacancyId },
      userId,
    );

    expect(result).toEqual({
      jobId,
      stagedVacancyId: vacancyId,
    });
  });
});
