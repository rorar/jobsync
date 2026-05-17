# Profil-Seite APIs

> Erfasst: 2026-05-17, via CDP Network Capture auf `web.arbeitsagentur.de/profil/profil-ui/pd/`

## Zusammenfassung

62 Requests bei einem Page-Load, davon 23 relevante API-Calls (Rest: CORS OPTIONS + statische Assets).
Alle authentifizierten Calls nutzen `Authorization: Bearer <token>`.

## API-Katalog

### Profil & Personalisierung

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `profil/profil-service/pd/v1/personalization` | GET | `{"sektionen":[]}` | Dashboard-Layout (Reihenfolge der Sektionen) |
| `kusos/kusos-public-service/pd/v5/person/einstelloptionen` | GET | `{"datenuebernahme":true,"onlinekommunikation":true,"videokommunikation":false,"sms":true}` | Kommunikations-Einstellungen |

### Notifications

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `miso/miso-service/pd/v2/mitteilungen/anzahl` | GET | `{"gesamt":40,"keineKenntnisnahme":2}` | Notification-Count (Glocke) |

### Postfächer

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `kokos/kokos-ui-service/pd/v1/ordner` | GET | Array von Ordnern mit `{id, name, anzahlGesamt, anzahlUngelesen}` | Leistungspostfach (Ordner: entwurf, erhalten, geloescht, gesendet) |
| `vamJB/jobboerse/pd/v1/postfachnachrichten` | GET | `{"anzahlGesamt":2,"anzahlUngelesen":0}` | Vermittlungspostfach |

### Bescheide

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `besch-schriftstueck-service/api/pd/v2/schriftstueckanzahlungelesen` | GET | `{"anzahlUngeleseneSchriftstuecke":0}` | Ungelesene Bescheide Count |

### Termine

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `portal/ota-service/pd/v1/upcoming/appointment` | GET | `{"subject":"Vermittlungsgespräch","contactType":"VIDEO","date":"2026-05-18","responsible":"<NAME>","startTime":"09:00"}` | Nächster Termin |

### Vermittlung & Jobsuche

| Endpoint | Method | Format | Beschreibung |
|---|---|---|---|
| `vermittlung/vamio-jsonapi/pd/v1/person/{kundennr}` | GET | JSON:API 1.0 | Person + Includes (Dienststelle, Vermittlungsmerkmale) |
| `vermittlung/vamio-jsonapi/pd/v1/person/{kundennr}/zugeordneteDienststelle` | GET | JSON:API 1.0 | Zugeordnete Dienststelle |
| `vermittlung/nks-service/pd/v1/kundeninformation` | GET | JSON | "Nächste Schritte" (Lebenslauf, Eignung, Fähigkeiten, AV-Status) |
| `vermittlung/oalo-service/pd/v1/kundeninformation` | GET | JSON | Arbeitsuchend/Arbeitslos-Meldung Status |
| `jobboerse/vv-service/pd/v2/vv` | GET | JSON | Vermittlungsvorschläge `{anzahlGesamt, anzahlNeue, einsprungslink, letzterAufruf}` |
| `jobboerse/vv-service/pd/v2/se` | GET | JSON | Stellenempfehlungen/Suchaufträge |
| `jobboerse/vv-service/pd/v2/inaktivevv` | HEAD | - | Inaktive Vermittlungsvorschläge (nur Count im Header?) |
| `jobboerse/jobsuche-service/pd/v1/suchauftraege/teaser` | GET | JSON Array | Suchaufträge-Teaser |
| `jobboerse/jobsuche-service/pd/v1/vormerkungen/teaser` | GET | JSON Array | Gemerkte Stellen Teaser |

### Geldleistungen & Vorgänge

| Endpoint | Method | Format | Beschreibung |
|---|---|---|---|
| `aue/api/pd/graphql` | POST | GraphQL | Vorgänge/Leistungsgruppen (Query: `gruppenV2`) |
| `leist/api/pd/v1/leistungen/privatPerson` | GET | JSON | ALG/BAB Leistungsübersicht |
| `bgdo/bgdo-public-api/pd/v3/bgdaten` | GET | JSON | Bedarfsgemeinschaft (BG-Nummer, Team, Bevollmächtigter) |

### Dienststellen & Kontakt

| Endpoint | Method | Format | Beschreibung |
|---|---|---|---|
| `dos/dienststellen/pc/v2/orgeinheittyp?dstnr5={nr}` | GET | JSON+HATEOAS | Dienststellen-Typ + Links (HATEOAS `_links`) |
| `apok/kontakt-service/pd/v1/kontakt/dienststelle/{dstnr}` | GET | JSON | Dienststellen-Adresse (Straße, PLZ, Ort, Hausnummer) |

### System

| Endpoint | Method | Response | Beschreibung |
|---|---|---|---|
| `cmsportal/cmsportal-api/pc/wartungshinweis` | GET | JSON | Wartungsmeldungen (kein Auth nötig — `/pc/` Pfad!) |
| `portal/feedback-service/pc/v1/kontakt/feedback/validation/config` | PUT | JSON | Feedback-Formular Konfiguration |

## Beobachtungen

- **`/pd/` = persönlich (Auth nötig), `/pc/` = public (kein Auth)**
- **JSON:API 1.0** wird von der Vermittlungs-API genutzt (Sparse Fieldsets, Includes)
- **GraphQL** wird für Vorgänge/Leistungen genutzt (`aue/api/pd/graphql`)
- **HATEOAS** Links in Dienststellen-API (Folgeanfragen über `_links`)
- **Rate-Limit: 1000** auf vamio-jsonapi Header (`X-RateLimit-Limit: 1000`)
- **Token-Refresh** automatisch nach ~4 Min (access_token expires_in: 240)
- **CORS:** Alle APIs haben OPTIONS Preflight (Origin: web.arbeitsagentur.de)

## Token-Refresh Details

```
POST sso.arbeitsagentur.de/auth/realms/OCP/protocol/openid-connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<token>
&scope=openid+baportal
&correlation-id=<uuid>
&client_id=profil-online
&client_secret=profil-online
```

Response: `{access_token, expires_in: 240, refresh_expires_in: 3600, refresh_token, token_type: "Bearer", id_token, scope: "openid baportal"}`
