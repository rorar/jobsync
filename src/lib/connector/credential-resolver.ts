import "server-only";

import db from "@/lib/db";
import { decrypt } from "@/lib/encryption";
import { CredentialType, type CredentialRequirement } from "./manifest";

/**
 * Resolve a module's credential using the manifest-declared resolution chain.
 * Priority: 1. User DB → 2. Environment variable → 3. Default value
 *
 * Replaces the hardcoded ENV_VAR_MAP in api-key-resolver.ts with
 * manifest-driven resolution per specs/module-lifecycle.allium rule SettingsPushOnInstantiation.
 */
export async function resolveCredential(
  credential: CredentialRequirement,
  userId: string,
): Promise<string | undefined> {
  if (credential.type === CredentialType.NONE) {
    return credential.defaultValue;
  }

  // 1. User DB
  try {
    const apiKey = await db.apiKey.findUnique({
      where: { userId_moduleId: { userId, moduleId: credential.moduleId } },
    });
    if (apiKey) {
      // Update lastUsedAt in background
      db.apiKey
        .update({
          where: { id: apiKey.id },
          data: { lastUsedAt: new Date() },
        })
        .catch(() => {});

      return apiKey.iv === ""
        ? apiKey.encryptedKey
        : decrypt(apiKey.encryptedKey, apiKey.iv);
    }
  } catch {
    // Fall through to env var
  }

  // 2. Environment variable fallback
  if (credential.envFallback) {
    const value = process.env[credential.envFallback];
    if (value) return value;
  }

  // 3. Default value
  return credential.defaultValue;
}
