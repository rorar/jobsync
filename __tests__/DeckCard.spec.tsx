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
import { mockStagedVacancy } from "@/lib/data/testFixtures";

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
    ...mockStagedVacancy,
    automation: { id: "auto-1", name: "EU Tech Jobs" },
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
});
