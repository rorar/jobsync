/**
 * EnrichmentModuleSettings component tests
 *
 * Tests: loading state, empty state, modules list rendering,
 * activation toggle, toast notifications.
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
        "enrichment.modulesTitle": "Data Enrichment Modules",
        "enrichment.modulesDescription":
          "Configure modules that automatically enrich company and job data",
        "enrichment.loadingModules": "Loading enrichment modules...",
        "enrichment.noModules": "No enrichment modules registered",
        "enrichment.noModulesHint":
          "Enrichment modules will appear here once they are registered in the connector framework.",
        "enrichment.logoDev": "Logo.dev",
        "enrichment.logoDevDescription":
          "High-quality company logos via Logo.dev (API key required)",
        "enrichment.googleFavicon": "Google Favicon",
        "enrichment.googleFaviconDescription":
          "Fetch website favicons via Google",
        "enrichment.metaParser": "Link Preview Parser",
        "enrichment.metaParserDescription":
          "Extract metadata from URLs (OpenGraph, meta tags)",
        "enrichment.noCredentialRequired": "No API key required",
        "settings.moduleActive": "Active",
        "settings.moduleInactive": "Inactive",
        "settings.moduleActivated": "Module activated.",
        "settings.moduleDeactivated": "Module deactivated.",
        "settings.automationsPaused": "{count} automation(s) paused.",
        "settings.error": "Error",
        "settings.unexpectedError": "An unexpected error occurred",
        "enrichment.health.healthy": "Healthy",
        "enrichment.health.degraded": "Degraded",
        "enrichment.health.unreachable": "Unreachable",
        "enrichment.health.unknown": "Unknown",
        "enrichment.deactivateConfirmTitle": "Deactivate module?",
        "enrichment.deactivateConfirmDescription": "Deactivating this module will pause all automations that depend on it.",
        "enrichment.deactivateConfirm": "Deactivate",
        "common.cancel": "Cancel",
        "enrichment.toggleModule": "Toggle {name} module",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

const mockGetModuleManifests = jest.fn();
const mockActivateModule = jest.fn();
const mockDeactivateModule = jest.fn();

jest.mock("@/actions/module.actions", () => ({
  getModuleManifests: (...args: unknown[]) =>
    mockGetModuleManifests(...args),
  activateModule: (...args: unknown[]) => mockActivateModule(...args),
  deactivateModule: (...args: unknown[]) => mockDeactivateModule(...args),
}));

jest.mock("@/lib/connector/manifest", () => ({
  ConnectorType: { DATA_ENRICHMENT: "data_enrichment" },
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Lucide icons -- minimal stubs
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

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const mockModules = [
  {
    moduleId: "logo_dev",
    name: "Logo.dev",
    manifestVersion: 1,
    connectorType: "data_enrichment",
    status: "active",
    healthStatus: "healthy",
    credential: {
      type: "api_key",
      moduleId: "logo_dev",
      required: false,
      sensitive: true,
      envFallback: "LOGODEV_API_KEY",
    },
    i18n: {
      en: { name: "Logo.dev", description: "High-quality company logos via Logo.dev (API key required)" },
      de: { name: "Logo.dev", description: "Hochwertige Firmenlogos über Logo.dev" },
    },
  },
  {
    moduleId: "google_favicon",
    name: "Google Favicon",
    manifestVersion: 1,
    connectorType: "data_enrichment",
    status: "active",
    healthStatus: "unknown",
    credential: {
      type: "none",
      moduleId: "google_favicon",
      required: false,
      sensitive: false,
    },
    i18n: {
      en: { name: "Google Favicon", description: "Fetch website favicons via Google" },
      de: { name: "Google Favicon", description: "Website-Favicons über Google abrufen" },
    },
  },
  {
    moduleId: "meta_parser",
    name: "Meta/OpenGraph Parser",
    manifestVersion: 1,
    connectorType: "data_enrichment",
    status: "inactive",
    healthStatus: "unknown",
    credential: {
      type: "none",
      moduleId: "meta_parser",
      required: false,
      sensitive: false,
    },
    i18n: {
      en: { name: "Link Preview Parser", description: "Extract metadata from URLs (OpenGraph, meta tags)" },
      de: { name: "Link-Vorschau-Parser", description: "Metadaten aus URLs extrahieren (OpenGraph, Meta-Tags)" },
    },
  },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EnrichmentModuleSettings", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state while fetching modules", () => {
    mockGetModuleManifests.mockReturnValue(new Promise(() => {})); // never resolves
    render(<EnrichmentModuleSettings />);

    expect(screen.getByText("Loading enrichment modules...")).toBeInTheDocument();
    expect(screen.getByText("Data Enrichment Modules")).toBeInTheDocument();
  });

  it("shows empty state when no modules are returned", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [],
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(
        screen.getByText("No enrichment modules registered"),
      ).toBeInTheDocument();
    });
  });

  it("renders module cards with names and descriptions", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: mockModules,
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    expect(screen.getByText("Google Favicon")).toBeInTheDocument();
    expect(screen.getByText("Link Preview Parser")).toBeInTheDocument();
    expect(
      screen.getByText("High-quality company logos via Logo.dev (API key required)"),
    ).toBeInTheDocument();
  });

  it("shows active/inactive status for each module", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: mockModules,
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    // 2 active + 1 inactive
    const activeLabels = screen.getAllByText("Active");
    const inactiveLabels = screen.getAllByText("Inactive");
    expect(activeLabels.length).toBe(2);
    expect(inactiveLabels.length).toBe(1);
  });

  it("shows 'No API key required' badges for all modules", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: mockModules,
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    const badges = screen.getAllByText("No API key required");
    expect(badges.length).toBe(3);
  });

  it("calls activateModule when toggling inactive module on", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [mockModules[2]], // meta_parser (inactive)
    });
    mockActivateModule.mockResolvedValue({
      success: true,
      data: { moduleId: "meta_parser", status: "active" },
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Link Preview Parser")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockActivateModule).toHaveBeenCalledWith("meta_parser");
    });
  });

  it("calls deactivateModule after confirmation when toggling active module off", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [mockModules[0]], // logo_dev (active)
    });
    mockDeactivateModule.mockResolvedValue({
      success: true,
      data: { moduleId: "logo_dev", status: "inactive", pausedAutomations: 0 },
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    // Click the toggle -- should open the confirmation dialog
    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    // Confirmation dialog should appear
    await waitFor(() => {
      expect(screen.getByText("Deactivate module?")).toBeInTheDocument();
    });

    // deactivateModule should NOT have been called yet
    expect(mockDeactivateModule).not.toHaveBeenCalled();

    // Click the confirm button in the dialog
    const confirmBtn = screen.getByRole("button", { name: "Deactivate" });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(mockDeactivateModule).toHaveBeenCalledWith("logo_dev");
    });
  });

  it("shows error toast when activation fails", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [mockModules[2]], // meta_parser (inactive)
    });
    mockActivateModule.mockResolvedValue({
      success: false,
      message: "Module not found",
    });

    render(<EnrichmentModuleSettings />);

    await waitFor(() => {
      expect(screen.getByText("Link Preview Parser")).toBeInTheDocument();
    });

    const toggle = screen.getByRole("switch");
    fireEvent.click(toggle);

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({
          variant: "destructive",
          title: "Error",
        }),
      );
    });
  });
});
