/**
 * reference-data.actions.spec.ts — Reference Data Open Host Service tests
 *
 * Covers the auth gate (ADR-019) and the getPersonHolidayInfo composition
 * (delegates to HolidayService.isBusinessDay + GeoCodeService.getCountryName).
 */
import {
  getCountryOptions,
  getSubdivisionOptions,
  getPersonHolidayInfo,
} from "@/actions/reference-data.actions";
import { getCurrentUser } from "@/utils/user.utils";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("server-only", () => ({}));

jest.mock("@/utils/user.utils", () => ({
  getCurrentUser: jest.fn(),
}));

const mockGetCountries = jest.fn();
const mockGetSubdivisions = jest.fn();
const mockGetCountryName = jest.fn();
const mockIsBusinessDay = jest.fn();

jest.mock("@/lib/connector/reference-data/modules/geo-codes", () => ({
  getGeoCodeService: () => ({
    getCountries: mockGetCountries,
    getSubdivisions: mockGetSubdivisions,
    getCountryName: mockGetCountryName,
  }),
}));

jest.mock("@/lib/connector/reference-data/modules/public-holidays", () => ({
  getHolidayService: () => ({
    isBusinessDay: mockIsBusinessDay,
  }),
}));

const USER = { id: "user-1", name: "Test", email: "t@example.com" };

beforeEach(() => {
  jest.clearAllMocks();
  (getCurrentUser as jest.Mock).mockResolvedValue(USER);
  mockGetCountries.mockReturnValue([{ code: "DE", name: "Germany", hasSubdivisions: true }]);
  mockGetSubdivisions.mockReturnValue([{ code: "BY", name: "Bavaria", countryCode: "DE", subdivisionType: "Land" }]);
  mockGetCountryName.mockReturnValue("Germany");
  mockIsBusinessDay.mockReturnValue({ isBusinessDay: true, blockingHolidays: [], isWeekend: false });
});

// ---------------------------------------------------------------------------
// Auth gate (ADR-019)
// ---------------------------------------------------------------------------

describe("reference-data.actions auth gate", () => {
  it("getCountryOptions returns [] when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect(await getCountryOptions("en")).toEqual([]);
    expect(mockGetCountries).not.toHaveBeenCalled();
  });

  it("getSubdivisionOptions returns [] when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect(await getSubdivisionOptions("DE", "en")).toEqual([]);
    expect(mockGetSubdivisions).not.toHaveBeenCalled();
  });

  it("getPersonHolidayInfo returns null when unauthenticated", async () => {
    (getCurrentUser as jest.Mock).mockResolvedValue(null);
    expect(await getPersonHolidayInfo("DE", "en")).toBeNull();
    expect(mockIsBusinessDay).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// getCountryOptions / getSubdivisionOptions
// ---------------------------------------------------------------------------

describe("reference-data.actions lookups", () => {
  it("getCountryOptions delegates to GeoCodeService", async () => {
    const result = await getCountryOptions("en");
    expect(mockGetCountries).toHaveBeenCalledWith("en");
    expect(result).toEqual([{ code: "DE", name: "Germany", hasSubdivisions: true }]);
  });

  it("getSubdivisionOptions returns [] for empty country code without calling the service", async () => {
    const result = await getSubdivisionOptions("", "en");
    expect(result).toEqual([]);
    expect(mockGetSubdivisions).not.toHaveBeenCalled();
  });

  it("getSubdivisionOptions delegates to GeoCodeService for a valid country", async () => {
    await getSubdivisionOptions("DE", "de");
    expect(mockGetSubdivisions).toHaveBeenCalledWith("DE", "de");
  });
});

// ---------------------------------------------------------------------------
// getPersonHolidayInfo composition
// ---------------------------------------------------------------------------

describe("getPersonHolidayInfo", () => {
  it("returns null for an invalid country code (no service calls)", async () => {
    expect(await getPersonHolidayInfo("XXX", "en")).toBeNull();
    expect(await getPersonHolidayInfo("", "en")).toBeNull();
    expect(mockIsBusinessDay).not.toHaveBeenCalled();
  });

  it("maps a public holiday from isBusinessDay().blockingHolidays", async () => {
    mockIsBusinessDay.mockReturnValue({
      isBusinessDay: false,
      blockingHolidays: [{ name: "Christmas Day", type: "public" }],
      isWeekend: false,
    });
    const info = await getPersonHolidayInfo("DE", "en", "BY");
    expect(mockIsBusinessDay).toHaveBeenCalledWith(expect.any(Date), "DE", "BY", "en");
    expect(info).toEqual({
      isHoliday: true,
      holidayName: "Christmas Day",
      isWeekend: false,
      countryName: "Germany",
    });
  });

  it("maps a weekend (no blocking holiday)", async () => {
    mockIsBusinessDay.mockReturnValue({ isBusinessDay: false, blockingHolidays: [], isWeekend: true });
    const info = await getPersonHolidayInfo("DE", "en");
    expect(info).toMatchObject({ isHoliday: false, holidayName: null, isWeekend: true });
  });

  it("maps a plain business day", async () => {
    const info = await getPersonHolidayInfo("DE", "en");
    expect(info).toMatchObject({ isHoliday: false, holidayName: null, isWeekend: false });
  });

  it("passes undefined subdivision through when not provided", async () => {
    await getPersonHolidayInfo("FR", "fr");
    expect(mockIsBusinessDay).toHaveBeenCalledWith(expect.any(Date), "FR", undefined, "fr");
  });
});
