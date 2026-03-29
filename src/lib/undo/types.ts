/**
 * Undo/Redo Types
 *
 * UndoToken with timer expiry (Gmail "Undo Send" pattern).
 * Spec: specs/vacancy-pipeline.allium (entity UndoToken, rules UndoExpiry, UndoExecution)
 */

export interface UndoEntry {
  /** Unique token ID */
  id: string;
  /** Owner user ID (for auth verification) */
  userId: string;
  /** Human-readable action label (for toast display) */
  actionLabel: string;
  /** The compensation function that reverses the action */
  compensate: () => Promise<void>;
  /** IDs of affected items (for batch operations) */
  itemIds: string[];
  /** When this token expires (absolute timestamp) */
  expiresAt: Date;
  /** When this token was created */
  createdAt: Date;
}

export interface UndoResult {
  success: boolean;
  message?: string;
}

export const DEFAULT_UNDO_TTL_MS = 10_000; // 10 seconds
