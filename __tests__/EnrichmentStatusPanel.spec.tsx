/**
 * EnrichmentStatusPanel component tests
 *
 * Tests: loading state, empty state, results rendering,
 * error state with retry, refresh and trigger actions.
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
        "enrichment.statusPanel": "Enrichment Status",
        "enrichment.refreshButton": "Refresh",
        "enrichment.pending": "Pending",
        "enrichment.completed": "Completed",
        "enrichment.failed": "Failed",
        "enrichment.noData": "No enrichment data available",
        "enrichment.noDataHint":
          "Trigger enrichment to fetch company logos and link previews.",
        "enrichment.refreshing": "Refreshing...",
        "enrichment.triggerEnrichment": "Enrich Company Data",
        "enrichment.enriching": "Enriching...",
        "enrichment.refreshSuccess": "Enrichment data refreshed successfully",
        "enrichment.triggerSuccess": "Enrichment triggered successfully",
        "enrichment.dimensionLogo": "Logo",
        "enrichment.dimensionDeepLink": "Link Preview",
        "enrichment.source": "Source",
        "enrichment.lastUpdated": "Last updated",
        "enrichment.retryButton": "Retry",
        "enrichment.errorLoading": "Failed to load enrichment data",
        "enrichment.refreshFailed": "Failed to refresh enrichment",
        "enrichment.triggerFailed": "Enrichment failed",
        "enrichment.noLogo": "No logo available",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Jan 1, 2026"),
}));

const mockGetEnrichmentStatus = jest.fn();
const mockTriggerEnrichment = jest.fn();
const mockRefreshEnrichment = jest.fn();

jest.mock("@/actions/enrichment.actions", () => ({
  getEnrichmentStatus: (...args: unknown[]) =>
    mockGetEnrichmentStatus(...args),
  triggerEnrichment: (...args: unknown[]) => mockTriggerEnrichment(...args),
  refreshEnrichment: (...args: unknown[]) => mockRefreshEnrichment(...args),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Stub heavy sub-components
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: ({ companyName }: { companyName: string }) => (
    <div data-testid="company-logo">{companyName}</div>
  ),
}));

import { EnrichmentStatusPanel } from "@/components/enrichment/EnrichmentStatusPanel";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const defaultProps = {
  companyId: "company-1",
  companyName: "Acme Corp",
  logoUrl: "https://example.com/logo.png",
};

const mockResult = {
  id: "result-1",
  userId: "user-1",
  dimension: "logo",
  domainKey: "acme.com",
  companyId: "company-1",
  status: "found",
  data: '{"logoUrl":"https://img.logo.dev/acme.com"}',
  sourceModuleId: "logo_dev",
  ttlSeconds: 2592000,
  expiresAt: new Date("2026-02-01"),
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-01"),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EnrichmentStatusPanel", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading skeleton initially", () => {
    mockGetEnrichmentStatus.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EnrichmentStatusPanel {...defaultProps} />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Enrichment Status")).toBeInTheDocument();
  });

  it("shows empty state when no enrichment data exists", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("No enrichment data available"),
      ).toBeInTheDocument();
    });
    expect(
      screen.getByText(
        "Trigger enrichment to fetch company logos and link previews.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Enrich Company Data" }),
    ).toBeInTheDocument();
  });

  it("shows error state with retry button on failure", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: false,
      message: "enrichment.statusFailed",
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load enrichment data"),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
  });

  it("retries loading when retry button is clicked", async () => {
    mockGetEnrichmentStatus
      .mockResolvedValueOnce({ success: false, message: "error" })
      .mockResolvedValueOnce({ success: true, data: [] });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load enrichment data"),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => {
      expect(
        screen.getByText("No enrichment data available"),
      ).toBeInTheDocument();
    });
    expect(mockGetEnrichmentStatus).toHaveBeenCalledTimes(2);
  });

  it("renders enrichment results when data exists", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: true,
      data: [mockResult],
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Logo")).toBeInTheDocument();
    });
    expect(screen.getByText("Completed")).toBeInTheDocument();
    expect(screen.getByText(/logo_dev/)).toBeInTheDocument();
  });

  it("handles trigger enrichment action", async () => {
    mockGetEnrichmentStatus
      .mockResolvedValueOnce({ success: true, data: [] })
      .mockResolvedValueOnce({ success: true, data: [mockResult] });
    mockTriggerEnrichment.mockResolvedValue({ success: true, data: mockResult });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("No enrichment data available"),
      ).toBeInTheDocument();
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Enrich Company Data" }),
    );

    await waitFor(() => {
      expect(mockTriggerEnrichment).toHaveBeenCalledWith("company-1", "logo");
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Enrichment triggered successfully" }),
    );
  });

  it("handles refresh enrichment action", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: true,
      data: [mockResult],
    });
    mockRefreshEnrichment.mockResolvedValue({
      success: true,
      data: mockResult,
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Logo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockRefreshEnrichment).toHaveBeenCalledWith("result-1");
    });
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Enrichment data refreshed successfully",
      }),
    );
  });

  it("shows error toast on failed refresh", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: true,
      data: [mockResult],
    });
    mockRefreshEnrichment.mockResolvedValue({
      success: false,
      message: "enrichment.refreshFailed",
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByText("Logo")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Refresh" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Failed to refresh enrichment",
          variant: "destructive",
        }),
      );
    });
  });

  it("renders company logo component", async () => {
    mockGetEnrichmentStatus.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(screen.getByTestId("company-logo")).toBeInTheDocument();
    });
    expect(screen.getByTestId("company-logo")).toHaveTextContent("Acme Corp");
  });

  it("handles exception in getEnrichmentStatus gracefully", async () => {
    mockGetEnrichmentStatus.mockRejectedValue(new Error("Network error"));

    render(<EnrichmentStatusPanel {...defaultProps} />);

    await waitFor(() => {
      expect(
        screen.getByText("Failed to load enrichment data"),
      ).toBeInTheDocument();
    });
  });
});
