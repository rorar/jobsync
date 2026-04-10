/**
 * Accessibility (axe-core) tests for DeckView component.
 *
 * Tests: empty state a11y, populated deck a11y.
 *
 * M-T-05: The DeckCard stub has been removed.  The real DeckCard now renders
 * so axe-core exercises the actual production markup — including the header,
 * salary meta, description, and the info button WCAG 2.5.5 hit-area.
 *
 * Only DeckCard's *heavy* dependencies are mocked (CompanyLogo, lucide-react)
 * — not DeckCard itself.  The mock targets are:
 *
 *   - lucide-react: icon components throw in jsdom because they use SVG
 *     APIs that aren't fully implemented.  Replace with lightweight spans.
 *   - CompanyLogo: triggers fetch/IntersectionObserver paths in the browser.
 *     In jsdom it degrades safely to initials, but we mock it anyway to keep
 *     the test hermetic and avoid any cross-cutting fetch intercepts.
 *
 * Everything else (MatchScoreRing, Badge, the DeckCard layout itself) renders
 * real so axe-core sees the true DOM structure.
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
        "deck.blockTooltip": "Block this company",
        "deck.skipTooltip": "Skip for now",
        "deck.block": "Block",
        "deck.skip": "Skip",
        "deck.autoApprove": "Auto-approve promoted",
        "deck.autoApproveHint": "Skip manual confirmation for promoted vacancies",
        "deck.actionDismissed": "Dismissed",
        "deck.actionPromoted": "Promoted",
        "deck.actionSuperLiked": "Super-liked",
        "deck.actionBlocked": "Blocked",
        "deck.actionSkipped": "Skipped",
        "deck.swipeHint": "Swipe to decide",
        "deck.detailsTooltip": "View details",
        "deck.noScoreHint": "Score not available",
        // DeckCard extended meta keys
        "deck.immediateStart": "Immediate start",
        "deck.positions": "{count} positions",
        // CompanyLogo fallback label
        "enrichment.noLogo": "No logo available",
        "common.na": "N/A",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

// M-T-05: CompanyLogo mocked to keep the test hermetic (no fetch / image load
// paths in jsdom).  The real DeckCard renders everything else.
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: ({ companyName }: { companyName: string }) => (
    <span data-testid="company-logo">{companyName}</span>
  ),
}));

// lucide-react — lightweight icon stubs.  jsdom does not fully support SVG
// APIs that some icon implementations require; stubs keep the test hermetic.
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
  // M-T-01 / M-T-05: mockOnAction reflects the real ADR-030 Decision A contract.
  const mockOnAction = jest.fn().mockResolvedValue({ success: true });
  const mockOnBackToList = jest.fn();

  it("DeckView with vacancies has no a11y violations (real DeckCard DOM)", async () => {
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

  // ---------------------------------------------------------------------------
  // Sprint 4 Stream E — L-NEW-01: single polite live region
  //
  // Before the fix, DeckView mounted TWO adjacent live regions: a
  // `polite` card announcement and an `assertive` last-action region.
  // They collided on every deck action (assertive interrupts polite).
  // The fix consolidates them into ONE polite region, dropping the
  // assertive region entirely. This test pins the single-region
  // invariant so a future edit can't accidentally reintroduce an
  // assertive sibling.
  // ---------------------------------------------------------------------------
  describe("L-NEW-01 — single live region (no assertive sibling)", () => {
    it("renders exactly one aria-live region inside the deck, and it is polite", () => {
      const vacancies = [makeVacancy("v1", "Job Alpha")];
      const { container } = render(
        <DeckView
          vacancies={vacancies}
          onAction={mockOnAction}
          onBackToList={mockOnBackToList}
        />,
      );

      const liveRegions = Array.from(
        container.querySelectorAll<HTMLElement>("[aria-live]"),
      );
      // Exactly one aria-live region rendered directly under DeckView.
      // (The SuperLikeCelebrationHost has its own `role="status"` which
      // does NOT set aria-live on its root, so it is not counted here.)
      expect(liveRegions).toHaveLength(1);

      // The remaining live region MUST be polite.
      expect(liveRegions[0]).toHaveAttribute("aria-live", "polite");

      // And it MUST NOT be assertive — direct regression guard.
      const assertiveRegions = container.querySelectorAll(
        '[aria-live="assertive"]',
      );
      expect(assertiveRegions).toHaveLength(0);
    });
  });
});
