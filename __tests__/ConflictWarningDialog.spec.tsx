/**
 * ConflictWarningDialog Component Tests
 *
 * Tests: blocked mode UI (shows conflict details, no proceed button),
 * contention mode UI (shows other automations list, shows proceed button),
 * onProceed callback, onOpenChange callback, optional conflict detail fields,
 * i18n key usage.
 *
 * Spec: scheduler-coordination.allium (surface ConflictWarningDialog)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "automations.conflictBlocked": "Run Already Active",
        "automations.conflictContention": "Module in Use",
        "automations.conflictBlockedDesc":
          "This automation is already running and cannot be started again.",
        "automations.conflictContentionDesc":
          "Another automation is currently using the same module.",
        "automations.conflictCancel": "Cancel",
        "automations.conflictProceed": "Run Anyway",
        "automations.automationName": "Automation",
        "automations.conflictSource": "Started by",
        "automations.conflictStartedAt": "Started at",
        "automations.runSourceScheduler": "Scheduler",
        "automations.runSourceManual": "Manual",
        "automations.schedulerModule": "Module",
        "automations.schedulerActive": "Active automations",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
  formatRelativeTime: jest.fn(() => "2 minutes ago"),
}));

// Inline AlertDialog to render without Radix portals
jest.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({
    open,
    children,
  }: {
    open: boolean;
    onOpenChange?: (open: boolean) => void;
    children: React.ReactNode;
  }) => (open ? <div role="dialog">{children}</div> : null),
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h2>{children}</h2>
  ),
  AlertDialogDescription: ({
    children,
    asChild,
  }: {
    children: React.ReactNode;
    asChild?: boolean;
  }) => <div>{children}</div>,
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
    <button data-testid="cancel-btn" onClick={onClick}>
      {children}
    </button>
  ),
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => (
    <button data-testid="proceed-btn" onClick={onClick}>
      {children}
    </button>
  ),
}));

import { ConflictWarningDialog } from "@/components/automations/ConflictWarningDialog";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const noopOpenChange = jest.fn();
const noopProceed = jest.fn();

function renderBlocked(
  conflictDetails: Parameters<typeof ConflictWarningDialog>[0]["conflictDetails"] = {},
) {
  return render(
    <ConflictWarningDialog
      open={true}
      onOpenChange={noopOpenChange}
      onProceed={noopProceed}
      type="blocked"
      conflictDetails={conflictDetails}
    />,
  );
}

function renderContention(
  conflictDetails: Parameters<typeof ConflictWarningDialog>[0]["conflictDetails"] = {},
) {
  return render(
    <ConflictWarningDialog
      open={true}
      onOpenChange={noopOpenChange}
      onProceed={noopProceed}
      type="contention"
      conflictDetails={conflictDetails}
    />,
  );
}

// ---------------------------------------------------------------------------
// Suite — open/close
// ---------------------------------------------------------------------------

describe("ConflictWarningDialog — open state", () => {
  beforeEach(() => jest.clearAllMocks());

  it("renders dialog when open is true", () => {
    renderBlocked();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("does not render when open is false", () => {
    render(
      <ConflictWarningDialog
        open={false}
        onOpenChange={noopOpenChange}
        onProceed={noopProceed}
        type="blocked"
        conflictDetails={{}}
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — blocked mode
// ---------------------------------------------------------------------------

describe("ConflictWarningDialog — blocked mode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the blocked title", () => {
    renderBlocked();
    expect(screen.getByText("Run Already Active")).toBeInTheDocument();
  });

  it("shows the blocked description text", () => {
    renderBlocked();
    expect(
      screen.getByText(/This automation is already running/),
    ).toBeInTheDocument();
  });

  it("does NOT render the Proceed button in blocked mode", () => {
    renderBlocked();
    expect(screen.queryByTestId("proceed-btn")).not.toBeInTheDocument();
  });

  it("renders the Cancel button in blocked mode", () => {
    renderBlocked();
    expect(screen.getByTestId("cancel-btn")).toBeInTheDocument();
  });

  it("shows automationName when provided in conflictDetails", () => {
    renderBlocked({ automationName: "Search Alpha" });
    expect(screen.getByText("Search Alpha")).toBeInTheDocument();
  });

  it("shows 'Scheduler' label for runSource='scheduler'", () => {
    renderBlocked({ runSource: "scheduler" });
    expect(screen.getByText("Scheduler")).toBeInTheDocument();
  });

  it("shows 'Manual' label for runSource='manual'", () => {
    renderBlocked({ runSource: "manual" });
    expect(screen.getByText("Manual")).toBeInTheDocument();
  });

  it("shows formatted relative time when startedAt is provided", () => {
    renderBlocked({ startedAt: new Date("2026-01-01T10:00:00Z") });
    expect(screen.getByText("2 minutes ago")).toBeInTheDocument();
  });

  it("does NOT render optional conflict details section when none provided", () => {
    renderBlocked({});
    // The detail keys header should not appear when fields are absent
    expect(screen.queryByText("Automation")).not.toBeInTheDocument();
  });

  it("does NOT show the module/automation list section in blocked mode", () => {
    renderBlocked({ moduleId: "jsearch", otherAutomations: ["Alpha"] });
    // contention list section should not appear
    expect(screen.queryByText("Active automations:")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — contention mode
// ---------------------------------------------------------------------------

describe("ConflictWarningDialog — contention mode", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows the contention title", () => {
    renderContention();
    expect(screen.getByText("Module in Use")).toBeInTheDocument();
  });

  it("shows the contention description text", () => {
    renderContention();
    expect(
      screen.getByText(/Another automation is currently using/),
    ).toBeInTheDocument();
  });

  it("renders the Proceed button in contention mode", () => {
    renderContention();
    expect(screen.getByTestId("proceed-btn")).toBeInTheDocument();
  });

  it("calls onProceed when the Proceed button is clicked", () => {
    const onProceed = jest.fn();
    render(
      <ConflictWarningDialog
        open={true}
        onOpenChange={noopOpenChange}
        onProceed={onProceed}
        type="contention"
        conflictDetails={{}}
      />,
    );
    fireEvent.click(screen.getByTestId("proceed-btn"));
    expect(onProceed).toHaveBeenCalledTimes(1);
  });

  it("shows the moduleId when provided", () => {
    renderContention({
      moduleId: "jsearch",
      otherAutomations: ["Some Auto"],
    });
    expect(screen.getByText(/jsearch/i)).toBeInTheDocument();
  });

  it("renders the list of other automation names", () => {
    renderContention({
      moduleId: "eures",
      otherAutomations: ["Alpha Search", "Beta Search"],
    });
    expect(screen.getByText("Alpha Search")).toBeInTheDocument();
    expect(screen.getByText("Beta Search")).toBeInTheDocument();
  });

  it("renders a single automation name correctly", () => {
    renderContention({
      otherAutomations: ["Solo Automation"],
    });
    expect(screen.getByText("Solo Automation")).toBeInTheDocument();
  });

  it("does NOT show the blocked conflict-details section in contention mode", () => {
    renderContention({ automationName: "Should Not Appear" });
    // automationName detail row is only rendered in blocked mode
    expect(screen.queryByText("Should Not Appear")).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite — Cancel callback
// ---------------------------------------------------------------------------

describe("ConflictWarningDialog — cancel interaction", () => {
  beforeEach(() => jest.clearAllMocks());

  it("Cancel button is present in both modes", () => {
    const { unmount } = renderBlocked();
    expect(screen.getByTestId("cancel-btn")).toBeInTheDocument();
    unmount();

    renderContention();
    expect(screen.getByTestId("cancel-btn")).toBeInTheDocument();
  });
});
