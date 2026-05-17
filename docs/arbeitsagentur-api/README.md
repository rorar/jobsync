# arbeitsagentur.de API Discovery

> Ergebnisse der Live-Browser-Session API-Analyse (2026-05-17).
> Alle Daten anonymisiert — keine persönlichen Informationen.

## Auth-Pattern

- **OAuth2 Bearer Token** auf allen APIs (PKCE + S256)
- **Token-Endpoint:** `POST sso.arbeitsagentur.de/auth/realms/OCP/protocol/openid-connect/token`
- **Clients:** `profil-online`, `ota-online`, `kokos` (jeweils eigener Client pro App)
- **Scope:** `openid baportal`
- **Token-Lifetime:** Access Token 240s (4 Min), Refresh Token 3600s (technisch)
- **Session-Hard-Limit:** 30 Minuten (auth_time + 1800, client-initiated Logout)
- **Inaktivitäts-Timeout:** ~2-3 Min (nur UI-Events resetten, API-Calls zählen NICHT)
- **Rate-Limit:** 1000 req (auf vamio-jsonapi bestätigt)

### Cookies erforderlich (KRITISCH)

Alle authentifizierten Requests an `rest.arbeitsagentur.de` benötigen **Cookies** (`credentials: 'include'`). Ohne Cookies: **403 Forbidden** trotz gültigem Bearer Token.

```javascript
// KORREKT:
fetch(url, { headers: { 'Authorization': 'Bearer ' + token }, credentials: 'include' });

// FALSCH (403):
fetch(url, { headers: { 'Authorization': 'Bearer ' + token } });
```

**Erforderliche Cookies** (werden automatisch bei Login gesetzt):
- `ISTIOSESSIONID` — Istio Service Mesh Sticky-Session
- `AVI_SITE` — Load-Balancer-Affinity

**x-api-key:** Die Angular-App sendet `x-api-key: {client_id}` mit, aber das ist NICHT der Access-Control-Mechanismus. Verifiziert: x-api-key macht keinen Unterschied (403→403 ohne Cookies, 200→200 mit Cookies unabhängig von x-api-key).

## Dateien

| Datei | Inhalt | Status |
|---|---|---|
| `auth-flow.md` | Kompletter Auth-Flow (BundID + eID, 23 Steps, JWT Claims) | Vollständig |
| `session-lifecycle.md` | Session-Timing, Token-Refresh, 30-Min-Limit (verifiziert) | Vollständig |
| `profil-page-apis.md` | APIs der Profil-Übersichtsseite (23 Endpoints) | Vollständig |
| `termine-protocol-spec.md` | OTA Termin-Service Protocol Specification | Vollständig |
| `postfach-protocol-spec.md` | KOKOS Leistungspostfach Protocol Spec (inkl. Compose-Flow) | Teilweise (Send-API fehlt) |
| `termine-apis.md` | Kurzform Termine-APIs (Rohdaten) | Vollständig |
| `postfach-apis.md` | Kurzform Postfach-APIs (Rohdaten) | Vollständig |

## Base-URL

| Pfad-Muster | Auth | Beispiel |
|---|---|---|
| `rest.arbeitsagentur.de/{service}/{api}/pd/v{n}/` | Bearer Token (persönlich) | `profil-service/pd/v1/personalization` |
| `rest.arbeitsagentur.de/{service}/{api}/pc/v{n}/` | Kein Auth (public) | `cmsportal-api/pc/wartungshinweis` |

## Entdeckte API-Services (30 Endpoints)

| Service | Base | Format | Zweck |
|---|---|---|---|
| `profil/profil-service` | pd/v1 | JSON | Dashboard-Personalisierung |
| `miso/miso-service` | pd/v2 | JSON | Notifications (Glocke) |
| `miso/miso-notification-service` | pd/v2 | JSON | Email-Benachrichtigungs-Config |
| `kokos/kokos-ui-service` | pd/v1 | JSON | Leistungspostfach (Nachrichten, Ordner, Anliegen) |
| `vamJB/jobboerse` | pd/v1 | JSON | Vermittlungspostfach |
| `vermittlung/vamio-jsonapi` | pd/v1 | JSON:API 1.0 | Person + Dienststelle + Vermittlungsmerkmale |
| `vermittlung/nks-service` | pd/v1 | JSON | "Nächste Schritte" |
| `vermittlung/oalo-service` | pd/v1 | JSON | Arbeitsuchend/Arbeitslos-Status |
| `jobboerse/vv-service` | pd/v2 | JSON | Vermittlungsvorschläge + Stellenempfehlungen |
| `jobboerse/jobsuche-service` | pd/v1 | JSON | Suchaufträge + Vormerkungen |
| `portal/ota-service` | pd/v1 | JSON | Termine (CRUD) |
| `portal/otv-service` | pd/v1 | JSON | Dienststellen für Terminbuchung |
| `aue/api` | pd/graphql | GraphQL | Vorgänge/Leistungsgruppen |
| `leist/api` | pd/v1 | JSON | ALG/BAB Leistungen |
| `bgdo/bgdo-public-api` | pd/v3 | JSON | Bedarfsgemeinschaft |
| `besch-schriftstueck-service/api` | pd/v2 | JSON | Bescheide (Count) |
| `dos/dienststellen` | pc/v2 | JSON+HATEOAS | Dienststellen-Info (public!) |
| `apok/kontakt-service` | pd/v1 | JSON | Dienststellen-Kontaktdaten |
| `kusos/kusos-public-service` | pd/v5 | JSON | Kommunikations-Einstellungen |
| `cmsportal/cmsportal-api` | pc | JSON | Wartungshinweise (public) |
| `portal/feedback-service` | pc/v1 | JSON | Feedback-Formular Config |

## Noch zu explorieren (nächste Sessions)

- [ ] Einzelne Nachricht lesen (GET /ordner/{id}/nachrichten/{nachrichtId})
- [ ] Nachricht senden (POST — JS-Source-Code reverse-engineeren)
- [ ] Vermittlungspostfach-API Details (vamJB REST vs. Legacy-HTML)
- [ ] Betreuer-API (existiert als REST? oder nur vamJB Legacy?)
- [ ] Bescheide-Service Details (Dokument-Download)
- [ ] miso-service Notification Details (GET /mitteilungen)
- [ ] Vermittlungsvorschläge Detail-Endpoint
- [ ] GraphQL Schema Introspection (aue/api/pd/graphql)
- [ ] Keep-Alive Strategie verifizieren (Logout-Intercept vs. Timer-Reset)
