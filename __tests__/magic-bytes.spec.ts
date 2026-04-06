/**
 * Magic Bytes Validation Tests
 *
 * Tests: MIME type detection for all supported formats,
 * mismatch detection, edge cases (empty/short buffers).
 */

import { validateMagicBytes, ACCEPTED_MIME_TYPES } from "@/lib/assets/magic-bytes";

// ---------------------------------------------------------------------------
// Buffer helpers
// ---------------------------------------------------------------------------

function makePng(extra = 16): Buffer {
  // 89 50 4E 47 0D 0A 1A 0A (PNG signature) + 4 length bytes + 4 IHDR type + dims
  const buf = Buffer.alloc(24 + extra);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  return buf;
}

function makeJpeg(): Buffer {
  // FF D8 FF E0 (JFIF start)
  const buf = Buffer.alloc(12);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

function makeGif(): Buffer {
  // GIF89a — 47 49 46 38 39 61
  const buf = Buffer.alloc(12);
  buf[0] = 0x47;
  buf[1] = 0x49;
  buf[2] = 0x46;
  buf[3] = 0x38;
  buf[4] = 0x39;
  buf[5] = 0x61;
  return buf;
}

function makeWebp(): Buffer {
  // RIFF....WEBP
  const buf = Buffer.alloc(16);
  buf[0] = 0x52; // R
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x46; // F
  // bytes 4-7: file size (irrelevant for detection)
  buf[4] = 0x00;
  buf[5] = 0x00;
  buf[6] = 0x00;
  buf[7] = 0x00;
  buf[8] = 0x57;  // W
  buf[9] = 0x45;  // E
  buf[10] = 0x42; // B
  buf[11] = 0x50; // P
  return buf;
}

function makeIco(): Buffer {
  // ICO: 00 00 01 00
  const buf = Buffer.alloc(8);
  buf[0] = 0x00;
  buf[1] = 0x00;
  buf[2] = 0x01;
  buf[3] = 0x00;
  return buf;
}

function makeSvg(content = "<svg xmlns='http://www.w3.org/2000/svg'></svg>"): Buffer {
  return Buffer.from(content, "utf8");
}

function makeXmlSvg(): Buffer {
  return Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>', "utf8");
}

// ---------------------------------------------------------------------------
// ACCEPTED_MIME_TYPES
// ---------------------------------------------------------------------------

describe("ACCEPTED_MIME_TYPES", () => {
  it("contains all expected MIME types", () => {
    expect(ACCEPTED_MIME_TYPES.has("image/png")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/jpeg")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/gif")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/webp")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/svg+xml")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/x-icon")).toBe(true);
    expect(ACCEPTED_MIME_TYPES.has("image/vnd.microsoft.icon")).toBe(true);
  });

  it("does not contain non-image types", () => {
    expect(ACCEPTED_MIME_TYPES.has("text/html")).toBe(false);
    expect(ACCEPTED_MIME_TYPES.has("application/pdf")).toBe(false);
    expect(ACCEPTED_MIME_TYPES.has("image/tiff")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateMagicBytes — happy paths
// ---------------------------------------------------------------------------

describe("validateMagicBytes", () => {
  describe("PNG detection", () => {
    it("validates a valid PNG buffer declared as image/png", () => {
      const result = validateMagicBytes(makePng(), "image/png");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/png");
    });

    it("is case-insensitive on declared MIME type", () => {
      const result = validateMagicBytes(makePng(), "IMAGE/PNG");
      expect(result.valid).toBe(true);
    });

    it("trims whitespace on declared MIME type", () => {
      const result = validateMagicBytes(makePng(), " image/png ");
      expect(result.valid).toBe(true);
    });
  });

  describe("JPEG detection", () => {
    it("validates a valid JPEG buffer declared as image/jpeg", () => {
      const result = validateMagicBytes(makeJpeg(), "image/jpeg");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/jpeg");
    });
  });

  describe("GIF detection", () => {
    it("validates a valid GIF buffer declared as image/gif", () => {
      const result = validateMagicBytes(makeGif(), "image/gif");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/gif");
    });
  });

  describe("WebP detection", () => {
    it("validates a valid WebP buffer declared as image/webp", () => {
      const result = validateMagicBytes(makeWebp(), "image/webp");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/webp");
    });
  });

  describe("ICO detection", () => {
    it("validates a valid ICO buffer declared as image/x-icon", () => {
      const result = validateMagicBytes(makeIco(), "image/x-icon");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/x-icon");
    });

    it("validates ICO buffer declared as image/vnd.microsoft.icon (normalized)", () => {
      const result = validateMagicBytes(makeIco(), "image/vnd.microsoft.icon");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/x-icon");
    });
  });

  describe("SVG detection", () => {
    it("validates SVG buffer with <svg tag declared as image/svg+xml", () => {
      const result = validateMagicBytes(makeSvg(), "image/svg+xml");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/svg+xml");
    });

    it("validates SVG buffer with <?xml declaration", () => {
      const result = validateMagicBytes(makeXmlSvg(), "image/svg+xml");
      expect(result.valid).toBe(true);
      expect(result.detectedMime).toBe("image/svg+xml");
    });
  });

  // ---------------------------------------------------------------------------
  // Mismatch detection
  // ---------------------------------------------------------------------------

  describe("mismatch detection", () => {
    it("rejects PNG buffer declared as image/jpeg", () => {
      const result = validateMagicBytes(makePng(), "image/jpeg");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBe("image/png");
    });

    it("rejects JPEG buffer declared as image/png", () => {
      const result = validateMagicBytes(makeJpeg(), "image/png");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBe("image/jpeg");
    });

    it("rejects GIF buffer declared as image/webp", () => {
      const result = validateMagicBytes(makeGif(), "image/webp");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBe("image/gif");
    });

    it("rejects SVG buffer declared as image/png", () => {
      const result = validateMagicBytes(makeSvg(), "image/png");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBe("image/svg+xml");
    });

    it("rejects PNG buffer declared as image/svg+xml", () => {
      const result = validateMagicBytes(makePng(), "image/svg+xml");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBe("image/png");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("rejects empty buffer", () => {
      const result = validateMagicBytes(Buffer.alloc(0), "image/png");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it("rejects buffer with fewer than 4 bytes", () => {
      const result = validateMagicBytes(Buffer.from([0x89, 0x50, 0x4e]), "image/png");
      expect(result.valid).toBe(false);
      expect(result.detectedMime).toBeUndefined();
    });

    it("rejects buffer of exactly 3 bytes", () => {
      const result = validateMagicBytes(Buffer.alloc(3), "image/jpeg");
      expect(result.valid).toBe(false);
    });

    it("rejects random bytes that match no known format", () => {
      const buf = Buffer.from([0x01, 0x02, 0x03, 0x04, 0x05]);
      const result = validateMagicBytes(buf, "image/png");
      expect(result.valid).toBe(false);
    });

    it("WebP detection requires at least 12 bytes for WEBP signature", () => {
      // Buffer has RIFF but is only 8 bytes — cannot reach WEBP at offset 8-11
      const shortRiff = Buffer.from([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00]);
      const result = validateMagicBytes(shortRiff, "image/webp");
      expect(result.valid).toBe(false);
    });
  });
});
