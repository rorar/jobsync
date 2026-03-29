"use server";

import { undoStore } from "@/lib/undo";
import { getCurrentUser } from "@/utils/user.utils";
import { ActionResult } from "@/models/actionResult";

/**
 * Undo a specific action by token ID.
 * Verifies the current user owns the undo token (defense-in-depth).
 */
export async function undoAction(tokenId: string): Promise<ActionResult> {
  const user = await getCurrentUser();
  if (!user) return { success: false, message: "Not authenticated" };

  const entry = undoStore.get(tokenId);
  if (entry && entry.userId !== user.id) {
    return { success: false, message: "Not authorized" };
  }

  const result = await undoStore.undoById(tokenId);
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
