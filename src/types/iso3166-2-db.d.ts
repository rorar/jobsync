/**
 * Type declarations for iso3166-2-db (no @types package available).
 *
 * The package provides a dataset of ISO 3166-2 subdivisions with
 * multilingual names, geographic references, and utility functions.
 */
declare module "iso3166-2-db" {
  interface RegionReference {
    geonames?: number;
    openstreetmap?: number;
    openstreetmap_level?: number;
    wikipedia?: string;
    wof?: number;
  }

  interface RegionData {
    name: string;
    names: Record<string, string>;
    iso: string;
    fips?: string;
    admin?: string;
    reference?: RegionReference;
  }

  interface CountryReference {
    geonames?: number;
    openstreetmap?: number;
    wikipedia?: string;
  }

  interface CountryData {
    iso: string;
    iso3: string;
    numeric: number;
    fips?: string;
    reference?: CountryReference;
    names: Record<string, string>;
    regions: RegionData[];
  }

  type DataSet = Record<string, CountryData>;

  function getDataSet(): DataSet;
  function getRegionsFor(countryCode: string): RegionData[];
  function findRegionByCode(code: string, countryCode?: string): RegionData[];
  function findCountryByName(name: string): CountryData[];
  function changeDispute(dispute: string): void;
  function changeNameProvider(provider: string): void;
  function reduce(
    fn: (acc: unknown, country: CountryData, key: string) => unknown,
    initial: unknown,
  ): unknown;
}
