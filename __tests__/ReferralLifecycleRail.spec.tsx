/**
 * ReferralLifecycleRail Component Tests
 *
 * Tests: nav landmark; ol; exactly one aria-current="step"; NO progressbar;
 * terminal sr-only text; stale revivable sr-only text; correct aria-current
 * per each of the 7 statuses.
 *
 * Design: docs/design/inside-track-ui.md §D + §G items 1+2 + §H
 * Spec:   specs/inside-track.allium (lifecycle graph)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, within } from "@testing-library/react";
import type { ReferralStatus } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dict: Record<string, string> = {
  "insideTrack.lifecycle.railLabel": "Referral lifecycle",
  "insideTrack.lifecycle.terminalState": "terminal",
  "insideTrack.lifecycle.staleRevivable": "revivable",
  "insideTrack.status.open": "Open",
  "insideTrack.status.engaged": "Engaged",
  "insideTrack.status.relayed": "Relayed",
  "insideTrack.status.in_review": "In review",
  "insideTrack.status.converted": "Converted",
  "insideTrack.status.declined": "Declined",
  "insideTrack.status.stale": "Stale",
};

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (k: string) => dict[k] ?? k,
    locale: "en",
  })),
}));

// Lucide icons — minimal stubs
jest.mock("lucide-react", () => ({
  CheckCircle2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check" {...props} />
  ),
  Circle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-circle" {...props} />
  ),
  AlertCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-alert" {...props} />
  ),
  XCircle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-x" {...props} />
  ),
  RefreshCw: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-refresh" {...props} />
  ),
}));

// scrollIntoView is not implemented in jsdom
window.HTMLElement.prototype.scrollIntoView = jest.fn();

import { ReferralLifecycleRail } from "@/components/inside-track/ReferralLifecycleRail";

// ---------------------------------------------------------------------------
// All 7 statuses in canonical rail order
// ---------------------------------------------------------------------------

const ALL_STATUSES: ReferralStatus[] = [
  "open",
  "engaged",
  "relayed",
  "in_review",
  "converted",
  "declined",
  "stale",
];

// ---------------------------------------------------------------------------
// Suite: landmark + structure
// ---------------------------------------------------------------------------

describe("ReferralLifecycleRail — landmark and structure", () => {
  it("renders a <nav> landmark with the translated label", () => {
    render(<ReferralLifecycleRail status="open" />);
    expect(
      screen.getByRole("navigation", { name: "Referral lifecycle" }),
    ).toBeInTheDocument();
  });

  it("renders an ordered list inside the nav", () => {
    render(<ReferralLifecycleRail status="open" />);
    const nav = screen.getByRole("navigation");
    const list = within(nav).getByRole("list");
    expect(list.tagName).toBe("OL");
  });

  it("renders exactly 7 list items", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(7);
  });

  it("does NOT have role='progressbar' anywhere", () => {
    render(<ReferralLifecycleRail status="open" />);
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
  });

  it("renders visible label text for every state", () => {
    render(<ReferralLifecycleRail status="open" />);
    const labels = [
      "Open",
      "Engaged",
      "Relayed",
      "In review",
      "Converted",
      "Declined",
      "Stale",
    ];
    for (const label of labels) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite: exactly one aria-current="step" per status
// ---------------------------------------------------------------------------

describe("ReferralLifecycleRail — aria-current per status", () => {
  for (const status of ALL_STATUSES) {
    it(`has exactly one aria-current="step" when status="${status}"`, () => {
      render(<ReferralLifecycleRail status={status} />);
      const items = screen.getAllByRole("listitem");
      const currentItems = items.filter(
        (el) => el.getAttribute("aria-current") === "step",
      );
      expect(currentItems).toHaveLength(1);
    });
  }
});

// ---------------------------------------------------------------------------
// Suite: correct item carries aria-current
// ---------------------------------------------------------------------------

describe("ReferralLifecycleRail — correct item is current", () => {
  it("marks 'Open' item as current when status='open'", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Open");
  });

  it("marks 'Engaged' item as current when status='engaged'", () => {
    render(<ReferralLifecycleRail status="engaged" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Engaged");
  });

  it("marks 'Relayed' item as current when status='relayed'", () => {
    render(<ReferralLifecycleRail status="relayed" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Relayed");
  });

  it("marks 'In review' item as current when status='in_review'", () => {
    render(<ReferralLifecycleRail status="in_review" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("In review");
  });

  it("marks 'Converted' item as current when status='converted'", () => {
    render(<ReferralLifecycleRail status="converted" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Converted");
  });

  it("marks 'Declined' item as current when status='declined'", () => {
    render(<ReferralLifecycleRail status="declined" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Declined");
  });

  it("marks 'Stale' item as current when status='stale'", () => {
    render(<ReferralLifecycleRail status="stale" />);
    const items = screen.getAllByRole("listitem");
    const currentItem = items.find(
      (el) => el.getAttribute("aria-current") === "step",
    )!;
    expect(currentItem).toHaveTextContent("Stale");
  });
});

// ---------------------------------------------------------------------------
// Suite: terminal / revivable sr-only annotations
// ---------------------------------------------------------------------------

describe("ReferralLifecycleRail — sr-only annotations", () => {
  it("'converted' item contains the sr-only terminal text", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    const convertedItem = items.find((el) =>
      el.textContent?.includes("Converted"),
    )!;
    const srOnly = convertedItem.querySelector(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toContain("terminal");
  });

  it("'declined' item contains the sr-only terminal text", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    const declinedItem = items.find((el) =>
      el.textContent?.includes("Declined"),
    )!;
    const srOnly = declinedItem.querySelector(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toContain("terminal");
  });

  it("'stale' item contains the sr-only revivable text", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    const staleItem = items.find((el) => el.textContent?.includes("Stale"))!;
    const srOnly = staleItem.querySelector(".sr-only");
    expect(srOnly).not.toBeNull();
    expect(srOnly!.textContent).toContain("revivable");
  });

  it("non-terminal non-stale items do NOT have terminal/revivable sr-only text", () => {
    render(<ReferralLifecycleRail status="open" />);
    const items = screen.getAllByRole("listitem");
    const workingLabels = ["Open", "Engaged", "Relayed", "In review"];
    for (const label of workingLabels) {
      const item = items.find((el) => el.textContent?.includes(label))!;
      const srOnly = item.querySelector(".sr-only");
      if (srOnly) {
        expect(srOnly.textContent).not.toContain("terminal");
        expect(srOnly.textContent).not.toContain("revivable");
      }
    }
  });
});
