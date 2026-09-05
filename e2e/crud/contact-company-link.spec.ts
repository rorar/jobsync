import { test, expect, type Page } from "@playwright/test";
import { expectToast, safeWait, uniqueId } from "../helpers";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

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

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24 / E2E-B25)
// ---------------------------------------------------------------------------
//
// The inline create in the CompanyPicker is the POINT of this test — it must
// write a real `Company` row, or there would be no companyId for the assertion
// below to find. Archiving the Person does not take that row with it: the
// association lives as JSON on `Person.companies`, so there is no cascade and
// nothing else in this file removes it. Measured on the 2026-09-05 run, where
// this test PASSED and `E2E Firma mtov6uq4w0` was still in the database
// afterwards.
//
// One row, one test, and it still gets the array-plus-hook shape rather than a
// scalar and an inline delete: the inline path is the one a failed assertion
// skips, and the assertions here sit BETWEEN the create and the end of the
// body. See `question-crud.spec.ts` for the same argument at more length.
let createdCompanies: string[] = [];

test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // navigates to an admin table. Buy the extra time explicitly.
  test.setTimeout(testInfo.timeout + 30_000);

  // Swap the registry out BEFORE the first await — clearing afterwards would
  // carry entries into the next test if a delete throws.
  const companies = createdCompanies;
  createdCompanies = [];
  if (companies.length === 0) return;

  // Never throws, navigates itself, warns about anything that survives.
  // `deleteCompanyById` (company.actions.ts:337-375) refuses only while a Job
  // or WorkExperience references the row; an archived Person does not, so this
  // succeeds with the contact left exactly as the body left it.
  await sweepReferenceGroups(
    page,
    [{ tab: ADMIN_TAB.company, names: companies }],
    "contact-company-link",
  );
});

test.describe("Contact (CRM Person) — company link", () => {
  test.beforeEach(async ({ context }) => {
    // Every label this spec drives is English ("Add Contact", "First Name",
    // "Archive"), and so is the `aria-label="Delete"` the teardown above clicks.
    // That dependency was implicit until the teardown made it load-bearing:
    // under a different NEXT_LOCALE the body fails, but the SWEEP would fail
    // silently and report a leak that is really a locale mismatch.
    await context.addCookies([
      { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
    ]);
  });

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
    // Registered BEFORE the click that writes the row. The click is what calls
    // findOrCreateCompany; a create that then fails the trigger assertion below
    // has still left a Company behind, and only a registered name is swept.
    createdCompanies.push(companyName);
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
