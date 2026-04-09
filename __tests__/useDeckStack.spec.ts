/**
 * useDeckStack hook tests
 *
 * Tests: navigation, action dispatching, exit direction, undo stack,
 * stats tracking, session completion, animation guard, rollback on failure,
 * H-A-02 undo-reversibility invariant (only `REVERSIBLE_DECK_ACTIONS`
 * populate the stack — see the hook's top-of-file comment).
 */
import { renderHook, act } from "@testing-library/react";
import {
  useDeckStack,
  REVERSIBLE_DECK_ACTIONS,
  type DeckAction,
} from "@/hooks/useDeckStack";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancy } from "@/lib/data/testFixtures";

// Create test vacancies with automation field
function makeVacancy(overrides: Partial<StagedVacancyWithAutomation> = {}): StagedVacancyWithAutomation {
  return { ...mockStagedVacancy, automation: null, ...overrides };
}

const vacancies: StagedVacancyWithAutomation[] = [
  makeVacancy({ id: "v1", title: "Job A" }),
  makeVacancy({ id: "v2", title: "Job B" }),
  makeVacancy({ id: "v3", title: "Job C" }),
];

/** Advance fake timers and flush microtasks so async setTimeout callbacks complete */
async function advanceTimersAndFlush(ms: number) {
  jest.advanceTimersByTime(ms);
  // Flush the microtask queue (await inside setTimeout callback)
  await Promise.resolve();
}

describe("useDeckStack", () => {
  const mockOnAction = jest.fn().mockResolvedValue({ success: true });
  const mockOnUndo = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("initializes with first vacancy as current", () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");
    expect(result.current.nextVacancy?.id).toBe("v2");
    expect(result.current.thirdVacancy?.id).toBe("v3");
    expect(result.current.totalCount).toBe(3);
    expect(result.current.remainingCount).toBe(3);
    expect(result.current.isSessionComplete).toBe(false);
    expect(result.current.canUndo).toBe(false);
  });

  it("dismiss sets exit direction left and advances index", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentVacancy?.id).toBe("v2");
    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v1" }),
      "dismiss",
    );
  });

  it("promote sets exit direction right and advances index", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.promote();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v1" }),
      "promote",
    );
  });

  it("superLike sets exit direction up and advances index", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.superLike();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v1" }),
      "superlike",
    );
  });

  it("tracks stats correctly", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });
    await act(async () => {
      result.current.promote();
      await advanceTimersAndFlush(300);
    });
    await act(async () => {
      result.current.superLike();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.stats).toEqual({
      promoted: 1,
      dismissed: 1,
      superLiked: 1,
      blocked: 0,
      skipped: 0,
    });
  });

  it("reaches session complete when all vacancies processed", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        result.current.dismiss();
        await advanceTimersAndFlush(300);
      });
    }

    expect(result.current.isSessionComplete).toBe(true);
    expect(result.current.currentVacancy).toBeNull();
  });

  it("undo restores previous vacancy and reverses stats", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      result.current.undo();
    });

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");
    expect(result.current.stats.dismissed).toBe(0);
    expect(mockOnUndo).toHaveBeenCalled();
  });

  it("does not allow actions during animation", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    // Start an action but don't advance timers
    act(() => {
      result.current.dismiss();
    });

    // Try another action — should be blocked
    act(() => {
      result.current.promote();
    });

    // Only one action should have fired
    expect(result.current.isAnimating).toBe(true);

    // Advance timer to complete
    await act(async () => {
      await advanceTimersAndFlush(300);
    });

    // Only one action call
    expect(mockOnAction).toHaveBeenCalledTimes(1);
  });

  it("handles empty vacancies gracefully", () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies: [], onAction: mockOnAction }),
    );

    expect(result.current.currentVacancy).toBeNull();
    expect(result.current.totalCount).toBe(0);
    expect(result.current.isSessionComplete).toBe(false);
  });

  it("rolls back card when server action returns failure", async () => {
    const failingAction = jest.fn().mockResolvedValue({ success: false });
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: failingAction }),
    );

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");

    // Exit animation starts immediately (optimistic)
    act(() => {
      result.current.dismiss();
    });
    expect(result.current.exitDirection).toBe("left");
    expect(result.current.isAnimating).toBe(true);

    // After animation completes, server result is checked → rollback
    await act(async () => {
      await advanceTimersAndFlush(300);
    });

    // Card should NOT have advanced — stays on same vacancy
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");
    expect(result.current.exitDirection).toBeNull();
    expect(result.current.isAnimating).toBe(false);

    // Stats should NOT have changed
    expect(result.current.stats).toEqual({ promoted: 0, dismissed: 0, superLiked: 0, blocked: 0, skipped: 0 });

    // Undo stack should be empty (action failed, nothing to undo)
    expect(result.current.canUndo).toBe(false);
  });

  it("rolls back card when server action throws (network error)", async () => {
    const throwingAction = jest.fn().mockRejectedValue(new Error("Network error"));
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: throwingAction }),
    );

    await act(async () => {
      result.current.promote();
      await advanceTimersAndFlush(300);
    });

    // Card should NOT have advanced — caught rejection treated as failure
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");
    expect(result.current.isAnimating).toBe(false);
    expect(result.current.stats.promoted).toBe(0);
    expect(result.current.canUndo).toBe(false);
  });

  it("only pushes to undo stack on successful actions", async () => {
    const failThenSucceed = jest
      .fn()
      .mockResolvedValueOnce({ success: false })
      .mockResolvedValueOnce({ success: true });

    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: failThenSucceed }),
    );

    // First action fails — no undo entry
    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });
    expect(result.current.canUndo).toBe(false);
    expect(result.current.currentIndex).toBe(0);

    // Second action succeeds — undo entry created
    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });
    expect(result.current.canUndo).toBe(true);
    expect(result.current.currentIndex).toBe(1);
  });

  it("block sets exit direction down and calls onAction with 'block'", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    act(() => {
      result.current.block();
    });

    // Exit direction is set immediately (optimistic)
    expect(result.current.exitDirection).toBe("down");

    await act(async () => {
      await advanceTimersAndFlush(300);
    });

    expect(mockOnAction).toHaveBeenCalledWith(
      expect.objectContaining({ id: "v1" }),
      "block",
    );
    expect(result.current.stats.blocked).toBe(1);
  });

  it("skip advances card without calling onAction", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.skip();
      await advanceTimersAndFlush(300);
    });

    // onAction should NOT have been called — skip bypasses server action
    expect(mockOnAction).not.toHaveBeenCalled();
    expect(result.current.stats.skipped).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.currentVacancy?.id).toBe("v2");
  });

  it("skip does not push to undo stack", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    await act(async () => {
      result.current.skip();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.canUndo).toBe(false);
  });

  // ---------------------------------------------------------------------
  // H-A-02 regression guards — undo allowlist + "undo theatre" prevention
  // ---------------------------------------------------------------------

  it("H-A-02: REVERSIBLE_DECK_ACTIONS exports exactly the actions the container can reverse", () => {
    // Pin the honest allowlist at the constant level. The container today
    // only implements `restoreStagedVacancy` (the reversal for `dismiss`);
    // promote/superlike/block have no server-side compensation yet.
    //
    // If someone adds a new reversible action (e.g. promote via undoStore),
    // they MUST update this assertion AND implement the reversal in
    // `StagingContainer.handleDeckUndo`. A mismatch here means the hook is
    // quietly regressing to undo-theatre territory.
    expect([...REVERSIBLE_DECK_ACTIONS]).toEqual(["dismiss"]);
  });

  it("H-A-02: successful promote does NOT create an undo entry (not in allowlist)", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    await act(async () => {
      result.current.promote();
      await advanceTimersAndFlush(300);
    });

    // Stats advance, index advances, but the undo stack STAYS EMPTY —
    // because promote has no compensating action today, recording it would
    // resurrect a "ghost card" on undo (the H-A-02 bug).
    expect(result.current.stats.promoted).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(false);

    // Calling undo with an empty stack must be a no-op.
    await act(async () => {
      result.current.undo();
    });
    expect(result.current.currentIndex).toBe(1); // did not revert
    expect(result.current.stats.promoted).toBe(1); // did not revert
    expect(mockOnUndo).not.toHaveBeenCalled();
  });

  it("H-A-02: successful superlike does NOT create an undo entry (not in allowlist)", async () => {
    const superlikeOnAction = jest
      .fn()
      .mockResolvedValue({ success: true, createdJobId: "job-42" });
    const { result } = renderHook(() =>
      useDeckStack({
        vacancies,
        onAction: superlikeOnAction,
        onUndo: mockOnUndo,
      }),
    );

    await act(async () => {
      result.current.superLike();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.stats.superLiked).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    // Even with a populated createdJobId, superlike is NOT reversible yet.
    expect(result.current.canUndo).toBe(false);
  });

  it("H-A-02: successful block does NOT create an undo entry (not in allowlist)", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    // Block the first vacancy
    await act(async () => {
      result.current.block();
      await advanceTimersAndFlush(300);
    });

    // Stats and index still advance (the server action succeeded), but
    // block is NOT in REVERSIBLE_DECK_ACTIONS so there's no undo entry.
    // This prevents the "undo theatre" where the card visually returns
    // but the blacklist entry is already committed server-side.
    expect(result.current.stats.blocked).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(false);

    // Undo is a no-op on empty stack.
    await act(async () => {
      result.current.undo();
    });
    expect(result.current.stats.blocked).toBe(1); // stat did NOT revert
    expect(result.current.currentIndex).toBe(1); // index did NOT revert
    expect(mockOnUndo).not.toHaveBeenCalled();
  });

  it("H-A-02: dismiss IS reversible — undo restores state and calls onUndo", async () => {
    // Sanity check that the narrower allowlist still lets the one
    // currently-reversible action flow through end-to-end.
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.stats.dismissed).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      result.current.undo();
    });

    expect(result.current.stats.dismissed).toBe(0);
    expect(result.current.currentIndex).toBe(0);
    expect(mockOnUndo).toHaveBeenCalledTimes(1);
    // The entry passed to onUndo must carry the narrowed action type.
    const entry = mockOnUndo.mock.calls[0][0];
    expect(entry.action).toBe("dismiss" satisfies DeckAction);
  });

  it("H-A-02: mixed sequence — dismiss, promote, dismiss yields undo stack of two dismisses", async () => {
    // Guards against a regression where the push-site filter leaks: if the
    // allowlist check were accidentally bypassed, the stack would contain
    // `["dismiss", "promote", "dismiss"]` (in reverse order). The honest
    // shape is ONLY the two dismisses.
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });
    await act(async () => {
      result.current.promote();
      await advanceTimersAndFlush(300);
    });
    await act(async () => {
      result.current.dismiss();
      await advanceTimersAndFlush(300);
    });

    // Undo twice — both entries must be dismisses, not the promote.
    await act(async () => {
      result.current.undo();
    });
    expect(mockOnUndo).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ action: "dismiss" }),
    );

    expect(result.current.canUndo).toBe(true);

    await act(async () => {
      result.current.undo();
    });
    expect(mockOnUndo).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ action: "dismiss" }),
    );

    // Stack is now empty; the promote was never recorded.
    expect(result.current.canUndo).toBe(false);
    expect(mockOnUndo).toHaveBeenCalledTimes(2);
  });
});
