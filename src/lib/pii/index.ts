/**
 * src/lib/pii — Shared PII redaction policy (GDPR Art. 5(1)(c)).
 *
 * Single source of truth for direct-identifier redaction applied before resume
 * or job text is transferred to a NON-local (cloud) AI provider (OpenAI/DeepSeek).
 * Consumed by:
 *   - routes  : ai-provider/tools/preprocessing.ts  (convertResumeToText)
 *   - routes  : ai-provider/tools/preprocessing-job.ts (job description scrub)
 *   - runner  : job-discovery/runner.ts (convertResumeForMatch, matchJobToResume)
 *
 * This module is a dependency-free LEAF (no imports from connector/, models/, db).
 * Centralising the policy here kills the previous per-converter duplication that
 * let the automation-runner PII leak slip past the route hardening: a new egress
 * sink can no longer reinvent redaction — it goes through these primitives.
 *
 * Scope is intentionally email + phone for FREE TEXT, plus the structured contact
 * block (name/email/phone/address). Names/addresses embedded in free text and
 * Art. 9 special-category data a user voluntarily includes are a documented
 * RESIDUAL RISK (reliable NER detection is disproportionate). See the authoritative
 * spec: specs/ai-provider.allium @invariant CloudTransferDataMinimization.
 */

/** Canonical placeholders. Must match the tokens named in the Allium invariant. */
export const PII_PLACEHOLDERS = {
  name: "[NAME]",
  email: "[EMAIL]",
  phone: "[PHONE]",
  address: "[ADDRESS]",
} as const;

/**
 * Strip email addresses and phone numbers from free text using regex.
 *
 * Quantifiers are bounded to RFC 5321 limits (local-part <= 64, domain <= 255,
 * TLD <= 24) so a long unterminated local-part-like run cannot cause quadratic
 * backtracking (ReDoS) — the engine can only re-scan a bounded window at each
 * start position, keeping it linear. (Moved verbatim from text-processing.ts,
 * which now re-exports from here for backwards compatibility.)
 */
export const stripEmailPhonePatterns = (text: string): string => {
  const emailRegex = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g;
  // Phone pattern: international and local formats (e.g. +49 123 456789, (555) 123-4567, 0123/456789)
  const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{1,5}\)?[\s.-]?)?\d{2,5}[\s.-]?\d{2,5}[\s.-]?\d{0,5}/g;

  let result = text.replace(emailRegex, PII_PLACEHOLDERS.email);
  result = result.replace(phoneRegex, (match) => {
    // Only replace if it looks like an actual phone number (at least 7 digits)
    const digits = match.replace(/\D/g, "");
    return digits.length >= 7 ? PII_PLACEHOLDERS.phone : match;
  });

  return result;
};

/**
 * Apply free-text redaction iff stripPii is set. The single helper that replaces
 * the per-converter `scrub` closures (preprocessing.ts, runner.ts ×2). When
 * stripPii is false (local Ollama), text passes through with full fidelity.
 */
export const scrubFreeText = (text: string, stripPii: boolean): string =>
  stripPii ? stripEmailPhonePatterns(text) : text;

/**
 * Structural subset of a contact's direct identifiers. Both the route-side
 * `ContactInfo` (models/profile.model) and the runner's inline `ResumeWithSections`
 * contact shape satisfy this — so the shared redactor needs no cast to bridge the
 * two converter input types.
 */
export interface RedactableContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address?: string | null;
}

/** Redacted contact values, ready to be laid out by each converter's own format. */
export interface RedactedContact {
  name: string;
  email: string;
  phone: string;
  address: string | null;
}

/**
 * Redact a contact's structured direct identifiers. Returns the redacted VALUES;
 * the caller owns the LAYOUT (the two converters render different prompt formats,
 * so layout is deliberately NOT shared — only the redaction decision is).
 *
 * Falsy address normalises to null so a caller's `contact.address ? ... : ""`
 * render guard behaves identically before/after adopting this helper.
 */
export function redactContact(
  contact: RedactableContact,
  stripPii: boolean,
): RedactedContact {
  return {
    name: stripPii
      ? PII_PLACEHOLDERS.name
      : `${contact.firstName} ${contact.lastName}`,
    email: stripPii ? PII_PLACEHOLDERS.email : contact.email,
    phone: stripPii ? PII_PLACEHOLDERS.phone : contact.phone,
    address: !contact.address
      ? null
      : stripPii
        ? PII_PLACEHOLDERS.address
        : contact.address,
  };
}
