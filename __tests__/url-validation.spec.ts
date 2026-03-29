import { validateOllamaUrl, isBlockedHealthCheckUrl } from "@/lib/url-validation";

describe("isBlockedHealthCheckUrl", () => {
  describe("blocked URLs", () => {
    it("blocks the AWS/Azure/Alibaba IMDS address 169.254.169.254", () => {
      expect(isBlockedHealthCheckUrl("http://169.254.169.254/latest/meta-data/")).toBe(true);
    });

    it("blocks the GCP metadata server hostname", () => {
      expect(isBlockedHealthCheckUrl("http://metadata.google.internal/computeMetadata/v1/")).toBe(true);
    });

    it("blocks an unparseable URL (returns true as fail-safe)", () => {
      expect(isBlockedHealthCheckUrl("not a url at all")).toBe(true);
    });

    it("blocks an empty string", () => {
      expect(isBlockedHealthCheckUrl("")).toBe(true);
    });
  });

  describe("allowed URLs", () => {
    it("allows 127.0.0.1 (Ollama localhost)", () => {
      expect(isBlockedHealthCheckUrl("http://127.0.0.1:11434/api/tags")).toBe(false);
    });

    it("allows a public HTTPS API endpoint", () => {
      expect(isBlockedHealthCheckUrl("https://api.example.com/health")).toBe(false);
    });

    it("allows a public HTTP endpoint", () => {
      expect(isBlockedHealthCheckUrl("http://eures.ec.europa.eu/api/ping")).toBe(false);
    });
  });
});

describe("validateOllamaUrl", () => {
  describe("valid URLs", () => {
    it("accepts http://localhost:11434", () => {
      const result = validateOllamaUrl("http://localhost:11434");
      expect(result).toEqual({ valid: true });
    });

    it("accepts http://127.0.0.1:11434", () => {
      const result = validateOllamaUrl("http://127.0.0.1:11434");
      expect(result).toEqual({ valid: true });
    });

    it("accepts https://ollama.local:11434", () => {
      const result = validateOllamaUrl("https://ollama.local:11434");
      expect(result).toEqual({ valid: true });
    });

    it("accepts http://192.168.1.100:11434", () => {
      const result = validateOllamaUrl("http://192.168.1.100:11434");
      expect(result).toEqual({ valid: true });
    });

    it("accepts https URL without port", () => {
      const result = validateOllamaUrl("https://ollama.example.com");
      expect(result).toEqual({ valid: true });
    });

    it("accepts http URL with path", () => {
      const result = validateOllamaUrl("http://localhost:11434/api/tags");
      expect(result).toEqual({ valid: true });
    });
  });

  describe("invalid URLs", () => {
    it("rejects file:///etc/passwd", () => {
      const result = validateOllamaUrl("file:///etc/passwd");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Only http and https protocols are allowed");
    });

    it("rejects ftp://internal", () => {
      const result = validateOllamaUrl("ftp://internal");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Only http and https protocols are allowed");
    });

    it("rejects gopher://evil", () => {
      const result = validateOllamaUrl("gopher://evil");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Only http and https protocols are allowed");
    });

    it("rejects javascript:alert(1)", () => {
      const result = validateOllamaUrl("javascript:alert(1)");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Only http and https protocols are allowed");
    });

    it("rejects URLs with credentials (http://user:pass@host)", () => {
      const result = validateOllamaUrl("http://user:pass@host");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("URLs with credentials are not allowed");
    });

    it("rejects URLs with only username", () => {
      const result = validateOllamaUrl("http://admin@host:11434");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("URLs with credentials are not allowed");
    });

    it("rejects non-URL strings", () => {
      const result = validateOllamaUrl("not-a-url");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Invalid URL format");
    });

    it("rejects empty string", () => {
      const result = validateOllamaUrl("");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("URL must not be empty");
    });

    it("rejects whitespace-only string", () => {
      const result = validateOllamaUrl("   ");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("URL must not be empty");
    });

    it("rejects data: URI", () => {
      const result = validateOllamaUrl("data:text/html,<h1>SSRF</h1>");
      expect(result.valid).toBe(false);
      expect(result.error).toBe("Only http and https protocols are allowed");
    });
  });
});
