/**
 * insideTrack.model.spec.ts — Welle 5 (Inside Track) Phase 2, Task 2.4
 *
 * Domain enums, runtime guards (ADR-019), the Referral lifecycle transition
 * graph, and config constants. SoT: specs/inside-track.allium
 * (enums ConnectionKind/ConnectionStrength, entity Referral `transitions status`,
 * config block).
 */

import {
  REFERRAL_KINDS,
  REFERRAL_STATUSES,
  CONNECTION_KINDS,
  CONNECTION_STRENGTHS,
  isValidReferralKind,
  isValidReferralStatus,
  isValidConnectionKind,
  isValidConnectionStrength,
  isValidReferralTransition,
  INSIDE_TRACK_CONFIG,
} from "@/models/insideTrack.model";

describe("Inside Track enums (crm/inside-track.allium SoT)", () => {
  it("exposes the canonical referral kinds", () => {
    expect(REFERRAL_KINDS).toEqual(["insider_relay", "network_path"]);
  });
  it("exposes the canonical referral statuses", () => {
    expect(REFERRAL_STATUSES).toEqual([
      "open",
      "engaged",
      "relayed",
      "in_review",
      "converted",
      "declined",
      "stale",
    ]);
  });
  it("exposes the canonical connection kinds", () => {
    expect(CONNECTION_KINDS).toEqual([
      "former_colleague",
      "friend",
      "acquaintance",
      "mentor",
      "family",
      "other",
    ]);
  });
  it("exposes the canonical connection strengths", () => {
    expect(CONNECTION_STRENGTHS).toEqual(["close", "medium", "weak"]);
  });
});

describe("Inside Track runtime guards (ADR-019)", () => {
  it("isValidReferralKind", () => {
    expect(isValidReferralKind("insider_relay")).toBe(true);
    expect(isValidReferralKind("network_path")).toBe(true);
    expect(isValidReferralKind("InsiderRelay")).toBe(false);
    expect(isValidReferralKind(null)).toBe(false);
    expect(isValidReferralKind(123)).toBe(false);
  });
  it("isValidReferralStatus", () => {
    for (const s of REFERRAL_STATUSES) expect(isValidReferralStatus(s)).toBe(true);
    expect(isValidReferralStatus("archived")).toBe(false);
    expect(isValidReferralStatus(undefined)).toBe(false);
  });
  it("isValidConnectionKind", () => {
    expect(isValidConnectionKind("former_colleague")).toBe(true);
    expect(isValidConnectionKind("colleague")).toBe(false);
    expect(isValidConnectionKind({})).toBe(false);
  });
  it("isValidConnectionStrength", () => {
    expect(isValidConnectionStrength("close")).toBe(true);
    expect(isValidConnectionStrength("strong")).toBe(false);
    expect(isValidConnectionStrength(null)).toBe(false);
  });
});

describe("isValidReferralTransition (inside-track.allium transition graph)", () => {
  it("accepts every legal transition from the spec graph", () => {
    const legal: Array<[string, string]> = [
      ["open", "engaged"],
      ["open", "declined"],
      ["open", "stale"],
      ["engaged", "relayed"],
      ["engaged", "declined"],
      ["engaged", "stale"],
      ["relayed", "in_review"],
      ["relayed", "declined"],
      ["relayed", "stale"],
      ["in_review", "converted"],
      ["in_review", "declined"],
      ["in_review", "stale"],
      ["stale", "open"],
      ["stale", "declined"],
    ];
    for (const [from, to] of legal) {
      expect(isValidReferralTransition(from, to)).toBe(true);
    }
  });

  it("rejects illegal transitions", () => {
    expect(isValidReferralTransition("open", "relayed")).toBe(false); // skips engaged
    expect(isValidReferralTransition("open", "converted")).toBe(false);
    expect(isValidReferralTransition("engaged", "open")).toBe(false); // no backward except stale->open
    expect(isValidReferralTransition("relayed", "engaged")).toBe(false);
    expect(isValidReferralTransition("in_review", "relayed")).toBe(false);
    expect(isValidReferralTransition("stale", "engaged")).toBe(false); // only stale->open|declined
  });

  it("treats converted and declined as terminal (no outgoing transitions)", () => {
    for (const to of REFERRAL_STATUSES) {
      expect(isValidReferralTransition("converted", to)).toBe(false);
      expect(isValidReferralTransition("declined", to)).toBe(false);
    }
  });

  it("rejects unknown / same-state inputs", () => {
    expect(isValidReferralTransition("open", "open")).toBe(false);
    expect(isValidReferralTransition("bogus", "engaged")).toBe(false);
    expect(isValidReferralTransition("open", "bogus")).toBe(false);
  });
});

describe("INSIDE_TRACK_CONFIG (inside-track.allium config)", () => {
  it("matches the spec defaults", () => {
    expect(INSIDE_TRACK_CONFIG.staleAfterDays).toBe(21);
    expect(INSIDE_TRACK_CONFIG.maxWarmPathDepth).toBe(2);
    expect(INSIDE_TRACK_CONFIG.maxConnectionsPerUser).toBe(10000);
  });
  it("is immutable (as const)", () => {
    expect(Object.isFrozen(INSIDE_TRACK_CONFIG)).toBe(true);
  });
});
