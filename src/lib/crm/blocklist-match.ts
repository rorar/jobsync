import "server-only";

/**
 * CrmBlocklist matching (Welle 3 Gap-6 / P4).
 *
 * Pure, dependency-free matcher for the three blocklist modes:
 *  - `email` / `phone`: exact handle match (normalised lower-case).
 *  - `domain`: matches an email whose domain equals the entry, or any subdomain
 *    of it (entry "acme.com" blocks "x@acme.com" and "x@eu.acme.com").
 *  - `pattern`: glob with `*` wildcards, matched WITHOUT regex so it is immune to
 *    ReDoS (linear segment scan, bounded by the input length).
 *
 * Kept as a leaf so it is unit-testable and reusable by both the suppression
 * primitive (`isHandleBlocked`) and the anonymise cascade.
 */

export type BlocklistEntryLike = { type: string; handle: string };

/** Extract the domain of an email handle, or null if it is not an email. */
export function extractEmailDomain(handle: string): string | null {
  const at = handle.lastIndexOf("@");
  if (at === -1 || at === handle.length - 1) return null;
  return handle.slice(at + 1).trim().toLowerCase();
}

/**
 * Glob match with `*` wildcards, ReDoS-safe (no regex / no backtracking).
 * `*` matches any run of characters (including empty). All other characters are
 * literal. Matching is case-insensitive; inputs are normalised by the caller.
 */
export function matchGlobPattern(pattern: string, value: string): boolean {
  const p = pattern.toLowerCase();
  const v = value.toLowerCase();
  const segments = p.split("*");

  // No wildcard → exact match.
  if (segments.length === 1) return p === v;

  let pos = 0;

  // First segment must be a prefix (unless pattern starts with `*`).
  const first = segments[0];
  if (first) {
    if (!v.startsWith(first)) return false;
    pos = first.length;
  }

  // Middle segments must appear in order.
  for (let i = 1; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (seg === "") continue; // consecutive `*`
    const idx = v.indexOf(seg, pos);
    if (idx === -1) return false;
    pos = idx + seg.length;
  }

  // Last segment must be a suffix (unless pattern ends with `*`).
  const last = segments[segments.length - 1];
  if (last) {
    if (v.length - pos < last.length) return false;
    return v.endsWith(last);
  }
  return true;
}

/**
 * True when `handle` is suppressed by any blocklist `entries`. Entries are
 * assumed normalised (lower-cased handle, as stored). `handle` is normalised here.
 */
export function isBlockedByEntries(
  handle: string,
  entries: readonly BlocklistEntryLike[],
): boolean {
  const h = handle.trim().toLowerCase();
  if (!h) return false;
  const domain = extractEmailDomain(h);

  for (const entry of entries) {
    switch (entry.type) {
      case "domain":
        if (domain && (domain === entry.handle || domain.endsWith(`.${entry.handle}`))) {
          return true;
        }
        // A domain entry also blocks the bare domain handle itself.
        if (h === entry.handle) return true;
        break;
      case "pattern":
        if (matchGlobPattern(entry.handle, h)) return true;
        break;
      default: // email | phone → exact
        if (h === entry.handle) return true;
    }
  }
  return false;
}
