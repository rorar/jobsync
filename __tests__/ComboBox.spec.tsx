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
import userEvent from "@testing-library/user-event";
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

/**
 * E2E-B39 regression.
 *
 * A created option must survive the PARENT replacing the options array. The
 * old code made a created option visible by calling `options.unshift(result)`
 * — mutating the prop in place — while the trigger derived its text from that
 * same array. A parent that refetches (AddExperience does, on mount) dropped
 * the row out, `field.value` still held the new id, `find` missed, and the
 * trigger rendered "".
 *
 * This is written as a PRODUCT test, not an E2E one, because that is what the
 * defect is. It was tracked for days as test-isolation flakiness: a loaded
 * server widens the window between the create resolving and the fetch landing,
 * so it surfaced only when other specs ran first.
 */
function CreateHarness({ optionsAfterRefetch }: { optionsAfterRefetch: typeof OPTIONS }) {
  const form = useForm({ defaultValues: { company: "" } });
  // A COPY, and that detail is the test. The old code called
  // `options.unshift(result)`, mutating whatever array it was handed — so
  // seeding from the shared `OPTIONS` and then "refetching" `OPTIONS` would
  // hand back the very array the created row had just been pushed into, and
  // the assertion below would pass against the defect. It did, on the first
  // draft of this test.
  const [options, setOptions] = React.useState(() => [...OPTIONS]);
  return (
    <Form {...form}>
      <button type="button" onClick={() => setOptions(optionsAfterRefetch)}>
        simulate parent refetch
      </button>
      <FormField
        control={form.control}
        name="company"
        render={({ field }) => (
          <FormItem>
            <Combobox
              options={options}
              field={field}
              label="Company"
              creatable
              onCreateOption={async (label: string) => ({
                id: "created-1",
                label,
                value: label.toLowerCase(),
              })}
            />
          </FormItem>
        )}
      />
    </Form>
  );
}

describe("Combobox created-option durability (E2E-B39)", () => {
  // jsdom implements no scrollIntoView and Radix's Command calls it on the
  // active item. Same shape as the setPointerCapture stub in
  // SuperLikeCelebration.spec.tsx — a jsdom gap, not a component defect.
  beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    (HTMLElement.prototype as unknown as { scrollIntoView: () => void }).scrollIntoView = () => {};
  });

  it("keeps showing a created option after the parent replaces the options array", async () => {
    const user = userEvent.setup();
    // The refetch deliberately does NOT contain the created row — that is the
    // real sequence: the fetch was in flight before the create resolved.
    render(<CreateHarness optionsAfterRefetch={[...OPTIONS]} />);

    await user.click(screen.getByRole("combobox"));
    await user.type(
      screen.getByPlaceholderText(/create or search/i),
      "Initech",
    );
    await user.keyboard("{Enter}");

    expect(await screen.findByRole("combobox")).toHaveTextContent("Initech");

    await user.click(screen.getByText("simulate parent refetch"));

    // The decisive assertion: before the fix this read "" because the created
    // row lived only in the array the parent just threw away.
    expect(screen.getByRole("combobox")).toHaveTextContent("Initech");
  });
});
