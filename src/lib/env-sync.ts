"use server";

import fs from "fs/promises";
import path from "path";
import { getCurrentUser } from "@/utils/user.utils";

// --- Security: Key allowlists (ADR-019: runtime validation, not just types) ---

const WRITABLE_ENV_KEYS = ["NEXTAUTH_URL", "ALLOWED_DEV_ORIGINS"] as const;
type WritableEnvKey = (typeof WRITABLE_ENV_KEYS)[number];

const READABLE_ENV_KEYS = ["NEXTAUTH_URL", "AUTH_URL"] as const;
type ReadableEnvKey = (typeof READABLE_ENV_KEYS)[number];

// --- Security: Value validators per key ---

function validateValueForKey(key: WritableEnvKey, value: string): boolean {
  // Reject newline injection in ALL values (Finding 4)
  if (/[\r\n]/.test(value)) return false;

  if (key === "NEXTAUTH_URL") {
    // Server-side URL validation (Finding 3)
    try {
      const parsed = new URL(value);
      return (
        ["http:", "https:"].includes(parsed.protocol) &&
        !parsed.username &&
        !parsed.password
      );
    } catch {
      return false;
    }
  }

  return true; // ALLOWED_DEV_ORIGINS: free-form comma-separated origins
}

/**
 * Updates a single key in the .env file.
 * If the key exists, updates its value. If not, appends it.
 * If value is empty/undefined, removes the key entirely.
 *
 * Also updates process.env at runtime so the change is effective
 * immediately without a server restart.
 *
 * Security: Requires authenticated session. Only allowlisted keys accepted.
 */
export async function syncEnvVariable(
  key: WritableEnvKey,
  value: string | undefined
): Promise<{ success: boolean }> {
  // Finding 2: Authentication gate
  const user = await getCurrentUser();
  if (!user) return { success: false };

  // Finding 1: Runtime key allowlist (types are erased at runtime)
  if (!(WRITABLE_ENV_KEYS as readonly string[]).includes(key)) {
    return { success: false };
  }

  // Finding 3+4: Server-side value validation
  if (value && !validateValueForKey(key, value)) {
    return { success: false };
  }

  try {
    const envPath = path.join(process.cwd(), ".env");
    let content = "";
    try {
      content = await fs.readFile(envPath, "utf-8");
    } catch {
      // .env doesn't exist yet — will be created
    }

    const lines = content.split("\n");
    // Escape key for regex safety
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const keyPattern = new RegExp(`^${escapedKey}=`);
    const existingIndex = lines.findIndex((line) => keyPattern.test(line));

    if (value) {
      const newLine = `${key}=${value}`;
      if (existingIndex >= 0) {
        lines[existingIndex] = newLine;
      } else {
        lines.push(newLine);
      }
      process.env[key] = value;
    } else {
      if (existingIndex >= 0) {
        lines.splice(existingIndex, 1);
      }
      delete process.env[key];
    }

    await fs.writeFile(envPath, lines.join("\n"));
    return { success: true };
  } catch {
    return { success: false };
  }
}

/**
 * Reads a specific env variable. Only exposes allowlisted keys.
 * Security: Requires authenticated session.
 */
export async function getEnvVariable(
  key: ReadableEnvKey
): Promise<string | undefined> {
  // Finding 2: Authentication gate
  const user = await getCurrentUser();
  if (!user) return undefined;

  // Runtime allowlist check
  if (!(READABLE_ENV_KEYS as readonly string[]).includes(key)) return undefined;
  return process.env[key];
}
