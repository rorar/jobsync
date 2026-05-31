/**
 * DatePicker — allowClear behaviour (F-AJ-04)
 *
 * The Due Date field is optional. When `allowClear` is set and a value is
 * present, the popover exposes a "Clear" action that resets the field. These
 * tests use REAL react-hook-form (not a mocked field) and assert the OBSERVABLE
 * effect — the trigger reverts to the empty placeholder — because the bug this
 * guards (RHF 7.x not re-rendering on `field.onChange(undefined)`) is only
 * visible through the rendered value, not by spying on onChange.
 *
 * jsdom: Radix Popover uses Pointer Capture internally — stub the three methods.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { Form, FormField } from "@/components/ui/form";

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

jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) =>
      key === "jobs.pickADate"
        ? "Pick a date"
        : key === "jobs.clearDate"
          ? "Clear date"
          : key,
    locale: "en",
  }),
  formatDateShort: () => "Jun 1, 2026",
}));

import { DatePicker } from "@/components/DatePicker";

function Harness({
  defaultValue,
  allowClear,
}: {
  defaultValue: Date | undefined;
  allowClear?: boolean;
}) {
  const form = useForm<{ dueDate: Date | undefined }>({
    defaultValues: { dueDate: defaultValue },
  });
  return (
    <Form {...form}>
      <FormField
        control={form.control}
        name="dueDate"
        render={({ field }) => (
          <DatePicker
            field={field}
            presets={false}
            isEnabled
            allowClear={allowClear}
          />
        )}
      />
    </Form>
  );
}

describe("DatePicker — allowClear (F-AJ-04)", () => {
  it("reverts the trigger to the placeholder after Clear (value reset)", async () => {
    render(<Harness defaultValue={new Date("2026-06-01")} allowClear />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jun 1, 2026/i }));
    });

    const clearBtn = await screen.findByRole("button", { name: /clear date/i });
    await act(async () => {
      fireEvent.click(clearBtn);
    });

    // The field actually reset → trigger shows the empty placeholder and the
    // formatted date is gone. (Guards the RHF re-render bug.)
    expect(
      await screen.findByRole("button", { name: /pick a date/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Jun 1, 2026/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Clear when allowClear is omitted (existing call sites)", async () => {
    render(<Harness defaultValue={new Date("2026-06-01")} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /Jun 1, 2026/i }));
    });

    expect(
      screen.queryByRole("button", { name: /clear date/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Clear when there is no value", async () => {
    render(<Harness defaultValue={undefined} allowClear />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /pick a date/i }));
    });

    expect(
      screen.queryByRole("button", { name: /clear date/i }),
    ).not.toBeInTheDocument();
  });
});
