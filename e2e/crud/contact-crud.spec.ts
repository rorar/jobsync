import { test, expect, type Page } from "@playwright/test";
import { expectToast, safeWait, uniqueId } from "../helpers";

// ---------------------------------------------------------------------------
// Contact (CRM Person) — PersonDetail holiday-info integration (D-TZ)
// ---------------------------------------------------------------------------
//
// WHY THIS TEST EXISTS / WHAT IT ASSERTS
// The PersonDetail "holiday badge" is date-conditional: HolidayBadge renders
// nothing on a normal business day and only appears when *today* is a public
// holiday or weekend in the contact's country. Asserting badge *visibility*
// would therefore be flaky (pass on weekends, fail on weekdays). The badge's
// rendering logic + the server action are already covered deterministically at
// the unit level (HolidayBadge.spec.tsx, reference-data.actions.spec.ts).
//
// What CANNOT be unit-tested (those specs mock the services) is that the REAL
// holiday path runs end-to-end in the Next.js runtime: creating a contact with
// an address country and opening its detail page invokes getPersonHolidayInfo →
// HolidayService.getPrimaryTimezone → dateInTimeZone → date-holidays. This test
// is that integration guard: it proves the D-TZ server path does not throw and
// the detail page renders. It is fully deterministic regardless of the run date.
//
// No hard delete exists for Person (GDPR design) — cleanup archives the contact.

async function navigateToContacts(page: Page) {
  await page.goto("/dashboard/contacts");
  await page.waitForLoadState("domcontentloaded");
  await page.getByRole("button", { name: "Add Contact" }).first().waitFor({ state: "visible" });
}

async function createContactWithCountry(
  page: Page,
  firstName: string,
  lastName: string,
) {
  // Open the create sheet (header button — the only "Add Contact" while closed).
  await page.getByRole("button", { name: "Add Contact" }).first().click();

  const sheet = page.getByRole("dialog");
  await sheet.getByLabel("First Name").fill(firstName);
  await sheet.getByLabel("Last Name").fill(lastName);
  // createPerson requires at least one email (crm.errors.emailRequired).
  await sheet.getByPlaceholder("email@example.com").fill(`${firstName.toLowerCase()}@e2e.test`);

  // Drive the CountrySelect combobox (Popover + cmdk Command).
  await sheet.getByRole("combobox", { name: "Select country..." }).click();
  await page.getByPlaceholder("Search countries...").fill("Germany");
  await page.getByRole("option", { name: /Germany/i }).first().click();

  // Submit (the submit button inside the sheet is also labelled "Add Contact").
  await sheet.getByRole("button", { name: "Add Contact" }).click();
  await expectToast(page, /contact created/i);
}

test.describe("Contact (CRM Person) — holiday integration", () => {
  test("creates a contact with a country and renders its detail page (D-TZ path)", async ({
    page,
  }) => {
    const uid = uniqueId();
    const firstName = `E2E${uid}`;
    const lastName = "Holiday";
    const fullName = `${firstName} ${lastName}`;

    await navigateToContacts(page);
    await createContactWithCountry(page, firstName, lastName);

    // Open the new contact's detail page (row click routes to /contacts/[id]).
    await page.getByText(fullName).first().click();

    // The detail page rendered → getPersonHolidayInfo (real D-TZ path) executed
    // without throwing. This is the deterministic assertion.
    await expect(
      page.getByRole("heading", { name: fullName, level: 1 }),
    ).toBeVisible({ timeout: 10000 });

    // Cleanup: archive (no hard delete for Person — GDPR design).
    await page.getByRole("button", { name: "Archive" }).click();
    await safeWait(page, {
      condition: async () => {
        await expect(page.getByRole("button", { name: "Reactivate" })).toBeVisible();
      },
    });
  });
});
