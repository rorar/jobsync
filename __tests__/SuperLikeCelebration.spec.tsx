/**
 * SuperLikeCelebration component tests (Stream D / task 3).
 *
 * Tests: render, CTA click, dismiss button, queue badge, accessibility roles,
 * icon choice (Sparkles, not Star).
 *
 * Stream E addendum: grace-period coverage for `SuperLikeCelebrationHost`
 * (consecutive celebrations fade out before the next slides in) + reduced
 * motion bypass. The component file test co-locates host-level transition
 * tests because the grace period lives in the host, not the hook.
 */
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuperLikeCelebration } from "@/components/staging/SuperLikeCelebration";
import { SuperLikeCelebrationHost } from "@/components/staging/SuperLikeCelebrationHost";
import type { CelebrationItem } from "@/hooks/useSuperLikeCelebrations";

// Mock next/navigation — SuperLikeCelebrationHost calls useRouter() which
// throws "invariant expected app router to be mounted" outside a Next app.
const mockRouterPush = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (...args: unknown[]) => mockRouterPush(...args),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// jsdom does not implement Pointer Capture. `setPointerCapture` is invoked
// from the component's pointerdown handler; without a stub it throws and
// breaks userEvent's click simulation (which synthesizes pointer events).
// See: https://github.com/jsdom/jsdom/issues/2527 — jsdom explicitly does
// not implement Pointer Events API.
beforeAll(() => {
  // Attach as no-op jest.fns so individual tests can assert against them
  // later if needed without redefining the whole prototype.
  if (!("setPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });
  }
  if (!("releasePointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
      value: jest.fn(),
      writable: true,
      configurable: true,
    });
  }
  if (!("hasPointerCapture" in HTMLElement.prototype)) {
    Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
      value: jest.fn().mockReturnValue(false),
      writable: true,
      configurable: true,
    });
  }
});

/**
 * Helper: build a matchMedia mock where only the given media query strings
 * match. Required because jsdom does not ship a matchMedia implementation.
 *
 * Module-scope helper so both `SuperLikeCelebration` and
 * `SuperLikeCelebrationHost` describes can share it — the component now
 * also reads `prefers-reduced-motion` via `matchMedia` for its mount-focus
 * effect (CRIT-Y3).
 */
function mockMatchMedia(matchingQueries: string[]) {
  const listeners = new Map<string, Set<(ev: MediaQueryListEvent) => void>>();
  window.matchMedia = jest.fn((query: string): MediaQueryList => {
    const matches = matchingQueries.includes(query);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: (_type: string, listener: EventListener) => {
        if (!listeners.has(query)) listeners.set(query, new Set());
        listeners.get(query)!.add(listener as (ev: MediaQueryListEvent) => void);
      },
      removeEventListener: (_type: string, listener: EventListener) => {
        listeners.get(query)?.delete(listener as (ev: MediaQueryListEvent) => void);
      },
      addListener: jest.fn(), // deprecated legacy API
      removeListener: jest.fn(),
      dispatchEvent: jest.fn().mockReturnValue(true),
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
}

describe("SuperLikeCelebration", () => {
  const baseProps = {
    id: "job-123",
    jobId: "job-123",
    vacancyTitle: "Senior Full-Stack Engineer",
    queueRemaining: 0,
    onDismiss: jest.fn(),
    onOpenJob: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // The mount-focus effect reads `prefers-reduced-motion` via matchMedia.
    // Default: normal motion (no matching queries). Individual focus tests
    // override with `(prefers-reduced-motion: reduce)`.
    mockMatchMedia([]);
  });

  it("renders the celebration title and vacancy subtitle", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    // Title: "Super-liked!" (from deck.superLikeCelebration.title)
    expect(screen.getByText(/Super-liked/i)).toBeInTheDocument();
    // Subtitle: the vacancy title
    expect(screen.getByText("Senior Full-Stack Engineer")).toBeInTheDocument();
  });

  it("has role=status and aria-live=polite (not assertive)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const card = screen.getByRole("status");
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("aria-live", "polite");
    // Explicitly NOT assertive — consultation §6
    expect(card).not.toHaveAttribute("aria-live", "assertive");
  });

  it("has data-testid for e2e anchoring", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    expect(screen.getByTestId("super-like-celebration")).toBeInTheDocument();
  });

  it("calls onOpenJob with jobId when primary CTA is clicked (userEvent)", async () => {
    // userEvent synthesizes the full pointer sequence
    // (pointerover → pointerenter → pointerdown → pointerup → click). The
    // component's outer `onPointerDown` captures the pointer via a stubbed
    // `setPointerCapture` (see beforeAll), so userEvent drives the button
    // cleanly without bailing on a missing DOM API.
    const user = userEvent.setup();
    render(<SuperLikeCelebration {...baseProps} />);

    const cta = screen.getByRole("button", { name: /Open job/i });
    await user.click(cta);

    expect(baseProps.onOpenJob).toHaveBeenCalledWith("job-123");
    expect(baseProps.onOpenJob).toHaveBeenCalledTimes(1);
  });

  it("calls onDismiss with id when X button is clicked (userEvent)", async () => {
    const user = userEvent.setup();
    render(<SuperLikeCelebration {...baseProps} />);

    const close = screen.getByRole("button", { name: /Close celebration/i });
    await user.click(close);

    expect(baseProps.onDismiss).toHaveBeenCalledWith("job-123");
  });

  it("hides the queue badge when queueRemaining is 0", () => {
    render(<SuperLikeCelebration {...baseProps} queueRemaining={0} />);

    // The "+N more" badge text should not appear
    expect(screen.queryByText(/\+\d+ more/i)).not.toBeInTheDocument();
  });

  it("shows the +N more badge when queueRemaining > 0", () => {
    render(<SuperLikeCelebration {...baseProps} queueRemaining={3} />);

    expect(screen.getByText(/\+3 more/i)).toBeInTheDocument();
  });

  it("renders the Sparkles icon (not Star) per consultation §5", () => {
    const { container } = render(<SuperLikeCelebration {...baseProps} />);

    // Sparkles is a lucide icon — it renders as an SVG with a specific data attribute
    // or class. Easiest anchor: a lucide-sparkles class lives on the Sparkles svg.
    const sparklesIcon = container.querySelector(".lucide-sparkles");
    expect(sparklesIcon).toBeInTheDocument();

    // Explicitly confirm no Star icon (reserved for the super-like action itself)
    expect(container.querySelector(".lucide-star")).not.toBeInTheDocument();
  });

  it("sets data-exiting and pointer-events:none when isExiting is true", () => {
    render(<SuperLikeCelebration {...baseProps} isExiting />);

    const card = screen.getByTestId("super-like-celebration");
    expect(card).toHaveAttribute("data-exiting", "true");
    // Pointer capture must be suppressed during exit — the card is
    // committed to leaving and should not be re-dismissible mid-animation.
    expect(card).toHaveStyle({ pointerEvents: "none" });
  });

  it("omits data-exiting when isExiting is false (default)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const card = screen.getByTestId("super-like-celebration");
    expect(card).not.toHaveAttribute("data-exiting");
  });

  // ─── L-P-03 (Sprint 4 Stream B) — keyframe hoist regression guard ─
  //
  // The fix removed the inline `<style>{...}</style>` JSX node that
  // previously shipped the keyframe definitions with the component, and
  // moved the CSS to `src/app/globals.css`. This test pins the contract
  // at the DOM level: no `<style>` child must exist inside the
  // celebration card. If a future refactor re-introduces inline styles,
  // this test fails and the perf regression is caught immediately.

  it("L-P-03: does NOT render an inline <style> node (keyframes are static globals.css)", () => {
    const { container } = render(<SuperLikeCelebration {...baseProps} />);

    // The component's outer container is the testid node; inspect all
    // its descendants for a <style> tag.
    const card = container.querySelector("[data-testid='super-like-celebration']");
    expect(card).not.toBeNull();
    const styleNode = card?.querySelector("style");
    expect(styleNode).toBeNull();
  });

  it("L-P-03: still declares the `superlike-celebration` class so globals.css hooks match", () => {
    const { container } = render(<SuperLikeCelebration {...baseProps} />);

    const card = container.querySelector("[data-testid='super-like-celebration']");
    expect(card).not.toBeNull();
    // The class name IS the bridge between the React tree and the
    // module-level CSS keyframes in globals.css. If it ever drops off,
    // the animation silently stops playing.
    expect(card?.className ?? "").toMatch(/superlike-celebration/);
  });

  // ─── CRIT-Y3 / WCAG 2.1.1 / 2.2.1 / 1.3.1 remediation ─────────────

  it("moves keyboard focus to the 'Open job' CTA after the slide-in animation (CRIT-Y3)", () => {
    jest.useFakeTimers();
    try {
      render(<SuperLikeCelebration {...baseProps} />);

      const cta = screen.getByRole("button", { name: /Open job/i });

      // BEFORE the mount-focus timer fires, the CTA should not be focused
      // (document.body is the default active element in jsdom).
      expect(document.activeElement).not.toBe(cta);

      // Advance past the 320ms focus-on-mount delay.
      act(() => {
        jest.advanceTimersByTime(400);
      });

      // After the delay, focus has moved to the CTA.
      expect(document.activeElement).toBe(cta);
    } finally {
      jest.useRealTimers();
    }
  });

  it("moves focus immediately when prefers-reduced-motion is set (CRIT-Y3)", () => {
    mockMatchMedia(["(prefers-reduced-motion: reduce)"]);
    jest.useFakeTimers();
    try {
      render(<SuperLikeCelebration {...baseProps} />);

      const cta = screen.getByRole("button", { name: /Open job/i });

      // Delay should be 0ms under reduced motion — one tick is enough.
      act(() => {
        jest.advanceTimersByTime(0);
      });

      expect(document.activeElement).toBe(cta);
    } finally {
      jest.useRealTimers();
    }
  });

  it("does NOT pause the auto-dismiss timer on the programmatic mount-focus (CRIT-Y3)", () => {
    jest.useFakeTimers();
    try {
      render(<SuperLikeCelebration {...baseProps} />);

      // Advance past the mount-focus delay — focus moves to CTA, but the
      // programmatic focus must NOT pause the timer. The timer should
      // still fire auto-dismiss after the remaining ~5680ms.
      act(() => {
        jest.advanceTimersByTime(320);
      });

      // The CTA is focused, but onDismiss has not fired yet.
      expect(baseProps.onDismiss).not.toHaveBeenCalled();

      // Advance to just past the 6s auto-dismiss mark. If the timer had
      // been paused by the programmatic focus, onDismiss would never fire.
      act(() => {
        jest.advanceTimersByTime(6000);
      });

      expect(baseProps.onDismiss).toHaveBeenCalledTimes(1);
      expect(baseProps.onDismiss).toHaveBeenCalledWith("job-123");
    } finally {
      jest.useRealTimers();
    }
  });

  it("PAUSES the auto-dismiss timer when a subsequent focus event enters the celebration (WCAG 2.2.1)", () => {
    jest.useFakeTimers();
    try {
      render(<SuperLikeCelebration {...baseProps} />);

      // Advance past the mount-focus delay so the programmatic focus
      // (and its skip-flag) is fully consumed.
      act(() => {
        jest.advanceTimersByTime(320);
      });

      // Simulate the user tabbing AWAY from the CTA (blur resumes timer)
      // then back to the Close button (focus should now pause normally).
      const cta = screen.getByRole("button", { name: /Open job/i });
      const close = screen.getByRole("button", { name: /Close celebration/i });

      // First blur away — this resumes the (already-running) timer.
      act(() => {
        cta.blur();
      });

      // Now explicitly focus the close button. This is a user-initiated
      // focus event, so `handleFocusIn` must pause the timer.
      act(() => {
        close.focus();
      });

      // Advance FAR beyond the 6s auto-dismiss — if the focus-pause did
      // not take effect, onDismiss would have fired. It must not have.
      act(() => {
        jest.advanceTimersByTime(10_000);
      });

      expect(baseProps.onDismiss).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it("dismisses on global Escape key press even when focus is outside the celebration (CRIT-Y3)", () => {
    // No userEvent / fake timers here — Escape dispatch is synchronous and
    // the focus is elsewhere (document.body).
    render(<SuperLikeCelebration {...baseProps} />);

    // Ensure focus is on document.body, not inside the celebration. This
    // simulates the keyboard user who never Tabbed into the card.
    (document.activeElement as HTMLElement | null)?.blur?.();
    expect(document.activeElement).toBe(document.body);

    // Dispatch a document-level Escape keydown.
    act(() => {
      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      document.dispatchEvent(event);
    });

    expect(baseProps.onDismiss).toHaveBeenCalledWith("job-123");
    expect(baseProps.onDismiss).toHaveBeenCalledTimes(1);
  });

  it("does NOT dismiss on non-Escape keys (global listener is Escape-specific)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "a", bubbles: true }),
      );
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: " ", bubbles: true }),
      );
    });

    expect(baseProps.onDismiss).not.toHaveBeenCalled();
  });

  it("removes the global Escape listener on unmount (no leaks across celebrations)", () => {
    const { unmount } = render(<SuperLikeCelebration {...baseProps} />);

    unmount();

    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });

    // After unmount, the handler must be gone — onDismiss should not fire.
    expect(baseProps.onDismiss).not.toHaveBeenCalled();
  });

  it("global Escape listener does NOT consume the event — sibling listeners co-handle (CRIT-Y3 risk mitigation)", () => {
    // Regression guard for the cross-component Escape interaction risk
    // flagged in the CRIT-Y3 commit message: if the user opens
    // PromotionDialog or StagedVacancyDetailSheet WHILE a celebration is
    // visible, BOTH Escape handlers must fire on the same keypress so
    // "one keypress clears everything" works. This requires the
    // celebration's global keydown listener to NOT call preventDefault
    // or stopPropagation on the event.
    //
    // We simulate the scenario by installing a sibling `document`
    // keydown listener (standing in for Radix Dialog's DismissableLayer
    // escape handler) and verifying BOTH listeners fire on a single
    // dispatch, and the event is not marked as consumed.
    const siblingSpy = jest.fn();
    const siblingListener = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        siblingSpy(e);
      }
    };
    document.addEventListener("keydown", siblingListener);

    try {
      render(<SuperLikeCelebration {...baseProps} />);

      (document.activeElement as HTMLElement | null)?.blur?.();

      const event = new KeyboardEvent("keydown", {
        key: "Escape",
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        document.dispatchEvent(event);
      });

      // Both handlers fired on the same event.
      expect(baseProps.onDismiss).toHaveBeenCalledTimes(1);
      expect(baseProps.onDismiss).toHaveBeenCalledWith("job-123");
      expect(siblingSpy).toHaveBeenCalledTimes(1);

      // The celebration's handler did NOT consume the event — critical
      // for coexistence with Radix Dialog / DismissableLayer (which uses
      // `event.defaultPrevented` as a "someone else already handled this"
      // signal in some layer patterns).
      expect(event.defaultPrevented).toBe(false);
      // jsdom exposes `cancelBubble` to reflect stopPropagation state.
      expect((event as KeyboardEvent & { cancelBubble: boolean }).cancelBubble).toBe(false);
    } finally {
      document.removeEventListener("keydown", siblingListener);
    }
  });

  it("exposes an accessible name containing BOTH 'Super-liked!' and the vacancy title (CRIT-Y3 ARIA masking fix)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    // The role="status" container's accessible name is computed from
    // `aria-labelledby` pointing at the title + subtitle paragraphs. The
    // live-region announcement must include BOTH pieces of information so
    // AT users know which vacancy was super-liked.
    const card = screen.getByRole("status");
    const accessibleName = card.getAttribute("aria-labelledby");
    expect(accessibleName).toBeTruthy();

    // Resolve the aria-labelledby ids and concatenate their text content
    // to simulate what a screen reader would compute.
    const ids = accessibleName!.split(/\s+/);
    const resolvedText = ids
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ")
      .trim();

    expect(resolvedText).toMatch(/Super-liked/i);
    expect(resolvedText).toContain("Senior Full-Stack Engineer");
  });

  it("does NOT use a static aria-label that would mask the vacancy title (regression guard)", () => {
    render(<SuperLikeCelebration {...baseProps} />);

    const card = screen.getByRole("status");
    // The previous implementation set aria-label="Super-liked!" which
    // overrode the accessible name and hid the vacancy title from AT.
    // Explicitly guard against reintroducing it.
    expect(card).not.toHaveAttribute("aria-label");
  });
});

// ─── Host grace period ─────────────────────────────────────────────

describe("SuperLikeCelebrationHost — grace period", () => {
  const item1: CelebrationItem = {
    id: "job-1",
    jobId: "job-1",
    vacancyTitle: "First vacancy",
    addedAt: 1_000,
  };
  const item2: CelebrationItem = {
    id: "job-2",
    jobId: "job-2",
    vacancyTitle: "Second vacancy",
    addedAt: 2_000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    // Default: motion enabled (grace period active). Individual tests can
    // override with the reduced-motion media query.
    mockMatchMedia([]);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("renders the current celebration when none was visible before", () => {
    const dismiss = jest.fn();
    render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    expect(screen.getByText("First vacancy")).toBeInTheDocument();
    const card = screen.getByTestId("super-like-celebration");
    expect(card).not.toHaveAttribute("data-exiting");
  });

  it("holds the outgoing celebration for the grace period, then swaps to the next", () => {
    const dismiss = jest.fn();
    const { rerender } = render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={1}
        dismiss={dismiss}
      />,
    );

    // Initial: item1 is visible and not exiting.
    expect(screen.getByText("First vacancy")).toBeInTheDocument();

    // Replace with item2 — host should mark item1 as exiting, NOT mount item2 yet.
    rerender(
      <SuperLikeCelebrationHost
        current={item2}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // Item1 is still the displayed celebration during the grace period;
    // it now carries data-exiting. Item2's text must not be in the DOM yet.
    expect(screen.getByText("First vacancy")).toBeInTheDocument();
    expect(screen.queryByText("Second vacancy")).not.toBeInTheDocument();
    const exitingCard = screen.getByTestId("super-like-celebration");
    expect(exitingCard).toHaveAttribute("data-exiting", "true");

    // Advance past half the grace period — still item1, still exiting.
    act(() => {
      jest.advanceTimersByTime(700);
    });
    expect(screen.getByText("First vacancy")).toBeInTheDocument();
    expect(screen.queryByText("Second vacancy")).not.toBeInTheDocument();

    // Advance past the full grace period — now item2 mounts.
    act(() => {
      jest.advanceTimersByTime(800);
    });
    expect(screen.queryByText("First vacancy")).not.toBeInTheDocument();
    expect(screen.getByText("Second vacancy")).toBeInTheDocument();
    const freshCard = screen.getByTestId("super-like-celebration");
    expect(freshCard).not.toHaveAttribute("data-exiting");
  });

  it("applies a grace period when transitioning to an empty queue (current → null)", () => {
    const dismiss = jest.fn();
    const { rerender } = render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // User dismisses the last celebration — `current` becomes null.
    rerender(
      <SuperLikeCelebrationHost
        current={null}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // Card still visible with exit animation.
    expect(screen.getByText("First vacancy")).toBeInTheDocument();
    expect(screen.getByTestId("super-like-celebration")).toHaveAttribute(
      "data-exiting",
      "true",
    );

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    // After the grace period, the card unmounts cleanly.
    expect(screen.queryByTestId("super-like-celebration")).not.toBeInTheDocument();
  });

  it("skips the grace period when prefers-reduced-motion is enabled", () => {
    // Set up reduced motion BEFORE rendering so useMediaQuery picks it up.
    mockMatchMedia(["(prefers-reduced-motion: reduce)"]);

    const dismiss = jest.fn();
    const { rerender } = render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // useMediaQuery resolves to `true` on mount via an effect. React Testing
    // Library wraps `render` in `act`, so that effect (and the resulting
    // setState) has already flushed by the time we query the DOM.
    expect(screen.getByText("First vacancy")).toBeInTheDocument();

    // Swap to item2 — with reduced motion, the swap must be instant.
    rerender(
      <SuperLikeCelebrationHost
        current={item2}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // No timer advance: item2 should be visible immediately, not item1.
    expect(screen.queryByText("First vacancy")).not.toBeInTheDocument();
    expect(screen.getByText("Second vacancy")).toBeInTheDocument();
    // And the new card is NOT in exit state.
    expect(
      screen.getByTestId("super-like-celebration"),
    ).not.toHaveAttribute("data-exiting");
  });

  it("suppresses the +N more badge while exiting (badge belongs to the incoming card)", () => {
    const dismiss = jest.fn();
    const { rerender } = render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={2}
        dismiss={dismiss}
      />,
    );

    // Initially shows +2 more.
    expect(screen.getByText(/\+2 more/i)).toBeInTheDocument();

    // Start the transition.
    rerender(
      <SuperLikeCelebrationHost
        current={item2}
        queueRemaining={1}
        dismiss={dismiss}
      />,
    );

    // While exiting, the queue badge should NOT appear on the outgoing card.
    // After grace period it returns for the new card with its new count.
    expect(screen.queryByText(/\+2 more/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/\+1 more/i)).not.toBeInTheDocument();

    act(() => {
      jest.advanceTimersByTime(1500);
    });

    expect(screen.getByText(/\+1 more/i)).toBeInTheDocument();
  });

  it("renders nothing when current and displayed are both null", () => {
    render(
      <SuperLikeCelebrationHost
        current={null}
        queueRemaining={0}
        dismiss={jest.fn()}
      />,
    );

    expect(
      screen.queryByTestId("super-like-celebration"),
    ).not.toBeInTheDocument();
  });
});
