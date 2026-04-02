/**
 * ViewModeToggle component tests
 *
 * Tests: renders list/deck options, calls onChange, aria-checked states,
 * persistence via localStorage.
 */
import "@testing-library/jest-dom";
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import { ViewModeToggle, getPersistedViewMode, persistViewMode } from "@/components/staging/ViewModeToggle";

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const dict: Record<string, string> = {
        "deck.viewModeList": "List",
        "deck.viewModeDeck": "Deck",
      };
      return dict[key] ?? key;
    },
    locale: "en",
  })),
}));

describe("ViewModeToggle", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("renders list and deck buttons", () => {
    render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    expect(screen.getByText("List")).toBeInTheDocument();
    expect(screen.getByText("Deck")).toBeInTheDocument();
  });

  it("marks list as checked when value is list", () => {
    render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    const listBtn = screen.getByText("List").closest("button")!;
    const deckBtn = screen.getByText("Deck").closest("button")!;

    expect(listBtn).toHaveAttribute("aria-checked", "true");
    expect(deckBtn).toHaveAttribute("aria-checked", "false");
  });

  it("marks deck as checked when value is deck", () => {
    render(<ViewModeToggle value="deck" onChange={mockOnChange} />);

    const listBtn = screen.getByText("List").closest("button")!;
    const deckBtn = screen.getByText("Deck").closest("button")!;

    expect(listBtn).toHaveAttribute("aria-checked", "false");
    expect(deckBtn).toHaveAttribute("aria-checked", "true");
  });

  it("calls onChange with deck when deck button clicked", () => {
    render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    fireEvent.click(screen.getByText("Deck"));
    expect(mockOnChange).toHaveBeenCalledWith("deck");
  });

  it("calls onChange with list when list button clicked", () => {
    render(<ViewModeToggle value="deck" onChange={mockOnChange} />);

    fireEvent.click(screen.getByText("List"));
    expect(mockOnChange).toHaveBeenCalledWith("list");
  });

  it("persists view mode to localStorage", () => {
    render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    fireEvent.click(screen.getByText("Deck"));
    expect(localStorage.getItem("jobsync-staging-view-mode")).toBe("deck");
  });
});

describe("getPersistedViewMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns list when nothing stored", () => {
    expect(getPersistedViewMode()).toBe("list");
  });

  it("returns deck when deck is stored", () => {
    localStorage.setItem("jobsync-staging-view-mode", "deck");
    expect(getPersistedViewMode()).toBe("deck");
  });

  it("returns list for invalid stored values", () => {
    localStorage.setItem("jobsync-staging-view-mode", "invalid");
    expect(getPersistedViewMode()).toBe("list");
  });
});

describe("persistViewMode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("writes to localStorage", () => {
    persistViewMode("deck");
    expect(localStorage.getItem("jobsync-staging-view-mode")).toBe("deck");
  });
});

describe("ViewModeToggle — arrow key navigation", () => {
  const mockOnChange = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
  });

  it("ArrowRight switches from list to deck and calls onChange", () => {
    render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    const radiogroup = screen.getByRole("radiogroup");
    fireEvent.keyDown(radiogroup, { key: "ArrowRight" });

    expect(mockOnChange).toHaveBeenCalledWith("deck");
  });

  it("ArrowLeft switches from deck to list and calls onChange", () => {
    render(<ViewModeToggle value="deck" onChange={mockOnChange} />);

    const radiogroup = screen.getByRole("radiogroup");
    fireEvent.keyDown(radiogroup, { key: "ArrowLeft" });

    expect(mockOnChange).toHaveBeenCalledWith("list");
  });

  it("only the selected radio has tabIndex 0, the other has tabIndex -1", () => {
    const { rerender } = render(<ViewModeToggle value="list" onChange={mockOnChange} />);

    const listBtn = screen.getByText("List").closest("button")!;
    const deckBtn = screen.getByText("Deck").closest("button")!;

    expect(listBtn).toHaveAttribute("tabindex", "0");
    expect(deckBtn).toHaveAttribute("tabindex", "-1");

    rerender(<ViewModeToggle value="deck" onChange={mockOnChange} />);

    expect(listBtn).toHaveAttribute("tabindex", "-1");
    expect(deckBtn).toHaveAttribute("tabindex", "0");
  });
});
