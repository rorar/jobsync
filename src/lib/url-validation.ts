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

  // Block IPv6 private/link-local addresses
  // fc00::/7 (Unique Local Addresses) — covers fc00:: and fd00::
  if (/^f[cd]/i.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
  }
  // fe80::/10 (Link-Local)
  if (/^fe[89ab]/i.test(cleanHostname)) {
    return { valid: false, error: "webhook.ssrfBlocked" };
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
