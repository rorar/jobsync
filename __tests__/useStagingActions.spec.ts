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
