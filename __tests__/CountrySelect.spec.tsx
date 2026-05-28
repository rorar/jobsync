/**
 * CountrySelect.spec.tsx — Component Tests
 *
 * Tests the CountrySelect combobox component:
 *   - Renders placeholder text when no value is set
 *   - Renders selected country name when a value is provided
 *   - Calls onValueChange with the correct code when an item is selected
 *   - Disabled state prevents interaction
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.countrySelect": "Select country...",
        "crm.countrySearch": "Search countries...",
        "crm.noCountryFound": "No country found.",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: React.ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; priority?: boolean }) => {
    const { fill, priority, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { CountrySelect } from "@/components/ui/country-select";
import type { CountryOption } from "@/components/ui/country-select";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const COUNTRIES: CountryOption[] = [
  { code: "DE", name: "Germany", hasSubdivisions: true },
  { code: "FR", name: "France", hasSubdivisions: true },
  { code: "AT", name: "Austria", hasSubdivisions: true },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CountrySelect", () => {
  it("renders the placeholder text when no value is set", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    expect(screen.getByText("Select country...")).toBeInTheDocument();
  });

  it("renders the selected country name when a value is provided", () => {
    render(
      <CountrySelect
        value="DE"
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    expect(screen.getByText("Germany")).toBeInTheDocument();
  });

  it("renders the selected country name for France", () => {
    render(
      <CountrySelect
        value="FR"
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    expect(screen.getByText("France")).toBeInTheDocument();
  });

  it("does not show the placeholder when a valid value is selected", () => {
    render(
      <CountrySelect
        value="DE"
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    // The muted-foreground placeholder should not be rendered when a value is selected
    const placeholder = screen.queryByText("Select country...");
    // The placeholder span is only rendered when selectedCountry is falsy
    expect(placeholder).not.toBeInTheDocument();
  });

  it("renders as a combobox button with role='combobox'", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
        disabled
      />,
    );
    const button = screen.getByRole("combobox");
    expect(button).toBeDisabled();
  });

  it("is NOT disabled when disabled prop is false (default)", () => {
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    const button = screen.getByRole("combobox");
    expect(button).not.toBeDisabled();
  });

  it("opens the dropdown when the trigger is clicked", async () => {
    const user = userEvent.setup();
    render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
      />,
    );
    await user.click(screen.getByRole("combobox"));
    // After opening, country options become visible
    expect(screen.getByText("Germany")).toBeInTheDocument();
    expect(screen.getByText("France")).toBeInTheDocument();
  });

  it("calls onValueChange with the correct code when an item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <CountrySelect
        value=""
        onValueChange={handleChange}
        countries={COUNTRIES}
      />,
    );

    // Open the dropdown
    await user.click(screen.getByRole("combobox"));
    // Select Germany
    const germanyItems = screen.getAllByText("Germany");
    await user.click(germanyItems[0]);

    expect(handleChange).toHaveBeenCalledWith("DE");
  });

  it("calls onValueChange with empty string when the clear item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <CountrySelect
        value="DE"
        onValueChange={handleChange}
        countries={COUNTRIES}
      />,
    );

    // Open the dropdown
    await user.click(screen.getByRole("combobox"));
    // The clear option (— Select country...) should be present because value is set
    const clearItems = screen.getAllByText(/Select country\.\.\./);
    await user.click(clearItems[0]);

    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("applies a custom className to the trigger button", () => {
    const { container } = render(
      <CountrySelect
        value=""
        onValueChange={jest.fn()}
        countries={COUNTRIES}
        className="my-custom-class"
      />,
    );
    const button = container.querySelector("button");
    expect(button).toHaveClass("my-custom-class");
  });
});
