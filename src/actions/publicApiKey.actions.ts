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
      throw new Error("Not authenticated");
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      throw new Error("Please provide a name for the API key");
    }
    if (trimmedName.length > 100) {
      throw new Error("API key name must be 100 characters or less");
    }

    // Enforce per-user key limit
    const activeCount = await prisma.publicApiKey.count({
      where: { userId: user.id, revokedAt: null },
    });
    if (activeCount >= 10) {
      throw new Error("Maximum of 10 active API keys per user");
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
    return handleError(error, "Failed to create API key.");
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
      throw new Error("Not authenticated");
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
    return handleError(error, "Failed to list API keys.");
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
      throw new Error("Not authenticated");
    }

    // Ensure the key belongs to this user
    const key = await prisma.publicApiKey.findFirst({
      where: { id: keyId, userId: user.id },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new Error("API key not found");
    }
    if (key.revokedAt) {
      throw new Error("API key is already revoked");
    }

    await prisma.publicApiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to revoke API key.");
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
      throw new Error("Not authenticated");
    }

    const key = await prisma.publicApiKey.findFirst({
      where: { id: keyId, userId: user.id },
      select: { id: true, revokedAt: true },
    });

    if (!key) {
      throw new Error("API key not found");
    }
    if (!key.revokedAt) {
      throw new Error("API key must be revoked before it can be deleted");
    }

    await prisma.publicApiKey.delete({
      where: { id: keyId },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "Failed to delete API key.");
  }
}

function parsePermissions(permissions: string): string[] {
  try {
    return JSON.parse(permissions);
  } catch {
    return [];
  }
}
