// cdp-keep-alive.mjs — Session Keep-Alive v5 for arbeitsagentur.de
// ZERO page interaction. Prevents ALL logout paths identified by ACH analysis.
//
// === Root Cause (ACH Analysis, 2026-05-17) ===
//
// The oiam-oauth-wc has 7 logout paths. Previous versions only blocked
// oiamLogoutEvent, but the primary logout goes through a DIFFERENT path:
//
//   checkOiamSession() → checkForValidSession() → "self-max-timeout"
//   → handleLogoutAfterMaxSessionTimeoutState() → Re.deleteState()
//   → dispatches oiamMaxSessionExpirationEvent (NOT oiamLogoutEvent!)
//   → then check(t) finds cookie gone → if(!e){return} → silent death
//
// === Architecture (v5) ===
//
// Layer 1 — Synthetic keypress (Idle Timer Reset)
//   document.dispatchEvent(new KeyboardEvent('keypress')) every ~30s (±10s)
//   Resets the ~2-3 min inactivity timer. Does NOT check isTrusted.
//
// Layer 2 — Multi-Event Interception (ALL logout paths)
//   Capture-phase listeners on window for ALL logout-related events:
//   - oiamLogoutEvent (timer paths A1/A2/A3)
//   - oiamMaxSessionExpirationEvent (state-machine max-timeout B2)
//   - oiamIdleSessionExpirationEvent (state-machine idle-timeout B2)
//   - oiamIdleSessionExpiredEvent (idle expired variant)
//   All blocked with stopImmediatePropagation() + preventDefault().
//
// Layer 3 — Fetch Interception (Logout Request + Navigation Block)
//   CDP Fetch.enable blocks GET /openid-connect/logout before server receives it.
//   Also blocks post-logout redirect to www.arbeitsagentur.de.
//
// Layer 4 — Manual Token Refresh (Server Session Alive)
//   Refreshes access token every ~200s via fetch(). Resets server-side
//   lastSessionRefresh, keeping the Keycloak SSO session alive.
//
// Layer 5 — Cookie + SessionStorage Protection
//   Page.addScriptToEvaluateOnNewDocument patches:
//   - document.cookie setter to block oiamsession cookie deletion
//   - sessionStorage.removeItem to protect OIDC tokens
//   Injected before page scripts load, persists across SPA navigations.

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const KEYPRESS_INTERVAL_MS = 30_000;
const KEYPRESS_JITTER_MS = 10_000;
const REFRESH_INTERVAL_MS = 200_000;
const POLL_INTERVAL_MS = 10_000;

// All events that can trigger logout — from ACH analysis of p-Bn5gH4YR.js
const LOGOUT_EVENTS = [
  'oiamLogoutEvent',                    // Timer check() paths A1/A2/A3
  'oiamMaxSessionExpirationEvent',      // State-machine path B2 (max timeout)
  'oiamIdleSessionExpirationEvent',     // State-machine path B2 (idle timeout)
  'oiamIdleSessionExpiredEvent',        // Idle expired variant
  'oiamMaxSessionExpirationWarnEvent',  // 5-min warning (suppress to prevent popupHL)
  'oiamIdleSessionExpirationWarnEvent', // Idle warning (suppress to prevent popupIdle)
];

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
  async function sendKeypress() {
    await evaluate(`document.dispatchEvent(new KeyboardEvent('keypress', { key: 'x', charCode: 120, bubbles: true }))`);
  }

  // --- Layer 2: Multi-Event Interception ---
  let eventBlockCount = 0;

  async function setupEventInterception() {
    const eventList = JSON.stringify(LOGOUT_EVENTS);
    const result = await evaluate(`(function() {
      if (window.__keepAliveV5) return 'already_installed';
      window.__keepAliveV5 = { blocked: 0, reasons: [] };

      const events = ${eventList};
      for (const eventName of events) {
        // Capture phase — fires BEFORE any bubble-phase handlers
        window.addEventListener(eventName, function(e) {
          e.stopImmediatePropagation();
          e.preventDefault();
          window.__keepAliveV5.blocked++;
          window.__keepAliveV5.reasons.push(eventName + ':' + (e.detail?.reason || '') + '@' + new Date().toISOString());
          // Keep only last 20 entries
          if (window.__keepAliveV5.reasons.length > 20) window.__keepAliveV5.reasons.shift();
          console.log('[keep-alive] BLOCKED ' + eventName + ' reason=' + (e.detail?.reason || ''));
        }, true);

        // Also bubble phase as backup
        window.addEventListener(eventName, function(e) {
          e.stopImmediatePropagation();
          e.preventDefault();
        }, false);
      }

      return 'installed_' + events.length + '_events';
    })()`);
    log('Layer 2: ' + result);
  }

  // --- Layer 3: Fetch Interception ---
  let logoutRequestBlocked = 0;

  async function setupFetchInterception() {
    await send('Fetch.enable', {
      patterns: [
        { urlPattern: '*openid-connect/logout*', requestStage: 'Request' },
        { urlPattern: 'https://www.arbeitsagentur.de/', requestStage: 'Request' },
        { urlPattern: 'https://www.arbeitsagentur.de', requestStage: 'Request' },
      ]
    });

    let logoutJustBlocked = false;

    eventHandlers.set('Fetch.requestPaused', async (params) => {
      const { requestId, request } = params;

      if (request.url.includes('openid-connect/logout')) {
        await send('Fetch.failRequest', { requestId, reason: 'BlockedByClient' });
        logoutRequestBlocked++;
        logoutJustBlocked = true;
        log(`LOGOUT REQUEST BLOCKED (#${logoutRequestBlocked})`);
        setTimeout(() => { logoutJustBlocked = false; }, 60000);
        return;
      }

      if (request.url.includes('www.arbeitsagentur.de') && logoutJustBlocked) {
        log('POST-LOGOUT NAVIGATION BLOCKED');
        logoutJustBlocked = false;
        const body = btoa('<html><body><script>history.back()</script></body></html>');
        await send('Fetch.fulfillRequest', {
          requestId, responseCode: 200,
          responseHeaders: [{ name: 'Content-Type', value: 'text/html; charset=utf-8' }],
          body,
        });
        return;
      }

      await send('Fetch.continueRequest', { requestId });
    });
  }

  // --- Layer 4: Manual Token Refresh ---
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
              grant_type: 'refresh_token', refresh_token: oidcUser.refresh_token,
              client_id: clientId, client_secret: clientId, scope: 'openid baportal'
            })
          });
          if (!resp.ok) return JSON.stringify({ ok: false, status: resp.status });
          const tokens = await resp.json();
          oidcUser.access_token = tokens.access_token;
          oidcUser.refresh_token = tokens.refresh_token;
          oidcUser.id_token = tokens.id_token || oidcUser.id_token;
          oidcUser.expires_at = Math.floor(Date.now() / 1000) + tokens.expires_in;
          sessionStorage.setItem(key, JSON.stringify(oidcUser));
          return JSON.stringify({ ok: true, expiresIn: tokens.expires_in, refreshExpiresIn: tokens.refresh_expires_in });
        } catch (e) { return JSON.stringify({ ok: false, error: e.message }); }
      }
      return JSON.stringify({ ok: false, error: 'no_session' });
    })()`);
    return JSON.parse(result || '{"ok":false,"error":"evaluate_failed"}');
  }

  // --- Layer 5: Cookie Restore + SessionStorage Protection ---
  // Cookie setter override DOES NOT WORK (Chrome protects native cookie setter).
  // Instead: backup cookie value every 500ms, restore immediately when deleted.
  // The check(t) timer reads the cookie every 1s — if we restore within 500ms,
  // it never sees the cookie missing.
  //
  // Cookie format (from source analysis):
  //   oiamsession={encoded JSON}; path=/; domain=.arbeitsagentur.de; samesite=lax;
  //   JSON contains: {instance, clientid, additionalinfo, idlestart, maxstart, authnlevel, ...}

  async function setupProtection() {
    await evaluate(`(function() {
      if (window.__keepAliveProtection) return 'already';
      window.__keepAliveProtection = { cookieBackup: null, restoreCount: 0 };

      // --- Cookie Restore (poll-based) ---
      function getCookieValue(name) {
        const prefix = name + '=';
        const cookies = decodeURIComponent(document.cookie).split(';');
        for (const c of cookies) {
          const trimmed = c.trimStart();
          if (trimmed.startsWith(prefix)) return trimmed.substring(prefix.length);
        }
        return null;
      }

      function getDomain() {
        const h = window.location.hostname;
        const parts = h.split('.');
        return parts.length >= 2 ? '.' + parts.slice(-2).join('.') : h;
      }

      // Backup + restore loop (every 200ms for fast detection)
      setInterval(function() {
        const val = getCookieValue('oiamsession');
        if (val) {
          // Cookie exists — backup it
          window.__keepAliveProtection.cookieBackup = val;
        } else if (window.__keepAliveProtection.cookieBackup) {
          // Cookie DELETED — restore from backup immediately!
          const domain = getDomain();
          document.cookie = 'oiamsession=' + window.__keepAliveProtection.cookieBackup + '; path=/; domain=' + domain + '; samesite=lax;';
          window.__keepAliveProtection.restoreCount++;
          console.log('[keep-alive] COOKIE RESTORED (#' + window.__keepAliveProtection.restoreCount + ')');
        }
      }, 200);

      // Also backup+restore BA-SessionId (used by hasSessionBeenTerminated)
      let baSessionBackup = null;
      setInterval(function() {
        const val = getCookieValue('BA-SessionId');
        if (val) {
          baSessionBackup = val;
        } else if (baSessionBackup) {
          const domain = getDomain();
          document.cookie = 'BA-SessionId=' + baSessionBackup + '; path=/; domain=' + domain + '; samesite=lax;';
          console.log('[keep-alive] BA-SessionId RESTORED');
        }
      }, 200);

      // --- SessionStorage Protection ---
      const origRemove = sessionStorage.removeItem.bind(sessionStorage);
      sessionStorage.removeItem = function(key) {
        if (typeof key === 'string' && key.startsWith('oidc.user:')) {
          console.log('[keep-alive] BLOCKED sessionStorage.removeItem: ' + key.substring(0, 40));
          return;
        }
        return origRemove(key);
      };

      const origClear = sessionStorage.clear.bind(sessionStorage);
      sessionStorage.clear = function() {
        const saved = [];
        for (let i = 0; i < sessionStorage.length; i++) {
          const k = sessionStorage.key(i);
          if (k?.startsWith('oidc.user:')) saved.push({ k, v: sessionStorage.getItem(k) });
        }
        origClear();
        for (const { k, v } of saved) sessionStorage.setItem(k, v);
        console.log('[keep-alive] sessionStorage.clear intercepted, ' + saved.length + ' OIDC keys preserved');
      };

      return 'installed';
    })()`);

    log('Layer 5: Cookie restore (200ms poll) + sessionStorage protection active');
  }

  // --- Setup ---
  await send('Page.enable');

  // Read session info
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

  log(`Keep-Alive v5 gestartet (${session.client})`);
  log(`Original 30-Min-Limit: ${new Date(originalSessionEnd).toISOString()} (${session.remainingMin} Min)`);

  // Setup all layers
  log('Layer 1: synthetic keypress every ~30s (±10s)');
  await setupEventInterception();
  await setupFetchInterception();
  log('Layer 3: Fetch interception active');
  const initRefresh = await refreshToken();
  if (initRefresh.ok) {
    refreshCount++;
    log(`Layer 4: Token refresh OK (expires_in=${initRefresh.expiresIn}s)`);
  } else {
    log(`Layer 4 WARNING: ${JSON.stringify(initRefresh)}`);
  }
  await setupProtection();

  log('--- All 5 layers active. Session should survive indefinitely. ---');

  // --- Main Loop ---
  let keypressCount = 0;
  let lastKeypressTime = Date.now();
  let lastRefreshTime = Date.now();
  let running = true;

  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  while (running) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const now = Date.now();

      // Layer 1: keypress with jitter
      const jitter = Math.round((Math.random() * 2 - 1) * KEYPRESS_JITTER_MS);
      if (now - lastKeypressTime >= KEYPRESS_INTERVAL_MS + jitter) {
        await sendKeypress();
        keypressCount++;
        lastKeypressTime = now;
      }

      // Layer 4: token refresh
      if (now - lastRefreshTime >= REFRESH_INTERVAL_MS) {
        const result = await refreshToken();
        if (result.ok) {
          refreshCount++;
          lastRefreshTime = now;
          const totalMin = Math.round((now - (session.authTime * 1000)) / 60000);
          log(`Token refresh #${refreshCount} OK — ${totalMin} Min alive (refresh_expires_in=${result.refreshExpiresIn}s)`);
        } else {
          log(`Token refresh FAILED: ${JSON.stringify(result)}`);
          if (result.error === 'no_session' || result.error === 'evaluate_failed') {
            log('Session lost — stopping.');
            running = false;
          }
        }
      }

      // Check blocked events
      const stats = await evaluate(`JSON.stringify(window.__keepAliveV5 || {blocked:0})`);
      const s = JSON.parse(stats || '{}');
      if (s.blocked > eventBlockCount) {
        log(`*** EVENTS BLOCKED: ${s.blocked} total, latest: ${s.reasons?.slice(-3).join(', ')}`);
        eventBlockCount = s.blocked;
      }

      // Status every ~5 min
      const totalMin = Math.round((now - (session.authTime * 1000)) / 60000);
      const beyond = now > originalSessionEnd;
      if (keypressCount > 0 && keypressCount % 10 === 0) {
        log(`Status: ${totalMin} Min${beyond ? ' (BEYOND!)' : ''} | ${keypressCount} kp | ${refreshCount} ref | ${eventBlockCount} evt | ${logoutRequestBlocked} fetch`);
        keypressCount++; // prevent repeat log
      }

    } catch (e) {
      if (ws.readyState !== WebSocket.OPEN) {
        log('WebSocket closed — stopping.');
        running = false;
      }
    }
  }

  const totalMin = Math.round((Date.now() - (session.authTime * 1000)) / 60000);
  log(`Keep-Alive v5 beendet nach ${totalMin} Min.`);
  log(`Stats: ${keypressCount} keypresses, ${refreshCount} refreshes, ${eventBlockCount} events blocked, ${logoutRequestBlocked} fetches blocked.`);

  try { await send('Fetch.disable'); } catch (_) {}
  ws.close();
})();
