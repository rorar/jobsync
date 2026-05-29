/**
 * Job Description Preprocessing Module
 * Mirrors the resume preprocessing pattern for consistency
 * Normalizes, validates, and extracts metadata from job descriptions
 */

import { JobResponse } from "@/models/job.model";
import {
  removeHtmlTags,
  normalizeWhitespace,
  normalizeBullets,
  normalizeHeadings,
  extractMetadata,
  validateText,
  type TextMetadata,
} from "./text-processing";
import { stripEmailPhonePatterns } from "@/lib/pii";

// Re-exported from the shared PII leaf module (single source of truth).
// Kept here for backward compatibility with existing importers.
export { stripEmailPhonePatterns };

// TYPES

export type JobMetadata = TextMetadata;

export interface PreprocessedJob {
  normalizedText: string;
  metadata: JobMetadata;
  isValid: boolean;
}

export type JobPreprocessingResult =
  | { success: true; data: PreprocessedJob }
  | {
      success: false;
      error: { code: string; message: string; details?: object };
    };

// VALIDATION THRESHOLDS

const MIN_CHAR_COUNT = 200;
const MAX_CHAR_COUNT = 50000;

// OPTIONS

export interface JobTextOptions {
  stripPiiPatterns?: boolean;
  jobCharLimit?: number;
}

// JOB DESCRIPTION TO TEXT CONVERSION

export const convertJobToText = (job: JobResponse, options?: JobTextOptions): Promise<string> => {
  return new Promise((resolve) => {
    const {
      description,
      JobTitle: { label: jobTitle },
      Company: { label: companyName },
    } = job;
    const location = job.Location?.label ?? "";

    let descriptionText = removeHtmlTags(description);

    if (options?.stripPiiPatterns) {
      descriptionText = stripEmailPhonePatterns(descriptionText);
    }

    let jobText = `
Job Title: ${jobTitle}
Company: ${companyName}
Location: ${location}
Description: ${descriptionText}
    `;

    if (options?.jobCharLimit && jobText.length > options.jobCharLimit) {
      jobText = jobText.slice(0, options.jobCharLimit);
    }

    return resolve(jobText);
  });
};

// VALIDATION - Job-specific validation logic

export const validateJob = (
  text: string,
  // NP-3: metadata param is intentionally unused (dead code). Kept for API
  // symmetry with validateResume(text, metadata) and as an extension point
  // for future job-specific guards (e.g. MAX_JOB_WORDS). Currently unnecessary
  // because EURES/Arbeitsagentur/JSearch strip HTML at import time and
  // TEXT_LIMITS cap the text before LLM submission. See docs/NOT-PLANNED.md.
  _metadata: JobMetadata,
): {
  isValid: boolean;
  error?: { code: string; message: string; details?: object };
} => {
  // Use shared generic validation
  const genericValidation = validateText(
    text,
    MIN_CHAR_COUNT,
    MAX_CHAR_COUNT,
    "Job description",
  );
  if (!genericValidation.isValid) {
    return genericValidation;
  }

  // Job-specific checks can be added here if needed (e.g. MAX_JOB_WORDS)
  // For now, the shared validation is sufficient

  return { isValid: true };
};

// MAIN ORCHESTRATOR

/**
 * Preprocess a job description
 * Normalizes HTML, formatting, and whitespace
 * Extracts metadata and validates content
 *
 * @param job - Job response object to preprocess
 * @returns PreprocessingResult with normalized text and metadata, or error details
 */
export const preprocessJob = async (
  job: JobResponse,
  options?: JobTextOptions,
): Promise<JobPreprocessingResult> => {
  try {
    // Convert job object to raw text
    const rawText = await convertJobToText(job, options);

    // Quick validation - fail fast if obviously invalid
    if (!rawText || rawText.trim().length < MIN_CHAR_COUNT) {
      const charCount = rawText?.trim().length || 0;
      return {
        success: false,
        error: {
          code: charCount === 0 ? "NO_CONTENT" : "TOO_SHORT",
          message:
            charCount === 0
              ? "Job description appears to be empty"
              : `Job description is too short (${charCount} characters, minimum ${MIN_CHAR_COUNT} required)`,
          details: { characterCount: charCount },
        },
      };
    }

    // Apply normalization pipeline
    let normalizedText = rawText;
    normalizedText = normalizeWhitespace(normalizedText);
    normalizedText = normalizeBullets(normalizedText);
    normalizedText = normalizeHeadings(normalizedText);

    // Extract metadata
    const metadata = extractMetadata(normalizedText);

    // Full validation
    const validationResult = validateJob(normalizedText, metadata);
    if (!validationResult.isValid) {
      return {
        success: false,
        error: validationResult.error!,
      };
    }

    return {
      success: true,
      data: {
        normalizedText,
        metadata,
        isValid: true,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return {
      success: false,
      error: {
        code: "PREPROCESSING_ERROR",
        message: `Failed to preprocess job description: ${message}`,
      },
    };
  }
};
