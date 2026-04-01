/**
 * CompanyBlacklist Domain Model
 *
 * Represents a user-scoped company blacklist entry.
 * Used to auto-filter DiscoveredVacancies in the Runner pipeline
 * before they are saved as StagedVacancies.
 */

export type BlacklistMatchType = "exact" | "contains" | "starts_with" | "ends_with";

export interface CompanyBlacklist {
  id: string;
  userId: string;
  pattern: string;
  matchType: BlacklistMatchType;
  reason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Check whether a company name matches a blacklist entry.
 * - "exact": case-insensitive full match
 * - "contains": case-insensitive substring match
 * - "starts_with": case-insensitive prefix match
 * - "ends_with": case-insensitive suffix match
 */
export function matchesBlacklistEntry(
  companyName: string,
  entry: Pick<CompanyBlacklist, "pattern" | "matchType">,
): boolean {
  const name = companyName.toLowerCase().trim();
  const pattern = entry.pattern.toLowerCase().trim();

  switch (entry.matchType) {
    case "exact":
      return name === pattern;
    case "contains":
      return name.includes(pattern);
    case "starts_with":
      return name.startsWith(pattern);
    case "ends_with":
      return name.endsWith(pattern);
  }
}

/**
 * Check whether a company name is blacklisted against a list of entries.
 */
export function isCompanyBlacklisted(
  companyName: string | null | undefined,
  entries: Pick<CompanyBlacklist, "pattern" | "matchType">[],
): boolean {
  if (!companyName) return false;
  return entries.some((entry) => matchesBlacklistEntry(companyName, entry));
}
