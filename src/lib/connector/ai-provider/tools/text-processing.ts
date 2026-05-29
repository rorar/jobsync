/**
 * Shared Text Processing Utilities
 * Used by both resume and job preprocessing modules
 * Extracted from preprocessing.ts to enable code reuse
 */

// HTML AND WHITESPACE NORMALIZATION

export const removeHtmlTags = (description: string | undefined): string => {
  if (!description) return "";

  return description
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/(li|p|div|br)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n")
    .trim();
};

export const normalizeWhitespace = (text: string): string => {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

export const normalizeBullets = (text: string): string => {
  return text
    .replace(/[•●○◦▪▸►◆★✦✓✔→‣⁃]/g, "•")
    .replace(/^[-–—]\s/gm, "• ")
    .replace(/^\*\s/gm, "• ");
};

export const normalizeHeadings = (text: string): string => {
  return text
    .replace(/^([A-Z][A-Z\s&]+):?\s*$/gm, (_match, heading) => {
      const normalized = heading.trim().replace(/:$/, "");
      return `\n${normalized}\n`;
    })
    .replace(/\n{3,}/g, "\n\n");
};

// PII PATTERN STRIPPING
//
// Single source of truth for free-text direct-identifier redaction, shared by
// both the job-description path (preprocessing-job.ts) and the resume path
// (preprocessing.ts). Applied ONLY when the target AI provider is non-local
// (cloud), as a GDPR Art. 5(1)(c) data-minimization measure on the third-party
// transfer. Scope is intentionally email + phone (high-confidence direct
// identifiers unnecessary for the analysis purpose); names/addresses embedded
// in free text are a documented residual risk (see specs/ai-provider.allium).

/** Strip email addresses and phone numbers from free text using regex. */
export const stripEmailPhonePatterns = (text: string): string => {
  // Email pattern: standard email format. Quantifiers are bounded to RFC 5321
  // limits (local-part <= 64, domain <= 255, TLD <= 24) so a long unterminated
  // local-part-like run cannot cause quadratic backtracking (ReDoS) — the engine
  // can only re-scan a bounded window at each start position, keeping it linear.
  const emailRegex = /[a-zA-Z0-9._%+-]{1,64}@[a-zA-Z0-9.-]{1,255}\.[a-zA-Z]{2,24}/g;
  // Phone pattern: international and local formats (e.g. +49 123 456789, (555) 123-4567, 0123/456789)
  const phoneRegex = /(?:\+?\d{1,4}[\s.-]?)?(?:\(?\d{1,5}\)?[\s.-]?)?\d{2,5}[\s.-]?\d{2,5}[\s.-]?\d{0,5}/g;

  let result = text.replace(emailRegex, "[EMAIL]");
  result = result.replace(phoneRegex, (match) => {
    // Only replace if it looks like an actual phone number (at least 7 digits)
    const digits = match.replace(/\D/g, "");
    return digits.length >= 7 ? "[PHONE]" : match;
  });

  return result;
};

// METADATA EXTRACTION

export interface TextMetadata {
  characterCount: number;
  wordCount: number;
  lineCount: number;
  hasContactInfo: boolean;
}

export const extractMetadata = (text: string): TextMetadata => {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines = text.split("\n");

  return {
    characterCount: text.length,
    wordCount: words.length,
    lineCount: lines.length,
    hasContactInfo: hasContactPatterns(text),
  };
};

const hasContactPatterns = (text: string): boolean => {
  const emailPattern = /[\w.-]+@[\w.-]+\.\w+/;
  const phonePattern = /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/;
  return emailPattern.test(text) || phonePattern.test(text);
};

// VALIDATION HELPERS

export interface ValidationError {
  code: string;
  message: string;
  details?: object;
}

export interface ValidationResult {
  isValid: boolean;
  error?: ValidationError;
}

/**
 * Generic text validation - checks for empty content and basic corruption
 * @param text - Text to validate
 * @param minCharCount - Minimum character count required
 * @param maxCharCount - Maximum character count allowed
 * @param contextLabel - Label for error messages (e.g., "Resume", "Job description")
 */
export const validateText = (
  text: string,
  minCharCount: number = 200,
  maxCharCount: number = 50000,
  contextLabel: string = "Content",
): ValidationResult => {
  // Check for empty content
  if (!text || text.trim().length === 0) {
    return {
      isValid: false,
      error: {
        code: "NO_CONTENT",
        message: `${contextLabel} appears to be empty or contains only whitespace`,
      },
    };
  }

  // Check minimum length
  if (text.length < minCharCount) {
    return {
      isValid: false,
      error: {
        code: "TOO_SHORT",
        message: `${contextLabel} is too short. Found ${text.length} characters, minimum required: ${minCharCount} characters.`,
        details: {
          characterCount: text.length,
          minCharCount,
        },
      },
    };
  }

  // Check maximum length
  if (text.length > maxCharCount) {
    return {
      isValid: false,
      error: {
        code: "TOO_LONG",
        message: `${contextLabel} is too long. Found ${text.length} characters, maximum allowed: ${maxCharCount} characters.`,
        details: {
          characterCount: text.length,
          maxCharCount,
        },
      },
    };
  }

  // Check for corruption - consecutive special characters
  const MAX_CONSECUTIVE_SPECIAL_CHARS = 20;
  const specialCharPattern = new RegExp(
    `[^a-zA-Z0-9\\s]{${MAX_CONSECUTIVE_SPECIAL_CHARS + 1},}`,
  );
  if (specialCharPattern.test(text)) {
    return {
      isValid: false,
      error: {
        code: "CORRUPTED",
        message: `${contextLabel} appears to be corrupted. Found excessive consecutive special characters.`,
        details: {
          maxConsecutiveSpecialChars: MAX_CONSECUTIVE_SPECIAL_CHARS,
        },
      },
    };
  }

  return { isValid: true };
};
