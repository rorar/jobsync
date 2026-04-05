/**
 * StatusHistoryTimeline component tests
 *
 * Tests: loading state, empty state, timeline rendering,
 * error state with retry, note display, pagination (Load more).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "jobs.statusHistory": "Status History",
        "jobs.statusHistoryEmpty": "No status changes recorded yet.",
        "jobs.statusHistoryLoading": "Loading status history...",
        "jobs.statusHistoryError": "Failed to load status history",
        "jobs.statusChangedTo": "Changed to {status}",
        "jobs.statusChangedFrom": "from {status}",
        "jobs.statusHistoryNote": "Note",
        "jobs.statusHistoryInitial": "Initial status",
        "jobs.statusHistoryRetry": "Retry",
        "jobs.statusHistoryShowAll": "Show all ({count})",
        "jobs.statusHistoryShowLess": "Show less",
        "jobs.statusHistoryLoadMore": "Load more",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Jan 15, 2026"),
}));

jest.mock("lucide-react", () => ({
  History: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-history" {...props} />
  ),
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
  ArrowRight: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-arrow" {...props} />
  ),
  MessageSquare: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-message" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
}));

const mockGetJobStatusHistory = jest.fn();

jest.mock("@/actions/job.actions", () => ({
  getJobStatusHistory: (...args: unknown[]) =>
    mockGetJobStatusHistory(...args),
}));

import { StatusHistoryTimeline } from "@/components/crm/StatusHistoryTimeline";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const mockEntries = [
  {
    id: "hist-1",
    previousStatusLabel: null,
    previousStatusValue: null,
    newStatusLabel: "Draft",
    newStatusValue: "draft",
    note: null,
    changedAt: new Date("2026-01-01"),
  },
  {
    id: "hist-2",
    previousStatusLabel: "Draft",
    previousStatusValue: "draft",
    newStatusLabel: "Applied",
    newStatusValue: "applied",
    note: "Submitted application via company website",
    changedAt: new Date("2026-01-15"),
  },
  {
    id: "hist-3",
    previousStatusLabel: "Applied",
    previousStatusValue: "applied",
    newStatusLabel: "Interview",
    newStatusValue: "interview",
    note: null,
    changedAt: new Date("2026-01-20"),
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StatusHistoryTimeline", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading skeleton initially", () => {
    mockGetJobStatusHistory.mockReturnValue(new Promise(() => {})); // never resolves
    render(<StatusHistoryTimeline jobId="job-1" />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Status History")).toBeInTheDocument();
  });

  it("shows empty state when no history exists", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("No status changes recorded yet."),
      ).toBeInTheDocument();
    });
  });

  it("shows error state with retry button on failure", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: false,
      message: "errors.fetchStatusHistory",
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load status history"),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });

  it("retries loading when retry button is clicked", async () => {
    mockGetJobStatusHistory
      .mockResolvedValueOnce({ success: false, message: "error" })
      .mockResolvedValueOnce({ success: true, data: mockEntries });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load status history"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    });
    expect(mockGetJobStatusHistory).toHaveBeenCalledTimes(2);
  });

  it("renders timeline entries with status badges", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: mockEntries,
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      // Draft appears twice: as new status in entry 1 and previous status in entry 2
      expect(screen.getAllByText("Draft")).toHaveLength(2);
    });
    // Applied appears twice: as new status in entry 2 and previous status in entry 3
    expect(screen.getAllByText("Applied")).toHaveLength(2);
    expect(screen.getByText("Interview")).toBeInTheDocument();
  });

  it("shows initial status label for first entry without previous status", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: [mockEntries[0]],
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Initial status")).toBeInTheDocument();
    });
    expect(screen.getByText("Draft")).toBeInTheDocument();
  });

  it("displays notes when present", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: [mockEntries[1]],
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Submitted application via company website"),
      ).toBeInTheDocument();
    });
  });

  it("does not show notes when absent", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: [mockEntries[0]],
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument();
    });
    expect(
      screen.queryByText("Submitted application via company website"),
    ).not.toBeInTheDocument();
  });

  it("renders timestamps for each entry", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: mockEntries,
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      const timestamps = screen.getAllByText("Jan 15, 2026");
      expect(timestamps.length).toBeGreaterThan(0);
    });
  });

  it("renders a scrollable container with role list", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: mockEntries,
    });

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(screen.getByRole("list")).toBeInTheDocument();
    });
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(3);
  });

  it("handles exception in getJobStatusHistory gracefully", async () => {
    mockGetJobStatusHistory.mockRejectedValue(new Error("Network error"));

    render(<StatusHistoryTimeline jobId="job-1" />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load status history"),
      ).toBeInTheDocument();
    });
  });

  it("passes jobId with pagination params to the action", async () => {
    mockGetJobStatusHistory.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<StatusHistoryTimeline jobId="job-42" />);

    await waitFor(() => {
      expect(mockGetJobStatusHistory).toHaveBeenCalledWith("job-42", 50, 0);
    });
  });

  describe("pagination with Load more", () => {
    function makeManyEntries(count: number) {
      return Array.from({ length: count }, (_, i) => ({
        id: `hist-${i}`,
        previousStatusLabel: i === 0 ? null : "Draft",
        previousStatusValue: i === 0 ? null : "draft",
        newStatusLabel: `Status ${i}`,
        newStatusValue: i % 2 === 0 ? "applied" : "draft",
        note: null,
        changedAt: new Date(`2026-01-${String((i % 28) + 1).padStart(2, "0")}`),
      }));
    }

    it("does not show Load more when fewer entries than page size", async () => {
      const entries = makeManyEntries(15);
      mockGetJobStatusHistory.mockResolvedValue({
        success: true,
        data: entries,
      });

      render(<StatusHistoryTimeline jobId="job-1" />);

      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(15);
      });

      expect(screen.queryByText("Load more")).not.toBeInTheDocument();
    });

    it("shows Load more when entries equal page size (50)", async () => {
      const entries = makeManyEntries(50);
      mockGetJobStatusHistory.mockResolvedValue({
        success: true,
        data: entries,
      });

      render(<StatusHistoryTimeline jobId="job-1" />);

      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(50);
      });

      expect(screen.getByText("Load more")).toBeInTheDocument();
    });

    it("appends entries when Load more is clicked", async () => {
      const firstPage = makeManyEntries(50);
      const secondPage = makeManyEntries(10).map((e, i) => ({
        ...e,
        id: `hist-second-${i}`,
      }));

      mockGetJobStatusHistory
        .mockResolvedValueOnce({ success: true, data: firstPage })
        .mockResolvedValueOnce({ success: true, data: secondPage });

      render(<StatusHistoryTimeline jobId="job-1" />);

      await waitFor(() => {
        expect(screen.getByText("Load more")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Load more"));

      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(60);
      });

      // Second call should pass skip=50
      expect(mockGetJobStatusHistory).toHaveBeenCalledWith("job-1", 50, 50);

      // Load more should be hidden since second page returned fewer than 50
      expect(screen.queryByText("Load more")).not.toBeInTheDocument();
    });
  });
});
