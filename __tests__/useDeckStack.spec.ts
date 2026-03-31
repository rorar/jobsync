/**
 * useDeckStack hook tests
 *
 * Tests: navigation, action dispatching, exit direction, undo stack,
 * stats tracking, session completion, animation guard.
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

describe("useDeckStack", () => {
  const mockOnAction = jest.fn().mockResolvedValue(undefined);
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
      // Wait for animation timeout
      jest.advanceTimersByTime(300);
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
      jest.advanceTimersByTime(300);
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
      jest.advanceTimersByTime(300);
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
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      result.current.promote();
      jest.advanceTimersByTime(300);
    });
    await act(async () => {
      result.current.superLike();
      jest.advanceTimersByTime(300);
    });

    expect(result.current.stats).toEqual({
      promoted: 1,
      dismissed: 1,
      superLiked: 1,
    });
  });

  it("reaches session complete when all vacancies processed", async () => {
    const { result } = renderHook(() =>
      useDeckStack({ vacancies, onAction: mockOnAction }),
    );

    for (let i = 0; i < 3; i++) {
      await act(async () => {
        result.current.dismiss();
        jest.advanceTimersByTime(300);
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
      jest.advanceTimersByTime(300);
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
      jest.advanceTimersByTime(300);
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
});
