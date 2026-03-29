import React from "react";
import "@testing-library/jest-dom";
import { render, screen, fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DynamicParamsForm } from "@/components/automations/DynamicParamsForm";
import type { ConnectorParamsSchema } from "@/lib/connector/manifest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("@/i18n", () => ({
  useTranslations: jest.fn(() => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        "automations.connectorParams": "Advanced Search Options",
        "automations.params.radius": "Radius",
        "automations.params.keyword": "Keyword",
        "automations.params.remoteOnly": "Remote Only",
        "automations.params.workingTime": "Working Time",
        "automations.params.offeringType": "Offering Type",
        "automations.paramOption.test-module.workingTime.fulltime": "Full Time",
        "automations.paramOption.test-module.workingTime.parttime": "Part Time",
        "automations.paramOption.test-module.offeringType.contract": "Contract",
      };
      return translations[key] ?? key;
    },
    locale: "en",
  })),
}));

// Radix Select and Switch need these polyfills
global.ResizeObserver = jest.fn().mockImplementation(() => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));

window.HTMLElement.prototype.scrollIntoView = jest.fn();
window.HTMLElement.prototype.hasPointerCapture = jest.fn();

document.createRange = () => {
  const range = new Range();
  range.getBoundingClientRect = jest.fn().mockReturnValue({
    bottom: 0, height: 0, left: 0, right: 0, top: 0, width: 0,
  });
  range.getClientRects = () => ({
    item: () => null,
    length: 0,
    [Symbol.iterator]: jest.fn(),
  });
  return range;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderForm(
  schema: ConnectorParamsSchema,
  values: Record<string, unknown> = {},
  onChange = jest.fn(),
) {
  return render(
    <DynamicParamsForm
      moduleId="test-module"
      schema={schema}
      values={values}
      onChange={onChange}
    />,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("DynamicParamsForm", () => {
  describe("empty / null schema", () => {
    it("renders nothing when schema is an empty array", () => {
      const { container } = renderForm([]);
      expect(container.firstChild).toBeNull();
    });

    it("renders nothing when schema is null/undefined cast to empty", () => {
      // DynamicParamsForm guards on `!schema || schema.length === 0`
      const { container } = render(
        <DynamicParamsForm
          moduleId="test-module"
          schema={null as unknown as ConnectorParamsSchema}
          values={{}}
          onChange={jest.fn()}
        />,
      );
      expect(container.firstChild).toBeNull();
    });
  });

  describe("section header", () => {
    it("renders 'Advanced Search Options' heading when schema has fields", () => {
      renderForm([{ key: "radius", type: "number", label: "automations.params.radius" }]);
      expect(screen.getByText("Advanced Search Options")).toBeInTheDocument();
    });
  });

  describe("number field", () => {
    const schema: ConnectorParamsSchema = [
      { key: "radius", type: "number", label: "automations.params.radius", min: 0, max: 200 },
    ];

    it("renders an input of type number with the translated label", () => {
      renderForm(schema);
      expect(screen.getByLabelText("Radius")).toBeInTheDocument();
      expect(screen.getByLabelText("Radius")).toHaveAttribute("type", "number");
    });

    it("renders with min and max attributes from the schema", () => {
      renderForm(schema);
      const input = screen.getByLabelText("Radius");
      expect(input).toHaveAttribute("min", "0");
      expect(input).toHaveAttribute("max", "200");
    });

    it("displays the current value", () => {
      renderForm(schema, { radius: 50 });
      expect(screen.getByLabelText("Radius")).toHaveValue(50);
    });

    it("calls onChange with a number when user changes the input value", () => {
      const onChange = jest.fn();
      renderForm(schema, {}, onChange);

      const input = screen.getByLabelText("Radius");
      // Use fireEvent.change for controlled number inputs (userEvent.type fires
      // per-keystroke and the uncontrolled DOM won't accumulate digits).
      fireEvent.change(input, { target: { value: "75" } });

      expect(onChange).toHaveBeenCalledWith("radius", 75);
    });

    it("calls onChange with undefined when user clears the input", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { radius: 50 }, onChange);

      const input = screen.getByLabelText("Radius");
      await user.clear(input);

      expect(onChange).toHaveBeenCalledWith("radius", undefined);
    });
  });

  describe("string field", () => {
    const schema: ConnectorParamsSchema = [
      { key: "keyword", type: "string", label: "automations.params.keyword", placeholder: "Enter keyword" },
    ];

    it("renders a text input with the translated label", () => {
      renderForm(schema);
      expect(screen.getByLabelText("Keyword")).toBeInTheDocument();
      expect(screen.getByLabelText("Keyword")).toHaveAttribute("type", "text");
    });

    it("renders the placeholder when provided", () => {
      renderForm(schema);
      expect(screen.getByPlaceholderText("Enter keyword")).toBeInTheDocument();
    });

    it("displays the current string value", () => {
      renderForm(schema, { keyword: "developer" });
      expect(screen.getByLabelText("Keyword")).toHaveValue("developer");
    });

    it("calls onChange with the typed string value", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, {}, onChange);

      await user.type(screen.getByLabelText("Keyword"), "engineer");

      expect(onChange).toHaveBeenCalled();
      const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1];
      expect(lastCall[0]).toBe("keyword");
      expect(typeof lastCall[1]).toBe("string");
    });

    it("calls onChange with undefined when user clears the string input", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { keyword: "developer" }, onChange);

      const input = screen.getByLabelText("Keyword");
      await user.clear(input);

      expect(onChange).toHaveBeenCalledWith("keyword", undefined);
    });
  });

  describe("boolean field", () => {
    const schema: ConnectorParamsSchema = [
      { key: "remoteOnly", type: "boolean", label: "automations.params.remoteOnly" },
    ];

    it("renders a switch (checkbox role) with the translated label", () => {
      renderForm(schema);
      expect(screen.getByLabelText("Remote Only")).toBeInTheDocument();
    });

    it("renders the switch as unchecked when value is false", () => {
      renderForm(schema, { remoteOnly: false });
      expect(screen.getByRole("switch", { name: "Remote Only" })).toHaveAttribute(
        "data-state",
        "unchecked",
      );
    });

    it("renders the switch as checked when value is true", () => {
      renderForm(schema, { remoteOnly: true });
      expect(screen.getByRole("switch", { name: "Remote Only" })).toHaveAttribute(
        "data-state",
        "checked",
      );
    });

    it("calls onChange with true when switch is toggled on", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { remoteOnly: false }, onChange);

      await user.click(screen.getByRole("switch", { name: "Remote Only" }));

      expect(onChange).toHaveBeenCalledWith("remoteOnly", true);
    });

    it("calls onChange with false when switch is toggled off", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { remoteOnly: true }, onChange);

      await user.click(screen.getByRole("switch", { name: "Remote Only" }));

      expect(onChange).toHaveBeenCalledWith("remoteOnly", false);
    });
  });

  describe("select field", () => {
    const schema: ConnectorParamsSchema = [
      {
        key: "workingTime",
        type: "select",
        label: "automations.params.workingTime",
        options: ["fulltime", "parttime"],
      },
    ];

    it("renders a select trigger with the translated label", () => {
      renderForm(schema);
      // The label appears as a <Label> element (not inside the combobox trigger's span)
      expect(screen.getAllByText("Working Time").length).toBeGreaterThanOrEqual(1);
      // The trigger button with role="combobox" must be present
      expect(screen.getByRole("combobox")).toBeInTheDocument();
    });

    it("renders all options when select is opened", async () => {
      const user = userEvent.setup();
      renderForm(schema);

      // Open the select
      await user.click(screen.getByRole("combobox"));

      expect(screen.getByText("Full Time")).toBeInTheDocument();
      expect(screen.getByText("Part Time")).toBeInTheDocument();
    });

    it("falls back to raw option value when no i18n key exists", async () => {
      const user = userEvent.setup();
      const schemaNoI18n: ConnectorParamsSchema = [
        {
          key: "workingTime",
          type: "select",
          label: "automations.params.workingTime",
          options: ["flextime"],
        },
      ];
      renderForm(schemaNoI18n);

      await user.click(screen.getByRole("combobox"));

      // No translation key exists for "flextime" in our mock — should show raw value
      expect(screen.getByText("flextime")).toBeInTheDocument();
    });

    it("restores numeric type when numeric option is selected", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      const numericSchema: ConnectorParamsSchema = [
        { key: "level", type: "select", label: "Level", options: [1, 2, 3] },
      ];
      renderForm(numericSchema, {}, onChange);

      await user.click(screen.getByRole("combobox"));
      await user.click(screen.getByText("2"));

      expect(onChange).toHaveBeenCalledWith("level", 2);
      expect(typeof onChange.mock.calls[onChange.mock.calls.length - 1][1]).toBe("number");
    });
  });

  describe("multiselect field", () => {
    const schema: ConnectorParamsSchema = [
      {
        key: "offeringType",
        type: "multiselect",
        label: "automations.params.offeringType",
        options: ["contract", "internship"],
      },
    ];

    it("renders the multiselect label", () => {
      renderForm(schema);
      // The label text appears in both the <Label> and the trigger placeholder span
      expect(screen.getAllByText("Offering Type").length).toBeGreaterThanOrEqual(1);
    });

    it("shows selected items as removable chips", () => {
      renderForm(schema, { offeringType: ["contract"] });
      expect(screen.getByText("Contract")).toBeInTheDocument();
      expect(screen.getByLabelText("Remove Contract")).toBeInTheDocument();
    });

    it("calls onChange without the removed item when chip X button is clicked", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { offeringType: ["contract", "internship"] }, onChange);

      await user.click(screen.getByLabelText("Remove Contract"));

      expect(onChange).toHaveBeenCalledWith("offeringType", ["internship"]);
    });

    it("calls onChange with undefined when the last chip is removed", async () => {
      const onChange = jest.fn();
      const user = userEvent.setup();
      renderForm(schema, { offeringType: ["contract"] }, onChange);

      await user.click(screen.getByLabelText("Remove Contract"));

      expect(onChange).toHaveBeenCalledWith("offeringType", undefined);
    });

    it("normalizes comma-separated string to array of chips", () => {
      renderForm(schema, { offeringType: "contract,internship" });
      // Both chips should appear
      expect(screen.getByLabelText("Remove Contract")).toBeInTheDocument();
    });

    it("shows N selected count in the trigger placeholder", () => {
      renderForm(schema, { offeringType: ["contract", "internship"] });
      expect(screen.getByText("2 selected")).toBeInTheDocument();
    });
  });

  describe("i18n label fallback", () => {
    it("uses raw label text when i18n key has no translation (key returned as-is)", () => {
      // Our mock returns the key unchanged if not found
      const schema: ConnectorParamsSchema = [
        { key: "unknownField", type: "string", label: "some.untranslated.key" },
      ];
      renderForm(schema);
      expect(screen.getByLabelText("some.untranslated.key")).toBeInTheDocument();
    });

    it("uses translated label when i18n key is found", () => {
      const schema: ConnectorParamsSchema = [
        { key: "radius", type: "number", label: "automations.params.radius" },
      ];
      renderForm(schema);
      expect(screen.getByLabelText("Radius")).toBeInTheDocument();
    });
  });

  describe("multiple fields in one form", () => {
    it("renders all fields from the schema array", () => {
      const schema: ConnectorParamsSchema = [
        { key: "radius", type: "number", label: "automations.params.radius" },
        { key: "keyword", type: "string", label: "automations.params.keyword" },
        { key: "remoteOnly", type: "boolean", label: "automations.params.remoteOnly" },
      ];
      renderForm(schema);

      expect(screen.getByLabelText("Radius")).toBeInTheDocument();
      expect(screen.getByLabelText("Keyword")).toBeInTheDocument();
      expect(screen.getByLabelText("Remote Only")).toBeInTheDocument();
    });
  });
});
