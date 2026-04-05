/**
 * URL validation utilities for preventing SSRF attacks.
 *
 * Used to validate user-supplied URLs (e.g. Ollama base URL) before
 * the server makes outbound fetch requests to them.
 */

/**
 * Returns true if the URL targets a cloud metadata endpoint that must never
 * be reachable from health-check probes.  Localhost (127.x / ::1) is
 * intentionally allowed because Ollama runs locally.
 */
export function isBlockedHealthCheckUrl(url: string): boolean {
  try {
    const hostname = new URL(url).hostname;
    // AWS / Azure / Alibaba Cloud IMDS
    if (hostname === "169.254.169.254") return true;
    // GCP metadata server
    if (hostname === "metadata.google.internal") return true;
    return false;
  } catch {
    // Unparseable URL — block it
    return true;
  }
}

/**
 * Validates a webhook URL against SSRF attacks.
 * This is a superset of validateOllamaUrl — it blocks ALL private/internal addresses.
 * Must be called both on endpoint creation AND on dispatch (URL resolution may change).
 */
export function validateWebhookUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url || url.trim() === "") {
    return { valid: false, error: "webhook.urlEmpty" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, error: "webhook.urlInvalid" };
  }

  // Protocol check — only http(s) allowed
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { valid: false, error: "webhook.urlInvalidProtocol" };
  }

  // Embedded credentials check
  if (parsed.username || parsed.password) {
    return { valid: false, error: "webhook.urlHasCredentials" };
  }

  const hostname = parsed.hostname;

  // Strip IPv6 brackets for analysis
  const cleanHostname = hostname.startsWith("[") && hostname.endsWith("]")
    ? hostname.slice(1, -1)
    : hostname;

  // Block localhost variants
  if (
    cleanHostname === "localhost" ||
    cleanHostname === "0.0.0.0" ||
    cleanHostname === "::1" ||
    cleanHostname === "[::]"
  ) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block 127.x.x.x (loopback)
  if (/^127\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block link-local 169.254.x.x (IMDS and others)
  if (/^169\.254\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block RFC 1918 private ranges
  if (/^10\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }
  if (/^192\.168\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block 100.64.0.0/10 (Carrier-Grade NAT, RFC 6598)
  // Covers 100.64.0.0 – 100.127.255.255. Used by AWS VPCs, Tailscale, WireGuard.
  if (/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block 192.0.0.0/24 (IETF Protocol Assignments, RFC 6890)
  if (/^192\.0\.0\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block 198.18.0.0/15 (Benchmarking, RFC 2544)
  // Covers 198.18.0.0 – 198.19.255.255
  if (/^198\.1[89]\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block 240.0.0.0/4 (Reserved/Future, RFC 1112) including 255.255.255.255 broadcast
  // Covers 240.0.0.0 – 255.255.255.255
  if (/^(24\d|25[0-5])\./.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block IPv6 private/link-local addresses
  // fc00::/7 (Unique Local Addresses) — covers fc00:: and fd00::
  if (/^f[cd]/i.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }
  // fe80::/10 (Link-Local)
  if (/^fe[89ab]/i.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  // Block IPv4-mapped IPv6 addresses (::ffff:x.x.x.x)
  // These bypass IPv4 checks by wrapping private IPv4 addresses in IPv6 notation.
  // URL parser normalizes dotted-decimal to hex: ::ffff:127.0.0.1 -> ::ffff:7f00:1
  // So we match both forms: dotted-decimal and hex pair (XXXX:XXXX).
  const ipv4DottedMatch = cleanHostname.match(
    /^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i,
  );
  const ipv4HexMatch = cleanHostname.match(
    /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i,
  );
  let mappedIpv4: string | null = null;
  if (ipv4DottedMatch) {
    mappedIpv4 = ipv4DottedMatch[1];
  } else if (ipv4HexMatch) {
    // Convert hex pair to dotted-decimal: e.g. 7f00:1 -> 127.0.0.1
    const hi = parseInt(ipv4HexMatch[1], 16);
    const lo = parseInt(ipv4HexMatch[2], 16);
    mappedIpv4 = `${(hi >> 8) & 0xff}.${hi & 0xff}.${(lo >> 8) & 0xff}.${lo & 0xff}`;
  }
  if (mappedIpv4) {
    // Re-validate the underlying IPv4 address against all private/blocked ranges
    const innerResult = validateWebhookUrl(`http://${mappedIpv4}/`);
    if (!innerResult.valid) {
      return { valid: false, error: "webhook.ssrfBlocked" };
    }
  }

  // Block GCP metadata server
  if (cleanHostname === "metadata.google.internal") {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }

  return { valid: true };
}

export function validateOllamaUrl(url: string): {
  valid: boolean;
  error?: string;
} {
  if (!url || url.trim() === "") {
    return { valid: false, error: "URL must not be empty" };
  }

  try {
    const parsed = new URL(url);

    if (!["http:", "https:"].includes(parsed.protocol)) {
      return {
        valid: false,
        error: "Only http and https protocols are allowed",
      };
    }

    if (parsed.username || parsed.password) {
      return { valid: false, error: "URLs with credentials are not allowed" };
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid URL format" };
  }
}
