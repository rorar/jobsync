/**
 * PersonForm.companies.spec.tsx — Component Tests (company linking)
 *
 * Covers the company section of the CRM contact form after the switch from a
 * free-text <Input> to CompanyPicker:
 *   - the company field is a combobox, not a text input
 *   - selecting a company writes BOTH companyId and companyLabel
 *   - inline create resolves through findOrCreateCompany and selects the result
 *   - a new row with no company selected is dropped on submit
 *   - a LEGACY row (companyId "" + stored label) is KEPT on submit and shows
 *     the link-me hint — dropping it would destroy data during an unrelated edit
 *
 * Spec: .full-stack-feature/03-architecture.md §2.2
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.company": "Company",
        "crm.selectCompany": "Select company...",
        "crm.searchCompanies": "Search companies...",
        "crm.noCompaniesFound": "No companies found",
        "crm.createCompany": 'Create "{label}"',
        "crm.creatingCompany": "Creating company...",
        "crm.unlinkedCompanyHint": "Not linked yet",
        "crm.jobTitle": "Position",
        "crm.primary": "Primary",
        "crm.removeCompany": "Remove company",
        "crm.editContact": "Save contact",
        "crm.addContact": "Add contact",
        "crm.cancel": "Cancel",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
  formatDate: (d: unknown) => String(d),
  formatNumber: (n: unknown) => String(n),
}));

const mockFindOrCreateCompany = jest.fn();
const mockGetAllCompanies = jest.fn();

jest.mock("@/actions/company.actions", () => ({
  getAllCompanies: (...args: unknown[]) => mockGetAllCompanies(...args),
  findOrCreateCompany: (...args: unknown[]) => mockFindOrCreateCompany(...args),
}));

jest.mock("@/actions/reference-data.actions", () => ({
  getCountryOptions: jest.fn().mockResolvedValue([]),
  getSubdivisionOptions: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/components/ui/use-toast", () => ({
  useToast: () => ({ toast: jest.fn() }),
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

import PersonForm from "@/components/crm/PersonForm";

const ACME = { id: "c1", label: "Acme Corp" };

/** Minimal person shape the form reads from. */
function personWith(companies: unknown[]) {
  return {
    id: "p1",
    firstName: "Jane",
    lastName: "Doe",
    emails: [{ email: "jane@acme.com", type: "work", isPrimary: true }],
    phones: [],
    companies,
    socialProfiles: [],
  };
}

async function submitForm() {
  await userEvent.click(screen.getByRole("button", { name: /save/i }));
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAllCompanies.mockResolvedValue({
    success: true,
    data: [{ id: ACME.id, label: ACME.label, value: "acme corp" }],
  });
});

describe("PersonForm — company field", () => {
  it("renders a combobox for the company, not a free-text input", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PersonForm
        person={personWith([
          { companyId: "", companyLabel: "", position: null, isPrimary: true },
        ]) as never}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetAllCompanies).toHaveBeenCalled());

    expect(
      screen.getByRole("combobox", { name: /company/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Company"),
    ).not.toBeInTheDocument();
  });

  it("writes companyId AND companyLabel when a company is selected", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PersonForm
        person={personWith([
          { companyId: "", companyLabel: "", position: null, isPrimary: true },
        ]) as never}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetAllCompanies).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("combobox", { name: /company/i }));
    await userEvent.click(await screen.findByText("Acme Corp"));
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].companies).toEqual([
      expect.objectContaining({
        companyId: "c1",
        companyLabel: "Acme Corp",
        isPrimary: true,
      }),
    ]);
  });

  it("creates a company inline and links it", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    mockFindOrCreateCompany.mockResolvedValue({
      success: true,
      data: { id: "c-new", label: "Beispiel GmbH", value: "beispiel gmbh" },
    });

    render(
      <PersonForm
        person={personWith([
          { companyId: "", companyLabel: "", position: null, isPrimary: true },
        ]) as never}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetAllCompanies).toHaveBeenCalled());

    await userEvent.click(screen.getByRole("combobox", { name: /company/i }));
    await userEvent.type(
      screen.getByPlaceholderText("Search companies..."),
      "Beispiel GmbH",
    );
    await userEvent.click(screen.getByText(/^Create "/));

    await waitFor(() =>
      expect(mockFindOrCreateCompany).toHaveBeenCalledWith("Beispiel GmbH"),
    );

    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].companies).toEqual([
      expect.objectContaining({
        companyId: "c-new",
        companyLabel: "Beispiel GmbH",
      }),
    ]);
  });

  it("drops a row where no company was ever selected", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PersonForm
        person={personWith([
          { companyId: "", companyLabel: "", position: null, isPrimary: true },
        ]) as never}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetAllCompanies).toHaveBeenCalled());
    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].companies).toEqual([]);
  });

  /**
   * The data-preservation guard. A user opening a contact to fix a phone number
   * must not lose the employer name captured before the picker existed.
   */
  it("KEEPS a legacy row (label without id) on submit and shows the link hint", async () => {
    const onSubmit = jest.fn().mockResolvedValue(undefined);
    render(
      <PersonForm
        person={personWith([
          {
            companyId: "",
            companyLabel: "Old Freetext Ltd",
            position: "VP",
            isPrimary: true,
          },
        ]) as never}
        onSubmit={onSubmit}
        onCancel={jest.fn()}
      />,
    );

    await waitFor(() => expect(mockGetAllCompanies).toHaveBeenCalled());

    expect(screen.getByText("Old Freetext Ltd")).toBeInTheDocument();
    expect(screen.getByText(/Not linked yet/)).toBeInTheDocument();

    await submitForm();

    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].companies).toEqual([
      expect.objectContaining({
        companyId: "",
        companyLabel: "Old Freetext Ltd",
        position: "VP",
      }),
    ]);
  });
});
