import "server-only";

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  pbkdf2 as pbkdf2Callback,
} from "crypto";
import { promisify } from "util";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const PBKDF2_ITERATIONS = 100_000;
const SALT_LENGTH = 16;
const KEY_CACHE_MAX_SIZE = 128;

/** Legacy hardcoded salt — used only to decrypt old records. */
const LEGACY_SALT = "jobsync-api-key-encryption";

const pbkdf2Async = promisify(pbkdf2Callback);

// ---------- Derived-key LRU cache (globalThis singleton) ----------

const KEY_CACHE_SYMBOL = Symbol.for("jobsync.derivedKeyCache");

interface DerivedKeyCache {
  cache: Map<string, Buffer>;
}

function getDerivedKeyCache(): DerivedKeyCache {
  const g = globalThis as Record<symbol, DerivedKeyCache | undefined>;
  if (!g[KEY_CACHE_SYMBOL]) {
    g[KEY_CACHE_SYMBOL] = { cache: new Map() };
  }
  return g[KEY_CACHE_SYMBOL]!;
}

async function deriveKey(secret: string, salt: Buffer | string): Promise<Buffer> {
  const cacheKey = Buffer.isBuffer(salt) ? salt.toString("hex") : `legacy:${salt}`;
  const keyCache = getDerivedKeyCache();

  // LRU hit — move to end
  const cached = keyCache.cache.get(cacheKey);
  if (cached) {
    keyCache.cache.delete(cacheKey);
    keyCache.cache.set(cacheKey, cached);
    return cached;
  }

  // Async key derivation (non-blocking)
  const derived = await pbkdf2Async(secret, salt, PBKDF2_ITERATIONS, KEY_LENGTH, "sha256");

  // LRU evict if full
  if (keyCache.cache.size >= KEY_CACHE_MAX_SIZE) {
    const oldest = keyCache.cache.keys().next().value;
    if (oldest !== undefined) {
      keyCache.cache.delete(oldest);
    }
  }
  keyCache.cache.set(cacheKey, derived);

  return derived;
}

function getSecret(): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("ENCRYPTION_KEY is not set");
  }
  return secret;
}

export async function encrypt(plaintext: string): Promise<{ encrypted: string; iv: string }> {
  const secret = getSecret();
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(secret, salt);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, "utf8", "base64");
  encrypted += cipher.final("base64");

  const authTag = cipher.getAuthTag();
  // Append auth tag to encrypted data
  const combined = Buffer.concat([
    Buffer.from(encrypted, "base64"),
    authTag,
  ]).toString("base64");

  // Prefix the encrypted data with the salt so decrypt can extract it.
  // Format: "salt:<hex>:<base64-payload>"
  const saltedEncrypted = `salt:${salt.toString("hex")}:${combined}`;

  return {
    encrypted: saltedEncrypted,
    iv: iv.toString("base64"),
  };
}

export async function decrypt(encryptedData: string, iv: string): Promise<string> {
  const secret = getSecret();

  let key: Buffer;
  let payload: string;

  if (encryptedData.startsWith("salt:")) {
    // New format: "salt:<hex>:<base64-payload>"
    const parts = encryptedData.split(":");
    const saltHex = parts[1];
    payload = parts.slice(2).join(":"); // rejoin in case base64 ever contains ':'
    const salt = Buffer.from(saltHex, "hex");
    key = await deriveKey(secret, salt);
  } else {
    // Legacy format: plain base64 payload with hardcoded salt
    payload = encryptedData;
    key = await deriveKey(secret, LEGACY_SALT);
  }

  const ivBuffer = Buffer.from(iv, "base64");
  const combined = Buffer.from(payload, "base64");

  // Extract auth tag from end of combined data
  const authTag = combined.subarray(combined.length - AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(0, combined.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, ivBuffer, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

export function getLast4(key: string): string {
  return key.slice(-4);
}

/** @internal — exposed for test cache-clearing only */
export function _clearDerivedKeyCache(): void {
  getDerivedKeyCache().cache.clear();
}

/** @internal — exposed for test cache inspection only */
export function _getDerivedKeyCacheSize(): number {
  return getDerivedKeyCache().cache.size;
}
