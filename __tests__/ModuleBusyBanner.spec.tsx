/**
 * ModuleBusyBanner Component Tests
 *
 * Tests: renders nothing when no contention, renders alert when other automations
 * use the same module, excludes self from contention list, renders correct links,
 * handles multiple contending automations.
 *
 * Spec: scheduler-coordination.allium (surface ModuleBusyBanner)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { RunLock } from "@/lib/scheduler/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.moduleBusy": "Module busy",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

const mockGetModuleBusy = jest.fn<RunLock[], [string]>();

jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => ({
    getModuleBusy: mockGetModuleBusy,
  }),
}));

// Mock next/link to render an <a> tag (JSDOM compatible)
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

jest.mock("lucide-react", () => ({
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert-circle" {...props} />
  ),
}));

import { ModuleBusyBanner } from "@/components/automations/ModuleBusyBanner";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeLock(overrides: Partial<RunLock> = {}): RunLock {
  return {
    automationId: "auto-other",
    automationName: "Other Automation",
    runSource: "scheduler",
    moduleId: "jsearch",
    startedAt: new Date("2026-01-01T10:00:00Z"),
    userId: "user-2",
    ...overrides,
  };
}

const OWN_AUTOMATION_ID = "auto-self";
const MODULE_ID = "jsearch";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("ModuleBusyBanner — no contention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns null when no other automations are using the module", () => {
    mockGetModuleBusy.mockReturnValue([]);
    const { container } = render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("returns null when the only lock is for this automation itself (filtered)", () => {
    // getModuleBusy returns a lock for the same automationId → filtered out
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationId: OWN_AUTOMATION_ID }),
    ]);
    const { container } = render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("queries getModuleBusy with the correct moduleId", () => {
    mockGetModuleBusy.mockReturnValue([]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId="eures" />,
    );
    expect(mockGetModuleBusy).toHaveBeenCalledWith("eures");
  });
});

// ---------------------------------------------------------------------------

describe("ModuleBusyBanner — single contention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders an alert role element when another automation is using the module", () => {
    mockGetModuleBusy.mockReturnValue([makeLock()]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("renders the alert icon", () => {
    mockGetModuleBusy.mockReturnValue([makeLock()]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(screen.getByTestId("icon-alert-circle")).toBeInTheDocument();
  });

  it("renders the contending automation's name", () => {
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationName: "Alpha Contender" }),
    ]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(screen.getByText("Alpha Contender")).toBeInTheDocument();
  });

  it("renders a link to the contending automation's detail page", () => {
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationId: "auto-contender-id" }),
    ]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute(
      "href",
      "/dashboard/automations/auto-contender-id",
    );
  });
});

// ---------------------------------------------------------------------------

describe("ModuleBusyBanner — multiple contentions", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders all contending automation names when multiple share the module", () => {
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationId: "auto-1", automationName: "First Contender" }),
      makeLock({ automationId: "auto-2", automationName: "Second Contender" }),
      makeLock({ automationId: "auto-3", automationName: "Third Contender" }),
    ]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    expect(screen.getByText("First Contender")).toBeInTheDocument();
    expect(screen.getByText("Second Contender")).toBeInTheDocument();
    expect(screen.getByText("Third Contender")).toBeInTheDocument();
  });

  it("renders one link per contending automation", () => {
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationId: "auto-link-1" }),
      makeLock({ automationId: "auto-link-2" }),
    ]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(2);
  });

  it("excludes own automationId from the displayed contenders", () => {
    mockGetModuleBusy.mockReturnValue([
      makeLock({ automationId: OWN_AUTOMATION_ID, automationName: "Myself" }),
      makeLock({ automationId: "auto-other", automationName: "Other" }),
    ]);
    render(
      <ModuleBusyBanner automationId={OWN_AUTOMATION_ID} moduleId={MODULE_ID} />,
    );
    // Only one link — the self entry is filtered
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByText("Myself")).not.toBeInTheDocument();
  });
});
