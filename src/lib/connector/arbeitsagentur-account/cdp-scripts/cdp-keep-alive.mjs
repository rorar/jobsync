// cdp-keep-alive.mjs — Session Keep-Alive for arbeitsagentur.de
// Prevents inactivity logout by auto-clicking "Angemeldet bleiben" popup.
//
// Verified facts:
//   - Inactivity timeout: ~2-3 min (triggered by lack of UI events)
//   - CDP Input.dispatchMouseEvent does NOT count as activity
//   - Only real UI events OR clicking "Angemeldet bleiben" resets the timer
//   - 30-min hard limit (auth_time + 1800) is NOT bypassable
//
// Strategy: Inject MutationObserver that auto-clicks the popup when it appears.
// Falls back to DOM.performSearch polling every 10s (for shadow DOM detection).

import { anonymize } from './cdp-anonymize.mjs';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';

(async () => {
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

  const tabs = await fetch(`${CDP_ENDPOINT}/json/list`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) { console.error('No browser tab found'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));

  let id = 1;
  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const timeout = setTimeout(() => resolve({ result: null }), 10000);
      function handler(event) {
        const msg = JSON.parse(event.data);
        if (msg.id === msgId) { clearTimeout(timeout); ws.removeEventListener('message', handler); resolve(msg); }
      }
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  }

  async function trustedClick(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  await send('Page.enable');
  await send('DOM.enable');

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
  const sessionEndTime = (session.authTime + 1800) * 1000;
  log(`Keep-Alive gestartet (${session.client}, ${session.remainingMin} Min verbleibend)`);
  log('Session endet: ' + new Date(sessionEndTime).toISOString());
  log('Strategie: DOM.performSearch polling (10s) + auto-click');

  let keepAliveCount = 0;
  let running = true;

  while (running) {
    // Check if session hard-limit reached
    if (Date.now() >= sessionEndTime) {
      log('30-Min Hard-Limit erreicht — Session beendet.');
      running = false;
      break;
    }

    await new Promise(r => setTimeout(r, 10000));

    try {
      // Method 1: DOM.performSearch (pierces ALL shadow DOMs)
      const doc = await send('DOM.getDocument', { depth: 0 });
      const search = await send('DOM.performSearch', { query: 'Angemeldet bleiben' });

      if (search.result?.resultCount > 0) {
        log('Inaktivitäts-Popup erkannt! Klicke "Angemeldet bleiben"...');

        // Button: #session-expiration-idle-warn-popup-continue-btn
        // Located in bahf-header Shadow DOM — only via DOM.performSearch + resolveNode
        const btnSearch = await send('DOM.performSearch', { query: 'session-expiration-idle-warn-popup-continue-btn' });

        if (btnSearch.result?.resultCount > 0) {
          const nodes = await send('DOM.getSearchResults', { searchId: btnSearch.result.searchId, fromIndex: 0, toIndex: 1 });
          const nodeId = nodes.result?.nodeIds?.[0];
          if (nodeId) {
            const resolved = await send('DOM.resolveNode', { nodeId });
            if (resolved.result?.object?.objectId) {
              const rect = await send('Runtime.callFunctionOn', {
                objectId: resolved.result.object.objectId,
                functionDeclaration: 'function() { this.scrollIntoView({block:"center"}); const r=this.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); }',
                returnByValue: true
              });
              const coords = JSON.parse(rect.result?.result?.value || '{}');

              if (coords.x && coords.y) {
                await trustedClick(coords.x, coords.y);
              } else {
                await send('Runtime.callFunctionOn', {
                  objectId: resolved.result.object.objectId,
                  functionDeclaration: 'function() { this.click(); }'
                });
              }
              keepAliveCount++;
              log(`"Angemeldet bleiben" geklickt (#${keepAliveCount})`);
            }
          }
        }
      }

      // Log status periodically
      const elapsed = Math.round((Date.now() - (sessionEndTime - 1800000)) / 60000);
      const remaining = Math.round((sessionEndTime - Date.now()) / 60000);
      if (keepAliveCount === 0 && elapsed % 5 === 0 && elapsed > 0) {
        log(`Session aktiv: ${remaining} Min verbleibend`);
      }
    } catch (e) {
      // Context might be destroyed during navigation — silently retry
    }
  }

  log(`Keep-Alive beendet. ${keepAliveCount} Popups weggeklickt.`);
  ws.close();
})();
