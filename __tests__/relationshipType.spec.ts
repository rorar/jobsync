/**
 * relationshipType.spec.ts — Welle 3 Phase 2 (F-AJ-08), Task 2.1
 *
 * Runtime membership validation for the erased RelationshipType union (ADR-019):
 * the recruiter-triangle relationship between a Job's hiring Company and its
 * optional recruiting agency.
 */

import {
  RELATIONSHIP_TYPES,
  isValidRelationshipType,
} from "@/models/job.model";

describe("RELATIONSHIP_TYPES + isValidRelationshipType", () => {
  it("exposes the canonical relationship types", () => {
    expect(RELATIONSHIP_TYPES).toEqual([
      "direct",
      "recruiting_agency",
      "staffing_agency",
    ]);
  });

  it("accepts every canonical value", () => {
    for (const value of RELATIONSHIP_TYPES) {
      expect(isValidRelationshipType(value)).toBe(true);
    }
  });

  it("rejects unknown strings (boundary defence)", () => {
    expect(isValidRelationshipType("rpo")).toBe(false);
    expect(isValidRelationshipType("agency")).toBe(false);
    expect(isValidRelationshipType("")).toBe(false);
    expect(isValidRelationshipType("DIRECT")).toBe(false);
  });

  it("rejects non-string inputs", () => {
    expect(isValidRelationshipType(null)).toBe(false);
    expect(isValidRelationshipType(undefined)).toBe(false);
    expect(isValidRelationshipType(0)).toBe(false);
    expect(isValidRelationshipType({})).toBe(false);
    expect(isValidRelationshipType(["direct"])).toBe(false);
  });
});
