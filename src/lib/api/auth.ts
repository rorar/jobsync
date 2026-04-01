import { createHash, randomBytes } from "crypto";
import { NextRequest } from "next/server";
import prisma from "@/lib/db";
import { shouldWriteLastUsedAt } from "./last-used-throttle";

/**
 * Validates a Public API key from the request headers.
 *
 * Accepts:
 *   - Authorization: Bearer pk_live_...
 *   - X-API-Key: pk_live_...
 *
 * Returns the userId of the key owner, or null if invalid.
 * Updates lastUsedAt on successful validation.
 */
export async function validateApiKey(
  req: NextRequest,
): Promise<{ userId: string; keyHash: string } | null> {
  const key = extractApiKey(req);
  if (!key) return null;

  const keyHash = hashApiKey(key);

  const apiKey = await prisma.publicApiKey.findUnique({
    where: { keyHash },
    select: { id: true, userId: true, keyHash: true, revokedAt: true },
  });

  // Evaluate key validity. Note: the DB query itself is not constant-time
  // (non-existent keys return faster). Accepted risk for self-hosted deployment.
  // For stronger protection, perform a dummy query for invalid keys.
  const keyExists = apiKey !== null;
  const keyRevoked = apiKey?.revokedAt !== null;
  const isValid = keyExists && !keyRevoked;

  if (!isValid) return null;

  // Throttled lastUsedAt — max 1 DB write per 5 minutes per key (performance fix)
  if (shouldWriteLastUsedAt(`pubkey:${apiKey.id}`)) {
    prisma.publicApiKey
      .update({
        where: { id: apiKey.id },
        data: { lastUsedAt: new Date() },
      })
      .catch((err: unknown) => {
        console.warn("[Public API] Failed to update lastUsedAt:", err instanceof Error ? err.message : err);
      });
  }

  return { userId: apiKey.userId, keyHash: apiKey.keyHash };
}

/**
 * Extract the API key from request headers.
 * Supports both Authorization: Bearer and X-API-Key headers.
 */
function extractApiKey(req: NextRequest): string | null {
  // Check Authorization header first
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match) return match[1];
  }

  // Fallback to X-API-Key header
  const xApiKey = req.headers.get("x-api-key");
  if (xApiKey) return xApiKey;

  return null;
}

/**
 * Hash an API key with SHA-256 for storage/lookup.
 */
export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

/**
 * Generate a new Public API key.
 * Format: pk_live_ + 40 random hex chars = 48 chars total.
 */
export function generateApiKey(): string {
  const random = randomBytes(20).toString("hex"); // 40 hex chars
  return `pk_live_${random}`;
}

/**
 * Extract the display prefix from a full API key.
 * Shows "pk_live_" + first 4 random chars = 12 chars.
 */
export function getKeyPrefix(key: string): string {
  return key.slice(0, 12);
}
