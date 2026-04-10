/**
 * ApiStatusOverview component tests
 *
 * Tests: loading state, module grouping by connector type,
 * health status dots, "Check All" button presence, module name rendering.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "enrichment.healthOverviewTitle": "API Status Overview",
        "enrichment.healthOverviewDescription":
          "Health status of all registered external service modules",
        "enrichment.loadingModules": "Loading enrichment modules...",
        "enrichment.checkAll": "Check All",
        "enrichment.checkingAll": "Checking all modules...",
        "enrichment.health.healthy": "Healthy",
        "enrichment.health.degraded": "Degraded",
        "enrichment.health.unreachable": "Unreachable",
        "enrichment.health.unknown": "Unknown",
        "enrichment.noCredentialRequired": "No API key required",
        "enrichment.connectorGroup.job_discovery": "Job Discovery",
        "enrichment.connectorGroup.ai_provider": "AI Provider",
        "enrichment.connectorGroup.data_enrichment": "Data Enrichment",
        "enrichment.connectorGroup.reference_data": "Reference Data",
        "settings.moduleInactive": "Inactive",
        "settings.healthCheckNow": "Check now",
      };
      // return the translated value or fall back to the key itself
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

const mockGetModuleManifests = jest.fn();
const mockRunHealthCheck = jest.fn();

jest.mock("@/actions/module.actions", () => ({
  getModuleManifests: (...args: unknown[]) => mockGetModuleManifests(...args),
  runHealthCheck: (...args: unknown[]) => mockRunHealthCheck(...args),
}));

jest.mock("@/lib/connector/manifest", () => ({
  CredentialType: { NONE: "none", API_KEY: "api_key", ENDPOINT_URL: "endpoint_url" },
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

// Stub Lucide icons to avoid SVG render complexity
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

import ApiStatusOverview from "@/components/settings/ApiStatusOverview";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const jobDiscoveryModule = {
  moduleId: "eures",
  name: "EURES",
  manifestVersion: 1,
  connectorType: "job_discovery",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheck: undefined,
  credential: { type: "none", moduleId: "eures", required: false, sensitive: false },
  i18n: { en: { name: "EURES", description: "EU job board" } },
};

const aiProviderModule = {
  moduleId: "ollama",
  name: "Ollama",
  manifestVersion: 1,
  connectorType: "ai_provider",
  status: "active",
  healthStatus: "unknown",
  lastHealthCheck: undefined,
  credential: { type: "none", moduleId: "ollama", required: false, sensitive: false },
  i18n: { en: { name: "Ollama", description: "Local LLM provider" } },
};

const enrichmentModuleActive = {
  moduleId: "logo_dev",
  name: "Logo.dev",
  manifestVersion: 1,
  connectorType: "data_enrichment",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheck: new Date("2026-04-06T10:00:00Z").toISOString(),
  credential: { type: "api_key", moduleId: "logo_dev", required: false, sensitive: true, envFallback: "LOGODEV_API_KEY" },
  i18n: { en: { name: "Logo.dev", description: "Company logo service" } },
};

const referenceDataModule = {
  moduleId: "esco_classification",
  name: "ESCO Classification API",
  manifestVersion: 1,
  connectorType: "reference_data",
  status: "active",
  healthStatus: "healthy",
  lastHealthCheck: new Date("2026-04-06T10:00:00Z").toISOString(),
  credential: { type: "none", moduleId: "esco_classification", required: false, sensitive: false },
  i18n: { en: { name: "ESCO Classification API", description: "EU occupation taxonomy" } },
};

const enrichmentModuleDegraded = {
  moduleId: "google_favicon",
  name: "Google Favicon",
  manifestVersion: 1,
  connectorType: "data_enrichment",
  status: "active",
  healthStatus: "degraded",
  lastHealthCheck: undefined,
  credential: { type: "none", moduleId: "google_favicon", required: false, sensitive: false },
  i18n: { en: { name: "Google Favicon", description: "Favicon service" } },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ApiStatusOverview", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("shows loading state while fetching modules", () => {
    mockGetModuleManifests.mockReturnValue(new Promise(() => {})); // never resolves

    render(<ApiStatusOverview />);

    expect(screen.getByText("API Status Overview")).toBeInTheDocument();
    expect(screen.getByText("Loading enrichment modules...")).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("renders the overview title after loading", async () => {
    mockGetModuleManifests.mockResolvedValue({ success: true, data: [enrichmentModuleActive] });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("API Status Overview")).toBeInTheDocument();
    });
  });

  it("renders the Check All button", async () => {
    mockGetModuleManifests.mockResolvedValue({ success: true, data: [enrichmentModuleActive] });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /check all/i })).toBeInTheDocument();
    });
  });

  it("groups modules under their connector type heading", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [jobDiscoveryModule, aiProviderModule, enrichmentModuleActive],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Job Discovery")).toBeInTheDocument();
      expect(screen.getByText("AI Provider")).toBeInTheDocument();
      expect(screen.getByText("Data Enrichment")).toBeInTheDocument();
    });
  });

  it("renders module names inside their groups", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [jobDiscoveryModule, enrichmentModuleActive],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("EURES")).toBeInTheDocument();
    });
    // logo_dev has an i18n key — component should resolve it
    expect(screen.getByText("Logo.dev")).toBeInTheDocument();
  });

  it("renders ESCO Classification API name for esco_classification module", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [referenceDataModule],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("ESCO Classification API")).toBeInTheDocument();
    });
  });

  it("renders health status dots with correct CSS class for healthy module", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleActive],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    const dot = screen.getByRole("img", { name: "Healthy" });
    expect(dot).toHaveClass("bg-green-500");
  });

  it("renders health status dot with correct CSS class for degraded module", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleDegraded],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Google Favicon")).toBeInTheDocument();
    });

    const dot = screen.getByRole("img", { name: "Degraded" });
    expect(dot).toHaveClass("bg-yellow-500");
  });

  it("renders health status dot with green class for healthy reference data module", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [referenceDataModule],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("ESCO Classification API")).toBeInTheDocument();
    });

    const dot = screen.getByRole("img", { name: "Healthy" });
    expect(dot).toHaveClass("bg-green-500");
  });

  it("shows Reference Data group for reference_data modules", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [referenceDataModule],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Reference Data")).toBeInTheDocument();
    });
  });

  it("omits connector group section when no modules of that type exist", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleActive], // only data enrichment
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Data Enrichment")).toBeInTheDocument();
    });

    expect(screen.queryByText("Job Discovery")).not.toBeInTheDocument();
    expect(screen.queryByText("AI Provider")).not.toBeInTheDocument();
  });

  it("shows empty state card when modules list is empty", async () => {
    mockGetModuleManifests.mockResolvedValue({ success: true, data: [] });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      // Empty state message — t("enrichment.noModules") falls through to key
      expect(screen.getByText("enrichment.noModules")).toBeInTheDocument();
    });

    expect(screen.queryByText("Job Discovery")).not.toBeInTheDocument();
    expect(screen.queryByText("Data Enrichment")).not.toBeInTheDocument();
  });

  it("shows error state when fetch fails", async () => {
    mockGetModuleManifests.mockResolvedValue({ success: false, message: "Server error" });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      // Error state message — t("enrichment.errorLoading") falls through to key
      expect(screen.getByText("enrichment.errorLoading")).toBeInTheDocument();
    });
  });

  it("shows badge with module count per group", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleActive, referenceDataModule],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Data Enrichment")).toBeInTheDocument();
    });

    // Each group has 1 module — badge shows "1" for each
    const badges = screen.getAllByText("1");
    expect(badges.length).toBeGreaterThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// M-Y-04 (Sprint 3 Stream F) — per-row health-check button target size.
//
// WCAG 2.5.5 AAA / 2.5.8 AA: the health-check button was h-8 w-8 (32x32).
// That technically passes 2.5.8 AA (24x24 minimum) but fails 2.5.5 AAA
// (44x44 minimum). The Sprint 3 Stream F fix migrates the button from a
// manual `className="h-8 w-8 p-0"` override to the new `size="icon-lg"`
// variant (44x44) on the Shadcn Button. This test pins the new dimensions
// so a future className refactor cannot silently regress.
// ---------------------------------------------------------------------------

describe("ApiStatusOverview — M-Y-04 health-check button size (WCAG 2.5.5 AAA)", () => {
  it("per-row health-check button renders at 44x44 (h-11 w-11)", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleActive],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
    });

    // The button's accessible name is "Check now — Logo.dev" per the
    // per-row aria-label template. Match the button by aria-label fragment.
    const checkButton = screen.getByRole("button", {
      name: /Check now — Logo\.dev/i,
    });
    expect(checkButton).toHaveClass("h-11");
    expect(checkButton).toHaveClass("w-11");
  });

  it("per-row health-check button preserves its per-module accessible name", async () => {
    mockGetModuleManifests.mockResolvedValue({
      success: true,
      data: [enrichmentModuleActive, enrichmentModuleDegraded],
    });

    render(<ApiStatusOverview />);

    await waitFor(() => {
      expect(screen.getByText("Logo.dev")).toBeInTheDocument();
      expect(screen.getByText("Google Favicon")).toBeInTheDocument();
    });

    // Two distinct buttons, one per module — guards against a regression
    // where the per-row aria-label template is dropped.
    expect(
      screen.getByRole("button", { name: /Check now — Logo\.dev/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Check now — Google Favicon/i }),
    ).toBeInTheDocument();
  });
});
