/**
 * Image Processor Tests
 *
 * Tests: dimension reading from binary headers for PNG, JPEG, GIF, WebP.
 * SVG returns null. Invalid/corrupt buffers return null.
 */

import { getImageDimensions } from "@/lib/assets/image-processor";

// ---------------------------------------------------------------------------
// Buffer construction helpers
// ---------------------------------------------------------------------------

/**
 * Minimal valid PNG: 8-byte signature + IHDR chunk with width/height.
 * Layout: [0-7] signature, [8-11] IHDR length, [12-15] "IHDR",
 *         [16-19] width (BE uint32), [20-23] height (BE uint32)
 */
function makePngBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // PNG signature
  buf[0] = 0x89;
  buf[1] = 0x50; // P
  buf[2] = 0x4e; // N
  buf[3] = 0x47; // G
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  // IHDR chunk length (13 bytes)
  buf.writeUInt32BE(13, 8);
  // "IHDR"
  buf[12] = 0x49; // I
  buf[13] = 0x48; // H
  buf[14] = 0x44; // D
  buf[15] = 0x52; // R
  // Width and height at bytes 16-19 and 20-23
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

/**
 * Minimal valid JPEG with SOF0 marker.
 * Layout: [0-1] SOI (FF D8), [2-3] APP0 (FF E0), [4-5] segment length,
 *         ...skip..., then SOF0 marker at known position.
 *
 * We craft a minimal buffer:
 * SOI marker (FF D8) + a fake APP0 segment + SOF0 (FF C0) with dimensions.
 */
function makeJpegBuffer(width: number, height: number): Buffer {
  // SOI: FF D8
  // APP0 segment: FF E0 + length 0x0010 (16 bytes) + 16-2=14 bytes of data
  // SOF0 marker: FF C0 + length + precision + height(16-bit BE) + width(16-bit BE)
  const buf = Buffer.alloc(32);

  // SOI
  buf[0] = 0xff;
  buf[1] = 0xd8;

  // APP0 marker
  buf[2] = 0xff;
  buf[3] = 0xe0;
  // APP0 segment length = 16 (includes length bytes, excludes marker)
  buf.writeUInt16BE(16, 4);
  // 14 bytes of APP0 data (filler)
  // buf[6..19] stays 0x00

  // SOF0 marker at offset 20 (2 + 2 + 16 = 20)
  buf[20] = 0xff;
  buf[21] = 0xc0; // SOF0
  // SOF0 segment length = 11 (minimum for SOF0: length + precision + height + width + components)
  buf.writeUInt16BE(11, 22);
  // Precision (1 byte) at offset 24
  buf[24] = 0x08;
  // Height (2 bytes BE) at offset 25
  buf.writeUInt16BE(height, 25);
  // Width (2 bytes BE) at offset 27
  buf.writeUInt16BE(width, 27);

  return buf;
}

/**
 * Minimal valid GIF: 6-byte header + LSD with width/height (LE uint16).
 * Layout: [0-5] "GIF89a", [6-7] width (LE), [8-9] height (LE)
 */
function makeGifBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(16);
  buf[0] = 0x47; // G
  buf[1] = 0x49; // I
  buf[2] = 0x46; // F
  buf[3] = 0x38; // 8
  buf[4] = 0x39; // 9
  buf[5] = 0x61; // a
  buf.writeUInt16LE(width, 6);
  buf.writeUInt16LE(height, 8);
  return buf;
}

/**
 * Minimal WebP with VP8 chunk (lossy).
 * Layout: [0-3] "RIFF", [4-7] file size, [8-11] "WEBP",
 *         [12-15] "VP8 ", [16-19] chunk size,
 *         [20-22] VP8 frame tag (3 bytes), [23-25] start code (9D 01 2A),
 *         [26-27] width (LE, masked & 0x3FFF), [28-29] height (LE, masked & 0x3FFF)
 */
function makeWebpVp8Buffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // RIFF
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  // file size (arbitrary)
  buf.writeUInt32LE(24, 4);
  // WEBP
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  // VP8 chunk type (with trailing space)
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x20;
  // chunk size
  buf.writeUInt32LE(10, 16);
  // VP8 frame tag (3 bytes) — key frame, no show_frame (irrelevant for test)
  buf[20] = 0x00; buf[21] = 0x00; buf[22] = 0x00;
  // VP8 start code: 9D 01 2A
  buf[23] = 0x9d; buf[24] = 0x01; buf[25] = 0x2a;
  // Width and height as LE uint16 (scaled; lower 14 bits are dimension)
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

/**
 * Minimal WebP with VP8L chunk (lossless).
 * [12-15] "VP8L", [20] 0x2F (signature byte), [22-25] packed bits:
 * bits [0-13] = width-1, bits [14-27] = height-1
 */
function makeWebpVp8lBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // RIFF
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  buf.writeUInt32LE(20, 4);
  // WEBP
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  // VP8L
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x4c;
  buf.writeUInt32LE(6, 16);
  // signature byte at 21
  buf[21] = 0x2f;
  // Pack: bits [0-13] = width-1, bits [14-27] = height-1
  const w = (width - 1) & 0x3fff;
  const h = (height - 1) & 0x3fff;
  const packed = w | (h << 14);
  buf.writeUInt32LE(packed, 22);
  return buf;
}

/**
 * Minimal WebP with VP8X chunk (extended).
 * Canvas width stored as 24-bit LE at offset 24 (value = width-1).
 * Canvas height stored as 24-bit LE at offset 27 (value = height-1).
 */
function makeWebpVp8xBuffer(width: number, height: number): Buffer {
  const buf = Buffer.alloc(32);
  // RIFF
  buf[0] = 0x52; buf[1] = 0x49; buf[2] = 0x46; buf[3] = 0x46;
  buf.writeUInt32LE(22, 4);
  // WEBP
  buf[8] = 0x57; buf[9] = 0x45; buf[10] = 0x42; buf[11] = 0x50;
  // VP8X
  buf[12] = 0x56; buf[13] = 0x50; buf[14] = 0x38; buf[15] = 0x58;
  buf.writeUInt32LE(10, 16);
  // flags at 20-23 (don't care)
  // Canvas width - 1 as 24-bit LE at 24
  const w = width - 1;
  const h = height - 1;
  buf[24] = w & 0xff;
  buf[25] = (w >> 8) & 0xff;
  buf[26] = (w >> 16) & 0xff;
  // Canvas height - 1 as 24-bit LE at 27
  buf[27] = h & 0xff;
  buf[28] = (h >> 8) & 0xff;
  buf[29] = (h >> 16) & 0xff;
  return buf;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("getImageDimensions", () => {
  // -------------------------------------------------------------------------
  // PNG
  // -------------------------------------------------------------------------

  describe("PNG dimension reading", () => {
    it("reads 256x256 from a minimal PNG buffer", () => {
      const buf = makePngBuffer(256, 256);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toEqual({ width: 256, height: 256 });
    });

    it("reads 100x200 from a PNG buffer", () => {
      const buf = makePngBuffer(100, 200);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toEqual({ width: 100, height: 200 });
    });

    it("reads 1x1 from a PNG buffer", () => {
      const buf = makePngBuffer(1, 1);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toEqual({ width: 1, height: 1 });
    });

    it("returns null for PNG buffer shorter than 24 bytes", () => {
      const buf = Buffer.alloc(20);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toBeNull();
    });

    it("returns null for PNG with zero width", () => {
      const buf = makePngBuffer(0, 100);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toBeNull();
    });

    it("returns null for PNG with zero height", () => {
      const buf = makePngBuffer(100, 0);
      const result = getImageDimensions(buf, "image/png");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // JPEG
  // -------------------------------------------------------------------------

  describe("JPEG dimension reading", () => {
    it("reads 320x240 from a JPEG buffer with SOF0 marker", () => {
      const buf = makeJpegBuffer(320, 240);
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toEqual({ width: 320, height: 240 });
    });

    it("reads 1920x1080 from a JPEG buffer", () => {
      const buf = makeJpegBuffer(1920, 1080);
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toEqual({ width: 1920, height: 1080 });
    });

    it("returns null for a buffer too short to contain SOF marker", () => {
      const buf = Buffer.from([0xff, 0xd8, 0xff]);
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toBeNull();
    });

    it("returns null for JPEG buffer with no SOF marker", () => {
      // Just SOI + EOI, no SOF
      const buf = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
      const result = getImageDimensions(buf, "image/jpeg");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // GIF
  // -------------------------------------------------------------------------

  describe("GIF dimension reading", () => {
    it("reads 64x64 from a GIF buffer", () => {
      const buf = makeGifBuffer(64, 64);
      const result = getImageDimensions(buf, "image/gif");
      expect(result).toEqual({ width: 64, height: 64 });
    });

    it("reads 800x600 from a GIF buffer", () => {
      const buf = makeGifBuffer(800, 600);
      const result = getImageDimensions(buf, "image/gif");
      expect(result).toEqual({ width: 800, height: 600 });
    });

    it("returns null for GIF buffer shorter than 10 bytes", () => {
      const buf = Buffer.alloc(8);
      const result = getImageDimensions(buf, "image/gif");
      expect(result).toBeNull();
    });

    it("returns null for GIF with zero width", () => {
      const buf = makeGifBuffer(0, 100);
      const result = getImageDimensions(buf, "image/gif");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // WebP
  // -------------------------------------------------------------------------

  describe("WebP dimension reading", () => {
    it("reads 400x300 from a VP8 (lossy) WebP buffer", () => {
      const buf = makeWebpVp8Buffer(400, 300);
      const result = getImageDimensions(buf, "image/webp");
      expect(result).toEqual({ width: 400, height: 300 });
    });

    it("reads 512x512 from a VP8L (lossless) WebP buffer", () => {
      const buf = makeWebpVp8lBuffer(512, 512);
      const result = getImageDimensions(buf, "image/webp");
      expect(result).toEqual({ width: 512, height: 512 });
    });

    it("reads 1024x768 from a VP8X (extended) WebP buffer", () => {
      const buf = makeWebpVp8xBuffer(1024, 768);
      const result = getImageDimensions(buf, "image/webp");
      expect(result).toEqual({ width: 1024, height: 768 });
    });

    it("returns null for WebP buffer shorter than 30 bytes", () => {
      const buf = Buffer.alloc(20);
      const result = getImageDimensions(buf, "image/webp");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // SVG and ICO — return null
  // -------------------------------------------------------------------------

  describe("SVG returns null (no fixed pixel dimensions)", () => {
    it("returns null for SVG MIME type", () => {
      const buf = Buffer.from("<svg><rect/></svg>", "utf8");
      const result = getImageDimensions(buf, "image/svg+xml");
      expect(result).toBeNull();
    });
  });

  describe("ICO returns null", () => {
    it("returns null for ICO MIME type", () => {
      const buf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x10, 0x10]);
      const result = getImageDimensions(buf, "image/x-icon");
      expect(result).toBeNull();
    });

    it("returns null for vnd.microsoft.icon MIME type", () => {
      const buf = Buffer.from([0x00, 0x00, 0x01, 0x00, 0x01, 0x00]);
      const result = getImageDimensions(buf, "image/vnd.microsoft.icon");
      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Unknown / corrupt buffer
  // -------------------------------------------------------------------------

  describe("invalid or corrupt input", () => {
    it("returns null for an empty buffer with image/png MIME type", () => {
      const result = getImageDimensions(Buffer.alloc(0), "image/png");
      expect(result).toBeNull();
    });

    it("returns null for an unknown MIME type", () => {
      const buf = Buffer.alloc(32);
      const result = getImageDimensions(buf, "image/bmp");
      expect(result).toBeNull();
    });

    it("returns null for a corrupt PNG (all zeros)", () => {
      const buf = Buffer.alloc(32, 0x00);
      // All-zero PNG buffer: width=0, height=0, so null
      const result = getImageDimensions(buf, "image/png");
      expect(result).toBeNull();
    });

    it("is case-insensitive on MIME type", () => {
      const buf = makePngBuffer(100, 100);
      const result = getImageDimensions(buf, "IMAGE/PNG");
      expect(result).toEqual({ width: 100, height: 100 });
    });
  });
});
