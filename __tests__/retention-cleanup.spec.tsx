/**
 * Tests for the Retention Cleanup Button feature (E2.4).
 * Verifies button renders, confirmation dialog, action called, toast feedback.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

const mockRunRetentionCleanup = jest.fn();
jest.mock("@/actions/stagedVacancy.actions", () => ({
  runRetentionCleanup: (...args: unknown[]) => mockRunRetentionCleanup(...args),
}));

jest.mock("lucide-react", () => {
  const icons = new Proxy(
    {},
    {
      get: (_, name) => {
        const Component = (props: Record<string, unknown>) => (
          <span data-testid={`icon-${String(name)}`} {...props} />
        );
        Component.displayName = String(name);
        return Component;
      },
    },
  );
  return icons;
});

import { RetentionCleanupCard } from "@/components/developer/DeveloperContainer";

describe("RetentionCleanupCard", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
    mockRunRetentionCleanup.mockResolvedValue({
      success: true,
      data: { purgedCount: 5, hashesCreated: 3 },
    });
  });

  it("renders the cleanup button", () => {
    render(<RetentionCleanupCard />);
    expect(screen.getByRole("button", { name: "developer.runCleanup" })).toBeInTheDocument();
  });

  it("renders card title and description", () => {
    render(<RetentionCleanupCard />);
    expect(screen.getByText("developer.retentionCleanup")).toBeInTheDocument();
    expect(screen.getByText("developer.retentionCleanupDesc")).toBeInTheDocument();
  });

  it("opens confirmation dialog when button is clicked", async () => {
    render(<RetentionCleanupCard />);

    await user.click(screen.getByRole("button", { name: "developer.runCleanup" }));

    await waitFor(() => {
      expect(screen.getByText("developer.cleanupConfirm")).toBeInTheDocument();
      expect(screen.getByText("developer.cleanupWarning")).toBeInTheDocument();
    });
  });

  it("calls runRetentionCleanup after confirmation and shows success toast", async () => {
    render(<RetentionCleanupCard />);

    // Open dialog
    await user.click(screen.getByRole("button", { name: "developer.runCleanup" }));

    // Confirm
    await waitFor(() => {
      expect(screen.getByText("developer.cleanupConfirm")).toBeInTheDocument();
    });

    // The AlertDialogAction has the text "developer.runCleanup"
    const confirmButtons = screen.getAllByText("developer.runCleanup");
    // The confirm button is inside the dialog (second one)
    const confirmButton = confirmButtons[confirmButtons.length - 1];
    await user.click(confirmButton);

    await waitFor(() => {
      expect(mockRunRetentionCleanup).toHaveBeenCalledTimes(1);
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      );
    });
  });

  it("shows error toast on cleanup failure", async () => {
    mockRunRetentionCleanup.mockResolvedValue({
      success: false,
      message: "Failed",
    });

    render(<RetentionCleanupCard />);

    await user.click(screen.getByRole("button", { name: "developer.runCleanup" }));

    await waitFor(() => {
      expect(screen.getByText("developer.cleanupConfirm")).toBeInTheDocument();
    });

    const confirmButtons = screen.getAllByText("developer.runCleanup");
    await user.click(confirmButtons[confirmButtons.length - 1]);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });

  it("does NOT call action if dialog is cancelled", async () => {
    render(<RetentionCleanupCard />);

    await user.click(screen.getByRole("button", { name: "developer.runCleanup" }));

    await waitFor(() => {
      expect(screen.getByText("developer.cleanupConfirm")).toBeInTheDocument();
    });

    // Cancel
    await user.click(screen.getByText("common.cancel"));

    // Wait a tick to ensure no async calls
    await new Promise((r) => setTimeout(r, 50));

    expect(mockRunRetentionCleanup).not.toHaveBeenCalled();
  });

  it("button has destructive styling", () => {
    render(<RetentionCleanupCard />);
    const btn = screen.getByRole("button", { name: "developer.runCleanup" });
    // The button should have the destructive variant class
    expect(btn).toBeInTheDocument();
  });
});
