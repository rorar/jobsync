/**
 * Email Templates Tests
 *
 * Tests: template rendering for all NotificationTypes,
 * return shape (subject, html, text), HTML structure,
 * locale-specific output, test email template.
 */

// Mock "server-only" to prevent runtime error in test environment
jest.mock("server-only", () => ({}));

// ---------------------------------------------------------------------------
// i18n mock — returns locale-prefixed strings for verification
// ---------------------------------------------------------------------------

jest.mock("@/i18n/dictionaries", () => ({
  t: jest.fn((locale: string, key: string) => `[${locale}]${key}`),
}));

// ---------------------------------------------------------------------------
// Imports (AFTER mocks)
// ---------------------------------------------------------------------------

import {
  renderEmailTemplate,
  renderTestEmail,
} from "@/lib/email/templates";
import type { NotificationType } from "@/models/notification.model";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALL_NOTIFICATION_TYPES: NotificationType[] = [
  "module_deactivated",
  "module_reactivated",
  "module_unreachable",
  "cb_escalation",
  "consecutive_failures",
  "auth_failure",
  "vacancy_promoted",
  "vacancy_batch_staged",
  "bulk_action_completed",
  "retention_completed",
  "job_status_changed",
];

const LOCALES = ["en", "de", "fr", "es"];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Email Templates", () => {
  // -----------------------------------------------------------------------
  // renderEmailTemplate
  // -----------------------------------------------------------------------

  describe("renderEmailTemplate", () => {
    it.each(ALL_NOTIFICATION_TYPES)(
      "renders template for %s",
      (type) => {
        const result = renderEmailTemplate(type, {}, "en");

        expect(result).toHaveProperty("subject");
        expect(result).toHaveProperty("html");
        expect(result).toHaveProperty("text");
        expect(typeof result.subject).toBe("string");
        expect(typeof result.html).toBe("string");
        expect(typeof result.text).toBe("string");
        expect(result.subject.length).toBeGreaterThan(0);
        expect(result.html.length).toBeGreaterThan(0);
        expect(result.text.length).toBeGreaterThan(0);
      },
    );

    it("returns subject, html, and text properties", () => {
      const result = renderEmailTemplate("vacancy_promoted", {}, "en");

      expect(Object.keys(result).sort()).toEqual(["html", "subject", "text"]);
    });

    it("HTML contains proper structure (header, body, footer)", () => {
      const result = renderEmailTemplate("vacancy_promoted", {}, "en");

      // DOCTYPE and HTML structure
      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("<html");
      expect(result.html).toContain("</html>");

      // Header section (dark background)
      expect(result.html).toContain("background-color:#18181b");

      // Body section
      expect(result.html).toContain("padding:24px");

      // Footer section (border-top)
      expect(result.html).toContain("border-top:1px solid #e4e4e7");

      // Proper email table structure
      expect(result.html).toContain('role="presentation"');

      // Meta tags
      expect(result.html).toContain('charset="utf-8"');
      expect(result.html).toContain("viewport");
    });

    it("all 4 locales produce different output", () => {
      const outputs = LOCALES.map((locale) =>
        renderEmailTemplate("vacancy_promoted", {}, locale),
      );

      // Each locale should produce unique subject and text
      // (because our mock prepends [locale] to keys)
      const subjects = new Set(outputs.map((o) => o.subject));
      const texts = new Set(outputs.map((o) => o.text));

      expect(subjects.size).toBe(4);
      expect(texts.size).toBe(4);
    });

    it("includes locale-specific greeting in text", () => {
      const resultEn = renderEmailTemplate("vacancy_promoted", {}, "en");
      const resultDe = renderEmailTemplate("vacancy_promoted", {}, "de");

      expect(resultEn.text).toContain("[en]email.greeting");
      expect(resultDe.text).toContain("[de]email.greeting");
    });

    it("includes locale-specific footer in text", () => {
      const result = renderEmailTemplate("vacancy_promoted", {}, "en");

      expect(result.text).toContain("[en]email.footer");
    });

    it("applies escapeHtml to header, greeting, and footer", () => {
      // Verify that the escapeHtml function is used by checking that
      // mock strings appear in both the HTML title and rendered sections
      const result = renderEmailTemplate("vacancy_promoted", {}, "en");

      // Header appears in the <title> and <h1> — both via escapeHtml
      expect(result.html).toContain("<title>[en]email.header</title>");
      expect(result.html).toContain("[en]email.header</h1>");

      // Greeting and message appear in paragraph tags
      expect(result.html).toContain("[en]email.greeting</p>");

      // Footer appears in the footer section
      expect(result.html).toContain("[en]email.footer</p>");
    });
  });

  // -----------------------------------------------------------------------
  // renderTestEmail
  // -----------------------------------------------------------------------

  describe("renderTestEmail", () => {
    it("returns subject, html, and text", () => {
      const result = renderTestEmail("en");

      expect(result).toHaveProperty("subject");
      expect(result).toHaveProperty("html");
      expect(result).toHaveProperty("text");
    });

    it("uses test-specific i18n keys", () => {
      const result = renderTestEmail("en");

      expect(result.subject).toContain("email.testSubject");
      expect(result.text).toContain("email.testBody");
    });

    it("produces locale-specific output", () => {
      const resultEn = renderTestEmail("en");
      const resultDe = renderTestEmail("de");

      expect(resultEn.subject).not.toBe(resultDe.subject);
      expect(resultEn.text).not.toBe(resultDe.text);
    });

    it("HTML has proper structure", () => {
      const result = renderTestEmail("en");

      expect(result.html).toContain("<!DOCTYPE html>");
      expect(result.html).toContain("background-color:#18181b");
      expect(result.html).toContain("border-top:1px solid #e4e4e7");
    });
  });
});
