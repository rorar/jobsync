# Termine-APIs

> Erfasst: 2026-05-17, via CDP Network Capture auf `web.arbeitsagentur.de/portal/termine/pd`

## OAuth-Client

- **client_id:** `ota-online` (separater Client, NICHT `profil-online`!)
- SSO funktioniert über shared Keycloak session — Silent Login wenn Session noch aktiv

## API-Katalog

| Endpoint | Method | Format | Beschreibung |
|---|---|---|---|
| `portal/ota-service/pd/v1/appointments` | GET | JSON | **Alle Termine** (upcoming + past) |
| `portal/ota-service/pd/v1/upcoming/appointment` | GET | JSON | Nur nächster Termin (Dashboard-Widget) |
| `portal/ota-service/pd/v1/markasread` | POST | JSON | Termin als gelesen markieren |
| `portal/otv-service/pd/v1/access/agencies` | GET | JSON | Zugeordnete Dienststellen für Terminbuchung (SGB2 + SGB3) |

## Response-Schemas

### GET /appointments
```json
{
  "pastAppointments": [],
  "upcomingAppointments": [
    {
      "subject": "Vermittlungsgespräch",
      "weekday": "Montag",
      "date": "2026-05-18",
      "startTime": "09:00",
      "endTime": "09:30",
      "agentur": {
        "name": "Jobcenter Stadt <ORT>",
        "street": "...",
        "housenumber": "...",
        "plz": "...",
        "city": "..."
      },
      "responsible": "<BETREUER>",
      "location": {
        "description": "414",
        "dienstelleNummer": "<DSTNR>"
      },
      "shortly": true,
      "legalStatement": false,
      "contactType": "VIDEO",
      "videoUrl": "https://vk.arbeitsagentur.de/vkid/{id}?d={dstnr}",
      "wasCanceled": false,
      "online": false,
      "shiftUrl": null,
      "cancelUrl": null
    }
  ]
}
```

### GET /access/agencies
```json
{
  "sgb2": {
    "generalEntryUrl": "https://web.arbeitsagentur.de/portal/terminvereinbarung/pc/jobcenter/anliegenauswahl",
    "agency": {
      "name": "Jobcenter Stadt <ORT>",
      "zipCode": "...",
      "city": "...",
      "street": "...",
      "houseNumber": "...",
      "agencyNumber": "<DSTNR>"
    }
  },
  "sgb3": {
    "generalEntryUrl": "https://web.arbeitsagentur.de/portal/terminvereinbarung/pc/agenturen/anliegenauswahl",
    "agency": {
      "name": "Agentur für Arbeit <ORT>",
      "zipCode": "...",
      "city": "...",
      "street": "...",
      "houseNumber": "...",
      "agencyNumber": "<DSTNR>"
    }
  }
}
```

## Beobachtungen

- `contactType`: "VIDEO" | "PERSOENLICH" | "TELEFON" (vermutlich)
- `shortly: true` = Badge "In Kürze" in der UI
- `videoUrl` enthält den Direkt-Link zum Video-Termin
- `location.description` = Zimmernummer
- `cancelUrl` / `shiftUrl` = null → Termin kann nicht online verschoben/abgesagt werden (nur manche Termine)
- Termine-App nutzt eigenen OAuth-Client `ota-online`
- `portal/terminvereinbarung/pc/` = öffentliche Terminbuchung (kein Auth nötig für Anliegenauswahl)
