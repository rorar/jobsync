import { test, expect, type Page } from "@playwright/test";

// storageState handles authentication — no per-test login needed

test.beforeEach(async ({ context }) => {
  await context.addCookies([
    { name: "NEXT_LOCALE", value: "en", domain: "localhost", path: "/" },
  ]);
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
    // Click the tag combobox trigger button. The button text is
    // t("jobs.searchSkill") = "Search or add a skill...". Use getByText to
    // locate it within the dialog context.
    await page.getByText("Search or add a skill").click();
    // Type in the search input (placeholder from t("jobs.typeSkill") = "Type a skill...")
    await page.getByPlaceholder(/Type a skill/).fill(tagLabel);
    await page.waitForTimeout(500);
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
    await page.waitForTimeout(300);
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
    const uid = Date.now().toString(36);
    const questionText = `E2E TypeScript experience ${uid}?`;
    const answerText = `E2E I have 5 years of TypeScript experience ${uid}.`;
    const tagLabel = "TypeScript";

    await navigateToQuestions(page);
    await createQuestion(page, questionText, answerText, tagLabel);

    // Verify toast success message — t("questions.createdSuccess") = "Question has been created successfully"
    await expect(page.getByText(/Question has been created/).first()).toBeVisible({
      timeout: 10000,
    });

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
    await expect(page.getByText(/Question has been deleted/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should edit an existing question", async ({ page }) => {
    const uid = Date.now().toString(36);
    const questionText = `E2E TypeScript experience ${uid}?`;
    const answerText = `E2E I have 5 years of TypeScript experience ${uid}.`;
    const updatedQuestionText = `E2E Advanced TypeScript experience ${uid}?`;

    await navigateToQuestions(page);
    await createQuestion(page, questionText, answerText);

    // Wait for the question list to reload after save
    await expect(page.getByText(questionText).first()).toBeVisible({
      timeout: 15000,
    });

    // Wait for creation toast to auto-dismiss before clicking the question
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
    await expect(page.getByText(/Question has been updated/).first()).toBeVisible({
      timeout: 10000,
    });

    // Verify the updated text appears (wait for list to reload)
    await expect(page.getByText(updatedQuestionText).first()).toBeVisible({
      timeout: 10000,
    });

    // Clean up
    await deleteQuestion(page, updatedQuestionText);
    await expect(page.getByText(/Question has been deleted/).first()).toBeVisible({
      timeout: 10000,
    });
  });

  test("should delete a question", async ({ page }) => {
    const uid = Date.now().toString(36);
    const deleteQuestionText = `E2E Dependency injection ${uid}?`;
    const deleteAnswerText = `E2E A design pattern for managing dependencies ${uid}.`;

    await navigateToQuestions(page);
    await createQuestion(page, deleteQuestionText, deleteAnswerText);

    // Wait for the toast and question list to reload
    await expect(page.getByText(/Question has been created/).first()).toBeVisible({
      timeout: 10000,
    });
    await expect(page.getByText(deleteQuestionText).first()).toBeVisible({
      timeout: 10000,
    });

    // Delete the question via the delete icon button
    await deleteQuestion(page, deleteQuestionText);

    // Verify toast success message — t("questions.deletedSuccess") = "Question has been deleted successfully"
    await expect(page.getByText(/Question has been deleted/).first()).toBeVisible({
      timeout: 10000,
    });
  });
});
