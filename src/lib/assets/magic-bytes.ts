/**
 * Magic Byte Validation
 *
 * Validates that file content matches the declared MIME type by checking
 * the file header (magic bytes). Prevents MIME type spoofing attacks.
 *
 * Supported formats: PNG, JPEG, GIF, WebP, SVG, ICO.
 */

/** Accepted MIME types for logo assets */
export const ACCEPTED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

/**
 * Validate that the buffer's magic bytes match the declared MIME type.
 *
 * @param buffer - File content to validate
 * @param declaredMimeType - MIME type from Content-Type header
 * @returns Validation result with detected MIME type
 */
export function validateMagicBytes(
  buffer: Buffer,
  declaredMimeType: string,
): { valid: boolean; detectedMime?: string } {
  if (buffer.length < 4) {
    return { valid: false };
  }

  const detectedMime = detectMimeFromBytes(buffer);
  if (!detectedMime) {
    return { valid: false };
  }

  // Normalize declared MIME — treat x-icon and vnd.microsoft.icon as equivalent
  const normalizedDeclared = normalizeMime(declaredMimeType);
  const normalizedDetected = normalizeMime(detectedMime);

  return {
    valid: normalizedDeclared === normalizedDetected,
    detectedMime,
  };
}

/**
 * Detect MIME type from file header bytes.
 */
function detectMimeFromBytes(buffer: Buffer): string | null {
  // PNG: 89 50 4E 47
  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47
  ) {
    return "image/png";
  }

  // JPEG: FF D8 FF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }

  // GIF: 47 49 46 38 (GIF8)
  if (
    buffer[0] === 0x47 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x38
  ) {
    return "image/gif";
  }

  // WebP: RIFF at offset 0, WEBP at offset 8
  if (
    buffer.length >= 12 &&
    buffer[0] === 0x52 &&
    buffer[1] === 0x49 &&
    buffer[2] === 0x46 &&
    buffer[3] === 0x46 &&
    buffer[8] === 0x57 &&
    buffer[9] === 0x45 &&
    buffer[10] === 0x42 &&
    buffer[11] === 0x50
  ) {
    return "image/webp";
  }

  // ICO: 00 00 01 00
  if (
    buffer[0] === 0x00 &&
    buffer[1] === 0x00 &&
    buffer[2] === 0x01 &&
    buffer[3] === 0x00
  ) {
    return "image/x-icon";
  }

  // SVG: check first 512 bytes for <svg (<?xml alone is not sufficient — could be any XML)
  const head = buffer.subarray(0, Math.min(512, buffer.length)).toString("utf8");
  if (head.includes("<svg")) {
    return "image/svg+xml";
  }

  return null;
}

/**
 * Normalize MIME types for comparison.
 * ICO has two valid MIME types — treat them as equivalent.
 */
function normalizeMime(mime: string): string {
  const lower = mime.toLowerCase().trim();
  if (lower === "image/vnd.microsoft.icon") return "image/x-icon";
  return lower;
}
