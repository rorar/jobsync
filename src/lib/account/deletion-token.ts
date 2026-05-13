import "server-only";

/**
 * Deletion Confirmation Token — generation, hashing, and validation.
 *
 * Token format: "del_" + 64 hex chars (32 random bytes) = 68 chars total.
 * Storage: SHA-256 hash of the raw token (never store the raw value).
 * TTL: 24 hours. Single-use, one per user (upsert).
 *
 * ADR-019: server-only file — never exposed as a server action.
 */

import { randomBytes, createHash } from "crypto";

const TOKEN_PREFIX = "del_";
const TOKEN_BYTES = 32;
const TOKEN_EXPIRY_HOURS = 24;

/**
 * Regex for valid token format: "del_" followed by exactly 64 hex characters.
 */
const TOKEN_REGEX = /^del_[0-9a-f]{64}$/;

/**
 * Generate a new deletion confirmation token.
 *
 * @returns raw token (for email link), SHA-256 hash (for DB storage), and expiry date.
 */
export function generateDeletionToken(): {
  raw: string;
  hash: string;
  expiresAt: Date;
} {
  const bytes = randomBytes(TOKEN_BYTES);
  const raw = `${TOKEN_PREFIX}${bytes.toString("hex")}`;
  const hash = hashDeletionToken(raw);
  const expiresAt = new Date(
    Date.now() + TOKEN_EXPIRY_HOURS * 60 * 60 * 1000,
  );
  return { raw, hash, expiresAt };
}

/**
 * Hash a raw token with SHA-256 for DB lookup/storage.
 */
export function hashDeletionToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

/**
 * Validate the structural format of a token string.
 * Does NOT check DB existence or expiry — only format.
 */
export function isValidTokenFormat(token: string): boolean {
  return TOKEN_REGEX.test(token);
}
