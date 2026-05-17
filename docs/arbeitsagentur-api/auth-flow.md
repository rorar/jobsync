# arbeitsagentur.de Auth Flow — Vollständige Dokumentation

> Erfasst: 2026-05-17, via CDP Network Capture + Session-End-Watcher
> Alle Tokens/Codes anonymisiert.

## Übersicht

```
User → Browser → arbeitsagentur.de (Keycloak) → BundID (SAML2) → AusweisApp (localhost:24727)
                                                                         ↓
User → Browser ← arbeitsagentur.de (Keycloak) ← BundID (SAML2) ← eID-Server
```

## Beteiligte Systeme

| System | URL | Rolle | Protokoll |
|---|---|---|---|
| Keycloak (BA) | `sso.arbeitsagentur.de/auth/realms/OCP` | Identity Provider / Broker | OIDC (PKCE) |
| BundID | `id.bund.de` | Identity Broker (föderiert) | SAML2 (inbound) + eigene API |
| AusweisApp | `127.0.0.1:24727` | Lokaler eID-Client | localhost HTTP |
| eID-Server | (transparent) | Ausweis-Validierung | eID-Protokoll |
| OAuth WC | `web.arbeitsagentur.de/oiambk/oiam-oauth-wc/` | Browser Token-Management | JS Web Component |

## OAuth-Clients (Keycloak Realm: OCP)

| Client ID | App | Redirect URI | Secret (public!) |
|---|---|---|---|
| `profil-online` | Profil-Dashboard | `/profil/profil-ui/pd/` | `profil-online` |
| `ota-online` | Terminverwaltung | `/portal/termine/pd` | (unbekannt) |
| `kokos` | Leistungspostfach | `/kokos/kokos-ui/pd/` | `kokos` |

Alle Clients nutzen:
- PKCE (S256)
- Scope: `openid baportal`
- Access Token Lifetime: 240s
- Refresh Token Lifetime: 3600s (technisch), **effektiv 30 Min** (Server invalidiert bei Session-Ende)

## Login-Flow (BundID + eID)

### Phase 1: Keycloak → BundID Redirect

```
1. GET  /profil/profil-ui/pd/
   → 302 → sso.arbeitsagentur.de/auth/realms/OCP/protocol/openid-connect/auth
     ?client_id=profil-online
     &redirect_uri=https://web.arbeitsagentur.de/profil/profil-ui/pd/
     &response_type=code
     &scope=openid
     &code_challenge={S256_HASH}
     &code_challenge_method=S256
     &acr_values=login-filter=privatperson,unternehmen,partner

2. User klickt "BundID" (onClickBundId → POST form mit chosen-login-type=bundid)

3. POST /login-actions/authenticate?execution=login-provider
   → Keycloak verarbeitet IDP-Auswahl

4. Zwischenseite: "Zum BundID-Portal wechseln"
   → User klickt "Zur BundID wechseln"

5. POST /login-actions/authenticate?execution=idp-redirector
   → 303 → /broker/bundid/login?session_code=...

6. POST id.bund.de/idp/profile/SAML2/POST/SSO
   → SAML2 AuthnRequest an BundID
   → 302 → id.bund.de/de/redirect?context=FACHVERFAHREN
```

### Phase 2: BundID UI-Flow

```
7. GET id.bund.de/api/v1/nutzerkonto-management/public/sessionInfo
8. GET id.bund.de/api/v1/nutzerkonto-management/public/fachverfahrenFlowState (Polling!)

9. User wählt "Online-Ausweis" (data-test-id="sjqET")
10. User klickt "Anmelden" (2nd button)
11. Modal: "Haben Sie alles für die Anmeldung?" → "WEITER MIT AUSWEISAPP"
```

### Phase 3: AusweisApp (lokal)

```
12. AusweisApp kommuniziert über 127.0.0.1:24727/eID-Client
    → mit tcTokenURL pointing to id.bund.de/idp/set-cookies

13. User-Interaktion in AusweisApp:
    a) "Weiter zu PIN-Eingabe"
    b) USB-Lesegerät oder Smartphone verbinden (vorher gekoppelt)
    c) Ausweis auf Gerät legen (NFC oder USB)
    d) 6-stellige PIN eingeben
    e) eID-Prüfung läuft

14. → 303 Redirect von localhost:24727 zu:
    id.bund.de/idp/externalNpaAuthn?RelayState={uuid}&_eventId_proceed=1
```

### Phase 4: BundID → Keycloak Rückweg

```
15. POST id.bund.de/login/saml2/sso/idp (SAML Response)
    → 302 → id.bund.de/de/redirect?context=LOGIN&zugangsart=NPA

16. GET id.bund.de/api/.../fachverfahrenFlowState (Flow bereit)

17. POST id.bund.de/api/.../fachverfahren/consent (Datenfreigabe)
18. POST id.bund.de/api/.../fachverfahren/stop (Flow beenden)

19. Modal: "Sie werden jetzt zurückgeleitet zu: Bundesagentur für Arbeit."
    → User/Guardian klickt "WEITER" (data-test-id="d0gQ0")

20. POST sso.arbeitsagentur.de/.../broker/bundid/endpoint
    → SAML Assertion an Keycloak
    → 302 → /login-actions/post-broker-login
```

### Phase 5: Keycloak Post-Login → Token

```
21. Seite: "Willkommen zurück" → User klickt "Online Angebot nutzen"

22. POST /login-actions/post-broker-login?execution=bundid-response-handler-second-run
    → 302 → /broker/after-post-broker-login
    → 302 → /login-actions/required-action?execution=provide-login-infos
    → 302 → web.arbeitsagentur.de/profil/profil-ui/pd/?state=...&session_state=...&code=...

23. App tauscht Code gegen Token:
    POST /protocol/openid-connect/token
    Content-Type: application/x-www-form-urlencoded
    
    grant_type=authorization_code
    &redirect_uri=https://web.arbeitsagentur.de/profil/profil-ui/pd/
    &code={AUTH_CODE}
    &code_verifier={PKCE_VERIFIER}
    &correlation-id={UUID}
    &client_id=profil-online
    &client_secret=profil-online
    
    → Response: { access_token, expires_in: 240, refresh_token, refresh_expires_in: 3600, ... }
```

## Session-Lifecycle

### Timing

| Event | Zeitpunkt | Quelle |
|---|---|---|
| Login abgeschlossen | T+0 | Token erhalten |
| Access Token expired | T+4min | `expires_in: 240` |
| Token Refresh (automatisch) | alle ~4 Min | oiam-oauth-wc |
| Session-Timer Warnung (5 Min) | T+25min | `session-expiration-5m-warn-popup` (nur profil-ui!) |
| **Session-Ende (Hard)** | **T+30min** | Client-initiated Logout |
| Refresh Token technisch expired | T+60min | `refresh_expires_in: 3600` — aber Session ist schon tot |

### Session-Ende (verifiziert)

```
[T+30min] oiam-oauth-wc sendet:
  GET /protocol/openid-connect/logout?id_token_hint={TOKEN}
  → Server invalidiert Session
  → Browser redirected zu www.arbeitsagentur.de

Danach: Refresh Token → "invalid_grant: Session not active"
```

**WICHTIG:** Der Session-Timer (`session-expiration-*` WC) existiert NUR in `profil-ui`! 
Andere Apps (kokos-ui, termine) haben KEINEN eigenen Timer, teilen aber die SSO-Session.
Wenn profil-ui den Logout triggert, sind ALLE Apps betroffen.

### BundID Transient Error

```
Bekanntes Problem: id.bund.de/de/datenverarbeitung-fehler
  → 403 auf /fachverfahrenFlowState
  → 403 auf /deleteSession
  → Dann trotzdem: Redirect zurück mit erfolgreicher Auth
  → "WEITER"-Modal erscheint nach dem Fehler

Guardian-Pattern nötig: Nicht auf linearen Erfolg vertrauen, 
sondern auf "WEITER"-Modal als Erfolgs-Signal warten.
```

## Token-Refresh zwischen Apps (SSO Cross-Client)

Wenn User von einer App zur anderen navigiert:

```
profil-ui (client: profil-online) → kokos-ui (client: kokos)

1. Browser navigiert zu /kokos/kokos-ui/pd/
2. kokos-OAuth-WC prüft: habe ich ein Token? → Nein
3. → Redirect zu /openid-connect/auth?client_id=kokos&...
4. Keycloak erkennt: SSO-Session aktiv → kein Login nötig!
5. → 302 zurück mit neuem Auth-Code für kokos
6. → Token-Exchange: code → access_token für kokos-Client

Dauer: ~2 Sekunden (kein User-Interaction nötig)
```

## Buttons / UI-Elemente im Login-Flow (für Automation)

| Step | Element | Selektor | Aktion |
|---|---|---|---|
| Login-Seite: BundID wählen | Button | `onClickBundId()` / `#mitBundIdButton` | JS function call |
| Zwischenseite | Button | Text: "Zur BundID wechseln" | click |
| BundID: Anmelden | Button | Text: "Anmelden" (1st) | click |
| BundID: Online-Ausweis | Button | `[data-test-id="sjqET"]` | click |
| BundID: 2nd Anmelden | Button | Text: "Anmelden" (2nd) | click |
| BundID: WEITER MIT AUSWEISAPP | Button | Text: "WEITER MIT AUSWEISAPP" | click |
| BundID: WEITER (Redirect) | Button | `[data-test-id="d0gQ0"]` | **Guardian: auto-click** |
| Keycloak: Online Angebot nutzen | Button | Text: "Online Angebot nutzen" | **Guardian: auto-click** |
| Cookie-Banner | Button | `[data-testid="bahf-cookie-disclaimer-btn-ablehnen"]` (Shadow DOM!) | click in shadow |

## OIDC Discovery Endpoint

```
GET https://sso.arbeitsagentur.de/auth/realms/OCP/.well-known/openid-configuration

Supported grant_types:
- authorization_code
- refresh_token
- client_credentials
- urn:ietf:params:oauth:grant-type:token-exchange

ACR values:
- authn-level=STORK-QAA-Level-2 / Level-3 / Level-4
- acting-type=privatperson / unternehmen / partner
- acting-on-behalf-of=urn:bafor:fachschluesselpraefix:...
- force-profile-selection=true

Supported scopes: openid, baportal
```

## JWT Token Claims (aus dekodiertem Access Token)

```json
{
  "exp": 1778980917,
  "iat": 1778980677,
  "auth_time": 1778980586,
  "iss": "https://sso.arbeitsagentur.de/auth/realms/OCP",
  "aud": "kokos",
  "sub": "urn:ekid:{uuid}",
  "typ": "Bearer",
  "azp": "kokos",
  "scope": "openid baportal",
  "benutzertyp": "onlineuser",
  "identifier": "<KUNDENNR>",
  "authn-level": "STORK-QAA-Level-4",
  "acting-on-behalf-of": ["urn:bafor:step:person:kundennummer:<KUNDENNR>"],
  "jwt-version": "2.9",
  "identity": "urn:bafor:step:person:kundennummer:<KUNDENNR>",
  "amr": ["mfa"],
  "groups": ["2", "nid", "profil-online.level-300", "type.privatperson"],
  "acting-type": "privatperson",
  "preferred_username": "<EMAIL>",
  "session_state": "<UUID>",
  "acting-profile-name": "<NAME>"
}
```

**Relevante Claims für JobSync:**
- `identifier` = Kundennummer
- `identity` = URN für API-Calls
- `authn-level` = Login-Trust-Level
- `acting-type` = Profil-Typ (privatperson/unternehmen)
- `groups` enthält `profil-online.level-300` — internes Berechtigungs-Level

## Implementation Notes (ROADMAP 1.9 Modul)

### Login-Methoden-Auswahl

Das Modul MUSS dem Benutzer die Wahl der Login-Methode anbieten. Die Keycloak-Login-Seite zeigt:

| Button-ID | Methode | Trust-Level | UI-Selektoren |
|---|---|---|---|
| `#anmeldenBaKontoButton` | BA-Konto (Benutzername/Passkey) | Level-1 bis Level-2 | Direkt auf SSO-Seite |
| `#mitBundIdButton` | BundID (Online-Ausweis/ELSTER) | Level-3 bis Level-4 | SSO → BundID-Portal |

**Aktuelle Abdeckung:**
- BundID/eID: Vollständig dokumentiert (dieser Flow, oben)
- BA-Konto/Passkey: **NICHT dokumentiert** — erfordert separaten Entwickler mit BA-Konto-Login

**BundID-Portal UI-Selektoren (id.bund.de):**
- Authentifizierungsmethoden-Auswahl: `button[contentid="eID"]` (Online-Ausweis), `button[contentid="ELSTER"]`
- Anmelden-Button: `button[data-test-id="9XNNb"]` (instabil — test-IDs können sich ändern)
- Hinweis: BundID nutzt React — `.click()` funktioniert nicht, nur echte `Input.dispatchMouseEvent` oder manuelle Interaktion

**Architektur-Entscheidung für Modul:**
- Login-Methode wird in den Modul-Settings gespeichert (User wählt einmalig)
- CDP-Script navigiert zur SSO-Seite und klickt den entsprechenden Button
- Ab dort: manuelle Intervention (eID: Ausweis + PIN, BA-Konto: Credentials/Passkey)
- Nach erfolgreichem Login: Agent übernimmt automatisch (Token-Management, API-Calls)
