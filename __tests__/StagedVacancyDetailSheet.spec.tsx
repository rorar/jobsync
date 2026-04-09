/**
 * StagedVacancyDetailSheet component tests (Stream C — task 2)
 *
 * Tests: open/close behaviour, list vs deck action sets, auto-close on
 * action, fallback for missing description, external link security
 * attributes, and SheetTitle presence for accessibility.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.details": "Details",
        "staging.detailsTitle": "Vacancy details",
        "staging.detailsClose": "Close details",
        "staging.detailsFullDescription": "Full description",
        "staging.detailsAboutCompany": "About the company",
        "staging.detailsApplicationInfo": "How to apply",
        "staging.detailsSource": "Source",
        "staging.detailsOpenExternal": "View original posting",
        "staging.detailsNoDescription": "No description available",
        "staging.detailsClassification": "Classification",
        "staging.detailsAutomation": "Automation",
        "staging.requiredExperience": "years experience",
        "staging.promote": "Promote to Job",
        "staging.dismiss": "Dismiss",
        "staging.archive": "Archive",
        "staging.source": "Source",
        "staging.positions": "{count} positions",
        "staging.immediateStart": "Immediate start",
        "deck.promote": "Promote",
        "deck.dismiss": "Dismiss",
        "deck.superLike": "Super-Like",
        "deck.block": "Block",
        "deck.skip": "Skip",
        "enrichment.noLogo": "No logo available",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 10);
  },
}));

// Mock the media query hook to force desktop layout in tests
jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: jest.fn(() => true),
}));

// Mock the Sheet primitives to render inline (Radix portals don't work in JSDOM)
jest.mock("@/components/ui/sheet", () => {
  const React = require("react");
  return {
    Sheet: ({
      open,
      children,
    }: {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
      children: React.ReactNode;
    }) => (open ? <div data-testid="sheet-root">{children}</div> : null),
    SheetContent: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      side?: string;
      className?: string;
    }) => (
      <div role="dialog" aria-modal="true" className={className}>
        {children}
      </div>
    ),
    SheetHeader: ({ children }: { children: React.ReactNode }) => (
      <header>{children}</header>
    ),
    SheetFooter: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => <footer className={className}>{children}</footer>,
    SheetTitle: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => (
      <h2 data-testid="sheet-title" className={className}>
        {children}
      </h2>
    ),
    SheetDescription: ({
      children,
      id,
      className,
    }: {
      children: React.ReactNode;
      id?: string;
      className?: string;
    }) => (
      <p id={id} className={className}>
        {children}
      </p>
    ),
  };
});

// ScrollArea renders children directly in tests
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({
    children,
    className,
  }: {
    children: React.ReactNode;
    className?: string;
  }) => <div className={className}>{children}</div>,
}));

// CompanyLogo mock to avoid the IntersectionObserver / image loading paths
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: ({ companyName }: { companyName: string }) => (
    <span data-testid="company-logo">{companyName}</span>
  ),
}));

import { StagedVacancyDetailSheet } from "@/components/staging/StagedVacancyDetailSheet";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const baseVacancy: StagedVacancyWithAutomation = {
  id: "vac_1",
  userId: "user_1",
  sourceBoard: "EURES",
  externalId: "ext_123",
  sourceUrl: "https://eures.europa.eu/jobs/12345",
  title: "Senior React Developer",
  employerName: "Acme Corp",
  location: "Berlin, Germany",
  description: "Build great React components.\n\nWork with a great team.",
  salary: null,
  employmentType: "Full-time",
  postedAt: new Date("2026-03-15T10:00:00Z"),
  applicationDeadline: "2026-05-01",
  applicationInstructions: "Send CV and cover letter.",
  companyUrl: "https://acme.example.com",
  companyDescription: "A leading technology company.",
  industryCodes: ["IT", "SOFTWARE"],
  companySize: "500-1000",
  positionOfferingCode: "directhire",
  numberOfPosts: 2,
  occupationUris: [
    "http://data.europa.eu/esco/occupation/1234",
    "http://data.europa.eu/esco/occupation/5678",
  ],
  requiredEducationLevel: "bachelor",
  requiredExperienceYears: 3,
  workingLanguages: ["en", "de"],
  salaryMin: 60000,
  salaryMax: 80000,
  salaryCurrency: "EUR",
  salaryPeriod: "year",
  immediateStart: true,
  contractStartDate: "2026-06-01",
  contractEndDate: null,
  euresFlag: true,
  source: "automation",
  automationId: "auto_1",
  matchScore: 87,
  matchData: null,
  status: "staged",
  promotedToJobId: null,
  archivedAt: null,
  trashedAt: null,
  discoveredAt: new Date("2026-04-01T08:00:00Z"),
  createdAt: new Date("2026-04-01T08:00:00Z"),
  updatedAt: new Date("2026-04-01T08:00:00Z"),
  automation: { id: "auto_1", name: "EU Tech Search" },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderSheet(
  props: Partial<React.ComponentProps<typeof StagedVacancyDetailSheet>> = {},
) {
  const defaults: React.ComponentProps<typeof StagedVacancyDetailSheet> = {
    vacancy: baseVacancy,
    open: true,
    onOpenChange: jest.fn(),
    mode: "list",
  };
  return render(<StagedVacancyDetailSheet {...defaults} {...props} />);
}

// ---------------------------------------------------------------------------
// Suite — open/close
// ---------------------------------------------------------------------------

describe("StagedVacancyDetailSheet — open/close", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the dialog when open is true", () => {
    renderSheet({ open: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does NOT render when open is false", () => {
    renderSheet({ open: false });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("does NOT crash when vacancy is null and open is true", () => {
    renderSheet({ vacancy: null, open: true });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — content rendering
// ---------------------------------------------------------------------------

describe("StagedVacancyDetailSheet — content", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders the vacancy title and employer", () => {
    renderSheet();
    // Title appears in both the sr-only SheetTitle and the visible h2
    expect(screen.getAllByText("Senior React Developer").length).toBeGreaterThan(
      0,
    );
    // Employer name appears in both the CompanyLogo mock and the header label
    expect(screen.getAllByText("Acme Corp").length).toBeGreaterThan(0);
  });

  it("renders the source board badge", () => {
    renderSheet();
    // 'EURES' appears in source meta and source badge — assert at least one
    expect(screen.getAllByText("EURES").length).toBeGreaterThan(0);
  });

  it("renders the full description text", () => {
    renderSheet();
    expect(screen.getByText(/Build great React components/)).toBeInTheDocument();
  });

  it("renders the application instructions section when present", () => {
    renderSheet();
    expect(screen.getByText("How to apply")).toBeInTheDocument();
    expect(screen.getByText("Send CV and cover letter.")).toBeInTheDocument();
  });

  it("renders the automation name in source meta", () => {
    renderSheet();
    expect(screen.getByText("EU Tech Search")).toBeInTheDocument();
  });

  it("renders the external source link with rel=noopener noreferrer", () => {
    renderSheet();
    const link = screen.getByRole("link", { name: /View original posting/i });
    expect(link).toHaveAttribute("href", "https://eures.europa.eu/jobs/12345");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders the company URL link with rel=noopener noreferrer", () => {
    renderSheet();
    const link = screen.getByRole("link", { name: /acme\.example\.com/i });
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows 'No description available' fallback when description is null", () => {
    renderSheet({ vacancy: { ...baseVacancy, description: null } });
    expect(screen.getByText("No description available")).toBeInTheDocument();
  });

  it("renders the SheetTitle element (may be sr-only)", () => {
    renderSheet();
    expect(screen.getByTestId("sheet-title")).toBeInTheDocument();
  });

  it("renders the match score when present", () => {
    renderSheet();
    expect(screen.getByText("87")).toBeInTheDocument();
  });

  it("renders working languages as chips", () => {
    renderSheet();
    expect(screen.getByText("en")).toBeInTheDocument();
    expect(screen.getByText("de")).toBeInTheDocument();
  });

  it("renders industry codes as chips", () => {
    renderSheet();
    expect(screen.getByText("IT")).toBeInTheDocument();
    expect(screen.getByText("SOFTWARE")).toBeInTheDocument();
  });

  it("renders occupation URIs under classification", () => {
    renderSheet();
    expect(screen.getByText("Classification")).toBeInTheDocument();
    expect(
      screen.getByText("http://data.europa.eu/esco/occupation/1234"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — list mode actions
// ---------------------------------------------------------------------------

describe("StagedVacancyDetailSheet — list mode actions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows promote, dismiss, archive buttons in list mode", () => {
    renderSheet({
      mode: "list",
      onPromote: jest.fn(),
      onDismiss: jest.fn(),
      onArchive: jest.fn(),
    });

    expect(
      screen.getByRole("button", { name: /Promote to Job/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Dismiss/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Archive/i }),
    ).toBeInTheDocument();
  });

  it("calls onPromote and auto-closes when promote button clicked", async () => {
    const onPromote = jest.fn();
    const onOpenChange = jest.fn();
    renderSheet({
      mode: "list",
      onPromote,
      onOpenChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /Promote to Job/i }));

    await waitFor(() => {
      expect(onPromote).toHaveBeenCalledTimes(1);
    });
    expect(onPromote).toHaveBeenCalledWith(baseVacancy);
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("does NOT show skip button in list mode", () => {
    renderSheet({
      mode: "list",
      onSkip: jest.fn(),
      onPromote: jest.fn(),
    });

    // list mode ignores onSkip
    expect(screen.queryByRole("button", { name: /^Skip$/ })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — deck mode actions
// ---------------------------------------------------------------------------

describe("StagedVacancyDetailSheet — deck mode actions", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows deck-appropriate buttons (promote, super-like, dismiss, block, skip)", () => {
    renderSheet({
      mode: "deck",
      onPromote: jest.fn(),
      onSuperLike: jest.fn(),
      onDismiss: jest.fn(),
      onBlock: jest.fn(),
      onSkip: jest.fn(),
    });

    // Deck uses "deck.promote" ("Promote") and "deck.dismiss" ("Dismiss") labels
    expect(
      screen.getAllByRole("button", { name: /Promote/i }).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getByRole("button", { name: /Super-Like/i }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("button", { name: /Dismiss/i }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Block/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Skip/i })).toBeInTheDocument();
  });

  it("does NOT show archive button in deck mode", () => {
    renderSheet({
      mode: "deck",
      onArchive: jest.fn(),
      onPromote: jest.fn(),
    });

    expect(
      screen.queryByRole("button", { name: /Archive/i }),
    ).not.toBeInTheDocument();
  });

  it("calls onSuperLike and auto-closes when super-like clicked", async () => {
    const onSuperLike = jest.fn();
    const onOpenChange = jest.fn();
    renderSheet({
      mode: "deck",
      onSuperLike,
      onOpenChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /Super-Like/i }));

    await waitFor(() => {
      expect(onSuperLike).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("calls onDismiss and auto-closes when dismiss clicked in deck mode", async () => {
    const onDismiss = jest.fn();
    const onOpenChange = jest.fn();
    renderSheet({
      mode: "deck",
      onDismiss,
      onOpenChange,
    });

    fireEvent.click(screen.getByRole("button", { name: /^Dismiss$/ }));

    await waitFor(() => {
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });
    await waitFor(() => {
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });
});
