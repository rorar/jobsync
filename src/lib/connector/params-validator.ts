/**
 * ConnectorParams Validation — validates automation.connectorParams against
 * the module's declared connectorParamsSchema.
 *
 * Rule: ConnectorParamsValidation (from Allium spec).
 * When saving an automation, validate connectorParams against the module's
 * declared schema. If no schema is declared, all params pass through.
 *
 * Schema shape (flat Record):
 *   {
 *     fieldKey: { type: "number" | "select" | "string" | "boolean", label: string, options?: (string|number)[], defaultValue?: unknown },
 *     ...
 *   }
 */

import { moduleRegistry } from "./registry";
import type { JobDiscoveryManifest } from "./manifest";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
}

/** Shape of a single field descriptor inside connectorParamsSchema. */
interface ParamFieldDescriptor {
  type?: string;
  label?: string;
  options?: (string | number)[];
  defaultValue?: unknown;
  required?: boolean;
}

/**
 * Validate connectorParams against the module's declared schema.
 * Returns { valid: true } if no schema is declared (pass-through).
 */
export function validateConnectorParams(
  moduleId: string,
  connectorParams: Record<string, unknown> | null | undefined,
): ValidationResult {
  const registered = moduleRegistry.get(moduleId);
  if (!registered) {
    return { valid: false, errors: [`Unknown module: ${moduleId}`] };
  }

  const manifest = registered.manifest as JobDiscoveryManifest;
  const schema = manifest.connectorParamsSchema;

  // No schema declared — all params are valid
  if (!schema) return { valid: true };

  // No params provided — valid (all fields are optional unless marked required)
  if (!connectorParams) return { valid: true };

  const errors: string[] = [];

  // Schema is a flat Record<string, FieldDescriptor>
  for (const [fieldKey, fieldDescRaw] of Object.entries(schema)) {
    const fieldDesc = fieldDescRaw as ParamFieldDescriptor;
    const value = connectorParams[fieldKey];

    // Check required fields
    if (fieldDesc.required && (value === undefined || value === null)) {
      errors.push(`Missing required field: ${fieldKey}`);
      continue;
    }

    // Skip validation for absent optional fields
    if (value === undefined || value === null) continue;

    // Type validation
    if (fieldDesc.type === "number" && typeof value !== "number") {
      errors.push(
        `Invalid type for ${fieldKey}: expected number, got ${typeof value}`,
      );
      continue;
    }

    if (fieldDesc.type === "boolean" && typeof value !== "boolean") {
      errors.push(
        `Invalid type for ${fieldKey}: expected boolean, got ${typeof value}`,
      );
      continue;
    }

    // Options validation (enum / select fields)
    if (fieldDesc.options && Array.isArray(fieldDesc.options)) {
      // Compare with loose type coercion — schema options may be numbers while
      // params may arrive as strings (or vice versa) from form serialization.
      const allowed = fieldDesc.options.map(String);
      if (!allowed.includes(String(value))) {
        errors.push(
          `Invalid value for ${fieldKey}: "${value}". Allowed: ${fieldDesc.options.join(", ")}`,
        );
      }
    }
  }

  return errors.length > 0 ? { valid: false, errors } : { valid: true };
}
