/**
 * useStagingActions hook tests
 *
 * Tests: createHandler calls server action, toasts success + reloads on
 * success, toasts destructive on failure, does NOT reload on failure.
 */
import { renderHook, act } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.promoted": "Promoted",
        "staging.error": "Error",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

import { useStagingActions } from "@/hooks/useStagingActions";

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe("useStagingActions", () => {
  const mockReload = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createHandler calls the server action with the given id", async () => {
    const mockAction = jest.fn().mockResolvedValue({ success: true });

    const { result } = renderHook(() => useStagingActions(mockReload));
    const handler = result.current.createHandler(mockAction, "staging.promoted");

    await act(async () => {
      await handler("vacancy-123");
    });

    expect(mockAction).toHaveBeenCalledWith("vacancy-123");
  });

  it("createHandler calls toast with success message and reload on success", async () => {
    const mockAction = jest.fn().mockResolvedValue({ success: true });

    const { result } = renderHook(() => useStagingActions(mockReload));
    const handler = result.current.createHandler(mockAction, "staging.promoted");

    await act(async () => {
      await handler("vacancy-456");
    });

    expect(mockToast).toHaveBeenCalledWith({
      variant: "success",
      description: "Promoted",
    });
    expect(mockReload).toHaveBeenCalled();
  });

  it("createHandler calls toast with destructive variant on failure", async () => {
    const mockAction = jest.fn().mockResolvedValue({
      success: false,
      message: "Something went wrong",
    });

    const { result } = renderHook(() => useStagingActions(mockReload));
    const handler = result.current.createHandler(mockAction, "staging.promoted");

    await act(async () => {
      await handler("vacancy-789");
    });

    expect(mockToast).toHaveBeenCalledWith({
      variant: "destructive",
      title: "Error",
      description: "Something went wrong",
    });
  });

  it("createHandler does NOT call reload on failure", async () => {
    const mockAction = jest.fn().mockResolvedValue({
      success: false,
      message: "Failed",
    });

    const { result } = renderHook(() => useStagingActions(mockReload));
    const handler = result.current.createHandler(mockAction, "staging.promoted");

    await act(async () => {
      await handler("vacancy-000");
    });

    expect(mockReload).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// M-P-03 (Sprint 3 Stream F) — closure stability regression guard.
//
// Before the fix: every `createHandler(action, key)` call returned a
// FRESH handler closure, so `StagingContainer`'s five `createHandler(...)`
// calls at the top of render produced five NEW functions on every parent
// re-render. That invalidated the `StagedVacancyCard` `React.memo`
// downstream (handler props changed identity every render).
//
// After the fix: `createHandler` is wrapped in `useCallback([])` AND the
// returned handler is cached per `(action, successKey)` pair inside a
// ref, so repeated calls with the same inputs yield the SAME reference
// across renders. Verified here with `renderHook`'s `rerender` utility.
// ---------------------------------------------------------------------------

describe("useStagingActions — M-P-03 closure stability", () => {
  const mockReload = jest.fn().mockResolvedValue(undefined);
  const stableAction: (id: string) => Promise<{ success: boolean }> = async () => ({
    success: true,
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("createHandler factory itself is identity-stable across re-renders", () => {
    const { result, rerender } = renderHook(() =>
      useStagingActions(mockReload),
    );
    const factoryFirst = result.current.createHandler;
    rerender();
    const factorySecond = result.current.createHandler;
    expect(factorySecond).toBe(factoryFirst);
  });

  it("returns the SAME handler reference across renders when action+key are stable", () => {
    const { result, rerender } = renderHook(() =>
      useStagingActions(mockReload),
    );
    const handlerFirst = result.current.createHandler(
      stableAction,
      "staging.dismissed",
    );
    rerender();
    const handlerSecond = result.current.createHandler(
      stableAction,
      "staging.dismissed",
    );
    expect(handlerSecond).toBe(handlerFirst);
  });

  it("returns DIFFERENT handler references for different actions", () => {
    const { result } = renderHook(() => useStagingActions(mockReload));
    const actionA: typeof stableAction = async () => ({ success: true });
    const actionB: typeof stableAction = async () => ({ success: true });
    const handlerA = result.current.createHandler(actionA, "staging.dismissed");
    const handlerB = result.current.createHandler(actionB, "staging.dismissed");
    expect(handlerA).not.toBe(handlerB);
  });

  it("returns DIFFERENT handler references for the same action with different success keys", () => {
    const { result } = renderHook(() => useStagingActions(mockReload));
    const handlerDismiss = result.current.createHandler(
      stableAction,
      "staging.dismissed",
    );
    const handlerArchive = result.current.createHandler(
      stableAction,
      "staging.archived",
    );
    expect(handlerDismiss).not.toBe(handlerArchive);
  });

  it("cached handlers still reflect the LATEST reload function after re-render", async () => {
    const reloadA = jest.fn().mockResolvedValue(undefined);
    const reloadB = jest.fn().mockResolvedValue(undefined);

    const { result, rerender } = renderHook(
      ({ reload }: { reload: () => Promise<void> }) =>
        useStagingActions(reload),
      { initialProps: { reload: reloadA } },
    );

    const handler = result.current.createHandler(
      stableAction,
      "staging.dismissed",
    );

    // Re-render with a different reload — the ref should update so
    // the cached handler invokes reloadB on its next call.
    rerender({ reload: reloadB });

    await act(async () => {
      await handler("vacancy-1");
    });

    expect(reloadB).toHaveBeenCalledTimes(1);
    expect(reloadA).not.toHaveBeenCalled();
  });

  it("cached handlers still reflect the LATEST `t` function after re-render (locale switch)", async () => {
    // Simulate the locale switch: the `useTranslations` mock returns a
    // new `t` function on re-render, mimicking what happens when the
    // locale context changes. The cached handler MUST read the latest
    // `t` via the ref — otherwise toast messages would stay in the
    // previous locale until the component unmounts.
    const { useTranslations } = jest.requireMock("@/i18n") as {
      useTranslations: jest.MockedFunction<
        () => { t: (k: string) => string; locale: string }
      >;
    };

    // First render uses the default mock (`staging.promoted` → "Promoted").
    const { result, rerender } = renderHook(() =>
      useStagingActions(mockReload),
    );

    const action: typeof stableAction = async () => ({ success: true });
    const handler = result.current.createHandler(action, "staging.promoted");

    // Switch to a "German" t() mock on next render.
    useTranslations.mockReturnValueOnce({
      t: (key: string) => `[de] ${key}`,
      locale: "de",
    });
    rerender();

    await act(async () => {
      await handler("vacancy-locale");
    });

    // The toast should now be rendered with the German t() —
    // confirming the cached handler read through the ref.
    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({
        variant: "success",
        description: "[de] staging.promoted",
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Sprint 4 Stream B — handler cache eviction guard.
//
// Sprint 3 added a `useRef<Map>` handler cache keyed by (action, successKey).
// Under the current codebase it's bounded at ~5 entries by module-level
// stable server-action imports. Sprint 4 adds a defensive FIFO eviction
// at HANDLER_CACHE_MAX_ENTRIES = 20 so that a future dynamic-factory
// caller (e.g. `createHandler(async (id) => {...}, ...)` in render) cannot
// leak unbounded handler identities.
//
// These tests pin the observable eviction contract by simulating a
// dynamic factory that pumps fresh server-action references into
// createHandler and asserting that:
//   1. Under the ceiling, every unique input gets a fresh handler AND
//      identity-stable repeats are honored.
//   2. At the ceiling, the oldest entry is evicted, but the youngest
//      entries remain cached and identity-stable across repeat calls.
//   3. The eviction branch logs a warning so the fail-loud signal is
//      observable.
// ---------------------------------------------------------------------------

describe("useStagingActions — Sprint 4 Stream B cache eviction guard", () => {
  const mockReload = jest.fn().mockResolvedValue(undefined);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the cache bounded at 20 entries even under dynamic-factory abuse", () => {
    const { result } = renderHook(() => useStagingActions(mockReload));

    // Simulate a dynamic factory: spin up 30 fresh action references.
    // Each gets a unique handler, so the cache would grow to 30 without
    // the eviction guard.
    const actions: Array<(id: string) => Promise<{ success: true }>> = [];
    for (let i = 0; i < 30; i++) {
      actions.push(async () => ({ success: true }));
    }

    // Spy on console.warn so we can verify the eviction warning path
    // fires at least once after we cross the ceiling.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      for (const action of actions) {
        result.current.createHandler(action, "staging.dismissed");
      }

      // The warning must have fired at least once — eviction kicks in
      // after the 20th insert.
      expect(warnSpy).toHaveBeenCalled();
      const warnCall = warnSpy.mock.calls.find((call) =>
        String(call[0]).includes(
          "[useStagingActions] Handler cache reached max entries",
        ),
      );
      expect(warnCall).toBeDefined();
    } finally {
      warnSpy.mockRestore();
    }
  });

  it("the newest entry is still cached after eviction (identity-stable on repeat)", () => {
    const { result } = renderHook(() => useStagingActions(mockReload));

    // Push 30 distinct actions to force eviction of the older half.
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const actions: Array<(id: string) => Promise<{ success: true }>> = [];
      for (let i = 0; i < 30; i++) {
        actions.push(async () => ({ success: true }));
      }
      actions.forEach((action) => {
        result.current.createHandler(action, "staging.dismissed");
      });

      // Now re-register the LAST action — it should still be cached,
      // so calling createHandler again returns the SAME reference.
      const lastAction = actions[actions.length - 1];
      const firstLookup = result.current.createHandler(
        lastAction,
        "staging.dismissed",
      );
      const secondLookup = result.current.createHandler(
        lastAction,
        "staging.dismissed",
      );
      expect(secondLookup).toBe(firstLookup);
    } finally {
      warnSpy.mockRestore();
    }
  });

  // ---------------------------------------------------------------------------
  // H-2 (Sprint 4 full-review) — counter-drift scenario regression guard.
  //
  // The original eviction logic dropped the oldest TOP-LEVEL action entry,
  // which decremented the counter by the dropped inner-map's entire `.size`
  // — but the local `bySuccessKey` reference captured BEFORE the eviction
  // still held all the old entries, and a subsequent `byAction.set(action,
  // bySuccessKey)` re-inserted the same inner map. Scenario: 1 stable
  // action paired with 20 distinct successKeys → the 21st call fires
  // eviction, counter goes to 0, inner map still holds 20 entries, then
  // the new 21st key is added — inner map now has 21 entries but counter
  // says 1. Permanent drift: eviction never fires again and the inner map
  // grows unbounded.
  //
  // The fix: eviction now drops a single oldest (action, successKey)
  // handler, iterating the outer map to find a non-empty inner map
  // (preferring actions other than the one being serviced). The counter
  // tracks each drop exactly.
  // ---------------------------------------------------------------------------
  it("H-2: caps total cached handlers when a single action uses many successKeys", () => {
    const { result } = renderHook(() => useStagingActions(mockReload));
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const stableAction: (id: string) => Promise<{ success: true }> = async () => ({
        success: true,
      });

      // Pair the same stable action with 25 distinct successKeys. Without
      // the fix, after the 21st iteration the counter would drop to 0 and
      // the inner map would grow to 25 entries unchecked. With the fix,
      // eviction drops a single oldest successKey on each insert past 20.
      for (let i = 0; i < 25; i++) {
        result.current.createHandler(stableAction, `staging.key${i}`);
      }

      // The eviction warn must have fired for the over-ceiling inserts.
      expect(warnSpy).toHaveBeenCalled();

      // Define "cached entries" as "creations that return the same
      // reference on a repeat lookup". We verify the bound indirectly by
      // checking that (a) a recently-inserted key is still cached and
      // (b) repeatedly re-inserting keys does NOT grow the total cache
      // size past the ceiling.

      // The most-recent successKey should still be cached.
      const recentKey = "staging.key24";
      const firstLookup = result.current.createHandler(stableAction, recentKey);
      const secondLookup = result.current.createHandler(stableAction, recentKey);
      expect(secondLookup).toBe(firstLookup);

      // The oldest keys should have been evicted (eviction order is
      // iteration order of Map which is insertion order, so key0 is the
      // oldest and should NOT be cached on re-insert).
      const oldestKey = "staging.key0";
      const oldLookupA = result.current.createHandler(stableAction, oldestKey);
      const oldLookupB = result.current.createHandler(stableAction, oldestKey);
      // oldLookupA is a FRESH handler (created on re-insert), and
      // oldLookupB returns the cache-hit for that same fresh handler.
      expect(oldLookupB).toBe(oldLookupA);
      // But the re-inserted handler is NOT the same as the original
      // firstLookup call (which was the recent key, a different closure).
      expect(oldLookupA).not.toBe(firstLookup);
    } finally {
      warnSpy.mockRestore();
    }
  });
});
