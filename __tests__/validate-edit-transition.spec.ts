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

  // --- ET-2: offer + accepted coverage ---

  it("allows offer → accepted", () => {
    expect(isEditTransitionValid("offer", "accepted")).toBe(true);
  });

  it("allows offer → rejected", () => {
    expect(isEditTransitionValid("offer", "rejected")).toBe(true);
  });

  it("allows offer → archived", () => {
    expect(isEditTransitionValid("offer", "archived")).toBe(true);
  });

  it("rejects offer → interview (backward skip)", () => {
    expect(isEditTransitionValid("offer", "interview")).toBe(false);
  });

  it("allows accepted → archived (only valid target)", () => {
    expect(isEditTransitionValid("accepted", "archived")).toBe(true);
  });

  it("rejects accepted → bookmarked", () => {
    expect(isEditTransitionValid("accepted", "bookmarked")).toBe(false);
  });

  // --- ET-3: interview forward path ---

  it("allows interview → offer", () => {
    expect(isEditTransitionValid("interview", "offer")).toBe(true);
  });

  // --- ET-4: expired exhaustive rejections ---

  it("rejects expired → interview", () => {
    expect(isEditTransitionValid("expired", "interview")).toBe(false);
  });

  it("rejects expired → offer", () => {
    expect(isEditTransitionValid("expired", "offer")).toBe(false);
  });

  it("rejects expired → accepted", () => {
    expect(isEditTransitionValid("expired", "accepted")).toBe(false);
  });

  it("rejects expired → rejected", () => {
    expect(isEditTransitionValid("expired", "rejected")).toBe(false);
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
