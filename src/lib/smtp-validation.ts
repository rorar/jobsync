import "server-only";

/**
 * SMTP Host Validation — SSRF prevention for user-supplied SMTP hosts.
 *
 * Reuses the same private IP detection logic as validateWebhookUrl()
 * (src/lib/url-validation.ts) but operates on bare hostnames rather than
 * full URLs, since SMTP hosts are not URLs.
 *
 * Blocks:
 * - Private IPs (RFC 1918: 10.x, 172.16-31.x, 192.168.x)
 * - IMDS (169.254.x)
 * - Localhost (127.x, ::1, 0.0.0.0)
 * - Carrier-Grade NAT (100.64.0.0/10)
 * - IETF Protocol Assignments (192.0.0.0/24)
 * - Benchmarking (198.18.0.0/15)
 * - Reserved/Future (240.0.0.0/4)
 * - IPv6 private/link-local
 * - IPv4-mapped IPv6
 * - GCP metadata server
 * - Empty/whitespace hosts
 */

export function validateSmtpHost(host: string): {
  valid: boolean;
  error?: string;
} {
  if (!host || host.trim() === "") {
    return { valid: false, error: "smtp.hostEmpty" };
  }

  const cleanHost = host.trim().toLowerCase();

  // Block localhost variants
  if (
    cleanHost === "localhost" ||
    cleanHost === "0.0.0.0" ||
    cleanHost === "::1" ||
    cleanHost === "[::]"
  ) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Strip IPv6 brackets for analysis
  const stripped =
    cleanHost.startsWith("[") && cleanHost.endsWith("]")
      ? cleanHost.slice(1, -1)
      : cleanHost;

  // Block 127.x.x.x (loopback)
  if (/^127\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block link-local 169.254.x.x (IMDS and others)
  if (/^169\.254\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block RFC 1918 private ranges
  if (/^10\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }
  if (/^192\.168\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block 100.64.0.0/10 (Carrier-Grade NAT, RFC 6598)
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block 192.0.0.0/24 (IETF Protocol Assignments, RFC 6890)
  if (/^192\.0\.0\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block 198.18.0.0/15 (Benchmarking, RFC 2544)
  if (/^198\.1[89]\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block 240.0.0.0/4 (Reserved/Future, RFC 1112) including broadcast
  if (/^(24\d|25[0-5])\./.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block IPv6 private/link-local addresses
  // fc00::/7 (Unique Local Addresses) — covers fc00:: and fd00::
  if (/^f[cd]/i.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }
  // fe80::/10 (Link-Local)
  if (/^fe[89ab]/i.test(stripped)) {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  // Block IPv4-mapped IPv6 addresses (::ffff:x.x.x.x or ::ffff:XXXX:XXXX)
  const ipv4DottedMatch = stripped.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  );
  const ipv4HexMatch = stripped.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  let mappedIpv4: string | null = null;
  if (ipv4DottedMatch) {
    mappedIpv4 = ipv4DottedMatch[1];
  } else if (ipv4HexMatch) {
    const hi = parseInt(ipv4HexMatch[1], 16);
    const lo = parseInt(ipv4HexMatch[2], 16);
    mappedIpv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  if (mappedIpv4) {
    const innerResult = validateSmtpHost(mappedIpv4);
    if (!innerResult.valid) {
      return { valid: false, error: "smtp.ssrfBlocked" };
    }
  }

  // Block GCP metadata server
  if (stripped === "metadata.google.internal") {
    return { valid: false, error: "smtp.ssrfBlocked" };
  }

  return { valid: true };
}
