/**
 * ToolbarRadioGroup primitive tests — Sprint 2 Stream G H-Y-06 / H-Y-07.
 *
 * The primitive exists to stop the CRIT-Y2 flashlight effect: every new
 * segmented-button toolbar was reinventing the same ARIA pattern and
 * forgetting the non-color active-state indicator. These tests lock in:
 *
 *   1. WCAG 1.4.1 — the active option renders a non-color indicator
 *      (Check glyph) in addition to the background color change.
 *   2. APG radio-group pattern — role="radiogroup" + role="radio" +
 *      aria-checked + roving tabindex + arrow-key navigation.
 *   3. Translated aria-label per option (callers MUST pass translated
 *      strings — the primitive never falls back to English).
 *   4. Callback wiring — onChange fires with the correct value on click
 *      and on arrow-key selection changes.
 *
 * These tests are the regression guard for every component that migrates
 * onto ToolbarRadioGroup (ViewModeToggle, KanbanViewModeToggle, and all
 * three dashboard toggles).
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import {
  ToolbarRadioGroup,
  type ToolbarRadioOption,
} from "@/components/ui/toolbar-radio-group";

type Mode = "list" | "deck" | "grid";

const threeOptions: ToolbarRadioOption<Mode>[] = [
  { value: "list", label: "List" },
  { value: "deck", label: "Deck" },
  { value: "grid", label: "Grid" },
];

describe("ToolbarRadioGroup — ARIA structure (APG radiogroup pattern)", () => {
  it("renders role=radiogroup with the translated aria-label", () => {
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "View mode" });
    expect(group).toBeInTheDocument();

    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(3);
  });

  it("renders each option as a real button with role=radio + aria-label", () => {
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="deck"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    for (const { label } of threeOptions) {
      const radio = screen.getByRole("radio", { name: label });
      expect(radio.tagName).toBe("BUTTON");
      expect(radio).toHaveAttribute("type", "button");
      expect(radio).toHaveAttribute("aria-label", label);
    }
  });

  it("marks only the matching option as aria-checked=true", () => {
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="deck"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByRole("radio", { name: "Deck" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

describe("ToolbarRadioGroup — roving tabindex", () => {
  it("puts only the selected option in the tab order", () => {
    const { rerender } = render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
      "tabindex",
      "0",
    );
    expect(screen.getByRole("radio", { name: "Deck" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute(
      "tabindex",
      "-1",
    );

    rerender(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="grid"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    expect(screen.getByRole("radio", { name: "List" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    expect(screen.getByRole("radio", { name: "Grid" })).toHaveAttribute(
      "tabindex",
      "0",
    );
  });
});

describe("ToolbarRadioGroup — onChange wiring", () => {
  it("fires onChange when an inactive option is clicked", () => {
    const onChange = jest.fn();
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "Deck" }));
    expect(onChange).toHaveBeenCalledWith("deck");
  });

  it("does NOT fire onChange when the active option is re-clicked", () => {
    const onChange = jest.fn();
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    fireEvent.click(screen.getByRole("radio", { name: "List" }));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ToolbarRadioGroup — arrow key navigation", () => {
  it("ArrowRight moves to the next option and wraps", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("deck");

    rerender(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="deck"
        onChange={onChange}
        options={threeOptions}
      />,
    );
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("grid");

    rerender(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="grid"
        onChange={onChange}
        options={threeOptions}
      />,
    );
    fireEvent.keyDown(group, { key: "ArrowRight" });
    expect(onChange).toHaveBeenLastCalledWith("list");
  });

  it("ArrowLeft walks backwards and wraps", () => {
    const onChange = jest.fn();
    const { rerender } = render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("grid");

    rerender(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="grid"
        onChange={onChange}
        options={threeOptions}
      />,
    );
    fireEvent.keyDown(group, { key: "ArrowLeft" });
    expect(onChange).toHaveBeenLastCalledWith("deck");
  });

  it("ArrowUp and ArrowDown also walk the cycle", () => {
    const onChange = jest.fn();
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="deck"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    const group = screen.getByRole("radiogroup");

    fireEvent.keyDown(group, { key: "ArrowDown" });
    expect(onChange).toHaveBeenLastCalledWith("grid");

    fireEvent.keyDown(group, { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith("list");
  });

  it("ignores unrelated keys", () => {
    const onChange = jest.fn();
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={onChange}
        options={threeOptions}
      />,
    );

    const group = screen.getByRole("radiogroup");
    fireEvent.keyDown(group, { key: "Enter" });
    fireEvent.keyDown(group, { key: "a" });
    fireEvent.keyDown(group, { key: "Tab" });

    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("ToolbarRadioGroup — WCAG 1.4.1 non-color active indicator", () => {
  it("renders exactly one Check glyph on the active option", () => {
    const { rerender } = render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    const indicators = screen.getAllByTestId(
      "toolbar-radio-active-indicator",
    );
    expect(indicators).toHaveLength(1);

    const listRadio = screen.getByRole("radio", { name: "List" });
    expect(listRadio).toContainElement(indicators[0]);

    rerender(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="grid"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    const nextIndicators = screen.getAllByTestId(
      "toolbar-radio-active-indicator",
    );
    expect(nextIndicators).toHaveLength(1);
    const gridRadio = screen.getByRole("radio", { name: "Grid" });
    expect(gridRadio).toContainElement(nextIndicators[0]);
  });

  it("the non-color indicator is hidden from assistive tech", () => {
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="list"
        onChange={jest.fn()}
        options={threeOptions}
      />,
    );

    const indicator = screen.getByTestId("toolbar-radio-active-indicator");
    expect(indicator).toHaveAttribute("aria-hidden", "true");
  });

  it("honors a custom activeIndicatorTestId", () => {
    render(
      <ToolbarRadioGroup<Mode>
        ariaLabel="View mode"
        value="deck"
        onChange={jest.fn()}
        options={threeOptions}
        activeIndicatorTestId="staging-view-mode-active-indicator"
      />,
    );

    expect(
      screen.getByTestId("staging-view-mode-active-indicator"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("toolbar-radio-active-indicator"),
    ).not.toBeInTheDocument();
  });
});

describe("ToolbarRadioGroup — translated label contract", () => {
  it("uses the caller-provided label verbatim as the accessible name", () => {
    // Guard against regressing to a hardcoded English fallback. A
    // German caller must see German text in the a11y tree.
    const german: ToolbarRadioOption<"table" | "kanban">[] = [
      { value: "table", label: "Tabelle" },
      { value: "kanban", label: "Kanban" },
    ];

    render(
      <ToolbarRadioGroup<"table" | "kanban">
        ariaLabel="Ansichtsmodus"
        value="table"
        onChange={jest.fn()}
        options={german}
      />,
    );

    expect(
      screen.getByRole("radiogroup", { name: "Ansichtsmodus" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Tabelle" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("radio", { name: "Kanban" }),
    ).toBeInTheDocument();
  });
});
