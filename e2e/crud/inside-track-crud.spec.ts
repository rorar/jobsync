import { test, expect, type Page } from "@playwright/test";
import { uniqueId, expectToast, safeWait } from "../helpers";

// ---------------------------------------------------------------------------
// Inside Track (Referral) — lifecycle happy path (Welle 5, Task 5.5)
// ---------------------------------------------------------------------------
//
// WHAT THIS ASSERTS (end-to-end, real Next runtime):
//   record an insider tip → engage → relay → review, driving the new
//   /dashboard/referrals routes + TipCaptureSheet + ReferralWorkspace +
//   ReferralActionBar + ReferralLifecycleRail through the status-gated UI.
//
// SCOPE NOTE: the final commit→reify-Job step (TipReifiesToJob) needs a target
// company + an AlertDialog confirm and is covered DETERMINISTICALLY at the unit
// level (__tests__/referral.actions.spec.ts → commitReferralToApply). Keeping
// it out of this E2E avoids the company-seed + dialog flake on the 8 GB VM while
// still exercising the whole lifecycle UI. The tip here is a pure market tip
// (no target company), so its workspace shows no WarmPathFinder/commit path.
//
// No hard delete exists for a Referral (GDPR design, mirrors Person) — cleanup
// terminalises the tip via Decline.

async function ensureEnglishLocale(page: Page) {
  await page.context().addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
}

async function createTipster(page: Page, fullName: string) {
  await page.goto("/dashboard/contacts");
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Add Contact" }).first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: "Add Contact" }).first().click();

  const sheet = page.getByRole("dialog");
  const [first, ...rest] = fullName.split(" ");
  await sheet.getByLabel("First Name").fill(first);
  await sheet.getByLabel("Last Name").fill(rest.join(" ") || "Tipster");
  await sheet.getByPlaceholder("email@example.com").fill(`${first.toLowerCase()}@e2e.test`);
  await sheet.getByRole("button", { name: "Add Contact" }).click();
  await expectToast(page, /contact created/i);
}

async function recordInsiderTip(page: Page, tipsterName: string) {
  await page.goto("/dashboard/referrals");
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "New tip" }).first().waitFor({ state: "visible" });
  await page.getByRole("button", { name: "New tip" }).first().click();

  const sheet = page.getByRole("dialog");
  // insider_relay is the default kind. Pick the tipster.
  await sheet.getByRole("combobox", { name: "Tipster" }).click();
  const search = page.getByPlaceholder("Search contacts");
  await search.fill(tipsterName.split(" ")[0]);
  await page.getByRole("option", { name: new RegExp(tipsterName, "i") }).first().click();

  await sheet.getByRole("button", { name: "Record tip" }).click();
  await expectToast(page, /tip recorded/i);
}

async function openWorkspace(page: Page, tipsterName: string) {
  await safeWait(page, { selector: "table" });
  await page.getByRole("row", { name: new RegExp(tipsterName, "i") }).first().click();
  await page.waitForLoadState("domcontentloaded");
  // Status display is always present in the workspace.
  await page.getByTestId("referral-status-display").waitFor({ state: "visible" });
}

async function advance(page: Page, buttonName: string, expectedStatus: string) {
  await page.getByRole("button", { name: buttonName }).click();
  // The status display re-renders with the new status badge.
  await expect(page.getByTestId("referral-status-display")).toContainText(
    new RegExp(expectedStatus, "i"),
    { timeout: 10000 },
  );
}

test.describe("Inside Track — referral lifecycle", () => {
  test("records an insider tip and advances open → engaged → relayed → in_review", async ({
    page,
  }) => {
    await ensureEnglishLocale(page);
    const uid = uniqueId();
    const tipster = `E2E${uid} Tipster`;

    await createTipster(page, tipster);
    await recordInsiderTip(page, tipster);
    await openWorkspace(page, tipster);

    // open: shows the insider_relay engage label.
    await expect(page.getByTestId("referral-status-display")).toContainText(/open/i);
    await advance(page, "Send your documents", "engaged");
    await advance(page, "Confirm documents relayed", "relayed");
    await advance(page, "Mark as under review", "in review");

    // Cleanup: terminalise (no hard delete for referrals).
    await page.getByRole("button", { name: "Decline" }).click();
    // Confirm dialog → Continue.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByTestId("referral-status-display")).toContainText(/declined/i, {
      timeout: 10000,
    });
  });
});
