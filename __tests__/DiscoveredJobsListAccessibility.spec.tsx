/**
 * DiscoveredJobsList accessibility regression guard — Sprint 2 Stream G.
 *
 * Locks in the H-Y-03 / H-Y-04 / H-Y-05 fixes:
 *   - H-Y-03: Icon-only Accept + Dismiss buttons now carry a translated
 *     aria-label that includes the job context (title + employer), so
 *     screen reader users know which row the action targets.
 *   - H-Y-04: External-link anchor now carries a translated aria-label
 *     ("Open job ... in new tab") so WCAG 2.4.4 (Link Purpose) passes.
 *   - H-Y-05: The clickable job title is now a native <button> with a
 *     translated aria-label, tabIndex 0 by default, and onKeyDown
 *     handled by the browser for Enter/Space (native button behaviour).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import { DiscoveredJobsList } from "@/components/automations/DiscoveredJobsList";
import type { DiscoveredJob } from "@/models/automation.model";

// Stable English translations so we can assert accessible names.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.discoveredJobs": "Discovered Jobs",
        "automations.discoveredJobsDesc": "Jobs your automations found",
        "automations.noDiscoveredJobs": "No jobs discovered",
        "automations.noDiscoveredJobsDesc": "Run an automation to discover jobs",
        "automations.job": "Job",
        "automations.company": "Company",
        "automations.locationHeader": "Location",
        "automations.match": "Match",
        "automations.status": "Status",
        "automations.discovered": "Discovered",
        "automations.actions": "Actions",
        "automations.jobAccepted": "Job accepted",
        "automations.jobAcceptedDesc": "Added to jobs",
        "automations.jobDismissed": "Job dismissed",
        "automations.somethingWentWrong": "Something went wrong",
        "automations.discoveredJob.acceptAria": "Accept job {job}",
        "automations.discoveredJob.dismissAria": "Dismiss job {job}",
        "automations.discoveredJob.viewDetailsAria":
          "View details for job {job}",
        "automations.discoveredJob.externalLinkAria":
          "Open job {job} on the original site in a new tab",
        // L-Y-04 (Sprint 4 Stream E) — status badge translations.
        "automations.discoveredJob.status.staged": "Staged",
        "automations.discoveredJob.status.ready": "Ready",
        "automations.discoveredJob.status.dismissed": "Dismissed",
        "automations.discoveredJob.status.promoted": "Promoted",
        "automations.discoveredJob.status.processing": "Processing",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: (d: Date) => d.toISOString().slice(0, 10),
}));

jest.mock("@/lib/eu-portal-urls", () => ({
  euresJobDetailUrl: (raw: string) => raw,
}));

jest.mock("@/actions/automation.actions", () => ({
  acceptDiscoveredJob: jest.fn(),
  dismissDiscoveredJob: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

function makeJob(overrides: Partial<DiscoveredJob> = {}): DiscoveredJob {
  return {
    id: "job-1",
    userId: "user-1",
    automationId: null,
    automation: null,
    title: "Senior Software Engineer",
    employerName: "Acme Corp",
    location: "Berlin",
    matchScore: 78,
    matchData: null,
    status: "staged",
    discoveredAt: new Date("2026-04-01"),
    createdAt: new Date("2026-04-01"),
    sourceUrl: "https://example.com/job/1",
    description: "Test description",
    ...overrides,
  };
}

describe("DiscoveredJobsList — H-Y-03 icon-only action buttons", () => {
  it("renders Accept + Dismiss buttons with translated aria-labels", () => {
    const job = makeJob();

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    // The aria-label MUST include the job context so screen reader users
    // can distinguish rows.
    expect(
      screen.getByRole("button", {
        name: "Accept job Senior Software Engineer — Acme Corp",
      }),
    ).toBeInTheDocument();

    expect(
      screen.getByRole("button", {
        name: "Dismiss job Senior Software Engineer — Acme Corp",
      }),
    ).toBeInTheDocument();
  });

  it("uses the title only when the employer is missing", () => {
    const job = makeJob({ employerName: null });

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    expect(
      screen.getByRole("button", {
        name: "Accept job Senior Software Engineer",
      }),
    ).toBeInTheDocument();
  });
});

describe("DiscoveredJobsList — H-Y-04 external-link anchor", () => {
  it("external-link anchor has a translated aria-label describing the target", () => {
    const job = makeJob();

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    const link = screen.getByRole("link", {
      name: "Open job Senior Software Engineer — Acme Corp on the original site in a new tab",
    });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});

describe("DiscoveredJobsList — H-Y-05 job title clickable element", () => {
  it("renders the job title as a native <button> (keyboard accessible)", () => {
    const onViewDetails = jest.fn();
    const job = makeJob();

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={onViewDetails}
      />,
    );

    const titleButton = screen.getByRole("button", {
      name: "View details for job Senior Software Engineer — Acme Corp",
    });
    expect(titleButton.tagName).toBe("BUTTON");
    // Native <button> is tabbable by default. No tabIndex override.
    expect(titleButton).not.toHaveAttribute("tabindex", "-1");
  });
});

// ---------------------------------------------------------------------------
// Sprint 4 Stream E — L-Y-04: translated status badge (no raw enum leak)
// ---------------------------------------------------------------------------

describe("DiscoveredJobsList — L-Y-04 translated status badge", () => {
  it("renders the translated status label instead of the raw enum string", () => {
    const job = makeJob({ status: "staged" });

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    // The translated label "Staged" MUST be present.
    expect(screen.getByText("Staged")).toBeInTheDocument();
    // The raw lowercase enum "staged" MUST NOT appear anywhere —
    // that was the pre-fix behaviour and the whole point of L-Y-04.
    expect(screen.queryByText("staged")).not.toBeInTheDocument();
  });

  it("falls back to the raw enum string when the translation key is missing", () => {
    const { useTranslations } = jest.requireMock("@/i18n") as {
      useTranslations: jest.MockedFunction<
        () => { t: (k: string) => string; locale: string }
      >;
    };
    // Pass-through t(): every key is unknown, so `translated === key`
    // triggers the fallback to the raw enum value. This is the
    // future-proof path for enum drift.
    useTranslations.mockReturnValueOnce({
      t: (key: string) => key,
      locale: "en",
    });

    // Use an enum value whose key is intentionally absent from the
    // mock dict above — the fallback path returns the raw status.
    const job = makeJob({ status: "ready" });

    render(
      <DiscoveredJobsList
        jobs={[job]}
        onRefresh={jest.fn()}
        onViewDetails={jest.fn()}
      />,
    );

    // The key-shaped string MUST NOT leak into the DOM.
    expect(
      screen.queryByText("automations.discoveredJob.status.ready"),
    ).not.toBeInTheDocument();
    // The raw enum fallback IS rendered.
    expect(screen.getByText("ready")).toBeInTheDocument();
  });
});
