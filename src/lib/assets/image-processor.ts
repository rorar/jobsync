/**
 * Image Dimension Reader
 *
 * Reads width and height from image headers without external dependencies.
 * Supports PNG, JPEG, GIF, and WebP. SVGs return null (vector, no intrinsic
 * pixel dimensions for our purposes).
 *
 * No actual resize is implemented in this phase — just dimension reading
 * from binary headers.
 */

/**
 * Read image dimensions from the binary header.
 *
 * @param buffer - Image file content
 * @param mimeType - Detected/declared MIME type
 * @returns Dimensions or null if not determinable (e.g., SVG)
 */
export function getImageDimensions(
  buffer: Buffer,
  mimeType: string,
): { width: number; height: number } | null {
  const mime = mimeType.toLowerCase();

  if (mime === "image/png") return readPngDimensions(buffer);
  if (mime === "image/jpeg") return readJpegDimensions(buffer);
  if (mime === "image/gif") return readGifDimensions(buffer);
  if (mime === "image/webp") return readWebpDimensions(buffer);

  // SVG, ICO — return null (no fixed pixel dimensions for our purposes)
  return null;
}

/**
 * PNG: width at bytes 16-19, height at bytes 20-23 (IHDR chunk), big-endian.
 */
function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  // Minimum PNG: 8 (signature) + 4 (length) + 4 (IHDR) + 4 (width) + 4 (height) = 24
  if (buffer.length < 24) return null;

  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);

  if (width === 0 || height === 0) return null;
  return { width, height };
}

/**
 * JPEG: scan for SOF0 (0xFFC0) or SOF2 (0xFFC2) marker,
 * then read height at offset +5, width at offset +7 (big-endian 16-bit).
 */
function readJpegDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 4) return null;

  let offset = 2; // skip SOI marker (FF D8)

  while (offset < buffer.length - 1) {
    if (buffer[offset] !== 0xff) {
      offset++;
      continue;
    }

    const marker = buffer[offset + 1];

    // SOF markers that carry dimension data: SOF0-SOF3, SOF5-SOF7, SOF9-SOF11, SOF13-SOF15
    if (
      (marker >= 0xc0 && marker <= 0xc3) ||
      (marker >= 0xc5 && marker <= 0xc7) ||
      (marker >= 0xc9 && marker <= 0xcb) ||
      (marker >= 0xcd && marker <= 0xcf)
    ) {
      if (offset + 9 > buffer.length) return null;
      const height = buffer.readUInt16BE(offset + 5);
      const width = buffer.readUInt16BE(offset + 7);
      if (width === 0 || height === 0) return null;
      return { width, height };
    }

    // Skip non-SOF markers by reading segment length
    if (offset + 3 >= buffer.length) return null;
    const segmentLength = buffer.readUInt16BE(offset + 2);
    offset += 2 + segmentLength;
  }

  return null;
}

/**
 * GIF: width at bytes 6-7, height at bytes 8-9, little-endian.
 */
function readGifDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 10) return null;

  const width = buffer.readUInt16LE(6);
  const height = buffer.readUInt16LE(8);

  if (width === 0 || height === 0) return null;
  return { width, height };
}

/**
 * WebP: supports VP8 (lossy), VP8L (lossless), and VP8X (extended).
 * RIFF header at 0, 'WEBP' at 8, chunk type at 12.
 */
function readWebpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30) return null;

  const chunkType = buffer.subarray(12, 16).toString("ascii");

  if (chunkType === "VP8 ") {
    // Lossy VP8: dimensions at offset 26-29 (little-endian 16-bit)
    // Frame header starts at offset 20, check for frame tag 0x9D012A at +3
    if (buffer.length < 30) return null;
    if (buffer[23] !== 0x9d || buffer[24] !== 0x01 || buffer[25] !== 0x2a) {
      return null;
    }
    const width = buffer.readUInt16LE(26) & 0x3fff;
    const height = buffer.readUInt16LE(28) & 0x3fff;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  if (chunkType === "VP8L") {
    // Lossless VP8L: signature byte at offset 21 (0x2F), then 4 bytes at 22-25
    if (buffer.length < 25) return null;
    if (buffer[21] !== 0x2f) return null;
    const bits = buffer.readUInt32LE(22);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  if (chunkType === "VP8X") {
    // Extended WebP: canvas width at offset 24-26 (24-bit LE + 1),
    // canvas height at offset 27-29 (24-bit LE + 1)
    if (buffer.length < 30) return null;
    const width =
      (buffer[24] | (buffer[25] << 8) | (buffer[26] << 16)) + 1;
    const height =
      (buffer[27] | (buffer[28] << 8) | (buffer[29] << 16)) + 1;
    if (width === 0 || height === 0) return null;
    return { width, height };
  }

  return null;
}
