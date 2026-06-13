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

  // Welle 4 self-transition wiring: re-selecting the SAME status (sameStatus:true)
  // is valid ONLY for a stage whose category allows self-transition (interviewing).
  describe("sameStatus option (self-transition)", () => {
    it("allows a same-status re-selection on a self-transition stage (interviewing)", () => {
      expect(
        isValidCategoryTransitionByKind("interviewing", "interviewing", { sameStatus: true }),
      ).toBe(true);
    });

    it("rejects a same-status re-selection on a non-self-transition stage (applied)", () => {
      expect(
        isValidCategoryTransitionByKind("applied", "applied", { sameStatus: true }),
      ).toBe(false);
    });

    it("rejects same-status re-selection on lead / offer / won / lost / archived", () => {
      for (const kind of ["lead", "offer", "won", "lost", "archived"]) {
        expect(isValidCategoryTransitionByKind(kind, kind, { sameStatus: true })).toBe(false);
      }
    });

    it("fails closed for unknown kinds even with sameStatus", () => {
      expect(isValidCategoryTransitionByKind("bogus", "bogus", { sameStatus: true })).toBe(false);
    });

    it("defaults to a normal (different-status) transition when sameStatus is omitted", () => {
      // interviewing -> interviewing without the flag is still a valid lateral move.
      expect(isValidCategoryTransitionByKind("interviewing", "interviewing")).toBe(true);
      // applied -> applied lateral (different statuses, same stage) is also valid.
      expect(isValidCategoryTransitionByKind("applied", "applied")).toBe(true);
    });
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
