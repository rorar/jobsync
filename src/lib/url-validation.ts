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
