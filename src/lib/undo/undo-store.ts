/**
 * UndoStore — In-Memory Token Store with TTL
 *
 * Manages undo tokens. Tokens expire after a configurable TTL.
 * One token per action or per batch (not per item).
 *
 * Spec: specs/vacancy-pipeline.allium (entity UndoToken, rules UndoExpiry, BatchUndoGranularity)
 */

import { randomBytes } from "crypto";
import type { UndoEntry, UndoResult } from "./types";
import { DEFAULT_UNDO_TTL_MS } from "./types";

function generateId(): string {
  return randomBytes(16).toString("hex");
}

class UndoStore {
  private tokens = new Map<string, UndoEntry>();
  /** Ordered list of token IDs (most recent last) for Ctrl+Z stack behavior */
  private stack: string[] = [];
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    // Periodic cleanup of expired tokens every 30 seconds
    if (typeof setInterval !== "undefined") {
      this.cleanupTimer = setInterval(() => this.purgeExpired(), 30_000);
      // Don't block Node.js exit
      if (this.cleanupTimer && typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
        (this.cleanupTimer as NodeJS.Timeout).unref();
      }
    }
  }

  /**
   * Register an undo token. Returns the token ID.
   */
  push(entry: UndoEntry): string {
    this.tokens.set(entry.id, entry);
    this.stack.push(entry.id);
    return entry.id;
  }

  /**
   * Execute undo for a specific token ID.
   * Returns success/failure. Token is removed after execution.
   */
  async undoById(tokenId: string): Promise<UndoResult> {
    const entry = this.tokens.get(tokenId);
    if (!entry) {
      return { success: false, message: "Undo token not found or expired" };
    }

    if (new Date() > entry.expiresAt) {
      this.remove(tokenId);
      return { success: false, message: "Undo window has expired" };
    }

    try {
      await entry.compensate();
      this.remove(tokenId);
      return { success: true };
    } catch (error) {
      this.remove(tokenId);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Undo failed",
      };
    }
  }

  /**
   * Undo the most recent unexpired token (Ctrl+Z behavior).
   * Returns the token ID that was undone, or null if stack is empty.
   */
  async undoLast(userId?: string): Promise<{ tokenId: string | null; result: UndoResult }> {
    // Pop from stack until we find a non-expired, user-owned token
    while (this.stack.length > 0) {
      const tokenId = this.stack.pop()!;
      const entry = this.tokens.get(tokenId);

      if (!entry) continue; // Already removed
      if (new Date() > entry.expiresAt) {
        this.tokens.delete(tokenId);
        continue; // Expired
      }
      if (userId && entry.userId !== userId) {
        this.stack.push(tokenId); // Put it back, not ours
        continue;
      }

      const result = await this.undoById(tokenId);
      return { tokenId, result };
    }

    return { tokenId: null, result: { success: false, message: "Nothing to undo" } };
  }

  /**
   * Get a token by ID (for displaying countdown in UI).
   */
  get(tokenId: string): UndoEntry | undefined {
    const entry = this.tokens.get(tokenId);
    if (entry && new Date() > entry.expiresAt) {
      this.remove(tokenId);
      return undefined;
    }
    return entry;
  }

  /**
   * Get the most recent unexpired token (for UI display).
   */
  peek(): UndoEntry | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const entry = this.tokens.get(this.stack[i]);
      if (entry && new Date() <= entry.expiresAt) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Remove a specific token.
   */
  private remove(tokenId: string): void {
    this.tokens.delete(tokenId);
    const idx = this.stack.indexOf(tokenId);
    if (idx !== -1) this.stack.splice(idx, 1);
  }

  /**
   * Remove all expired tokens.
   */
  private purgeExpired(): void {
    const now = new Date();
    for (const [id, entry] of this.tokens) {
      if (now > entry.expiresAt) {
        this.remove(id);
      }
    }
  }

  /**
   * Get count of active (non-expired) tokens.
   */
  get size(): number {
    this.purgeExpired();
    return this.tokens.size;
  }

  /**
   * Clear all tokens. Used in tests.
   */
  reset(): void {
    this.tokens.clear();
    this.stack = [];
  }

  /**
   * Destroy the store (clear interval).
   */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.reset();
  }
}

// Singleton — shared across server actions in the same process
export const undoStore = new UndoStore();

/**
 * Create an UndoEntry with the default TTL.
 */
export function createUndoEntry(
  userId: string,
  actionLabel: string,
  itemIds: string[],
  compensate: () => Promise<void>,
  ttlMs: number = DEFAULT_UNDO_TTL_MS,
): UndoEntry {
  return {
    id: generateId(),
    userId,
    actionLabel,
    compensate,
    itemIds,
    expiresAt: new Date(Date.now() + ttlMs),
    createdAt: new Date(),
  };
}
