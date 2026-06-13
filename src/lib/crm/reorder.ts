/**
 * Pure sort-order helpers for within-stage status reordering (Welle 4, F-AJ-09).
 *
 * `reorderJobStatus` (the Repository) sets an ABSOLUTE sortOrder, so moving a
 * status to a new position is a single write of a midpoint value between its new
 * neighbours — no full re-index, no second write. Mirrors the midpoint strategy
 * the Kanban already uses for card ordering.
 */

export interface Sortable {
  sortOrder: number;
}

/**
 * Compute the new sortOrder for the item at `fromIndex` when moved to `toIndex`
 * within `siblings` (siblings already in display order). Returns a midpoint
 * between the destination neighbours so a single update reorders the item.
 *
 * Returns null when the move is a no-op (same position or out of range).
 */
export function computeReorderSortValue(
  siblings: Sortable[],
  fromIndex: number,
  toIndex: number,
): number | null {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= siblings.length ||
    toIndex >= siblings.length
  ) {
    return null;
  }

  // The list WITHOUT the moved item, to find the destination's neighbours.
  // `toIndex` is the item's FINAL index; after removing the source, the
  // destination's neighbours in `without` are at toIndex-1 and toIndex.
  const without = siblings.filter((_, i) => i !== fromIndex);

  const before = without[toIndex - 1];
  const after = without[toIndex];

  if (before && after) return (before.sortOrder + after.sortOrder) / 2;
  if (!before && after) return after.sortOrder - 1; // move to top
  if (before && !after) return before.sortOrder + 1; // move to end
  return 0;
}
