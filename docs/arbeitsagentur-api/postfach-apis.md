# Leistungspostfach-APIs (kokos)

> Erfasst: 2026-05-17, via CDP Network Capture auf `web.arbeitsagentur.de/kokos/kokos-ui/pd/`

## OAuth-Client

- **client_id:** `kokos` (separater Client!)
- Token-Exchange via PKCE: `code_verifier` im Token-Request

## API-Katalog

| Endpoint | Method | Format | Beschreibung |
|---|---|---|---|
| `kokos/kokos-ui-service/pd/v1/postfach` | POST | JSON | Postfach-Kontext (Identity, Berechtigungen, Login-Level) |
| `kokos/kokos-ui-service/pd/v1/ordner` | GET | JSON Array | Ordner-Liste mit Counts |
| `kokos/kokos-ui-service/pd/v1/ordner/{ordnerId}/nachrichten` | GET | JSON Array | Nachrichten in einem Ordner |

## Response-Schemas

### POST /postfach (Kontext)
```json
{
  "identity": "urn:bafor:step:person:kundennummer:<KUNDENNR>",
  "actingOnBehalf": "urn:bafor:step:person:kundennummer:<KUNDENNR>",
  "actingOnBehalfOnlineKommunikation": true,
  "actingOnBehalfKontoStatus": "AKTIV",
  "loginVNiveau": "STORK-QAA-Level-4",
  "kundenTyp": "Person"
}
```

### GET /ordner
```json
[
  { "id": "entwurf",   "name": "entwurf",   "anzahlGesamt": 3,  "anzahlUngelesen": 0 },
  { "id": "erhalten",  "name": "erhalten",  "anzahlGesamt": 24, "anzahlUngelesen": 0 },
  { "id": "geloescht", "name": "geloescht", "anzahlGesamt": 0,  "anzahlUngelesen": 0 },
  { "id": "gesendet",  "name": "gesendet",  "anzahlGesamt": 68, "anzahlUngelesen": 0 }
]
```

### GET /ordner/erhalten/nachrichten
```json
[
  {
    "nachrichtId": "uuid",
    "datum": "2026-03-20T11:49:16.270611Z",
    "gelesen": true,
    "antwortErlaubt": true,
    "ordnerType": "erhalten",
    "anhang": false,
    "bezug": "Sonstige JC-Anfrage",
    "betreff": "<SUBJECT>",
    "dienststellennummer": "<DSTNR>",
    "dienststellenname": "Jobcenter Stadt <ORT>",
    "typ": "JC",
    "vNiveauAusreichend": true,
    "vNiveau": "STORK-QAA-Level-1",
    "leserId": "urn:bafor:step:person:kundennummer:<KUNDENNR>",
    "leserName": "<NAME>",
    "vertretungsBeziehung": "NICHT_RELEVANT",
    "autorId": null,
    "autorName": "Mitarbeiter bzw. Mitarbeiterin",
    "senderId": "<DSTNR>",
    "senderName": "Jobcenter Stadt <ORT>",
    "empfaengerId": "urn:bafor:step:person:kundennummer:<KUNDENNR>"
  }
]
```

## Beobachtungen

- **Login-Level (Vertrauensniveau)**: `STORK-QAA-Level-4` (eID = höchstes Level). Manche Nachrichten erfordern nur Level 1.
- **`vNiveauAusreichend`**: Flag ob aktuelles Login-Level für die Nachricht reicht
- **`antwortErlaubt: true`**: Nicht alle Nachrichten können beantwortet werden
- **`bezug`**: Kategorie/Thema der Nachricht ("Sonstige JC-Anfrage", etc.)
- **`typ: "JC"`**: Jobcenter-Nachricht (vs. "AA" = Agentur für Arbeit?)
- **`vertretungsBeziehung`**: Bevollmächtigten-Kontext
- **`autorName: "Mitarbeiter bzw. Mitarbeiterin"`**: Sachbearbeiter ist anonym in der API!
- **Ordner**: entwurf (Drafts), erhalten (Inbox), gesendet (Sent), geloescht (Trash)
- **Separater OAuth-Client** `kokos` mit eigenem PKCE-Flow
- **Hinweis**: OAuth config liegt unter `/websso-prod/oiam-oauth-wc/assets/config.json` (nicht `/oiambk/`)!

## Noch zu erfassen (in nächster Session)

- [ ] GET /ordner/erhalten/nachrichten/{nachrichtId} — Einzelne Nachricht lesen
- [ ] POST zum Antworten auf Nachrichten
- [ ] POST zum Erstellen neuer Nachrichten
- [ ] Anhang-Handling (Download/Upload)
- [ ] Vermittlungspostfach-APIs (vamJB/jobboerse) — separates System!
