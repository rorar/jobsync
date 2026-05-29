/**
 * HolidayBadge.spec.tsx — Component Tests
 *
 * Verifies the PersonDetail holiday badge rendering logic:
 *   - public holiday → amber badge with country + name
 *   - weekend → blue badge with country
 *   - business day / null → renders nothing
 *   - live region present for async appearance
 */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "crm.holidayToday": "Public holiday in {country}: {name}",
        "crm.weekendToday": "Weekend in {country}",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
}));

import { HolidayBadge } from "@/components/crm/HolidayBadge";

describe("HolidayBadge", () => {
  it("renders nothing when info is null", () => {
    const { container } = render(<HolidayBadge info={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing on a plain business day", () => {
    const { container } = render(
      <HolidayBadge info={{ isHoliday: false, holidayName: null, isWeekend: false, countryName: "Germany" }} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders an amber holiday badge with interpolated country + name", () => {
    render(
      <HolidayBadge info={{ isHoliday: true, holidayName: "Christmas Day", isWeekend: false, countryName: "Germany" }} />,
    );
    expect(screen.getByText("Public holiday in Germany: Christmas Day")).toBeInTheDocument();
  });

  it("renders a weekend badge when not a holiday", () => {
    render(
      <HolidayBadge info={{ isHoliday: false, holidayName: null, isWeekend: true, countryName: "France" }} />,
    );
    expect(screen.getByText("Weekend in France")).toBeInTheDocument();
  });

  it("prefers the holiday badge when both holiday and weekend are true", () => {
    render(
      <HolidayBadge info={{ isHoliday: true, holidayName: "Boxing Day", isWeekend: true, countryName: "UK" }} />,
    );
    expect(screen.getByText("Public holiday in UK: Boxing Day")).toBeInTheDocument();
    expect(screen.queryByText(/Weekend in/)).not.toBeInTheDocument();
  });

  it("exposes a polite live region for async appearance", () => {
    render(
      <HolidayBadge info={{ isHoliday: false, holidayName: null, isWeekend: true, countryName: "Spain" }} />,
    );
    const region = screen.getByRole("status");
    expect(region).toHaveAttribute("aria-live", "polite");
  });

  it("handles a missing holiday name gracefully (empty name interpolation)", () => {
    render(
      <HolidayBadge info={{ isHoliday: true, holidayName: null, isWeekend: false, countryName: "Italy" }} />,
    );
    // {name} interpolates to empty string, no crash
    expect(screen.getByText(/Public holiday in Italy:/)).toBeInTheDocument();
  });
});
