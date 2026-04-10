/**
 * StatusFunnelWidget Component Tests
 *
 * Tests: loading skeleton, empty state, error state with retry,
 * rendering with data, conversion percentage calculations,
 * biggest drop-off highlighting, accessibility attributes.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StatusDistribution } from "@/actions/job.actions";
import type { ActionResult } from "@/models/actionResult";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const i18nDict: Record<string, string> = {
  "dashboard.pipeline": "Application Pipeline",
  "dashboard.statusBookmarked": "Bookmarked",
  "dashboard.statusApplied": "Applied",
  "dashboard.statusInterview": "Interview",
  "dashboard.statusOffer": "Offer",
  "dashboard.statusHired": "Hired",
  "dashboard.conversionRate": "{percent}% conversion",
  "dashboard.biggestDropoff": "Biggest drop-off",
  "dashboard.totalJobsTracked": "{count} jobs tracked",
  "dashboard.noPipeline":
    "No jobs in the pipeline yet. Start by bookmarking a job!",
  "dashboard.retryButton": "Retry",
  "dashboard.fetchStatusDistributionError": "Failed to load status distribution",
  // Sprint 4 Stream E — Sprint 3 Stream G (M-Y-08) follow-up: the
  // inline `SkeletonBars` now uses the shared Skeleton primitive and
  // passes `t("common.loading")` as the label prop.
  "common.loading": "Loading...",
};

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => i18nDict[key] ?? key,
    locale: "en",
  })),
  formatNumber: (value: number, _locale?: string) => String(value),
}));

jest.mock("lucide-react", () => ({
  Briefcase: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-briefcase" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
  TrendingDown: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-trending-down" {...props} />
  ),
}));

const mockGetStatusDistribution = jest.fn<
  Promise<ActionResult<StatusDistribution[]>>,
  []
>();

jest.mock("@/actions/job.actions", () => ({
  getStatusDistribution: (...args: unknown[]) =>
    mockGetStatusDistribution(...(args as [])),
}));

import StatusFunnelWidget from "@/components/dashboard/StatusFunnelWidget";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDistribution(
  overrides: Partial<Record<string, number>> = {},
): StatusDistribution[] {
  const defaults: Record<string, number> = {
    bookmarked: 40,
    applied: 25,
    interview: 10,
    offer: 4,
    accepted: 2,
    ...overrides,
  };
  return Object.entries(defaults).map(([value, count]) => ({
    statusId: `status-${value}`,
    statusValue: value,
    statusLabel: value.charAt(0).toUpperCase() + value.slice(1),
    count,
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("StatusFunnelWidget", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("Loading state", () => {
    it("shows skeleton bars while loading", () => {
      // Never resolve so it stays in loading state
      mockGetStatusDistribution.mockReturnValue(new Promise(() => {}));

      render(<StatusFunnelWidget />);
      // Sprint 4 Stream E (M-Y-08 follow-up): migrated to the shared
      // Skeleton primitive. The label is now the translated
      // `common.loading` string, and the region exposes
      // `role="status"` + `aria-live="polite"` + `aria-busy="true"`
      // instead of the old `aria-busy` + hardcoded English label.
      const skeleton = screen.getByRole("status");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-busy", "true");
      expect(skeleton).toHaveAttribute("aria-live", "polite");
      expect(skeleton).toHaveAttribute("aria-label", "Loading...");
    });
  });

  describe("Empty state", () => {
    it("shows empty message when all counts are zero", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({
          bookmarked: 0,
          applied: 0,
          interview: 0,
          offer: 0,
          accepted: 0,
        }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "No jobs in the pipeline yet. Start by bookmarking a job!",
          ),
        ).toBeInTheDocument();
      });
    });

    it("shows empty message when distribution is empty array", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: [],
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByText(
            "No jobs in the pipeline yet. Start by bookmarking a job!",
          ),
        ).toBeInTheDocument();
      });
    });
  });

  describe("Error state", () => {
    it("shows error message and retry button on failure", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: false,
        message: "dashboard.fetchStatusDistributionError",
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load status distribution"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("calls fetchData again when retry is clicked", async () => {
      mockGetStatusDistribution
        .mockResolvedValueOnce({
          success: false,
          message: "dashboard.fetchStatusDistributionError",
        })
        .mockResolvedValueOnce({
          success: true,
          data: makeDistribution(),
        });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(mockGetStatusDistribution).toHaveBeenCalledTimes(2);
      });

      // After retry with successful data, should show the funnel
      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });
    });
  });

  describe("Rendering with data", () => {
    it("renders all pipeline stages with counts", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution(),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });

      expect(screen.getByText("Applied")).toBeInTheDocument();
      expect(screen.getByText("Interview")).toBeInTheDocument();
      expect(screen.getByText("Offer")).toBeInTheDocument();
      expect(screen.getByText("Hired")).toBeInTheDocument();

      // Check count values are displayed
      expect(screen.getByText("40")).toBeInTheDocument();
      expect(screen.getByText("25")).toBeInTheDocument();
      expect(screen.getByText("10")).toBeInTheDocument();
      expect(screen.getByText("4")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });

    it("renders the card title", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution(),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Application Pipeline")).toBeInTheDocument();
      });
    });

    it("renders meter elements with correct aria attributes including percentage", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution(),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });

      const meters = screen.getAllByRole("meter");
      expect(meters).toHaveLength(5);

      // First meter (Bookmarked: 40) — totalJobs=81, percentage=49%
      expect(meters[0]).toHaveAttribute("aria-valuenow", "40");
      expect(meters[0]).toHaveAttribute("aria-valuemin", "0");
      expect(meters[0]).toHaveAttribute("aria-valuemax", "40");
      expect(meters[0]).toHaveAttribute(
        "aria-label",
        expect.stringContaining("Bookmarked: 40"),
      );
    });

    it("displays total jobs tracked", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution(),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        // 40 + 25 + 10 + 4 + 2 = 81
        expect(screen.getByText("81 jobs tracked")).toBeInTheDocument();
      });
    });

    it("renders hover tooltips on funnel bars with count and percentage", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({ bookmarked: 50, applied: 25, interview: 15, offer: 5, accepted: 5 }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });

      // totalJobs = 100, so Bookmarked: 50 (50%)
      const bookmarkedBar = screen.getByTitle("Bookmarked: 50 (50%)");
      expect(bookmarkedBar).toBeInTheDocument();

      const appliedBar = screen.getByTitle("Applied: 25 (25%)");
      expect(appliedBar).toBeInTheDocument();
    });

    it("renders a list with listitem roles", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution(),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByRole("list", { name: "Application Pipeline" }),
        ).toBeInTheDocument();
      });

      const items = screen.getAllByRole("listitem");
      expect(items).toHaveLength(5);
    });
  });

  describe("Conversion percentages", () => {
    it("shows headline conversion rate from bookmarked to applied", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({ bookmarked: 100, applied: 63 }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        // The template replaces {percent} with 63
        expect(screen.getByText(/63% conversion/)).toBeInTheDocument();
      });
    });

    it("shows inter-stage conversion percentages", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({
          bookmarked: 100,
          applied: 50,
          interview: 20,
          offer: 5,
          accepted: 2,
        }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });

      // bookmarked->applied = 50%, applied->interview = 40%, interview->offer = 25%, offer->accepted = 40%
      expect(screen.getByText("50%")).toBeInTheDocument();
      // 40% appears twice (applied->interview and offer->accepted)
      expect(screen.getAllByText("40%")).toHaveLength(2);
      expect(screen.getByText("25%")).toBeInTheDocument();
    });

    it("does not show headline conversion when bookmarked is zero", async () => {
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({
          bookmarked: 0,
          applied: 5,
          interview: 2,
          offer: 0,
          accepted: 0,
        }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Applied")).toBeInTheDocument();
      });

      expect(screen.queryByText(/% conversion/)).not.toBeInTheDocument();
    });
  });

  describe("Exception handling", () => {
    it("shows error state when getStatusDistribution throws an exception", async () => {
      mockGetStatusDistribution.mockRejectedValue(new Error("Network error"));

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByText("Failed to load status distribution"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("recovers from exception when retry is clicked", async () => {
      mockGetStatusDistribution
        .mockRejectedValueOnce(new Error("Network error"))
        .mockResolvedValueOnce({
          success: true,
          data: makeDistribution(),
        });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Retry")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Retry"));

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });
      expect(mockGetStatusDistribution).toHaveBeenCalledTimes(2);
    });
  });

  describe("Biggest drop-off highlighting", () => {
    it("highlights the stage with the largest drop-off", async () => {
      // Biggest drop: bookmarked(80) -> applied(10) = 70 drop
      mockGetStatusDistribution.mockResolvedValue({
        success: true,
        data: makeDistribution({
          bookmarked: 80,
          applied: 10,
          interview: 8,
          offer: 6,
          accepted: 5,
        }),
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(screen.getByText("Bookmarked")).toBeInTheDocument();
      });

      // The TrendingDown icon should be present for the biggest drop-off
      expect(screen.getByTestId("icon-trending-down")).toBeInTheDocument();
    });
  });
});
