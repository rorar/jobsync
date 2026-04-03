"use server";

import prisma from "@/lib/db";
import { handleError } from "@/lib/utils";
import { ActionResult } from "@/models/actionResult";
import { getCurrentUser } from "@/utils/user.utils";
import { generateApiKey, hashApiKey, getKeyPrefix } from "@/lib/api/auth";
import type {
  PublicApiKeyResponse,
  PublicApiKeyCreatedResponse,
} from "@/models/publicApiKey.model";

/**
 * Create a new Public API key.
 * Returns the full plaintext key ONCE — it cannot be retrieved after this.
 */
export async function createPublicApiKey(
  name: string,
): Promise<ActionResult<PublicApiKeyCreatedResponse>> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("api.notAuthenticated");
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("api.keyNameRequired");
    }
    if (trimmedName.length > 100) {
      throw new Error("api.keyNameTooLong");
    }

    // Enforce per-user key limit
    const activeCount = await prisma.publicApiKey.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount >= 10) {
      throw new Error("api.maxKeysReached");
    }

    // Generate key material
    const plainKey = generateApiKey();
    const keyHash = hashApiKey(plainKey);
    const keyPrefix = getKeyPrefix(plainKey);

    const apiKey = await prisma.publicApiKey.create({
      data: {
        userId: user.id,
        name: trimmedName,
        keyHash,
        keyPrefix,
        permissions: "[]",
      },
    });

    return {
      success: true,
      data: {
        id: apiKey.id,
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        key: plainKey, // shown ONCE
      },
    };
  } catch (error) {
    return handleError(error, "errors.createApiKey");
  }
}

/**
 * List all Public API keys for the current user.
 * Never exposes keyHash — only prefix and metadata.
 */
export async function listPublicApiKeys(): Promise<
  ActionResult<PublicApiKeyResponse[]>
> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("api.notAuthenticated");
    }

    const keys = await prisma.publicApiKey.findMany({
      where: { userId: user.id },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        permissions: true,
        lastUsedAt: true,
        createdAt: true,
        revokedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const data: PublicApiKeyResponse[] = keys.map((k) => ({
      ...k,
      permissions: parsePermissions(k.permissions),
    }));

    return { success: true, data };
  } catch (error) {
    return handleError(error, "errors.listApiKeys");
  }
}

/**
 * Revoke a Public API key (soft-delete).
 * Sets revokedAt — the key remains in the DB for audit trail.
 */
export async function revokePublicApiKey(
  keyId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("api.notAuthenticated");
    }

    // Ensure the key belongs to this user
    const key = await prisma.publicApiKey.findFirst({
      where: { id: keyId, userId: user.id },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new Error("api.keyNotFound");
    }
    if (key.revokedAt) {
      throw new Error("api.keyAlreadyRevoked");
    }

    await prisma.publicApiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.revokeApiKey");
  }
}

/**
 * Permanently delete a revoked Public API key.
 * Only allowed if the key was previously revoked.
 */
export async function deletePublicApiKey(
  keyId: string,
): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) {
      throw new Error("api.notAuthenticated");
    }

    const key = await prisma.publicApiKey.findFirst({
      where: { id: keyId, userId: user.id },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new Error("api.keyNotFound");
    }
    if (!key.revokedAt) {
      throw new Error("api.keyMustBeRevoked");
    }

    await prisma.publicApiKey.delete({
      where: { id: keyId },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteApiKey");
  }
}

function parsePermissions(permissions: string): string[] {
  try {
    return JSON.parse(permissions);
  } catch {
    return [];
  }
}
