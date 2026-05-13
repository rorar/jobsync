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

// PII PATTERN STRIPPING

/** Strip email addresses and phone numbers from text using regex */
export const stripEmailPhonePatterns = (text: string): string => {
  // Email pattern: standard email format
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
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
  metadata: JobMetadata,
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

  // Job-specific checks can be added here if needed
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
