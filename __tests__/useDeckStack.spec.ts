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
  ANIMATION_DURATION,
  type DeckAction,
} from "@/hooks/useDeckStack";
import type { StagedVacancyWithAutomation } from "@/models/stagedVacancy.model";
import { mockStagedVacancyWithAutomation } from "@/lib/data/testFixtures";

// Create test vacancies with automation field
function makeVacancy(overrides: Partial<StagedVacancyWithAutomation> = {}): StagedVacancyWithAutomation {
  return { ...mockStagedVacancyWithAutomation, automation: null, ...overrides };
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

  it("Sprint 4 Stream B: ANIMATION_DURATION is exported and matches the internal timer", () => {
    // Exported as a constant port so `StagingContainer.scheduleDeckReload`
    // can compute its total delay as `ANIMATION_DURATION + safety buffer`
    // without hardcoding the number. Pin the value at 300ms — if the
    // animation tuning changes, this test AND the internal `setTimeout`
    // must move in lockstep.
    expect(ANIMATION_DURATION).toBe(300);
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

  // ---------------------------------------------------------------------
  // M-T-07 — ADR-030 callback contract coverage (Sprint 3 Stream B)
  //
  // `useDeckStack` owns the ADR-030 contract between the deck state
  // machine and the super-like celebration host. Sprint 2's test suite
  // covered the happy path and the H-A-02 allowlist, but left several
  // contract slots untested:
  //   - `onSuperLikeSuccess` called with (jobId, vacancy) on superlike
  //   - `onSuperLikeSuccess` NOT called when createdJobId is absent
  //   - `onSuperLikeUndone` wiring (currently unreachable because
  //     superlike is not in REVERSIBLE_DECK_ACTIONS, but the callback is
  //     still a contract slot we pin for forward-compat with M-A-09)
  //   - `isDetailsOpen` gate suppressing keyboard shortcuts
  //   - keyboard shortcut bindings (d/p/s/b/n/z + arrows)
  //   - MAX_UNDO_STACK capacity enforcement
  // ---------------------------------------------------------------------

  describe("M-T-07 — ADR-030 onSuperLikeSuccess / onSuperLikeUndone contract", () => {
    it("calls onSuperLikeSuccess with (jobId, vacancy) on successful super-like", async () => {
      const onSuperLikeSuccess = jest.fn();
      const onAction = jest
        .fn()
        .mockResolvedValue({ success: true, createdJobId: "job-42" });

      const { result } = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction,
          onSuperLikeSuccess,
        }),
      );

      await act(async () => {
        result.current.superLike();
        await advanceTimersAndFlush(300);
      });

      expect(onSuperLikeSuccess).toHaveBeenCalledTimes(1);
      expect(onSuperLikeSuccess).toHaveBeenCalledWith(
        "job-42",
        expect.objectContaining({ id: "v1" }),
      );
    });

    it("does NOT call onSuperLikeSuccess when the server omits createdJobId", async () => {
      // Silent contract drift guard: a server action that returned success
      // WITHOUT createdJobId used to trigger a celebration with `undefined`
      // as the jobId, which then 404'd when the user clicked "Open job".
      // After CRIT-A2 the contract is additive — the callback is only
      // fired when the id is actually present.
      const onSuperLikeSuccess = jest.fn();
      const onAction = jest.fn().mockResolvedValue({ success: true });

      const { result } = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction,
          onSuperLikeSuccess,
        }),
      );

      await act(async () => {
        result.current.superLike();
        await advanceTimersAndFlush(300);
      });

      expect(onSuperLikeSuccess).not.toHaveBeenCalled();
      // The state machine still advances and records stats — the
      // celebration is the only thing that silently no-ops.
      expect(result.current.stats.superLiked).toBe(1);
      expect(result.current.currentIndex).toBe(1);
    });

    it("does NOT call onSuperLikeSuccess for promote (different action, same result shape)", async () => {
      // Promote and superlike share the `{success, createdJobId}` shape
      // but ONLY superlike should trigger the celebration. This guards
      // against a future refactor that collapses the two actions.
      const onSuperLikeSuccess = jest.fn();
      const onAction = jest
        .fn()
        .mockResolvedValue({ success: true, createdJobId: "job-42" });

      const { result } = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction,
          onSuperLikeSuccess,
        }),
      );

      await act(async () => {
        result.current.promote();
        await advanceTimersAndFlush(300);
      });

      expect(onSuperLikeSuccess).not.toHaveBeenCalled();
      expect(result.current.stats.promoted).toBe(1);
    });

    it("does NOT call onSuperLikeSuccess on a FAILED super-like", async () => {
      const onSuperLikeSuccess = jest.fn();
      const onAction = jest.fn().mockResolvedValue({ success: false });

      const { result } = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction,
          onSuperLikeSuccess,
        }),
      );

      await act(async () => {
        result.current.superLike();
        await advanceTimersAndFlush(300);
      });

      expect(onSuperLikeSuccess).not.toHaveBeenCalled();
      // Rollback: index stayed, stats stayed, no undo entry.
      expect(result.current.currentIndex).toBe(0);
      expect(result.current.stats.superLiked).toBe(0);
      expect(result.current.canUndo).toBe(false);
    });

    it("onSuperLikeUndone is wired as an option slot (forward-compat for M-A-09)", () => {
      // Today `superlike` is NOT in REVERSIBLE_DECK_ACTIONS so onSuperLikeUndone
      // is unreachable via the normal flow. This test pins the option slot
      // so a future refactor that widens the allowlist will not silently
      // drop the wiring — `renderHook` must accept the option without type
      // errors and the hook must not call it during a non-undo flow.
      const onSuperLikeUndone = jest.fn();
      const { result } = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction: mockOnAction,
          onSuperLikeUndone,
        }),
      );

      // Hook should render without touching the callback.
      expect(result.current.currentIndex).toBe(0);
      expect(onSuperLikeUndone).not.toHaveBeenCalled();
    });
  });

  describe("M-T-07 — keyboard shortcut bindings", () => {
    /**
     * Build a focusable container that is an ancestor of `document.body` so
     * `container.contains(event.target)` matches the document-level keydown
     * listener. The hook only fires on events whose target is inside the
     * container ref — so we dispatch the keydown from inside.
     */
    function renderDeckWithContainer(
      overrides: Partial<Parameters<typeof useDeckStack>[0]> = {},
    ) {
      const hookResult = renderHook(() =>
        useDeckStack({
          vacancies,
          onAction: mockOnAction,
          ...overrides,
        }),
      );
      // Attach the containerRef to a real DOM element so the keydown
      // handler's `container.contains(target)` check passes.
      const div = document.createElement("div");
      document.body.appendChild(div);
      // Mutate the ref directly — this mirrors what React would do when
      // the consumer attaches the ref to a DOM element via JSX.
      act(() => {
        (
          hookResult.result.current.containerRef as unknown as {
            current: HTMLDivElement;
          }
        ).current = div;
      });
      return { ...hookResult, container: div };
    }

    function dispatchKey(target: HTMLElement, key: string) {
      const event = new KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
    }

    afterEach(() => {
      // Safely remove every child of document.body (no innerHTML = "").
      while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
      }
    });

    it("'d' key triggers dismiss", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "d");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.dismissed).toBe(1);
      expect(result.current.currentIndex).toBe(1);
    });

    it("'p' key triggers promote", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "p");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.promoted).toBe(1);
    });

    it("'s' key triggers superLike", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "s");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.superLiked).toBe(1);
    });

    it("'b' key triggers block", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "b");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.blocked).toBe(1);
    });

    it("'n' key triggers skip", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "n");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.skipped).toBe(1);
    });

    it("'z' key triggers undo after a successful reversible action", async () => {
      const onUndo = jest.fn().mockResolvedValue(undefined);
      const { result, container } = renderDeckWithContainer({ onUndo });

      // First produce a dismiss entry, then undo via keyboard.
      await act(async () => {
        dispatchKey(container, "d");
        await advanceTimersAndFlush(300);
      });
      expect(result.current.canUndo).toBe(true);

      await act(async () => {
        dispatchKey(container, "z");
      });

      expect(onUndo).toHaveBeenCalledTimes(1);
      expect(result.current.currentIndex).toBe(0);
    });

    it("ArrowLeft triggers dismiss", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "ArrowLeft");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.dismissed).toBe(1);
    });

    it("ArrowRight triggers promote", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "ArrowRight");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.promoted).toBe(1);
    });

    it("ArrowUp triggers superLike", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "ArrowUp");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.superLiked).toBe(1);
    });

    it("ArrowDown triggers block", async () => {
      const { result, container } = renderDeckWithContainer();

      await act(async () => {
        dispatchKey(container, "ArrowDown");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.blocked).toBe(1);
    });

    it("isDetailsOpen=true suppresses ALL keyboard shortcuts", async () => {
      const { result, container } = renderDeckWithContainer({
        isDetailsOpen: true,
      });

      // Try every single shortcut — none should advance state.
      for (const key of ["d", "p", "s", "b", "n", "z", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
        await act(async () => {
          dispatchKey(container, key);
          await advanceTimersAndFlush(300);
        });
      }

      expect(result.current.stats).toEqual({
        promoted: 0,
        dismissed: 0,
        superLiked: 0,
        blocked: 0,
        skipped: 0,
      });
      expect(result.current.currentIndex).toBe(0);
      expect(mockOnAction).not.toHaveBeenCalled();
    });

    it("enabled=false suppresses all keyboard shortcuts", async () => {
      const { result, container } = renderDeckWithContainer({ enabled: false });

      await act(async () => {
        dispatchKey(container, "d");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.dismissed).toBe(0);
      expect(mockOnAction).not.toHaveBeenCalled();
    });

    it("ignores keydown events that originate from INPUT elements", async () => {
      const { result, container } = renderDeckWithContainer();
      const input = document.createElement("input");
      container.appendChild(input);

      await act(async () => {
        dispatchKey(input, "d");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.dismissed).toBe(0);
    });

    it("ignores keydown events that originate from TEXTAREA elements", async () => {
      const { result, container } = renderDeckWithContainer();
      const textarea = document.createElement("textarea");
      container.appendChild(textarea);

      await act(async () => {
        dispatchKey(textarea, "p");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.promoted).toBe(0);
    });

    it("ignores keydown events whose target is OUTSIDE the container", async () => {
      const { result } = renderDeckWithContainer();
      const outsideEl = document.createElement("button");
      document.body.appendChild(outsideEl);

      await act(async () => {
        dispatchKey(outsideEl, "d");
        await advanceTimersAndFlush(300);
      });

      expect(result.current.stats.dismissed).toBe(0);
    });
  });

  describe("M-T-07 — MAX_UNDO_STACK capacity enforcement", () => {
    it("caps the undo stack at 5 entries (oldest dropped from the END of the internal array)", async () => {
      // Build a deck with 10 vacancies so we can push >5 reversible entries.
      const manyVacancies: StagedVacancyWithAutomation[] = Array.from(
        { length: 10 },
        (_, i) => makeVacancy({ id: `v${i + 1}`, title: `Job ${i + 1}` }),
      );
      const onUndo = jest.fn().mockResolvedValue(undefined);
      const { result } = renderHook(() =>
        useDeckStack({
          vacancies: manyVacancies,
          onAction: mockOnAction,
          onUndo,
        }),
      );

      // Dispatch 7 dismisses (all reversible). The hook caps the stack at
      // MAX_UNDO_STACK=5 — the oldest 2 must be dropped.
      for (let i = 0; i < 7; i++) {
        await act(async () => {
          result.current.dismiss();
          await advanceTimersAndFlush(300);
        });
      }

      expect(result.current.currentIndex).toBe(7);
      expect(result.current.canUndo).toBe(true);

      // Undoing 5 times consumes the whole stack — the 6th undo is a no-op.
      for (let i = 0; i < 5; i++) {
        await act(async () => {
          result.current.undo();
        });
      }
      expect(onUndo).toHaveBeenCalledTimes(5);
      expect(result.current.canUndo).toBe(false);

      // The stack held the 5 MOST-RECENT entries (v7, v6, v5, v4, v3) and
      // dropped the 2 OLDEST (v1, v2). After 5 undos, currentIndex is the
      // index of the 5th-most-recent entry, i.e. 2 (v3). Subsequent undo
      // is a no-op — index stays at 2, not 0.
      expect(result.current.currentIndex).toBe(2);

      await act(async () => {
        result.current.undo();
      });
      expect(onUndo).toHaveBeenCalledTimes(5); // still 5, not 6
      expect(result.current.currentIndex).toBe(2);
    });
  });
});
