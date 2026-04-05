import "server-only";

/**
 * VAPID Key Management — Generate, store, and retrieve VAPID keys for Web Push.
 *
 * Each user gets their own VAPID key pair. The private key is AES-encrypted
 * at rest (via src/lib/encryption.ts). The public key is stored in plaintext
 * (it's shared with the browser for subscription).
 *
 * Security:
 * - Private keys are decrypted only when sending push notifications
 * - Key rotation invalidates all existing subscriptions (by design)
 * - All Prisma queries include userId (ADR-015 IDOR protection)
 */

import webpush from "web-push";
import { encrypt, decrypt } from "@/lib/encryption";
import prisma from "@/lib/db";

/**
 * Get existing VAPID keys or generate new ones for a user.
 * The private key is returned decrypted for immediate use.
 */
export async function getOrCreateVapidKeys(
  userId: string,
): Promise<{ publicKey: string; privateKey: string }> {
  // Check for existing keys (ADR-015: userId in where)
  const existing = await prisma.vapidConfig.findUnique({
    where: { userId },
  });

  if (existing) {
    return {
      publicKey: existing.publicKey,
      privateKey: decrypt(existing.privateKey, existing.iv),
    };
  }

  // Generate new VAPID key pair
  const keys = webpush.generateVAPIDKeys();
  const { encrypted, iv } = encrypt(keys.privateKey);

  await prisma.vapidConfig.create({
    data: {
      userId,
      publicKey: keys.publicKey,
      privateKey: encrypted,
      iv,
    },
  });

  return keys;
}

/**
 * Get the VAPID public key for a user (for browser subscription).
 * Returns null if no VAPID keys have been generated yet.
 */
export async function getVapidPublicKey(
  userId: string,
): Promise<string | null> {
  const config = await prisma.vapidConfig.findUnique({
    where: { userId },
  });
  return config?.publicKey ?? null;
}

/**
 * Rotate VAPID keys — generates a new key pair and deletes all existing
 * subscriptions (they become invalid with new keys).
 *
 * Returns the new public key so the client can re-subscribe.
 */
export async function rotateVapidKeys(
  userId: string,
): Promise<{ publicKey: string }> {
  // Atomically delete subscriptions and old config in a single transaction
  await prisma.$transaction([
    prisma.webPushSubscription.deleteMany({ where: { userId } }),
    prisma.vapidConfig.deleteMany({ where: { userId } }),
  ]);

  // Generate new keys
  const keys = await getOrCreateVapidKeys(userId);
  return { publicKey: keys.publicKey };
}
