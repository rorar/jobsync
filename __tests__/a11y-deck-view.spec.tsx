/**
 * Accessibility (axe-core) tests for DeckView component.
 *
 * Tests: empty state a11y, populated deck a11y.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render } from "@testing-library/react";
import { axe } from "@/lib/test/axe-helpers";
import { DeckView } from "@/components/staging/DeckView";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancy } from "@/lib/data/testFixtures";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/navigation — SuperLikeCelebrationHost calls useRouter() which
// throws "invariant expected app router to be mounted" outside a Next app.
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  usePathname: () => "/dashboard/staging",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "deck.dismiss": "Dismiss",
        "deck.promote": "Promote",
        "deck.superLike": "Super-Like",
        "deck.undo": "Undo",
        "deck.dismissTooltip": "Dismiss this vacancy",
        "deck.promoteTooltip": "Promote this vacancy to a job",
        "deck.superLikeTooltip": "Super-like and promote with favorite tag",
        "deck.undoTooltip": "Undo last action",
        "deck.counter": "{current} / {total}",
        "deck.emptyTitle": "All caught up!",
        "deck.emptyDescription": "No staged vacancies to review.",
        "deck.backToList": "Back to List",
        "deck.sessionCompleteTitle": "Session complete!",
        "deck.sessionCompleteDescription":
          "You reviewed {count} vacancies. {promoted} promoted, {dismissed} dismissed.",
        "deck.viewModeDeck": "Deck",
        "deck.keyboardHints": "Keyboard shortcuts",
        "deck.matchScore": "Match",
        "deck.noDescription": "No description available.",
        "deck.showMore": "Show more",
        "deck.showLess": "Show less",
        "deck.viaAutomation": 'via "{name}" automation',
        "deck.cardAnnouncement":
          "Vacancy {current} of {total}: {title}",
        "deck.cardAnnouncementNoScore":
          "Vacancy {current} of {total}: {title}",
        "common.na": "N/A",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

// DeckCard — stub to avoid deep dependency tree
jest.mock("@/components/staging/DeckCard", () => ({
  DeckCard: ({ vacancy }: { vacancy: StagedVacancyWithAutomation }) => (
    <div data-testid="deck-card">{vacancy.title}</div>
  ),
}));

// lucide-react — minimal icon stubs
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeVacancy(
  id: string,
  title: string,
): StagedVacancyWithAutomation {
  return {
    ...mockStagedVacancy,
    id,
    title,
    automation: { id: "auto-1", name: "EU Tech Jobs" },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DeckView a11y", () => {
  const mockOnAction = jest.fn().mockResolvedValue(undefined);
  const mockOnBackToList = jest.fn();

  it("DeckView with vacancies has no a11y violations", async () => {
    const vacancies = [
      makeVacancy("v1", "Job Alpha"),
      makeVacancy("v2", "Job Beta"),
    ];
    const { container } = render(
      <DeckView
        vacancies={vacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("DeckView empty state has no a11y violations", async () => {
    const { container } = render(
      <DeckView
        vacancies={[]}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
