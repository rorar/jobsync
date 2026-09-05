import { test, expect, type Page } from "@playwright/test";
// `expectToast`, not `page.getByText(...)`, for every toast assertion below.
// That is E2E-B20: a page-wide text match is satisfied by ANY element carrying
// the string, and `e2e/helpers/index.ts` records two call sites that were
// provably green without a toast ever appearing. Nothing on the questions page
// renders these strings today, so the conversion closes a latent hazard rather
// than a live one — but it narrows WHERE we look without changing WHAT is
// matched, so it can only turn a false pass into a real one.
import { expectToast, uniqueId } from "../helpers";
import {
  ADMIN_TAB,
  sweepReferenceGroups,
} from "../helpers/admin-reference-cleanup";

// storageState handles authentication — no per-test login needed

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
});

// ---------------------------------------------------------------------------
// Reference-data cleanup (E2E-B24)
// ---------------------------------------------------------------------------
//
// One row, and it still gets the whole pattern. The skill tag typed into the
// Add Question dialog is a `Tag` row that outlives the Question: deleting the
// question unlinks it, it does not remove it. Measured on the 2026-09-05 run,
// where all three tests here PASSED and the tag survived anyway.
//
// WHY AN ARRAY AND A HOOK FOR A SINGLE VALUE
// A scalar and an inline delete would be smaller and would also be wrong in the
// one case teardown exists for. `scripts/check-e2e-residue.sh`'s own header
// names this spec as an example: it "cleans up INLINE at the end of the test
// body — the path a failed assertion skips". The hook runs either way. The
// array costs one character over a scalar and removes the question of what
// happens the day a second tag is added to a body.
//
// WHY THE TAG IS NO LONGER CALLED "TypeScript"
// It was a hardcoded shared name, and the deleter matches by case-insensitive
// SUBSTRING (`rowsByText` → `hasText`). "TypeScript" also matches a row called
// "Advanced TypeScript", so sweeping it could delete a row this spec never
// created — and, in the other direction, a parallel worker asserting the badge
// while this one swept would fail for no reason. `uniqueId()` removes both, and
// e2e/CONVENTIONS.md forbids hardcoded test-data names for the second of them.
let createdTags: string[] = [];

test.afterEach(async ({ page }, testInfo) => {
  // A hook shares the test's 60 s budget (playwright.config.ts:23) and this one
  // navigates to an admin table. Buy the extra time explicitly rather than let
  // a green test start failing on its teardown. Kept small so that a body which
  // has itself become slow still surfaces.
  test.setTimeout(testInfo.timeout + 30_000);

  // Swap the registry out BEFORE the first await: clearing afterwards would
  // keep entries alive into the next test if a delete throws, and clearing in a
  // beforeEach would not run at all under test.skip.
  const tags = createdTags;
  createdTags = [];
  if (tags.length === 0) return;

  // `sweepReferenceGroups` navigates itself and never throws — the Question is
  // already gone by now (all three bodies delete it inline), which is what frees
  // the tag: `deleteTagById` (tag.actions.ts:97-113) refuses while any Job or
  // Question still links it. A question that survived its own delete therefore
  // surfaces here as a warning about the tag, which is the correct order of
  // events even though it names the wrong noun.
  await sweepReferenceGroups(
    page,
    [{ tab: ADMIN_TAB.tag, names: tags }],
    "question-crud",
  );
});

async function navigateToQuestions(page: Page) {
  await page.goto("/dashboard/questions");
  await page.waitForLoadState("domcontentloaded");
  // Wait for the "New Question" button to appear (data has loaded)
  await page
    .getByRole("button", { name: /New Question/ })
    .waitFor({ state: "visible", timeout: 10000 });
}

async function createQuestion(
  page: Page,
  questionText: string,
  answerText: string,
  tagLabel?: string,
) {
  // Click "New Question" button — t("questions.newQuestion") = "New Question"
  await page.getByRole("button", { name: /New Question/ }).click();
  // Dialog title — t("questions.addQuestion") = "Add Question"
  await expect(
    page.getByRole("heading", { name: /Add Question/ }),
  ).toBeVisible();

  // Fill in the question text — placeholder is t("questions.questionPlaceholder") = "Enter your question..."
  await page.getByPlaceholder("Enter your question").fill(questionText);

  // Add a skill tag if provided — TagInput uses a button with text "Search or add a skill..."
  // and an input with placeholder "Type a skill..."
  if (tagLabel) {
    // Registered BEFORE the popover opens, i.e. before anything below can write
    // the row. Either branch of the try/catch further down creates or selects a
    // `Tag` that outlives this dialog, and a branch that writes the row and then
    // fails its follow-up has still leaked one — only a registered name gets
    // cleaned up.
    createdTags.push(tagLabel);
    // Click the tag combobox trigger button. The button text is
    // t("jobs.searchSkill") = "Search or add a skill...". Use getByText to
    // locate it within the dialog context.
    await page.getByText("Search or add a skill").click();
    // Type in the search input (placeholder from t("jobs.typeSkill") = "Type a skill...")
    await page.getByPlaceholder(/Type a skill/).fill(tagLabel);
    // M-T-04 follow-up: replaced waitForTimeout(500) — wait for options list.
    await page.getByRole("option").first().waitFor({ state: "visible", timeout: 5000 }).catch(() => null);
    // Check if the tag already exists as an option, otherwise create it
    // Create option shows as: Create "tagLabel"
    const existingOption = page.getByRole("option", {
      name: tagLabel,
      exact: true,
    });
    const createOption = page.getByRole("option", {
      name: new RegExp(`Create.*${tagLabel}`),
    });
    try {
      await existingOption.waitFor({ state: "visible", timeout: 3000 });
      await existingOption.click();
    } catch {
      await createOption.waitFor({ state: "visible", timeout: 3000 });
      await createOption.click();
    }
    // M-T-04 follow-up: replaced waitForTimeout(300) — wait for options list to close.
    await page.getByRole("option").first().waitFor({ state: "hidden", timeout: 3000 }).catch(() => null);
  }

  // Fill in the answer using Tiptap editor — interact via .tiptap CSS selector
  await page.locator(".tiptap").click();
  await page.locator(".tiptap").fill(answerText);

  // Submit the form — button text is t("questions.save") = "Save"
  await page.getByRole("button", { name: "Save" }).click();

  // Wait for the dialog to close (confirms save completed)
  await expect(
    page.getByRole("heading", { name: /Add Question|Edit Question/ }),
  ).not.toBeVisible({ timeout: 15000 });
}

async function deleteQuestion(page: Page, questionText: string) {
  // Wait for the question to be visible (list may still be loading)
  await expect(
    page.getByText(questionText).first(),
  ).toBeVisible({ timeout: 10000 });

  // Find the card containing the question text, then click its delete button
  const questionCard = page
    .locator("div.border.rounded-lg")
    .filter({ hasText: questionText })
    .first();
  // Click the delete button — aria-label is t("questions.delete") = "Delete"
  await questionCard
    .getByRole("button", { name: /Delete/ })
    .first()
    .click({ force: true });

  // Confirm deletion in alert dialog
  // AlertDialogAction text is t("questions.delete") = "Delete"
  await expect(page.getByRole("alertdialog")).toBeVisible({ timeout: 5000 });
  await page
    .getByRole("alertdialog")
    .getByRole("button", { name: /Delete/ })
    .click({ force: true });
}

test.describe("Question CRUD", () => {
  test("should create a new question", async ({ page }) => {
    const uid = uniqueId();
    const questionText = `E2E TypeScript experience ${uid}?`;
    const answerText = `E2E I have 5 years of TypeScript experience ${uid}.`;
    // Unique, not the hardcoded "TypeScript" this used to be — see
    // "Reference-data cleanup" above for why the sweep needs it to be.
    const tagLabel = `E2E Skill ${uid}`;

    await navigateToQuestions(page);
    await createQuestion(page, questionText, answerText, tagLabel);

    // Verify toast success message — t("questions.createdSuccess") = "Question has been created successfully"
    await expectToast(page, /Question has been created/);

    // Wait for the question list to reload after save
    await expect(page.getByText(questionText).first()).toBeVisible({
      timeout: 10000,
    });

    // Verify the answer preview is visible
    await expect(page.getByText(answerText).first()).toBeVisible();

    // Verify the tag badge is visible
    await expect(page.getByText(tagLabel).first()).toBeVisible();

    // Clean up
    await deleteQuestion(page, questionText);
    await expectToast(page, /Question has been deleted/);
  });

  test("should edit an existing question", async ({ page }) => {
    const uid = uniqueId();
    const questionText = `E2E TypeScript experience ${uid}?`;
    const answerText = `E2E I have 5 years of TypeScript experience ${uid}.`;
    const updatedQuestionText = `E2E Advanced TypeScript experience ${uid}?`;

    await navigateToQuestions(page);
    await createQuestion(page, questionText, answerText);

    // Wait for the question list to reload after save
    await expect(page.getByText(questionText).first()).toBeVisible({
      timeout: 15000,
    });

    // Wait for creation toast to auto-dismiss before clicking the question.
    //
    // DELIBERATELY still page-wide, unlike the six positive assertions in this
    // file that were converted to `expectToast`. Locator width flips meaning
    // with assertion polarity: for `toBeVisible` a wider locator is WEAKER
    // (more ways to pass without the thing under test), which is E2E-B20; for
    // `not.toBeVisible` a wider locator is STRONGER, because it demands the
    // string be absent everywhere rather than merely absent from the toast
    // viewport. Narrowing this one to match its neighbours would weaken it.
    await expect(
      page.getByText(/Question has been created/i).first(),
    ).not.toBeVisible({ timeout: 10000 });

    // Click on the question text to trigger onEdit — the question title is a
    // clickable button element that calls onEdit. The onEdit handler makes an
    // async getQuestionById server call before opening the dialog.
    const questionButton = page.getByRole("button", { name: questionText }).first();
    await questionButton.click();

    // Wait for the edit dialog to open — the server call may take a few seconds
    // t("questions.editQuestion") = "Edit Question"
    await expect(
      page.getByRole("heading", { name: /Edit Question/ }),
    ).toBeVisible({ timeout: 15000 });

    // Modify the question text
    const questionInput = page.getByPlaceholder("Enter your question");
    await questionInput.clear();
    await questionInput.fill(updatedQuestionText);

    // Save changes
    await page.getByRole("button", { name: "Save" }).click();

    // Wait for dialog to close
    await expect(
      page.getByRole("heading", { name: /Edit Question/ }),
    ).not.toBeVisible({ timeout: 15000 });

    // Verify toast success message — t("questions.updatedSuccess") = "Question has been updated successfully"
    await expectToast(page, /Question has been updated/);

    // Verify the updated text appears (wait for list to reload)
    await expect(page.getByText(updatedQuestionText).first()).toBeVisible({
      timeout: 10000,
    });

    // Clean up
    await deleteQuestion(page, updatedQuestionText);
    await expectToast(page, /Question has been deleted/);
  });

  test("should delete a question", async ({ page }) => {
    const uid = uniqueId();
    const deleteQuestionText = `E2E Dependency injection ${uid}?`;
    const deleteAnswerText = `E2E A design pattern for managing dependencies ${uid}.`;

    await navigateToQuestions(page);
    await createQuestion(page, deleteQuestionText, deleteAnswerText);

    // Wait for the toast and question list to reload
    await expectToast(page, /Question has been created/);
    await expect(page.getByText(deleteQuestionText).first()).toBeVisible({
      timeout: 10000,
    });

    // Delete the question via the delete icon button
    await deleteQuestion(page, deleteQuestionText);

    // Verify toast success message — t("questions.deletedSuccess") = "Question has been deleted successfully"
    await expectToast(page, /Question has been deleted/);
  });
});
