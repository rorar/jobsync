/**
 * SVG Sanitizer
 *
 * Strips dangerous content from SVG files to prevent XSS attacks:
 * - <script> elements
 * - <foreignObject> elements
 * - on* event handler attributes
 * - javascript: URIs
 * - External xlink:href / href references (keeps internal #fragment refs)
 * - <!DOCTYPE declarations
 *
 * Used as part of the logo download pipeline before storing SVGs on disk.
 */

/**
 * Sanitize an SVG buffer by stripping dangerous content.
 *
 * @param input - Raw SVG content as a Buffer
 * @returns Sanitized SVG content as a Buffer
 */
export function sanitizeSvg(input: Buffer): Buffer {
  let svg = input.toString("utf8");

  // Strip <!DOCTYPE declarations (can reference external DTDs)
  svg = svg.replace(/<!DOCTYPE[^>]*>/gi, "");

  // Strip <script> elements and their content
  svg = svg.replace(/<script[\s\S]*?<\/script>/gi, "");
  // Self-closing <script />
  svg = svg.replace(/<script[^>]*\/>/gi, "");

  // Strip <foreignObject> elements and their content
  svg = svg.replace(/<foreignObject[\s\S]*?<\/foreignObject>/gi, "");
  // Self-closing <foreignObject />
  svg = svg.replace(/<foreignObject[^>]*\/>/gi, "");

  // Strip on* event handler attributes (onclick, onload, onerror, etc.)
  svg = svg.replace(/\s+on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "");

  // Strip javascript: URIs in attribute values
  svg = svg.replace(
    /(\s+(?:href|xlink:href|src|action|formaction|data)\s*=\s*)(?:"javascript:[^"]*"|'javascript:[^']*')/gi,
    '$1""',
  );

  // Strip external xlink:href and href references (keep internal #fragment refs)
  // Match xlink:href="..." or href="..." where value does NOT start with #
  //
  // SECURITY: data:image/svg+xml is explicitly BLOCKED even though it is an image
  // MIME type. An SVG embedded via data:image/svg+xml executes in the same origin
  // as the parent SVG, inheriting its event handler context. An attacker can craft
  // a base64-encoded inner SVG with onload="alert(1)" that fires when the outer SVG
  // loads. Only raster MIME types (png, jpeg, gif, webp) are safe as inline data URIs.
  svg = svg.replace(
    /(\s+)(xlink:href|href)\s*=\s*"(?!#)([^"]*)"/gi,
    (match, space, attr, value) => {
      // Allow data: URIs only for RASTER image MIME types (NOT svg+xml — XSS vector)
      if (/^data:image\/(png|jpeg|gif|webp);/i.test(value)) return match;
      return `${space}${attr}=""`;
    },
  );
  svg = svg.replace(
    /(\s+)(xlink:href|href)\s*=\s*'(?!#)([^']*)'/gi,
    (match, space, attr, value) => {
      // Allow data: URIs only for RASTER image MIME types (NOT svg+xml — XSS vector)
      if (/^data:image\/(png|jpeg|gif|webp);/i.test(value)) return match;
      return `${space}${attr}=''`;
    },
  );

  return Buffer.from(svg, "utf8");
}
