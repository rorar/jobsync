/**
 * DeckCard component tests
 *
 * Tests: rendering with all fields, rendering with null fields,
 * match score ring colors, description expand/collapse, source badge,
 * automation source line, preview mode classes.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { DeckCard } from "@/components/staging/DeckCard";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancyWithAutomation } from "@/lib/data/testFixtures";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "deck.matchScore": "Match",
        "deck.noScoreHint": "No AI scoring performed for this vacancy",
        "deck.noDescription": "No description available.",
        "deck.showMore": "Show more",
        "deck.showLess": "Show less",
        "deck.viaAutomation": 'via "{name}" automation',
        "common.na": "N/A",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

function makeVacancy(overrides: Partial<StagedVacancyWithAutomation> = {}): StagedVacancyWithAutomation {
  return {
    ...mockStagedVacancyWithAutomation,
    ...overrides,
  };
}

describe("DeckCard", () => {
  it("renders vacancy title, employer, location, and salary", () => {
    const vacancy = makeVacancy();
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("TechCorp GmbH")).toBeInTheDocument();
    expect(screen.getByText("Berlin, Germany")).toBeInTheDocument();
    expect(screen.getByText("€60,000 - €80,000")).toBeInTheDocument();
  });

  it("renders source board badge", () => {
    const vacancy = makeVacancy({ sourceBoard: "EURES" });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("EURES")).toBeInTheDocument();
  });

  it("renders match score ring for non-null scores", () => {
    const vacancy = makeVacancy({ matchScore: 85 });
    render(<DeckCard vacancy={vacancy} />);

    // The score number is rendered inside SVG text
    const svgEl = document.querySelector("svg");
    expect(svgEl).toBeInTheDocument();
    expect(svgEl?.textContent).toBe("85");
  });

  it("renders scoring placeholder with tooltip when matchScore is null", () => {
    const vacancy = makeVacancy({ matchScore: null });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("--")).toBeInTheDocument();
    const badge = screen.getByText("--").closest("[title]");
    expect(badge).toHaveAttribute("title", "No AI scoring performed for this vacancy");
  });

  it("renders automation source line", () => {
    const vacancy = makeVacancy({ automation: { id: "a1", name: "EU Tech Jobs" } });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText('via "EU Tech Jobs" automation')).toBeInTheDocument();
  });

  it("hides automation source when no automation", () => {
    const vacancy = makeVacancy({ automation: null });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.queryByText(/via .* automation/)).not.toBeInTheDocument();
  });

  it("shows description with expand toggle for long text", () => {
    const longDesc = "A".repeat(300);
    const vacancy = makeVacancy({ description: longDesc });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("Show more")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Show more"));
    expect(screen.getByText("Show less")).toBeInTheDocument();
  });

  it("shows italic no-description text when description is null", () => {
    const vacancy = makeVacancy({ description: null });
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("No description available.")).toBeInTheDocument();
  });

  it("renders discoveredAt date", () => {
    const vacancy = makeVacancy();
    render(<DeckCard vacancy={vacancy} />);

    expect(screen.getByText("Mar 20, 2026")).toBeInTheDocument();
  });

  it("handles null employer and location gracefully", () => {
    const vacancy = makeVacancy({ employerName: null, location: null, salary: null });
    render(<DeckCard vacancy={vacancy} />);

    // Title still renders
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    // These should not be in the DOM
    expect(screen.queryByText("TechCorp GmbH")).not.toBeInTheDocument();
    expect(screen.queryByText("Berlin, Germany")).not.toBeInTheDocument();
  });

  it("applies exit animation class", () => {
    const vacancy = makeVacancy();
    const { container } = render(<DeckCard vacancy={vacancy} exitDirection="left" />);

    const cardEl = container.firstChild as HTMLElement;
    expect(cardEl.className).toContain("animate-deck-exit-left");
  });

  it("applies preview classes for level 1", () => {
    const vacancy = makeVacancy();
    const { container } = render(<DeckCard vacancy={vacancy} isPreview previewLevel={1} />);

    const cardEl = container.firstChild as HTMLElement;
    expect(cardEl.className).toContain("scale-[0.95]");
    expect(cardEl.className).toContain("opacity-50");
    expect(cardEl.className).toContain("pointer-events-none");
  });

  it("applies preview classes for level 2", () => {
    const vacancy = makeVacancy();
    const { container } = render(<DeckCard vacancy={vacancy} isPreview previewLevel={2} />);

    const cardEl = container.firstChild as HTMLElement;
    expect(cardEl.className).toContain("scale-[0.90]");
    expect(cardEl.className).toContain("opacity-25");
  });

  it("applies exit-down animation class for down direction", () => {
    const vacancy = makeVacancy();
    const { container } = render(<DeckCard vacancy={vacancy} exitDirection="down" />);

    expect(container.firstChild).toHaveClass("animate-deck-exit-down");
  });

  // ---------------------------------------------------------------------
  // H-T-01 regression guard — CRIT-Y1 (WCAG 2.5.5 AAA / 2.5.8 AA)
  // The deck Info button was grown to 44x44 in Sprint 1. No test pinned
  // the dimensions, so a future className refactor could silently regress
  // the touch target back to 40x40. This test pins `h-11 w-11` on the
  // focusable button element — the visible pill inside stays 28x28 by
  // design (see DeckCard.tsx lines 89-99 for the group-utility rationale).
  // ---------------------------------------------------------------------
  it("H-T-01: Info button pointer target is h-11 w-11 (CRIT-Y1 regression guard)", () => {
    const vacancy = makeVacancy();
    const onInfoClick = jest.fn();
    render(<DeckCard vacancy={vacancy} onInfoClick={onInfoClick} />);

    // The focusable element is the native <button> — it owns the 44x44
    // hit area. Match by the aria-label the component sets.
    const infoButton = screen.getByRole("button", { name: "deck.detailsTooltip" });
    expect(infoButton).toHaveClass("h-11");
    expect(infoButton).toHaveClass("w-11");
  });

  it("H-T-01: Info button is NOT rendered when onInfoClick is absent", () => {
    const vacancy = makeVacancy();
    render(<DeckCard vacancy={vacancy} />);
    expect(
      screen.queryByRole("button", { name: "deck.detailsTooltip" }),
    ).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // M-T-10 (Sprint 3 Stream B) — Info button click path
  //
  // Sprint 1 added the Info button to `DeckCard` as the entry point into
  // the details sheet (ADR-030 / CLAUDE.md "Staging Details Sheet + Deck
  // Action Routing"). The Sprint 2 testing review flagged that no unit
  // test exercised the `onInfoClick` prop end-to-end — existing tests only
  // pinned the target-size regression guard. If a future refactor dropped
  // the onClick wiring or swallowed the event via a stopPropagation bug,
  // nothing would catch it.
  //
  // This test clicks the Info button and asserts that the prop is invoked
  // with the full vacancy object exactly once.
  // ---------------------------------------------------------------------
  it("M-T-10: clicking the Info button invokes onInfoClick(vacancy) exactly once", () => {
    const vacancy = makeVacancy();
    const onInfoClick = jest.fn();
    render(<DeckCard vacancy={vacancy} onInfoClick={onInfoClick} />);

    const infoButton = screen.getByRole("button", { name: "deck.detailsTooltip" });
    fireEvent.click(infoButton);

    expect(onInfoClick).toHaveBeenCalledTimes(1);
    expect(onInfoClick).toHaveBeenCalledWith(vacancy);
  });

  it("M-T-10: Info button is NOT rendered in preview mode even when onInfoClick is provided", () => {
    // Preview cards are background deck entries — they must not expose
    // the Info affordance because the user cannot act on them without
    // advancing past the current card.
    const vacancy = makeVacancy();
    const onInfoClick = jest.fn();
    render(
      <DeckCard
        vacancy={vacancy}
        onInfoClick={onInfoClick}
        isPreview
        previewLevel={1}
      />,
    );
    expect(
      screen.queryByRole("button", { name: "deck.detailsTooltip" }),
    ).not.toBeInTheDocument();
  });

  it("M-T-10: Info button click propagation is stopped so the pointer-drag handler does not fire", () => {
    // The Info button lives inside the deck-drag region. A click on the
    // Info button must NOT bubble up to the draggable parent (which would
    // start a drag and potentially trigger a swipe action). We assert via
    // the React synthetic event's `isPropagationStopped`.
    const vacancy = makeVacancy();
    const onInfoClick = jest.fn();
    const onParentClick = jest.fn();

    const { container } = render(
      <div onClick={onParentClick}>
        <DeckCard vacancy={vacancy} onInfoClick={onInfoClick} />
      </div>,
    );

    const infoButton = screen.getByRole("button", { name: "deck.detailsTooltip" });
    fireEvent.click(infoButton);

    // The inner click handler fired.
    expect(onInfoClick).toHaveBeenCalledTimes(1);
    // The outer click handler must NOT have seen the bubbling event
    // because DeckCard's onClick calls e.stopPropagation().
    expect(onParentClick).not.toHaveBeenCalled();
    // Sanity check that the container is actually rendered.
    expect(container.firstChild).toBeTruthy();
  });
});
