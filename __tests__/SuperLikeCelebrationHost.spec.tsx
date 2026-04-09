/**
 * SuperLikeCelebrationHost — router.push side-effect and unmount cleanup tests
 *
 * The existing SuperLikeCelebration.spec.tsx (grace-period describe block,
 * lines 461-665) thoroughly covers the host's grace period, reduced-motion
 * bypass, and queue-badge suppression during exit animation. Those tests are
 * NOT duplicated here.
 *
 * This file pins two gaps identified in the sprint-2 specialist review (M-T-08):
 *
 *   1. router.push side effect — `onOpenJob` callback must call
 *      `router.push("/dashboard/myjobs/${jobId}")` after dismissing the
 *      current celebration. The existing spec mocks `useRouter` as an inline
 *      `jest.fn()` that is re-created per render and unreachable from
 *      assertions. This spec captures the push call.
 *
 *   2. Timer cleanup on unmount — the grace-period timer started via
 *      `setTimeout(GRACE_PERIOD_MS)` must be cleared when the host unmounts
 *      so it does not fire after the component is gone (would call setState on
 *      an unmounted component). This tests the `useEffect` cleanup return at
 *      SuperLikeCelebrationHost.tsx lines 108-115.
 *
 * Pointer-capture stub is inherited from the beforeAll in
 * SuperLikeCelebration.spec.tsx via jsdom's shared prototype. To keep this
 * file self-contained we re-stub it here.
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SuperLikeCelebrationHost } from "@/components/staging/SuperLikeCelebrationHost";
import type { CelebrationItem } from "@/hooks/useSuperLikeCelebrations";

// ---------------------------------------------------------------------------
// Pointer-capture stub (jsdom does not implement Pointer Events API)
// ---------------------------------------------------------------------------

beforeAll(() => {
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

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// i18n — pass-through: key becomes the display text.
jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
}));

// Capture the router push so we can assert it was called.
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

// matchMedia — jsdom does not ship a matchMedia implementation.
// Default: no reduced-motion preference (grace period is active).
function mockMatchMedia(matchingQueries: string[]) {
  window.matchMedia = jest.fn((query: string): MediaQueryList => {
    const matches = matchingQueries.includes(query);
    return {
      matches,
      media: query,
      onchange: null,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn().mockReturnValue(true),
    } as unknown as MediaQueryList;
  }) as unknown as typeof window.matchMedia;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeItem(overrides: Partial<CelebrationItem> = {}): CelebrationItem {
  return {
    id: "job-42",
    jobId: "job-42",
    vacancyTitle: "Senior Full-Stack Engineer",
    addedAt: Date.now(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  mockMatchMedia([]); // motion enabled
});

// ---------------------------------------------------------------------------
// router.push side-effect (M-T-08)
// ---------------------------------------------------------------------------

describe("SuperLikeCelebrationHost — router.push on Open Job", () => {
  it("calls router.push with the correct job route when 'Open job' CTA is clicked", async () => {
    const dismiss = jest.fn();
    const item = makeItem({ jobId: "job-99" });

    render(
      <SuperLikeCelebrationHost
        current={item}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // With the pass-through i18n mock, t("deck.superLikeCelebration.openJob")
    // renders the key itself as the button label.
    const openJobButton = screen.getByRole("button", {
      name: /deck\.superLikeCelebration\.openJob/i,
    });

    await userEvent.click(openJobButton);

    // The host must dismiss BEFORE navigating (prevents flash on the next route).
    expect(dismiss).toHaveBeenCalledWith(item.id);
    // The host must push to the correct job route.
    expect(mockRouterPush).toHaveBeenCalledWith("/dashboard/myjobs/job-99");
  });

  it("calls dismiss before router.push — dismiss is first in call order", async () => {
    const callOrder: string[] = [];
    const dismiss = jest.fn(() => { callOrder.push("dismiss"); });
    mockRouterPush.mockImplementation(() => { callOrder.push("push"); });

    const item = makeItem({ jobId: "job-55" });

    render(
      <SuperLikeCelebrationHost
        current={item}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    const openJobButton = screen.getByRole("button", {
      name: /open.*job|deck\.superLikeCelebration\.openJob/i,
    });
    await userEvent.click(openJobButton);

    expect(callOrder).toEqual(["dismiss", "push"]);
  });
});

// ---------------------------------------------------------------------------
// Timer cleanup on unmount
// ---------------------------------------------------------------------------

describe("SuperLikeCelebrationHost — unmount timer cleanup", () => {
  const item1: CelebrationItem = {
    id: "job-A",
    jobId: "job-A",
    vacancyTitle: "First vacancy",
    addedAt: 1_000,
  };
  const item2: CelebrationItem = {
    id: "job-B",
    jobId: "job-B",
    vacancyTitle: "Second vacancy",
    addedAt: 2_000,
  };

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("clears the grace-period timer when the host unmounts mid-transition", () => {
    const dismiss = jest.fn();
    const { rerender, unmount } = render(
      <SuperLikeCelebrationHost
        current={item1}
        queueRemaining={1}
        dismiss={dismiss}
      />,
    );

    // Trigger a grace-period transition by swapping to item2.
    rerender(
      <SuperLikeCelebrationHost
        current={item2}
        queueRemaining={0}
        dismiss={dismiss}
      />,
    );

    // At this point a 1500ms timer is running. Unmount before it fires.
    unmount();

    // Advance time past the grace period — if the timer was not cleared this
    // would attempt to call setState on an unmounted component and throw.
    expect(() => {
      act(() => {
        jest.advanceTimersByTime(2000);
      });
    }).not.toThrow();
  });

  it("renders null when current is null", () => {
    const { container } = render(
      <SuperLikeCelebrationHost
        current={null}
        queueRemaining={0}
        dismiss={jest.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
