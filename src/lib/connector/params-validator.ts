/**
 * ConnectorParams Validation — validates automation.connectorParams against
 * the module's declared connectorParamsSchema.
 *
 * Rule: ConnectorParamsValidation (from Allium spec).
 * When saving an automation, validate connectorParams against the module's
 * declared schema. If no schema is declared, all params pass through.
 *
 * Schema shape (Array-based, deterministic ordering):
 *   [
 *     { key: "fieldKey", type: "number" | "select" | "multiselect" | "string" | "boolean", label: "i18n.key", ... },
 *     ...
 *   ]
 */

import { moduleRegistry } from "./registry";
import type { ConnectorParamField, JobDiscoveryManifest } from "./manifest";

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
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

  // S-2 + S-5: Strip undeclared keys and guard against prototype pollution
  const declaredKeys = new Set(schema.map(f => f.key));
  const FORBIDDEN_KEYS = ["__proto__", "constructor", "prototype"];
  for (const key of Object.keys(connectorParams)) {
    if (FORBIDDEN_KEYS.includes(key)) {
      errors.push(`Forbidden key: ${key}`);
    } else if (!declaredKeys.has(key)) {
      delete connectorParams[key]; // strip silently
    }
  }
  if (errors.length > 0) {
    return { valid: false, errors };
  }

  // Schema is an Array of ConnectorParamField
  for (const fieldDesc of schema) {
    const fieldKey = fieldDesc.key;
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

    // S-4: String type validation (typeof check + maxLength 1000)
    if (fieldDesc.type === "string") {
      if (typeof value !== "string") {
        errors.push(
          `Invalid type for ${fieldKey}: expected string, got ${typeof value}`,
        );
        continue;
      }
      if (value.length > 1000) {
        errors.push(
          `Value for ${fieldKey} exceeds maximum length of 1000 characters`,
        );
        continue;
      }
    }

    // Number min/max validation
    if (fieldDesc.type === "number" && typeof value === "number") {
      if (fieldDesc.min !== undefined && value < fieldDesc.min) {
        errors.push(
          `Value for ${fieldKey} is ${value}, minimum is ${fieldDesc.min}`,
        );
      }
      if (fieldDesc.max !== undefined && value > fieldDesc.max) {
        errors.push(
          `Value for ${fieldKey} is ${value}, maximum is ${fieldDesc.max}`,
        );
      }
    }

    // Multiselect validation (value must be array, all elements in options)
    if (fieldDesc.type === "multiselect") {
      if (!Array.isArray(value)) {
        errors.push(
          `Invalid type for ${fieldKey}: expected array, got ${typeof value}`,
        );
        continue;
      }
      // S-3: Limit multiselect array length to options count or 100
      const maxItems = (fieldDesc.options && Array.isArray(fieldDesc.options))
        ? fieldDesc.options.length
        : 100;
      if (value.length > maxItems) {
        errors.push(
          `Array for ${fieldKey} has ${value.length} items, maximum is ${maxItems}`,
        );
        continue;
      }
      if (fieldDesc.options && Array.isArray(fieldDesc.options)) {
        const allowed = fieldDesc.options.map(String);
        for (const element of value) {
          if (!allowed.includes(String(element))) {
            errors.push(
              `Invalid value in ${fieldKey}: "${element}". Allowed: ${fieldDesc.options.join(", ")}`,
            );
          }
        }
      }
    }

    // Options validation (select fields)
    if (fieldDesc.type === "select" && fieldDesc.options && Array.isArray(fieldDesc.options)) {
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
