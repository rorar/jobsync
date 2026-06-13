/**
 * StatusStageCombobox (Welle 4, F-AJ-02) — grouped-by-stage status picker.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

jest.mock("@/i18n", () => ({
  useTranslations: () => ({ t: (k: string) => k, locale: "en" }),
}));

import { StatusStageCombobox } from "@/components/myjobs/StatusStageCombobox";
import type { JobStatus } from "@/models/job.model";

// jsdom shims for Radix Popover + cmdk
beforeAll(() => {
  window.HTMLElement.prototype.scrollIntoView = jest.fn();
  window.HTMLElement.prototype.hasPointerCapture = jest.fn();
  (global as { ResizeObserver: unknown }).ResizeObserver = jest.fn().mockImplementation(() => ({
    observe: jest.fn(),
    unobserve: jest.fn(),
    disconnect: jest.fn(),
  }));
  document.createRange = () => {
    const range = new Range();
    range.getBoundingClientRect = jest.fn() as never;
    range.getClientRects = () =>
      ({ item: () => null, length: 0, [Symbol.iterator]: jest.fn() }) as never;
    return range;
  };
});

const cat = (id: string, kind: string, sortOrder: number, isAppliedStage = false) => ({
  id,
  kind,
  label: kind,
  colour: "blue",
  sortOrder,
  isAppliedStage,
  isTerminal: false,
  defaultCollapsed: false,
  allowsSelfTransition: false,
});

const OPTIONS: JobStatus[] = [
  { id: "s1", value: "bookmarked", label: "Bookmarked", category: cat("c-lead", "lead", 0) },
  { id: "s2", value: "applied", label: "Applied", category: cat("c-applied", "applied", 1, true) },
];

describe("StatusStageCombobox", () => {
  it("renders the selected status label on the trigger", () => {
    render(<StatusStageCombobox options={OPTIONS} value="s1" onChange={jest.fn()} />);
    expect(screen.getByTestId("status-combobox-trigger")).toHaveTextContent("Bookmarked");
  });

  it("shows the 'marks applied' badge when an applied-stage status is selected", () => {
    render(<StatusStageCombobox options={OPTIONS} value="s2" onChange={jest.fn()} />);
    expect(screen.getByTestId("status-combobox-trigger")).toHaveTextContent("jobStatus.marksApplied");
  });

  it("opens grouped by stage and reports the chosen status id", async () => {
    const user = userEvent.setup();
    const onChange = jest.fn();
    render(<StatusStageCombobox options={OPTIONS} value="s1" onChange={onChange} />);

    await user.click(screen.getByTestId("status-combobox-trigger"));
    // stage headings present
    expect(await screen.findByText("jobStatus.stage.applied")).toBeInTheDocument();
    const appliedOption = screen.getByRole("option", { name: /Applied/i });
    await user.click(appliedOption);
    expect(onChange).toHaveBeenCalledWith("s2");
  });
});
