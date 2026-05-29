/**
 * pii-redaction.spec.ts — src/lib/pii shared PII redaction policy.
 *
 * GDPR Art. 5(1)(c) data minimisation on third-party (cloud AI) transfers.
 * This is the single source of truth for the redaction PRIMITIVES shared by the
 * two resume converters (routes' convertResumeToText + runner's
 * convertResumeForMatch) and the job-text scrubber. Pinning the policy here
 * prevents the per-converter drift that previously let the runner leak slip in.
 *
 * Spec: specs/ai-provider.allium @invariant CloudTransferDataMinimization.
 */
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
import {
  PII_PLACEHOLDERS,
  stripEmailPhonePatterns,
  scrubFreeText,
  redactContact,
  type RedactableContact,
} from "@/lib/pii";

describe("src/lib/pii — shared redaction policy", () => {
  describe("PII_PLACEHOLDERS", () => {
    it("matches the CloudTransferDataMinimization spec tokens exactly", () => {
      expect(PII_PLACEHOLDERS).toEqual({
        name: "[NAME]",
        email: "[EMAIL]",
        phone: "[PHONE]",
        address: "[ADDRESS]",
      });
    });
  });

  describe("scrubFreeText", () => {
    const t = "reach me a@b.com or call +49 151 23456789 today";

    it("delegates to stripEmailPhonePatterns when stripPii=true", () => {
      expect(scrubFreeText(t, true)).toBe(stripEmailPhonePatterns(t));
    });

    it("is identity when stripPii=false (local Ollama keeps full fidelity)", () => {
      expect(scrubFreeText(t, false)).toBe(t);
    });
  });

  describe("redactContact", () => {
    const full: RedactableContact = {
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      phone: "+49 151 23456789",
      address: "Main Street 1, Berlin",
    };

    it("redacts every direct identifier to its placeholder when stripPii=true", () => {
      expect(redactContact(full, true)).toEqual({
        name: "[NAME]",
        email: "[EMAIL]",
        phone: "[PHONE]",
        address: "[ADDRESS]",
      });
    });

    it("passes values through unchanged when stripPii=false", () => {
      expect(redactContact(full, false)).toEqual({
        name: "Ada Lovelace",
        email: "ada@example.com",
        phone: "+49 151 23456789",
        address: "Main Street 1, Berlin",
      });
    });

    it("normalises null/empty address to null (render-guard parity with converters)", () => {
      expect(redactContact({ ...full, address: null }, true).address).toBeNull();
      expect(redactContact({ ...full, address: "" }, true).address).toBeNull();
      expect(redactContact({ ...full, address: null }, false).address).toBeNull();
    });

    it("accepts a structural subset (address optional) — bridges Resume vs ResumeWithSections", () => {
      const minimal = { firstName: "A", lastName: "B", email: "e@x.io", phone: "0151 2345678" };
      const out = redactContact(minimal, true);
      expect(out.name).toBe("[NAME]");
      expect(out.address).toBeNull();
    });
  });

  describe("leaf-module invariant (zero internal imports)", () => {
    // src/lib/pii is the single egress redaction chokepoint. It MUST stay a
    // dependency-free leaf: any internal import (@/… or relative) risks a
    // dependency cycle and erodes the "redaction lives in one place" guarantee
    // the PII-Egress-Härtung sprint established. This converts that property
    // from a doc-comment convention into a checked invariant (mirrors
    // scripts/check-notification-writers.sh for the notification leaf).
    const piiDir = join(__dirname, "..", "src", "lib", "pii");

    it("imports nothing internal (@/… or relative paths)", () => {
      const files = readdirSync(piiDir).filter((f) => f.endsWith(".ts"));
      expect(files.length).toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const file of files) {
        const src = readFileSync(join(piiDir, file), "utf8");
        const importRe = /^\s*import\s.*from\s+["']([^"']+)["']/gm;
        for (const match of src.matchAll(importRe)) {
          const spec = match[1];
          if (spec.startsWith("@/") || spec.startsWith(".")) {
            offenders.push(`${file}: ${spec}`);
          }
        }
      }
      expect(offenders).toEqual([]);
    });
  });

  describe("stripEmailPhonePatterns (canonical home: @/lib/pii)", () => {
    it("replaces emails and phone numbers with placeholders", () => {
      const out = stripEmailPhonePatterns("mail a@b.com phone 0151/23456789");
      expect(out).toContain("[EMAIL]");
      expect(out).toContain("[PHONE]");
    });

    it("leaves short digit runs (not phone-like) intact", () => {
      // 4 digits — below the >=7-digit phone threshold
      expect(stripEmailPhonePatterns("room 1234")).toBe("room 1234");
    });
  });
});
