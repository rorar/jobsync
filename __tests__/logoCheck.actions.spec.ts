import { checkLogoUrl } from "@/actions/logoCheck.actions";
import { getCurrentUser } from "@/utils/user.utils";
import { validateWebhookUrl } from "@/lib/url-validation";
import { checkRateLimit } from "@/lib/api/rate-limit";

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

jest.mock("@/lib/url-validation", () => ({
  validateWebhookUrl: jest.fn(),
}));

jest.mock("@/lib/api/rate-limit", () => ({
  checkRateLimit: jest.fn(),
}));

const originalFetch = global.fetch;

describe("checkLogoUrl", () => {
  const mockUser = { id: "user-1", name: "Test", email: "test@test.com" };

  beforeEach(() => {
    jest.clearAllMocks();
    (getCurrentUser as jest.Mock).mockResolvedValue(mockUser);
    (validateWebhookUrl as jest.Mock).mockReturnValue({ valid: true });
    // M-S-04: checkRateLimit is now called twice (global cap then per-user cap).
    // Default: both allowed.
    (checkRateLimit as jest.Mock).mockReturnValue({ allowed: true });
    global.fetch = jest.fn();
  });

  afterAll(() => {
    global.fetch = originalFetch;
  });

  it("returns isImage:true for valid image URL", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      headers: {
        get: (key: string) => (key === "content-type" ? "image/png" : null),
      },
    });

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(true);
    expect(result.contentType).toBe("image/png");
  });

  it("returns isImage:false for non-image content type", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 200,
      headers: {
        get: (key: string) => (key === "content-type" ? "text/html" : null),
      },
    });

    const result = await checkLogoUrl("https://example.com/page.html");

    expect(result.isImage).toBe(false);
    expect(result.contentType).toBe("text/html");
  });

  it("returns isImage:false for non-http protocol", async () => {
    const result = await checkLogoUrl("ftp://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(result.contentType).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns isImage:false when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(result.contentType).toBeNull();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("returns isImage:false on network error", async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error("Network error"));

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(result.contentType).toBeNull();
  });

  it("validates URL against SSRF before fetching", async () => {
    (validateWebhookUrl as jest.Mock).mockReturnValue({ valid: false, error: "webhook.ssrfBlocked" });

    const result = await checkLogoUrl("http://169.254.169.254/latest/meta-data");

    expect(result.isImage).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("follows redirects safely with SSRF validation on each hop", async () => {
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce({
        status: 301,
        headers: {
          get: (key: string) => (key === "location" ? "https://cdn.example.com/logo.jpg" : null),
        },
      })
      .mockResolvedValueOnce({
        status: 200,
        headers: {
          get: (key: string) => (key === "content-type" ? "image/jpeg" : null),
        },
      });

    const result = await checkLogoUrl("https://example.com/logo-redirect");

    expect(result.isImage).toBe(true);
    expect(result.contentType).toBe("image/jpeg");
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it("blocks redirect to private IP", async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      status: 302,
      headers: {
        get: (key: string) => (key === "location" ? "http://10.0.0.1/logo.png" : null),
      },
    });

    (validateWebhookUrl as jest.Mock)
      .mockReturnValueOnce({ valid: true }) // initial URL
      .mockReturnValueOnce({ valid: false, error: "webhook.ssrfBlocked" }); // redirect target

    const result = await checkLogoUrl("https://evil.com/redirect-to-private");

    expect(result.isImage).toBe(false);
  });

  it("resolves Wikipedia media URLs via Wikimedia API", async () => {
    const wikimediaDirectUrl = "https://upload.wikimedia.org/wikipedia/commons/a/a1/Niederegger_Logo.svg";

    // M-S-08: mock must include ok:true so the response.ok guard passes
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        query: {
          pages: {
            "12345": {
              imageinfo: [{ url: wikimediaDirectUrl }],
            },
          },
        },
      }),
    });

    const result = await checkLogoUrl(
      "https://de.wikipedia.org/wiki/Niederegger#/media/Datei:Niederegger_Logo.svg",
    );

    expect(result.isImage).toBe(true);
    expect(result.contentType).toBe("image/svg+xml");
    expect(result.resolvedUrl).toBe(wikimediaDirectUrl);
  });

  // M-S-08: Wikimedia API non-2xx → return null (don't parse JSON)
  it("returns isImage:false when Wikimedia API returns non-2xx (M-S-08)", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      // json should NOT be called
      json: jest.fn().mockRejectedValue(new Error("should not parse")),
    });

    const result = await checkLogoUrl(
      "https://de.wikipedia.org/wiki/Niederegger#/media/Datei:Niederegger_Logo.svg",
    );

    // Falls through to HEAD check after Wikimedia returns null
    // HEAD fetch also needs to be set up; simplest: network error
    expect(result.isImage).toBe(false);
  });

  // M-S-08: resolved URL not on wikimedia.org domain → rejected
  it("rejects Wikimedia-resolved URL on non-Wikimedia domain (M-S-08)", async () => {
    const maliciousUrl = "https://attacker.example.com/evil.svg";

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: jest.fn().mockResolvedValue({
        query: {
          pages: {
            "999": {
              imageinfo: [{ url: maliciousUrl }],
            },
          },
        },
      }),
    });

    const result = await checkLogoUrl(
      "https://de.wikipedia.org/wiki/Niederegger#/media/Datei:Niederegger_Logo.svg",
    );

    // resolveWikimediaUrl returns null for non-.wikimedia.org URL;
    // falls through to HEAD check which also fails (no second mock)
    expect(result.isImage).toBe(false);
    // Should NOT have called validateWebhookUrl with the malicious URL
    // (domain check happens before ssrfCheck)
    const ssrfCalls = (validateWebhookUrl as jest.Mock).mock.calls;
    const calledWithMalicious = ssrfCalls.some(
      ([url]: [string]) => url === maliciousUrl,
    );
    expect(calledWithMalicious).toBe(false);
  });

  it("respects rate limiting — global cap blocks before per-user (M-S-04)", async () => {
    // First call to checkRateLimit (global cap) is blocked
    (checkRateLimit as jest.Mock).mockReturnValueOnce({ allowed: false });

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    // checkRateLimit called once (global), not twice
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
    expect((checkRateLimit as jest.Mock).mock.calls[0][0]).toBe("logoCheck:global");
  });

  it("respects rate limiting — per-user cap blocks after global passes (M-S-04)", async () => {
    // Global cap passes, per-user cap blocks
    (checkRateLimit as jest.Mock)
      .mockReturnValueOnce({ allowed: true })  // global
      .mockReturnValueOnce({ allowed: false }); // per-user

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
    expect(checkRateLimit).toHaveBeenCalledTimes(2);
  });
});
