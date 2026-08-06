import { test, expect, type Page } from "@playwright/test";
import { expectToast, safeWait, uniqueId } from "../helpers";

// ---------------------------------------------------------------------------
// Contact (CRM Person) — company linking via CompanyPicker + inline create
// ---------------------------------------------------------------------------
//
// WHY THIS TEST EXISTS
// The company field on the contact form used to be free text, so the stored
// CompanyAssociation kept `companyId: ""` and the contact was invisible to
// findWarmPaths(), which matches on companyId exactly. Unit tests cover the
// picker, the form state and findOrCreateCompany in isolation (all mocked).
// What they CANNOT prove is that the real Next.js runtime path works: server
// action -> Prisma write -> JSON round-trip on Person.companies -> reload.
//
// This test is that integration guard. It creates a contact, creates a brand
// new company INLINE from the picker (the company must not exist beforehand,
// hence the unique id), saves, reopens the contact and asserts the link
// survived the round-trip.
//
// No hard delete exists for Person (GDPR design) — cleanup archives the contact.

async function navigateToContacts(page: Page) {
  await page.goto("/dashboard/contacts");
  await page.waitForLoadState("domcontentloaded");
  await page
    .getByRole("button", { name: "Add Contact" })
    .first()
    .waitFor({ state: "visible" });
}

test.describe("Contact (CRM Person) — company link", () => {
  test("creates a company inline from the contact form and persists the link", async ({
    page,
  }) => {
    const uid = uniqueId();
    const firstName = `E2E${uid}`;
    const lastName = "CompanyLink";
    const fullName = `${firstName} ${lastName}`;
    // Unique so the company cannot already exist -> the create item is offered.
    const companyName = `E2E Firma ${uid}`;

    await navigateToContacts(page);

    // --- create the contact with an inline-created company ------------------
    await page.getByRole("button", { name: "Add Contact" }).first().click();

    const sheet = page.getByRole("dialog");
    await sheet.getByLabel("First Name").fill(firstName);
    await sheet.getByLabel("Last Name").fill(lastName);
    // createPerson requires at least one email (crm.errors.emailRequired).
    await sheet
      .getByPlaceholder("email@example.com")
      .fill(`${firstName.toLowerCase()}@e2e.test`);

    // Add a company row, then drive the picker (Popover + cmdk Command).
    await sheet.getByRole("button", { name: "Company" }).first().click();
    await sheet.getByRole("combobox", { name: "Select company..." }).click();
    await page.getByPlaceholder("Search companies...").fill(companyName);

    // Nothing matches a unique name -> the create item must be offered.
    const createItem = page.getByRole("option", { name: new RegExp(`Create`) });
    await expect(createItem).toBeVisible();
    await createItem.click();

    // The trigger now shows the created company (proves it was selected).
    await expect(
      sheet.getByRole("combobox", { name: "Select company..." }),
    ).toContainText(companyName);

    await sheet.getByRole("button", { name: "Add Contact" }).click();
    await expectToast(page, /contact created/i);

    // --- reopen and assert the link survived the round-trip -----------------
    // Row click routes to /contacts/[id] (same pattern as contact-crud.spec).
    await page.getByText(fullName).first().click();
    await expect(
      page.getByRole("heading", { name: fullName, level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // The detail page lists the linked company — proof the companyId survived
    // the Person.companies JSON round-trip.
    await expect(page.getByText(companyName).first()).toBeVisible();

    // Cleanup: archive (no hard delete for Person — GDPR design).
    await page.getByRole("button", { name: "Archive" }).click();
    await safeWait(page, {
      condition: async () => {
        await expect(
          page.getByRole("button", { name: "Reactivate" }),
        ).toBeVisible();
      },
    });
  });
});
