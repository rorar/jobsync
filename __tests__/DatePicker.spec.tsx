/**
 * DatePicker — allowClear behaviour (F-AJ-04)
 *
 * The Due Date field is now optional. When `allowClear` is set and a value is
 * present, the popover exposes a "Clear" action that resets the field to
 * undefined. Default (allowClear omitted) must NOT render the action, so the
 * 6 existing call sites are unaffected.
 *
 * jsdom: Radix Popover uses Pointer Capture internally — stub the three
 * methods (same pattern as StagedVacancyDetailSheet.spec / SuperLikeCelebration).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";

beforeAll(() => {
  for (const m of [
    "setPointerCapture",
    "releasePointerCapture",
    "hasPointerCapture",
  ]) {
    if (!(m in HTMLElement.prototype)) {
      Object.defineProperty(HTMLElement.prototype, m, {
        value: jest.fn(),
        writable: true,
        configurable: true,
      });
    }
  }
});

let mockLocale = "en";
jest.mock("@/i18n", () => ({
  useTranslations: () => {
    const dict = require("@/i18n/dictionaries").getDictionary(mockLocale);
    return { t: (key: string) => dict[key] ?? key, locale: mockLocale };
  },
  formatDateShort: () => "Jun 1, 2026",
}));

// DatePicker wraps its trigger in <FormControl>, which requires react-hook-form
// FormField context. We don't need that context to exercise allowClear, so we
// stub FormControl. It MUST forward props/ref via Radix Slot (NOT a Fragment) —
// PopoverTrigger uses `asChild`, which clones a single element child; a Fragment
// would drop the trigger's onClick and the popover would never open.
jest.mock("@/components/ui/form", () => {
  const { Slot } = require("@radix-ui/react-slot");
  const Forward = React.forwardRef(function FormControlMock(
    props: Record<string, unknown>,
    ref: React.Ref<HTMLElement>,
  ) {
    return <Slot ref={ref} {...props} />;
  });
  return { FormControl: Forward };
});

import { DatePicker } from "@/components/DatePicker";

function makeField(value: Date | undefined) {
  return {
    value,
    onChange: jest.fn(),
    onBlur: jest.fn(),
    name: "dueDate",
    ref: jest.fn(),
  };
}

describe("DatePicker — allowClear (F-AJ-04)", () => {
  beforeEach(() => {
    mockLocale = "en";
  });

  it("resets the field to undefined when the Clear action is clicked", async () => {
    const field = makeField(new Date("2026-06-01"));
    render(
      <DatePicker field={field} presets={false} isEnabled allowClear />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jun 1, 2026/i }));
    });

    const clearBtn = await screen.findByRole("button", { name: /clear date/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    expect(field.onChange).toHaveBeenCalledWith(undefined);
  });

  it("does not render Clear when allowClear is omitted (existing call sites)", async () => {
    const field = makeField(new Date("2026-06-01"));
    render(<DatePicker field={field} presets={false} isEnabled />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jun 1, 2026/i }));
    });

    expect(
      screen.queryByRole("button", { name: /clear date/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Clear when there is no value", async () => {
    const field = makeField(undefined);
    render(
      <DatePicker field={field} presets={false} isEnabled allowClear />,
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pick a date/i }));
    });

    expect(
      screen.queryByRole("button", { name: /clear date/i }),
    ).not.toBeInTheDocument();
  });
});
