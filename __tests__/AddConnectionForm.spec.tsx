/**
 * AddConnectionForm Component Tests
 *
 * Encodes §H (design/inside-track-ui.md) + surface TipCapture rule
 * AddPersonConnection (specs/inside-track.allium):
 *   - Renders toPerson ContactPicker
 *   - Renders all 6 CONNECTION_KINDS in the kind Select
 *   - Renders all 3 CONNECTION_STRENGTHS in the strength Select
 *   - Blocks submit without toPerson selected
 *   - Submit payload shape: { toPersonId, kind, strength }
 *   - onCancel fires
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// i18n mock
// ---------------------------------------------------------------------------

const dict: Record<string, string> = {
  "insideTrack.addConnection.title": "Add connection",
  "insideTrack.addConnection.fromLabel": "Connect",
  "insideTrack.addConnection.toLabel": "to",
  "insideTrack.addConnection.personPlaceholder": "Search contacts…",
  "insideTrack.addConnection.kindLabel": "Relationship",
  "insideTrack.addConnection.strengthLabel": "Strength",
  "insideTrack.addConnection.submit": "Add connection",
  "insideTrack.addConnection.cancel": "Cancel",
  "insideTrack.connectionKind.former_colleague": "Former colleague",
  "insideTrack.connectionKind.friend": "Friend",
  "insideTrack.connectionKind.acquaintance": "Acquaintance",
  "insideTrack.connectionKind.mentor": "Mentor",
  "insideTrack.connectionKind.family": "Family",
  "insideTrack.connectionKind.other": "Other",
  "insideTrack.connectionStrength.close": "Close",
  "insideTrack.connectionStrength.medium": "Medium",
  "insideTrack.connectionStrength.weak": "Weak",
  // Validation
  "insideTrack.addConnection.toPersonRequired": "Please select a contact to connect to.",
  "insideTrack.addConnection.kindRequired": "Please select a relationship type.",
  "insideTrack.addConnection.strengthRequired": "Please select a strength.",
  // ContactPicker internals
  "crm.selectContact": "Select contact",
  "crm.searchContacts": "Search contacts",
  "crm.noContactsFound": "No contacts found",
  "crm.contactSelected": "selected",
};

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => dict[key] ?? key,
    locale: "en",
  })),
}));

// ---------------------------------------------------------------------------
// Lucide icons — minimal stubs
// ---------------------------------------------------------------------------

jest.mock("lucide-react", () => ({
  ChevronsUpDown: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-chevrons-up-down" {...props} />
  ),
  Check: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-check" {...props} />
  ),
  Loader2: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-loader2" {...props} />
  ),
  ChevronDown: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-chevron-down" {...props} />
  ),
  ChevronUp: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-chevron-up" {...props} />
  ),
  Circle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-circle" {...props} />
  ),
  // CommandInput uses Search from lucide-react
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-search" {...props} />
  ),
}));

// cmdk scrollIntoView stub + Radix pointer-capture stubs (Radix Select uses these)
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  // Radix Select triggers call setPointerCapture/releasePointerCapture
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  HTMLElement.prototype.hasPointerCapture = jest.fn(() => false);
});

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { AddConnectionForm } from "@/components/inside-track/AddConnectionForm";
import type { PersonOption } from "@/components/crm/ContactPicker";
import { CONNECTION_KINDS, CONNECTION_STRENGTHS } from "@/models/insideTrack.model";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PERSONS: PersonOption[] = [
  {
    id: "person-1",
    name: "Alice Smith",
    secondary: "Engineer · Acme Corp",
    searchText: "alice smith engineer acme corp",
  },
  {
    id: "person-2",
    name: "Bob Jones",
    secondary: "bob@example.com",
    searchText: "bob jones bob@example.com",
  },
];

const FROM_PERSON_ID = "person-1";

function renderForm(
  overrides: Partial<{
    onSubmit: jest.Mock;
    onCancel: jest.Mock;
    persons: PersonOption[];
    fromPersonId: string;
  }> = {},
) {
  const onSubmit = overrides.onSubmit ?? jest.fn();
  const onCancel = overrides.onCancel ?? jest.fn();
  const persons = overrides.persons ?? PERSONS;
  const fromPersonId = overrides.fromPersonId ?? FROM_PERSON_ID;

  render(
    <AddConnectionForm
      persons={persons}
      fromPersonId={fromPersonId}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );

  return { onSubmit, onCancel };
}

// ---------------------------------------------------------------------------
// Suite: rendering
// ---------------------------------------------------------------------------

describe("AddConnectionForm — rendering", () => {
  it("renders the toPerson ContactPicker (comboboxes present)", () => {
    renderForm();
    // There are multiple comboboxes: the ContactPicker button + the 2 Radix Select triggers
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
  });

  it("renders submit and cancel buttons", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /add connection/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });

  it("renders Relationship label (the <label> element)", () => {
    renderForm();
    // The label element has id=connection-kind-label
    expect(document.getElementById("connection-kind-label")).toBeInTheDocument();
    expect(document.getElementById("connection-kind-label")?.textContent).toBe("Relationship");
  });

  it("renders Strength label (the <label> element)", () => {
    renderForm();
    expect(document.getElementById("connection-strength-label")).toBeInTheDocument();
    expect(document.getElementById("connection-strength-label")?.textContent).toBe("Strength");
  });
});

// ---------------------------------------------------------------------------
// Suite: CONNECTION_KINDS options in the kind select
// ---------------------------------------------------------------------------

describe("AddConnectionForm — kind select has all 6 CONNECTION_KINDS", () => {
  it("lists all 6 connection kinds when the kind select is opened", async () => {
    renderForm();

    // The Radix Select trigger for kind has id="connection-kind-trigger"
    const kindTrigger = document.getElementById("connection-kind-trigger");
    expect(kindTrigger).toBeInTheDocument();
    await userEvent.click(kindTrigger!);

    // All 6 kinds should be in the document as options
    for (const kind of CONNECTION_KINDS) {
      expect(
        screen.getByRole("option", { name: dict[`insideTrack.connectionKind.${kind}`] }),
      ).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite: CONNECTION_STRENGTHS options in the strength select
// ---------------------------------------------------------------------------

describe("AddConnectionForm — strength select has all 3 CONNECTION_STRENGTHS", () => {
  it("lists all 3 connection strengths when the strength select is opened", async () => {
    renderForm();

    // The Radix Select trigger for strength has id="connection-strength-trigger"
    const strengthTrigger = document.getElementById("connection-strength-trigger");
    expect(strengthTrigger).toBeInTheDocument();
    await userEvent.click(strengthTrigger!);

    for (const strength of CONNECTION_STRENGTHS) {
      expect(
        screen.getByRole("option", { name: dict[`insideTrack.connectionStrength.${strength}`] }),
      ).toBeInTheDocument();
    }
  });
});

// ---------------------------------------------------------------------------
// Suite: validation — no submit without toPerson
// ---------------------------------------------------------------------------

describe("AddConnectionForm — validation (no toPerson)", () => {
  it("does not call onSubmit when no toPerson is selected", async () => {
    const { onSubmit } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: /add connection/i }));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows toPersonRequired error when submitted without toPerson", async () => {
    renderForm();
    await userEvent.click(screen.getByRole("button", { name: /add connection/i }));
    await waitFor(() => {
      expect(
        screen.getByText(/Please select a contact to connect to\./i),
      ).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: submit payload shape
// ---------------------------------------------------------------------------

describe("AddConnectionForm — submit payload", () => {
  it("calls onSubmit with { toPersonId, kind, strength } on valid submit", async () => {
    const { onSubmit } = renderForm();

    // The ContactPicker (to person) is a button with aria-label="to"
    // (ariaLabelKey = "insideTrack.addConnection.toLabel" → "to")
    const toPersonBtn = screen.getByRole("combobox", { name: /^to$/i });
    await userEvent.click(toPersonBtn);
    const bobOption = await screen.findByText("Bob Jones");
    await userEvent.click(bobOption);

    // Select kind using the trigger id
    const kindTrigger = document.getElementById("connection-kind-trigger")!;
    await userEvent.click(kindTrigger);
    const friendOption = await screen.findByRole("option", { name: /friend/i });
    await userEvent.click(friendOption);

    // Select strength using the trigger id
    const strengthTrigger = document.getElementById("connection-strength-trigger")!;
    await userEvent.click(strengthTrigger);
    const closeOption = await screen.findByRole("option", { name: /close/i });
    await userEvent.click(closeOption);

    await userEvent.click(screen.getByRole("button", { name: /add connection/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.toPersonId).toBe("person-2");
      expect(payload.kind).toBe("friend");
      expect(payload.strength).toBe("close");
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: cancel button
// ---------------------------------------------------------------------------

describe("AddConnectionForm — cancel", () => {
  it("calls onCancel when cancel is clicked", async () => {
    const { onCancel } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
