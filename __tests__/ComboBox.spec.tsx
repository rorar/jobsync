/**
 * Combobox trigger value-rendering — re-verification of bug #6.
 *
 * The BACKLOG documented a "company combobox top-N quirk: recruiting agency
 * shows placeholder on edit". Verifying against source disproved the root cause:
 *  - Both editable company comboboxes are fed by getAllCompanies() (ALL of the
 *    user's companies, no limit). getCompanyList() (orderBy applied-count + take)
 *    feeds ONLY the admin paginated list, a separate read path.
 *  - So a selected company is always present in `options` on the real edit form,
 *    and the trigger renders its label (NOT a placeholder).
 *
 * These tests lock that real behaviour in and document the (currently
 * unreachable) value∉options edge so the symptom can't be re-misattributed.
 */

import React from "react";
import { render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form, FormField, FormItem } from "@/components/ui/form";
import { Combobox } from "@/components/ComboBox";

// Isolate the component's value-rendering logic from the real dictionary
// (interpolation + word order are proven separately in forms-i18n.spec.ts).
jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const m: Record<string, string> = {
        "forms.selectPlaceholder": "Select {label}",
        "forms.searchPlaceholder": "Search {label}",
        "forms.createOrSearchPlaceholder": "Create or search {label}",
        "forms.createOption": "Create:",
        "forms.noResults": "No results found!",
        "forms.optionCreated": "{label} created",
        "forms.optionSelected": "{label} selected",
      };
      return m[key] ?? key;
    },
    locale: "en",
  }),
}));

const OPTIONS = [
  { id: "c1", label: "Acme Corp", value: "acme corp" },
  { id: "c2", label: "Globex", value: "globex" },
];

function Harness({ value, label }: { value?: string; label?: string }) {
  const form = useForm({ defaultValues: { company: value ?? "" } });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="company"
        render={({ field }) => (
          <FormItem>
            <Combobox options={OPTIONS} field={field} label={label} />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("Combobox trigger value rendering (#6 re-verify)", () => {
  it("renders the selected option's label when the value is present in options (the real edit case)", () => {
    render(<Harness value="c1" label="Company" />);
    // getAllCompanies feeds the full list → the selected company IS in options →
    // its label renders. This is the real edit-form behaviour; NOT a placeholder.
    expect(screen.getByRole("combobox")).toHaveTextContent("Acme Corp");
  });

  it("renders the localized placeholder when no value is selected", () => {
    render(<Harness value="" label="Company" />);
    expect(screen.getByRole("combobox")).toHaveTextContent("Select Company");
  });

  it("does NOT show the placeholder when a value is set but absent from options (latent edge)", () => {
    render(<Harness value="ghost-id" label="Company" />);
    // field.value is truthy, so the `: placeholder` branch is never taken — the
    // documented 'placeholder on edit' symptom cannot occur. The trigger renders
    // empty (find() miss). Unreachable on the real jobs page (getAllCompanies
    // returns ALL of the user's companies).
    expect(screen.getByRole("combobox")).not.toHaveTextContent("Select Company");
  });
});
