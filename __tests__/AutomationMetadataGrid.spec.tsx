/**
 * AutomationMetadataGrid Component Tests
 *
 * Tests: renders all metadata fields (status, module, schedule, resume, etc.),
 * handles null/undefined optional fields gracefully.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import type { AutomationWithResume, DiscoveredJob } from "@/models/automation.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.statusHeader": "Status",
        "automations.jobBoard": "Module",
        "automations.matchThreshold": "Match Threshold",
        "automations.stepSchedule": "Schedule",
        "automations.daily": "Daily",
        "automations.resumeLabel": "Resume",
        "automations.resumeMissing": "Resume missing",
        "automations.nextRun": "Next Run",
        "automations.lastRun": "Last Run",
        "automations.never": "Never",
        "automations.discoveredJobs": "Discovered Jobs",
        "automations.total": "total",
        "automations.new": "New",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateCompact: jest.fn((date: Date) => {
    // Return a stable formatted string for testing
    return "Apr 2, 2026";
  }),
}));

jest.mock("lucide-react", () => ({
  Clock: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-clock" {...props} />
  ),
  FileText: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-file-text" {...props} />
  ),
  AlertTriangle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert-triangle" {...props} />
  ),
}));

import { AutomationMetadataGrid } from "@/components/automations/AutomationMetadataGrid";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAutomation(
  overrides: Partial<AutomationWithResume> = {},
): AutomationWithResume {
  return {
    id: "auto-1",
    userId: "user-1",
    name: "Test Automation",
    jobBoard: "eures",
    keywords: "Software Engineer",
    location: "de",
    connectorParams: null,
    resumeId: "resume-1",
    matchThreshold: 75,
    scheduleHour: 9,
    scheduleFrequency: "daily",
    nextRunAt: new Date("2026-04-03T09:00:00Z"),
    lastRunAt: new Date("2026-04-02T09:00:00Z"),
    status: "active",
    pauseReason: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    resume: { id: "resume-1", title: "My Resume" },
    ...overrides,
  };
}

function makeDiscoveredJob(
  overrides: Partial<DiscoveredJob> = {},
): DiscoveredJob {
  return {
    id: "job-1",
    userId: "user-1",
    automationId: "auto-1",
    jobUrl: "https://example.com/job/1",
    description: "Test job description",
    jobType: "fullTime",
    createdAt: new Date(),
    jobTitleId: "jt-1",
    companyId: "co-1",
    locationId: "loc-1",
    matchScore: 85,
    matchData: null,
    discoveryStatus: "new",
    discoveredAt: new Date(),
    JobTitle: { label: "Software Engineer" },
    Company: { label: "Acme Corp" },
    Location: { label: "Berlin" },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Suite — renders all metadata fields
// ---------------------------------------------------------------------------

describe("AutomationMetadataGrid — full rendering", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders all metadata fields: status, module, threshold, schedule, resume, next run, last run, discovered jobs", () => {
    const automation = makeAutomation();
    const jobs = [makeDiscoveredJob(), makeDiscoveredJob({ id: "job-2" })];

    render(
      <AutomationMetadataGrid
        automation={automation}
        resumeMissing={false}
        jobs={jobs}
        newJobsCount={1}
      />,
    );

    // Status field
    expect(screen.getByText("Status")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();

    // Module field
    expect(screen.getByText("Module")).toBeInTheDocument();
    expect(screen.getByText("eures")).toBeInTheDocument();

    // Match Threshold field
    expect(screen.getByText("Match Threshold")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();

    // Schedule field
    expect(screen.getByText("Schedule")).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.getByText(/daily/)).toBeInTheDocument();

    // Resume field (not missing)
    expect(screen.getByText("Resume")).toBeInTheDocument();
    expect(screen.getByText("My Resume")).toBeInTheDocument();
    expect(screen.getByTestId("icon-file-text")).toBeInTheDocument();

    // Next Run field
    expect(screen.getByText("Next Run")).toBeInTheDocument();

    // Last Run field
    expect(screen.getByText("Last Run")).toBeInTheDocument();

    // Discovered Jobs field
    expect(screen.getByText("Discovered Jobs")).toBeInTheDocument();
    expect(screen.getByText(/2 total/)).toBeInTheDocument();
    // New jobs badge
    expect(screen.getByText(/1 new/)).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — null/undefined optional fields
// ---------------------------------------------------------------------------

describe("AutomationMetadataGrid — null/undefined optional fields", () => {
  beforeEach(() => jest.clearAllMocks());

  it("handles null nextRunAt, null lastRunAt, resumeMissing, and zero jobs gracefully", () => {
    const automation = makeAutomation({
      nextRunAt: null,
      lastRunAt: null,
      status: "paused",
    });

    render(
      <AutomationMetadataGrid
        automation={automation}
        resumeMissing={true}
        jobs={[]}
        newJobsCount={0}
      />,
    );

    // Status shows paused
    expect(screen.getByText("paused")).toBeInTheDocument();

    // Resume missing warning
    expect(screen.getByText("Resume missing")).toBeInTheDocument();
    expect(screen.getByTestId("icon-alert-triangle")).toBeInTheDocument();

    // Next run shows "-" for paused automation
    expect(screen.getByText("-")).toBeInTheDocument();

    // Last run shows "Never" when null
    expect(screen.getByText("Never")).toBeInTheDocument();

    // Discovered jobs shows 0
    expect(screen.getByText(/0 total/)).toBeInTheDocument();

    // No "new" badge when newJobsCount is 0
    expect(screen.queryByText(/new/)).not.toBeInTheDocument();
  });
});
