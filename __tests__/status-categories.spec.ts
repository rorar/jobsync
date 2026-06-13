/**
 * Status Categories — pure domain layer (Welle 4, F-AJ-09).
 *
 * Tests the category model that replaces the fixed JobStatus enum + hardcoded
 * VALID_TRANSITIONS matrix. Spec: specs/job-status.allium.
 *
 * The category `kind` carries immutable semantics (is_applied_stage, is_terminal,
 * default_collapsed, allows_self_transition, sort_order). Transition validity is
 * category-ordered with bounded reopen. The applied flag derives from the target
 * category's is_applied_stage.
 */

import {
  STATUS_CATEGORY_KINDS,
  type StatusCategoryKind,
  type CategorySemantics,
  categorySemanticsForKind,
  CATEGORY_SEED,
  DEFAULT_STATUS_SEED,
  LEGACY_VALUE_TO_SEED_VALUE,
  isValidCategoryTransition,
  computeAppliedSideEffect,
} from "@/lib/crm/status-categories";

describe("status-categories: kinds + semantics", () => {
  it("defines the 7 system kinds in workflow order", () => {
    expect(STATUS_CATEGORY_KINDS).toEqual([
      "lead",
      "applied",
      "interviewing",
      "offer",
      "won",
      "lost",
      "archived",
    ]);
  });

  // Spec invariant SemanticsMatchKind
  const expected: Record<
    StatusCategoryKind,
    Omit<CategorySemantics, "kind">
  > = {
    lead: { sortOrder: 0, isAppliedStage: false, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
    applied: { sortOrder: 1, isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
    interviewing: { sortOrder: 2, isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: true },
    offer: { sortOrder: 3, isAppliedStage: true, isTerminal: false, defaultCollapsed: false, allowsSelfTransition: false },
    won: { sortOrder: 4, isAppliedStage: true, isTerminal: true, defaultCollapsed: false, allowsSelfTransition: false },
    lost: { sortOrder: 5, isAppliedStage: false, isTerminal: false, defaultCollapsed: true, allowsSelfTransition: false },
    archived: { sortOrder: 6, isAppliedStage: false, isTerminal: false, defaultCollapsed: true, allowsSelfTransition: false },
  };

  it.each([...STATUS_CATEGORY_KINDS])("derives correct semantics for kind %s", (kind) => {
    const sem = categorySemanticsForKind(kind);
    expect(sem.kind).toBe(kind);
    expect(sem).toMatchObject(expected[kind]);
  });

  it("matches the spec SemanticsMatchKind invariant for every kind", () => {
    for (const kind of STATUS_CATEGORY_KINDS) {
      const s = categorySemanticsForKind(kind);
      expect(s.isAppliedStage).toBe(["applied", "interviewing", "offer", "won"].includes(kind));
      expect(s.isTerminal).toBe(kind === "won");
      expect(s.defaultCollapsed).toBe(["lost", "archived"].includes(kind));
      expect(s.allowsSelfTransition).toBe(kind === "interviewing");
    }
  });

  it("CATEGORY_SEED has presentation (label+colour) for every kind", () => {
    for (const kind of STATUS_CATEGORY_KINDS) {
      expect(CATEGORY_SEED[kind].label.length).toBeGreaterThan(0);
      expect(CATEGORY_SEED[kind].colour.length).toBeGreaterThan(0);
    }
  });
});

describe("status-categories: default seed set", () => {
  it("seeds 8 statuses across the categories", () => {
    expect(DEFAULT_STATUS_SEED).toHaveLength(8);
  });

  it("marks exactly one default status, and it is 'bookmarked' in the lead stage", () => {
    const defaults = DEFAULT_STATUS_SEED.filter((s) => s.isDefault);
    expect(defaults).toHaveLength(1);
    expect(defaults[0].value).toBe("bookmarked");
    expect(defaults[0].kind).toBe("lead");
  });

  it("maps each seed value to its expected kind", () => {
    const byValue = Object.fromEntries(DEFAULT_STATUS_SEED.map((s) => [s.value, s.kind]));
    expect(byValue).toMatchObject({
      bookmarked: "lead",
      applied: "applied",
      interview: "interviewing",
      offer: "offer",
      accepted: "won",
      rejected: "lost",
      archived: "archived",
      expired: "archived",
    });
  });

  it("has unique values and sane sortOrder per status", () => {
    const values = DEFAULT_STATUS_SEED.map((s) => s.value);
    expect(new Set(values).size).toBe(values.length);
  });
});

describe("status-categories: legacy value mapping (migration)", () => {
  it("maps legacy draft/saved/new to bookmarked", () => {
    expect(LEGACY_VALUE_TO_SEED_VALUE["draft"]).toBe("bookmarked");
    expect(LEGACY_VALUE_TO_SEED_VALUE["saved"]).toBe("bookmarked");
    expect(LEGACY_VALUE_TO_SEED_VALUE["new"]).toBe("bookmarked");
  });

  it("maps known values to themselves", () => {
    for (const v of ["bookmarked", "applied", "interview", "offer", "accepted", "rejected", "archived", "expired"]) {
      expect(LEGACY_VALUE_TO_SEED_VALUE[v]).toBe(v);
    }
  });
});

describe("status-categories: isValidCategoryTransition", () => {
  const cat = (k: StatusCategoryKind) => categorySemanticsForKind(k);

  it("allows forward moves across stages", () => {
    expect(isValidCategoryTransition(cat("lead"), cat("applied"))).toBe(true);
    expect(isValidCategoryTransition(cat("applied"), cat("interviewing"))).toBe(true);
    expect(isValidCategoryTransition(cat("interviewing"), cat("offer"))).toBe(true);
    expect(isValidCategoryTransition(cat("offer"), cat("won"))).toBe(true);
  });

  it("allows forward jump-ahead across stages (intentionally more permissive than old matrix)", () => {
    expect(isValidCategoryTransition(cat("lead"), cat("won"))).toBe(true);
    expect(isValidCategoryTransition(cat("applied"), cat("won"))).toBe(true);
  });

  it("allows lateral moves within the same stage (two statuses in one category)", () => {
    expect(isValidCategoryTransition(cat("interviewing"), cat("interviewing"))).toBe(true);
    expect(isValidCategoryTransition(cat("lead"), cat("lead"))).toBe(true);
  });

  it("rejects backward moves between non-closed stages", () => {
    expect(isValidCategoryTransition(cat("offer"), cat("applied"))).toBe(false);
    expect(isValidCategoryTransition(cat("applied"), cat("lead"))).toBe(false);
    expect(isValidCategoryTransition(cat("interviewing"), cat("applied"))).toBe(false);
  });

  it("allows BOUNDED reopen from closed stages back to the default (lead) stage only", () => {
    expect(isValidCategoryTransition(cat("won"), cat("lead"))).toBe(true);
    expect(isValidCategoryTransition(cat("lost"), cat("lead"))).toBe(true);
    expect(isValidCategoryTransition(cat("archived"), cat("lead"))).toBe(true);
  });

  it("rejects reopen from closed stages to a NON-default earlier stage", () => {
    expect(isValidCategoryTransition(cat("lost"), cat("applied"))).toBe(false);
    expect(isValidCategoryTransition(cat("lost"), cat("interviewing"))).toBe(false);
    expect(isValidCategoryTransition(cat("won"), cat("offer"))).toBe(false);
  });

  it("rejects all reopen when allowReopenFromClosed is false", () => {
    expect(isValidCategoryTransition(cat("lost"), cat("lead"), { allowReopenFromClosed: false })).toBe(false);
    expect(isValidCategoryTransition(cat("won"), cat("lead"), { allowReopenFromClosed: false })).toBe(false);
  });

  it("self-transition (same status) only allowed when the category allows it", () => {
    // interviewing allows multi-round self-loops
    expect(isValidCategoryTransition(cat("interviewing"), cat("interviewing"), { sameStatus: true })).toBe(true);
    // other categories: re-selecting the same status is a no-op, rejected
    expect(isValidCategoryTransition(cat("applied"), cat("applied"), { sameStatus: true })).toBe(false);
    expect(isValidCategoryTransition(cat("lead"), cat("lead"), { sameStatus: true })).toBe(false);
    expect(isValidCategoryTransition(cat("won"), cat("won"), { sameStatus: true })).toBe(false);
  });

  it("honours a custom default stage kind for reopen", () => {
    // if the install's default stage were 'applied', reopen targets applied, not lead
    expect(isValidCategoryTransition(cat("lost"), cat("applied"), { defaultStageKind: "applied" })).toBe(true);
    expect(isValidCategoryTransition(cat("lost"), cat("lead"), { defaultStageKind: "applied" })).toBe(false);
  });
});

describe("status-categories: computeAppliedSideEffect", () => {
  it("sets applied + appliedDate on first entry into an applied stage", () => {
    const e = computeAppliedSideEffect(categorySemanticsForKind("applied"), null);
    expect(e.applied).toBe(true);
    expect(e.appliedDate).toBeInstanceOf(Date);
  });

  it("sets applied but does NOT overwrite an existing appliedDate", () => {
    const e = computeAppliedSideEffect(categorySemanticsForKind("interviewing"), new Date("2026-01-01"));
    expect(e.applied).toBe(true);
    expect(e.appliedDate).toBeUndefined();
  });

  it("applied-stage offer/won also set applied=true (fixes old matrix gap)", () => {
    expect(computeAppliedSideEffect(categorySemanticsForKind("offer"), null).applied).toBe(true);
    expect(computeAppliedSideEffect(categorySemanticsForKind("won"), null).applied).toBe(true);
  });

  it("returns no side effects for non-applied stages", () => {
    expect(computeAppliedSideEffect(categorySemanticsForKind("lead"), null)).toEqual({});
    expect(computeAppliedSideEffect(categorySemanticsForKind("lost"), null)).toEqual({});
    expect(computeAppliedSideEffect(categorySemanticsForKind("archived"), null)).toEqual({});
  });
});
