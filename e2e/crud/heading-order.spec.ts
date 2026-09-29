import { test, expect, type Page } from "@playwright/test";

/**
 * Measures the heading outline of every dashboard route that can be reached
 * without a seeded id, and fails if any heading sits more than one level below
 * the heading before it.
 *
 * WHY THIS EXISTS. The heading work on 2026-09-08/09 was done by reading JSX,
 * and reading got it wrong twice in ways that only rendering could settle:
 *
 *  - A grep for `<h1`/`<h3` over `page.tsx` missed every heading that a
 *    COMPONENT emits — `CardTitle` renders an `h3` and the source says
 *    `<CardTitle>`. Six pages were reported as having no title when they had
 *    one at the wrong level, and the first repair added a second heading with
 *    the same text, which Playwright's strict mode caught.
 *  - Promoting one heading silently opened a gap under another: `JobDetails`'s
 *    "AI match analysis" went h4 -> h2 while `MatchDetails` stayed at h5.
 *
 * Both are invisible to the typechecker and to Jest, and jest-axe only sees the
 * fragment a component test renders — never a whole page with its layout chrome.
 * This is the only check that reads the assembled document.
 *
 * WHAT IT DOES NOT COVER. Routes needing an id (`myjobs/[id]`,
 * `profile/resume/[id]`, `contacts/[id]`, `referrals/[id]`,
 * `automations/[id]`) are absent — they need fixtures this spec does not own.
 * Headings inside dialogs, sheets and popovers are absent too, deliberately:
 * they portal into an `aria-modal` subtree that is not part of the page
 * outline, and pulling them into this sequence would report violations that no
 * assistive technology experiences.
 */

const ROUTES = [
  "/dashboard",
  "/dashboard/myjobs",
  "/dashboard/activities",
  "/dashboard/tasks",
  "/dashboard/questions",
  "/dashboard/profile",
  "/dashboard/automations",
  "/dashboard/staging",
  "/dashboard/admin",
  "/dashboard/settings",
  "/dashboard/contacts",
  "/dashboard/crm-tasks",
  "/dashboard/interviews",
  "/dashboard/referrals",
  "/dashboard/developer",
] as const;

type Heading = { level: number; text: string };

async function outline(page: Page): Promise<Heading[]> {
  return page.evaluate(() => {
    const isVisible = (el: Element) => {
      const style = window.getComputedStyle(el);
      if (style.display === "none" || style.visibility === "hidden") return false;
      // `sr-only` is visually hidden but IS in the accessibility tree, so it
      // counts. Only skip what is removed from the tree entirely.
      return !el.closest('[aria-hidden="true"]');
    };
    return Array.from(document.querySelectorAll("h1,h2,h3,h4,h5,h6"))
      .filter((el) => !el.closest("[role='dialog'],[role='alertdialog']"))
      .filter(isVisible)
      .map((el) => ({
        level: Number(el.tagName[1]),
        text: (el.textContent ?? "").trim().slice(0, 60),
      }));
  });
}

for (const route of ROUTES) {
  test(`heading outline steps by at most one on ${route}`, async ({ page }) => {
    await page.goto(route);
    // The page h1 arrives with the server payload; waiting for the first
    // heading is enough and avoids `networkidle`, which never settles here.
    await page.locator("h1").first().waitFor({ state: "attached", timeout: 20000 });

    const headings = await outline(page);

    // A page with no heading at all is its own defect — every route should at
    // least carry the app title from Header.tsx.
    expect(headings.length, `${route} rendered no headings`).toBeGreaterThan(0);

    const skips: string[] = [];
    for (let i = 1; i < headings.length; i++) {
      const prev = headings[i - 1];
      const cur = headings[i];
      // Going back up is always fine; only a jump DOWN of more than one level
      // is a defect. Same rule as axe-core's heading-order check
      // (lib/checks/navigation/heading-order-after.js).
      if (cur.level > prev.level + 1) {
        skips.push(
          `h${prev.level} "${prev.text}" -> h${cur.level} "${cur.text}"`,
        );
      }
    }

    expect(skips, `${route} skips a heading level`).toEqual([]);
  });
}
