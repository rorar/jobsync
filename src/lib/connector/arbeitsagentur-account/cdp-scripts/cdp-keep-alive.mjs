// cdp-keep-alive.mjs — Session Keep-Alive v4 for arbeitsagentur.de
// ZERO page interaction. Two layers operating at JS/network level only.
//
// === Architecture ===
//
// Layer 1 — Synthetic keypress (Inactivity Timer Reset)
//   Dispatches `new KeyboardEvent('keypress')` on `document` via Runtime.evaluate
//   every ~60s (±15s jitter). The oiam-oauth-wc listens for 'keypress' and 'mouseup'
//   on the document to detect activity. It does NOT check `isTrusted`, so synthetic
//   (untrusted) events work. This is a pure JS call — no element interaction, no
//   mouse movement, no risk of unintended navigation or clicks.
//
// Layer 2 — Fetch Interception (30-Min Logout Block + Token Backup)
//   CDP Fetch.enable intercepts the client-initiated logout request
//   (GET /openid-connect/logout) BEFORE it reaches the server.
//   Also periodically backs up tokens from sessionStorage, and restores them
//   if the oiam-oauth-wc deletes them during its logout sequence.
//
// Layer 3 — Manual Token Refresh (Server Session Keep-Alive)
//   Refreshes access token via fetch() every ~200s (before 240s expiry).
//   Each refresh updates Keycloak's lastSessionRefresh, extending the
//   server-side SSO session indefinitely.
//
// === Verified Facts (2026-05-17) ===
//   - oiam-oauth-wc activity detection: addEventListener("keypress") + addEventListener("mouseup")
//     on document. Does NOT check isTrusted. Source: p-Bn5gH4YR.js (142KB)
//   - Inactivity timeout: ~2-3 min without activity events
//   - 30-min hard limit: client-initiated by oiam-oauth-wc (auth_time + 1800)
//   - Token refresh resets Keycloak lastSessionRefresh (server-side)
//   - refresh_expires_in: 3600 (server allows 60 min technically)
//   - Synthetic keypress via Runtime.evaluate: CONFIRMED working (5 min test, no popup)

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const ACTIVITY_INTERVAL_MS = 60_000;   // base interval for keypress dispatch
const ACTIVITY_JITTER_MS = 15_000;     // ±15s randomization
const REFRESH_INTERVAL_MS = 200_000;   // token refresh every ~200s (expires at 240s)
const BACKUP_INTERVAL_MS = 30_000;     // backup tokens every 30s
const POLL_INTERVAL_MS = 10_000;       // main loop tick

(async () => {
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

  // --- CDP Connection ---
  const tabs = await fetch(`${CDP_ENDPOINT}/json/list`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) { console.error('No browser tab found'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));

  let msgId = 1;
  const pending = new Map();
  const eventHandlers = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const id = msgId++;
      const timeout = setTimeout(() => { pending.delete(id); resolve({ result: null }); }, 15000);
      pending.set(id, { resolve, timeout });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, timeout } = pending.get(msg.id);
      clearTimeout(timeout);
      pending.delete(msg.id);
      resolve(msg);
    }
    if (msg.method) {
      const handler = eventHandlers.get(msg.method);
      if (handler) handler(msg.params);
    }
  });

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  }

  // --- Layer 1: Synthetic keypress ---
  async function sendActivity() {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keypress', { key: 'x', charCode: 120, bubbles: true }))`);
  }

  // --- Layer 2: Fetch Interception + Token Backup ---
  let logoutBlockCount = 0;
  let tokenBackup = null; // { key, data } — last known good tokens

  async function setupFetchInterception() {
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: '*openid-connect/logout*', requestStage: 'Request' },
      ]
    });

    eventHandlers.set('Fetch.requestPaused', async (params) => {
      const { requestId, request } = params;
      if (request.url.includes('openid-connect/logout')) {
        await send('Fetch.failRequest', { requestId, reason: 'BlockedByClient' });
        logoutBlockCount++;
        log(`LOGOUT BLOCKED (#${logoutBlockCount})`);

        // Restore tokens if they were deleted
        if (tokenBackup) {
          await restoreTokens();
        }
      } else {
        await send('Fetch.continueRequest', { requestId });
      }
    });
  }

  async function backupTokens() {
    const result = await evaluate(`(function() {
      const clients = ['profil-online', 'kokos', 'ota-online'];
      for (const c of clients) {
        const key = 'oidc.user:https://sso.arbeitsagentur.de/auth/realms/OCP:' + c;
        const data = sessionStorage.getItem(key);
        if (data) return JSON.stringify({ key, data });
      }
      return null;
    })()`);
    if (result) {
      tokenBackup = JSON.parse(result);
    }
  }

  async function restoreTokens() {
    if (!tokenBackup) return false;
    const restored = await evaluate(`(function() {
      const key = ${JSON.stringify(tokenBackup.key)};
      const existing = sessionStorage.getItem(key);
      if (!existing) {
        sessionStorage.setItem(key, ${JSON.stringify(tokenBackup.data)});
        return 'restored';
      }
      return 'still_present';
    })()`);
    if (restored === 'restored') {
      log('Tokens restored from backup');
    }
    return restored === 'restored';
  }

  // --- Layer 3: Manual Token Refresh ---
  let refreshCount = 0;

  async function refreshToken() {
    const result = await evaluate(`(async function() {
      const clients = ['profil-online', 'kokos', 'ota-online'];
      for (const clientId of clients) {
        const key = 'oidc.user:https://sso.arbeitsagentur.de/auth/realms/OCP:' + clientId;
        const raw = sessionStorage.getItem(key);
        if (!raw) continue;
        const oidcUser = JSON.parse(raw);
        if (!oidcUser.refresh_token) continue;
        try {
          const resp = await fetch('https://sso.arbeitsagentur.de/auth/realms/OCP/protocol/openid-connect/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            credentials: 'include',
            body: new URLSearchParams({
              grant_type: 'refresh_token',
              refresh_token: oidcUser.refresh_token,
              client_id: clientId,
              client_secret: clientId,
              scope: 'openid baportal'
            })
          });
          if (!resp.ok) return JSON.stringify({ ok: false, status: resp.status });
          const tokens = await resp.json();
          oidcUser.access_token = tokens.access_token;
          oidcUser.refresh_token = tokens.refresh_token;
          oidcUser.id_token = tokens.id_token || oidcUser.id_token;
          oidcUser.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
          sessionStorage.setItem(key, JSON.stringify(oidcUser));
          return JSON.stringify({
            ok: true, client: clientId,
            expiresIn: tokens.expires_in,
            refreshExpiresIn: tokens.refresh_expires_in
          });
        } catch (e) {
          return JSON.stringify({ ok: false, error: e.message });
        }
      }
      return JSON.stringify({ ok: false, error: 'no_session' });
    })()`);
    return JSON.parse(result || '{"ok":false,"error":"evaluate_failed"}');
  }

  // --- Setup ---
  await send('Page.enable');

  // Read initial session info
  const sessionInfo = await evaluate(`(function() {
    const keys = ['profil-online', 'kokos', 'ota-online'];
    for (const k of keys) {
      const raw = sessionStorage.getItem('oidc.user:https://sso.arbeitsagentur.de/auth/realms/OCP:' + k);
      if (raw) {
        const token = JSON.parse(raw).access_token;
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        const remaining = Math.round((payload.auth_time + 1800 - Date.now()/1000) / 60);
        return JSON.stringify({ client: k, remainingMin: remaining, authTime: payload.auth_time });
      }
    }
    return null;
  })()`);

  if (!sessionInfo) {
    log('FEHLER: Keine aktive Session gefunden');
    ws.close();
    process.exit(1);
  }

  const session = JSON.parse(sessionInfo);
  const originalSessionEnd = (session.authTime + 1800) * 1000;

  log(`Keep-Alive v4 gestartet (${session.client})`);
  log(`Original 30-Min-Limit: ${new Date(originalSessionEnd).toISOString()} (${session.remainingMin} Min)`);
  log('Layer 1: synthetic keypress every ~60s (±15s) — idle timer reset');

  await setupFetchInterception();
  log('Layer 2: Fetch interception active (logout blocked + token backup)');

  // Initial token backup
  await backupTokens();

  // Initial token refresh
  const initRefresh = await refreshToken();
  if (initRefresh.ok) {
    refreshCount++;
    log(`Layer 3: Token refresh OK (expires_in=${initRefresh.expiresIn}s, refresh_expires_in=${initRefresh.refreshExpiresIn}s)`);
    await backupTokens(); // backup fresh tokens
  } else {
    log(`Layer 3 WARNING: Initial refresh failed: ${JSON.stringify(initRefresh)}`);
  }

  log('--- All layers active. Session should survive beyond 30 min. ---');

  // --- Main Loop ---
  let activityCount = 0;
  let lastActivityTime = Date.now();
  let lastRefreshTime = Date.now();
  let lastBackupTime = Date.now();
  let running = true;

  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  while (running) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const now = Date.now();

      // Layer 1: keypress with jitter
      const jitter = Math.round((Math.random() * 2 - 1) * ACTIVITY_JITTER_MS);
      if (now - lastActivityTime >= ACTIVITY_INTERVAL_MS + jitter) {
        await sendActivity();
        activityCount++;
        lastActivityTime = now;
      }

      // Layer 2: token backup
      if (now - lastBackupTime >= BACKUP_INTERVAL_MS) {
        await backupTokens();
        lastBackupTime = now;
      }

      // Layer 3: token refresh
      if (now - lastRefreshTime >= REFRESH_INTERVAL_MS) {
        const result = await refreshToken();
        if (result.ok) {
          refreshCount++;
          lastRefreshTime = now;
          await backupTokens();
          const totalMin = Math.round((now - (session.authTime * 1000)) / 60000);
          log(`Token refresh #${refreshCount} OK — session alive ${totalMin} Min total (refresh_expires_in=${result.refreshExpiresIn}s)`);
        } else {
          log(`Token refresh FAILED: ${JSON.stringify(result)}`);
          // Try restoring tokens and retrying
          if (await restoreTokens()) {
            const retry = await refreshToken();
            if (retry.ok) {
              refreshCount++;
              lastRefreshTime = now;
              log('Token refresh succeeded after restore');
            } else {
              log('Token refresh failed even after restore — server session may be dead');
              running = false;
            }
          } else {
            log('No backup available — stopping');
            running = false;
          }
        }
      }

      // Periodic status (every ~5 min = every 30 activities)
      if (activityCount > 0 && activityCount % 5 === 0) {
        const totalMin = Math.round((now - (session.authTime * 1000)) / 60000);
        const beyondLimit = now > originalSessionEnd;
        log(`Status: ${totalMin} Min alive${beyondLimit ? ' (BEYOND 30-min limit!)' : ''} | ${activityCount} activities | ${refreshCount} refreshes | ${logoutBlockCount} logouts blocked`);
        activityCount++; // prevent logging every tick
      }

    } catch (e) {
      if (ws.readyState !== WebSocket.OPEN) {
        log('WebSocket closed — stopping.');
        running = false;
      }
    }
  }

  const totalMin = Math.round((Date.now() - (session.authTime * 1000)) / 60000);
  log(`Keep-Alive v4 beendet nach ${totalMin} Min.`);
  log(`Stats: ${activityCount} activities, ${refreshCount} refreshes, ${logoutBlockCount} logouts blocked.`);

  try { await send('Fetch.disable'); } catch (_) {}
  ws.close();
})();
