/**
 * ReferralActionBar Component Tests
 *
 * Tests: correct forward action per status; variant-correct labels (insider_relay
 * vs network_path); commit aria-disabled when !hasTargetCompany (NOT disabled attr);
 * aria-describedby explanation on blocked commit; no forward action at terminal states;
 * decline present in working states + absent at converted/declined; no-confirm actions
 * call onAction; confirming decline dialog calls onAction; busy sets aria-busy.
 *
 * Design: docs/design/inside-track-ui.md §E + §G items 2+3 + §H
 * Spec:   specs/inside-track.allium (lifecycle graph)
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReferralStatus, ReferralKind } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const dict: Record<string, string> = {
  "insideTrack.workspace.availableActions": "Available actions",
  "insideTrack.action.engage.insider_relay": "Send your documents",
  "insideTrack.action.engage.network_path": "Ask for an introduction",
  "insideTrack.action.relay.insider_relay": "Confirm documents relayed",
  "insideTrack.action.relay.network_path": "Confirm introduction made",
  "insideTrack.action.review": "Mark as under review",
  "insideTrack.action.commitToApply": "Commit to apply",
  "insideTrack.action.revive": "Revive",
  "insideTrack.action.decline": "Decline",
  "insideTrack.action.commitToApplyRequiresCompany": "Set a target company first",
  "insideTrack.action.commitToApplyConfirmTitle": "Create a job application?",
  "insideTrack.action.commitToApplyConfirmDescription":
    "This will create a new job for {company}. You can edit the details afterwards.",
  "insideTrack.action.declineConfirmTitle": "Decline this referral?",
  "insideTrack.action.declineConfirmDescription":
    "This marks the referral as declined and cannot be undone.",
  "insideTrack.action.confirmContinue": "Continue",
  "insideTrack.action.confirmCancel": "Cancel",
};

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (k: string) => dict[k] ?? k,
    locale: "en",
  })),
}));

jest.mock("lucide-react", () => ({
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader2" {...props} />
  ),
}));

window.HTMLElement.prototype.scrollIntoView = jest.fn();

import {
  ReferralActionBar,
  type ReferralActionKey,
} from "@/components/inside-track/ReferralActionBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderBar(
  overrides: {
    status?: ReferralStatus;
    kind?: ReferralKind;
    hasTargetCompany?: boolean;
    companyName?: string;
    onAction?: jest.Mock;
    busy?: boolean;
  } = {},
) {
  const defaults = {
    status: "open" as ReferralStatus,
    kind: "insider_relay" as ReferralKind,
    hasTargetCompany: false,
    companyName: undefined,
    onAction: jest.fn(),
    busy: false,
  };
  const props = { ...defaults, ...overrides };
  return render(<ReferralActionBar {...props} />);
}

// ---------------------------------------------------------------------------
// Suite: group landmark
// ---------------------------------------------------------------------------

describe("ReferralActionBar — group landmark", () => {
  it("renders a group div with the translated label", () => {
    renderBar();
    expect(
      screen.getByRole("group", { name: "Available actions" }),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: forward actions per status
// ---------------------------------------------------------------------------

describe("ReferralActionBar — forward actions", () => {
  it("renders 'Send your documents' for open + insider_relay", () => {
    renderBar({ status: "open", kind: "insider_relay" });
    expect(
      screen.getByRole("button", { name: "Send your documents" }),
    ).toBeInTheDocument();
  });

  it("renders 'Ask for an introduction' for open + network_path", () => {
    renderBar({ status: "open", kind: "network_path" });
    expect(
      screen.getByRole("button", { name: "Ask for an introduction" }),
    ).toBeInTheDocument();
  });

  it("renders 'Confirm documents relayed' for engaged + insider_relay", () => {
    renderBar({ status: "engaged", kind: "insider_relay" });
    expect(
      screen.getByRole("button", { name: "Confirm documents relayed" }),
    ).toBeInTheDocument();
  });

  it("renders 'Confirm introduction made' for engaged + network_path", () => {
    renderBar({ status: "engaged", kind: "network_path" });
    expect(
      screen.getByRole("button", { name: "Confirm introduction made" }),
    ).toBeInTheDocument();
  });

  it("renders 'Mark as under review' for relayed", () => {
    renderBar({ status: "relayed" });
    expect(
      screen.getByRole("button", { name: "Mark as under review" }),
    ).toBeInTheDocument();
  });

  it("renders 'Commit to apply' for in_review", () => {
    renderBar({
      status: "in_review",
      hasTargetCompany: true,
      companyName: "Acme",
    });
    expect(
      screen.getByRole("button", { name: "Commit to apply" }),
    ).toBeInTheDocument();
  });

  it("renders 'Revive' for stale", () => {
    renderBar({ status: "stale" });
    expect(
      screen.getByRole("button", { name: "Revive" }),
    ).toBeInTheDocument();
  });

  it("renders NO forward action for converted", () => {
    renderBar({ status: "converted" });
    // None of the forward-action labels should be present
    expect(screen.queryByRole("button", { name: "Commit to apply" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revive" })).not.toBeInTheDocument();
  });

  it("renders NO forward action for declined", () => {
    renderBar({ status: "declined" });
    expect(screen.queryByRole("button", { name: /commit|revive|review/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: engage/relay do NOT render at wrong statuses (unmounted)
// ---------------------------------------------------------------------------

describe("ReferralActionBar — illegal actions unmounted", () => {
  it("does NOT render 'Send your documents' when status='relayed'", () => {
    renderBar({ status: "relayed", kind: "insider_relay" });
    expect(screen.queryByRole("button", { name: "Send your documents" })).not.toBeInTheDocument();
  });

  it("does NOT render 'Mark as under review' when status='open'", () => {
    renderBar({ status: "open" });
    expect(screen.queryByRole("button", { name: "Mark as under review" })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: commitToApply — blocked (aria-disabled) when !hasTargetCompany
// ---------------------------------------------------------------------------

describe("ReferralActionBar — commitToApply blocked", () => {
  it("renders 'Commit to apply' with aria-disabled='true' when hasTargetCompany=false", () => {
    renderBar({ status: "in_review", hasTargetCompany: false });
    const btn = screen.getByText("Commit to apply").closest("button");
    expect(btn).not.toBeNull();
    expect(btn).toHaveAttribute("aria-disabled", "true");
  });

  it("does NOT use the HTML `disabled` attribute on the blocked commit button", () => {
    renderBar({ status: "in_review", hasTargetCompany: false });
    const btn = screen.getByText("Commit to apply").closest("button");
    expect(btn).not.toBeDisabled();
  });

  it("links to an sr-only explanation via aria-describedby", () => {
    renderBar({ status: "in_review", hasTargetCompany: false });
    const btn = screen.getByText("Commit to apply").closest("button")!;
    const describedById = btn.getAttribute("aria-describedby");
    expect(describedById).toBeTruthy();
    // The referenced element contains the explanation text
    const explanation = document.getElementById(describedById!);
    expect(explanation).not.toBeNull();
    expect(explanation!.textContent).toContain("Set a target company first");
  });

  it("does NOT call onAction when the blocked commit button is clicked", async () => {
    const onAction = jest.fn();
    renderBar({ status: "in_review", hasTargetCompany: false, onAction });
    const btn = screen.getByText("Commit to apply").closest("button")!;
    await userEvent.click(btn);
    expect(onAction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Suite: commitToApply — AlertDialog when hasTargetCompany=true
// ---------------------------------------------------------------------------

describe("ReferralActionBar — commitToApply with company", () => {
  it("renders the commit button without aria-disabled when hasTargetCompany=true", () => {
    renderBar({
      status: "in_review",
      hasTargetCompany: true,
      companyName: "Acme Corp",
    });
    const btn = screen.getByRole("button", { name: "Commit to apply" });
    expect(btn).not.toHaveAttribute("aria-disabled");
  });

  it("opens an AlertDialog with correct title when the commit button is clicked", async () => {
    renderBar({
      status: "in_review",
      hasTargetCompany: true,
      companyName: "Acme Corp",
    });
    const btn = screen.getByRole("button", { name: "Commit to apply" });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(
        screen.getByText("Create a job application?"),
      ).toBeInTheDocument();
    });
  });

  it("interpolates {company} in the dialog description", async () => {
    renderBar({
      status: "in_review",
      hasTargetCompany: true,
      companyName: "Acme Corp",
    });
    const btn = screen.getByRole("button", { name: "Commit to apply" });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(
        screen.getByText(/Acme Corp/),
      ).toBeInTheDocument();
    });
  });

  it("calls onAction('commit') when confirm button is clicked in the dialog", async () => {
    const onAction = jest.fn();
    renderBar({
      status: "in_review",
      hasTargetCompany: true,
      companyName: "Acme Corp",
      onAction,
    });
    const btn = screen.getByRole("button", { name: "Commit to apply" });
    await userEvent.click(btn);
    await waitFor(() => {
      expect(screen.getByText("Continue")).toBeInTheDocument();
    });
    await userEvent.click(screen.getByText("Continue"));
    expect(onAction).toHaveBeenCalledWith("commit");
  });
});

// ---------------------------------------------------------------------------
// Suite: decline button
// ---------------------------------------------------------------------------

describe("ReferralActionBar — decline button", () => {
  const workingStatuses: ReferralStatus[] = [
    "open",
    "engaged",
    "relayed",
    "in_review",
    "stale",
  ];

  for (const status of workingStatuses) {
    it(`renders decline button for status='${status}'`, () => {
      renderBar({ status });
      // The decline button might be inside a dialog trigger — look for any button with label "Decline"
      const declineButtons = screen.getAllByRole("button").filter(
        (el) => el.textContent?.includes("Decline"),
      );
      expect(declineButtons.length).toBeGreaterThan(0);
    });
  }

  it("does NOT render decline for converted", () => {
    renderBar({ status: "converted" });
    expect(
      screen.queryByRole("button", { name: /decline/i }),
    ).not.toBeInTheDocument();
  });

  it("does NOT render decline for declined", () => {
    renderBar({ status: "declined" });
    expect(
      screen.queryByRole("button", { name: /decline/i }),
    ).not.toBeInTheDocument();
  });

  it("opens decline AlertDialog with correct title on click", async () => {
    renderBar({ status: "open" });
    const declineBtn = screen.getAllByRole("button").find((el) =>
      el.textContent?.includes("Decline"),
    )!;
    await userEvent.click(declineBtn);
    await waitFor(() => {
      expect(
        screen.getByText("Decline this referral?"),
      ).toBeInTheDocument();
    });
  });

  it("calls onAction('decline') when decline dialog confirmed", async () => {
    const onAction = jest.fn();
    renderBar({ status: "open", onAction });
    const declineBtn = screen.getAllByRole("button").find((el) =>
      el.textContent?.includes("Decline"),
    )!;
    await userEvent.click(declineBtn);
    await waitFor(() => {
      expect(screen.getByText("Decline this referral?")).toBeInTheDocument();
    });
    // Find the Continue button in the dialog
    const confirmBtn = screen.getAllByText("Continue")[0];
    await userEvent.click(confirmBtn);
    expect(onAction).toHaveBeenCalledWith("decline");
  });
});

// ---------------------------------------------------------------------------
// Suite: no-confirm actions call onAction immediately
// ---------------------------------------------------------------------------

describe("ReferralActionBar — no-confirm actions", () => {
  it("calls onAction('engage') immediately when clicking engage at open", async () => {
    const onAction = jest.fn();
    renderBar({ status: "open", kind: "insider_relay", onAction });
    await userEvent.click(
      screen.getByRole("button", { name: "Send your documents" }),
    );
    expect(onAction).toHaveBeenCalledWith("engage");
  });

  it("calls onAction('relay') immediately when clicking relay at engaged", async () => {
    const onAction = jest.fn();
    renderBar({ status: "engaged", kind: "insider_relay", onAction });
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm documents relayed" }),
    );
    expect(onAction).toHaveBeenCalledWith("relay");
  });

  it("calls onAction('review') immediately when clicking review at relayed", async () => {
    const onAction = jest.fn();
    renderBar({ status: "relayed", onAction });
    await userEvent.click(
      screen.getByRole("button", { name: "Mark as under review" }),
    );
    expect(onAction).toHaveBeenCalledWith("review");
  });

  it("calls onAction('revive') immediately when clicking revive at stale", async () => {
    const onAction = jest.fn();
    renderBar({ status: "stale", onAction });
    await userEvent.click(screen.getByRole("button", { name: "Revive" }));
    expect(onAction).toHaveBeenCalledWith("revive");
  });
});

// ---------------------------------------------------------------------------
// Suite: busy state
// ---------------------------------------------------------------------------

describe("ReferralActionBar — busy state", () => {
  it("sets aria-busy='true' on the group when busy=true", () => {
    renderBar({ status: "open", busy: true });
    const group = screen.getByRole("group");
    expect(group).toHaveAttribute("aria-busy", "true");
  });

  it("does NOT set aria-busy when busy=false", () => {
    renderBar({ status: "open", busy: false });
    const group = screen.getByRole("group");
    expect(group).not.toHaveAttribute("aria-busy", "true");
  });

  it("renders the Loader2 spinner in the active button when busy=true", () => {
    renderBar({ status: "open", kind: "insider_relay", busy: true });
    expect(screen.getByTestId("icon-loader2")).toBeInTheDocument();
  });

  it("disables the forward-action button when busy=true", () => {
    renderBar({ status: "open", kind: "insider_relay", busy: true });
    const btn = screen.getByRole("button", { name: /send your documents/i });
    expect(btn).toBeDisabled();
  });
});
