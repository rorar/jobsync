/**
 * Tests for the CRM activity-timeline formatting helpers (activity-format.ts).
 *
 * activityLabel  — A-4: a missing crm.activity.<type> key must degrade to a
 *                  humanized label, never leak the raw key string.
 * activityDetailText — IT-B2: render a localised sentence from the details JSON,
 *                  and NEVER return a raw JSON payload for the DOM.
 */
import { activityLabel, activityDetailText } from "@/components/crm/activity-format";

// dict[key] ?? key — mirrors the real translate contract (use-translations.ts).
const DICT: Record<string, string> = {
  "crm.activity.referral_recorded": "Referral recorded",
  "crm.activity.referral_status_changed": "Referral status changed",
  "insideTrack.kind.insider_relay": "Insider relay",
  "insideTrack.status.open": "Open",
  "insideTrack.status.engaged": "Engaged",
  "insideTrack.status.stale": "Stale",
};
const t = (key: string): string => DICT[key] ?? key;

describe("activityLabel", () => {
  it("returns the localised label for a known activity type", () => {
    expect(activityLabel("referral_recorded", t)).toBe("Referral recorded");
  });

  it("humanizes an unknown type instead of leaking the raw key (A-4)", () => {
    // No crm.activity.some_new_thing key → dict returns the key → must degrade.
    expect(activityLabel("some_new_thing", t)).toBe("Some new thing");
  });
});

describe("activityDetailText", () => {
  it("renders the localised referral kind for referral_recorded", () => {
    const details = JSON.stringify({ referralId: "r1", kind: "insider_relay" });
    expect(activityDetailText("referral_recorded", details, t)).toBe("Insider relay");
  });

  it("renders a localised previous → new sentence for referral_status_changed", () => {
    const details = JSON.stringify({ referralId: "r1", previousStatus: "open", newStatus: "engaged" });
    expect(activityDetailText("referral_status_changed", details, t)).toBe("Open → Engaged");
  });

  it("localises the system stale sweep transition", () => {
    const details = JSON.stringify({ referralId: "r1", previousStatus: "engaged", newStatus: "stale" });
    expect(activityDetailText("referral_status_changed", details, t)).toBe("Engaged → Stale");
  });

  it("shows job status values verbatim for status_changed (user-defined, not i18n)", () => {
    const details = JSON.stringify({ previousStatus: "applied", newStatus: "interview" });
    expect(activityDetailText("status_changed", details, t)).toBe("applied → interview");
  });

  it("drops a null previousStatus (initial status) and shows only the new value", () => {
    const details = JSON.stringify({ previousStatus: null, newStatus: "applied" });
    expect(activityDetailText("status_changed", details, t)).toBe("applied");
  });

  it("returns null for an unknown activity type's JSON so no raw payload reaches the DOM (IT-B2)", () => {
    const details = JSON.stringify({ stagedVacancyId: "sv-1" });
    expect(activityDetailText("application_submitted", details, t)).toBeNull();
  });

  it("returns non-JSON free text verbatim (legacy entries)", () => {
    expect(activityDetailText("note_added", "a plain note", t)).toBe("a plain note");
  });

  it("returns null for null/empty details", () => {
    expect(activityDetailText("referral_recorded", null, t)).toBeNull();
    expect(activityDetailText("referral_recorded", "", t)).toBeNull();
  });
});
