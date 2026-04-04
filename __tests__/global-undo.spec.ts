/**
 * Tests for the Global Undo hook (E2.3).
 * Verifies keyboard listener fires, skips in inputs, calls action.
 */
import "@testing-library/jest-dom";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockUndoLastAction = jest.fn();
jest.mock("@/actions/undo.actions", () => ({
  undoLastAction: (...args: unknown[]) => mockUndoLastAction(...args),
}));

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => key,
    locale: "en",
  })),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({
  toast: (...args: unknown[]) => mockToast(...args),
}));

import { renderHook, act } from "@testing-library/react";
import { useGlobalUndo } from "@/hooks/useGlobalUndo";

function fireCtrlZ() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      ctrlKey: true,
      bubbles: true,
    }),
  );
}

function fireCmdZ() {
  window.dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "z",
      metaKey: true,
      bubbles: true,
    }),
  );
}

describe("useGlobalUndo", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUndoLastAction.mockResolvedValue({ success: true, data: { tokenId: "t1" } });
  });

  it("calls undoLastAction on Ctrl+Z", async () => {
    renderHook(() => useGlobalUndo());

    await act(async () => {
      fireCtrlZ();
      // Let the async handler settle
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).toHaveBeenCalledTimes(1);
  });

  it("calls undoLastAction on Cmd+Z (Mac)", async () => {
    renderHook(() => useGlobalUndo());

    await act(async () => {
      fireCmdZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).toHaveBeenCalledTimes(1);
  });

  it("shows success toast when undo succeeds", async () => {
    renderHook(() => useGlobalUndo());

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "success", title: "undo.actionUndone" }),
    );
  });

  it("shows info toast when nothing to undo", async () => {
    mockUndoLastAction.mockResolvedValue({ success: false, message: "Nothing to undo" });

    renderHook(() => useGlobalUndo());

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "default", title: "undo.nothingToUndo" }),
    );
  });

  it("shows error toast when undo throws", async () => {
    mockUndoLastAction.mockRejectedValue(new Error("Server error"));

    renderHook(() => useGlobalUndo());

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: "destructive", title: "undo.undoFailed" }),
    );
  });

  it("does NOT fire when focus is on an input", async () => {
    renderHook(() => useGlobalUndo());

    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it("does NOT fire when focus is on a textarea", async () => {
    renderHook(() => useGlobalUndo());

    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);
    textarea.focus();

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it("does NOT fire when focus is on a contenteditable element", async () => {
    renderHook(() => useGlobalUndo());

    const div = document.createElement("div");
    div.setAttribute("contenteditable", "true");
    // Make focusable
    div.tabIndex = 0;
    document.body.appendChild(div);
    div.focus();

    // Verify focus is on our element
    expect(document.activeElement).toBe(div);

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).not.toHaveBeenCalled();
    document.body.removeChild(div);
  });

  it("does NOT fire on Ctrl+Shift+Z (redo)", async () => {
    renderHook(() => useGlobalUndo());

    await act(async () => {
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "z",
          ctrlKey: true,
          shiftKey: true,
          bubbles: true,
        }),
      );
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).not.toHaveBeenCalled();
  });

  it("cleans up listener on unmount", async () => {
    const { unmount } = renderHook(() => useGlobalUndo());
    unmount();

    await act(async () => {
      fireCtrlZ();
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mockUndoLastAction).not.toHaveBeenCalled();
  });
});
