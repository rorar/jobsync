"use server";

import db from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { encrypt, getLast4 } from "@/lib/encryption";
import { apiKeySaveSchema } from "@/models/apiKey.schema";
import { validateOllamaUrl } from "@/lib/url-validation";
import { ActionResult } from "@/models/actionResult";
import type {
  ApiKeyClientResponse,
  ApiKeyModuleId,
} from "@/models/apiKey.model";
import { moduleRegistry } from "@/lib/connector/registry";
import "@/lib/connector/job-discovery/connectors";
import "@/lib/connector/ai-provider/modules/connectors";

export async function getUserApiKeys(): Promise<ActionResult<ApiKeyClientResponse[]>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const keys = await db.apiKey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        moduleId: true,
        last4: true,
        iv: true,
        encryptedKey: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    return {
      success: true,
      data: keys.map((k) => {
        const isSensitive = k.iv !== "";
        return {
          id: k.id,
          moduleId: k.moduleId as ApiKeyModuleId,
          last4: k.last4,
          ...(isSensitive ? {} : { displayValue: k.encryptedKey }),
          label: k.label,
          createdAt: k.createdAt,
          lastUsedAt: k.lastUsedAt,
        };
      }),
    };
  } catch (error) {
    return handleError(error, "Failed to fetch API keys");
  }
}

export async function saveApiKey(input: {
  moduleId: string;
  key: string;
  label?: string;
  sensitive?: boolean;
}): Promise<ActionResult<ApiKeyClientResponse>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    const parsed = apiKeySaveSchema.parse(input);

    // Derive sensitive flag from the module manifest — never trust client input.
    // Lookup by credential.moduleId because the ApiKey table uses that as its key
    // (e.g. manifest.id="jsearch" but credential.moduleId="rapidapi").
    const registeredModule = moduleRegistry.getByCredentialModuleId(parsed.moduleId);
    const isSensitive = registeredModule
      ? registeredModule.manifest.credential.sensitive
      : true; // fail-safe: unknown modules are treated as sensitive

    let encryptedKey: string;
    let iv: string;
    let last4: string;

    if (isSensitive) {
      const result = encrypt(parsed.key);
      encryptedKey = result.encrypted;
      iv = result.iv;
      last4 = getLast4(parsed.key);
    } else {
      // Non-sensitive values stored as plaintext
      encryptedKey = parsed.key;
      iv = "";
      last4 = parsed.key;
    }

    const apiKey = await db.apiKey.upsert({
      where: {
        userId_moduleId: {
          userId: user.id,
          moduleId: parsed.moduleId,
        },
      },
      create: {
        userId: user.id,
        moduleId: parsed.moduleId,
        encryptedKey,
        iv,
        last4,
        label: parsed.label,
      },
      update: {
        encryptedKey,
        iv,
        last4,
        label: parsed.label,
      },
      select: {
        id: true,
        moduleId: true,
        last4: true,
        label: true,
        createdAt: true,
        lastUsedAt: true,
      },
    });

    const response: ApiKeyClientResponse = {
      ...apiKey,
      moduleId: apiKey.moduleId as ApiKeyModuleId,
    };
    if (!isSensitive) {
      response.displayValue = parsed.key;
    }

    return { success: true, data: response };
  } catch (error) {
    return handleError(error, "Failed to save API key");
  }
}

export async function deleteApiKey(moduleId: string): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "Not authenticated" };

    await db.apiKey.deleteMany({
      where: { userId: user.id, moduleId },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete API key");
  }
}

export async function getDefaultOllamaBaseUrl(): Promise<string> {
  return process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
}

export async function getOllamaBaseUrl(): Promise<string> {
  const fallback = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
  try {
    const user = await getCurrentUser();
    if (user) {
      const apiKey = await db.apiKey.findUnique({
        where: {
          userId_moduleId: { userId: user.id, moduleId: "ollama" },
        },
      });
      if (apiKey) {
        const url =
          apiKey.iv === ""
            ? apiKey.encryptedKey
            : (await import("@/lib/encryption")).decrypt(
                apiKey.encryptedKey,
                apiKey.iv,
              );
        const validation = validateOllamaUrl(url);
        if (!validation.valid) {
          console.error(
            "[Security] Stored Ollama URL failed validation, using fallback",
          );
          return fallback;
        }
        return url;
      }
    }
  } catch {
    // Fall through to defaults
  }
  return fallback;
}
