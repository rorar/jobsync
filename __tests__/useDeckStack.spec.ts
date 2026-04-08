/**
 * useDeckStack hook tests
 *
 * Tests: navigation, action dispatching, exit direction, undo stack,
 * stats tracking, session completion, animation guard, rollback on failure.
 */
import { renderHook, act } from "@testing-library/react";
import { useDeckStack } from "@/hooks/useDeckStack";
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

  it("undo reverses blocked stat", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction, onUndo: mockOnUndo }),
    );

    // Block the first vacancy
    await act(async () => {
      result.current.block();
      await advanceTimersAndFlush(300);
    });

    expect(result.current.stats.blocked).toBe(1);
    expect(result.current.currentIndex).toBe(1);
    expect(result.current.canUndo).toBe(true);

    // Undo the block
    await act(async () => {
      result.current.undo();
    });

    expect(result.current.stats.blocked).toBe(0);
    expect(result.current.currentIndex).toBe(0);
    expect(result.current.currentVacancy?.id).toBe("v1");
    expect(mockOnUndo).toHaveBeenCalled();
  });
});
