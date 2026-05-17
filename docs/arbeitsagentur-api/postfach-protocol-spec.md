# KOKOS Leistungspostfach Protocol Specification

## Overview

REST API for the benefits mailbox (Leistungspostfach) — bidirectional messaging between citizens and Jobcenter/Arbeitsagentur regarding benefits (Bürgergeld, ALG, etc.).

## Transport

- **Layer:** HTTPS (TLS 1.2+)
- **Base URL:** `https://rest.arbeitsagentur.de/kokos/kokos-ui-service/pd/v1/`
- **Auth:** OAuth2 Bearer Token (client_id: `kokos`)
- **Format:** JSON
- **CORS:** Origin `https://web.arbeitsagentur.de`

## Authentication Flow

```
[Browser] --PKCE Auth Code (S256)--> [Keycloak: kokos]
[Keycloak] --Access Token (240s) + Refresh Token (3600s)--> [Browser]
[Browser] --authorization: Bearer {token}--> [kokos-ui-service]
```

Note: OAuth config at `/websso-prod/oiam-oauth-wc/assets/config.json` (not `/oiambk/`!)
Client secret: `kokos` (public client, same pattern as profil-online)

## Endpoints

### POST /postfach

Initialize mailbox context. Returns identity, permissions, and login level.
Must be called before other mailbox operations.

**Request:**
```http
POST /kokos/kokos-ui-service/pd/v1/postfach HTTP/1.1
Host: rest.arbeitsagentur.de
authorization: Bearer {access_token}
Accept: application/json, text/plain, */*
```

**Response (200):**
```json
{
  "identity": "urn:bafor:step:person:kundennummer:{KUNDENNR}",
  "actingOnBehalf": "urn:bafor:step:person:kundennummer:{KUNDENNR}",
  "actingOnBehalfOnlineKommunikation": true,
  "actingOnBehalfKontoStatus": "AKTIV",
  "loginVNiveau": "STORK-QAA-Level-4",
  "kundenTyp": "Person"
}
```

### GET /ordner

List all mailbox folders with message counts.

**Request:**
```http
GET /kokos/kokos-ui-service/pd/v1/ordner HTTP/1.1
Host: rest.arbeitsagentur.de
authorization: Bearer {access_token}
Accept: application/json, text/plain, */*
```

**Response (200):**
```json
[
  { "id": "entwurf",   "name": "entwurf",   "anzahlGesamt": 3,  "anzahlUngelesen": 0 },
  { "id": "erhalten",  "name": "erhalten",  "anzahlGesamt": 24, "anzahlUngelesen": 0 },
  { "id": "geloescht", "name": "geloescht", "anzahlGesamt": 0,  "anzahlUngelesen": 0 },
  { "id": "gesendet",  "name": "gesendet",  "anzahlGesamt": 68, "anzahlUngelesen": 0 }
]
```

### GET /ordner/{ordnerId}/nachrichten

List messages in a folder.

**Request:**
```http
GET /kokos/kokos-ui-service/pd/v1/ordner/erhalten/nachrichten HTTP/1.1
Host: rest.arbeitsagentur.de
authorization: Bearer {access_token}
Accept: application/json, text/plain, */*
```

**Response (200):** Array of `NachrichtSummary`

## Data Structures

### PostfachContext

| Field | Type | Description |
|---|---|---|
| `identity` | URN string | User identity (format: `urn:bafor:step:person:kundennummer:{nr}`) |
| `actingOnBehalf` | URN string | Acting-on-behalf identity (same as identity for self) |
| `actingOnBehalfOnlineKommunikation` | boolean | Whether online communication is enabled for this identity |
| `actingOnBehalfKontoStatus` | enum | `"AKTIV"` \| `"GESPERRT"` \| `"INAKTIV"` (?) |
| `loginVNiveau` | enum | Trust level: `"STORK-QAA-Level-1"` thru `"STORK-QAA-Level-4"` |
| `kundenTyp` | enum | `"Person"` \| `"Unternehmen"` (?) |

### Ordner (Folder)

| Field | Type | Description |
|---|---|---|
| `id` | string | Folder ID: `"entwurf"` \| `"erhalten"` \| `"geloescht"` \| `"gesendet"` |
| `name` | string | Display name (same as ID in current version) |
| `anzahlGesamt` | integer | Total message count |
| `anzahlUngelesen` | integer | Unread message count |

### NachrichtSummary (Message Summary)

| Field | Type | Nullable | Description |
|---|---|---|---|
| `nachrichtId` | UUID string | no | Unique message identifier |
| `datum` | ISO 8601 datetime | no | Message timestamp (UTC with microseconds) |
| `gelesen` | boolean | no | Read status |
| `antwortErlaubt` | boolean | no | Whether reply is allowed |
| `ordnerType` | string | no | Folder: `"erhalten"` \| `"gesendet"` \| `"entwurf"` \| `"geloescht"` |
| `anhang` | boolean | no | Has attachment(s) |
| `bezug` | string | no | Message category/topic |
| `betreff` | string | no | Subject line |
| `dienststellennummer` | string | no | 5-digit office number |
| `dienststellenname` | string | no | Office display name |
| `typ` | enum | no | `"JC"` (Jobcenter) \| `"AA"` (Agentur für Arbeit) |
| `vNiveauAusreichend` | boolean | no | Whether current login level is sufficient to read |
| `vNiveau` | string | no | Required trust level for this message |
| `leserId` | URN string | yes | Identity of first reader (null if unread) |
| `leserName` | string | yes | Display name of first reader |
| `vertretungsBeziehung` | enum | no | `"NICHT_RELEVANT"` \| `"VERTRETUNG"` \| `"BEVOLLMAECHTIGT"` (?) |
| `autorId` | string | yes | Author identity (null for institutional senders) |
| `autorName` | string | no | Author display name ("Mitarbeiter bzw. Mitarbeiterin" for anonymous) |
| `senderId` | string | no | Sender ID (office number for institutional) |
| `senderName` | string | no | Sender display name |
| `empfaengerId` | URN string | no | Recipient identity |
| `empfaengerName` | string | no | Recipient display name |

## Known Message Categories (`bezug`)

Observed values (incomplete list, to be expanded by agent exploration):
- `"Sonstige JC-Anfrage"` — General Jobcenter inquiry
- `"Anfrage Termin"` — Appointment-related message
- (more to be discovered via full message listing)

## Trust Levels (Vertrauensniveau)

| Level | Method | Description |
|---|---|---|
| `STORK-QAA-Level-1` | Username+Password | Basic auth, limited access |
| `STORK-QAA-Level-2` | Passkey / MFA | Medium trust |
| `STORK-QAA-Level-3` | ELSTER-Zertifikat | High trust |
| `STORK-QAA-Level-4` | eID (Online-Ausweis) | Highest trust, full access |

Messages have a required `vNiveau` — if the user's login level is lower, `vNiveauAusreichend: false` and the message cannot be read.

## State Machine

```
[DRAFT] --send--> [SENT]
[RECEIVED] --read--> [READ]
[RECEIVED/READ] --delete--> [DELETED]
[DELETED] --restore(?)--> [RECEIVED/READ]
[RECEIVED/READ] --reply--> [SENT] (new message)
```

## Preconditions

| Condition | Check | Consequence |
|---|---|---|
| `actingOnBehalfOnlineKommunikation` | POST /postfach | If `false`: no send/receive allowed |
| `actingOnBehalfKontoStatus` | POST /postfach | Must be `"AKTIV"` |
| `vNiveauAusreichend` per message | GET /nachrichten | If `false`: message content not accessible |
| `antwortErlaubt` per message | GET /nachrichten | If `false`: no reply button shown |

## Additional Endpoints (Discovered in Deep Dive)

### GET /dienststellen/vorbelegung

Returns all assigned offices the user can message, per legal domain.

**Response (200):**
```json
{
  "dstVorbelegungSGB2": {
    "dienststellenNummer": "<DSTNR>",
    "dienststellenName": "Jobcenter Stadt <ORT>",
    "dienststellenArt": "GE",
    "strasse": "...", "hausnummer": "...", "plz": "...", "ort": "...",
    "teilnehmend": true
  },
  "dstVorbelegungSGB3": {
    "dienststellenNummer": "<DSTNR_AA>",
    "dienststellenName": "Agentur für Arbeit <ORT>",
    "dienststellenArt": "AA",
    "strasse": "...", "hausnummer": "...", "plz": "...", "ort": "...",
    "teilnehmend": true
  },
  "dstVorbelegungFamka": null,
  "dstVorbelegungZav": null,
  "wohnanschriftBekannt": true,
  "vorbelegt": "JC"
}
```

**Dienststellen-Arten:** `"GE"` (Jobcenter) | `"AA"` (Agentur für Arbeit) | `"Famka"` (Familienkasse) | `"ZAV"` (Zentrale Auslandsvermittlung)
**`teilnehmend: true`** = office accepts online messages
**`vorbelegt`** = pre-selected office type for new messages

### GET /anliegen/{typ}/{dstnr}

Hierarchical category tree for composing messages to a specific office.

**Parameters:** `{typ}`: `"AA"` | `"JC"` — `{dstnr}`: 5-digit office number

**Response (200):**
```json
[
  {
    "id": "1000",
    "name": "Anforderung von Kopien (zum Beispiel Bescheide)",
    "subanliegen": [
      {
        "id": "2010",
        "name": "Anforderung von Kopien",
        "bezug": "Anfrage Kopie",
        "hinweis": "Teilen Sie uns bitte mit, welchen Bescheid...",
        "link": null,
        "linkText": null,
        "nachrichtErstellen": true,
        "anhangErlaubt": true
      }
    ]
  },
  {
    "id": "1100",
    "name": "Anfrage zum Bearbeitungsstand",
    "subanliegen": [
      {
        "id": "2020",
        "name": "Anfrage zum Bearbeitungsstand",
        "bezug": "Anfrage Bearbeitungsstand",
        "hinweis": "Die Bearbeitungszeit kann bis zu 10 Tage betragen...",
        "nachrichtErstellen": true,
        "anhangErlaubt": true
      }
    ]
  }
]
```

**Key:** `bezug` → message category tag | `nachrichtErstellen` → gates send permission | `anhangErlaubt` → gates file upload

## Related Service: Notification Configuration (miso)

### GET /miso/miso-notification-service/pd/v2/notification/mail/konfiguration

**Response (200):**
```json
{
  "emailAdresse": "<email>",
  "emailAktiviert": true,
  "mitteilungsArten": [
    { "mitteilungsArt": "NEUE_PFNACHRICHT_ERHALTEN_LEISTUNG", "zustellungsArt": "SOFORT" },
    { "mitteilungsArt": "NEUE_PFNACHRICHT_ERHALTEN_VERMITTLUNG", "zustellungsArt": "SOFORT" },
    { "mitteilungsArt": "NEUER_VERMITTLUNGSVORSCHLAG", "zustellungsArt": "TAEGLICH" },
    { "mitteilungsArt": "NEUE_STELLENEMPFEHLUNG", "zustellungsArt": "TAEGLICH" },
    { "mitteilungsArt": "VAM_AG_VERMITTLUNGSVORSCHLAG_ERSTELLT", "zustellungsArt": "KEINE" },
    { "mitteilungsArt": "VAM_BEWERBUNG_EINGEGANGEN", "zustellungsArt": "TAEGLICH" }
  ]
}
```

**Zustellungsarten:** `"SOFORT"` (immediate) | `"TAEGLICH"` (daily digest) | `"KEINE"` (disabled)

| MitteilungsArt | Description |
|---|---|
| `NEUE_PFNACHRICHT_ERHALTEN_LEISTUNG` | New message in Leistungspostfach |
| `NEUE_PFNACHRICHT_ERHALTEN_VERMITTLUNG` | New message in Vermittlungspostfach |
| `NEUER_VERMITTLUNGSVORSCHLAG` | New placement suggestion from advisor |
| `NEUE_STELLENEMPFEHLUNG` | New job recommendation |
| `VAM_AG_VERMITTLUNGSVORSCHLAG_ERSTELLT` | Employer-initiated placement |
| `VAM_BEWERBUNG_EINGEGANGEN` | Application received by employer |

## Compose Flow (Neue Nachricht)

**URL:** `/kokos/kokos-ui/pd/neu` (Angular SPA, client-side routing)

### Flow Steps (Multi-Step, innerhalb einer Seite)

```
Step 1: Ansprechpartner wählen
  → Radio: "Agentur für Arbeit (AA)" | "Jobcenter (JC)"
  → Kein API-Call (client-seitig)
  → Zeigt: "Ermittelter Ansprechpartner" (aus /dienststellen/vorbelegung)

Step 2: Anliegen auswählen
  → Select-Dropdown (aus vorgeladenem /anliegen/{typ}/{dstnr} Katalog)
  → AA-Optionen: Nachricht zur Geldleistung | Abmeldungen | Veränderungsmitteilungen | Unterlagen nachreichen | Allgemeine Anfrage
  → Jede Option hat numerische ID (z.B. "500" = Allgemeine Anfrage)
  → Kein API-Call (client-seitig)

Step 3: "Weiter" klicken → Nachricht schreiben
  → H1 wechselt zu "Nachricht schreiben"
  → Zeigt Compose-Formular
```

### Compose-Formular (nach "Weiter")

| Feld | HTML-Element | ID | Pflicht | Constraints |
|---|---|---|---|---|
| Anliegen | Read-only Label | `fd-anliegen-value` | - | Vorbelegt aus Step 2 |
| Betreff | `<input type="text">` | `input-betreff` | ja | **maxLength: 50** |
| Text | `<textarea rows="8">` | `textarea-text` | ja | **maxLength: 5000** |
| Dateianhänge | `<input type="file" multiple>` | `fileupload-attachments` | nein | Mehrere Dateien erlaubt |

### Aktions-Buttons

| Button | ID | Typ | Aktion |
|---|---|---|---|
| "Anhänge hinzufügen" | `fileupload-btn-add` | button | Öffnet Datei-Dialog |
| "Abbrechen" | `link-back` | Link | Zurück zur Übersicht (kein API-Call) |
| "Als Entwurf speichern" | `btn-store` | submit | Speichert als Draft → Ordner "entwurf" |
| "Nachricht senden" | `link-forward` | Link | Sendet die Nachricht → Ordner "gesendet" |

### DSGVO-Sektion

"Kenntnisnahme zur Datenverarbeitung" — wird als dritte Sektion im Formular angezeigt.

### Compose API-Calls (predicted, noch nicht verifiziert)

Beim Senden wird vermutlich ein POST mit folgendem Payload ausgelöst:
```json
{
  "dienststellennummer": "<DSTNR>",
  "dienststellenArt": "AA",
  "bezug": "Anfrage Allgemeine Anfrage",
  "betreff": "<user input, max 50 chars>",
  "text": "<user input, max 5000 chars>",
  "anhang": []
}
```

## Complete API (reverse-engineered from JS source: main-JXH6C3HR.js)

### Nachrichten CRUD

| Method | Endpoint | Purpose | Verified |
|---|---|---|---|
| `GET` | `/ordner/{ordnerType}/nachrichten/{nachrichtId}` | Read single message (full body) | Via JS |
| `POST` | **`/ordner/senden/nachrichten`** | **Send message** (Body = message payload) | Via JS |
| `POST` | `/ordner/entwurf/nachrichten` | Save as draft (Response: `Location` header with new URL) | Via JS |
| `PUT` | `/ordner/geloescht/nachrichten/{nachrichtId}` | Restore from trash | Via JS |
| `DELETE` | `/ordner/{ordnerType}/nachrichten/{nachrichtId}` | Move to trash | Via JS |
| `DELETE` | `/ordner/geloescht/nachrichten/{nachrichtId}` | Permanently delete | Via JS |

### Anhänge (Attachments) — separater Upload-Service!

| Method | Endpoint | Purpose | Verified |
|---|---|---|---|
| `GET` | `/ordner/{ordnerType}/nachrichten/{nachrichtId}/anhaenge/{anhangId}` | Download attachment | Via JS |
| `POST` | `/ordner/entwurf/nachrichten/{nachrichtId}/anhaenge` | Upload attachment (multipart) | Via JS |
| `GET` | `/ordner/entwurf/nachrichten/{nachrichtId}/anhaenge/{anhangId}/upload-status` | Check upload progress | Via JS |
| `GET` | `/ordner/entwurf/nachrichten/{nachrichtId}/anhaenge/{anhangId}/metadaten` | Get attachment metadata | Via JS |
| `DELETE` | `/ordner/entwurf/nachrichten/{nachrichtId}/anhaenge/{anhangId}` | Delete attachment from draft | Via JS |

### Send-Flow (API-Sequenz)

```
1. POST /ordner/entwurf/nachrichten     (Body: message payload)
   ← 201 + Location: /ordner/entwurf/nachrichten/{newId}

2. POST /ordner/entwurf/nachrichten/{newId}/anhaenge   (multipart file upload)
   ← 201 + anhangId

3. GET  /ordner/entwurf/nachrichten/{newId}/anhaenge/{anhangId}/upload-status
   ← Polling until upload complete

4. POST /ordner/senden/nachrichten      (Body: final message with anhang references)
   ← 200 (message sent)
```

Alternative (ohne Anhang): Direkt `POST /ordner/senden/nachrichten` — kein Entwurf-Zwischenschritt nötig.

### URL-Berechnung (verifiziert aus JS-Source)

```javascript
// Class ApiUrlService:
path = "/pd/v1"       // Normal-API
uploadPath = "/ud/v1" // Upload-API (SELBER Service, anderer Pfad-Prefix!)

// apiUrl = dynamisch aus window.location:
//   Frontend: web.arbeitsagentur.de/kokos/kokos-ui/pd/
//   → Transform: "/kokos-ui-" wird "/kokos-" (in pathname)
//   → Backend:   rest.arbeitsagentur.de/kokos/kokos-ui-service

// Ergebnis:
//   getApiUrl()       → rest.arbeitsagentur.de/kokos/kokos-ui-service/pd/v1
//   getUploadApiUrl() → rest.arbeitsagentur.de/kokos/kokos-ui-service/ud/v1

// Non-Prod Host (intern): web.dev.ocp.webapp.idst.ibaintern.de
```

**VERIFIZIERT:** Upload ist KEIN separater Service — gleicher Service (`kokos-ui-service`), nur `/ud/v1` statt `/pd/v1`.

## Upload-Restriktionen (verifiziert aus JS-Source + Translations)

### Dateiformate (VALID_FILE_TYPES — exakt 4, keine anderen!)

| Format | MIME-Type | Magic Bytes | Extensions |
|---|---|---|---|
| PDF | `application/pdf` | `25504446` (%PDF) | .pdf |
| PNG | `image/png` | `89504E47` | .png |
| JPEG | `image/jpeg` | `FFD8FF` | .jpg, .jpeg |
| BMP | `image/bmp` | `424D` | .bmp |

**Validierung ist zweistufig:**
1. Client: Magic-Bytes-Prüfung via `FileReader.slice(0, 4)` — Umbenennen reicht NICHT
2. Server: Nochmals Validierung (Error FFP 470)

**Alle Uploads werden serverseitig zu PDF konvertiert.** Nicht konvertierbar:
- Formular-PDFs (FFP 471)
- Verschlüsselte PDFs (FFP 472)
- PDFs mit integrierten Anhängen (FFP 473)
- Bilder mit transparentem Hintergrund (FFP 474)

### Dateigrößen

| Regel | Limit | Error-Code |
|---|---|---|
| Max. einzelne Datei | **7,5 MB** | FFP 450 |
| Max. Gesamtgröße (alle Anhänge einer Nachricht) | **7,5 MB** | FFP 455 |
| Max. PDF nach Konvertierung | **7,5 MB** | FFP 451 |
| Max. Seitenzahl (Original-PDF) | **100 Seiten** | FFP 475 |

### Dateiname-Restriktionen

| Regel | Limit | Error-Code |
|---|---|---|
| Max. Länge | **80 Zeichen** | FFP 430 |
| Ungültige Zeichen | Nur ERLAUBTEZEICHEN-Set erlaubt | FFP 440 |
| Darf NICHT mit Punkt beginnen | `.hidden` verboten | FFP 441 |
| Darf NICHT mit Punkt enden | `file.` verboten | FFP 442 |
| Darf NICHT mit Leerzeichen beginnen | `" file"` verboten | FFP 443 |
| Darf NICHT mit Leerzeichen enden | `"file "` verboten | FFP 444 |
| Reservierte Wörter | OS-reserved (CON, NUL, PRN, etc.) | FFP 445 |
| Duplikate | Selbe Datei nicht doppelt anhängbar | FFP 490 |

### Erlaubte Zeichen (ERLAUBTEZEICHEN-Set aus JS-Source)

**`wY` Array:** `" ! # $ % & ' ( ) * + , - . / 0-9 : ; < = > ? @ A-Z` + diverse Unicode-Diakritika (ä, ö, ü, etc.)
**`DY` Array (ERLAUBTE_LEERZEICHEN):** `\t`, `\n`, `\r` — Tabs/Zeilenumbrüche erlaubt in Texten

### Nachrichten-Text-Restriktionen (Server-seitig!)

| Feld | UI-Limit | Server-Limit | Error-Code |
|---|---|---|---|
| Betreff min. | 1 Zeichen | 1 gültiges Zeichen | FFP 200 |
| Betreff max. | 50 Zeichen (maxLength) | **255 Zeichen** | FFP 210 |
| Betreff Zeichen | — | ERLAUBTEZEICHEN | FFP 220 |
| Text min. | 1 Zeichen | 1 gültiges Zeichen | FFP 230 |
| Text max. | 5000 Zeichen (maxLength) | **1.000 Zeichen** ⚠️ | FFP 310 |
| Text Zeichen | — | ERLAUBTEZEICHEN | FFP 320 |

⚠️ **DISKREPANZ UI vs. Server:** UI erlaubt 5000 Zeichen Text, Server-Error sagt max 1000. Translation könnte veraltet sein.

**DESIGNENTSCHEIDUNG:** JobSync verwendet die **client-seitigen (Browser-)Restriktionen** als eigene Limits — nicht die laxeren Server-Limits. Gründe:
- Verhält sich exakt wie ein normaler Browser-Benutzer
- **Fingerprint-Vermeidung:** Server-seitige Limits zu kennen und auszunutzen wäre ein Verhalten das kein regulärer Browser-User zeigt — könnte als automatisierter Zugriff erkannt werden
- **Rate-Limiting-Prävention:** Requests die Server-Validierungen triggern (FFP-Errors) erzeugen vermutlich Logeinträge. Häufige Validierungsfehler könnten Anomaly-Detection-Schwellwerte auslösen.
- **Request-Pattern-Konsistenz:** Ein normaler Benutzer sendet immer Daten die den UI-Constraints entsprechen (da die UI das erzwingt). Daten die UI-Limits überschreiten aber Server-Limits einhalten sind ein klares Signal für API-Direktzugriff.
- **Zukunftssicherheit:** Wenn der Server seine Limits verschärft (auf UI-Niveau), bricht nichts
- Client-Limits sind die "offizielle" Schnittstelle zum Benutzer — alles darüber hinaus ist implizites Wissen

### Server-Validierung Pflichtfelder

| Feld | Error-Code | Detail |
|---|---|---|
| Betreff | FFP 200 | Mind. 1 gültiges Zeichen |
| Bezug | FFP 204 | Aus Anliegen-Katalog |
| Dienststellennummer | FFP 206 | 5-stellig |
| Dienststellenname | FFP 208 | Muss übergeben werden |
| Vertrauensniveau | FFP 209 | Login-Level |

### Server-Validierung Geschäftsregeln

| Regel | Error-Code | Detail |
|---|---|---|
| Dienststelle ungültig | FFP 1000 | Empfänger existiert nicht |
| Bezug nicht für Initial-Nachrichten | FFP 1001 | Manche Bezüge nur für Antworten |
| Bezug nicht für Antworten | FFP 1002 | Manche Bezüge nur für Erstanfragen |
| Anhänge verboten für Bezug | FFP 1003 | `anhangErlaubt: false` im Katalog |
| Gelöschte Nachricht nicht beantwortbar | FFP 1004 | Muss erst wiederhergestellt werden |
| Gelöschter Entwurf nicht bearbeitbar | FFP 1005 | Muss erst wiederhergestellt werden |

### Noch zu verifizieren (nächste Session)

- [ ] Exakter Request-Body für `POST /ordner/senden/nachrichten` (welche Felder?)
- [x] ~~Upload-Service URL~~ → **VERIFIZIERT:** `rest.arbeitsagentur.de/kokos/kokos-ui-service/ud/v1/`
- [x] ~~Erlaubte Dateitypen~~ → **VERIFIZIERT:** PDF, PNG, JPEG, BMP (Magic-Byte-Prüfung!)
- [x] ~~Max. Dateigröße~~ → **VERIFIZIERT:** 7,5 MB (Einzel + Gesamt)
- [x] ~~Dateiname-Restriktionen~~ → **VERIFIZIERT:** 80 Zeichen, kein Punkt/Space am Anfang/Ende
- [ ] Response-Body von `GET /ordner/{type}/nachrichten/{id}` (Nachricht-Detail-Schema)
- [ ] Antwort auf existierende Nachricht — eigener Endpoint oder gleicher Send mit Referenz?
- [ ] Tatsächliches Server-Limit für Text (1000 oder 5000?)

## Protocol Observations

- **Initialization required**: `POST /postfach` must be called first to establish context (likely sets server-side session state)
- **Identity URN format**: `urn:bafor:step:person:kundennummer:{10-char-alphanumeric}` — consistent across all services
- **Anonymous senders**: Institutional messages have `autorId: null` and generic `autorName: "Mitarbeiter bzw. Mitarbeiterin"` — caseworker name is NOT exposed via this API (different from the vamJB legacy system where the name IS shown)
- **No pagination observed**: All messages returned in one response (may have limits not yet hit)
- **Microsecond timestamps**: `datum` includes microsecond precision
- **Dual OAuth WC path**: Kokos uses `/websso-prod/oiam-oauth-wc/` while profil-ui uses `/oiambk/oiam-oauth-wc/` — same component, different deployment path
- **Session-Timer NICHT in Kokos-App**: Die `session-expiration-*` Web Components existieren nur in `profil-ui`, NICHT in `kokos-ui`. Jede App managt Token-Lifetime unabhängig.
- **Compose-Flow ist rein client-seitig**: Anliegen-Katalog wird beim Seitenladen einmalig geladen, danach keine API-Calls bis zum finalen Senden/Speichern
- **Online-Kommunikation gate**: Entire mailbox is gated by a user setting (`onlinekommunikation: true` in kusos einstelloptionen). If disabled, no messages can be sent or received.
