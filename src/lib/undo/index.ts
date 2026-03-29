/**
 * Undo System — Public API
 *
 * Re-exports the UndoStore singleton and helper functions.
 */

export { undoStore, createUndoEntry } from "./undo-store";
export type { UndoEntry, UndoResult } from "./types";
export { DEFAULT_UNDO_TTL_MS } from "./types";
