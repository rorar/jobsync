/**
 * AutomationDetailHeader Component Tests
 *
 * Tests: renders automation name + keyword badges + action buttons,
 * onRunNow callback, disabled Run Now with tooltip when resumeMissing.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import type { AutomationWithResume } from "@/models/automation.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.keywords": "Keywords",
        "automations.locationLabel": "Location",
        "automations.edit": "Edit",
        "automations.pause": "Pause",
        "automations.resume": "Resume",
        "automations.runNow": "Run Now",
        "automations.alreadyRunning": "Already running",
        "automations.runNowPaused": "Automation is paused",
        "automations.runNowResumeMissing": "Resume is missing",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

jest.mock("next/link", () => ({
  __esModule: true,
  default: ({
    children,
    href,
  }: {
    children: React.ReactNode;
    href: string;
  }) => <a href={href}>{children}</a>,
}));

jest.mock("lucide-react", () => ({
  ArrowLeft: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-arrow-left" {...props} />
  ),
  Pause: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-pause" {...props} />
  ),
  Play: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-play" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader" {...props} />
  ),
  PlayCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-play-circle" {...props} />
  ),
  Pencil: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-pencil" {...props} />
  ),
}));

// Inline RunStatusBadge — just renders a span with the automationId
jest.mock("@/components/automations/RunStatusBadge", () => ({
  RunStatusBadge: ({ automationId }: { automationId: string }) => (
    <span data-testid="run-status-badge">{automationId}</span>
  ),
}));

// Inline LocationBadge — renders code as text
jest.mock("@/components/ui/location-badge", () => ({
  LocationBadge: ({ code }: { code: string; resolve?: boolean }) => (
    <span data-testid="location-badge">{code}</span>
  ),
}));

// Inline Tooltip — renders trigger and content side by side without portals
jest.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  Tooltip: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  TooltipTrigger: ({
    children,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="tooltip-content">{children}</div>
  ),
}));

import { AutomationDetailHeader } from "@/components/automations/AutomationDetailHeader";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAutomation(
  overrides: Partial<AutomationWithResume> = {},
): AutomationWithResume {
  return {
    id: "auto-1",
    userId: "user-1",
    name: "My EURES Search",
    jobBoard: "eures",
    keywords: "Software Engineer||Backend Developer",
    location: "de,fr",
    connectorParams: null,
    resumeId: "resume-1",
    matchThreshold: 70,
    scheduleHour: 8,
    scheduleFrequency: "daily",
    nextRunAt: null,
    lastRunAt: null,
    status: "active",
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resume: { id: "resume-1", title: "My Resume" },
    ...overrides,
  };
}

const defaultProps = {
  automation: makeAutomation(),
  resumeMissing: false,
  actionLoading: false,
  runNowLoading: false,
  isRunning: false,
  onRefresh: jest.fn(),
  onEdit: jest.fn(),
  onPauseResume: jest.fn(),
  onRunNow: jest.fn(),
};

// ---------------------------------------------------------------------------
// Suite — rendering
// ---------------------------------------------------------------------------

describe("AutomationDetailHeader — rendering", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders automation name, keyword badges, and action buttons", () => {
    render(<AutomationDetailHeader {...defaultProps} />);

    // Automation name
    expect(screen.getByText("My EURES Search")).toBeInTheDocument();

    // Keyword badges (parsed from "Software Engineer||Backend Developer")
    expect(screen.getByText("Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("Backend Developer")).toBeInTheDocument();

    // Location badges
    const locationBadges = screen.getAllByTestId("location-badge");
    expect(locationBadges).toHaveLength(2);
    expect(locationBadges[0]).toHaveTextContent("de");
    expect(locationBadges[1]).toHaveTextContent("fr");

    // Action buttons
    expect(screen.getByText("Edit")).toBeInTheDocument();
    expect(screen.getByText("Pause")).toBeInTheDocument();
    expect(screen.getByText("Run Now")).toBeInTheDocument();

    // RunStatusBadge
    expect(screen.getByTestId("run-status-badge")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — Run Now callback
// ---------------------------------------------------------------------------

describe("AutomationDetailHeader — Run Now callback", () => {
  beforeEach(() => jest.clearAllMocks());

  it("calls onRunNow when Run Now button is clicked", () => {
    const onRunNow = jest.fn();
    render(
      <AutomationDetailHeader {...defaultProps} onRunNow={onRunNow} />,
    );

    fireEvent.click(screen.getByText("Run Now"));
    expect(onRunNow).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// Suite — disabled Run Now when resumeMissing
// ---------------------------------------------------------------------------

describe("AutomationDetailHeader — resumeMissing disables Run Now", () => {
  beforeEach(() => jest.clearAllMocks());

  it("disables Run Now and shows tooltip when resumeMissing is true", () => {
    render(
      <AutomationDetailHeader {...defaultProps} resumeMissing={true} />,
    );

    // The Run Now button should be disabled
    const runNowButton = screen.getByText("Run Now").closest("button");
    expect(runNowButton).toBeDisabled();

    // Tooltip content should show the resume missing message
    const tooltipContent = screen.getByTestId("tooltip-content");
    expect(tooltipContent).toHaveTextContent("Resume is missing");
  });
});
