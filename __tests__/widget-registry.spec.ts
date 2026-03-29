/**
 * Unit tests for widget-registry.tsx
 *
 * The module is "use client" but exports pure functions with no DOM access,
 * so they can be tested in the jsdom environment without rendering.
 */

// ---------------------------------------------------------------------------
// Mocks — must be declared before import
// ---------------------------------------------------------------------------

// The registry imports two Combobox components. We mock them so Jest doesn't
// try to load the full EURES/ESCO component trees.
jest.mock("@/components/automations/EuresOccupationCombobox", () => ({
  EuresOccupationCombobox: function MockEuresOccupation() {
    return null;
  },
}));

jest.mock("@/components/automations/EuresLocationCombobox", () => ({
  EuresLocationCombobox: function MockEuresLocation() {
    return null;
  },
}));

// Mock next/dynamic to act as a pass-through that eagerly resolves the loader.
// This returns the loaded component synchronously so tests can check typeof.
jest.mock("next/dynamic", () => {
  return (loader: () => Promise<{ default: any }>) => {
    // Call the loader to get the promise, but since mocked modules resolve
    // synchronously, we can extract the component eagerly.
    let resolved: any = null;
    loader().then((mod) => { resolved = mod.default; });
    // Return a wrapper that delegates to the resolved component
    const DynamicWrapper = (props: any) => resolved ? resolved(props) : null;
    DynamicWrapper.displayName = "DynamicMock";
    return DynamicWrapper;
  };
});

import {
  getSearchFieldWidget,
  resolveWidgetOverrides,
} from "@/components/automations/widget-registry";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getSearchFieldWidget", () => {
  it("returns the EuresOccupationCombobox component for 'eures-occupation'", () => {
    const component = getSearchFieldWidget("eures-occupation");
    expect(component).not.toBeNull();
    // The component must be a function (React component)
    expect(typeof component).toBe("function");
  });

  it("returns the EuresLocationCombobox component for 'eures-location'", () => {
    const component = getSearchFieldWidget("eures-location");
    expect(component).not.toBeNull();
    expect(typeof component).toBe("function");
  });

  it("returns null for an unknown widgetId", () => {
    expect(getSearchFieldWidget("unknown-widget")).toBeNull();
  });

  it("returns null for an empty string widgetId", () => {
    expect(getSearchFieldWidget("")).toBeNull();
  });

  it("returns null for a widgetId that is almost correct (case-sensitive)", () => {
    expect(getSearchFieldWidget("EURES-OCCUPATION")).toBeNull();
    expect(getSearchFieldWidget("Eures-Occupation")).toBeNull();
  });

  it("returns distinct components for 'eures-occupation' and 'eures-location'", () => {
    const occupation = getSearchFieldWidget("eures-occupation");
    const location = getSearchFieldWidget("eures-location");
    // They must be two different component references
    expect(occupation).not.toBe(location);
  });
});

describe("resolveWidgetOverrides", () => {
  it("returns an empty object when overrides is undefined", () => {
    expect(resolveWidgetOverrides(undefined)).toEqual({});
  });

  it("returns an empty object when overrides is an empty array", () => {
    expect(resolveWidgetOverrides([])).toEqual({});
  });

  it("returns a field-to-component map for known widgetIds", () => {
    const result = resolveWidgetOverrides([
      { field: "keywords", widgetId: "eures-occupation" },
      { field: "location", widgetId: "eures-location" },
    ]);

    expect(result).toHaveProperty("keywords");
    expect(result).toHaveProperty("location");
    expect(typeof result["keywords"]).toBe("function");
    expect(typeof result["location"]).toBe("function");
  });

  it("resolves 'keywords' field to the occupation widget", () => {
    const occupationWidget = getSearchFieldWidget("eures-occupation");
    const result = resolveWidgetOverrides([
      { field: "keywords", widgetId: "eures-occupation" },
    ]);
    expect(result["keywords"]).toBe(occupationWidget);
  });

  it("resolves 'location' field to the location widget", () => {
    const locationWidget = getSearchFieldWidget("eures-location");
    const result = resolveWidgetOverrides([
      { field: "location", widgetId: "eures-location" },
    ]);
    expect(result["location"]).toBe(locationWidget);
  });

  it("silently skips unknown widgetIds (does not add an entry)", () => {
    const result = resolveWidgetOverrides([
      { field: "keywords", widgetId: "totally-unknown-widget" },
    ]);
    expect(result).not.toHaveProperty("keywords");
    expect(Object.keys(result)).toHaveLength(0);
  });

  it("handles a mix of known and unknown widgetIds", () => {
    const result = resolveWidgetOverrides([
      { field: "keywords", widgetId: "eures-occupation" },
      { field: "location", widgetId: "nonexistent-location-widget" },
    ]);
    expect(result).toHaveProperty("keywords");
    expect(result).not.toHaveProperty("location");
  });

  it("later override wins when the same field appears twice", () => {
    // Two overrides both targeting 'keywords'
    const occupationWidget = getSearchFieldWidget("eures-occupation");
    const locationWidget = getSearchFieldWidget("eures-location");

    // This is a synthetic edge case — both widgetIds are for different fields,
    // but we force them to both target 'keywords' to verify last-write-wins.
    const result = resolveWidgetOverrides([
      { field: "keywords", widgetId: "eures-occupation" },
      { field: "keywords", widgetId: "eures-location" },
    ]);
    // The second entry ("eures-location") overwrites the first
    expect(result["keywords"]).toBe(locationWidget);
    expect(result["keywords"]).not.toBe(occupationWidget);
  });

  it("produces correct map for the full EURES manifest overrides", () => {
    // Mirror of actual euresManifest.searchFieldOverrides
    const euresOverrides = [
      { field: "keywords" as const, widgetId: "eures-occupation" },
      { field: "location" as const, widgetId: "eures-location" },
    ];
    const result = resolveWidgetOverrides(euresOverrides);
    expect(Object.keys(result)).toHaveLength(2);
    expect(result).toHaveProperty("keywords");
    expect(result).toHaveProperty("location");
  });
});
