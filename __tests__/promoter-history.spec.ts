/**
 * Promoter — Initial JobStatusHistory entry test
 *
 * Verifies that promoteStagedVacancy() creates an initial JobStatusHistory
 * entry with previousStatusId: null when promoting a staged vacancy to a
 * Job. (S3-D7 fix)
 *
 * Spec: specs/crm-workflow.allium (rule InitialStatusOnPromotion)
 *
 * Sprint 2 H-P-08: promoter.ts was refactored to move reference-data
 * fuzzy scans OUT of the write transaction. Reference-data lookups now
 * happen against the non-transactional `db` client first, then the
 * short-lived transaction only runs the final insert/update path with
 * pre-computed IDs. These mocks reflect that two-phase structure.
 */

// ---------------------------------------------------------------------------
// Mock setup
// ---------------------------------------------------------------------------

// Non-transactional (Phase 1) reference-data lookups
const mockDbFindFirst = jest.fn();
const mockJobTitleFindFirst = jest.fn();
const mockJobTitleCreate = jest.fn();
const mockCompanyFindFirst = jest.fn();
const mockCompanyCreate = jest.fn();
const mockLocationFindFirst = jest.fn();
const mockLocationCreate = jest.fn();
const mockJobSourceFindFirst = jest.fn();
const mockJobSourceCreate = jest.fn();
const mockJobStatusFindFirst = jest.fn();
const mockJobStatusCreate = jest.fn();

// Transactional (Phase 2) mocks
const mockTxStagedVacancyFindFirst = jest.fn();
const mockTxStagedVacancyUpdate = jest.fn();
const mockTxJobCreate = jest.fn();
const mockTxHistoryCreate = jest.fn();

const mockTx = {
  stagedVacancy: {
    findFirst: (...args: unknown[]) => mockTxStagedVacancyFindFirst(...args),
    update: (...args: unknown[]) => mockTxStagedVacancyUpdate(...args),
  },
  job: { create: (...args: unknown[]) => mockTxJobCreate(...args) },
  jobStatusHistory: {
    create: (...args: unknown[]) => mockTxHistoryCreate(...args),
  },
};

const mockTransaction = jest.fn(
  async (fn: (tx: typeof mockTx) => Promise<unknown>) => fn(mockTx),
);

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    stagedVacancy: {
      findFirst: (...args: unknown[]) => mockDbFindFirst(...args),
    },
    jobTitle: {
      findFirst: (...args: unknown[]) => mockJobTitleFindFirst(...args),
      create: (...args: unknown[]) => mockJobTitleCreate(...args),
    },
    company: {
      findFirst: (...args: unknown[]) => mockCompanyFindFirst(...args),
      create: (...args: unknown[]) => mockCompanyCreate(...args),
    },
    location: {
      findFirst: (...args: unknown[]) => mockLocationFindFirst(...args),
      create: (...args: unknown[]) => mockLocationCreate(...args),
    },
    jobSource: {
      findFirst: (...args: unknown[]) => mockJobSourceFindFirst(...args),
      create: (...args: unknown[]) => mockJobSourceCreate(...args),
    },
    jobStatus: {
      findFirst: (...args: unknown[]) => mockJobStatusFindFirst(...args),
      create: (...args: unknown[]) => mockJobStatusCreate(...args),
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

    // Phase 1: initial vacancy read + reference-data resolves
    mockDbFindFirst.mockResolvedValue({
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

    mockJobTitleFindFirst.mockResolvedValue({
      id: "jt-1",
      label: "Frontend Developer",
      value: "frontend developer",
    });
    mockCompanyFindFirst.mockResolvedValue({
      id: "co-1",
      label: "Acme Corp",
      value: "acme corp",
    });
    mockLocationFindFirst.mockResolvedValue({
      id: "loc-1",
      label: "Berlin",
      value: "berlin",
    });
    mockJobSourceFindFirst.mockResolvedValue({
      id: "js-1",
      label: "Eures",
      value: "eures",
    });
    mockJobStatusFindFirst.mockResolvedValue({
      id: statusId,
      value: "bookmarked",
      label: "Bookmarked",
    });

    // Phase 2: re-validation inside the tx
    mockTxStagedVacancyFindFirst.mockResolvedValue({
      id: vacancyId,
      status: "staged",
    });
    mockTxStagedVacancyUpdate.mockResolvedValue({});

    // Job creation
    mockTxJobCreate.mockResolvedValue({ id: jobId });

    // History creation
    mockTxHistoryCreate.mockResolvedValue({ id: "hist-1" });
  });

  it("should create a JobStatusHistory entry with previousStatusId: null", async () => {
    await promoteStagedVacancy({ stagedVacancyId: vacancyId }, userId);

    expect(mockTxHistoryCreate).toHaveBeenCalledTimes(1);
    const createArgs = mockTxHistoryCreate.mock.calls[0][0];
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

    mockTxHistoryCreate.mockImplementation(async () => {
      callOrder.push("historyCreate");
      return { id: "hist-1" };
    });

    mockTxStagedVacancyUpdate.mockImplementation(async (args: Record<string, unknown>) => {
      const data = (args as { data?: { status?: string } }).data;
      if (data?.status === "promoted") {
        callOrder.push("linkBack");
      }
      return {};
    });

    await promoteStagedVacancy({ stagedVacancyId: vacancyId }, userId);

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

  // ───────────────────────────────────────────────────────────────────────
  // H-P-08 regression guard
  // ───────────────────────────────────────────────────────────────────────

  describe("H-P-08 regression guard: reference-data scans outside the tx", () => {
    it("resolves all reference data via the non-transactional db client BEFORE $transaction fires", async () => {
      const callOrder: string[] = [];

      mockJobTitleFindFirst.mockImplementation(async (args: unknown) => {
        callOrder.push("phase1:jobTitle.findFirst");
        return { id: "jt-1", label: "Frontend Developer", value: "frontend developer" };
      });
      mockCompanyFindFirst.mockImplementation(async () => {
        callOrder.push("phase1:company.findFirst");
        return { id: "co-1", label: "Acme Corp", value: "acme corp" };
      });
      mockLocationFindFirst.mockImplementation(async () => {
        callOrder.push("phase1:location.findFirst");
        return { id: "loc-1", label: "Berlin", value: "berlin" };
      });
      mockJobSourceFindFirst.mockImplementation(async () => {
        callOrder.push("phase1:jobSource.findFirst");
        return { id: "js-1", label: "Eures", value: "eures" };
      });
      mockJobStatusFindFirst.mockImplementation(async () => {
        callOrder.push("phase1:jobStatus.findFirst");
        return { id: statusId, value: "bookmarked", label: "Bookmarked" };
      });

      mockTransaction.mockImplementation(async (fn: (tx: typeof mockTx) => Promise<unknown>) => {
        callOrder.push("phase2:transactionStart");
        return fn(mockTx);
      });

      await promoteStagedVacancy({ stagedVacancyId: vacancyId }, userId);

      // All reference-data resolves must precede the transaction start
      const txStartIdx = callOrder.indexOf("phase2:transactionStart");
      expect(txStartIdx).toBeGreaterThan(-1);

      for (let i = 0; i < txStartIdx; i++) {
        expect(callOrder[i].startsWith("phase1:")).toBe(true);
      }
    });

    it("re-validates the vacancy status inside the transaction (race-safety)", async () => {
      await promoteStagedVacancy({ stagedVacancyId: vacancyId }, userId);

      // Inside the tx we re-read the vacancy to catch concurrent status changes
      expect(mockTxStagedVacancyFindFirst).toHaveBeenCalledWith({
        where: { id: vacancyId, userId },
        select: { id: true, status: true },
      });
    });

    it("throws 'Already promoted' if the vacancy was promoted between phase 1 and phase 2", async () => {
      // Phase 1 sees it as staged, phase 2 re-read sees it as promoted
      mockTxStagedVacancyFindFirst.mockResolvedValueOnce({
        id: vacancyId,
        status: "promoted",
      });

      await expect(
        promoteStagedVacancy({ stagedVacancyId: vacancyId }, userId),
      ).rejects.toThrow("Already promoted");

      // Phase 2 must NOT create a Job or history row
      expect(mockTxJobCreate).not.toHaveBeenCalled();
      expect(mockTxHistoryCreate).not.toHaveBeenCalled();
    });
  });
});
