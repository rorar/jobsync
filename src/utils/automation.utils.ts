/**
 * Shared parsing utilities for automation keywords and locations.
 * Keywords use || separator, locations use , separator.
 * All consumers should use these instead of inline splitting.
 */

const KEYWORD_SEPARATOR = "||";
const LOCATION_SEPARATOR = ",";

/**
 * Parse a stored keywords string into individual keyword strings.
 * @example parseKeywords("Software Engineer||Java Developer") → ["Software Engineer", "Java Developer"]
 */
export function parseKeywords(keywords: string): string[] {
  if (!keywords) return [];
  return keywords
    .split(KEYWORD_SEPARATOR)
    .map((k) => k.trim())
    .filter(Boolean);
}

/**
 * Parse a stored location string into individual location codes.
 * @example parseLocations("de,fr,be-br") → ["de", "fr", "be-br"]
 */
export function parseLocations(location: string): string[] {
  if (!location) return [];
  return location
    .split(LOCATION_SEPARATOR)
    .map((l) => l.trim())
    .filter(Boolean);
}

/**
 * Join keywords into storage format.
 */
export function joinKeywords(keywords: string[]): string {
  return keywords.filter(Boolean).join(KEYWORD_SEPARATOR);
}

/**
 * Join locations into storage format.
 */
export function joinLocations(locations: string[]): string {
  return locations.filter(Boolean).join(LOCATION_SEPARATOR);
}
