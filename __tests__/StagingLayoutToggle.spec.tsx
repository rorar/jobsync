/**
 * StagingLayoutToggle component tests
 *
 * Sprint 1 CRIT-Y2 regression guard:
 *   1. WCAG 1.4.1 (Use of Color) — the active state must have a non-color
 *      indicator (a visible Check glyph), not just a background color change.
 *   2. ARIA name hygiene — each radio must have exactly ONE accessible name
 *      source (aria-label). No sr-only duplicate span, no title tooltip.
 *
 * Also covers: aria-checked states, arrow-key roving tabindex, onChange
 * wiring. Storage key behaviour is owned by useStagingLayout.ts (tested
 * separately in useStagingLayout.spec.ts).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { StagingLayoutToggle } from "@/components/staging/StagingLayoutToggle";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "staging.layoutSize.label": "Layout size",
        "staging.layoutSize.compact": "Compact",
        "staging.layoutSize.default": "Default",
        "staging.layoutSize.comfortable": "Comfortable",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

describe("StagingLayoutToggle", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders the three radio options inside a radiogroup", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    const group = screen.getByRole("radiogroup", { name: "Layout size" });
    expect(group).toBeInTheDocument();

    // Exactly three radios, one per size
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);

    expect(screen.getByRole("radio", { name: "Compact" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Default" })).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Comfortable" }),
    ).toBeInTheDocument();
  });

  it("marks the matching radio as checked and the others as unchecked", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="compact" onChange={mockOnChange} />,
    );

    expect(screen.getByRole("radio", { name: "Compact" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Comfortable" })).toHaveAttribute(
      "aria-checked",
      "false",
    );

    rerender(<StagingLayoutToggle value="comfortable" onChange={mockOnChange} />);

    expect(screen.getByRole("radio", { name: "Compact" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Comfortable" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("calls onChange with the clicked size", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole("radio", { name: "Compact" }));
    expect(mockOnChange).toHaveBeenCalledWith("compact");

    fireEvent.click(screen.getByRole("radio", { name: "Comfortable" }));
    expect(mockOnChange).toHaveBeenCalledWith("comfortable");
  });

  it("roving tabindex: only the active radio is in the tab order", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="default" onChange={mockOnChange} />,
    );

    expect(screen.getByRole("radio", { name: "Compact" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Comfortable" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    rerender(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);

    expect(screen.getByRole("radio", { name: "Compact" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Default" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
  });
});

describe("StagingLayoutToggle — arrow key navigation", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("ArrowRight advances through the cycle (compact → default → comfortable → compact)", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="compact" onChange={mockOnChange} />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(mockOnChange).toHaveBeenLastCalledWith("default");

    rerender(<StagingLayoutToggle value="default" onChange={mockOnChange} />);
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(mockOnChange).toHaveBeenLastCalledWith("comfortable");

    rerender(
      <StagingLayoutToggle value="comfortable" onChange={mockOnChange} />,
    );
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(mockOnChange).toHaveBeenLastCalledWith("compact");
  });

  it("ArrowLeft walks backwards (comfortable → default → compact → comfortable)", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="comfortable" onChange={mockOnChange} />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(mockOnChange).toHaveBeenLastCalledWith("default");

    rerender(<StagingLayoutToggle value="default" onChange={mockOnChange} />);
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(mockOnChange).toHaveBeenLastCalledWith("compact");

    rerender(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(mockOnChange).toHaveBeenLastCalledWith("comfortable");
  });

  it("ArrowUp / ArrowDown also walk the cycle", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="default" onChange={mockOnChange} />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(mockOnChange).toHaveBeenLastCalledWith("comfortable");

    rerender(<StagingLayoutToggle value="default" onChange={mockOnChange} />);
    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(mockOnChange).toHaveBeenLastCalledWith("compact");
  });

  it("ignores unrelated keys", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "Enter" });
    fireEvent.keyDown(group, { key: "Tab" });
    fireEvent.keyDown(group, { key: "a" });

    expect(mockOnChange).not.toHaveBeenCalled();
  });
});

describe("StagingLayoutToggle — WCAG 1.4.1 non-color indicator (CRIT-Y2)", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a visible non-color indicator on the active radio", () => {
    const { rerender } = render(
      <StagingLayoutToggle value="compact" onChange={mockOnChange} />,
    );

    // Exactly one indicator is visible — on the active radio
    const indicators = screen.getAllByTestId("staging-layout-active-indicator");
    expect(indicators).toHaveLength(1);

    // It must live inside the checked radio, not the unchecked ones
    const compactRadio = screen.getByRole("radio", { name: "Compact" });
    expect(compactRadio).toContainElement(indicators[0]);

    // Switch active — indicator moves, still exactly one
    rerender(
      <StagingLayoutToggle value="comfortable" onChange={mockOnChange} />,
    );
    const nextIndicators = screen.getAllByTestId(
      "staging-layout-active-indicator",
    );
    expect(nextIndicators).toHaveLength(1);

    const comfortableRadio = screen.getByRole("radio", {
      name: "Comfortable",
    });
    expect(comfortableRadio).toContainElement(nextIndicators[0]);
  });

  it("the non-color indicator is hidden from assistive tech (aria-hidden)", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    // The selection state is already conveyed via aria-checked on the radio,
    // so the visual indicator must not be double-announced to screen readers.
    const indicator = screen.getByTestId("staging-layout-active-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
  });
});

describe("StagingLayoutToggle — accessible name hygiene (CRIT-Y2)", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("each radio has aria-label as its single accessible name source", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    for (const name of ["Compact", "Default", "Comfortable"] as const) {
      const radio = screen.getByRole("radio", { name });
      expect(radio).toHaveAttribute("aria-label", name);
    }
  });

  it("does NOT use a title attribute (would create a browser tooltip that interferes with keyboard navigation)", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    for (const name of ["Compact", "Default", "Comfortable"] as const) {
      const radio = screen.getByRole("radio", { name });
      expect(radio).not.toHaveAttribute("title");
    }
  });

  it("does NOT render an sr-only duplicate label span inside each radio", () => {
    const { container } = render(
      <StagingLayoutToggle value="default" onChange={mockOnChange} />,
    );

    // Prior (buggy) implementation rendered <span class="sr-only">Compact</span>
    // inside each button in addition to the aria-label. Screen readers then
    // announced the label twice. Guard against regression.
    const srOnlySpans = container.querySelectorAll("span.sr-only");
    expect(srOnlySpans.length).toBe(0);
  });

  it("the accessible name queried via getByRole matches the aria-label exactly (no doubling)", () => {
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    // getByRole with an exact string match would fail if the accessible name
    // were "Compact Compact" from a duplicate sr-only span.
    expect(
      screen.getByRole("radio", { name: "Compact" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Default" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Comfortable" }),
    ).toBeInTheDocument();
  });
});
