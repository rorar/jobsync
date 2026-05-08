/**
 * Unit tests for EuresLanguageCombobox
 *
 * Tests the core logic (parse/serialize, filtering, add/remove/update)
 * and basic rendering. The Popover+Command UI is mocked to avoid
 * full Radix/cmdk rendering overhead — that's covered by E2E tests.
 */

import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

// Mock next/image to render a plain <img>
jest.mock("next/image", () => ({
  __esModule: true,
  default: (props: any) => {
    const { fill, priority, ...rest } = props;
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...rest} />;
  },
}));

// Mock i18n — return key for unknown, descriptive labels for CEFR
jest.mock("@/i18n", () => ({
  useTranslations: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "automations.cefrLevel.A1": "A1 — Beginner",
        "automations.cefrLevel.A2": "A2 — Elementary",
        "automations.cefrLevel.B1": "B1 — Intermediate",
        "automations.cefrLevel.B2": "B2 — Upper intermediate",
        "automations.cefrLevel.C1": "C1 — Advanced",
        "automations.cefrLevel.C2": "C2 — Proficient",
        "automations.params.selectLanguage": "Select language...",
        "automations.searchLanguages": "Search languages...",
        "automations.languagesSelected": "{count} language(s) selected",
        "automations.maxLanguages": "Maximum {max} languages",
        "automations.noLanguagesFound": "No languages found.",
        "automations.selectCefrLevel": "Select a CEFR level to add this language",
        "common.remove": "Remove",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  }),
  formatNumber: (n: number) => String(n),
}));

// Mock fetch for /api/eures/languages
const MOCK_LANGUAGES = [
  { id: 1, isoCode: "de", label: "Deutsch" },
  { id: 2, isoCode: "en", label: "English" },
  { id: 3, isoCode: "fr", label: "français" },
];

global.fetch = jest.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve(MOCK_LANGUAGES),
  }),
) as jest.Mock;

// Mock Radix Popover — render children directly
jest.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: any) => <div data-testid="popover">{children}</div>,
  PopoverTrigger: ({ children }: any) => <div data-testid="popover-trigger">{children}</div>,
  PopoverContent: ({ children }: any) => <div data-testid="popover-content">{children}</div>,
}));

// Mock cmdk Command — render children directly
jest.mock("@/components/ui/command", () => ({
  Command: ({ children }: any) => <div data-testid="command">{children}</div>,
  CommandInput: (props: any) => (
    <input
      data-testid="command-input"
      placeholder={props.placeholder}
      value={props.value}
      onChange={(e) => props.onValueChange?.(e.target.value)}
    />
  ),
  CommandList: ({ children }: any) => <div data-testid="command-list">{children}</div>,
  CommandGroup: ({ children }: any) => <div data-testid="command-group">{children}</div>,
  CommandItem: ({ children, onSelect, disabled, className }: any) => (
    <div
      data-testid="command-item"
      data-disabled={disabled}
      className={className}
      onClick={() => !disabled && onSelect?.()}
    >
      {children}
    </div>
  ),
  CommandEmpty: ({ children }: any) => <div data-testid="command-empty">{children}</div>,
}));

// Mock Shadcn Select — render as native select for testability
jest.mock("@/components/ui/select", () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {React.Children.map(children, (child: any) =>
        React.isValidElement(child) ? React.cloneElement(child as any, { onValueChange, value }) : child
      )}
    </div>
  ),
  SelectTrigger: ({ children, className }: any) => (
    <div data-testid="select-trigger" className={className}>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: any) => <div data-testid="select-content">{children}</div>,
  SelectItem: ({ children, value, onValueChange }: any) => (
    <div data-testid="select-item" data-value={value} onClick={() => onValueChange?.(value)}>
      {children}
    </div>
  ),
}));

// Mock cn utility
jest.mock("@/lib/utils", () => ({
  cn: (...args: any[]) => args.filter(Boolean).join(" "),
}));

import { EuresLanguageCombobox } from "@/components/automations/EuresLanguageCombobox";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("EuresLanguageCombobox", () => {
  const defaultProps = {
    field: { key: "requiredLanguages", type: "language-proficiency" as const, label: "automations.params.requiredLanguages" },
    value: undefined as unknown,
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
  });

  describe("rendering", () => {
    it("renders the combobox trigger", () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      const trigger = screen.getByRole("combobox");
      expect(trigger).toBeInTheDocument();
      expect(trigger).toHaveTextContent("Select language...");
    });

    it("shows hint text when no languages are selected", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      // Wait for fetch to resolve
      await screen.findByText("Select a CEFR level to add this language");
    });

    it("fetches languages on mount", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");
      expect(global.fetch).toHaveBeenCalledWith("/api/eures/languages");
    });
  });

  describe("serialization format", () => {
    it("parses existing value 'de(B2), en(C1)' into entries", () => {
      render(
        <EuresLanguageCombobox {...defaultProps} value="de(B2), en(C1)" />,
      );
      // Should show 2 selected entries
      const removeButtons = screen.getAllByRole("button", { name: /Remove/ });
      expect(removeButtons).toHaveLength(2);
    });

    it("shows selected count in trigger when entries exist", () => {
      render(
        <EuresLanguageCombobox {...defaultProps} value="de(B2)" />,
      );
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveTextContent("1 language(s) selected");
    });

    it("handles empty string value", () => {
      render(<EuresLanguageCombobox {...defaultProps} value="" />);
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveTextContent("Select language...");
    });

    it("handles malformed entries gracefully", () => {
      render(
        <EuresLanguageCombobox {...defaultProps} value="invalid, de(B2), also-bad" />,
      );
      // Only de(B2) should parse — 1 remove button
      const removeButtons = screen.getAllByRole("button", { name: /Remove/ });
      expect(removeButtons).toHaveLength(1);
    });
  });

  describe("add/remove/update", () => {
    it("calls onChange with serialized value when removing an entry", async () => {
      const onChange = jest.fn();
      render(
        <EuresLanguageCombobox
          {...defaultProps}
          value="de(B2), en(C1)"
          onChange={onChange}
        />,
      );

      // Click the first remove button
      const removeButtons = screen.getAllByRole("button", { name: /Remove/ });
      fireEvent.click(removeButtons[0]);

      expect(onChange).toHaveBeenCalledWith("requiredLanguages", "en(C1)");
    });

    it("calls onChange with undefined when removing the last entry", () => {
      const onChange = jest.fn();
      render(
        <EuresLanguageCombobox
          {...defaultProps}
          value="de(B2)"
          onChange={onChange}
        />,
      );

      const removeButton = screen.getByRole("button", { name: /Remove/ });
      fireEvent.click(removeButton);

      expect(onChange).toHaveBeenCalledWith("requiredLanguages", undefined);
    });
  });

  describe("CEFR level display", () => {
    it("renders CEFR levels for each language in dropdown", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Each of the 3 mock languages should have 6 CEFR items
      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(3 * 6); // 3 languages × 6 levels
    });
  });

  describe("cross-level token filtering", () => {
    it("language-only search shows matching language with all 6 CEFR levels", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Type "Deutsch" — should filter to just German
      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "Deutsch" } });

      // Should show 1 language group × 6 CEFR levels = 6 CEFR items
      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(6);
    });

    it("mixed search narrows both language and CEFR level", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Type "Deutsch Beginner" — "Deutsch" matches language, "Beginner" matches A1
      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "Deutsch Beginner" } });

      // Should show 1 language group × 1 CEFR level = 1 CEFR item
      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(1);
      expect(cefrItems[0]).toHaveTextContent("A1 — Beginner");
    });

    it("mixed search with CEFR code narrows to that level", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Type "English B2" — "English" matches language, "B2" matches level code
      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "English B2" } });

      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(1);
      expect(cefrItems[0]).toHaveTextContent("B2 — Upper intermediate");
    });

    it("level-only search shows all languages with all levels (Q4 decision)", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Type "B2" alone — no language token, only level token
      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "B2" } });

      // Q4: pure level-only does NOT filter — all 3 languages × 6 levels
      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(3 * 6);
    });

    it("empty search shows all languages with all levels", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // All 3 mock languages × 6 CEFR levels
      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(18);
    });

    it("multiple level tokens narrow to multiple CEFR levels", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      // Type "fr Advanced Proficient" — "fr" matches French, "Advanced" matches C1, "Proficient" matches C2
      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "fr Advanced Proficient" } });

      const cefrItems = screen.getAllByText(/^[ABC][12] —/);
      expect(cefrItems.length).toBe(2);
    });

    it("non-matching search shows empty state", async () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      await screen.findByText("Select a CEFR level to add this language");

      const input = screen.getByTestId("command-input");
      fireEvent.change(input, { target: { value: "Klingon" } });

      // No language matches — should show empty state
      expect(screen.getByTestId("command-empty")).toHaveTextContent("No languages found.");
    });
  });

  describe("max languages", () => {
    it("disables trigger when max languages reached", () => {
      // 10 languages at max
      const maxValue = Array.from({ length: 10 }, (_, i) => {
        const codes = ["de", "en", "fr", "es", "it", "pt", "nl", "pl", "sv", "da"];
        return `${codes[i]}(B2)`;
      }).join(", ");

      render(
        <EuresLanguageCombobox {...defaultProps} value={maxValue} />,
      );

      const trigger = screen.getByRole("combobox");
      expect(trigger).toBeDisabled();
      expect(trigger).toHaveTextContent("Maximum 10 languages");
    });
  });

  describe("accessibility", () => {
    it("has aria-live region for announcements", () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      const liveRegion = screen.getByRole("status");
      expect(liveRegion).toBeInTheDocument();
      expect(liveRegion).toHaveClass("sr-only");
    });

    it("remove buttons have descriptive aria-labels", () => {
      render(
        <EuresLanguageCombobox {...defaultProps} value="de(B2)" />,
      );
      const removeButton = screen.getByRole("button", { name: /Remove/ });
      expect(removeButton).toHaveAttribute("aria-label");
      expect(removeButton.getAttribute("aria-label")).toContain("Remove");
    });

    it("trigger has aria-expanded attribute", () => {
      render(<EuresLanguageCombobox {...defaultProps} />);
      const trigger = screen.getByRole("combobox");
      expect(trigger).toHaveAttribute("aria-expanded");
    });
  });
});
