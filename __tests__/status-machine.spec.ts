import {
  VALID_TRANSITIONS,
  isValidTransition,
  getValidTargets,
  STATUS_COLOR_NAMES,
  STATUS_ORDER,
  COLLAPSED_BY_DEFAULT,
  computeTransitionSideEffects,
} from "@/lib/crm/status-machine";

describe("Status Machine", () => {
  describe("VALID_TRANSITIONS", () => {
    it("should define transitions for all standard statuses", () => {
      const standardStatuses = [
        "bookmarked",
        "applied",
        "interview",
        "offer",
        "accepted",
        "rejected",
        "archived",
      ];
      for (const status of standardStatuses) {
        expect(VALID_TRANSITIONS[status]).toBeDefined();
        expect(Array.isArray(VALID_TRANSITIONS[status])).toBe(true);
      }
    });

    it("should define transitions for legacy statuses", () => {
      expect(VALID_TRANSITIONS["saved"]).toBeDefined();
      expect(VALID_TRANSITIONS["draft"]).toBeDefined();
    });

    it("should map legacy 'saved' to same transitions as 'bookmarked'", () => {
      expect(VALID_TRANSITIONS["saved"]).toEqual(VALID_TRANSITIONS["bookmarked"]);
    });

    it("should map legacy 'draft' to same transitions as 'bookmarked'", () => {
      expect(VALID_TRANSITIONS["draft"]).toEqual(VALID_TRANSITIONS["bookmarked"]);
    });
  });

  describe("isValidTransition", () => {
    // Valid transitions from spec
    const validTransitions: [string, string][] = [
      ["bookmarked", "applied"],
      ["bookmarked", "archived"],
      ["bookmarked", "rejected"],
      ["applied", "interview"],
      ["applied", "rejected"],
      ["applied", "archived"],
      ["interview", "offer"],
      ["interview", "rejected"],
      ["interview", "archived"],
      ["interview", "interview"], // self-transition
      ["offer", "accepted"],
      ["offer", "rejected"],
      ["offer", "archived"],
      ["accepted", "archived"],
      ["rejected", "bookmarked"],
      ["rejected", "archived"],
      ["archived", "bookmarked"],
    ];

    it.each(validTransitions)(
      "should allow transition from %s to %s",
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(true);
      },
    );

    // Invalid transitions
    const invalidTransitions: [string, string][] = [
      ["bookmarked", "offer"], // can't skip applied/interview
      ["bookmarked", "accepted"], // can't skip to accepted
      ["applied", "accepted"], // must go through offer
      ["applied", "bookmarked"], // can't go back to bookmarked from applied
      ["offer", "interview"], // can't go back
      ["offer", "applied"], // can't go back
      ["accepted", "applied"], // terminal, only → archived
      ["accepted", "interview"], // terminal
      ["accepted", "rejected"], // terminal
      ["archived", "applied"], // can only go to bookmarked
      ["archived", "interview"], // can only go to bookmarked
      ["rejected", "applied"], // must go through bookmarked first
    ];

    it.each(invalidTransitions)(
      "should reject transition from %s to %s",
      (from, to) => {
        expect(isValidTransition(from, to)).toBe(false);
      },
    );

    it("should reject self-transitions (except interview)", () => {
      const nonInterviewStatuses = [
        "bookmarked",
        "applied",
        "offer",
        "accepted",
        "rejected",
        "archived",
      ];
      for (const status of nonInterviewStatuses) {
        expect(isValidTransition(status, status)).toBe(false);
      }
    });

    it("should allow interview self-transition", () => {
      expect(isValidTransition("interview", "interview")).toBe(true);
    });

    it("should return false for unknown source status", () => {
      expect(isValidTransition("unknown", "applied")).toBe(false);
    });

    it("should support legacy 'saved' status transitions", () => {
      expect(isValidTransition("saved", "applied")).toBe(true);
      expect(isValidTransition("saved", "archived")).toBe(true);
      expect(isValidTransition("saved", "rejected")).toBe(true);
    });

    it("should support legacy 'draft' status transitions", () => {
      expect(isValidTransition("draft", "applied")).toBe(true);
      expect(isValidTransition("draft", "archived")).toBe(true);
    });
  });

  describe("getValidTargets", () => {
    it("should return valid targets for bookmarked", () => {
      expect(getValidTargets("bookmarked")).toEqual(["applied", "archived", "rejected"]);
    });

    it("should return empty array for unknown status", () => {
      expect(getValidTargets("nonexistent")).toEqual([]);
    });

    it("should include self-transition for interview", () => {
      expect(getValidTargets("interview")).toContain("interview");
    });
  });

  describe("STATUS_COLOR_NAMES", () => {
    it("should define colors for all standard statuses", () => {
      for (const status of STATUS_ORDER) {
        expect(STATUS_COLOR_NAMES[status]).toBeDefined();
        expect(typeof STATUS_COLOR_NAMES[status]).toBe("string");
      }
    });

    it("should define colors for legacy statuses", () => {
      expect(STATUS_COLOR_NAMES["saved"]).toBe("blue");
      expect(STATUS_COLOR_NAMES["draft"]).toBe("blue");
    });

    it("should map bookmarked to blue", () => {
      expect(STATUS_COLOR_NAMES["bookmarked"]).toBe("blue");
    });

    it("should map rejected to red", () => {
      expect(STATUS_COLOR_NAMES["rejected"]).toBe("red");
    });
  });

  describe("STATUS_ORDER", () => {
    it("should have 7 statuses in workflow order", () => {
      expect(STATUS_ORDER).toEqual([
        "bookmarked",
        "applied",
        "interview",
        "offer",
        "accepted",
        "rejected",
        "archived",
      ]);
    });
  });

  describe("COLLAPSED_BY_DEFAULT", () => {
    it("should include rejected and archived", () => {
      expect(COLLAPSED_BY_DEFAULT).toContain("rejected");
      expect(COLLAPSED_BY_DEFAULT).toContain("archived");
    });

    it("should not include active statuses", () => {
      expect(COLLAPSED_BY_DEFAULT).not.toContain("bookmarked");
      expect(COLLAPSED_BY_DEFAULT).not.toContain("applied");
      expect(COLLAPSED_BY_DEFAULT).not.toContain("interview");
      expect(COLLAPSED_BY_DEFAULT).not.toContain("offer");
    });
  });

  describe("computeTransitionSideEffects", () => {
    it("should set applied=true and appliedDate for 'applied' status (first time)", () => {
      const effects = computeTransitionSideEffects("applied", null);
      expect(effects.applied).toBe(true);
      expect(effects.appliedDate).toBeInstanceOf(Date);
    });

    it("should set applied=true but NOT overwrite appliedDate for 'applied' status (subsequent)", () => {
      const existingDate = new Date("2026-01-01");
      const effects = computeTransitionSideEffects("applied", existingDate);
      expect(effects.applied).toBe(true);
      expect(effects.appliedDate).toBeUndefined();
    });

    it("should set applied=true for 'interview' status", () => {
      const effects = computeTransitionSideEffects("interview", null);
      expect(effects.applied).toBe(true);
      expect(effects.appliedDate).toBeUndefined();
    });

    it("should return empty object for other statuses", () => {
      expect(computeTransitionSideEffects("offer", null)).toEqual({});
      expect(computeTransitionSideEffects("rejected", null)).toEqual({});
      expect(computeTransitionSideEffects("archived", null)).toEqual({});
      expect(computeTransitionSideEffects("bookmarked", null)).toEqual({});
    });
  });
});
