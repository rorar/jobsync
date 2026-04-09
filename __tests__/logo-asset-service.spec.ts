/**
 * LogoAssetService Tests
 *
 * Tests: downloadAndProcess pipeline (SSRF, content-type, magic bytes, SVG sanitize,
 * body limit, error handling, token stripping), deleteAsset (IDOR, cleanup).
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// Polyfill AbortSignal.timeout for test environment
if (typeof AbortSignal.timeout !== "function") {
  AbortSignal.timeout = (ms: number) => {
    const controller = new AbortController();
    setTimeout(() => controller.abort(new DOMException("TimeoutError")), ms);
    return controller.signal;
  };
}

// ---------------------------------------------------------------------------
// Mocks — declared before imports (Jest hoisting)
// ---------------------------------------------------------------------------

const mockLogoAssetUpsert = jest.fn();
const mockLogoAssetUpdate = jest.fn();
const mockLogoAssetFindFirst = jest.fn();
const mockLogoAssetDeleteMany = jest.fn();
const mockCompanyUpdateMany = jest.fn();
const mockUserSettingsFindUnique = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    logoAsset: {
      upsert: (...args: unknown[]) => mockLogoAssetUpsert(...args),
      update: (...args: unknown[]) => mockLogoAssetUpdate(...args),
      findFirst: (...args: unknown[]) => mockLogoAssetFindFirst(...args),
      deleteMany: (...args: unknown[]) => mockLogoAssetDeleteMany(...args),
    },
    company: {
      updateMany: (...args: unknown[]) => mockCompanyUpdateMany(...args),
    },
    userSettings: {
      findUnique: (...args: unknown[]) => mockUserSettingsFindUnique(...args),
    },
  },
}));

const mockValidateWebhookUrl = jest.fn();
jest.mock("@/lib/url-validation", () => ({
  validateWebhookUrl: (...args: unknown[]) => mockValidateWebhookUrl(...args),
}));

const mockValidateMagicBytes = jest.fn();
jest.mock("@/lib/assets/magic-bytes", () => ({
  validateMagicBytes: (...args: unknown[]) => mockValidateMagicBytes(...args),
  ACCEPTED_MIME_TYPES: new Set([
    "image/png",
    "image/jpeg",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
  ]),
}));

const mockSanitizeSvg = jest.fn();
jest.mock("@/lib/assets/svg-sanitizer", () => ({
  sanitizeSvg: (...args: unknown[]) => mockSanitizeSvg(...args),
}));

const mockGetImageDimensions = jest.fn();
jest.mock("@/lib/assets/image-processor", () => ({
  getImageDimensions: (...args: unknown[]) => mockGetImageDimensions(...args),
}));

// fs/promises is spied on (not mocked) to work with Node.js built-in interop
import fs from "fs/promises";
const mockMkdir = jest.spyOn(fs, "mkdir").mockResolvedValue(undefined as never);
const mockWriteFile = jest.spyOn(fs, "writeFile").mockResolvedValue(undefined);
const mockUnlink = jest.spyOn(fs, "unlink").mockResolvedValue(undefined);
const mockRmdir = jest.spyOn(fs, "rmdir").mockResolvedValue(undefined);

jest.mock("@/models/userSettings.model", () => ({
  defaultLogoAssetConfig: {
    maxFileSize: 524288,
    maxDimension: 512,
  },
}));


// ---------------------------------------------------------------------------
// Test Helpers
// ---------------------------------------------------------------------------

/** PNG magic bytes (first 8 bytes of a PNG file) */
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** JPEG magic bytes (first 3 bytes) */
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

/** Simple SVG content */
const SVG_CONTENT = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');

/**
 * Create a mock Response object suitable for the fetch mock.
 */
function createMockResponse(options: {
  status?: number;
  statusText?: string;
  contentType?: string;
  body?: Buffer;
  headers?: Record<string, string>;
}): Response {
  const {
    status = 200,
    statusText = "OK",
    contentType = "image/png",
    body = PNG_MAGIC,
    headers: extraHeaders = {},
  } = options;

  const allHeaders = new Headers({
    "content-type": contentType,
    ...extraHeaders,
  });

  // Create a readable stream from the buffer
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(new Uint8Array(body));
      controller.close();
    },
  });

  return {
    status,
    statusText,
    headers: allHeaders,
    body: stream,
    ok: status >= 200 && status < 300,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// Import under test (after mocks)
// ---------------------------------------------------------------------------

// We need to access the singleton. The module uses globalThis pattern.
// Reset the singleton before importing to get a fresh instance.
const g = globalThis as unknown as { __logoAssetService?: unknown };
delete g.__logoAssetService;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { logoAssetService } = require("@/lib/assets/logo-asset-service");

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("LogoAssetService", () => {
  const userId = "test-user-id";
  const companyId = "company-fixture-id";
  const sourceUrl = "https://img.logo.dev/acme.com?format=png&token=pk_abc123";

  beforeEach(() => {
    jest.clearAllMocks();

    // Default successful mocks
    mockLogoAssetUpsert.mockResolvedValue({
      id: "logo-asset-1",
      userId,
      companyId,
      sourceUrl,
      status: "pending",
    });

    mockLogoAssetUpdate.mockResolvedValue({
      id: "logo-asset-1",
      userId,
      companyId,
      sourceUrl,
      status: "ready",
    });

    mockCompanyUpdateMany.mockResolvedValue({ count: 1 });
    mockUserSettingsFindUnique.mockResolvedValue(null);

    mockValidateWebhookUrl.mockReturnValue({ valid: true });
    mockValidateMagicBytes.mockReturnValue({ valid: true, detectedMime: "image/png" });
    mockGetImageDimensions.mockReturnValue({ width: 256, height: 256 });
    mockSanitizeSvg.mockImplementation((buf: Buffer) => buf);

    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);
    mockUnlink.mockResolvedValue(undefined);
    mockRmdir.mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // downloadAndProcess
  // -------------------------------------------------------------------------

  describe("downloadAndProcess", () => {
    it("happy path downloads and stores image", async () => {
      const mockResponse = createMockResponse({ body: PNG_MAGIC });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      // Should upsert a pending asset
      expect(mockLogoAssetUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_companyId: { userId, companyId } },
          create: expect.objectContaining({ status: "pending" }),
          update: expect.objectContaining({ status: "pending" }),
        }),
      );

      // Should validate SSRF
      expect(mockValidateWebhookUrl).toHaveBeenCalledWith(sourceUrl);

      // Should fetch the URL
      expect(global.fetch).toHaveBeenCalled();

      // Should validate magic bytes
      expect(mockValidateMagicBytes).toHaveBeenCalled();

      // Should write file to disk
      expect(mockMkdir).toHaveBeenCalledWith(expect.any(String), { recursive: true });
      expect(mockWriteFile).toHaveBeenCalled();

      // Should update asset to ready
      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: "ready" }),
        }),
      );

      // Should update company with logoAssetId
      expect(mockCompanyUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: companyId, createdBy: userId },
        }),
      );
    });

    it("rejects URL failing SSRF validation", async () => {
      mockValidateWebhookUrl.mockReturnValue({ valid: false, error: "private IP" });

      await logoAssetService.downloadAndProcess(
        "http://10.0.0.1/logo.png",
        userId,
        companyId,
      );

      // Should set status to failed
      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("SSRF"),
          }),
        }),
      );

      // Should NOT write any file
      expect(mockWriteFile).not.toHaveBeenCalled();
    });

    it("rejects redirect to private IP", async () => {
      // First response is a redirect
      const redirectResponse = {
        status: 302,
        statusText: "Found",
        headers: new Headers({ location: "http://10.0.0.1/logo.png" }),
        body: new ReadableStream({
          start(controller: ReadableStreamDefaultController) {
            controller.close();
          },
        }),
        ok: false,
      } as unknown as Response;

      global.fetch = jest.fn().mockResolvedValue(redirectResponse);

      // SSRF check: first call succeeds, second call (redirect target) fails
      mockValidateWebhookUrl
        .mockReturnValueOnce({ valid: true })
        .mockReturnValueOnce({ valid: false, error: "private IP" });

      await logoAssetService.downloadAndProcess(
        "https://external.example.com/logo.png",
        userId,
        companyId,
      );

      // Should fail with SSRF blocked redirect
      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("SSRF blocked redirect"),
          }),
        }),
      );
    });

    it("rejects non-image content type", async () => {
      const mockResponse = createMockResponse({
        contentType: "text/html",
        body: Buffer.from("<html>not an image</html>"),
      });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("Unsupported content type"),
          }),
        }),
      );
    });

    it("rejects body exceeding MAX_DOWNLOAD_BYTES", async () => {
      // Create a stream that emits more than 1MB
      const largeChunk = new Uint8Array(1_048_577);
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(largeChunk);
          controller.close();
        },
      });

      const mockResponse = {
        status: 200,
        statusText: "OK",
        headers: new Headers({ "content-type": "image/png" }),
        body: stream,
        ok: true,
      } as unknown as Response;

      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("byte limit"),
          }),
        }),
      );
    });

    it("rejects magic byte mismatch", async () => {
      // Response claims PNG but sends JPEG bytes
      const mockResponse = createMockResponse({
        contentType: "image/png",
        body: JPEG_MAGIC,
      });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      mockValidateMagicBytes.mockReturnValue({
        valid: false,
        detectedMime: "image/jpeg",
      });

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: expect.stringContaining("MIME mismatch"),
          }),
        }),
      );
    });

    it("sanitizes SVG before storing", async () => {
      const sanitizedSvg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>');
      mockSanitizeSvg.mockReturnValue(sanitizedSvg);

      const mockResponse = createMockResponse({
        contentType: "image/svg+xml",
        body: SVG_CONTENT,
      });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      // SVG passes magic byte check
      mockValidateMagicBytes.mockReturnValue({ valid: true, detectedMime: "image/svg+xml" });

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      // sanitizeSvg should have been called with the fetched buffer
      expect(mockSanitizeSvg).toHaveBeenCalled();

      // The sanitized content should be written, not the raw content
      expect(mockWriteFile).toHaveBeenCalledWith(
        expect.any(String),
        sanitizedSvg,
      );
    });

    it("sets status to failed on error", async () => {
      // Simulate a fetch error
      global.fetch = jest.fn().mockRejectedValue(new Error("Network timeout"));

      await logoAssetService.downloadAndProcess(sourceUrl, userId, companyId);

      expect(mockLogoAssetUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: "failed",
            errorMessage: "Network timeout",
          }),
        }),
      );
    });

    it("strips token from URL in Company.logoUrl", async () => {
      const urlWithToken = "https://img.logo.dev/acme.com?format=png&token=pk_abc123";
      const mockResponse = createMockResponse({ body: PNG_MAGIC });
      global.fetch = jest.fn().mockResolvedValue(mockResponse);

      await logoAssetService.downloadAndProcess(urlWithToken, userId, companyId);

      // The company update should use a URL with token stripped
      expect(mockCompanyUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            logoUrl: expect.not.stringContaining("pk_abc123"),
          }),
        }),
      );

      // Verify the logoUrl still contains the base URL parts
      const callArgs = mockCompanyUpdateMany.mock.calls[0][0];
      expect(callArgs.data.logoUrl).toContain("img.logo.dev");
      expect(callArgs.data.logoUrl).toContain("format=png");
    });
  });

  // -------------------------------------------------------------------------
  // deleteAsset
  // -------------------------------------------------------------------------

  describe("deleteAsset", () => {
    it("deletes file and DB record with IDOR protection", async () => {
      const logoAssetId = "logo-asset-1";
      mockLogoAssetFindFirst.mockResolvedValue({
        id: logoAssetId,
        userId,
        companyId,
        filePath: "/data/logos/test-user-id/company-fixture-id/logo.png",
      });

      await logoAssetService.deleteAsset(logoAssetId, userId);

      // Should query with IDOR protection (userId in where clause)
      expect(mockLogoAssetFindFirst).toHaveBeenCalledWith({
        where: { id: logoAssetId, userId },
      });

      // Should clear Company.logoAssetId
      expect(mockCompanyUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: companyId, createdBy: userId, logoAssetId },
          data: { logoAssetId: null },
        }),
      );

      // Should delete the file
      expect(mockUnlink).toHaveBeenCalledWith(
        "/data/logos/test-user-id/company-fixture-id/logo.png",
      );

      // Should delete the DB record (with IDOR)
      expect(mockLogoAssetDeleteMany).toHaveBeenCalledWith({
        where: { id: logoAssetId, userId },
      });
    });

    it("returns early for non-existent asset", async () => {
      const logoAssetId = "non-existent-id";
      mockLogoAssetFindFirst.mockResolvedValue(null);

      await logoAssetService.deleteAsset(logoAssetId, userId);

      // Should NOT attempt to delete anything
      expect(mockCompanyUpdateMany).not.toHaveBeenCalled();
      expect(mockUnlink).not.toHaveBeenCalled();
      expect(mockLogoAssetDeleteMany).not.toHaveBeenCalled();
    });
  });
});

// ---------------------------------------------------------------------------
// stripCredentialsFromUrl unit tests (H-S-05)
// Imported separately to avoid the globalThis singleton pattern in LogoAssetService.
// ---------------------------------------------------------------------------

// Re-require the module to access the named export
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { stripCredentialsFromUrl } = require("@/lib/assets/logo-asset-service");

describe("stripCredentialsFromUrl (H-S-05)", () => {
  it("strips 'token' parameter (Logo.dev default)", () => {
    const result = stripCredentialsFromUrl(
      "https://img.logo.dev/acme.com?format=png&token=pk_abc123",
    );
    expect(result).not.toContain("token=");
    expect(result).toContain("format=png");
  });

  it("strips 'key' parameter (Google APIs)", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?key=AIzaSy_secret&size=64",
    );
    expect(result).not.toContain("key=AIzaSy_secret");
    expect(result).toContain("size=64");
  });

  it("strips 'api_key' parameter", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?api_key=secret&size=64",
    );
    expect(result).not.toContain("api_key=secret");
    expect(result).toContain("size=64");
  });

  it("strips 'apiKey' camelCase variant", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?apiKey=secret&size=64",
    );
    expect(result).not.toContain("apiKey=secret");
    expect(result).toContain("size=64");
  });

  it("strips 'access_token' (OAuth in URL)", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?access_token=bearer_xyz&v=2",
    );
    expect(result).not.toContain("access_token=bearer_xyz");
    expect(result).toContain("v=2");
  });

  it("strips 'sig' and 'signature' parameters", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?sig=abc&signature=xyz&format=png",
    );
    expect(result).not.toContain("sig=abc");
    expect(result).not.toContain("signature=xyz");
    expect(result).toContain("format=png");
  });

  it("strips 'X-Amz-Signature' (AWS presigned URL)", () => {
    const result = stripCredentialsFromUrl(
      "https://bucket.s3.amazonaws.com/logo.png?X-Amz-Signature=abcdef&X-Amz-Expires=3600",
    );
    expect(result).not.toContain("X-Amz-Signature=abcdef");
    expect(result).toContain("X-Amz-Expires=3600");
  });

  it("strips 'X-Amz-Security-Token' (AWS session token)", () => {
    const result = stripCredentialsFromUrl(
      "https://bucket.s3.amazonaws.com/logo.png?X-Amz-Security-Token=sess&X-Amz-Expires=3600",
    );
    expect(result).not.toContain("X-Amz-Security-Token=sess");
    expect(result).toContain("X-Amz-Expires=3600");
  });

  it("strips 'auth' and 'secret' generic parameters", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?auth=bearer&secret=mysecret&format=png",
    );
    expect(result).not.toContain("auth=bearer");
    expect(result).not.toContain("secret=mysecret");
    expect(result).toContain("format=png");
  });

  it("preserves clean URLs without modification", () => {
    const clean = "https://img.logo.dev/acme.com?format=png&size=64";
    const result = stripCredentialsFromUrl(clean);
    expect(result).toBe(clean);
  });

  it("accepts extra param names via second argument", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?myCustomCred=abc&format=png",
      ["myCustomCred"],
    );
    expect(result).not.toContain("myCustomCred=abc");
    expect(result).toContain("format=png");
  });

  it("strips multiple credential params in one pass", () => {
    const result = stripCredentialsFromUrl(
      "https://api.example.com/logo?token=t&key=k&api_key=a&format=png",
    );
    expect(result).not.toContain("token=");
    expect(result).not.toContain("key=");
    expect(result).not.toContain("api_key=");
    expect(result).toContain("format=png");
  });

  it("returns unparseable URL unchanged", () => {
    const bad = "not-a-valid-url";
    const result = stripCredentialsFromUrl(bad);
    expect(result).toBe(bad);
  });
});
