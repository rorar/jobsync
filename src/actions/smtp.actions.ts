"use server";

/**
 * Server Actions for SMTP Configuration (Email Notification Channel).
 *
 * CRUD operations for SmtpConfig + test email dispatch.
 * All queries include userId (ADR-015 IDOR protection).
 * All error messages use i18n keys (feedback: feedback_i18n_error_messages.md).
 */

import prisma from "@/lib/db";
import { getCurrentUser } from "@/utils/user.utils";
import { handleError } from "@/lib/utils";
import { encrypt, decrypt, getLast4 } from "@/lib/encryption";
import { validateSmtpHost } from "@/lib/smtp-validation";
import { checkTestEmailRateLimit } from "@/lib/email-rate-limit";
import { renderTestEmail } from "@/lib/email/templates";
import { DEFAULT_LOCALE, isValidLocale } from "@/i18n/locales";
import { ActionResult } from "@/models/actionResult";
import type { UserSettingsData } from "@/models/userSettings.model";
import nodemailer from "nodemailer";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SmtpConfigDTO {
  id: string;
  host: string;
  port: number;
  username: string;
  /** Masked password — only last 4 chars visible */
  passwordMask: string;
  fromAddress: string;
  tlsRequired: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface SaveSmtpConfigInput {
  host: string;
  port: number;
  username: string;
  password?: string;
  fromAddress: string;
  tlsRequired: boolean;
  active: boolean;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEND_TIMEOUT_MS = 30_000;

/** Basic email format validation (RFC 5322 simplified) */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function resolveUserLocale(userId: string): Promise<string> {
  try {
    const row = await prisma.userSettings.findUnique({ where: { userId } });
    if (!row) return DEFAULT_LOCALE;
    const parsed: UserSettingsData = JSON.parse(row.settings);
    const locale = parsed.display?.locale;
    if (locale && isValidLocale(locale)) return locale;
    return DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

function validateInput(data: SaveSmtpConfigInput, requirePassword: boolean): {
  valid: boolean;
  error?: string;
} {
  // Host validation (SSRF)
  if (!data.host || data.host.trim() === "") {
    return { valid: false, error: "smtp.hostEmpty" };
  }
  const hostCheck = validateSmtpHost(data.host.trim());
  if (!hostCheck.valid) {
    return { valid: false, error: hostCheck.error };
  }

  // Port validation
  if (!Number.isInteger(data.port) || data.port < 1 || data.port > 65535) {
    return { valid: false, error: "smtp.portInvalid" };
  }

  // Username
  if (!data.username || data.username.trim() === "") {
    return { valid: false, error: "smtp.usernameEmpty" };
  }

  // Password (required for create, optional for update)
  if (requirePassword && (!data.password || data.password.trim() === "")) {
    return { valid: false, error: "smtp.passwordEmpty" };
  }

  // From address
  if (!data.fromAddress || data.fromAddress.trim() === "") {
    return { valid: false, error: "smtp.fromAddressEmpty" };
  }
  if (!EMAIL_REGEX.test(data.fromAddress.trim())) {
    return { valid: false, error: "smtp.fromAddressInvalid" };
  }

  return { valid: true };
}

function toDTO(config: {
  id: string;
  host: string;
  port: number;
  username: string;
  password: string;
  iv: string;
  fromAddress: string;
  tlsRequired: boolean;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}): SmtpConfigDTO {
  // Decrypt password just to get last 4 chars for the mask, then discard
  let passwordMask = "****";
  try {
    const decrypted = decrypt(config.password, config.iv);
    passwordMask = `****${getLast4(decrypted)}`;
  } catch {
    // If decryption fails, show generic mask
  }

  return {
    id: config.id,
    host: config.host,
    port: config.port,
    username: config.username,
    passwordMask,
    fromAddress: config.fromAddress,
    tlsRequired: config.tlsRequired,
    active: config.active,
    createdAt: config.createdAt,
    updatedAt: config.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Server Actions
// ---------------------------------------------------------------------------

/**
 * Save (create or update) SMTP configuration.
 * Password is AES-encrypted before storage.
 * When updating, password is optional — if omitted, the existing password is kept.
 */
export async function saveSmtpConfig(
  input: SaveSmtpConfigInput,
): Promise<ActionResult<SmtpConfigDTO>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Check if this is a create or update
    const existing = await prisma.smtpConfig.findFirst({
      where: { userId: user.id },
    });

    const requirePassword = !existing; // Password required for new configs

    // Validate input
    const validation = validateInput(input, requirePassword);
    if (!validation.valid) {
      return { success: false, message: validation.error ?? "smtp.hostInvalid" };
    }

    // Build base data (without password)
    const baseData = {
      host: input.host.trim(),
      port: input.port,
      username: input.username.trim(),
      fromAddress: input.fromAddress.trim(),
      tlsRequired: input.tlsRequired,
      active: input.active,
    };

    let config;

    if (existing) {
      // Update — only update password if provided
      const updateData: Record<string, unknown> = { ...baseData };
      if (input.password && input.password.trim() !== "") {
        const { encrypted, iv } = encrypt(input.password);
        updateData.password = encrypted;
        updateData.iv = iv;
      }
      config = await prisma.smtpConfig.update({
        where: { userId: user.id },
        data: updateData,
      });
    } else {
      // Create — password is required (validated above)
      const { encrypted, iv } = encrypt(input.password!);
      config = await prisma.smtpConfig.create({
        data: {
          ...baseData,
          password: encrypted,
          iv,
          userId: user.id,
        },
      });
    }

    return {
      success: true,
      data: toDTO(config),
    };
  } catch (error) {
    return handleError(error, "errors.saveSmtp");
  }
}

/**
 * Get SMTP configuration for the current user.
 * Password is masked (only last 4 chars visible).
 */
export async function getSmtpConfig(): Promise<ActionResult<SmtpConfigDTO | null>> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    const config = await prisma.smtpConfig.findFirst({
      where: { userId: user.id },
    });

    if (!config) {
      return { success: true, data: null };
    }

    return { success: true, data: toDTO(config) };
  } catch (error) {
    return handleError(error, "errors.fetchSmtp");
  }
}

/**
 * Test SMTP connection by sending a test email to the fromAddress.
 * Rate limited: 1 test email per 60 seconds per user.
 */
export async function testSmtpConnection(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Rate limit: 1 test per 60 seconds
    const rateCheck = checkTestEmailRateLimit(user.id);
    if (!rateCheck.allowed) {
      return { success: false, message: "smtp.testRateLimited" };
    }

    // Load config (ADR-015: userId in where)
    const config = await prisma.smtpConfig.findFirst({
      where: { userId: user.id, active: true },
    });
    if (!config) {
      return { success: false, message: "smtp.notConfigured" };
    }

    // Decrypt password
    let decryptedPassword: string;
    try {
      decryptedPassword = decrypt(config.password, config.iv);
    } catch {
      return { success: false, message: "smtp.connectionFailed" };
    }

    // Validate SMTP host (SSRF re-validation)
    const hostCheck = validateSmtpHost(config.host);
    if (!hostCheck.valid) {
      return { success: false, message: hostCheck.error ?? "smtp.ssrfBlocked" };
    }

    // Resolve locale for test email template
    const locale = await resolveUserLocale(user.id);

    // Render test email template
    const { subject, html, text } = renderTestEmail(locale);

    // Create transporter with TLS enforcement
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.username,
        pass: decryptedPassword,
      },
      tls: {
        rejectUnauthorized: true,
        minVersion: "TLSv1.2",
      },
      requireTLS: config.tlsRequired,
      connectionTimeout: SEND_TIMEOUT_MS,
      greetingTimeout: SEND_TIMEOUT_MS,
      socketTimeout: SEND_TIMEOUT_MS,
    });

    // Send test email to the fromAddress itself
    try {
      await transporter.sendMail({
        from: config.fromAddress,
        to: config.fromAddress,
        subject: `[JobSync] ${subject}`,
        html,
        text,
      });
    } finally {
      transporter.close();
    }

    return { success: true };
  } catch (error) {
    console.error("[smtp.actions] Test SMTP connection failed:", error);
    return handleError(error, "errors.testSmtp");
  }
}

/**
 * Delete SMTP configuration for the current user.
 */
export async function deleteSmtpConfig(): Promise<ActionResult> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, message: "errors.unauthorized" };

    // Verify ownership and existence (ADR-015: userId in where)
    const existing = await prisma.smtpConfig.findFirst({
      where: { userId: user.id },
    });
    if (!existing) {
      return { success: false, message: "smtp.notConfigured", errorCode: "NOT_FOUND" };
    }

    // Use deleteMany with userId to prevent IDOR (ADR-015)
    await prisma.smtpConfig.deleteMany({
      where: { userId: user.id },
    });

    return { success: true };
  } catch (error) {
    return handleError(error, "errors.deleteSmtp");
  }
}
