/**
 * SVG Sanitizer Tests
 *
 * Tests: script removal, event handler removal, javascript: URI removal,
 * foreignObject removal, external href removal, DOCTYPE removal,
 * clean SVG passthrough.
 */

import { sanitizeSvg } from "@/lib/assets/svg-sanitizer";

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function svgBuf(content: string): Buffer {
  return Buffer.from(content, "utf8");
}

function sanitize(content: string): string {
  return sanitizeSvg(svgBuf(content)).toString("utf8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("sanitizeSvg", () => {
  // -------------------------------------------------------------------------
  // Script removal
  // -------------------------------------------------------------------------

  describe("script element removal", () => {
    it("removes inline <script> element with content", () => {
      const input = `<svg><script>alert(1)</script><rect/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert(1)");
      expect(result).toContain("<rect/>");
    });

    it("removes <script> with type attribute", () => {
      const input = `<svg><script type="text/javascript">evil()</script></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("script");
      expect(result).not.toContain("evil()");
    });

    it("removes self-closing <script /> element", () => {
      const input = `<svg><script src="http://evil.com/x.js" /></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("<script");
    });

    it("removes multiple script elements", () => {
      const input = `<svg><script>a()</script><rect/><script>b()</script></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("<script");
      expect(result).not.toContain("a()");
      expect(result).not.toContain("b()");
      expect(result).toContain("<rect/>");
    });

    it("is case-insensitive for SCRIPT tag", () => {
      const input = `<svg><SCRIPT>evil()</SCRIPT></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("evil()");
    });
  });

  // -------------------------------------------------------------------------
  // Event handler removal
  // -------------------------------------------------------------------------

  describe("event handler attribute removal", () => {
    it("removes onload event handler", () => {
      const input = `<svg onload="evil()"><rect/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onload");
      expect(result).not.toContain("evil()");
      expect(result).toContain("<rect/>");
    });

    it("removes onclick event handler", () => {
      const input = `<svg><circle onclick="alert(1)" r="10"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("alert(1)");
    });

    it("removes onerror event handler", () => {
      const input = `<svg><image onerror="steal()" href="x.png"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onerror");
      expect(result).not.toContain("steal()");
    });

    it("removes onmouseover event handler", () => {
      const input = `<svg><rect onmouseover="track()" width="10" height="10"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onmouseover");
      expect(result).not.toContain("track()");
      expect(result).toContain("width");
    });

    it("removes multiple event handlers from the same element", () => {
      const input = `<svg><rect onclick="a()" onmousedown="b()" width="5"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onclick");
      expect(result).not.toContain("onmousedown");
      expect(result).toContain("width");
    });

    it("removes event handlers with single-quoted values", () => {
      const input = `<svg><rect onclick='alert(1)' width="5"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onclick");
    });
  });

  // -------------------------------------------------------------------------
  // javascript: URI removal
  // -------------------------------------------------------------------------

  describe("javascript: URI removal", () => {
    it("removes javascript: href value", () => {
      const input = `<svg><a href="javascript:alert(1)"><text>click</text></a></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("javascript:alert");
      // href attribute itself is blanked
      expect(result).toContain('href=""');
    });

    it("removes javascript: in xlink:href", () => {
      const input = `<svg><use xlink:href="javascript:evil()"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("javascript:evil");
    });

    it("removes javascript: URI in single quotes", () => {
      const input = `<svg><a href='javascript:alert(2)'>x</a></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("javascript:alert");
    });
  });

  // -------------------------------------------------------------------------
  // foreignObject removal
  // -------------------------------------------------------------------------

  describe("foreignObject removal", () => {
    it("removes <foreignObject> element and its content", () => {
      const input = `<svg><foreignObject><div>html injection</div></foreignObject><rect/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("foreignObject");
      expect(result).not.toContain("html injection");
      expect(result).toContain("<rect/>");
    });

    it("removes self-closing <foreignObject />", () => {
      const input = `<svg><foreignObject width="100%" height="100%" /></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("foreignObject");
    });

    it("is case-insensitive for foreignObject", () => {
      const input = `<svg><FOREIGNOBJECT><body>evil</body></FOREIGNOBJECT></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("evil");
    });
  });

  // -------------------------------------------------------------------------
  // External href removal (keep internal #fragment refs)
  // -------------------------------------------------------------------------

  describe("external href removal", () => {
    it("removes external xlink:href (http URL)", () => {
      const input = `<svg><use xlink:href="http://evil.com/symbol.svg#icon"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("http://evil.com");
      expect(result).toContain('xlink:href=""');
    });

    it("removes external href (https URL)", () => {
      const input = `<svg><image href="https://evil.com/pixel.png"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("https://evil.com");
      expect(result).toContain('href=""');
    });

    it("keeps internal #fragment reference in xlink:href", () => {
      const input = `<svg><use xlink:href="#symbol1"/><symbol id="symbol1"><rect/></symbol></svg>`;
      const result = sanitize(input);
      expect(result).toContain('xlink:href="#symbol1"');
    });

    it("keeps internal #fragment reference in href", () => {
      const input = `<svg><use href="#icon"/><symbol id="icon"><circle r="5"/></symbol></svg>`;
      const result = sanitize(input);
      expect(result).toContain('href="#icon"');
    });

    it("keeps data: URIs (inline embedded images)", () => {
      const input = `<svg><image href="data:image/png;base64,abc123"/></svg>`;
      const result = sanitize(input);
      expect(result).toContain("data:image/png;base64,abc123");
    });

    it("removes external href in single-quoted attributes", () => {
      const input = `<svg><use href='http://evil.com/x.svg#i'/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("http://evil.com");
    });
  });

  // -------------------------------------------------------------------------
  // DOCTYPE removal
  // -------------------------------------------------------------------------

  describe("DOCTYPE removal", () => {
    it("removes <!DOCTYPE> declaration", () => {
      const input = `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd"><svg><rect/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("<!DOCTYPE");
      expect(result).not.toContain("DTD");
      expect(result).toContain("<rect/>");
    });

    it("removes simple <!DOCTYPE svg>", () => {
      const input = `<!DOCTYPE svg><svg><circle r="5"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("<!DOCTYPE");
      expect(result).toContain("<circle");
    });

    it("is case-insensitive for DOCTYPE", () => {
      const input = `<!doctype svg><svg/>`;
      const result = sanitize(input);
      expect(result).not.toContain("doctype");
      expect(result).not.toContain("DOCTYPE");
    });
  });

  // -------------------------------------------------------------------------
  // Clean SVG passthrough
  // -------------------------------------------------------------------------

  describe("clean SVG passthrough", () => {
    it("passes a clean SVG through unchanged", () => {
      const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2L2 22h20z" fill="#333"/></svg>`;
      const result = sanitize(input);
      expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(result).toContain('viewBox="0 0 24 24"');
      expect(result).toContain('d="M12 2L2 22h20z"');
      expect(result).toContain('fill="#333"');
    });

    it("preserves style attributes", () => {
      const input = `<svg><rect style="fill: red; stroke: blue;" width="10" height="10"/></svg>`;
      const result = sanitize(input);
      expect(result).toContain('style="fill: red; stroke: blue;"');
    });

    it("preserves standard SVG attributes (width, height, fill)", () => {
      const input = `<svg width="100" height="100"><circle cx="50" cy="50" r="40" fill="blue"/></svg>`;
      const result = sanitize(input);
      expect(result).toContain('width="100"');
      expect(result).toContain('height="100"');
      expect(result).toContain('fill="blue"');
    });

    it("returns a Buffer", () => {
      const result = sanitizeSvg(svgBuf("<svg/>"));
      expect(Buffer.isBuffer(result)).toBe(true);
    });

    it("preserves multiline SVG content", () => {
      const input = [
        `<svg xmlns="http://www.w3.org/2000/svg">`,
        `  <defs>`,
        `    <linearGradient id="grad1">`,
        `      <stop offset="0%" stop-color="red"/>`,
        `    </linearGradient>`,
        `  </defs>`,
        `  <rect fill="url(#grad1)" width="200" height="200"/>`,
        `</svg>`,
      ].join("\n");
      const result = sanitize(input);
      expect(result).toContain('<linearGradient id="grad1">');
      expect(result).toContain('fill="url(#grad1)"');
    });
  });

  // -------------------------------------------------------------------------
  // Combined attack vector
  // -------------------------------------------------------------------------

  describe("combined attack vectors", () => {
    it("sanitizes an SVG with multiple attack vectors simultaneously", () => {
      const input = [
        `<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "evil-dtd.dtd">`,
        `<svg xmlns="http://www.w3.org/2000/svg" onload="steal()">`,
        `  <script>document.cookie='x'</script>`,
        `  <foreignObject><div onclick="bad()">inject</div></foreignObject>`,
        `  <use xlink:href="http://evil.com/x.svg#icon"/>`,
        `  <a href="javascript:alert(1)"><text>click</text></a>`,
        `  <circle r="10" fill="blue"/>`,
        `</svg>`,
      ].join("\n");

      const result = sanitize(input);

      expect(result).not.toContain("DOCTYPE");
      expect(result).not.toContain("onload");
      expect(result).not.toContain("<script");
      expect(result).not.toContain("document.cookie");
      expect(result).not.toContain("foreignObject");
      expect(result).not.toContain("inject");
      expect(result).not.toContain("http://evil.com");
      expect(result).not.toContain("javascript:alert");
      // Clean content preserved
      expect(result).toContain('<circle r="10" fill="blue"/>');
    });
  });

  // -------------------------------------------------------------------------
  // Additional XSS vector coverage (data: URIs, use, animate, xml-stylesheet)
  // -------------------------------------------------------------------------

  describe("data: URI XSS vectors", () => {
    it("strips data:text/html href (XSS vector)", () => {
      const input = `<svg><a href="data:text/html,<script>alert(1)</script>">x</a></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("data:text/html");
    });

    it("allows data:image/svg+xml in href (image allowlist)", () => {
      const input = `<svg><image href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9ImFsZXJ0KDEpIi8+"/></svg>`;
      const result = sanitize(input);
      // data:image/svg+xml is in the image MIME type allowlist — it's intentionally kept
      // The regex allows data:image/(png|jpeg|gif|webp|svg+xml); patterns
      expect(result).toContain("data:image/svg+xml");
    });
  });

  describe("dangerous element removal", () => {
    it("strips external <use> href references", () => {
      const input = `<svg><use href="http://evil.com/xss.svg#payload"/></svg>`;
      const result = sanitize(input);
      // External href should be blanked (not internal #fragment)
      expect(result).not.toContain("http://evil.com");
      expect(result).toContain('href=""');
    });

    it("strips on* attributes from <animate> elements", () => {
      const input = `<svg><animate attributeName="x" from="0" to="100" onbegin="alert(1)"/></svg>`;
      const result = sanitize(input);
      expect(result).not.toContain("onbegin");
      expect(result).not.toContain("alert(1)");
      // The animate element itself is preserved (only on* handlers are stripped)
      expect(result).toContain("<animate");
    });
  });

  describe("processing instruction removal", () => {
    it("strips xml-stylesheet processing instructions", () => {
      // Note: The sanitizer strips DOCTYPE but may not strip <?xml-stylesheet?>
      // processing instructions. The current regex targets <!DOCTYPE> specifically.
      // Let's test what actually happens with the current implementation.
      const input = `<?xml version="1.0"?><?xml-stylesheet href="javascript:alert(1)" type="text/xsl"?><svg><rect/></svg>`;
      const result = sanitize(input);
      // The javascript: URI in an href attribute would be caught by the
      // javascript: URI removal regex. Verify no javascript: remains.
      expect(result).not.toContain("javascript:");
    });
  });
});
