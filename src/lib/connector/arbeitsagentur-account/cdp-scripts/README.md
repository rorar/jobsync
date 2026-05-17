# arbeitsagentur.de CDP Scripts

Browser-Automation-Scripts für die Live-Session-Exploration von arbeitsagentur.de.
Verbindung via Chrome DevTools Protocol (CDP) über SSH-Reverse-Tunnel.

## Voraussetzungen

- Browser-Bridge aktiv: `~/bin/browser-bridge.sh`
- CDP Endpoint: `http://127.0.0.1:9223`
- Node.js 22+ (native WebSocket)

## Scripts

| Script | Zweck |
|---|---|
| `cdp-login-start.mjs` | Navigiert zum Login, Cookie-Banner weg, BundID klicken |
| `cdp-bundid-full.mjs` | BundID-Flow: Anmelden → Online-Ausweis → WEITER MIT AUSWEISAPP |
| `cdp-auto-complete.mjs` | Auto-Clicker: WEITER-Modal + "Online Angebot nutzen" (Guardian) |
| `cdp-api-discovery.mjs` | Erfasst alle XHR/Fetch API-Calls einer Seite (60s window) |
| `cdp-navigate-capture.mjs` | Navigiert zu URL + erfasst APIs (für Termine etc.) |
| `cdp-postfach-deep.mjs` | Deep-Dive Postfach: Nachrichten öffnen, Ordner wechseln |
| `cdp-compose-weiter.mjs` | Compose-Flow: Ansprechpartner → Anliegen → Formular |
| `cdp-capture-part2.mjs` | Auth-Flow Capture (Netzwerk-Mitschnitt mit Anonymisierung) |
| `cdp-session-end-watch.mjs` | Beobachtet Session-Ende (Logout, Token-Failures, Modals) |

## Verwendung

```bash
node scripts/arbeitsagentur-cdp/cdp-login-start.mjs
# → User macht eID-Login
node scripts/arbeitsagentur-cdp/cdp-auto-complete.mjs &
# → Wartet auf WEITER-Modals und klickt sie automatisch
node scripts/arbeitsagentur-cdp/cdp-api-discovery.mjs
# → Erfasst alle API-Calls der aktuellen Seite
```

## Anonymisierung

Alle Scripts anonymisieren automatisch:
- Bearer Tokens → `<REDACTED>`
- Kundennummer → `<KUNDENNR>`
- Personennamen → `<REDACTED>`
- Betreuer-Namen → `<BETREUER>`
- Ortsnamen → `<ORT>`
- Dienststellennummern → `<DSTNR>`
