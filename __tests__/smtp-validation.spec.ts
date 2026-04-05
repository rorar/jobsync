/**
 * SMTP Host Validation Tests
 *
 * Tests: SSRF prevention for user-supplied SMTP hosts.
 * Covers localhost, private IPs, IMDS, IPv4-mapped IPv6, valid hosts,
 * empty/whitespace hosts.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

import { validateSmtpHost } from "@/lib/smtp-validation";

describe("validateSmtpHost", () => {
  // -----------------------------------------------------------------------
  // Blocks localhost variants
  // -----------------------------------------------------------------------

  describe("blocks localhost", () => {
    it.each([
      ["127.0.0.1", "loopback IPv4"],
      ["127.0.0.2", "loopback range"],
      ["127.255.255.255", "loopback end of range"],
      ["localhost", "localhost hostname"],
      ["::1", "IPv6 loopback"],
      ["0.0.0.0", "zero address"],
      ["[::]", "bracketed IPv6 any"],
    ])("blocks %s (%s)", (host) => {
      const result = validateSmtpHost(host);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.ssrfBlocked");
    });
  });

  // -----------------------------------------------------------------------
  // Blocks private IPs (RFC 1918)
  // -----------------------------------------------------------------------

  describe("blocks private IPs", () => {
    it.each([
      ["10.0.0.1", "10.x range start"],
      ["10.255.255.255", "10.x range end"],
      ["172.16.0.1", "172.16.x range start"],
      ["172.31.255.255", "172.31.x range end"],
      ["192.168.0.1", "192.168.x range start"],
      ["192.168.255.255", "192.168.x range end"],
    ])("blocks %s (%s)", (host) => {
      const result = validateSmtpHost(host);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.ssrfBlocked");
    });

    it("allows 172.15.x (not in private range)", () => {
      const result = validateSmtpHost("172.15.0.1");
      expect(result.valid).toBe(true);
    });

    it("allows 172.32.x (not in private range)", () => {
      const result = validateSmtpHost("172.32.0.1");
      expect(result.valid).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // Blocks IMDS (169.254.x.x)
  // -----------------------------------------------------------------------

  describe("blocks IMDS", () => {
    it("blocks 169.254.169.254 (AWS IMDS)", () => {
      const result = validateSmtpHost("169.254.169.254");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.ssrfBlocked");
    });

    it("blocks 169.254.0.1 (link-local)", () => {
      const result = validateSmtpHost("169.254.0.1");
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Blocks IPv4-mapped IPv6
  // -----------------------------------------------------------------------

  describe("blocks IPv4-mapped IPv6", () => {
    it("blocks ::ffff:127.0.0.1 (mapped loopback)", () => {
      const result = validateSmtpHost("::ffff:127.0.0.1");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.ssrfBlocked");
    });

    it("blocks ::ffff:10.0.0.1 (mapped private)", () => {
      const result = validateSmtpHost("::ffff:10.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks ::ffff:192.168.1.1 (mapped private)", () => {
      const result = validateSmtpHost("::ffff:192.168.1.1");
      expect(result.valid).toBe(false);
    });

    it("blocks ::ffff:169.254.169.254 (mapped IMDS)", () => {
      const result = validateSmtpHost("::ffff:169.254.169.254");
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Blocks IPv6 private/link-local
  // -----------------------------------------------------------------------

  describe("blocks IPv6 private/link-local", () => {
    it("blocks fc00::1 (unique local address)", () => {
      const result = validateSmtpHost("fc00::1");
      expect(result.valid).toBe(false);
    });

    it("blocks fd00::1 (unique local address)", () => {
      const result = validateSmtpHost("fd00::1");
      expect(result.valid).toBe(false);
    });

    it("blocks fe80::1 (link-local)", () => {
      const result = validateSmtpHost("fe80::1");
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Blocks other reserved ranges
  // -----------------------------------------------------------------------

  describe("blocks other reserved ranges", () => {
    it("blocks 100.64.0.1 (Carrier-Grade NAT)", () => {
      const result = validateSmtpHost("100.64.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks 192.0.0.1 (IETF Protocol Assignments)", () => {
      const result = validateSmtpHost("192.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks 198.18.0.1 (Benchmarking)", () => {
      const result = validateSmtpHost("198.18.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks 240.0.0.1 (Reserved/Future)", () => {
      const result = validateSmtpHost("240.0.0.1");
      expect(result.valid).toBe(false);
    });

    it("blocks metadata.google.internal (GCP metadata)", () => {
      const result = validateSmtpHost("metadata.google.internal");
      expect(result.valid).toBe(false);
    });
  });

  // -----------------------------------------------------------------------
  // Allows valid SMTP hosts
  // -----------------------------------------------------------------------

  describe("allows valid SMTP hosts", () => {
    it.each([
      "smtp.gmail.com",
      "mail.example.com",
      "smtp.office365.com",
      "smtp.mailgun.org",
      "email-smtp.us-east-1.amazonaws.com",
      "8.8.8.8",
      "1.1.1.1",
    ])("allows %s", (host) => {
      const result = validateSmtpHost(host);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });
  });

  // -----------------------------------------------------------------------
  // Blocks empty/whitespace hosts
  // -----------------------------------------------------------------------

  describe("blocks empty/whitespace hosts", () => {
    it("blocks empty string", () => {
      const result = validateSmtpHost("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.hostEmpty");
    });

    it("blocks whitespace-only string", () => {
      const result = validateSmtpHost("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("smtp.hostEmpty");
    });
  });

  // -----------------------------------------------------------------------
  // Edge cases
  // -----------------------------------------------------------------------

  describe("edge cases", () => {
    it("handles bracketed IPv6 addresses", () => {
      const result = validateSmtpHost("[::ffff:127.0.0.1]");
      expect(result.valid).toBe(false);
    });

    it("is case-insensitive for hostnames", () => {
      const result = validateSmtpHost("LOCALHOST");
      expect(result.valid).toBe(false);
    });

    it("trims whitespace before validation", () => {
      const result = validateSmtpHost("  smtp.gmail.com  ");
      expect(result.valid).toBe(true);
    });
  });
});
