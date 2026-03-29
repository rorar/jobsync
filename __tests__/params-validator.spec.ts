import { moduleRegistry } from "@/lib/connector/registry";
import { validateConnectorParams, type ValidationResult } from "@/lib/connector/params-validator";
import {
  ConnectorType,
  CredentialType,
  type ConnectorParamsSchema,
  type JobDiscoveryManifest,
  type ModuleManifest,
} from "@/lib/connector/manifest";

/**
 * Tests for ConnectorParams validation against module manifest schema.
 *
 * The arbeitsagentur manifest schema shape (Array-based):
 *   [
 *     { key: "umkreis", type: "number", label: "automations.params.umkreis", defaultValue: 25 },
 *     { key: "arbeitszeit", type: "select", label: "automations.params.arbeitszeit", options: ["vz", "tz", ...] },
 *     ...
 *   ]
 */

describe("validateConnectorParams", () => {
  let testCounter = 0;

  function uniqueId(prefix = "val-mod"): string {
    testCounter += 1;
    return `${prefix}-${testCounter}-${Date.now()}`;
  }

  function registerModuleWithSchema(
    id: string,
    connectorParamsSchema?: ConnectorParamsSchema,
  ): void {
    const manifest: JobDiscoveryManifest = {
      id,
      name: `Test ${id}`,
      manifestVersion: 1,
      connectorType: ConnectorType.JOB_DISCOVERY,
      credential: {
        type: CredentialType.NONE,
        moduleId: id,
        required: false,
        sensitive: false,
      },
      connectorParamsSchema,
    };
    moduleRegistry.register(manifest, jest.fn());
  }

  describe("unknown module", () => {
    it("should return invalid for an unknown module ID", () => {
      const result = validateConnectorParams("totally-unknown-module-xyz-999", { foo: "bar" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Unknown module/);
    });
  });

  describe("module without schema", () => {
    it("should return valid when no schema is declared (pass-through)", () => {
      const id = uniqueId("no-schema");
      registerModuleWithSchema(id, undefined);

      const result = validateConnectorParams(id, { anything: "goes" });

      expect(result.valid).toBe(true);
      expect(result.errors).toBeUndefined();
    });

    it("should return valid when no schema and null params", () => {
      const id = uniqueId("no-schema-null");
      registerModuleWithSchema(id, undefined);

      const result = validateConnectorParams(id, null);

      expect(result.valid).toBe(true);
    });
  });

  describe("null/undefined params with schema", () => {
    it("should return valid when params are null and schema exists", () => {
      const id = uniqueId("null-params");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius" },
      ]);

      const result = validateConnectorParams(id, null);

      expect(result.valid).toBe(true);
    });

    it("should return valid when params are undefined and schema exists", () => {
      const id = uniqueId("undef-params");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius" },
      ]);

      const result = validateConnectorParams(id, undefined);

      expect(result.valid).toBe(true);
    });
  });

  describe("valid params", () => {
    it("should return valid for correct number field", () => {
      const id = uniqueId("valid-number");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius (km)", defaultValue: 25 },
      ]);

      const result = validateConnectorParams(id, { umkreis: 50 });

      expect(result.valid).toBe(true);
    });

    it("should return valid for correct select field", () => {
      const id = uniqueId("valid-select");
      registerModuleWithSchema(id, [
        { key: "arbeitszeit", type: "select", label: "Working time", options: ["vz", "tz", "snw"] },
      ]);

      const result = validateConnectorParams(id, { arbeitszeit: "vz" });

      expect(result.valid).toBe(true);
    });

    it("should return valid for numeric select options", () => {
      const id = uniqueId("valid-numeric-select");
      registerModuleWithSchema(id, [
        { key: "befristung", type: "select", label: "Contract type", options: [1, 2] },
      ]);

      const result = validateConnectorParams(id, { befristung: 1 });

      expect(result.valid).toBe(true);
    });

    it("should return valid when string value matches numeric option via coercion", () => {
      const id = uniqueId("valid-coercion");
      registerModuleWithSchema(id, [
        { key: "befristung", type: "select", label: "Contract type", options: [1, 2] },
      ]);

      // Form serialization may send "1" instead of 1
      const result = validateConnectorParams(id, { befristung: "1" });

      expect(result.valid).toBe(true);
    });

    it("should return valid for multiple correct fields", () => {
      const id = uniqueId("valid-multi");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius (km)", defaultValue: 25 },
        { key: "veroeffentlichtseit", type: "number", label: "Published within (days)", defaultValue: 7 },
        { key: "arbeitszeit", type: "select", label: "Working time", options: ["vz", "tz", "snw", "mj", "ho"] },
        { key: "befristung", type: "select", label: "Contract type", options: [1, 2] },
      ]);

      const result = validateConnectorParams(id, {
        umkreis: 25,
        veroeffentlichtseit: 14,
        arbeitszeit: "tz",
        befristung: 2,
      });

      expect(result.valid).toBe(true);
    });

    it("should return valid when providing only a subset of optional fields", () => {
      const id = uniqueId("valid-subset");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius (km)" },
        { key: "arbeitszeit", type: "select", label: "Working time", options: ["vz", "tz"] },
      ]);

      // Only provide umkreis, skip arbeitszeit
      const result = validateConnectorParams(id, { umkreis: 10 });

      expect(result.valid).toBe(true);
    });

    it("should return valid with empty params object and no required fields", () => {
      const id = uniqueId("valid-empty");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius" },
      ]);

      const result = validateConnectorParams(id, {});

      expect(result.valid).toBe(true);
    });
  });

  describe("invalid params", () => {
    it("should fail for missing required field", () => {
      const id = uniqueId("missing-required");
      registerModuleWithSchema(id, [
        { key: "apiKey", type: "string", label: "API Key", required: true },
      ]);

      const result = validateConnectorParams(id, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes("Missing required field: apiKey"))).toBe(true);
    });

    it("should fail for invalid select option value", () => {
      const id = uniqueId("invalid-select");
      registerModuleWithSchema(id, [
        { key: "arbeitszeit", type: "select", label: "Working time", options: ["vz", "tz", "snw"] },
      ]);

      const result = validateConnectorParams(id, { arbeitszeit: "invalid-value" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid value for arbeitszeit/);
      expect(result.errors![0]).toMatch(/Allowed:/);
    });

    it("should fail for wrong type on number field", () => {
      const id = uniqueId("wrong-type-number");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius (km)" },
      ]);

      const result = validateConnectorParams(id, { umkreis: "not-a-number" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid type for umkreis/);
      expect(result.errors![0]).toMatch(/expected number/);
    });

    it("should fail for wrong type on boolean field", () => {
      const id = uniqueId("wrong-type-boolean");
      registerModuleWithSchema(id, [
        { key: "remote", type: "boolean", label: "Remote only" },
      ]);

      const result = validateConnectorParams(id, { remote: "yes" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid type for remote/);
      expect(result.errors![0]).toMatch(/expected boolean/);
    });

    it("should collect multiple errors at once", () => {
      const id = uniqueId("multi-error");
      registerModuleWithSchema(id, [
        { key: "apiKey", type: "string", label: "API Key", required: true },
        { key: "umkreis", type: "number", label: "Radius (km)" },
        { key: "arbeitszeit", type: "select", label: "Working time", options: ["vz", "tz"] },
      ]);

      const result = validateConnectorParams(id, {
        // apiKey missing (required)
        umkreis: "not-a-number",
        arbeitszeit: "invalid",
      });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.length).toBe(3);
    });
  });

  describe("multiselect validation", () => {
    it("should return valid for correct multiselect array", () => {
      const id = uniqueId("valid-multiselect");
      registerModuleWithSchema(id, [
        { key: "codes", type: "multiselect", label: "Codes", options: ["a", "b", "c"] },
      ]);

      const result = validateConnectorParams(id, { codes: ["a", "c"] });

      expect(result.valid).toBe(true);
    });

    it("should return valid for empty multiselect array", () => {
      const id = uniqueId("valid-multiselect-empty");
      registerModuleWithSchema(id, [
        { key: "codes", type: "multiselect", label: "Codes", options: ["a", "b"] },
      ]);

      const result = validateConnectorParams(id, { codes: [] });

      expect(result.valid).toBe(true);
    });

    it("should fail when multiselect value is not an array", () => {
      const id = uniqueId("invalid-multiselect-type");
      registerModuleWithSchema(id, [
        { key: "codes", type: "multiselect", label: "Codes", options: ["a", "b"] },
      ]);

      const result = validateConnectorParams(id, { codes: "a" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/expected array/);
    });

    it("should fail when multiselect contains invalid option", () => {
      const id = uniqueId("invalid-multiselect-option");
      registerModuleWithSchema(id, [
        { key: "codes", type: "multiselect", label: "Codes", options: ["a", "b", "c"] },
      ]);

      const result = validateConnectorParams(id, { codes: ["a", "invalid"] });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid value in codes: "invalid"/);
    });
  });

  describe("number min/max validation", () => {
    it("should return valid when number is within range", () => {
      const id = uniqueId("valid-range");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius", min: 0, max: 200 },
      ]);

      const result = validateConnectorParams(id, { radius: 50 });

      expect(result.valid).toBe(true);
    });

    it("should fail when number is below min", () => {
      const id = uniqueId("below-min");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius", min: 0, max: 200 },
      ]);

      const result = validateConnectorParams(id, { radius: -5 });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/minimum is 0/);
    });

    it("should fail when number is above max", () => {
      const id = uniqueId("above-max");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius", min: 0, max: 200 },
      ]);

      const result = validateConnectorParams(id, { radius: 300 });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/maximum is 200/);
    });

    it("should accept boundary values (min and max inclusive)", () => {
      const id = uniqueId("boundary");
      registerModuleWithSchema(id, [
        { key: "radius", type: "number", label: "Radius", min: 0, max: 200 },
      ]);

      expect(validateConnectorParams(id, { radius: 0 }).valid).toBe(true);
      expect(validateConnectorParams(id, { radius: 200 }).valid).toBe(true);
    });
  });

  describe("edge cases", () => {
    it("should allow extra params not in the schema (pass-through unknown fields)", () => {
      const id = uniqueId("extra-params");
      registerModuleWithSchema(id, [
        { key: "umkreis", type: "number", label: "Radius" },
      ]);

      const result = validateConnectorParams(id, {
        umkreis: 25,
        unknownField: "some value",
      });

      expect(result.valid).toBe(true);
    });

    it("should handle schema with minimal field descriptor gracefully", () => {
      const id = uniqueId("minimal-desc");
      registerModuleWithSchema(id, [
        { key: "someField", type: "string", label: "Some field" },
      ]);

      const result = validateConnectorParams(id, { someField: "anything" });

      expect(result.valid).toBe(true);
    });
  });
});
