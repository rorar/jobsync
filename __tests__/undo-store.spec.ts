/**
 * UndoStore Tests
 *
 * Spec: specs/vacancy-pipeline.allium (entity UndoToken, rules UndoExpiry, UndoExecution)
 */

import { undoStore, createUndoEntry } from "@/lib/undo/undo-store";
// UndoEntry type used by createUndoEntry return value

describe("UndoStore", () => {
  beforeEach(() => {
    undoStore.reset();
  });

  describe("push and get", () => {
    it("stores and retrieves an undo entry", () => {
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {});
      undoStore.push(entry);

      const retrieved = undoStore.get(entry.id);
      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(entry.id);
      expect(retrieved!.actionLabel).toBe("test");
      expect(retrieved!.itemIds).toEqual(["item-1"]);
    });

    it("returns undefined for non-existent token", () => {
      expect(undoStore.get("nonexistent")).toBeUndefined();
    });
  });

  describe("undoById", () => {
    it("executes compensation function and removes token", async () => {
      let compensated = false;
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {
        compensated = true;
      });
      undoStore.push(entry);

      const result = await undoStore.undoById(entry.id);
      expect(result.success).toBe(true);
      expect(compensated).toBe(true);
      expect(undoStore.get(entry.id)).toBeUndefined();
    });

    it("returns failure for expired token", async () => {
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {}, 0); // 0ms TTL = immediately expired
      undoStore.push(entry);

      // Wait a tick for expiry
      await new Promise((resolve) => setTimeout(resolve, 10));

      const result = await undoStore.undoById(entry.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain("expired");
    });

    it("returns failure for unknown token", async () => {
      const result = await undoStore.undoById("nonexistent");
      expect(result.success).toBe(false);
      expect(result.message).toContain("not found");
    });

    it("handles compensation function errors gracefully", async () => {
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {
        throw new Error("DB write failed");
      });
      undoStore.push(entry);

      const result = await undoStore.undoById(entry.id);
      expect(result.success).toBe(false);
      expect(result.message).toContain("DB write failed");
      // Token should be removed even on error (M-S-06: removed BEFORE compensate)
      expect(undoStore.get(entry.id)).toBeUndefined();
    });

    // M-S-06: Atomic ownership check — prevents TOCTOU
    it("rejects undoById when userId does not match token owner (M-S-06)", async () => {
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {});
      undoStore.push(entry);

      const result = await undoStore.undoById(entry.id, "user-2");

      expect(result.success).toBe(false);
      expect(result.message).toBe("Not authorized");
      // Token must NOT be consumed — still available for user-1
      expect(undoStore.get(entry.id)).toBeDefined();
    });

    it("succeeds when userId matches token owner (M-S-06)", async () => {
      let compensated = false;
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {
        compensated = true;
      });
      undoStore.push(entry);

      const result = await undoStore.undoById(entry.id, "user-1");

      expect(result.success).toBe(true);
      expect(compensated).toBe(true);
      expect(undoStore.get(entry.id)).toBeUndefined();
    });

    // M-S-06: Token is removed BEFORE compensate() runs — concurrent
    // calls for the same token will find nothing in the Map.
    it("removes token from Map before running compensate so concurrent calls cannot double-execute (M-S-06)", async () => {
      let callCount = 0;
      const entry = createUndoEntry("user-1", "test", ["item-1"], async () => {
        callCount++;
      });
      undoStore.push(entry);

      // Simulate two concurrent calls for the same token
      const [r1, r2] = await Promise.all([
        undoStore.undoById(entry.id),
        undoStore.undoById(entry.id),
      ]);

      // Exactly one should succeed; the other finds the token already gone
      const successes = [r1, r2].filter((r) => r.success).length;
      expect(successes).toBe(1);
      expect(callCount).toBe(1);
      expect(undoStore.get(entry.id)).toBeUndefined();
    });
  });

  describe("undoLast (Ctrl+Z behavior)", () => {
    it("undoes the most recently pushed token", async () => {
      const order: string[] = [];

      const entry1 = createUndoEntry("user-1", "first", ["1"], async () => { order.push("first"); });
      const entry2 = createUndoEntry("user-1", "second", ["2"], async () => { order.push("second"); });
      undoStore.push(entry1);
      undoStore.push(entry2);

      const { tokenId, result } = await undoStore.undoLast();
      expect(result.success).toBe(true);
      expect(tokenId).toBe(entry2.id);
      expect(order).toEqual(["second"]);
    });

    it("skips expired tokens and undoes the next valid one", async () => {
      const order: string[] = [];

      const entry1 = createUndoEntry("user-1", "first", ["1"], async () => { order.push("first"); }, 60_000);
      const entry2 = createUndoEntry("user-1", "expired", ["2"], async () => { order.push("expired"); }, 0);
      undoStore.push(entry1);
      undoStore.push(entry2);

      await new Promise((resolve) => setTimeout(resolve, 10));

      const { tokenId, result } = await undoStore.undoLast();
      expect(result.success).toBe(true);
      expect(tokenId).toBe(entry1.id);
      expect(order).toEqual(["first"]);
    });

    it("returns failure when stack is empty", async () => {
      const { tokenId, result } = await undoStore.undoLast();
      expect(result.success).toBe(false);
      expect(tokenId).toBeNull();
    });
  });

  describe("peek", () => {
    it("returns the most recent unexpired token without removing it", () => {
      const entry = createUndoEntry("user-1", "test", ["1"], async () => {});
      undoStore.push(entry);

      const peeked = undoStore.peek();
      expect(peeked).toBeDefined();
      expect(peeked!.id).toBe(entry.id);

      // Still there
      expect(undoStore.get(entry.id)).toBeDefined();
    });

    it("returns undefined when all tokens are expired", async () => {
      const entry = createUndoEntry("user-1", "test", ["1"], async () => {}, 0);
      undoStore.push(entry);

      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(undoStore.peek()).toBeUndefined();
    });
  });

  describe("size", () => {
    it("tracks active token count", () => {
      expect(undoStore.size).toBe(0);

      undoStore.push(createUndoEntry("user-1", "a", ["1"], async () => {}));
      undoStore.push(createUndoEntry("user-1", "b", ["2"], async () => {}));

      expect(undoStore.size).toBe(2);
    });
  });

  describe("reset", () => {
    it("clears all tokens", () => {
      undoStore.push(createUndoEntry("user-1", "a", ["1"], async () => {}));
      undoStore.push(createUndoEntry("user-1", "b", ["2"], async () => {}));

      undoStore.reset();
      expect(undoStore.size).toBe(0);
    });
  });
});

describe("createUndoEntry", () => {
  it("creates entry with default TTL", () => {
    const entry = createUndoEntry("user-1", "dismiss", ["item-1", "item-2"], async () => {});

    expect(entry.id).toBeDefined();
    expect(entry.actionLabel).toBe("dismiss");
    expect(entry.itemIds).toEqual(["item-1", "item-2"]);
    expect(entry.createdAt).toBeInstanceOf(Date);
    expect(entry.expiresAt).toBeInstanceOf(Date);
    // Default TTL is 10s
    const diffMs = entry.expiresAt.getTime() - entry.createdAt.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(9_000);
    expect(diffMs).toBeLessThanOrEqual(11_000);
  });

  it("creates entry with custom TTL", () => {
    const entry = createUndoEntry("user-1", "archive", ["item-1"], async () => {}, 5_000);

    const diffMs = entry.expiresAt.getTime() - entry.createdAt.getTime();
    expect(diffMs).toBeGreaterThanOrEqual(4_000);
    expect(diffMs).toBeLessThanOrEqual(6_000);
  });
});
