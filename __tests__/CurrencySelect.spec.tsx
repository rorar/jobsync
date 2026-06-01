/**
 * CurrencySelect.spec.tsx — Component Tests (Welle 2, Phase 2)
 *
 * Mirrors CountrySelect.spec.tsx. Currency-specific behavior:
 *   - trigger + option show symbol + CODE (code is the unambiguous identity)
 *   - manual filter matches code, name, AND symbol (shouldFilter=false)
 *   - code match ranks first (typing "eur" surfaces EUR before name matches)
 *   - clear item, loading spinner, role=combobox, disabled, className
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.currencySelect": "Select currency...",
        "crm.currencySearch": "Search currency or code...",
        "crm.noCurrencyFound": "No currency found.",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

// jsdom does not implement scrollIntoView — required by cmdk/Radix Command
window.HTMLElement.prototype.scrollIntoView = jest.fn();

import { CurrencySelect } from "@/components/ui/currency-select";
import type { CurrencyOption } from "@/components/ui/currency-select";

const CURRENCIES: CurrencyOption[] = [
  { code: "EUR", symbol: "€", name: "Euro", minorUnit: 2 },
  { code: "USD", symbol: "$", name: "US Dollar", minorUnit: 2 },
  { code: "GBP", symbol: "£", name: "British Pound", minorUnit: 2 },
  { code: "JPY", symbol: "¥", name: "Japanese Yen", minorUnit: 0 },
];

describe("CurrencySelect", () => {
  it("renders the placeholder when no value is set", () => {
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    expect(screen.getByText("Select currency...")).toBeInTheDocument();
  });

  it("renders the selected code on the trigger", () => {
    render(<CurrencySelect value="EUR" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    expect(screen.getByRole("combobox")).toHaveTextContent("EUR");
    expect(screen.queryByText("Select currency...")).not.toBeInTheDocument();
  });

  it("renders as a combobox button", () => {
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    expect(screen.getByRole("combobox")).toBeInTheDocument();
  });

  it("is disabled when the disabled prop is true", () => {
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} disabled />);
    expect(screen.getByRole("combobox")).toBeDisabled();
  });

  it("opens and lists currencies (code + name visible)", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.getByText("EUR")).toBeInTheDocument();
    expect(screen.getByText("Euro")).toBeInTheDocument();
    expect(screen.getByText("US Dollar")).toBeInTheDocument();
  });

  it("calls onValueChange with the code when an item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={handleChange} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getAllByText("US Dollar")[0]);
    expect(handleChange).toHaveBeenCalledWith("USD");
  });

  it("clears when the clear item is selected", async () => {
    const handleChange = jest.fn();
    const user = userEvent.setup();
    render(<CurrencySelect value="EUR" onValueChange={handleChange} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.click(screen.getAllByText(/Select currency\.\.\./)[0]);
    expect(handleChange).toHaveBeenCalledWith("");
  });

  it("filters by code (manual filter)", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search currency or code..."), "usd");
    expect(screen.getByText("US Dollar")).toBeInTheDocument();
    expect(screen.queryByText("Euro")).not.toBeInTheDocument();
  });

  it("filters by name", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search currency or code..."), "dollar");
    expect(screen.getByText("US Dollar")).toBeInTheDocument();
    expect(screen.queryByText("Euro")).not.toBeInTheDocument();
  });

  it("filters by pasted symbol", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search currency or code..."), "€");
    expect(screen.getByText("Euro")).toBeInTheDocument();
    expect(screen.queryByText("US Dollar")).not.toBeInTheDocument();
  });

  it("ranks an exact code match first", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search currency or code..."), "eur");
    // EUR is the first option row in the filtered list
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("EUR");
  });

  it("keeps the clear item visible while searching with no match", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="EUR" onValueChange={jest.fn()} currencies={CURRENCIES} />);
    await user.click(screen.getByRole("combobox"));
    await user.type(screen.getByPlaceholderText("Search currency or code..."), "zzzzz");
    expect(screen.getAllByText(/Select currency\.\.\./).length).toBeGreaterThan(0);
  });

  it("shows a loading spinner instead of the empty state when loading", async () => {
    const user = userEvent.setup();
    render(<CurrencySelect value="" onValueChange={jest.fn()} currencies={[]} loading />);
    await user.click(screen.getByRole("combobox"));
    expect(screen.queryByText("No currency found.")).not.toBeInTheDocument();
  });

  it("applies a custom className to the trigger", () => {
    const { container } = render(
      <CurrencySelect value="" onValueChange={jest.fn()} currencies={CURRENCIES} className="my-cur-class" />,
    );
    expect(container.querySelector("button")).toHaveClass("my-cur-class");
  });
});
