/**
 * DeckView component tests
 *
 * Tests: empty state, session complete, card rendering, action buttons,
 * keyboard hints, counter display, screen reader live region.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { DeckView } from "@/components/staging/DeckView";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancy } from "@/lib/data/testFixtures";

// Mock next/navigation — the deck now mounts SuperLikeCelebrationHost which
// calls useRouter() at render time. Without this mock the hook throws
// "invariant expected app router to be mounted".
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

// Mock i18n
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
        "deck.sessionCompleteDescription": "You reviewed {count} vacancies. {promoted} promoted, {dismissed} dismissed.",
        "deck.viewModeDeck": "Deck",
        "deck.keyboardHints": "Keyboard shortcuts",
        "deck.matchScore": "Match",
        "deck.noDescription": "No description available.",
        "deck.showMore": "Show more",
        "deck.showLess": "Show less",
        "deck.viaAutomation": 'via "{name}" automation',
        "deck.cardAnnouncement": "Vacancy {current} of {total}: {title}",
        "deck.cardAnnouncementNoScore": "Vacancy {current} of {total}: {title}",
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
        "common.na": "N/A",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: jest.fn(() => "Mar 20, 2026"),
}));

function makeVacancy(id: string, title: string): StagedVacancyWithAutomation {
  return {
    ...mockStagedVacancy,
    id,
    title,
    automation: { id: "auto-1", name: "EU Tech Jobs" },
  };
}

const testVacancies: StagedVacancyWithAutomation[] = [
  makeVacancy("v1", "Job Alpha"),
  makeVacancy("v2", "Job Beta"),
  makeVacancy("v3", "Job Gamma"),
];

describe("DeckView", () => {
  // M-T-01: reflect the real ADR-030 Decision A contract:
  //   onAction: (...) => Promise<{ success: boolean; createdJobId?: string }>
  // Returning `undefined` silently passed before because no test checked `.success`.
  // Using the correct shape makes the entire suite a first-class regression guard
  // against the CRIT-A2 class-of-bug (missing success check in callers).
  const mockOnAction = jest.fn().mockResolvedValue({ success: true });
  const mockOnBackToList = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders empty state when no vacancies", () => {
    render(
      <DeckView
        vacancies={[]}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByText("All caught up!")).toBeInTheDocument();
    expect(screen.getByText("No staged vacancies to review.")).toBeInTheDocument();
    expect(screen.getByText("Back to List")).toBeInTheDocument();
  });

  it("calls onBackToList when back button clicked in empty state", () => {
    render(
      <DeckView
        vacancies={[]}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    fireEvent.click(screen.getByText("Back to List"));
    expect(mockOnBackToList).toHaveBeenCalled();
  });

  it("renders current vacancy card", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByText("Job Alpha")).toBeInTheDocument();
  });

  it("renders counter", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByText("1 / 3")).toBeInTheDocument();
  });

  it("renders action buttons with correct labels", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByLabelText("Dismiss this vacancy")).toBeInTheDocument();
    expect(screen.getByLabelText("Promote this vacancy to a job")).toBeInTheDocument();
    expect(screen.getByLabelText("Super-like and promote with favorite tag")).toBeInTheDocument();
  });

  it("renders keyboard hints on desktop (hidden class for mobile)", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    // Keyboard hints exist in DOM (but hidden on mobile via CSS)
    expect(screen.getByText("Dismiss")).toBeInTheDocument();
    expect(screen.getByText("Promote")).toBeInTheDocument();
    expect(screen.getByText("Super-Like")).toBeInTheDocument();
    expect(screen.getByText("Undo")).toBeInTheDocument();
  });

  it("has accessible region role", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    const region = screen.getByRole("region");
    expect(region).toHaveAttribute("aria-label", "Deck");
  });

  // H-T-01 (Sprint 4 full-review): L-NEW-01 (Stream E) consolidated the
  // two concurrent `aria-live` regions into ONE polite region so screen
  // readers stop double-announcing card changes. Without this assertion,
  // a future regression that re-introduces a second `aria-live` region
  // would ship silently — jsdom does not run AT, so the only signal
  // would be user-reported double-reads in production. This test pins
  // the single-region contract at the DOM level.
  it("L-NEW-01: renders exactly ONE aria-live region (consolidated announcements)", () => {
    const { container } = render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    const liveRegions = container.querySelectorAll("[aria-live]");
    expect(liveRegions).toHaveLength(1);
    // Also confirm it's polite, not assertive — L-NEW-01 explicitly
    // chose polite so the announcement doesn't interrupt screen-reader
    // speech mid-sentence on a deck swipe.
    expect(liveRegions[0]).toHaveAttribute("aria-live", "polite");
  });

  it("disables buttons when no current vacancy", () => {
    // Pass vacancies but simulate being past the end by using a custom hook state
    // For simplicity, test with empty vacancies
    render(
      <DeckView
        vacancies={[]}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    // In empty state, buttons are not rendered (empty state component)
    expect(screen.queryByLabelText("Dismiss this vacancy")).not.toBeInTheDocument();
  });

  it("shows swipe hint on first render when vacancies exist", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByText(/Swipe to decide/)).toBeInTheDocument();
  });

  it("hides swipe hint after an action button is clicked", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    // Swipe hint visible initially
    expect(screen.getByText(/Swipe to decide/)).toBeInTheDocument();

    // Click dismiss — sets showSwipeHint to false synchronously
    fireEvent.click(screen.getByLabelText("Dismiss this vacancy"));

    expect(screen.queryByText(/Swipe to decide/)).not.toBeInTheDocument();
  });

  it("renders block and skip buttons with correct aria-labels", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    expect(screen.getByLabelText("Block this company")).toBeInTheDocument();
    expect(screen.getByLabelText("Skip for now")).toBeInTheDocument();
  });

  it("renders auto-approve checkbox", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    const checkbox = screen.getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
    expect(screen.getByText("Auto-approve promoted")).toBeInTheDocument();
  });

  it("renders keyboard hints for B and N keys", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );

    // B key for Block
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("Block")).toBeInTheDocument();

    // N key for Skip
    expect(screen.getByText("N")).toBeInTheDocument();
    expect(screen.getByText("Skip")).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------
  // H-T-01 regression guard — CRIT-Y1 (WCAG 2.5.5 AAA / 2.5.8 AA)
  // Sprint 1 grew the Block / Skip / Undo action-rail buttons from 40x40
  // to 44x44 (`h-11 w-11`) to satisfy WCAG 2.5.5 AAA. No test pinned the
  // dimensions, so a future refactor could silently regress the hit area.
  // We assert the class on each button by scoping to its aria-label.
  //
  // Note: the Dismiss / Super-Like / Promote buttons intentionally remain
  // LARGER than 44x44 (h-14/h-12/h-16) as the visually prominent swipe
  // targets — they have always been compliant. Only Block, Skip, and
  // Undo were the previously-sub-44 buttons that CRIT-Y1 fixed.
  // ---------------------------------------------------------------------
  it("H-T-01: Block button pointer target is h-11 w-11 (CRIT-Y1)", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );
    const blockBtn = screen.getByLabelText("Block this company");
    expect(blockBtn).toHaveClass("h-11");
    expect(blockBtn).toHaveClass("w-11");
  });

  it("H-T-01: Skip button pointer target is h-11 w-11 (CRIT-Y1)", () => {
    render(
      <DeckView
        vacancies={testVacancies}
        onAction={mockOnAction}
        onBackToList={mockOnBackToList}
      />,
    );
    const skipBtn = screen.getByLabelText("Skip for now");
    expect(skipBtn).toHaveClass("h-11");
    expect(skipBtn).toHaveClass("w-11");
  });

  it("H-T-01: Undo button pointer target is h-11 w-11 once visible (CRIT-Y1)", async () => {
    // Undo only renders after a successful reversible action
    // (H-A-02: dismiss is the only reversible action today). We drive a
    // dismiss click, flush the 300ms animation window deterministically
    // via fake timers, flush the resolved-promise microtask, then check
    // the Undo button's pointer-target classes. This avoids a real-time
    // sleep + the flakiness that Stream B flagged in the original spec.
    jest.useFakeTimers();
    try {
      const onAction = jest
        .fn()
        .mockImplementation(() => Promise.resolve({ success: true }));
      render(
        <DeckView
          vacancies={testVacancies}
          onAction={onAction}
          onBackToList={mockOnBackToList}
        />,
      );

      // At mount, Undo is not rendered.
      expect(
        screen.queryByLabelText("Undo last action"),
      ).not.toBeInTheDocument();

      // Click dismiss; animation kicks in immediately and a setTimeout(300)
      // is queued inside useDeckStack.performAction.
      await act(async () => {
        fireEvent.click(screen.getByLabelText("Dismiss this vacancy"));
      });

      // Advance past the 300ms animation window. The setTimeout callback
      // awaits the already-resolved actionPromise and pushes to undoStack.
      // Wrap in act(async) so React flushes state updates AND the awaited
      // microtask between tick advancement and assertion.
      await act(async () => {
        jest.advanceTimersByTime(400);
        // Flush any pending microtasks (the awaited onAction promise
        // inside setTimeout's callback) so the setState for undoStack
        // can land before we assert.
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(onAction).toHaveBeenCalledTimes(1);
      const undoBtn = screen.getByLabelText("Undo last action");
      expect(undoBtn).toHaveClass("h-11");
      expect(undoBtn).toHaveClass("w-11");
    } finally {
      jest.useRealTimers();
    }
  });
});
