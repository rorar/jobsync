import { computeReorderSortValue } from "@/lib/crm/reorder";

const sib = (orders: number[]) => orders.map((sortOrder) => ({ sortOrder }));

describe("computeReorderSortValue", () => {
  it("returns null for a no-op (same index)", () => {
    expect(computeReorderSortValue(sib([0, 1, 2]), 1, 1)).toBeNull();
  });

  it("returns null for out-of-range indices", () => {
    expect(computeReorderSortValue(sib([0, 1]), 0, 5)).toBeNull();
    expect(computeReorderSortValue(sib([0, 1]), -1, 0)).toBeNull();
  });

  it("moves an item down to a midpoint between its new neighbours", () => {
    // [A0,B1,C2,D3] move A(0) -> index 2 -> between C(2) and D(3) => 2.5
    expect(computeReorderSortValue(sib([0, 1, 2, 3]), 0, 2)).toBe(2.5);
  });

  it("moves an item up to a midpoint between its new neighbours", () => {
    // [A0,B1,C2,D3] move D(3) -> index 1 -> between A(0) and B(1) => 0.5
    expect(computeReorderSortValue(sib([0, 1, 2, 3]), 3, 1)).toBe(0.5);
  });

  it("moves to the top (below the first sibling)", () => {
    // move C(2) -> index 0 -> before A(0) => -1
    expect(computeReorderSortValue(sib([0, 1, 2]), 2, 0)).toBe(-1);
  });

  it("moves to the end (above the last sibling)", () => {
    // move A(0) -> index 2 (last) of [0,1,2] -> after C(2) => 3
    expect(computeReorderSortValue(sib([0, 1, 2]), 0, 2)).toBe(3);
  });

  it("adjacent up/down swap yields a value between the two", () => {
    // [A0,B10] move B(1) up to index 0 -> before A => -1
    expect(computeReorderSortValue(sib([0, 10]), 1, 0)).toBe(-1);
    // move A(0) down to index 1 -> after B => 11
    expect(computeReorderSortValue(sib([0, 10]), 0, 1)).toBe(11);
  });
});
