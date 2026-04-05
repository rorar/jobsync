import "server-only";

/**
 * Shared SMTP Transporter Factory
 *
 * Creates a nodemailer transporter with TLS enforcement and standardized timeouts.
 * Used by: email.channel.ts (dispatch), smtp.actions.ts (test connection).
 * Eliminates duplicated transporter creation logic.
 */

import nodemailer from "nodemailer";

export interface SmtpTransportConfig {
  host: string;
  port: number;
  username: string;
  decryptedPassword: string;
  tlsRequired: boolean;
}

const SEND_TIMEOUT_MS = 30_000;

export function createSmtpTransporter(config: SmtpTransportConfig) {
  return nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: {
      user: config.username,
      pass: config.decryptedPassword,
    },
    // Port 465 uses implicit TLS (secure: true), so STARTTLS (requireTLS) is not applicable.
    // For other ports (587, 25), requireTLS forces STARTTLS upgrade based on user config.
    requireTLS: config.tlsRequired && config.port !== 465,
    tls: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
    connectionTimeout: SEND_TIMEOUT_MS,
    greetingTimeout: SEND_TIMEOUT_MS,
    socketTimeout: SEND_TIMEOUT_MS,
  });
}
