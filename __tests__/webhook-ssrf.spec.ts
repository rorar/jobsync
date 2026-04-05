/**
 * Webhook SSRF Validation Tests
 *
 * Tests validateWebhookUrl() against various SSRF attack vectors:
 * IMDS, private IPs, localhost, non-http protocols, credentials in URL,
 * IPv6 private addresses.
 *
 * Security: ADR-015, specs/security-rules.allium
 */

import { validateWebhookUrl } from "@/lib/url-validation";

describe("validateWebhookUrl — SSRF protection", () => {
  describe("blocks cloud metadata endpoints (IMDS)", () => {
    it("blocks AWS IMDS 169.254.169.254", () => {
      const result = validateWebhookUrl("http://169.254.169.254/latest/meta-data/");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.ssrfBlocked");
    });

    it("blocks Azure IMDS 169.254.169.254 with port", () => {
      const result = validateWebhookUrl("http://169.254.169.254:80/metadata");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.ssrfBlocked");
    });

    it("blocks any 169.254.x.x link-local address", () => {
      expect(validateWebhookUrl("http://169.254.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://169.254.255.255/hook").valid).toBe(false);
    });

    it("blocks GCP metadata.google.internal", () => {
      const result = validateWebhookUrl("http://metadata.google.internal/computeMetadata/v1/");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.ssrfBlocked");
    });
  });

  describe("blocks private IPs (RFC 1918)", () => {
    it("blocks 10.x.x.x range", () => {
      expect(validateWebhookUrl("http://10.0.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://10.255.255.255/hook").valid).toBe(false);
      expect(validateWebhookUrl("https://10.1.2.3:8080/webhook").valid).toBe(false);
    });

    it("blocks 172.16-31.x.x range", () => {
      expect(validateWebhookUrl("http://172.16.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://172.20.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://172.31.255.255/hook").valid).toBe(false);
    });

    it("allows 172.15.x.x and 172.32.x.x (not private)", () => {
      expect(validateWebhookUrl("https://172.15.0.1/hook").valid).toBe(true);
      expect(validateWebhookUrl("https://172.32.0.1/hook").valid).toBe(true);
    });

    it("blocks 192.168.x.x range", () => {
      expect(validateWebhookUrl("http://192.168.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://192.168.1.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("https://192.168.255.255:443/hook").valid).toBe(false);
    });
  });

  describe("blocks Carrier-Grade NAT (RFC 6598, 100.64.0.0/10)", () => {
    it("blocks 100.64.0.1 (start of CGN range)", () => {
      expect(validateWebhookUrl("http://100.64.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://100.64.0.1/hook").error).toBe("webhook.ssrfBlocked");
    });

    it("blocks 100.100.0.1 (mid CGN range)", () => {
      expect(validateWebhookUrl("http://100.100.0.1/hook").valid).toBe(false);
    });

    it("blocks 100.127.255.255 (end of CGN range)", () => {
      expect(validateWebhookUrl("http://100.127.255.255/hook").valid).toBe(false);
    });

    it("allows 100.63.0.1 (below CGN range)", () => {
      expect(validateWebhookUrl("https://100.63.0.1/hook").valid).toBe(true);
    });

    it("allows 100.128.0.1 (above CGN range)", () => {
      expect(validateWebhookUrl("https://100.128.0.1/hook").valid).toBe(true);
    });
  });

  describe("blocks IETF Protocol Assignments (RFC 6890, 192.0.0.0/24)", () => {
    it("blocks 192.0.0.1", () => {
      expect(validateWebhookUrl("http://192.0.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://192.0.0.1/hook").error).toBe("webhook.ssrfBlocked");
    });

    it("blocks 192.0.0.255 (end of range)", () => {
      expect(validateWebhookUrl("http://192.0.0.255/hook").valid).toBe(false);
    });

    it("allows 192.0.1.1 (outside /24)", () => {
      expect(validateWebhookUrl("https://192.0.1.1/hook").valid).toBe(true);
    });
  });

  describe("blocks Benchmarking (RFC 2544, 198.18.0.0/15)", () => {
    it("blocks 198.18.0.1 (start of range)", () => {
      expect(validateWebhookUrl("http://198.18.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://198.18.0.1/hook").error).toBe("webhook.ssrfBlocked");
    });

    it("blocks 198.19.255.255 (end of range)", () => {
      expect(validateWebhookUrl("http://198.19.255.255/hook").valid).toBe(false);
    });

    it("allows 198.17.0.1 (below range)", () => {
      expect(validateWebhookUrl("https://198.17.0.1/hook").valid).toBe(true);
    });

    it("allows 198.20.0.1 (above range)", () => {
      expect(validateWebhookUrl("https://198.20.0.1/hook").valid).toBe(true);
    });
  });

  describe("blocks Reserved/Future (RFC 1112, 240.0.0.0/4)", () => {
    it("blocks 240.0.0.1 (start of reserved range)", () => {
      expect(validateWebhookUrl("http://240.0.0.1/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://240.0.0.1/hook").error).toBe("webhook.ssrfBlocked");
    });

    it("blocks 250.1.2.3 (mid reserved range)", () => {
      expect(validateWebhookUrl("http://250.1.2.3/hook").valid).toBe(false);
    });

    it("blocks 255.255.255.255 (broadcast)", () => {
      expect(validateWebhookUrl("http://255.255.255.255/hook").valid).toBe(false);
    });

    it("allows 239.255.255.255 (just below reserved range — multicast)", () => {
      expect(validateWebhookUrl("https://239.255.255.255/hook").valid).toBe(true);
    });
  });

  describe("blocks localhost variants", () => {
    it("blocks 'localhost'", () => {
      const result = validateWebhookUrl("http://localhost/hook");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.ssrfBlocked");
    });

    it("blocks 127.0.0.1", () => {
      expect(validateWebhookUrl("http://127.0.0.1/hook").valid).toBe(false);
    });

    it("blocks 127.x.x.x (full loopback range)", () => {
      expect(validateWebhookUrl("http://127.0.0.2/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://127.255.255.255/hook").valid).toBe(false);
    });

    it("blocks ::1 (IPv6 loopback)", () => {
      expect(validateWebhookUrl("http://[::1]/hook").valid).toBe(false);
    });

    it("blocks 0.0.0.0", () => {
      expect(validateWebhookUrl("http://0.0.0.0/hook").valid).toBe(false);
    });
  });

  describe("blocks non-http(s) protocols", () => {
    it("blocks ftp://", () => {
      const result = validateWebhookUrl("ftp://example.com/hook");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlInvalidProtocol");
    });

    it("blocks file://", () => {
      expect(validateWebhookUrl("file:///etc/passwd").valid).toBe(false);
    });

    it("blocks javascript:", () => {
      expect(validateWebhookUrl("javascript:alert(1)").valid).toBe(false);
    });

    it("blocks gopher://", () => {
      expect(validateWebhookUrl("gopher://evil.com/hook").valid).toBe(false);
    });

    it("blocks data:", () => {
      expect(validateWebhookUrl("data:text/html,<h1>hi</h1>").valid).toBe(false);
    });
  });

  describe("blocks credentials in URL", () => {
    it("blocks URL with username", () => {
      const result = validateWebhookUrl("https://admin@example.com/hook");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlHasCredentials");
    });

    it("blocks URL with username and password", () => {
      const result = validateWebhookUrl("https://admin:secret@example.com/hook");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlHasCredentials");
    });
  });

  describe("blocks IPv6 private addresses", () => {
    it("blocks fc00::/7 Unique Local Addresses (fc00::)", () => {
      expect(validateWebhookUrl("http://[fc00::1]/hook").valid).toBe(false);
    });

    it("blocks fc00::/7 Unique Local Addresses (fd00::)", () => {
      expect(validateWebhookUrl("http://[fd00::1]/hook").valid).toBe(false);
    });

    it("blocks fe80::/10 Link-Local addresses", () => {
      expect(validateWebhookUrl("http://[fe80::1]/hook").valid).toBe(false);
      expect(validateWebhookUrl("http://[fe80::1%25eth0]/hook").valid).toBe(false);
    });
  });

  describe("blocks IPv4-mapped IPv6 addresses (M7)", () => {
    it("blocks ::ffff:127.0.0.1 (loopback)", () => {
      expect(validateWebhookUrl("http://[::ffff:127.0.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:10.0.0.1 (RFC 1918)", () => {
      expect(validateWebhookUrl("http://[::ffff:10.0.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:192.168.1.1 (RFC 1918)", () => {
      expect(validateWebhookUrl("http://[::ffff:192.168.1.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:172.16.0.1 (RFC 1918)", () => {
      expect(validateWebhookUrl("http://[::ffff:172.16.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:169.254.169.254 (IMDS)", () => {
      expect(validateWebhookUrl("http://[::ffff:169.254.169.254]/hook").valid).toBe(false);
    });

    it("allows ::ffff:8.8.8.8 (public IP)", () => {
      expect(validateWebhookUrl("http://[::ffff:8.8.8.8]/hook").valid).toBe(true);
    });

    it("allows ::ffff:203.0.113.1 (public IP)", () => {
      expect(validateWebhookUrl("http://[::ffff:203.0.113.1]/hook").valid).toBe(true);
    });

    it("blocks ::FFFF:10.0.0.1 (case-insensitive)", () => {
      expect(validateWebhookUrl("http://[::FFFF:10.0.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:100.64.0.1 (CGN via IPv4-mapped IPv6)", () => {
      expect(validateWebhookUrl("http://[::ffff:100.64.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:192.0.0.1 (IETF Protocol Assignments via IPv4-mapped IPv6)", () => {
      expect(validateWebhookUrl("http://[::ffff:192.0.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:198.18.0.1 (Benchmarking via IPv4-mapped IPv6)", () => {
      expect(validateWebhookUrl("http://[::ffff:198.18.0.1]/hook").valid).toBe(false);
    });

    it("blocks ::ffff:240.0.0.1 (Reserved via IPv4-mapped IPv6)", () => {
      expect(validateWebhookUrl("http://[::ffff:240.0.0.1]/hook").valid).toBe(false);
    });
  });

  describe("allows valid URLs", () => {
    it("allows valid https URLs", () => {
      expect(validateWebhookUrl("https://example.com/webhook").valid).toBe(true);
      expect(validateWebhookUrl("https://hooks.slack.com/services/T00/B00/xxx").valid).toBe(true);
      expect(validateWebhookUrl("https://webhook.site/abc-123").valid).toBe(true);
    });

    it("allows valid http URLs (public IPs)", () => {
      expect(validateWebhookUrl("http://203.0.113.1/hook").valid).toBe(true);
      expect(validateWebhookUrl("http://8.8.8.8/hook").valid).toBe(true);
    });

    it("allows URLs with ports", () => {
      expect(validateWebhookUrl("https://example.com:8443/webhook").valid).toBe(true);
    });

    it("allows URLs with paths and query params", () => {
      expect(validateWebhookUrl("https://example.com/api/webhook?token=abc").valid).toBe(true);
    });
  });

  describe("handles edge cases", () => {
    it("rejects empty string", () => {
      const result = validateWebhookUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlEmpty");
    });

    it("rejects whitespace-only string", () => {
      const result = validateWebhookUrl("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlEmpty");
    });

    it("rejects invalid URL format", () => {
      const result = validateWebhookUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("webhook.urlInvalid");
    });
  });
});
