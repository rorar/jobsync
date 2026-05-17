# Copy-Paste Prompt für nächste Session

```
Lies .remember/next-session-prompt.md und .remember/remember.md ein.

Aufgabe: arbeitsagentur.de CDP Session fortsetzen.

Offene Tasks (Priorität):
1. Keep-Alive v5 — Post-Logout-Navigation lösen (entweder Fetch-Interception erweitern ODER auto-relogin nach Session-Tod akzeptieren). Siehe remember.md "Next" Section.
2. GraphQL Introspection (Blindspot #3) — Standard __schema Query rejected. Alternativen testen.
3. Vermittlungspostfach API (Blindspot #1) — vamJB REST-API erkunden.

Wichtig:
- Browser-Bridge muss laufen: ~/bin/browser-bridge.sh
- Login: node src/lib/connector/arbeitsagentur-account/cdp-scripts/cdp-login-bundid.mjs
- Keep-Alive SOFORT nach Login starten: node src/lib/connector/arbeitsagentur-account/cdp-scripts/cdp-keep-alive.mjs
- Session-Status prüfen: node src/lib/connector/arbeitsagentur-account/cdp-scripts/cdp-session-status.mjs [--watch]
- API-Auth: credentials: 'include' ist Pflicht (Cookies!)
- Keine persönlichen Daten committen/pushen!
- Nachhaltigkeitsprinzip + Kritische Regeln beachten
```
