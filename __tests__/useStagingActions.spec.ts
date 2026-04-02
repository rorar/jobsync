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
