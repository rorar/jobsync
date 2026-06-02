/**
 * JobContactPicker.spec.tsx — Component Tests (Welle 3 Phase 1, Task 1.1)
 *
 * Tests the Point-of-Contact person picker used in the Add Job dialog:
 *   - Renders placeholder when no value is set
 *   - Renders the selected person's label when a value is provided
 *   - role="combobox" trigger; disabled state
 *   - Opens, lists persons, selecting calls onValueChange(personId)
 *   - Clear item (shown only when a value is set) calls onValueChange("")
 *   - Manual filter (shouldFilter=false) narrows the list by search
 *
 * Mirrors the CountrySelect.spec harness (cmdk Command + props-based options).
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.selectContact": "Select contact...",
        "crm.searchContacts": "Search contacts...",
        "crm.noContactsFound": "No contacts found",
        "crm.contactSelected": "Contact selected",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

import { JobContactPicker } from "@/components/myjobs/JobContactPicker";
import type { PersonOption } from "@/components/myjobs/JobContactPicker";

const PERSONS: PersonOption[] = [
  { id: "p1", label: "Jane Doe — jane@acme.com" },
  { id: "p2", label: "John Smith — john@globex.com" },
  { id: "p3", label: "Alice Müller" },
];

describe("JobContactPicker", () => {
  it("renders the placeholder when no value is set", () => {
    render(<JobContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    expect(screen.getByText("Select contact...")).toBeInTheDocument();
  });

  it("renders the selected person's label when a value is provided", () => {
    render(<JobContactPicker value="p1" onValueChange={jest.fn()} persons={PERSONS} />);
    expect(screen.getByText("Jane Doe — jane@acme.com")).toBeInTheDocument();
  });

  it("renders a combobox trigger", () => {
    render(<JobContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    render(<JobContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("opens the dropdown and lists persons", async () => {
    const user = userEvent.setup();
    render(<JobContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Jane Doe — jane@acme.com")).toBeInTheDocument();
    expect(screen.getByText("John Smith — john@globex.com")).toBeInTheDocument();
  });

  it("calls onValueChange with the person id when an item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<JobContactPicker value="" onValueChange={handleChange} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getAllByText("John Smith — john@globex.com")[0]);
    expect(handleChange).toHaveBeenCalledWith("p2");
  });

  it("shows a clear item only when a value is set, calling onValueChange('')", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<JobContactPicker value="p1" onValueChange={handleChange} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    const clearItems = screen.getAllByText(/Select contact\.\.\./);
    await user.click(clearItems[0]);
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("filters the list by the search input (manual filter)", async () => {
    const user = userEvent.setup();
    render(<JobContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search contacts..."), "globex");
    expect(screen.getByText("John Smith — john@globex.com")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe — jane@acme.com")).not.toBeInTheDocument();
  });
});
