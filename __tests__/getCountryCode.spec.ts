import { getCountryCode } from "@/lib/connector/job-discovery/modules/eures/countries";

describe("getCountryCode", () => {
  it("extracts country code from NUTS codes", () => {
    expect(getCountryCode("de1")).toBe("de");
    expect(getCountryCode("be2")).toBe("be");
    expect(getCountryCode("fr1")).toBe("fr");
  });

  it("returns plain country codes as-is", () => {
    expect(getCountryCode("de")).toBe("de");
    expect(getCountryCode("at")).toBe("at");
  });

  it("maps Greece 'el' to 'gr' for flag compatibility", () => {
    expect(getCountryCode("el")).toBe("gr");
    expect(getCountryCode("el3")).toBe("gr");
  });

  it("returns undefined for free-text location names (non-EURES)", () => {
    expect(getCountryCode("Berlin")).toBeUndefined();
    expect(getCountryCode("Germany")).toBeUndefined();
    expect(getCountryCode("London")).toBeUndefined();
    expect(getCountryCode("United States")).toBeUndefined();
    expect(getCountryCode("New York")).toBeUndefined();
  });

  it("is case-insensitive", () => {
    expect(getCountryCode("DE1")).toBe("de");
    expect(getCountryCode("EL")).toBe("gr");
  });
});
