/**
 * SubdivisionSelect.spec.tsx — Component Tests
 *
 * Tests the SubdivisionSelect combobox component:
 *   - Returns null when subdivisions array is empty
 *   - Renders placeholder text when no value is set
 *   - Renders selected subdivision name when a value is provided
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
        "crm.subdivisionSelect": "Select state/region...",
        "crm.subdivisionSearch": "Search regions...",
        "crm.noSubdivisionFound": "No region found.",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

// ---------------------------------------------------------------------------
// Import component after mocks
// ---------------------------------------------------------------------------

import { SubdivisionSelect } from "@/components/ui/subdivision-select";
import type { SubdivisionOption } from "@/components/ui/subdivision-select";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const GERMAN_STATES: SubdivisionOption[] = [
  { code: "BY", name: "Bavaria", subdivisionType: "Land" },
  { code: "NW", name: "North Rhine-Westphalia", subdivisionType: "Land" },
  { code: "BE", name: "Berlin", subdivisionType: "Land" },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("SubdivisionSelect", () => {
  it("returns null (renders nothing) when the subdivisions array is empty", () => {
    const { container } = render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders the placeholder text when subdivisions are present but no value is set", () => {
    render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    expect(screen.getByText("Select state/region...")).toBeInTheDocument();
  });

  it("renders the selected subdivision name when a value is provided", () => {
    render(
      <SubdivisionSelect
        value="BY"
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    expect(screen.getByText("Bavaria")).toBeInTheDocument();
  });

  it("renders the correct name for a different selected value (NW)", () => {
    render(
      <SubdivisionSelect
        value="NW"
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    expect(screen.getByText("North Rhine-Westphalia")).toBeInTheDocument();
  });

  it("does not show the placeholder when a valid value is selected", () => {
    render(
      <SubdivisionSelect
        value="BY"
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    expect(screen.queryByText("Select state/region...")).not.toBeInTheDocument();
  });

  it("renders as a combobox button with role='combobox'", () => {
    render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
        disabled
      />,
    );
    const button = screen.getByRole("combobox");
    expect(button).toBeDisabled();
  });

  it("is NOT disabled when disabled prop is false (default)", () => {
    render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );
    const button = screen.getByRole("combobox");
    expect(button).not.toBeDisabled();
  });

  it("opens the dropdown and shows all subdivision options when clicked", async () => {
    const user = userEvent.setup();
    render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
      />,
    );

    await user.click(screen.getByRole("combobox"));

    expect(screen.getByText("Bavaria")).toBeInTheDocument();
    expect(screen.getByText("North Rhine-Westphalia")).toBeInTheDocument();
    expect(screen.getByText("Berlin")).toBeInTheDocument();
  });

  it("calls onValueChange with the correct code when an item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <SubdivisionSelect
        value=""
        onValueChange={handleChange}
        subdivisions={GERMAN_STATES}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const bavariaItems = screen.getAllByText("Bavaria");
    await user.click(bavariaItems[0]);

    expect(handleChange).toHaveBeenCalledWith("BY");
  });

  it("calls onValueChange with 'NW' when North Rhine-Westphalia is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <SubdivisionSelect
        value=""
        onValueChange={handleChange}
        subdivisions={GERMAN_STATES}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    const nwItems = screen.getAllByText("North Rhine-Westphalia");
    await user.click(nwItems[0]);

    expect(handleChange).toHaveBeenCalledWith("NW");
  });

  it("calls onValueChange with empty string when the clear item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();

    render(
      <SubdivisionSelect
        value="BY"
        onValueChange={handleChange}
        subdivisions={GERMAN_STATES}
      />,
    );

    await user.click(screen.getByRole("combobox"));
    // The clear option (— Select state/region...) appears when a value is set
    const clearItems = screen.getAllByText(/Select state\/region\.\.\./);
    await user.click(clearItems[0]);

    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("applies a custom className to the trigger button", () => {
    const { container } = render(
      <SubdivisionSelect
        value=""
        onValueChange={jest.fn()}
        subdivisions={GERMAN_STATES}
        className="my-custom-class"
      />,
    );
    const button = container.querySelector("button");
    expect(button).toHaveClass("my-custom-class");
  });
});
