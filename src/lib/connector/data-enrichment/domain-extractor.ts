import "server-only";

/**
 * Extracts a likely domain from a company name or URL.
 * Returns null if no domain can be derived.
 *
 * Strategy:
 * 1. If input already looks like a domain (contains dot, no spaces), use as-is.
 * 2. Otherwise strip common legal suffixes, lowercase, remove non-alphanumeric,
 *    and append ".com".
 * 3. Return null for names that can't be reasonably converted.
 */
export function extractDomain(input: string): string | null {
  const trimmed = input?.trim();
  if (!trimmed || trimmed.length < 2) return null;

  // If it already looks like a domain (e.g. "acme.com")
  if (/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i.test(trimmed)) {
    return trimmed.toLowerCase();
  }

  // Strip common legal suffixes before converting to domain
  const cleaned = trimmed
    .replace(/\b(AG|GmbH|Inc\.?|Ltd\.?|SE|SA|SAS|Corp\.?|LLC|PLC|NV|BV)\b/gi, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

  if (!cleaned || cleaned.length < 2) return null;

  return `${cleaned}.com`;
}
