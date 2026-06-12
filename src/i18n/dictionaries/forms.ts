/**
 * Shared form-control strings (SelectFormCtrl, Combobox).
 *
 * Own `forms.*` namespace — deliberately NOT bolted onto settings.ts (avoids the
 * multi-prefix anti-pattern that email.ts exhibits).
 *
 * Values use the project's `{token}` interpolation convention, consumed at call
 * sites via `t("forms.x").replace("{label}", value)` — the same idiom as
 * RecordsCount / DeleteAlertDialog (there is no interpolating `t()` overload).
 *
 * NOTE the German verb-final word order ("{label} auswählen"): a naive
 * `${verb} ${label}` concat would mistranslate it. Keeping the verb inside the
 * per-locale template with a `{label}` token preserves correct word order in
 * every locale.
 */
export const forms = {
  en: {
    "forms.selectPlaceholder": "Select {label}",
    "forms.searchPlaceholder": "Search {label}",
    "forms.createOrSearchPlaceholder": "Create or search {label}",
    "forms.createOption": "Create:",
    "forms.noResults": "No results found!",
    "forms.optionCreated": "{label} created",
    "forms.optionSelected": "{label} selected",
  },
  de: {
    "forms.selectPlaceholder": "{label} auswählen",
    "forms.searchPlaceholder": "{label} suchen",
    "forms.createOrSearchPlaceholder": "{label} erstellen oder suchen",
    "forms.createOption": "Erstellen:",
    "forms.noResults": "Keine Ergebnisse gefunden!",
    "forms.optionCreated": "{label} erstellt",
    "forms.optionSelected": "{label} ausgewählt",
  },
  fr: {
    "forms.selectPlaceholder": "Sélectionner {label}",
    "forms.searchPlaceholder": "Rechercher {label}",
    "forms.createOrSearchPlaceholder": "Créer ou rechercher {label}",
    "forms.createOption": "Créer :",
    "forms.noResults": "Aucun résultat trouvé !",
    "forms.optionCreated": "{label} créé",
    "forms.optionSelected": "{label} sélectionné",
  },
  es: {
    "forms.selectPlaceholder": "Seleccionar {label}",
    "forms.searchPlaceholder": "Buscar {label}",
    "forms.createOrSearchPlaceholder": "Crear o buscar {label}",
    "forms.createOption": "Crear:",
    "forms.noResults": "¡No se encontraron resultados!",
    "forms.optionCreated": "{label} creado",
    "forms.optionSelected": "{label} seleccionado",
  },
} as const;
