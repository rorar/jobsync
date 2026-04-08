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

    (global.fetch as jest.Mock).mockResolvedValueOnce({
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

  it("respects rate limiting", async () => {
    (checkRateLimit as jest.Mock).mockReturnValue({ allowed: false });

    const result = await checkLogoUrl("https://example.com/logo.png");

    expect(result.isImage).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
