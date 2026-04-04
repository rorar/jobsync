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
  "dashboard.noPipeline":
    "No jobs in the pipeline yet. Start by bookmarking a job!",
  "dashboard.retryButton": "Retry",
  "errors.fetchStatusDistribution": "Failed to fetch status distribution",
};

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => i18nDict[key] ?? key,
    locale: "en",
  })),
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
      const skeleton = screen.getByLabelText("Loading pipeline data");
      expect(skeleton).toBeInTheDocument();
      expect(skeleton).toHaveAttribute("aria-busy", "true");
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
        message: "errors.fetchStatusDistribution",
      });

      render(<StatusFunnelWidget />);

      await waitFor(() => {
        expect(
          screen.getByText("Failed to fetch status distribution"),
        ).toBeInTheDocument();
      });

      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    it("calls fetchData again when retry is clicked", async () => {
      mockGetStatusDistribution
        .mockResolvedValueOnce({
          success: false,
          message: "errors.fetchStatusDistribution",
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

    it("renders meter elements with correct aria attributes", async () => {
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

      // First meter (Bookmarked: 40)
      expect(meters[0]).toHaveAttribute("aria-valuenow", "40");
      expect(meters[0]).toHaveAttribute("aria-valuemin", "0");
      expect(meters[0]).toHaveAttribute("aria-valuemax", "40");
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
