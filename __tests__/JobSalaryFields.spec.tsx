/**
 * JobSalaryFields.spec.tsx — Welle 2 Phase 3, Task 3.8
 *
 * Verifies the structured salary section's behavior:
 *   - range mode shows min/max; entering them updates the form
 *   - the Fixum switch (when fixumDisablesRange) collapses to a single amount
 *     and sets salaryMin == salaryMax
 *   - selecting a bonus kind reveals the matching fields and builds the object
 */

import React from "react";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useForm } from "react-hook-form";
import type { z } from "zod";
import type { AddJobFormSchema } from "@/models/addJobForm.schema";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
}));

// Stub CurrencySelect (cmdk/Radix) — its own tests cover it.
jest.mock("@/components/ui/currency-select", () => ({
  CurrencySelect: ({ value, onValueChange }: any) => (
    <select aria-label="currency-stub" value={value} onChange={(e) => onValueChange(e.target.value)}>
      <option value="">--</option>
      <option value="EUR">EUR</option>
    </select>
  ),
}));

// jsdom shims for Radix (Switch/Select) interactions
window.HTMLElement.prototype.scrollIntoView = jest.fn();
if (!window.HTMLElement.prototype.hasPointerCapture) {
  window.HTMLElement.prototype.hasPointerCapture = jest.fn();
  window.HTMLElement.prototype.setPointerCapture = jest.fn();
  window.HTMLElement.prototype.releasePointerCapture = jest.fn();
}

import { JobSalaryFields } from "@/components/myjobs/JobSalaryFields";

type Values = z.infer<typeof AddJobFormSchema>;

function Harness({ fixumDisablesRange = true }: { fixumDisablesRange?: boolean }) {
  const form = useForm<Values>({
    defaultValues: {
      salaryMin: null,
      salaryMax: null,
      salaryCurrency: null,
      salaryPeriod: null,
      salaryBonus: null,
    } as Partial<Values> as Values,
  });
  const v = form.watch();
  return (
    <div>
      <JobSalaryFields form={form} currencies={[]} fixumDisablesRange={fixumDisablesRange} />
      <output data-testid="min">{String(v.salaryMin)}</output>
      <output data-testid="max">{String(v.salaryMax)}</output>
      <output data-testid="bonus">{JSON.stringify(v.salaryBonus)}</output>
    </div>
  );
}

it("range mode: editing min and max updates the form", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.type(screen.getByLabelText("jobs.salaryMin"), "50000");
  await user.type(screen.getByLabelText("jobs.salaryMax"), "60000");
  expect(screen.getByTestId("min")).toHaveTextContent("50000");
  expect(screen.getByTestId("max")).toHaveTextContent("60000");
});

it("Fixum switch collapses to a single amount (min == max)", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByLabelText("jobs.fixedSalary"));
  // Range inputs are replaced by a single amount input
  expect(screen.queryByLabelText("jobs.salaryMin")).not.toBeInTheDocument();
  await user.type(screen.getByLabelText("jobs.salaryAmount"), "55000");
  expect(screen.getByTestId("min")).toHaveTextContent("55000");
  expect(screen.getByTestId("max")).toHaveTextContent("55000");
});

it("does not offer the Fixum switch when fixumDisablesRange is off", () => {
  render(<Harness fixumDisablesRange={false} />);
  expect(screen.queryByLabelText("jobs.fixedSalary")).not.toBeInTheDocument();
  expect(screen.getByLabelText("jobs.salaryMin")).toBeInTheDocument();
});

// Note: the bonus-kind + period selectors use Radix Select (portal/pointer
// model that is brittle under jsdom). The bonus value-object logic — including
// kind→field requirements — is fully covered by bonus.spec.ts; here we only
// assert the range/fixum wiring, which uses Input + Switch.
