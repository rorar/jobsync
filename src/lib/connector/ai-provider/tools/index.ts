/**
 * AI Analysis Tools - Barrel Export
 *
 * Modules:
 * - errors: Custom error classes for AI operations
 * - text-processing: Shared text normalization and metadata extraction
 * - preprocessing: Resume preprocessing (normalization, validation)
 * - preprocessing-job: Job description preprocessing
 */

// Error classes
export { AIUnavailableError } from "./errors";

// Shared text processing utilities
export {
  removeHtmlTags,
  normalizeWhitespace,
  normalizeBullets,
  normalizeHeadings,
  extractMetadata,
  validateText,
  type TextMetadata,
  type ValidationError,
  type ValidationResult,
} from "./text-processing";

// Resume preprocessing
export {
  preprocessResume,
  convertResumeToText,
  validateResume,
  type PreprocessingResult,
  type ResumeMetadata,
  type PreprocessedResume,
  type ResumeTextOptions,
} from "./preprocessing";

// Job preprocessing
export {
  preprocessJob,
  convertJobToText,
  validateJob,
  stripEmailPhonePatterns,
  type JobPreprocessingResult,
  type JobMetadata,
  type PreprocessedJob,
  type JobTextOptions,
} from "./preprocessing-job";
