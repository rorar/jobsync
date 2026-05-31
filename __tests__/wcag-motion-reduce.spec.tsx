/**
 * WCAG §2b regression guards (Welle 0 a11y pass):
 *  - P-4: AlertDialog overlay/content + Toast must carry `motion-reduce:` so
 *    prefers-reduced-motion users don't get the zoom/slide animations.
 *  - P-3: KanbanCard amber "due" badges must use the higher-contrast dark
 *    shades (no `/50` alpha that drops below 4.5:1).
 *
 * These are className-level guards — cheap insurance against a future Shadcn
 * primitive re-sync silently dropping the a11y utilities. Source files are read
 * directly so the test is independent of Radix portal/render quirks.
 */
import "@testing-library/jest-dom";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("WCAG P-4 — prefers-reduced-motion on animated primitives", () => {
  it("alert-dialog overlay and content disable animation under motion-reduce", () => {
    const src = read("src/components/ui/alert-dialog.tsx");
    const motionReduceLines = src
      .split("\n")
      .filter((l) => l.includes("animate-in") && l.includes("motion-reduce:"));
    // Both the overlay and the content animate → both must opt out.
    expect(motionReduceLines.length).toBeGreaterThanOrEqual(2);
  });

  it("toast variants disable animation under motion-reduce", () => {
    const src = read("src/components/ui/toast.tsx");
    expect(src).toMatch(/animate-in[\s\S]*motion-reduce:animate-none/);
  });
});

describe("WCAG P-3 — KanbanCard amber badge dark contrast", () => {
  it("does not use the low-contrast amber-900/50 + amber-300 dark combo", () => {
    const src = read("src/components/kanban/KanbanCard.tsx");
    expect(src).not.toContain("dark:bg-amber-900/50");
    expect(src).not.toContain("dark:text-amber-300");
    expect(src).toContain("dark:text-amber-200");
  });
});

describe("WCAG A02 — SMTP from-address autocomplete", () => {
  it("the from-address email input declares autoComplete=email", () => {
    const src = read("src/components/settings/SmtpSettings.tsx");
    // The fromAddress Input block must carry autoComplete="email".
    const fromBlock = src.slice(
      src.indexOf('id="smtp-from"'),
      src.indexOf('id="smtp-from"') + 300,
    );
    expect(fromBlock).toContain('autoComplete="email"');
  });
});
