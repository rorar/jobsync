/**
 * ProfilePreferencesCard.spec.tsx — Welle 2, Phase 2 (F-AJ-06)
 *
 * Tests the orchestration of the profile "Home location & currency" section:
 *   - loads current preferences on mount and pre-fills the controls
 *   - loads country + currency options via the reference-data OHS actions
 *   - Region is disabled until a country is chosen
 *   - changing the country RESETS the stale subdivision + reloads subdivisions
 *   - Save calls updateProfilePreferences with the current selection
 *
 * The three combobox children are stubbed to native <select>s — they have their
 * own unit tests (CountrySelect / CurrencySelect). This test owns the card's logic.
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

// --- i18n: return the key so assertions can target keys ---
jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
}));

const mockToast = jest.fn();
jest.mock("@/components/ui/use-toast", () => ({ toast: (...a: unknown[]) => mockToast(...a) }));

// --- server actions ---
const mockGetPrefs = jest.fn();
const mockUpdatePrefs = jest.fn();
jest.mock("@/actions/profile.actions", () => ({
  getProfilePreferences: () => mockGetPrefs(),
  updateProfilePreferences: (input: unknown) => mockUpdatePrefs(input),
}));

const mockGetCountryOptions = jest.fn();
const mockGetSubdivisionOptions = jest.fn();
const mockGetCurrencyOptions = jest.fn();
jest.mock("@/actions/reference-data.actions", () => ({
  getCountryOptions: (l: string) => mockGetCountryOptions(l),
  getSubdivisionOptions: (c: string, l: string) => mockGetSubdivisionOptions(c, l),
  getCurrencyOptions: (l: string) => mockGetCurrencyOptions(l),
}));

// --- stub the three comboboxes as native selects ---
jest.mock("@/components/ui/country-select", () => ({
  CountrySelect: ({ value, onValueChange, disabled }: any) => (
    <select aria-label="country-stub" value={value} disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}>
      <option value="">--</option>
      <option value="DE">DE</option>
      <option value="FR">FR</option>
    </select>
  ),
}));
jest.mock("@/components/ui/subdivision-select", () => ({
  SubdivisionSelect: ({ value, onValueChange, disabled }: any) => (
    <select aria-label="region-stub" value={value} disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}>
      <option value="">--</option>
      <option value="BY">BY</option>
      <option value="NW">NW</option>
    </select>
  ),
}));
jest.mock("@/components/ui/currency-select", () => ({
  CurrencySelect: ({ value, onValueChange, disabled }: any) => (
    <select aria-label="currency-stub" value={value} disabled={disabled}
      onChange={(e) => onValueChange(e.target.value)}>
      <option value="">--</option>
      <option value="EUR">EUR</option>
      <option value="USD">USD</option>
    </select>
  ),
}));

import ProfilePreferencesCard from "@/components/profile/ProfilePreferencesCard";

beforeEach(() => {
  jest.clearAllMocks();
  mockGetPrefs.mockResolvedValue({
    addressCountryCode: null,
    addressSubdivisionCode: null,
    preferredCurrency: null,
  });
  mockGetCountryOptions.mockResolvedValue([
    { code: "DE", name: "Germany", hasSubdivisions: true },
    { code: "FR", name: "France", hasSubdivisions: true },
  ]);
  mockGetSubdivisionOptions.mockResolvedValue([
    { code: "BY", name: "Bavaria", countryCode: "DE", subdivisionType: "Land" },
  ]);
  mockGetCurrencyOptions.mockResolvedValue([
    { code: "EUR", symbol: "€", name: "Euro", minorUnit: 2 },
    { code: "USD", symbol: "$", name: "US Dollar", minorUnit: 2 },
  ]);
  mockUpdatePrefs.mockResolvedValue({ success: true });
});

it("loads options + current preferences on mount", async () => {
  render(<ProfilePreferencesCard />);
  await waitFor(() => expect(mockGetPrefs).toHaveBeenCalled());
  expect(mockGetCountryOptions).toHaveBeenCalledWith("en");
  expect(mockGetCurrencyOptions).toHaveBeenCalledWith("en");
});

it("renders a real <h2> section heading", async () => {
  render(<ProfilePreferencesCard />);
  await waitFor(() =>
    expect(screen.getByRole("heading", { level: 2 })).toBeInTheDocument(),
  );
});

it("pre-fills the controls from the loaded preferences", async () => {
  mockGetPrefs.mockResolvedValue({
    addressCountryCode: "DE",
    addressSubdivisionCode: "BY",
    preferredCurrency: "EUR",
  });
  render(<ProfilePreferencesCard />);
  await waitFor(() =>
    expect(screen.getByLabelText("country-stub")).toHaveValue("DE"),
  );
  expect(screen.getByLabelText("region-stub")).toHaveValue("BY");
  expect(screen.getByLabelText("currency-stub")).toHaveValue("EUR");
});

it("hides the Region control until a country is chosen", async () => {
  const user = userEvent.setup();
  render(<ProfilePreferencesCard />);
  await waitFor(() => expect(mockGetPrefs).toHaveBeenCalled());
  // No country yet → Region block is not rendered
  expect(screen.queryByLabelText("region-stub")).not.toBeInTheDocument();
  // Pick a country → subdivisions load → Region appears
  await user.selectOptions(screen.getByLabelText("country-stub"), "DE");
  await waitFor(() =>
    expect(screen.getByLabelText("region-stub")).toBeInTheDocument(),
  );
});

it("resets the stale subdivision when the country changes", async () => {
  const user = userEvent.setup();
  mockGetPrefs.mockResolvedValue({
    addressCountryCode: "DE",
    addressSubdivisionCode: "BY",
    preferredCurrency: null,
  });
  render(<ProfilePreferencesCard />);
  await waitFor(() =>
    expect(screen.getByLabelText("country-stub")).toHaveValue("DE"),
  );
  // change country DE → FR: the BY region must be cleared
  await user.selectOptions(screen.getByLabelText("country-stub"), "FR");
  await waitFor(() =>
    expect(screen.getByLabelText("region-stub")).toHaveValue(""),
  );
  expect(mockGetSubdivisionOptions).toHaveBeenCalledWith("FR", "en");
});

it("saves the current selection via updateProfilePreferences", async () => {
  const user = userEvent.setup();
  render(<ProfilePreferencesCard />);
  await waitFor(() => expect(mockGetPrefs).toHaveBeenCalled());

  await user.selectOptions(screen.getByLabelText("country-stub"), "DE");
  await user.selectOptions(screen.getByLabelText("currency-stub"), "EUR");
  await user.click(screen.getByRole("button", { name: /save/i }));

  await waitFor(() => expect(mockUpdatePrefs).toHaveBeenCalled());
  // The card normalizes empty strings to null before calling the action
  // (the action contract is `string | null`).
  expect(mockUpdatePrefs).toHaveBeenCalledWith({
    addressCountryCode: "DE",
    addressSubdivisionCode: null,
    preferredCurrency: "EUR",
  });
});
