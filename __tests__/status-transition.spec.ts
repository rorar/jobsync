import {
  isValidCategoryTransitionByKind,
  appliedSideEffectByKind,
} from "@/lib/crm/status-transition";

describe("isValidCategoryTransitionByKind", () => {
  it("allows forward progression (lead -> applied)", () => {
    expect(isValidCategoryTransitionByKind("lead", "applied")).toBe(true);
  });

  it("allows a forward jump (lead -> won) — category model is more permissive", () => {
    expect(isValidCategoryTransitionByKind("lead", "won")).toBe(true);
  });

  it("allows lateral within the same stage (interviewing -> interviewing)", () => {
    expect(isValidCategoryTransitionByKind("interviewing", "interviewing")).toBe(true);
  });

  it("rejects a backward jump that is not a bounded reopen (offer -> applied)", () => {
    expect(isValidCategoryTransitionByKind("offer", "applied")).toBe(false);
  });

  it("allows bounded reopen from a closed stage into lead (lost -> lead)", () => {
    expect(isValidCategoryTransitionByKind("lost", "lead")).toBe(true);
    expect(isValidCategoryTransitionByKind("archived", "lead")).toBe(true);
    expect(isValidCategoryTransitionByKind("won", "lead")).toBe(true);
  });

  it("rejects reopen from a closed stage into a non-default stage (lost -> offer)", () => {
    expect(isValidCategoryTransitionByKind("lost", "offer")).toBe(false);
  });

  it("rejects unknown kinds (fail closed)", () => {
    expect(isValidCategoryTransitionByKind("bogus", "lead")).toBe(false);
    expect(isValidCategoryTransitionByKind("lead", "bogus")).toBe(false);
  });
});

describe("appliedSideEffectByKind", () => {
  it("marks applied + sets appliedDate on first entry into an applied stage", () => {
    const fx = appliedSideEffectByKind("applied", null);
    expect(fx.applied).toBe(true);
    expect(fx.appliedDate).toBeInstanceOf(Date);
  });

  it("marks applied but preserves an existing appliedDate (immutability)", () => {
    const fx = appliedSideEffectByKind("interviewing", new Date("2020-01-01"));
    expect(fx.applied).toBe(true);
    expect(fx.appliedDate).toBeUndefined();
  });

  it("is empty for a non-applied stage (lead)", () => {
    expect(appliedSideEffectByKind("lead", null)).toEqual({});
  });

  it("is empty for an unknown kind", () => {
    expect(appliedSideEffectByKind("bogus", null)).toEqual({});
  });
});
