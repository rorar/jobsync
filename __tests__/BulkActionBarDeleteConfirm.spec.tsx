/**
 * BulkActionBar "Delete Permanently" confirmation — Sprint 3 Stream G
 * M-NEW-02 regression guard.
 *
 * WCAG 3.3.4 "Error Prevention (Legal, Financial, Data)" at Level AA
 * requires destructive, irreversible data actions to be either
 * reversible, auto-checked, or confirmed. The bulk delete on the trash
 * tab is non-reversible (no undo token is issued) and not
 * auto-checked, so the confirmation path is the only compliant option.
 *
 * Before this sprint, clicking "Delete Permanently" fired
 * `executeBulkAction("delete", ids)` immediately with no confirmation.
 * After this fix, clicking the button opens a Radix AlertDialog; the
 * actual delete only fires when the user clicks "Delete permanently"
 * inside the dialog. Clicking "Cancel" MUST NOT call
 * `executeBulkAction`.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.bulkRestore": "Restore Selected",
        "staging.bulkDelete": "Delete Permanently",
        "staging.selectedCount": "{count} selected",
        "staging.bulkDeleteConfirmTitle":
          "Delete {count} items permanently?",
        "staging.bulkDeleteConfirmDescription":
          "This action cannot be undone. The selected vacancies will be permanently removed from the trash.",
        "staging.bulkDeleteConfirmAction": "Delete permanently",
        "staging.bulkDeleteConfirmCancel": "Cancel",
        "staging.bulkSuccess": "{succeeded} of {total} items processed",
        "staging.undoAction": "Undo",
        "staging.error": "Error",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

const executeBulkActionMock = jest.fn();

jest.mock("@/actions/stagedVacancy.actions", () => ({
  executeBulkAction: (...args: unknown[]) => executeBulkActionMock(...args),
}));

jest.mock("@/actions/undo.actions", () => ({
  undoAction: jest.fn(),
}));

jest.mock("@/components/ui/use-toast", () => ({
  toast: jest.fn(),
}));

// Inline AlertDialog to avoid Radix portal rendering in jsdom. Matches
// the pattern in __tests__/ConflictWarningDialog.spec.tsx.
jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }) =>
    open ? (
      <div role="alertdialog" data-testid="alert-dialog">
        {children}
      </div>
    ) : null,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogCancel: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="alert-cancel" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  } & Record<string, unknown>) => (
    <button onClick={onClick} {...rest}>
      {children}
    </button>
  ),
}));

import { BulkActionBar } from "@/components/staging/BulkActionBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderTrashBar() {
  const onActionComplete = jest.fn();
  const onClearSelection = jest.fn();
  const selectedIds = new Set(["id-1", "id-2", "id-3"]);

  render(
    <BulkActionBar
      selectedIds={selectedIds}
      activeTab="trash"
      onActionComplete={onActionComplete}
      onClearSelection={onClearSelection}
    />,
  );

  return { onActionComplete, onClearSelection };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("BulkActionBar — M-NEW-02 delete confirmation (WCAG 3.3.4)", () => {
  beforeEach(() => {
    executeBulkActionMock.mockReset();
    executeBulkActionMock.mockResolvedValue({
      success: true,
      data: {
        succeeded: 3,
        totalRequested: 3,
        undoTokenId: null,
      },
    });
  });

  it("does NOT call executeBulkAction when the trigger button is clicked", () => {
    renderTrashBar();

    fireEvent.click(screen.getByTestId("bulk-delete-trigger"));

    // Triggering the dialog must not fire the delete. Before M-NEW-02
    // this assertion was impossible — the delete fired synchronously
    // on the first click.
    expect(executeBulkActionMock).not.toHaveBeenCalled();
  });

  it("opens the confirmation dialog on trigger click", () => {
    renderTrashBar();

    // Dialog is closed initially.
    expect(screen.queryByTestId("alert-dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("bulk-delete-trigger"));

    // Dialog opens with the title + description + both buttons.
    expect(screen.getByTestId("alert-dialog")).toBeInTheDocument();
    expect(
      screen.getByText("Delete 3 items permanently?"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This action cannot be undone. The selected vacancies will be permanently removed from the trash.",
      ),
    ).toBeInTheDocument();
  });

  it("does NOT fire the delete when the user clicks Cancel", () => {
    renderTrashBar();

    fireEvent.click(screen.getByTestId("bulk-delete-trigger"));
    fireEvent.click(screen.getByTestId("alert-cancel"));

    expect(executeBulkActionMock).not.toHaveBeenCalled();
  });

  it("fires executeBulkAction('delete', ids) ONLY after the user confirms", async () => {
    renderTrashBar();

    fireEvent.click(screen.getByTestId("bulk-delete-trigger"));
    fireEvent.click(screen.getByTestId("bulk-delete-confirm"));

    await waitFor(() => {
      expect(executeBulkActionMock).toHaveBeenCalledTimes(1);
    });

    const [actionType, ids] = executeBulkActionMock.mock.calls[0];
    expect(actionType).toBe("delete");
    // The selected set is unordered; assert set-equality rather than array-equality.
    expect(new Set(ids)).toEqual(new Set(["id-1", "id-2", "id-3"]));
  });

  it("interpolates the selection count into the dialog title", () => {
    renderTrashBar();

    fireEvent.click(screen.getByTestId("bulk-delete-trigger"));

    // The {count} placeholder must be replaced with the selection size.
    expect(
      screen.getByText("Delete 3 items permanently?"),
    ).toBeInTheDocument();
    // The raw unreplaced placeholder must NOT leak through.
    expect(
      screen.queryByText(/Delete \{count\} items permanently\?/),
    ).not.toBeInTheDocument();
  });
});
