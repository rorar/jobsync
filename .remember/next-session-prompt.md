# Session Handoff: arbeitsagentur.de Keep-Alive Verification + GraphQL

## Kontext

Session 2026-05-17 hat CDP-Automation komplett aufgebaut:
- `cdp-login-bundid.mjs` — Vollautomatischer Login (verifiziert, 72s)
- `cdp-keep-alive.mjs` — Auto-dismiss Inaktivitäts-Popup (Trigger gefixt, noch nicht live-verifiziert)
- `cdp-anonymize.mjs` — Shared PII-Redaction (30 Patterns, live-verifiziert)
- OpenAPI Spec: 37 Paths, 39 Schemas, vollständig

## Offene Tasks

| # | Task | Priorität |
|---|---|---|
| 1 | Keep-Alive live verifizieren (Login → sofort starten → 5 Min warten) | HOCH |
| 2 | Login-Script Phase 4 Bug fixen (Grid-Cards überdecken "Anmelden" Button) | HOCH |
| 3 | GraphQL Introspection (Blindspot #3) — alternativer Query nötig | Mittel |

## Kritische Erkenntnisse (für Implementierung)

- **API-Auth:** Bearer Token + Cookies (`credentials: 'include'`) = Pflicht. x-api-key ist irrelevant.
- **Inaktivität:** ~2-3 Min, CDP mouseMoved zählt NICHT. Nur echter UI-Event oder Popup-Click.
- **Keep-Alive Trigger:** `DOM.performSearch` für `inactivity-countdown` (existiert nur wenn Popup sichtbar)
- **Session-Timer:** `auth_time + 1800 - now()` aus JWT (sessionStorage key: `oidc.user:...:profil-online`)
- **BundID Clicks:** `Input.dispatchMouseEvent` (CDP trusted) nötig für Vue 3 Buttons

## Infrastruktur

- **Browser-Bridge:** `~/bin/browser-bridge.sh` → CDP at `127.0.0.1:9223`
- **Login:** `node cdp-login-bundid.mjs` (automatisch bis AusweisApp, dann manuell eID)
- **Keep-Alive:** `node cdp-keep-alive.mjs` (sofort nach Login starten!)
- **CDP-Scripts:** `src/lib/connector/arbeitsagentur-account/cdp-scripts/`
- **Session-Limit:** 30 Min Hard (auth_time + 1800), Access Token 240s, Refresh auto

## Designentscheidungen (bindend)

- **Browser-seitige Restriktionen verwenden** (nicht laxere Server-Limits) um Fingerprinting zu vermeiden
- **Keine Nachrichten senden/feuern** — nur Read-Operationen + Formular-Exploration ohne Submit
- **Alle Daten anonymisieren** — keine echten Namen, Kundennummern, Adressen, Tokens in Dateien

## Offene Blindspots (nach Priorität)

| # | Blindspot | Risiko | Nächste Aktion |
|---|---|---|---|
| 3 | GraphQL Schema (`aue/api/pd/graphql`) | Mittel | Standard-Introspection rejected. Try: `{ __schema { types { name kind } } }` |
| 1 | Vermittlungspostfach (vamJB REST-API) | Mittel | Navigate zu Betreuer-Seite, Network-Capture |
| 4 | miso Notifications Detail-API | Niedrig | `GET /miso/miso-service/pd/v2/mitteilungen` testen |
| 5 | Bescheide-API | Niedrig | Spätere Session |
| 7 | Profil-Wechsel API | Niedrig | Spätere Session |
| 10 | Keep-Alive UserScript/Extension | Niedrig | Eigene Session (separates Projekt) |

## Wichtige Dateien

| Datei | Inhalt |
|---|---|
| `docs/arbeitsagentur-api/README.md` | Übersicht + Auth-Pattern |
| `docs/arbeitsagentur-api/openapi.yaml` | OpenAPI 3.1 Spec (37 Paths, 39 Schemas) |
| `docs/arbeitsagentur-api/auth-flow.md` | Login-Flow (23 Steps, JWT Claims, UI-Selektoren) |
| `docs/arbeitsagentur-api/session-lifecycle.md` | Session-Timing, Cookies, Keep-Alive, Logout |
| `docs/arbeitsagentur-api/postfach-protocol-spec.md` | KOKOS Postfach (CRUD, Compose, Upload, Anliegen) |
| `docs/arbeitsagentur-api/termine-protocol-spec.md` | OTA Termine-Service |
| `docs/arbeitsagentur-api/profil-page-apis.md` | Profil-Dashboard APIs |
| `docs/ROADMAP.md` §1.9 | arbeitsagentur.de Account-Modul (Phasen 1-4) |
| `src/lib/connector/arbeitsagentur-account/cdp-scripts/` | 13 Browser-Automation-Scripts |

## Skills für nächste Session

- `/protocol-reverse-engineering` — für Network-Capture + Analyse
- `/documentation-generation:openapi-spec-generation` — für OpenAPI Spec Updates
- Direkte CDP-Verbindung via Node.js (kein Playwright MCP — das versucht lokalen Chrome zu starten)

## Empfohlene Reihenfolge

1. `node cdp-login-bundid.mjs` (Login)
2. `node cdp-keep-alive.mjs` (sofort danach, im Hintergrund)
3. Tasks abarbeiten mit stabiler Session
