/**
 * CRM activity-timeline formatting helpers.
 *
 * Pure functions (no React) so they are unit-testable without rendering. Consumed
 * by ActivityTimeline.tsx. SoT: specs/crm.allium RecordReferralRecorded /
 * RecordReferralStatusChange ("the timeline must render a LOCALISED label").
 */

/** Translate fn shape. Keys are built dynamically (activity types / referral statuses). */
type Translate = (key: string) => string;

/** Humanize a raw type key: "some_thing" -> "Some thing". */
function humanize(type: string): string {
  const spaced = type.replace(/_/g, " ").trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : type;
}

/**
 * Localised activity-type label. A-4: the dictionary returns the key itself on a
 * miss (`dict[key] ?? key`), which would leak "crm.activity.foo" into the UI.
 * Detect that and degrade to a humanized type instead.
 */
export function activityLabel(type: string, t: Translate): string {
  const key = `crm.activity.${type}`;
  const label = t(key);
  return label === key ? humanize(type) : label;
}

/**
 * IT-B2: render a localised sentence from the `details` JSON blob instead of the
 * raw payload. Returns null when there is nothing meaningful to show, so the caller
 * renders NO details line and a raw JSON object never reaches the DOM.
 */
export function activityDetailText(type: string, rawDetails: unknown, t: Translate): string | null {
  if (rawDetails == null || rawDetails === "") return null;

  let parsed: Record<string, unknown> | null = null;
  if (typeof rawDetails === "string") {
    try {
      const j: unknown = JSON.parse(rawDetails);
      parsed = typeof j === "object" && j !== null ? (j as Record<string, unknown>) : null;
    } catch {
      // Non-JSON free text (legacy entries): safe to show verbatim.
      return rawDetails;
    }
  }
  if (!parsed) return null;

  switch (type) {
    case "referral_recorded": {
      const kind = typeof parsed.kind === "string" ? parsed.kind : null;
      return kind ? t(`insideTrack.kind.${kind}`) : null;
    }
    case "referral_status_changed":
    case "status_changed": {
      const next = parsed.newStatus;
      if (typeof next !== "string") return null;
      // Referral statuses are a fixed localised vocabulary; job statuses are
      // user-defined values shown verbatim (never i18n keys).
      const label = (v: unknown): string => {
        if (typeof v !== "string" || v === "") return "";
        return type === "referral_status_changed" ? t(`insideTrack.status.${v}`) : v;
      };
      const from = label(parsed.previousStatus);
      const to = label(next);
      return from ? `${from} → ${to}` : to;
    }
    default:
      // Unknown / legacy JSON shape: hide rather than leak the raw payload.
      return null;
  }
}
