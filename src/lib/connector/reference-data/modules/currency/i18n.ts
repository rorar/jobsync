import type { ModuleI18n } from "@/lib/connector/manifest";

export const currencyI18n: ModuleI18n = {
  en: {
    name: "Currency Reference Data",
    description: "ISO-4217 currency lookup with locale-aware names, symbols, and minor units (offline)",
  },
  de: {
    name: "Währungs-Referenzdaten",
    description: "ISO-4217-Währungssuche mit lokalisierten Namen, Symbolen und Nachkommastellen (offline)",
  },
  fr: {
    name: "Données de référence des devises",
    description: "Recherche de devises ISO-4217 avec noms, symboles et sous-unités localisés (hors ligne)",
  },
  es: {
    name: "Datos de referencia de divisas",
    description: "Búsqueda de divisas ISO-4217 con nombres, símbolos y unidades menores localizados (sin conexión)",
  },
};
