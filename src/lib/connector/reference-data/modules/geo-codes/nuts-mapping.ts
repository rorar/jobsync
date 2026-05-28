/**
 * GeoCode Module — NUTS → ISO 3166-2 Mapping
 *
 * Maps NUTS Level 1 codes to their ISO 3166-2 subdivision equivalents.
 * Used by the EURES pipeline to resolve Eurostat NUTS location codes
 * to standard country/subdivision pairs.
 *
 * Coverage: EU core countries with 1:1 or near-1:1 NUTS L1 → ISO 3166-2 mapping.
 * Countries with complex NUTS mappings (e.g. UK NUTS → multiple local codes)
 * are handled on a best-effort basis.
 */

import type { NutsResolution } from "./types";

/**
 * NUTS country prefix → ISO 3166-1 alpha-2 mapping.
 * Handles the two special cases:
 *   - EL (Eurostat code for Greece) → GR
 *   - UK (Eurostat code for United Kingdom) → GB
 */
const NUTS_COUNTRY_OVERRIDES: Record<string, string> = {
  EL: "GR",
  UK: "GB",
};

/**
 * NUTS Level 1 → ISO 3166-2 subdivision code mapping.
 *
 * Keys are NUTS L1 codes (3 characters). Values are ISO 3166-2 subdivision
 * codes WITHOUT country prefix. Only includes countries where there is a
 * reliable 1:1 mapping between NUTS L1 and ISO 3166-2.
 *
 * Germany (DE)
 */
const NUTS_L1_TO_ISO: Record<string, { countryCode: string; subdivisionCode: string }> = {
  // Germany — NUTS L1 → Bundesland
  DE1: { countryCode: "DE", subdivisionCode: "BW" }, // Baden-Württemberg
  DE2: { countryCode: "DE", subdivisionCode: "BY" }, // Bayern
  DE3: { countryCode: "DE", subdivisionCode: "BE" }, // Berlin
  DE4: { countryCode: "DE", subdivisionCode: "BB" }, // Brandenburg
  DE5: { countryCode: "DE", subdivisionCode: "HB" }, // Bremen
  DE6: { countryCode: "DE", subdivisionCode: "HH" }, // Hamburg
  DE7: { countryCode: "DE", subdivisionCode: "HE" }, // Hessen
  DE8: { countryCode: "DE", subdivisionCode: "MV" }, // Mecklenburg-Vorpommern
  DE9: { countryCode: "DE", subdivisionCode: "NI" }, // Niedersachsen
  DEA: { countryCode: "DE", subdivisionCode: "NW" }, // Nordrhein-Westfalen
  DEB: { countryCode: "DE", subdivisionCode: "RP" }, // Rheinland-Pfalz
  DEC: { countryCode: "DE", subdivisionCode: "SL" }, // Saarland
  DED: { countryCode: "DE", subdivisionCode: "SN" }, // Sachsen
  DEE: { countryCode: "DE", subdivisionCode: "ST" }, // Sachsen-Anhalt
  DEF: { countryCode: "DE", subdivisionCode: "SH" }, // Schleswig-Holstein
  DEG: { countryCode: "DE", subdivisionCode: "TH" }, // Thüringen

  // Austria — NUTS L1 → Bundesland
  AT1: { countryCode: "AT", subdivisionCode: "1" },  // Burgenland + Niederösterreich + Wien (group)
  AT2: { countryCode: "AT", subdivisionCode: "6" },  // Kärnten + Steiermark (group)
  AT3: { countryCode: "AT", subdivisionCode: "4" },  // Oberösterreich + Salzburg + Tirol + Vorarlberg (group)

  // France — NUTS L1 → Régions
  FRB: { countryCode: "FR", subdivisionCode: "CVL" }, // Centre-Val de Loire
  FRC: { countryCode: "FR", subdivisionCode: "BFC" }, // Bourgogne-Franche-Comté
  FRD: { countryCode: "FR", subdivisionCode: "NOR" }, // Normandie
  FRE: { countryCode: "FR", subdivisionCode: "HDF" }, // Hauts-de-France
  FRF: { countryCode: "FR", subdivisionCode: "GES" }, // Grand Est
  FRG: { countryCode: "FR", subdivisionCode: "PDL" }, // Pays de la Loire
  FRH: { countryCode: "FR", subdivisionCode: "BRE" }, // Bretagne
  FRI: { countryCode: "FR", subdivisionCode: "NAQ" }, // Nouvelle-Aquitaine
  FRJ: { countryCode: "FR", subdivisionCode: "OCC" }, // Occitanie
  FRK: { countryCode: "FR", subdivisionCode: "ARA" }, // Auvergne-Rhône-Alpes
  FRL: { countryCode: "FR", subdivisionCode: "PAC" }, // Provence-Alpes-Côte d'Azur
  FRM: { countryCode: "FR", subdivisionCode: "COR" }, // Corse
  FRY: { countryCode: "FR", subdivisionCode: "IDF" }, // Île-de-France (approximate)

  // Italy — NUTS L1 → Macroregion (approximate — Italy NUTS L1 groups multiple regions)
  ITC: { countryCode: "IT", subdivisionCode: "21" },  // Nord-Ovest (Piemonte)
  ITF: { countryCode: "IT", subdivisionCode: "72" },  // Sud (Campania)
  ITH: { countryCode: "IT", subdivisionCode: "32" },  // Nord-Est (Veneto)
  ITI: { countryCode: "IT", subdivisionCode: "52" },  // Centro (Toscana)
  ITG: { countryCode: "IT", subdivisionCode: "82" },  // Isole (Sicilia)

  // Spain — NUTS L1 approximate groupings
  ES1: { countryCode: "ES", subdivisionCode: "GA" },  // Noroeste (Galicia)
  ES2: { countryCode: "ES", subdivisionCode: "PV" },  // Noreste (País Vasco)
  ES3: { countryCode: "ES", subdivisionCode: "MD" },  // Comunidad de Madrid
  ES4: { countryCode: "ES", subdivisionCode: "CL" },  // Centro (Castilla y León)
  ES5: { countryCode: "ES", subdivisionCode: "CT" },  // Este (Cataluña)
  ES6: { countryCode: "ES", subdivisionCode: "AN" },  // Sur (Andalucía)
  ES7: { countryCode: "ES", subdivisionCode: "CN" },  // Canarias

  // Netherlands — NUTS L1
  NL1: { countryCode: "NL", subdivisionCode: "GR" },  // Noord-Nederland (Groningen)
  NL2: { countryCode: "NL", subdivisionCode: "OV" },  // Oost-Nederland (Overijssel)
  NL3: { countryCode: "NL", subdivisionCode: "NH" },  // West-Nederland (Noord-Holland)
  NL4: { countryCode: "NL", subdivisionCode: "NB" },  // Zuid-Nederland (Noord-Brabant)

  // Belgium — NUTS L1
  BE1: { countryCode: "BE", subdivisionCode: "BRU" }, // Région de Bruxelles-Capitale
  BE2: { countryCode: "BE", subdivisionCode: "VLG" }, // Vlaams Gewest
  BE3: { countryCode: "BE", subdivisionCode: "WAL" }, // Région wallonne

  // Poland — NUTS L1 approximate
  PL2: { countryCode: "PL", subdivisionCode: "30" },  // Makroregion Południowy
  PL4: { countryCode: "PL", subdivisionCode: "14" },  // Makroregion Północno-Zachodni
  PL6: { countryCode: "PL", subdivisionCode: "12" },  // Makroregion Północny
  PL7: { countryCode: "PL", subdivisionCode: "24" },  // Makroregion Centralny
  PL8: { countryCode: "PL", subdivisionCode: "32" },  // Makroregion Wschodni
  PL9: { countryCode: "PL", subdivisionCode: "14" },  // Makroregion Województwo Mazowieckie

  // Sweden — NUTS L1
  SE1: { countryCode: "SE", subdivisionCode: "AB" },  // Östra Sverige (Stockholm)
  SE2: { countryCode: "SE", subdivisionCode: "O" },   // Södra Sverige (Västra Götaland)
  SE3: { countryCode: "SE", subdivisionCode: "Z" },   // Norra Sverige (Jämtland)

  // Denmark — country-level only (single NUTS L1)
  DK0: { countryCode: "DK", subdivisionCode: "84" },  // Danmark (Hovedstaden)

  // Ireland
  IE0: { countryCode: "IE", subdivisionCode: "L" },   // Ireland (Leinster)

  // Portugal
  PT1: { countryCode: "PT", subdivisionCode: "11" },  // Continente (Norte)
  PT2: { countryCode: "PT", subdivisionCode: "30" },  // Região Autónoma dos Açores
  PT3: { countryCode: "PT", subdivisionCode: "30" },  // Região Autónoma da Madeira

  // Czech Republic
  CZ0: { countryCode: "CZ", subdivisionCode: "10" },  // Česko (Praha)
};

/**
 * Extract the ISO 3166-1 alpha-2 country code from a NUTS code.
 *
 * NUTS codes start with a 2-letter country prefix (e.g. "DE1", "FRK").
 * Special cases: EL→GR, UK→GB.
 */
export function countryFromNuts(nutsCode: string): string {
  if (!nutsCode || nutsCode.length < 2) return "";
  const prefix = nutsCode.slice(0, 2).toUpperCase();
  return NUTS_COUNTRY_OVERRIDES[prefix] ?? prefix;
}

/**
 * Resolve a NUTS L1 code to an ISO 3166-2 subdivision code.
 *
 * @param nutsL1 The NUTS Level 1 code (3 characters, e.g. "DE2")
 * @returns ISO 3166-2 subdivision code without country prefix, or null if no mapping exists
 */
export function nutsToSubdivision(nutsL1: string): string | null {
  const key = nutsL1.toUpperCase();
  return NUTS_L1_TO_ISO[key]?.subdivisionCode ?? null;
}

/**
 * Fully resolve a NUTS code to country + subdivision.
 *
 * Handles codes at any NUTS level:
 *   - NUTS L0 (2 chars, e.g. "DE") → country only
 *   - NUTS L1 (3 chars, e.g. "DE2") → country + best-match subdivision
 *   - NUTS L2/L3 (4-5 chars, e.g. "DE21") → truncate to L1 and resolve
 *
 * @returns NutsResolution with countryCode and optional subdivisionCode
 */
export function resolveNutsCode(nutsCode: string): NutsResolution {
  if (!nutsCode || nutsCode.length < 2) {
    return { countryCode: "", subdivisionCode: null };
  }

  const upper = nutsCode.toUpperCase();
  const countryCode = countryFromNuts(upper);

  if (upper.length <= 2) {
    return { countryCode, subdivisionCode: null };
  }

  // Try the first 3 characters (NUTS L1)
  const l1 = upper.slice(0, 3);
  const subdivisionCode = NUTS_L1_TO_ISO[l1]?.subdivisionCode ?? null;

  return { countryCode, subdivisionCode };
}
