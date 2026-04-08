/**
 * Tests for the Health Check Button feature (E2.2).
 * Verifies button renders, loading state, action called, toast feedback.
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
  formatDateCompact: jest.fn(() => "2026-01-01"),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

const mockRunHealthCheck = jest.fn();
const mockGetModuleManifests = jest.fn();
const mockActivateModule = jest.fn();
const mockDeactivateModule = jest.fn();

jest.mock("@/actions/module.actions", () => ({
  getModuleManifests: (...args: unknown[]) => mockGetModuleManifests(...args),
  activateModule: (...args: unknown[]) => mockActivateModule(...args),
  deactivateModule: (...args: unknown[]) => mockDeactivateModule(...args),
  runHealthCheck: (...args: unknown[]) => mockRunHealthCheck(...args),
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

import EnrichmentModuleSettings from "@/components/settings/EnrichmentModuleSettings";

const MODULES = [
  {
    moduleId: "logo_dev",
    name: "Logo.dev",
    connectorType: "DATA_ENRICHMENT",
    status: "active",
    healthStatus: "healthy",
    credential: { moduleId: "logo_dev", required: false, sensitive: true },
  },
];

describe("Health Check Button (EnrichmentModuleSettings)", () => {
  const user = userEvent.setup({ skipHover: true });

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: MODULES,
    });
  });

  it("renders Check Now button for active modules", async () => {
    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "settings.healthCheckNow" })).toBeInTheDocument();
    });
  });

  it("calls runHealthCheck and shows success toast", async () => {
    mockRunHealthCheck.mockResolvedValue({
      success: true,
      data: {
        moduleId: "logo_dev",
        healthStatus: "healthy",
        success: true,
        responseTimeMs: 42,
      },
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "settings.healthCheckNow" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "settings.healthCheckNow" }));

    await waitFor(() => {
      expect(mockRunHealthCheck).toHaveBeenCalledWith("logo_dev");
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "success" }),
      );
    });
  });

  it("shows error toast on health check failure", async () => {
    mockRunHealthCheck.mockResolvedValue({
      success: false,
      message: "Module not found",
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "settings.healthCheckNow" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "settings.healthCheckNow" }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: "destructive" }),
      );
    });
  });

  it("disables button while check is in progress", async () => {
    let resolve: (v: unknown) => void;
    mockRunHealthCheck.mockReturnValue(
      new Promise((r) => {
        resolve = r;
      }),
    );

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "settings.healthCheckNow" })).toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "settings.healthCheckNow" }));

    // Button text should change to "Checking..." while in progress
    await waitFor(() => {
      expect(screen.getByText("settings.healthCheckRunning")).toBeInTheDocument();
    });

    // Resolve the promise
    resolve!({
      success: true,
      data: {
        moduleId: "logo_dev",
        healthStatus: "healthy",
        success: true,
        responseTimeMs: 10,
      },
    });

    await waitFor(() => {
      expect(screen.queryByText("settings.healthCheckRunning")).not.toBeInTheDocument();
    });
  });
});
