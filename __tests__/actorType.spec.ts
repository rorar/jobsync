/**
 * actorType.spec.ts — Welle 3 Phase 5 (Gap-7), Task 5.1
 *
 * Runtime membership validation for the erased ActorType union (ADR-019): the
 * provenance of who/what last updated a CRM record (user / automation / self).
 */

jest.mock("server-only", () => ({}));

import { ACTOR_TYPES, isValidActorType } from "@/models/person.model";

describe("ACTOR_TYPES + isValidActorType", () => {
  it("exposes the canonical actor types (user / automation / self)", () => {
    expect(ACTOR_TYPES).toEqual(["user", "automation", "self"]);
  });

  it("accepts every canonical value", () => {
    for (const v of ACTOR_TYPES) expect(isValidActorType(v)).toBe(true);
  });

  it("rejects unknown strings + non-strings (boundary defence)", () => {
    expect(isValidActorType("admin")).toBe(false);
    expect(isValidActorType("User")).toBe(false);
    expect(isValidActorType("")).toBe(false);
    expect(isValidActorType(null)).toBe(false);
    expect(isValidActorType(undefined)).toBe(false);
    expect(isValidActorType(42)).toBe(false);
  });
});
