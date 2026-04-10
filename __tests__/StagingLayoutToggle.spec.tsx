/**
 * StagingLayoutToggle — single toggle button
 *
 * Replaced the Sprint 3 ToolbarRadioGroup (3 radio options) with a single
 * button that toggles between "compact" and "comfortable". The "default"
 * size is still honored by the hook (backward compat with persisted
 * localStorage) — clicking the toggle from "default" moves to "comfortable",
 * then the next click goes to "compact".
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
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

describe("StagingLayoutToggle — single toggle button", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders a single button (not a radiogroup)", () => {
    render(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);

    expect(screen.getByRole("button")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).not.toBeInTheDocument();
    expect(screen.queryByRole("radio")).not.toBeInTheDocument();
  });

  it("shows Maximize icon and 'Comfortable' aria-label when in compact mode", () => {
    render(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);

    const button = screen.getByRole("button", { name: "Comfortable" });
    expect(button).toBeInTheDocument();
  });

  it("shows Minimize icon and 'Compact' aria-label when in comfortable mode", () => {
    render(<StagingLayoutToggle value="comfortable" onChange={mockOnChange} />);

    const button = screen.getByRole("button", { name: "Compact" });
    expect(button).toBeInTheDocument();
  });

  it("clicking toggles from compact to comfortable", () => {
    render(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnChange).toHaveBeenCalledWith("comfortable");
  });

  it("clicking toggles from comfortable to compact", () => {
    render(<StagingLayoutToggle value="comfortable" onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnChange).toHaveBeenCalledWith("compact");
  });

  it("clicking toggles from 'default' (legacy) to comfortable", () => {
    // "default" is a persisted legacy value from the old 3-option toggle.
    // The toggle treats it as "not expanded" → clicking moves to comfortable.
    render(<StagingLayoutToggle value="default" onChange={mockOnChange} />);

    fireEvent.click(screen.getByRole("button"));
    expect(mockOnChange).toHaveBeenCalledWith("comfortable");
  });

  it("has the staging-layout-toggle data-testid", () => {
    render(<StagingLayoutToggle value="compact" onChange={mockOnChange} />);

    expect(screen.getByTestId("staging-layout-toggle")).toBeInTheDocument();
  });
});
