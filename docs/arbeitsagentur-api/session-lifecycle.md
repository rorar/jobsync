# Session-Lifecycle — Verifizierte Erkenntnisse

> Erfasst: 2026-05-17, via CDP Session-End-Watcher + curl Token-Test

## Verifizierte Fakten

| Eigenschaft | Wert | Quelle |
|---|---|---|
| Browser-Session Hard-Limit | **30 Minuten** | session-timer WC + Logout beobachtet |
| Access Token Lifetime | 240 Sekunden (4 Min) | Token-Response `expires_in` |
| Refresh Token Lifetime (technisch) | 3600 Sekunden (1 Std) | Token-Response `refresh_expires_in` |
| Refresh Token nach 30 Min | **UNGÜLTIG** (`invalid_grant: Session not active`) | curl-Test verifiziert |
| Inaktivitäts-Timeout | ~5 Minuten | `session-expiration-inactivity-warn-popup` |
| Logout-Auslöser | **Client-seitig** (oiam-oauth-wc) | Network-Capture |
| Logout-Methode | `GET /openid-connect/logout?id_token_hint=...` | Network-Capture |
| Session-Timer Location | NUR in `profil-ui` (NICHT in kokos-ui, termine) | DOM-Inspection |
| SSO Cross-App | Funktioniert (stille Code-Exchange, ~2s) | Navigation beobachtet |

## Session-Ende Sequenz (beobachtet)

```
T+29:59  oiam-oauth-wc: letzter Token-Refresh (erfolgreich)
T+30:00  session-timer: Countdown = 0
T+30:00  oiam-oauth-wc: GET /openid-connect/logout?id_token_hint={TOKEN}
T+30:01  Browser: Redirect zu www.arbeitsagentur.de
T+30:01  Server: Session invalidiert → alle Refresh Tokens ungültig
```

## Implikationen für JobSync-Modul

### API-Nutzung

- **Effektives Fenster: 30 Minuten nach Login**
- Innerhalb dieser 30 Min: Access Token alle 4 Min refreshen (automatisch)
- Nach 30 Min: Refresh Token ist tot, Re-Auth nötig
- Keine Möglichkeit über API allein die Session zu verlängern

### Keep-Alive-Strategie (für Browser-Extension)

Der Logout wird **CLIENT-seitig** ausgelöst. Mögliche Interventionspunkte:

1. **Intercepte den Logout-Request** bevor er den Server erreicht (Service Worker oder Request-Blocker)
2. **Reset den session-timer** durch simulierte User-Interaktion
3. **Verlängere die Session server-seitig** durch rechtzeitigen API-Call der als "Aktivität" zählt

**Hypothese (zu verifizieren):** Wenn der Logout-Request nie gesendet wird, lebt die SSO-Session weiter (Refresh Token bis 3600s gültig). Der Server terminiert nicht aktiv — nur der Client tut es.

### Architektur-Optionen

| Option | Mechanismus | Risiko | Effektives Fenster |
|---|---|---|---|
| A: Nichts tun | Session endet nach 30 Min | Kein | 30 Min |
| B: Logout intercepten | Block GET /logout in Extension | Mittel — Server könnte parallel invalidieren | Bis 60 Min? |
| C: Timer resetten | DOM-Manipulation des session-timer WC | Niedrig — rein client-seitig | Theoretisch unbegrenzt |
| D: Activity simulieren | Periodisch API-Calls machen (als "User-Aktivität") | Niedrig | Bis Inaktivitäts-Timeout reset |

**Noch zu klären:** Ist der 30-Min-Timer ein ABSOLUTES Limit (auth_time + 30min) oder ein INAKTIVITÄTS-Timer der durch Activity resetbar ist?

## Token-Refresh Sequenz (normal, innerhalb 30 Min)

```http
POST /auth/realms/OCP/protocol/openid-connect/token HTTP/1.1
Host: sso.arbeitsagentur.de
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token={CURRENT_REFRESH_TOKEN}
&scope=openid+baportal
&correlation-id={UUID}
&client_id=kokos
&client_secret=kokos
```

Response (200):
```json
{
  "access_token": "eyJ...",
  "expires_in": 240,
  "refresh_expires_in": 3600,
  "refresh_token": "eyJ...",
  "token_type": "Bearer",
  "id_token": "eyJ...",
  "not-before-policy": 0,
  "session_state": "{UUID}",
  "scope": "openid baportal"
}
```

## Token-Refresh nach Session-Ende (FEHLSCHLAG)

```json
{
  "error": "invalid_grant",
  "error_description": "Session not active"
}
```

## Beobachtete Token-Refresh-Intervalle

Aus Session-Watcher:
```
[01:46:04] Token-Refresh (Session 1 — letzer erfolgreicher)
[01:46:26] Logout (Session 1 — 30 Min vorbei)
...
[01:56:59] Token-Refresh (Session 2 — erster nach neuem Login)
[01:59:50] Token-Refresh (Session 2 — nach App-Wechsel zu kokos)
```

Der oiam-oauth-wc refresht proaktiv — nicht erst wenn 401 kommt, sondern auf Timer-Basis (vermutlich bei ~80% der Access-Token-Lifetime = nach ~192s).
