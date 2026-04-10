"use server";

import { undoStore } from "@/lib/undo";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";

/**
 * Undo a specific action by token ID.
 *
 * M-S-06 — TOCTOU fix: ownership check is performed INSIDE undoById (via the
 * userId argument), not in a separate pre-flight undoStore.get() call.
 * Previously, the sequence was:
 *   1. undoStore.get(tokenId) → read + ownership check
 *   2. undoStore.undoById(tokenId) → read again + consume
 * A concurrent request could pass step 1 and then both execute step 2.
 * Now: undoStore.undoById(tokenId, user.id) checks ownership, removes from
 * the Map, and runs compensate() atomically in a single call.
 */
export async function undoAction(tokenId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  // Pass user.id so undoById does the ownership check + removal atomically.
  // No separate undoStore.get() call — that was the TOCTOU window.
  const result = await undoStore.undoById(tokenId, user.id);
  if (result.success) {
    return { success: true };
  }
  return { success: false, message: result.message ?? "Undo failed" };
}

/**
 * Undo the most recent action for the current user (Ctrl+Z behavior).
 */
export async function undoLastAction(): Promise<ActionResult<{ tokenId: string | null }>> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  const { tokenId, result } = await undoStore.undoLast(user.id);
  if (result.success) {
    return { success: true, data: { tokenId } };
  }
  return { success: false, message: result.message ?? "Nothing to undo" };
}
