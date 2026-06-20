/**
 * ContactPicker.spec.tsx — Component Tests (Welle 3 — two-tier picker)
 *
 * Tests the Point-of-Contact person picker used in the Add Job dialog:
 *   - Renders placeholder when no value is set
 *   - Renders the selected person's NAME (primary line) when a value is provided
 *   - role="combobox" trigger; disabled state
 *   - Opens, lists persons as two-tier items (name + muted secondary), selecting
 *     calls onValueChange(personId)
 *   - Clear item (shown only when a value is set) calls onValueChange("")
 *   - Wide manual filter (shouldFilter=false) narrows by name+email+company+role
 *   - Secondary line is omitted entirely when empty (no stray muted line)
 *   - toPersonOption() builds the two-tier shape from a raw Person (edge cases)
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

import {
  ContactPicker,
  toPersonOption,
} from "@/components/crm/ContactPicker";
import type { PersonOption } from "@/components/crm/ContactPicker";

const PERSONS: PersonOption[] = [
  {
    id: "p1",
    name: "Jane Doe",
    secondary: "Recruiter · Acme Corp",
    searchText: "jane doe jane@acme.com acme corp recruiter",
  },
  {
    id: "p2",
    name: "John Smith",
    secondary: "john@globex.com",
    searchText: "john smith john@globex.com",
  },
  { id: "p3", name: "Alice Müller", secondary: "", searchText: "alice müller" },
];

describe("ContactPicker", () => {
  it("renders the placeholder when no value is set", () => {
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    expect(screen.getByText("Select contact...")).toBeInTheDocument();
  });

  it("renders the selected person's name (primary line) when a value is provided", () => {
    render(<ContactPicker value="p1" onValueChange={jest.fn()} persons={PERSONS} />);
    // Trigger shows the NAME only — never the muted secondary line.
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("Recruiter · Acme Corp")).not.toBeInTheDocument();
  });

  it("renders a combobox trigger", () => {
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("opens the dropdown and lists persons as two-tier items (name + secondary)", async () => {
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Recruiter · Acme Corp")).toBeInTheDocument();
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.getByText("john@globex.com")).toBeInTheDocument();
  });

  it("calls onValueChange with the person id when an item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={handleChange} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getAllByText("John Smith")[0]);
    expect(handleChange).toHaveBeenCalledWith("p2");
  });

  it("shows a clear item only when a value is set, calling onValueChange('')", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<ContactPicker value="p1" onValueChange={handleChange} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    const clearItems = screen.getAllByText(/Select contact\.\.\./);
    await user.click(clearItems[0]);
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("widens the filter: typing a company name matches even though it is the muted line", async () => {
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search contacts..."), "acme");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
    expect(screen.queryByText("Alice Müller")).not.toBeInTheDocument();
  });

  it("widens the filter: typing a role matches", async () => {
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search contacts..."), "recruiter");
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.queryByText("John Smith")).not.toBeInTheDocument();
  });

  it("widens the filter: typing an email matches", async () => {
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search contacts..."), "globex");
    expect(screen.getByText("John Smith")).toBeInTheDocument();
    expect(screen.queryByText("Jane Doe")).not.toBeInTheDocument();
  });

  it("omits the secondary line entirely when a person has no secondary identifier", async () => {
    const user = userEvent.setup();
    render(<ContactPicker value="" onValueChange={jest.fn()} persons={PERSONS} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search contacts..."), "alice");
    expect(screen.getByText("Alice Müller")).toBeInTheDocument();
    // No muted secondary span rendered for a name-only person.
    expect(screen.queryAllByTestId("contact-option-secondary")).toHaveLength(0);
  });
});

describe("toPersonOption", () => {
  const company = (over: Record<string, unknown> = {}) => [
    {
      companyId: "c1",
      companyLabel: "Acme Corp",
      position: "Recruiter" as string | null,
      isPrimary: true,
      ...over,
    },
  ];
  const email = (e = "jane@acme.com", isPrimary = true) => [
    { email: e, type: "work" as const, isPrimary },
  ];

  it("builds name + 'role · company' secondary when a company role exists (edge: role present)", () => {
    const opt = toPersonOption({
      id: "p1",
      firstName: "Jane",
      lastName: "Doe",
      emails: email(),
      companies: company(),
    });
    expect(opt.name).toBe("Jane Doe");
    expect(opt.secondary).toBe("Recruiter · Acme Corp");
    // searchText is lower-cased and covers all dimensions.
    expect(opt.searchText).toContain("jane doe");
    expect(opt.searchText).toContain("acme corp");
    expect(opt.searchText).toContain("recruiter");
    expect(opt.searchText).toContain("jane@acme.com");
  });

  it("edge 1: no company but an email → secondary is the primary email", () => {
    const opt = toPersonOption({
      id: "p2",
      firstName: "John",
      lastName: "Smith",
      emails: email("john@globex.com"),
      companies: null,
    });
    expect(opt.secondary).toBe("john@globex.com");
  });

  it("edge 2: company with null/empty role → secondary is the company label only (no '· null')", () => {
    const opt = toPersonOption({
      id: "p3",
      firstName: "Bob",
      lastName: "Lee",
      emails: null,
      companies: company({ position: null }),
    });
    expect(opt.secondary).toBe("Acme Corp");
    expect(opt.secondary).not.toContain("·");
  });

  it("edge 3: multiple companies → prefers isPrimary, else first-with-position, else first", () => {
    const companies = [
      { companyId: "c1", companyLabel: "First Co", position: null, isPrimary: false },
      { companyId: "c2", companyLabel: "Role Co", position: "Manager", isPrimary: false },
      { companyId: "c3", companyLabel: "Primary Co", position: "Lead", isPrimary: true },
    ];
    const opt = toPersonOption({
      id: "p4",
      firstName: "Mia",
      lastName: "Wu",
      emails: null,
      companies,
    });
    expect(opt.secondary).toBe("Lead · Primary Co");
  });

  it("edge 3b: multiple companies, none primary → first-with-position wins", () => {
    const companies = [
      { companyId: "c1", companyLabel: "First Co", position: null, isPrimary: false },
      { companyId: "c2", companyLabel: "Role Co", position: "Manager", isPrimary: false },
    ];
    const opt = toPersonOption({
      id: "p5",
      firstName: "Sam",
      lastName: "Ng",
      emails: null,
      companies,
    });
    expect(opt.secondary).toBe("Manager · Role Co");
  });

  it("edge 4: no email and no company → secondary is empty", () => {
    const opt = toPersonOption({
      id: "p6",
      firstName: "Alice",
      lastName: "Müller",
      emails: null,
      companies: null,
    });
    expect(opt.secondary).toBe("");
  });

  it("edge 6: null/missing collections fall through without throwing", () => {
    // The Person repository parses the JSON columns and hands the picker
    // already-deserialized arrays (or null); a null collection → empty secondary.
    const opt = toPersonOption({
      id: "p7",
      firstName: "Eve",
      lastName: "Stone",
      emails: null,
      companies: null,
    });
    expect(opt.name).toBe("Eve Stone");
    expect(opt.secondary).toBe("");
  });

  it("keeps name-only persons searchable by name", () => {
    const opt = toPersonOption({
      id: "p8",
      firstName: "Alice",
      lastName: "Müller",
      emails: null,
      companies: null,
    });
    expect(opt.searchText).toContain("alice müller");
  });
});
