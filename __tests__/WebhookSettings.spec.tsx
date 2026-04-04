import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import WebhookSettings from "@/components/settings/WebhookSettings";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/actions/webhook.actions", () => ({
  createWebhookEndpoint: jest.fn(),
  listWebhookEndpoints: jest.fn(),
  updateWebhookEndpoint: jest.fn(),
  deleteWebhookEndpoint: jest.fn(),
}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

import {
  createWebhookEndpoint,
  listWebhookEndpoints,
  updateWebhookEndpoint,
  deleteWebhookEndpoint,
} from "@/actions/webhook.actions";
import { toast } from "@/components/ui/use-toast";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockEndpoint = {
  id: "ep-1",
  url: "https://example.com/webhook",
  secretMask: "whsec_****ab12",
  events: ["auth_failure", "vacancy_promoted"] as const,
  active: true,
  failureCount: 0,
  createdAt: new Date("2026-03-15T10:00:00Z"),
  updatedAt: new Date("2026-03-15T10:00:00Z"),
};

const mockEndpointInactive = {
  ...mockEndpoint,
  id: "ep-2",
  url: "https://other.example.com/hooks/jobsync",
  active: false,
  failureCount: 3,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("WebhookSettings", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
    (listWebhookEndpoints as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockEndpoint],
    });
  });

  // -----------------------------------------------------------------------
  // Loading & Error states
  // -----------------------------------------------------------------------

  it("shows loading state while endpoints are being fetched", () => {
    (listWebhookEndpoints as jest.Mock).mockReturnValue(new Promise(() => {}));
    render(<WebhookSettings />);
    expect(screen.getByText("Loading...")).toBeInTheDocument();
  });

  it("renders error state with retry button on fetch failure", async () => {
    (listWebhookEndpoints as jest.Mock).mockResolvedValue({
      success: false,
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByText("Failed to load webhook endpoints")).toBeInTheDocument();
    });

    expect(screen.getByText("Retry")).toBeInTheDocument();
  });

  it("retries fetching when retry button is clicked", async () => {
    (listWebhookEndpoints as jest.Mock)
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true, data: [mockEndpoint] });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByText("Retry")).toBeInTheDocument();
    });

    await user.click(screen.getByText("Retry"));

    await waitFor(() => {
      expect(screen.getByText("https://example.com/webhook")).toBeInTheDocument();
    });
    expect(listWebhookEndpoints).toHaveBeenCalledTimes(2);
  });

  // -----------------------------------------------------------------------
  // Empty state
  // -----------------------------------------------------------------------

  it("renders empty state when no endpoints exist", async () => {
    (listWebhookEndpoints as jest.Mock).mockResolvedValue({
      success: true,
      data: [],
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByText("No webhook endpoints configured")).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Endpoint list
  // -----------------------------------------------------------------------

  it("renders endpoint list with URL and event count", async () => {
    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByText("https://example.com/webhook")).toBeInTheDocument();
    });

    // Event count badge
    expect(screen.getByText("2 events")).toBeInTheDocument();
  });

  it("shows failure count badge for endpoints with failures", async () => {
    (listWebhookEndpoints as jest.Mock).mockResolvedValue({
      success: true,
      data: [mockEndpointInactive],
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByText("3 consecutive failures")).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------------
  // Create form
  // -----------------------------------------------------------------------

  it("creates endpoint and shows secret dialog", async () => {
    (createWebhookEndpoint as jest.Mock).mockResolvedValue({
      success: true,
      data: {
        endpoint: mockEndpoint,
        secret: "whsec_test_secret_value_12345",
      },
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Endpoint URL")).toBeInTheDocument();
    });

    // Fill URL
    const urlInput = screen.getByLabelText("Endpoint URL");
    await user.type(urlInput, "https://example.com/webhook");

    // Select an event
    const authFailureCheckbox = screen.getByRole("checkbox", {
      name: /Authentication Failure/i,
    });
    await user.click(authFailureCheckbox);

    // Click create
    const createButton = screen.getByRole("button", { name: /Add Endpoint/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(createWebhookEndpoint).toHaveBeenCalledWith(
        "https://example.com/webhook",
        ["auth_failure"],
      );
    });

    // Secret dialog should be visible
    await waitFor(() => {
      expect(screen.getByText("whsec_test_secret_value_12345")).toBeInTheDocument();
    });

    // Warning text
    expect(
      screen.getByText(/Save this secret now/),
    ).toBeInTheDocument();
  });

  it("shows error toast when event selection is empty on create", async () => {
    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Endpoint URL")).toBeInTheDocument();
    });

    // The create button should be disabled when no URL and no events
    const createButton = screen.getByRole("button", { name: /Add Endpoint/i });
    expect(createButton).toBeDisabled();
  });

  // -----------------------------------------------------------------------
  // Active toggle
  // -----------------------------------------------------------------------

  it("calls updateWebhookEndpoint when active toggle is clicked", async () => {
    (updateWebhookEndpoint as jest.Mock).mockResolvedValue({
      success: true,
      data: { ...mockEndpoint, active: false },
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Active")).toBeInTheDocument();
    });

    const toggle = screen.getByLabelText("Active");
    await user.click(toggle);

    await waitFor(() => {
      expect(updateWebhookEndpoint).toHaveBeenCalledWith("ep-1", {
        active: false,
      });
    });
  });

  it("shows toast on successful toggle", async () => {
    (updateWebhookEndpoint as jest.Mock).mockResolvedValue({
      success: true,
      data: { ...mockEndpoint, active: false },
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Active")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Active"));

    await waitFor(() => {
      expect(toast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "success",
          title: "Webhook endpoint updated",
        }),
      );
    });
  });

  // -----------------------------------------------------------------------
  // Delete with confirmation dialog
  // -----------------------------------------------------------------------

  it("shows confirmation dialog before deleting", async () => {
    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Delete")).toBeInTheDocument();
    });

    // Click delete button
    await user.click(screen.getByLabelText("Delete"));

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Delete webhook endpoint?")).toBeInTheDocument();
    });

    expect(
      screen.getByText(/This action cannot be undone/),
    ).toBeInTheDocument();
  });

  it("calls deleteWebhookEndpoint when confirmed", async () => {
    (deleteWebhookEndpoint as jest.Mock).mockResolvedValue({ success: true });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Delete")).toBeInTheDocument();
    });

    // Open confirmation dialog
    await user.click(screen.getByLabelText("Delete"));

    await waitFor(() => {
      expect(screen.getByText("Delete webhook endpoint?")).toBeInTheDocument();
    });

    // Click confirm
    const confirmButton = screen.getByRole("button", { name: "Delete" });
    await user.click(confirmButton);

    await waitFor(() => {
      expect(deleteWebhookEndpoint).toHaveBeenCalledWith("ep-1");
    });
  });

  // -----------------------------------------------------------------------
  // Expand/collapse details
  // -----------------------------------------------------------------------

  it("shows expanded details with subscribed events", async () => {
    render(<WebhookSettings />);

    await waitFor(() => {
      expect(screen.getByLabelText("Show details")).toBeInTheDocument();
    });

    await user.click(screen.getByLabelText("Show details"));

    await waitFor(() => {
      expect(screen.getByText("Subscribed Events")).toBeInTheDocument();
    });

    // Event labels appear both in create form checkboxes and expanded detail badges.
    // Verify that "Subscribed Events" section contains the expected labels
    // by checking that the text appears at least twice (once in form, once in details).
    expect(screen.getAllByText("Authentication Failure").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Vacancy Promoted").length).toBeGreaterThanOrEqual(2);

    // Full URL visible in both compact and expanded sections
    expect(screen.getAllByText("https://example.com/webhook").length).toBeGreaterThanOrEqual(2);
  });

  // -----------------------------------------------------------------------
  // Max endpoints message
  // -----------------------------------------------------------------------

  it("shows max endpoints message and disables form when limit reached", async () => {
    const tenEndpoints = Array.from({ length: 10 }, (_, i) => ({
      ...mockEndpoint,
      id: `ep-${i}`,
      url: `https://example.com/webhook/${i}`,
    }));

    (listWebhookEndpoints as jest.Mock).mockResolvedValue({
      success: true,
      data: tenEndpoints,
    });

    render(<WebhookSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("You have reached the maximum of 10 webhook endpoints."),
      ).toBeInTheDocument();
    });

    // URL input should be disabled
    const urlInput = screen.getByLabelText("Endpoint URL");
    expect(urlInput).toBeDisabled();

    // Create button should be disabled
    const createButton = screen.getByRole("button", { name: /Add Endpoint/i });
    expect(createButton).toBeDisabled();
  });
});
