/**
 * StagingContainer — Deck Sheet Routing Invariant (CRIT-A-06 regression)
 *
 * Integration test guarding the ADR-030 Decision C / `DeckActionRoutingInvariant`:
 * any action taken against a deck card from ANY entry point (swipe, action
 * rail, details sheet, keyboard shortcut) MUST flow through
 * `useDeckStack.performAction`.
 *
 * Context: the original honesty-gate hotfix (commit `2caab7e`) routed the
 * sheet adapters in deck mode to `handleDeckAction(vacancy, action)`, which
 * is the SERVER-ACTION dispatcher that `useDeckStack` consumes via its
 * `onAction` prop — NOT the state machine itself. As a result, dismissing
 * from the details sheet in deck mode called the server dismiss but left
 * `currentIndex`, `undoStack`, `stats`, and the exit animation stale. The
 * user closed the sheet and saw the same card still in front of them.
 *
 * The Sprint 1.5 fix exposes `DeckView` as a `forwardRef` with an imperative
 * handle (`dismiss`, `promote`, `superLike`, `block`, `skip`), and the sheet
 * adapters in deck mode now call `deckViewRef.current?.dismiss()` — the same
 * imperatives the swipe handlers and action-rail buttons use.
 *
 * This test asserts:
 *   - sheet-dismiss in deck mode calls the server action
 *   - sheet-dismiss in deck mode advances the deck counter (proof that
 *     `useDeckStack.performAction` actually ran and mutated `currentIndex`)
 *   - the sheet closes after the action
 *   - the state machine is only advanced AFTER the animation timer fires
 *     (not synchronously on click), which distinguishes performAction from
 *     handleDeckAction (handleDeckAction would advance synchronously via its
 *     awaited server call path, performAction defers to setTimeout).
 *
 * List-mode sheet routing is covered by
 * `__tests__/StagedVacancyDetailSheet.spec.tsx` and the existing
 * `StagedVacancyCard` tests — this file's scope is the NEW deck-mode
 * integration invariant regression specifically.
 *
 * @see docs/adr/030-deck-action-contract-and-notification-late-binding.md Decision C
 * @see specs/vacancy-pipeline.allium `DeckActionRoutingInvariant`
 * @see docs/BUGS.md CRIT-A-06 (Sprint 1.5 CRITICAL Hotfixes)
 */

import "@testing-library/jest-dom";
import React from "react";
import {
  render,
  screen,
  act,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancy } from "@/lib/data/testFixtures";

// ---------------------------------------------------------------------------
// jsdom pointer-capture stub (same pattern as SuperLikeCelebration.spec.tsx)
// Radix Sheet / pointer-events paths need these even when we interact via
// fireEvent.click — Radix internally calls setPointerCapture on mount.
// ---------------------------------------------------------------------------
beforeAll(() => {
  if (typeof HTMLElement !== "undefined") {
    // Only stub if absent to avoid overwriting real implementations in newer jsdom.
    if (!(HTMLElement.prototype as unknown as { setPointerCapture?: unknown })
      .setPointerCapture) {
      (HTMLElement.prototype as unknown as { setPointerCapture: () => void })
        .setPointerCapture = () => {};
    }
    if (!(HTMLElement.prototype as unknown as { releasePointerCapture?: unknown })
      .releasePointerCapture) {
      (HTMLElement.prototype as unknown as { releasePointerCapture: () => void })
        .releasePointerCapture = () => {};
    }
    if (!(HTMLElement.prototype as unknown as { hasPointerCapture?: unknown })
      .hasPointerCapture) {
      (HTMLElement.prototype as unknown as { hasPointerCapture: () => boolean })
        .hasPointerCapture = () => false;
    }
  }
});

// ---------------------------------------------------------------------------
// i18n — minimal strings covering StagingContainer + DeckView + Sheet
// ---------------------------------------------------------------------------
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.title": "Staging",
        "staging.search": "Search",
        "staging.searchLabel": "Search vacancies",
        "staging.tabNew": "New",
        "staging.tabDismissed": "Dismissed",
        "staging.tabArchive": "Archive",
        "staging.tabTrash": "Trash",
        "staging.noVacancies": "No vacancies",
        "staging.vacancies": "vacancies",
        "staging.error": "Error",
        "staging.selectAll": "Select all",
        "staging.dismissed": "Dismissed",
        "staging.restored": "Restored",
        "staging.archived": "Archived",
        "staging.trashed": "Trashed",
        "staging.restoredFromTrash": "Restored from trash",
        "staging.promoted": "Promoted",
        "staging.promote": "Promote to Job",
        "staging.dismiss": "Dismiss",
        "staging.archive": "Archive",
        "staging.details": "Details",
        "staging.detailsTitle": "Vacancy details",
        "staging.detailsNoDescription": "No description",
        "deck.counter": "{current} / {total}",
        "deck.viewModeDeck": "Deck",
        "deck.viewModeList": "List",
        "deck.viewModeLabel": "View mode",
        "deck.dismiss": "Dismiss",
        "deck.promote": "Promote",
        "deck.superLike": "Super-Like",
        "deck.block": "Block",
        "deck.skip": "Skip",
        "deck.undo": "Undo",
        "deck.dismissTooltip": "Dismiss this vacancy",
        "deck.promoteTooltip": "Promote this vacancy",
        "deck.superLikeTooltip": "Super-like this vacancy",
        "deck.blockTooltip": "Block this company",
        "deck.skipTooltip": "Skip for now",
        "deck.undoTooltip": "Undo last action",
        "deck.detailsTooltip": "Open details",
        "deck.detailsShortcut": "I",
        "deck.autoApprove": "Auto-approve",
        "deck.autoApproveHint": "Skip confirmation",
        "deck.emptyTitle": "All caught up",
        "deck.emptyDescription": "No vacancies to review",
        "deck.sessionCompleteTitle": "Session complete",
        "deck.sessionCompleteDescription": "Reviewed {count}",
        "deck.backToList": "Back to list",
        "deck.actionDismissed": "Dismissed",
        "deck.actionPromoted": "Promoted",
        "deck.actionSuperLiked": "Super-liked",
        "deck.actionBlocked": "Blocked",
        "deck.actionSkipped": "Skipped",
        "deck.cardAnnouncement": "{current} of {total}",
        "deck.cardAnnouncementNoScore": "{current} of {total}",
        "deck.swipeHint": "Swipe",
        "deck.blockNoEmployerName": "No employer",
        "common.loading": "Loading",
        "common.loadMore": "Load more",
        "automations.newItemsAvailable": "New items available",
        "automations.showNewItems": "Show new items",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatDateShort: (date: Date | string) => {
    const d = typeof date === "string" ? new Date(date) : date;
    return d.toISOString().slice(0, 10);
  },
  formatNumber: (n: number) => String(n),
}));

// ---------------------------------------------------------------------------
// Scheduler hook — irrelevant to this test
// ---------------------------------------------------------------------------
jest.mock("@/hooks/use-scheduler-status", () => ({
  useSchedulerStatus: () => ({ state: null }),
}));

// ---------------------------------------------------------------------------
// Server actions — dismissStagedVacancy is the one we assert on
// ---------------------------------------------------------------------------
const mockDismiss = jest.fn();
const mockPromote = jest.fn();
const mockRestore = jest.fn();
const mockArchive = jest.fn();
const mockTrash = jest.fn();
const mockRestoreFromTrash = jest.fn();
const mockGetStagedVacancies = jest.fn();
const mockGetStagedVacancyCounts = jest.fn();

jest.mock("@/actions/stagedVacancy.actions", () => ({
  getStagedVacancies: (...args: unknown[]) => mockGetStagedVacancies(...args),
  getStagedVacancyCounts: (...args: unknown[]) =>
    mockGetStagedVacancyCounts(...args),
  dismissStagedVacancy: (...args: unknown[]) => mockDismiss(...args),
  restoreStagedVacancy: (...args: unknown[]) => mockRestore(...args),
  archiveStagedVacancy: (...args: unknown[]) => mockArchive(...args),
  trashStagedVacancy: (...args: unknown[]) => mockTrash(...args),
  restoreFromTrash: (...args: unknown[]) => mockRestoreFromTrash(...args),
  promoteStagedVacancyToJob: (...args: unknown[]) => mockPromote(...args),
}));

jest.mock("@/actions/companyBlacklist.actions", () => ({
  addBlacklistEntry: jest.fn().mockResolvedValue({ success: true, data: { trashedCount: 0 } }),
}));

// Suppress toasts
jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// ---------------------------------------------------------------------------
// UI shims — minimize the render tree to the parts we actually assert on.
// We KEEP `StagingContainer`, `DeckView`, `useDeckStack`, and
// `StagedVacancyDetailSheet` REAL (they are what this test guards), and mock
// everything else to empty/minimal stand-ins.
// ---------------------------------------------------------------------------

// Sheet primitives — render inline like the sheet's own spec does
jest.mock("@/components/ui/sheet", () => {
  const ReactMod = require("react");
  return {
    Sheet: ({
      open,
      children,
    }: {
      open?: boolean;
      children: React.ReactNode;
    }) =>
      open ? ReactMod.createElement("div", { "data-testid": "sheet-root" }, children) : null,
    SheetContent: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      side?: string;
      className?: string;
    }) =>
      ReactMod.createElement(
        "div",
        { role: "dialog", "aria-modal": "true", className },
        children,
      ),
    SheetHeader: ({ children }: { children: React.ReactNode }) =>
      ReactMod.createElement("header", null, children),
    SheetFooter: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) => ReactMod.createElement("footer", { className, "data-testid": "sheet-footer" }, children),
    SheetTitle: ({
      children,
      className,
    }: {
      children: React.ReactNode;
      className?: string;
    }) =>
      ReactMod.createElement(
        "h2",
        { className, "data-testid": "sheet-title" },
        children,
      ),
    SheetDescription: ({
      children,
      id,
      className,
    }: {
      children: React.ReactNode;
      id?: string;
      className?: string;
    }) => ReactMod.createElement("p", { id, className }, children),
  };
});

// ScrollArea: render children directly
jest.mock("@/components/ui/scroll-area", () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Stub the heavy vacancy-detail body so the Sheet tree is small
jest.mock("@/components/staging/StagedVacancyDetailContent", () => ({
  StagedVacancyDetailContent: ({
    vacancy,
  }: {
    vacancy: StagedVacancyWithAutomation;
  }) => <div data-testid="detail-content">{vacancy.title}</div>,
}));

// Replace the DeckCard with a light stub that exposes an "Open details"
// button bound to onInfoClick, so the test can open the sheet without
// dealing with Radix pointer-event details inside the card header.
jest.mock("@/components/staging/DeckCard", () => ({
  DeckCard: ({
    vacancy,
    onInfoClick,
    isPreview,
  }: {
    vacancy: StagedVacancyWithAutomation;
    exitDirection?: unknown;
    isPreview?: boolean;
    previewLevel?: unknown;
    onInfoClick?: (vacancy: StagedVacancyWithAutomation) => void;
  }) =>
    isPreview ? null : (
      <div data-testid={`deck-card-${vacancy.id}`}>
        <h3 data-testid="deck-card-title">{vacancy.title}</h3>
        {onInfoClick && (
          <button
            type="button"
            data-testid="deck-card-info"
            onClick={() => onInfoClick(vacancy)}
          >
            Open details
          </button>
        )}
      </div>
    ),
}));

// Suppress the super-like celebration host (it does its own navigation side
// effects and is tested elsewhere).
jest.mock("@/components/staging/SuperLikeCelebrationHost", () => ({
  SuperLikeCelebrationHost: () => null,
}));

// next/navigation — DeckView's celebration host depends on it via the hook
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

// Stub StagedVacancyCard (list mode) so we don't need its deep tree
jest.mock("@/components/staging/StagedVacancyCard", () => ({
  StagedVacancyCard: ({
    vacancy,
    onDismiss,
    onOpenDetails,
  }: {
    vacancy: StagedVacancyWithAutomation;
    onDismiss?: (id: string) => void;
    onOpenDetails?: (v: StagedVacancyWithAutomation) => void;
    [k: string]: unknown;
  }) => (
    <div data-testid={`list-card-${vacancy.id}`}>
      <span>{vacancy.title}</span>
      <button
        type="button"
        data-testid={`list-card-details-${vacancy.id}`}
        onClick={() => onOpenDetails?.(vacancy)}
      >
        Details
      </button>
      <button
        type="button"
        data-testid={`list-card-dismiss-${vacancy.id}`}
        onClick={() => onDismiss?.(vacancy.id)}
      >
        Dismiss
      </button>
    </div>
  ),
}));

jest.mock("@/components/staging/StagingLayoutToggle", () => ({
  StagingLayoutToggle: () => null,
}));
jest.mock("@/hooks/useStagingLayout", () => ({
  useStagingLayout: () => ({ size: "default", setSize: jest.fn() }),
  getStagingMaxWidthClass: () => "max-w-5xl",
}));
// The promotion dialog is stubbed to auto-trigger onSuccess when it opens
// with a vacancy. This makes the auto-approve=OFF promote + super-like
// paths through handleDeckAction deterministic without needing the real
// dialog's form interaction.
jest.mock("@/components/staging/PromotionDialog", () => {
  const ReactMod = require("react");
  return {
    PromotionDialog: ({
      open,
      onSuccess,
      vacancy,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      vacancy: { id: string; title: string } | null;
      onSuccess: (result: { jobId: string; stagedVacancyId: string }) => void;
    }) => {
      ReactMod.useEffect(() => {
        if (open && vacancy) {
          onSuccess({ jobId: "job-from-dialog", stagedVacancyId: vacancy.id });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open]);
      return null;
    },
  };
});

// The block confirmation dialog is stubbed to auto-invoke onConfirm when
// opened, so the block adapter's awaited promise resolves without needing
// a real confirmation click.
jest.mock("@/components/staging/BlockConfirmationDialog", () => {
  const ReactMod = require("react");
  return {
    BlockConfirmationDialog: ({
      open,
      onConfirm,
    }: {
      open: boolean;
      onOpenChange: (open: boolean) => void;
      vacancy: { id: string; title: string } | null;
      onConfirm: () => Promise<void> | void;
    }) => {
      ReactMod.useEffect(() => {
        if (open) {
          void onConfirm();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [open]);
      return null;
    },
  };
});
jest.mock("@/components/staging/BulkActionBar", () => ({
  BulkActionBar: () => null,
}));
jest.mock("@/components/staging/StagingNewItemsBanner", () => ({
  StagingNewItemsBanner: () => null,
}));
jest.mock("@/components/staging/ViewModeToggle", () => ({
  ViewModeToggle: () => null,
  getPersistedViewMode: () => "deck",
}));
jest.mock("@/components/Loading", () => ({
  __esModule: true,
  default: () => <div data-testid="loading" />,
}));
jest.mock("@/components/RecordsPerPageSelector", () => ({
  RecordsPerPageSelector: () => null,
}));
jest.mock("@/components/RecordsCount", () => ({
  RecordsCount: () => null,
}));

// CompanyLogo may be referenced by the StagedVacancyDetailContent indirectly
jest.mock("@/components/ui/company-logo", () => ({
  CompanyLogo: ({ companyName }: { companyName?: string }) => (
    <span data-testid="company-logo">{companyName}</span>
  ),
}));

// Mock `use-media-query` to report desktop
jest.mock("@/hooks/use-media-query", () => ({
  useMediaQuery: () => true,
}));

// Keep tab/card UI light
jest.mock("@/components/ui/card", () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardFooter: () => null,
  CardHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
}));
jest.mock("@/components/ui/tabs", () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => (
    <div role="tablist">{children}</div>
  ),
  TabsTrigger: ({ children }: { children: React.ReactNode }) => (
    <button role="tab">{children}</button>
  ),
  TabsContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
jest.mock("@/components/ui/badge", () => ({
  Badge: ({ children }: { children: React.ReactNode }) => (
    <span>{children}</span>
  ),
}));
jest.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));
jest.mock("@/lib/constants", () => ({
  APP_CONSTANTS: { RECORDS_PER_PAGE: 10 },
}));

// Import AFTER all mocks are set up
import StagingContainer from "@/components/staging/StagingContainer";

// ---------------------------------------------------------------------------
// Fixtures — three deck-ready vacancies
// ---------------------------------------------------------------------------

function makeVacancy(id: string, title: string): StagedVacancyWithAutomation {
  return {
    ...mockStagedVacancy,
    id,
    title,
    status: "staged",
    automation: { id: "auto-1", name: "EU Tech Jobs" },
  };
}

const testVacancies: StagedVacancyWithAutomation[] = [
  makeVacancy("v1", "Alpha Engineer"),
  makeVacancy("v2", "Beta Engineer"),
  makeVacancy("v3", "Gamma Engineer"),
];

/**
 * Advance timers + flush pending microtasks so `performAction`'s 300ms
 * setTimeout completes and its awaited server-action resolves.
 */
async function flushDeckAnimation() {
  await act(async () => {
    jest.advanceTimersByTime(350);
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ---------------------------------------------------------------------------
// Shared setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  // Force the view-mode toggle to report "deck" on mount
  try {
    window.localStorage.setItem("jobsync-staging-view-mode", "deck");
    window.localStorage.setItem("jobsync_deck_auto_approve", "false");
  } catch {
    // ignore in environments without localStorage
  }

  mockGetStagedVacancies.mockResolvedValue({
    success: true,
    data: testVacancies,
    total: testVacancies.length,
    message: "",
  });
  mockGetStagedVacancyCounts.mockResolvedValue({
    success: true,
    data: { new: 3, dismissed: 0, archived: 0, trashed: 0 },
  });
  mockDismiss.mockResolvedValue({ success: true });
  mockRestore.mockResolvedValue({ success: true });
  mockArchive.mockResolvedValue({ success: true });
  mockTrash.mockResolvedValue({ success: true });
  mockRestoreFromTrash.mockResolvedValue({ success: true });
  mockPromote.mockResolvedValue({ success: true, data: { jobId: "job-new" } });
});

afterEach(() => {
  jest.useRealTimers();
});

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("StagingContainer — deck-sheet routing invariant (CRIT-A-06)", () => {
  it("sheet-dismiss in deck mode advances the deck state machine (not just the server action)", async () => {
    await act(async () => {
      render(<StagingContainer />);
    });

    // Let the initial loadVacancies promise resolve
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    // Counter should be "1 / 3" — DeckView rendered with v1 as current card
    expect(await screen.findByText("1 / 3")).toBeInTheDocument();
    expect(screen.getByTestId("deck-card-v1")).toBeInTheDocument();

    // Open the details sheet on the current card (simulates clicking the
    // in-card Info button in deck mode).
    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    // Sheet is now mounted — footer should show deck-mode actions including
    // a Dismiss button distinct from any action-rail button.
    const footer = await screen.findByTestId("sheet-footer");
    expect(footer).toBeInTheDocument();

    // Find the Dismiss button INSIDE the sheet footer (there may be another
    // Dismiss with the same label on the deck's action rail — we disambiguate
    // by scoping to the footer).
    const sheetDismissButton = within(footer).getByRole("button", {
      name: /Dismiss/i,
    });

    // Clicking Dismiss in the sheet footer MUST route through
    // `useDeckStack.performAction` (via the DeckView imperative handle), not
    // just the server-action dispatcher. We verify this two ways:
    //   1. `dismissStagedVacancy` was called (server-level side effect).
    //   2. The deck counter advances from "1 / 3" to "2 / 3" — proof that
    //      `performAction` actually ran and mutated `currentIndex`.
    await act(async () => {
      fireEvent.click(sheetDismissButton);
      // let the adapter's sync ref.dismiss() kick off the state machine
      await Promise.resolve();
    });

    // Server action must have fired with v1's id
    expect(mockDismiss).toHaveBeenCalledWith("v1");
    expect(mockDismiss).toHaveBeenCalledTimes(1);

    // Flush performAction's 300ms animation timer + awaited server promise
    await flushDeckAnimation();

    // Deck counter MUST advance to 2 / 3 — this is the load-bearing assertion.
    // Before the fix, `currentIndex` would stay at 0 because the sheet adapter
    // called `handleDeckAction` (the server-action dispatcher) directly,
    // bypassing `useDeckStack.performAction`.
    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
    // The rendered current deck card MUST now be v2 (Beta), not v1 (Alpha)
    expect(screen.getByTestId("deck-card-v2")).toBeInTheDocument();
    expect(screen.queryByTestId("deck-card-v1")).not.toBeInTheDocument();
  });

  it("sheet-dismiss in deck mode closes the sheet after the action", async () => {
    await act(async () => {
      render(<StagingContainer />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    const footer = await screen.findByTestId("sheet-footer");
    const sheetDismissButton = within(footer).getByRole("button", {
      name: /Dismiss/i,
    });

    await act(async () => {
      fireEvent.click(sheetDismissButton);
      await Promise.resolve();
    });

    // Sheet closes synchronously in `runAction` right after the handler
    // resolves (the deck-mode adapter is sync from the sheet's POV).
    await waitFor(() => {
      expect(screen.queryByTestId("sheet-footer")).not.toBeInTheDocument();
    });

    // The in-flight animation still needs to complete; cleanly drain it.
    await flushDeckAnimation();
  });

  it("deck-mode sheet actions do NOT route through `handleDeckAction` directly (regression guard)", async () => {
    // This test asserts the structural property the fix enforces: the sheet
    // adapter path does not include a synchronous `handleDeckAction` bypass.
    // We rely on the fact that `handleDeckAction` for dismiss returns
    // `{ success }` synchronously from an AWAITED server call — whereas
    // `performAction` fires the server call inside a `setTimeout(300)` and
    // only advances `currentIndex` AFTER the timer. Therefore, immediately
    // after clicking dismiss in the sheet (before timers advance) the
    // counter MUST still read 1 / 3. If we were incorrectly calling
    // `handleDeckAction`, the counter would also stay at 1 / 3 (the bug).
    // The complementary test above proves that once timers flush, the
    // counter advances — which can ONLY happen if `performAction` drove it.
    await act(async () => {
      render(<StagingContainer />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    const footer = await screen.findByTestId("sheet-footer");
    await act(async () => {
      fireEvent.click(
        within(footer).getByRole("button", { name: /Dismiss/i }),
      );
      await Promise.resolve();
    });

    // Between click and timer flush, animation is in progress — counter
    // must still read 1 / 3 (the hook sets `exitDirection` first, advances
    // `currentIndex` only in the post-animation callback).
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await flushDeckAnimation();

    // After flush, the state machine advances.
    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
  });

  // -----------------------------------------------------------------
  // Sprint 2 H-T-03 remainder — per-adapter coverage (promote/superLike/
  // block). The Sprint 1.5 hotfix test above only covered DISMISS; the
  // other three deck-mode sheet adapters had zero regression coverage.
  // These tests follow the same pattern: open the sheet, click the
  // matching footer button, flush the animation, assert the counter
  // advanced.
  //
  // Auto-approve=ON is set per-test for promote/superlike so
  // `handleDeckAction` takes the direct `promoteStagedVacancyToJob` path
  // and the awaited Promise resolves synchronously (no dialog needed).
  // For block, the BlockConfirmationDialog mock auto-invokes onConfirm
  // on open, so the adapter's Promise resolves via the same mechanism.
  // -----------------------------------------------------------------

  it("H-T-03: sheet-promote in deck mode advances the deck state machine (auto-approve=ON)", async () => {
    // Force the promote branch through the auto-approve path so
    // `handleDeckAction` calls `promoteStagedVacancyToJob` directly and
    // returns `{success, createdJobId}` from the awaited server mock.
    window.localStorage.setItem("jobsync_deck_auto_approve", "true");

    await act(async () => {
      render(<StagingContainer />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    const footer = await screen.findByTestId("sheet-footer");
    const sheetPromoteButton = within(footer).getByRole("button", {
      name: /Promote$/i,
    });

    await act(async () => {
      fireEvent.click(sheetPromoteButton);
      await Promise.resolve();
    });

    // Server-side promote must have fired with v1's id.
    expect(mockPromote).toHaveBeenCalledWith(
      expect.objectContaining({ stagedVacancyId: "v1" }),
    );

    // Counter stays at 1/3 until the 300ms animation timer fires —
    // this is the signature that performAction is driving the state
    // machine (handleDeckAction alone would not set the timer).
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await flushDeckAnimation();

    // Deck counter MUST advance to 2 / 3.
    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
    expect(screen.getByTestId("deck-card-v2")).toBeInTheDocument();

    // Clean up localStorage for other tests.
    window.localStorage.setItem("jobsync_deck_auto_approve", "false");
  });

  it("H-T-03: sheet-superLike in deck mode advances the deck state machine (auto-approve=ON)", async () => {
    // Same auto-approve trick — superlike goes through the same
    // `handleDeckAction` promote branch in StagingContainer.
    window.localStorage.setItem("jobsync_deck_auto_approve", "true");

    await act(async () => {
      render(<StagingContainer />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    const footer = await screen.findByTestId("sheet-footer");
    const sheetSuperLikeButton = within(footer).getByRole("button", {
      name: /Super-Like/i,
    });

    await act(async () => {
      fireEvent.click(sheetSuperLikeButton);
      await Promise.resolve();
    });

    // Server-side promote must have fired (super-like routes through
    // the same handleDeckAction promote branch when auto-approve is on).
    expect(mockPromote).toHaveBeenCalledWith(
      expect.objectContaining({ stagedVacancyId: "v1" }),
    );

    await flushDeckAnimation();

    // Deck counter MUST advance to 2 / 3.
    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
    expect(screen.getByTestId("deck-card-v2")).toBeInTheDocument();

    window.localStorage.setItem("jobsync_deck_auto_approve", "false");
  });

  it("H-T-03: sheet-block in deck mode advances the deck state machine", async () => {
    // The block path requires the BlockConfirmationDialog to resolve;
    // the stub at the top of this file auto-invokes onConfirm on open so
    // the adapter's Promise resolves through the whole chain:
    //   sheet-click → detailsBlockAdapter → deckViewRef.current.block()
    //     → useDeckStack.performAction("block")
    //     → onAction = handleDeckAction("block")
    //     → returns Promise stored in blockResolveRef
    //     → setBlockConfirmOpen(true)
    //     → BlockConfirmationDialog stub useEffect → onConfirm()
    //     → handleBlockCompany → addBlacklistEntry (mocked success)
    //     → blockResolveRef.current({success:true}) resolves the Promise
    //     → performAction's setTimeout(300ms) flushes → currentIndex++
    await act(async () => {
      render(<StagingContainer />);
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(await screen.findByText("1 / 3")).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByTestId("deck-card-info"));
    });

    const footer = await screen.findByTestId("sheet-footer");
    const sheetBlockButton = within(footer).getByRole("button", {
      name: /Block/i,
    });

    // Click the block button — this synchronously kicks off the chain up
    // to the setBlockConfirmOpen(true) state commit.
    await act(async () => {
      fireEvent.click(sheetBlockButton);
    });

    // The BlockConfirmationDialog stub's useEffect runs after the commit
    // above, firing onConfirm() which awaits addBlacklistEntry (mocked).
    // Flush a few microtasks so the auto-confirm promise chain resolves.
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Now advance the performAction animation timer + flush once more so
    // the awaited actionPromise inside the setTimeout callback runs.
    await flushDeckAnimation();
    await flushDeckAnimation();

    // Deck counter MUST advance to 2 / 3 — this only happens if
    // performAction drove the state machine end-to-end.
    await waitFor(() => {
      expect(screen.getByText("2 / 3")).toBeInTheDocument();
    });
  });

  // Note: list-mode sheet routing is covered by
  // `__tests__/StagedVacancyDetailSheet.spec.tsx` (which tests the sheet in
  // isolation with list-mode handlers) and by the list-mode CRUD tests in
  // the existing `StagedVacancyCard` spec. This file's scope is the NEW
  // invariant regression specifically for deck mode.
});
