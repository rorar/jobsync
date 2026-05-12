import { extractDomain } from "@/lib/connector/data-enrichment/domain-extractor";

describe("extractDomain", () => {
  // --- passthrough: already looks like a domain ---
  it("returns a bare domain as-is (lowercased)", () => {
    expect(extractDomain("acme.com")).toBe("acme.com");
  });

  it("lowercases a passthrough domain", () => {
    expect(extractDomain("ACME.IO")).toBe("acme.io");
  });

  // --- normal ASCII company names ---
  it("converts a simple company name to .com", () => {
    expect(extractDomain("Acme")).toBe("acme.com");
  });

  it("strips GmbH suffix", () => {
    expect(extractDomain("Acme GmbH")).toBe("acme.com");
  });

  it("strips Inc suffix", () => {
    expect(extractDomain("Acme Inc.")).toBe("acme.com");
  });

  // --- Unicode / diacritic handling ---
  it("transliterates ü → u (Müller GmbH → muller.com)", () => {
    expect(extractDomain("Müller GmbH")).toBe("muller.com");
  });

  it("transliterates ö → o", () => {
    expect(extractDomain("Möbel AG")).toBe("mobel.com");
  });

  it("transliterates ä → a", () => {
    expect(extractDomain("Bäcker SE")).toBe("backer.com");
  });

  it("transliterates ß → ss (Straße Tech → strassetech.com)", () => {
    expect(extractDomain("Straße Tech")).toBe("strassetech.com");
  });

  it("handles ß appearing after lowercase step", () => {
    // ß is already lowercase; NFD of ß is ß itself (no combining mark),
    // so the ß→ss replacement must fire.
    expect(extractDomain("Straße")).toBe("strasse.com");
  });

  it("handles accented French characters (é → e)", () => {
    expect(extractDomain("Élan SAS")).toBe("elan.com");
  });

  it("handles multiple diacritics in one name", () => {
    expect(extractDomain("Schäfer & Müller")).toBe("schafermuller.com");
  });

  // --- edge / boundary cases ---
  it("returns null for empty string", () => {
    expect(extractDomain("")).toBeNull();
  });

  it("returns null for whitespace-only string", () => {
    expect(extractDomain("   ")).toBeNull();
  });

  it("returns null for single-character input", () => {
    expect(extractDomain("A")).toBeNull();
  });

  it("returns null when name reduces to nothing after stripping", () => {
    // "GmbH" alone strips to "", which is < 2 chars
    expect(extractDomain("GmbH")).toBeNull();
  });

  it("handles null/undefined gracefully (returns null)", () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractDomain(null as any)).toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(extractDomain(undefined as any)).toBeNull();
  });
});
