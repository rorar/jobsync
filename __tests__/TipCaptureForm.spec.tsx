/**
 * TipCaptureForm Component Tests
 *
 * Encodes §G item 4 + §H (design/inside-track-ui.md) + surface TipCapture
 * (specs/inside-track.allium):
 *   - Default kind = insider_relay
 *   - Selecting network_path reveals insider ContactPicker (DOM-absent for insider_relay)
 *   - Reveal is announced via role=status aria-live region
 *   - No submit without tipster (tipsterRequired error shown)
 *   - Submit payload shape: { kind, tipsterId } for insider_relay
 *   - Submit payload shape: { kind, tipsterId, insiderId? } for network_path
 *   - fieldset + legend for kind (RadioGroup, not tabs)
 *   - Conditional fields REMOVED from DOM (not CSS-hidden) when insider_relay
 */

import "@testing-library/jest-dom";
import React from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// i18n mock (pattern from RunStatusBadge.spec.tsx)
// ---------------------------------------------------------------------------

const dict: Record<string, string> = {
  "insideTrack.tipCapture.kindLabel": "Tip type",
  "insideTrack.tipCapture.tipsterLabel": "Tipster",
  "insideTrack.tipCapture.tipsterPlaceholder": "Search contacts…",
  "insideTrack.tipCapture.insiderLabel": "Insider",
  "insideTrack.tipCapture.insiderPlaceholder": "Search contacts…",
  "insideTrack.tipCapture.submit": "Record tip",
  "insideTrack.tipCapture.cancel": "Cancel",
  "insideTrack.tipCapture.kindHint.insider_relay": "This person works at the target company",
  "insideTrack.tipCapture.kindHint.network_path": "This person knows someone at the company",
  "insideTrack.tipCapture.insiderRelayFieldsAppeared": "Insider relay selected.",
  "insideTrack.tipCapture.networkPathFieldsAppeared":
    "Network path selected. Insider and Via fields are now available.",
  "insideTrack.tipCapture.requiredLegend": "Fields marked with an asterisk are required.",
  "insideTrack.tipCapture.optionalSuffix": "(optional)",
  "insideTrack.tipCapture.tipsterRequired": "Please select a contact for the tipster.",
  "insideTrack.tipCapture.companyLabel": "Target company",
  "insideTrack.tipCapture.companyPlaceholder": "Optional",
  "insideTrack.tipCapture.companySearchPlaceholder": "Search companies…",
  "insideTrack.tipCapture.companyNoneFound": "No companies found",
  "insideTrack.kind.insider_relay": "Insider relay",
  "insideTrack.kind.network_path": "Network path",
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
  Circle: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-circle" {...props} />
  ),
  // CommandInput uses Search from lucide-react
  Search: (props: React.SVGProps<SVGSVGElement>) => (
    <svg data-testid="icon-search" {...props} />
  ),
}));

// cmdk scrollIntoView stub (ContactPicker uses Command / cmdk)
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
});

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { TipCaptureForm } from "@/components/inside-track/TipCaptureForm";
import type { PersonOption } from "@/components/crm/ContactPicker";

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(
  overrides: Partial<{
    onSubmit: jest.Mock;
    onCancel: jest.Mock;
    persons: PersonOption[];
    loadingPersons: boolean;
  }> = {},
) {
  const onSubmit = overrides.onSubmit ?? jest.fn();
  const onCancel = overrides.onCancel ?? jest.fn();
  const persons = overrides.persons ?? PERSONS;
  const loadingPersons = overrides.loadingPersons ?? false;

  render(
    <TipCaptureForm
      persons={persons}
      loadingPersons={loadingPersons}
      onSubmit={onSubmit}
      onCancel={onCancel}
    />,
  );

  return { onSubmit, onCancel };
}

// ---------------------------------------------------------------------------
// Suite: default rendering
// ---------------------------------------------------------------------------

describe("TipCaptureForm — default rendering", () => {
  it("renders a fieldset with a legend for the kind RadioGroup", () => {
    renderForm();
    const fieldset = screen.getByRole("group", { name: /tip type/i });
    expect(fieldset.tagName).toBe("FIELDSET");
  });

  it("defaults to insider_relay kind", () => {
    renderForm();
    const insiderRelayRadio = screen.getByRole("radio", { name: /insider relay/i });
    expect(insiderRelayRadio).toBeChecked();
  });

  it("renders network_path radio option", () => {
    renderForm();
    expect(screen.getByRole("radio", { name: /network path/i })).toBeInTheDocument();
  });

  it("renders a tipster ContactPicker", () => {
    renderForm();
    // The trigger has role=combobox per ContactPicker impl
    expect(screen.getAllByRole("combobox").length).toBeGreaterThanOrEqual(1);
  });

  it("renders submit and cancel buttons", () => {
    renderForm();
    expect(screen.getByRole("button", { name: /record tip/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: conditional insider field
// ---------------------------------------------------------------------------

describe("TipCaptureForm — conditional insider field", () => {
  it("does NOT render insider ContactPicker in DOM when kind=insider_relay (default)", () => {
    renderForm();
    // The insider field must be absent from the DOM, not just hidden. (Identify it
    // by accessible name — tipster + target-company comboboxes are always present.)
    expect(screen.queryByRole("combobox", { name: /insider/i })).not.toBeInTheDocument();
  });

  it("reveals insider ContactPicker when network_path is selected", async () => {
    renderForm();
    const networkPathRadio = screen.getByRole("radio", { name: /network path/i });
    await userEvent.click(networkPathRadio);
    expect(screen.getByRole("combobox", { name: /insider/i })).toBeInTheDocument();
  });

  it("removes the insider ContactPicker from DOM when switching back to insider_relay", async () => {
    renderForm();
    const networkPathRadio = screen.getByRole("radio", { name: /network path/i });
    const insiderRelayRadio = screen.getByRole("radio", { name: /insider relay/i });
    await userEvent.click(networkPathRadio);
    expect(screen.getByRole("combobox", { name: /insider/i })).toBeInTheDocument();
    // switch back — insider picker gone from DOM
    await userEvent.click(insiderRelayRadio);
    expect(screen.queryByRole("combobox", { name: /insider/i })).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// Suite: aria-live reveal announcement
// ---------------------------------------------------------------------------

describe("TipCaptureForm — aria-live announce on kind change", () => {
  it("has a role=status aria-live region", () => {
    renderForm();
    // At least one status region exists (may also come from ContactPicker)
    const regions = screen.getAllByRole("status");
    expect(regions.length).toBeGreaterThanOrEqual(1);
  });

  it("announces network_path reveal when selecting network_path", async () => {
    renderForm();
    const networkPathRadio = screen.getByRole("radio", { name: /network path/i });
    await userEvent.click(networkPathRadio);
    await waitFor(() => {
      expect(
        screen.getByText(/Network path selected\. Insider and Via fields are now available\./i),
      ).toBeInTheDocument();
    });
  });

  it("announces insider_relay when switching back from network_path", async () => {
    renderForm();
    const networkPathRadio = screen.getByRole("radio", { name: /network path/i });
    await userEvent.click(networkPathRadio);
    const insiderRelayRadio = screen.getByRole("radio", { name: /insider relay/i });
    await userEvent.click(insiderRelayRadio);
    await waitFor(() => {
      expect(screen.getByText(/Insider relay selected\./i)).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: validation — no submit without tipster
// ---------------------------------------------------------------------------

describe("TipCaptureForm — validation", () => {
  it("does not call onSubmit when no tipster is selected", async () => {
    const { onSubmit } = renderForm();
    const submitBtn = screen.getByRole("button", { name: /record tip/i });
    await userEvent.click(submitBtn);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows tipsterRequired error when submitted without tipster", async () => {
    renderForm();
    const submitBtn = screen.getByRole("button", { name: /record tip/i });
    await userEvent.click(submitBtn);
    await waitFor(() => {
      expect(
        screen.getByText(/Please select a contact for the tipster\./i),
      ).toBeInTheDocument();
    });
  });

  it("clears tipsterRequired error once tipster is selected", async () => {
    renderForm();
    // trigger the error first
    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));
    await waitFor(() =>
      expect(screen.getByText(/Please select a contact for the tipster\./i)).toBeInTheDocument(),
    );
    // open tipster picker and select someone
    const [tipsterCombobox] = screen.getAllByRole("combobox");
    await userEvent.click(tipsterCombobox);
    const aliceOption = await screen.findByText("Alice Smith");
    await userEvent.click(aliceOption);
    await waitFor(() =>
      expect(
        screen.queryByText(/Please select a contact for the tipster\./i),
      ).not.toBeInTheDocument(),
    );
  });
});

// ---------------------------------------------------------------------------
// Suite: submit payload — insider_relay
// ---------------------------------------------------------------------------

describe("TipCaptureForm — submit payload (insider_relay)", () => {
  it("calls onSubmit with kind=insider_relay and tipsterId", async () => {
    const { onSubmit } = renderForm();

    // Select tipster
    const [tipsterCombobox] = screen.getAllByRole("combobox");
    await userEvent.click(tipsterCombobox);
    const aliceOption = await screen.findByText("Alice Smith");
    await userEvent.click(aliceOption);

    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.kind).toBe("insider_relay");
      expect(payload.tipsterId).toBe("person-1");
      expect(payload.insiderId).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: submit payload — network_path (with optional insider)
// ---------------------------------------------------------------------------

describe("TipCaptureForm — submit payload (network_path)", () => {
  it("calls onSubmit with kind=network_path and tipsterId when insider not selected", async () => {
    const { onSubmit } = renderForm();

    // Switch to network_path
    await userEvent.click(screen.getByRole("radio", { name: /network path/i }));

    // Select tipster (first combobox)
    const [tipsterCombobox] = screen.getAllByRole("combobox");
    await userEvent.click(tipsterCombobox);
    const aliceOption = await screen.findByText("Alice Smith");
    await userEvent.click(aliceOption);

    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.kind).toBe("network_path");
      expect(payload.tipsterId).toBe("person-1");
      // insiderId is optional — may be undefined or absent
      expect(payload.insiderId == null || typeof payload.insiderId === "undefined").toBe(true);
    });
  });

  it("includes insiderId when an insider is selected in network_path mode", async () => {
    const { onSubmit } = renderForm();

    // Switch to network_path
    await userEvent.click(screen.getByRole("radio", { name: /network path/i }));

    // Three comboboxes now: [tipster, insider, target-company]
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes).toHaveLength(3);

    // Select tipster (first)
    await userEvent.click(comboboxes[0]);
    const aliceOption = await screen.findByText("Alice Smith");
    await userEvent.click(aliceOption);

    // Select insider (second)
    const updatedComboboxes = screen.getAllByRole("combobox");
    await userEvent.click(updatedComboboxes[1]);
    const bobOption = await screen.findByText("Bob Jones");
    await userEvent.click(bobOption);

    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      const payload = onSubmit.mock.calls[0][0];
      expect(payload.kind).toBe("network_path");
      expect(payload.tipsterId).toBe("person-1");
      expect(payload.insiderId).toBe("person-2");
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: target company (optional) — enables CommitToApply -> reify Job
// ---------------------------------------------------------------------------

describe("TipCaptureForm — target company", () => {
  it("includes targetCompanyId in the payload when a company is selected", async () => {
    const onSubmit = jest.fn();
    render(
      <TipCaptureForm
        persons={PERSONS}
        companies={[{ id: "co-1", label: "Acme Corp" }]}
        onSubmit={onSubmit}
      />,
    );

    // tipster (required)
    await userEvent.click(screen.getByRole("combobox", { name: /tipster/i }));
    await userEvent.click(await screen.findByText("Alice Smith"));

    // target company (optional)
    await userEvent.click(screen.getByRole("combobox", { name: /target company/i }));
    await userEvent.click(await screen.findByText("Acme Corp"));

    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].targetCompanyId).toBe("co-1");
    });
  });

  it("omits targetCompanyId when no company is selected", async () => {
    const onSubmit = jest.fn();
    render(<TipCaptureForm persons={PERSONS} onSubmit={onSubmit} />);
    await userEvent.click(screen.getByRole("combobox", { name: /tipster/i }));
    await userEvent.click(await screen.findByText("Alice Smith"));
    await userEvent.click(screen.getByRole("button", { name: /record tip/i }));
    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledTimes(1);
      expect(onSubmit.mock.calls[0][0].targetCompanyId).toBeUndefined();
    });
  });
});

// ---------------------------------------------------------------------------
// Suite: cancel button
// ---------------------------------------------------------------------------

describe("TipCaptureForm — cancel", () => {
  it("calls onCancel when cancel is clicked", async () => {
    const { onCancel } = renderForm();
    await userEvent.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
