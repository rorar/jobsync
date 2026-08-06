/**
 * CompanyPicker.spec.tsx — Component Tests (inline company create)
 *
 * Covers the additive `onCreate` capability added so PersonForm can link a
 * contact to a real Company without leaving the form:
 *   - Select-existing behaviour is unchanged (regression guard for the
 *     Inside-Track consumer, TipCaptureForm, which passes no `onCreate`)
 *   - The create item appears ONLY when `onCreate` is supplied, the query is
 *     non-empty, and nothing matches it (case-insensitively)
 *   - Selecting it calls onCreate, then onValueChange with the new id
 *   - A failed create keeps the popover open and does not select anything
 *   - No double-submit while a create is in flight
 *
 * Mirrors the ContactPicker.spec harness (cmdk Command + props-based options).
 * Spec: .full-stack-feature/03-architecture.md §2.1
 */

import React from "react";
import "@testing-library/jest-dom";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    // Project idiom: t(key) returns the raw string; callers interpolate via
    // .replace("{label}", value) — see src/components/ComboBox.tsx:66.
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.selectCompany": "Select company...",
        "crm.searchCompanies": "Search companies...",
        "crm.noCompaniesFound": "No companies found",
        "crm.createCompany": 'Create "{label}"',
        "crm.creatingCompany": "Creating...",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

import { CompanyPicker } from "@/components/crm/CompanyPicker";
import type { CompanyOption } from "@/components/crm/CompanyPicker";

const COMPANIES: CompanyOption[] = [
  { id: "c1", label: "Acme Corp" },
  { id: "c2", label: "Beispiel GmbH" },
];

const baseProps = {
  value: "",
  companies: COMPANIES,
  placeholderKey: "crm.selectCompany",
  ariaLabelKey: "crm.selectCompany",
  searchPlaceholderKey: "crm.searchCompanies",
  emptyKey: "crm.noCompaniesFound",
};

async function openPicker() {
  await userEvent.click(screen.getByRole("combobox"));
}

describe("CompanyPicker — select existing (regression guard)", () => {
  it("renders the placeholder when nothing is selected", () => {
    render(<CompanyPicker {...baseProps} onValueChange={jest.fn()} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Select company...");
  });

  it("selects an existing company by id", async () => {
    const onValueChange = jest.fn();
    render(<CompanyPicker {...baseProps} onValueChange={onValueChange} />);

    await openPicker();
    await userEvent.click(screen.getByText("Acme Corp"));

    expect(onValueChange).toHaveBeenCalledWith("c1");
  });

  it("does NOT offer a create item when onCreate is omitted", async () => {
    render(<CompanyPicker {...baseProps} onValueChange={jest.fn()} />);

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "Unknown Ltd",
    );

    expect(screen.queryByText(/^Create "/)).not.toBeInTheDocument();
    expect(screen.getByText("No companies found")).toBeInTheDocument();
  });
});

describe("CompanyPicker — inline create", () => {
  it("offers a create item for an unmatched query", async () => {
    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={jest.fn()}
        onCreate={jest.fn()}
      />,
    );

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "Unknown Ltd",
    );

    expect(screen.getByText('Create "Unknown Ltd"')).toBeInTheDocument();
  });

  it("does not offer a create item for an empty query", async () => {
    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={jest.fn()}
        onCreate={jest.fn()}
      />,
    );

    await openPicker();

    expect(screen.queryByText(/^Create "/)).not.toBeInTheDocument();
  });

  it("does not offer a create item when the query matches an existing company case-insensitively", async () => {
    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={jest.fn()}
        onCreate={jest.fn()}
      />,
    );

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "acme corp",
    );

    expect(screen.queryByText(/^Create "/)).not.toBeInTheDocument();
  });

  it("calls onCreate with the trimmed query and selects the created company", async () => {
    const onCreate = jest
      .fn()
      .mockResolvedValue({ id: "c-new", label: "Unknown Ltd" });
    const onValueChange = jest.fn();

    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={onValueChange}
        onCreate={onCreate}
      />,
    );

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "  Unknown Ltd  ",
    );
    await userEvent.click(screen.getByText(/^Create "/));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith("Unknown Ltd"));
    await waitFor(() => expect(onValueChange).toHaveBeenCalledWith("c-new"));
  });

  it("keeps the popover open and selects nothing when the create fails", async () => {
    const onCreate = jest.fn().mockResolvedValue(null);
    const onValueChange = jest.fn();

    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={onValueChange}
        onCreate={onCreate}
      />,
    );

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "Broken Ltd",
    );
    await userEvent.click(screen.getByText(/^Create "/));

    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(onValueChange).not.toHaveBeenCalled();
    expect(
      screen.getByPlaceholderText("Search companies..."),
    ).toBeInTheDocument();
  });

  it("does not fire a second create while one is in flight", async () => {
    let resolveCreate: (v: CompanyOption) => void = () => {};
    const onCreate = jest.fn().mockImplementation(
      () =>
        new Promise<CompanyOption>((resolve) => {
          resolveCreate = resolve;
        }),
    );

    render(
      <CompanyPicker
        {...baseProps}
        onValueChange={jest.fn()}
        onCreate={onCreate}
      />,
    );

    await openPicker();
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "Slow Ltd",
    );

    const createItem = screen.getByText(/^Create "|^Creating\.\.\./);
    await userEvent.click(createItem);
    await userEvent.click(createItem);

    expect(onCreate).toHaveBeenCalledTimes(1);

    // Settle the in-flight promise inside act() so the trailing setState does
    // not land after the test ends (React "not wrapped in act" warning).
    await act(async () => {
      resolveCreate({ id: "c-slow", label: "Slow Ltd" });
    });
  });
});
