import { moduleRegistry } from "@/lib/connector/registry";
import { validateConnectorParams, type ValidationResult } from "@/lib/connector/params-validator";
import {
  ConnectorType,
  CredentialType,
  type JobDiscoveryManifest,
  type ModuleManifest,
} from "@/lib/connector/manifest";

/**
 * Tests for ConnectorParams validation against module manifest schema.
 *
 * The arbeitsagentur manifest schema shape (flat Record):
 *   {
 *     umkreis: { type: "number", label: "Radius (km)", defaultValue: 25 },
 *     arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz", ...] },
 *     ...
 *   }
 */

describe("validateConnectorParams", () => {
  let testCounter = 0;

  function uniqueId(prefix = "val-mod"): string {
    testCounter += 1;
    return `${prefix}-${testCounter}-${Date.now()}`;
  }

  function registerModuleWithSchema(
    id: string,
    connectorParamsSchema?: Record<string, unknown>,
  ): void {
    const manifest: JobDiscoveryManifest = {
      id,
      name: `Test ${id}`,
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
      registerModuleWithSchema(id, {
        radius: { type: "number", label: "Radius" },
      });

      const result = validateConnectorParams(id, null);

      expect(result.valid).toBe(true);
    });

    it("should return valid when params are undefined and schema exists", () => {
      const id = uniqueId("undef-params");
      registerModuleWithSchema(id, {
        radius: { type: "number", label: "Radius" },
      });

      const result = validateConnectorParams(id, undefined);

      expect(result.valid).toBe(true);
    });
  });

  describe("valid params", () => {
    it("should return valid for correct number field", () => {
      const id = uniqueId("valid-number");
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius (km)", defaultValue: 25 },
      });

      const result = validateConnectorParams(id, { umkreis: 50 });

      expect(result.valid).toBe(true);
    });

    it("should return valid for correct select field", () => {
      const id = uniqueId("valid-select");
      registerModuleWithSchema(id, {
        arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz", "snw"] },
      });

      const result = validateConnectorParams(id, { arbeitszeit: "vz" });

      expect(result.valid).toBe(true);
    });

    it("should return valid for numeric select options", () => {
      const id = uniqueId("valid-numeric-select");
      registerModuleWithSchema(id, {
        befristung: { type: "select", label: "Contract type", options: [1, 2] },
      });

      const result = validateConnectorParams(id, { befristung: 1 });

      expect(result.valid).toBe(true);
    });

    it("should return valid when string value matches numeric option via coercion", () => {
      const id = uniqueId("valid-coercion");
      registerModuleWithSchema(id, {
        befristung: { type: "select", label: "Contract type", options: [1, 2] },
      });

      // Form serialization may send "1" instead of 1
      const result = validateConnectorParams(id, { befristung: "1" });

      expect(result.valid).toBe(true);
    });

    it("should return valid for multiple correct fields", () => {
      const id = uniqueId("valid-multi");
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius (km)", defaultValue: 25 },
        veroeffentlichtseit: { type: "number", label: "Published within (days)", defaultValue: 7 },
        arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz", "snw", "mj", "ho"] },
        befristung: { type: "select", label: "Contract type", options: [1, 2] },
      });

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
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius (km)" },
        arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz"] },
      });

      // Only provide umkreis, skip arbeitszeit
      const result = validateConnectorParams(id, { umkreis: 10 });

      expect(result.valid).toBe(true);
    });

    it("should return valid with empty params object and no required fields", () => {
      const id = uniqueId("valid-empty");
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius" },
      });

      const result = validateConnectorParams(id, {});

      expect(result.valid).toBe(true);
    });
  });

  describe("invalid params", () => {
    it("should fail for missing required field", () => {
      const id = uniqueId("missing-required");
      registerModuleWithSchema(id, {
        apiKey: { type: "string", label: "API Key", required: true },
      });

      const result = validateConnectorParams(id, {});

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors!.some((e) => e.includes("Missing required field: apiKey"))).toBe(true);
    });

    it("should fail for invalid select option value", () => {
      const id = uniqueId("invalid-select");
      registerModuleWithSchema(id, {
        arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz", "snw"] },
      });

      const result = validateConnectorParams(id, { arbeitszeit: "invalid-value" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid value for arbeitszeit/);
      expect(result.errors![0]).toMatch(/Allowed:/);
    });

    it("should fail for wrong type on number field", () => {
      const id = uniqueId("wrong-type-number");
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius (km)" },
      });

      const result = validateConnectorParams(id, { umkreis: "not-a-number" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid type for umkreis/);
      expect(result.errors![0]).toMatch(/expected number/);
    });

    it("should fail for wrong type on boolean field", () => {
      const id = uniqueId("wrong-type-boolean");
      registerModuleWithSchema(id, {
        remote: { type: "boolean", label: "Remote only" },
      });

      const result = validateConnectorParams(id, { remote: "yes" });

      expect(result.valid).toBe(false);
      expect(result.errors).toBeDefined();
      expect(result.errors![0]).toMatch(/Invalid type for remote/);
      expect(result.errors![0]).toMatch(/expected boolean/);
    });

    it("should collect multiple errors at once", () => {
      const id = uniqueId("multi-error");
      registerModuleWithSchema(id, {
        apiKey: { type: "string", label: "API Key", required: true },
        umkreis: { type: "number", label: "Radius (km)" },
        arbeitszeit: { type: "select", label: "Working time", options: ["vz", "tz"] },
      });

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

  describe("edge cases", () => {
    it("should allow extra params not in the schema (pass-through unknown fields)", () => {
      const id = uniqueId("extra-params");
      registerModuleWithSchema(id, {
        umkreis: { type: "number", label: "Radius" },
      });

      const result = validateConnectorParams(id, {
        umkreis: 25,
        unknownField: "some value",
      });

      expect(result.valid).toBe(true);
    });

    it("should handle schema with empty object descriptor gracefully", () => {
      const id = uniqueId("empty-desc");
      registerModuleWithSchema(id, {
        someField: {},
      });

      const result = validateConnectorParams(id, { someField: "anything" });

      expect(result.valid).toBe(true);
    });
  });
});
