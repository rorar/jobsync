import {
  parseKeywords,
  parseLocations,
  joinKeywords,
  joinLocations,
} from "@/utils/automation.utils";

describe("parseKeywords", () => {
  it("splits on ||", () => {
    expect(parseKeywords("Web||Java")).toEqual(["Web", "Java"]);
  });

  it("trims whitespace", () => {
    expect(parseKeywords("Web || Java")).toEqual(["Web", "Java"]);
  });

  it("handles single keyword", () => {
    expect(parseKeywords("Developer")).toEqual(["Developer"]);
  });

  it("handles empty string", () => {
    expect(parseKeywords("")).toEqual([]);
  });

  it("filters empty segments", () => {
    expect(parseKeywords("Web||||Java")).toEqual(["Web", "Java"]);
  });

  it("handles three keywords", () => {
    expect(parseKeywords("Web||Java||Python")).toEqual([
      "Web",
      "Java",
      "Python",
    ]);
  });

  it("handles keywords with spaces", () => {
    expect(parseKeywords("Software Engineer||Java Developer")).toEqual([
      "Software Engineer",
      "Java Developer",
    ]);
  });

  it("handles trailing separator", () => {
    expect(parseKeywords("Web||")).toEqual(["Web"]);
  });

  it("handles leading separator", () => {
    expect(parseKeywords("||Web")).toEqual(["Web"]);
  });
});

describe("parseLocations", () => {
  it("splits on comma", () => {
    expect(parseLocations("de,fr")).toEqual(["de", "fr"]);
  });

  it("handles NUTS codes with hyphens", () => {
    expect(parseLocations("de1,be-br")).toEqual(["de1", "be-br"]);
  });

  it("handles single location", () => {
    expect(parseLocations("Berlin")).toEqual(["Berlin"]);
  });

  it("handles empty string", () => {
    expect(parseLocations("")).toEqual([]);
  });

  it("trims whitespace", () => {
    expect(parseLocations("de , fr , be-br")).toEqual(["de", "fr", "be-br"]);
  });

  it("filters empty segments", () => {
    expect(parseLocations("de,,fr")).toEqual(["de", "fr"]);
  });

  it("handles trailing comma", () => {
    expect(parseLocations("de,")).toEqual(["de"]);
  });

  it("preserves -ns suffix for EURES", () => {
    expect(parseLocations("de-ns,fr")).toEqual(["de-ns", "fr"]);
  });
});

describe("joinKeywords", () => {
  it("joins with ||", () => {
    expect(joinKeywords(["Web", "Java"])).toBe("Web||Java");
  });

  it("filters empty strings", () => {
    expect(joinKeywords(["Web", "", "Java"])).toBe("Web||Java");
  });

  it("handles single keyword", () => {
    expect(joinKeywords(["Developer"])).toBe("Developer");
  });

  it("handles empty array", () => {
    expect(joinKeywords([])).toBe("");
  });
});

describe("joinLocations", () => {
  it("joins with comma", () => {
    expect(joinLocations(["de", "fr"])).toBe("de,fr");
  });

  it("filters empty strings", () => {
    expect(joinLocations(["de", "", "fr"])).toBe("de,fr");
  });

  it("handles single location", () => {
    expect(joinLocations(["Berlin"])).toBe("Berlin");
  });

  it("handles empty array", () => {
    expect(joinLocations([])).toBe("");
  });
});

describe("round-trip consistency", () => {
  it("parseKeywords(joinKeywords(arr)) returns the original array", () => {
    const keywords = ["Software Engineer", "Java Developer", "Python"];
    expect(parseKeywords(joinKeywords(keywords))).toEqual(keywords);
  });

  it("parseLocations(joinLocations(arr)) returns the original array", () => {
    const locations = ["de", "fr", "be-br"];
    expect(parseLocations(joinLocations(locations))).toEqual(locations);
  });
});
