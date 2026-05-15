/**
 * Validate Edit Transition Tests (BS-G1-1 / G11)
 *
 * Tests the edit-form-specific transition validator, including the
 * newly added expired status transitions.
 */

import { isEditTransitionValid } from "@/lib/crm/validate-edit-transition";

describe("isEditTransitionValid", () => {
  // --- Expired status (G11 fix) ---

  it("allows expired → bookmarked", () => {
    expect(isEditTransitionValid("expired", "bookmarked")).toBe(true);
  });

  it("allows expired → archived", () => {
    expect(isEditTransitionValid("expired", "archived")).toBe(true);
  });

  it("rejects expired → applied (not in allowed targets)", () => {
    expect(isEditTransitionValid("expired", "applied")).toBe(false);
  });

  it("rejects expired → expired (self-transition)", () => {
    expect(isEditTransitionValid("expired", "expired")).toBe(false);
  });

  // --- Consistency with status-machine.ts ---

  it("allows bookmarked → applied", () => {
    expect(isEditTransitionValid("bookmarked", "applied")).toBe(true);
  });

  it("allows bookmarked → archived", () => {
    expect(isEditTransitionValid("bookmarked", "archived")).toBe(true);
  });

  it("allows bookmarked → rejected", () => {
    expect(isEditTransitionValid("bookmarked", "rejected")).toBe(true);
  });

  it("rejects bookmarked → offer (skip)", () => {
    expect(isEditTransitionValid("bookmarked", "offer")).toBe(false);
  });

  it("allows interview → interview (self-transition exception)", () => {
    expect(isEditTransitionValid("interview", "interview")).toBe(true);
  });

  it("rejects applied → applied (no self-transition)", () => {
    expect(isEditTransitionValid("applied", "applied")).toBe(false);
  });

  it("allows rejected → bookmarked (retry)", () => {
    expect(isEditTransitionValid("rejected", "bookmarked")).toBe(true);
  });

  it("allows archived → bookmarked (reactivate)", () => {
    expect(isEditTransitionValid("archived", "bookmarked")).toBe(true);
  });

  // --- Legacy statuses ---

  it("allows draft → applied", () => {
    expect(isEditTransitionValid("draft", "applied")).toBe(true);
  });

  it("allows saved → applied", () => {
    expect(isEditTransitionValid("saved", "applied")).toBe(true);
  });

  // --- Unknown status ---

  it("rejects unknown status", () => {
    expect(isEditTransitionValid("nonexistent", "bookmarked")).toBe(false);
  });
});
