import { readFileSync } from "fs";
import path from "path";

/**
 * Pins the contrast of the destructive colour pair in both themes.
 *
 * UI-B4: `--destructive` used to carry two roles — the fill behind
 * `--destructive-foreground` on a destructive button, and the colour of
 * `text-destructive` (82 call sites). One value cannot satisfy both, and the
 * failure is not a near miss: sweeping the lightness at the original saturation,
 * the text is still at 3.93:1 when L=50% and the button foreground has already
 * fallen to 4.24:1 by L=55%. The window is empty, so the token was split.
 *
 * This test recomputes the ratios from `globals.css` itself rather than
 * restating them, so editing a token here is what fails — not a stale copy of a
 * number. It is a build-time guard for a property nothing else checks: Jest does
 * not render CSS, and the typechecker does not read custom properties.
 */

const CSS = readFileSync(
  path.join(__dirname, "..", "src", "app", "globals.css"),
  "utf-8",
);

/** `H S% L%` as Tailwind writes it into an `hsl(var(--x))` wrapper. */
type Hsl = { h: number; s: number; l: number };
type Rgb = [number, number, number];

/** Strip comments first: the explanatory block above `:root` names these tokens. */
function block(name: ":root" | ".dark"): string {
  const withoutComments = CSS.replace(/\/\*[\s\S]*?\*\//g, "");
  const start = withoutComments.indexOf(`${name} {`);
  if (start === -1) throw new Error(`no ${name} block in globals.css`);
  const end = withoutComments.indexOf("}", start);
  return withoutComments.slice(start, end);
}

function token(scope: ":root" | ".dark", name: string): Hsl {
  const re = new RegExp(`--${name}:\\s*([\\d.]+)\\s+([\\d.]+)%\\s+([\\d.]+)%`);
  const m = block(scope).match(re);
  if (!m) throw new Error(`--${name} not found in ${scope}`);
  return { h: Number(m[1]), s: Number(m[2]), l: Number(m[3]) };
}

function toRgb({ h, s, l }: Hsl): Rgb {
  const sN = s / 100;
  const lN = l / 100;
  const c = (1 - Math.abs(2 * lN - 1)) * sN;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1
      ? [c, x, 0]
      : hp < 2
        ? [x, c, 0]
        : hp < 3
          ? [0, c, x]
          : hp < 4
            ? [0, x, c]
            : hp < 5
              ? [x, 0, c]
              : [c, 0, x];
  const m = lN - c / 2;
  return [r1 + m, g1 + m, b1 + m];
}

/** WCAG 2.x relative luminance. */
function luminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map((v) =>
    v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4),
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** `bg-destructive/10` composited over the page background. */
function over(fg: Rgb, bg: Rgb, alpha: number): Rgb {
  return fg.map((c, i) => c * alpha + bg[i] * (1 - alpha)) as Rgb;
}

const AA_TEXT = 4.5;
/** WCAG 1.4.11: non-text contrast, which is what a border carries. */
const AA_NON_TEXT = 3.0;

describe.each([":root", ".dark"] as const)(
  "destructive colour contrast (%s)",
  (scope) => {
    const surface = toRgb(token(scope, "destructive"));
    const onSurface = toRgb(token(scope, "destructive-foreground"));
    const text = toRgb(token(scope, "destructive-text"));
    const background = toRgb(token(scope, "background"));

    it("puts the button label over the destructive fill at AA", () => {
      expect(contrast(onSurface, surface)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it("puts destructive TEXT over the page background at AA", () => {
      expect(contrast(text, background)).toBeGreaterThanOrEqual(AA_TEXT);
    });

    it("keeps destructive text readable on a 10% destructive tint", () => {
      // `hover:bg-destructive/10` under `text-destructive`, e.g.
      // src/components/inside-track/ReferralActionBar.tsx:89.
      expect(contrast(text, over(surface, background, 0.1))).toBeGreaterThanOrEqual(
        AA_TEXT,
      );
    });

    it("keeps border-destructive distinguishable from the background", () => {
      expect(contrast(surface, background)).toBeGreaterThanOrEqual(AA_NON_TEXT);
    });

    it("keeps the two roles distinct, so a future edit cannot quietly re-merge them", () => {
      // Not a contrast rule: it fails the day someone "simplifies" the two tokens
      // back into one, which is exactly how this defect is reintroduced.
      expect(text).not.toEqual(surface);
    });
  },
);
