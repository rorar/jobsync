// cdp-keep-alive.mjs — Session Keep-Alive for arbeitsagentur.de
// Prevents inactivity logout by periodically sending a trusted mouse event.
//
// Verified facts (2026-05-17):
//   - Inactivity timeout: ~2-3 min (triggered by lack of UI events)
//   - CDP Runtime.evaluate does NOT count as activity
//   - CDP Input.dispatchMouseEvent DOES count as activity (trusted event)
//   - 30-min hard limit (auth_time + 1800) is NOT bypassable
//
// Three popups in bahf-header shadow DOM (closed, only CDP DOM.performSearch pierces):
//   - popupIdle: Inactivity warning (~2-3 min idle). Button: "Angemeldet bleiben" → resets timer
//   - popupHL:   5-min warning (T+25min). Button: "Verstanden" → acknowledge only, no reset
//   - popup30m:  30-min hard limit. Session ends, no bypass.
//
// Visibility detection: class "is-visible" on the modal div + aria-hidden="false"
// NOT CSS visibility/opacity (those report misleading values via getBoundingClientRect)
//
// Strategy:
//   1. PROACTIVE: Send Input.dispatchMouseEvent (mouseMoved) every ~60s (+/-15s jitter)
//      to reset the inactivity timer before it fires.
//   2. REACTIVE: Poll all popup divs every 10s. If "is-visible" class found, click
//      the matching continue button via DOM.resolveNode + .click().

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const ACTIVITY_INTERVAL_MS = 60_000; // base interval ~60s (timeout is ~2-3 min)
const ACTIVITY_JITTER_MS = 15_000;   // +/- 15s randomization
const POLL_INTERVAL_MS = 10_000;     // check popup visibility every 10s

// Popup definitions: id → button id
const POPUPS = [
  { popupId: 'popupIdle', buttonId: 'session-expiration-idle-warn-popup-continue-btn', label: 'Inaktivitaet' },
  { popupId: 'popupHL', buttonId: 'session-expiration-5m-warn-popup-continue-btn', label: '5-Min-Warnung' },
];

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

  async function sendActivity() {
    // Single mouseMoved at a neutral position — center of viewport, below header/nav.
    // CRITICAL: Avoid header area (y < 100) — header has clickable nav links that
    // can trigger redirects (e.g., Vermittlungspostfach) on hover/interaction.
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 400, y: 500 });
  }

  // Finds a node by id via DOM.performSearch, resolves to JS object, checks visibility,
  // returns { visible, objectId } or { visible: false }
  async function checkPopupVisible(popupId) {
    const search = await send('DOM.performSearch', { query: popupId });
    if (!search.result?.resultCount) return { visible: false };

    const nodes = await send('DOM.getSearchResults', {
      searchId: search.result.searchId, fromIndex: 0, toIndex: 1
    });
    const nodeId = nodes.result?.nodeIds?.[0];
    if (!nodeId) return { visible: false };

    const resolved = await send('DOM.resolveNode', { nodeId });
    const objId = resolved.result?.object?.objectId;
    if (!objId) return { visible: false };

    // Check for "is-visible" class (the real visibility indicator)
    const check = await send('Runtime.callFunctionOn', {
      objectId: objId,
      functionDeclaration: `function() {
        return JSON.stringify({
          isVisible: this.classList.contains('is-visible'),
          ariaHidden: this.getAttribute('aria-hidden'),
          className: this.className.substring(0, 80)
        });
      }`,
      returnByValue: true
    });
    const data = JSON.parse(check.result?.result?.value || '{}');
    return { visible: data.isVisible || data.ariaHidden === 'false', objectId: objId, data };
  }

  // Clicks a button found by DOM.performSearch
  async function clickButton(buttonId) {
    const search = await send('DOM.performSearch', { query: buttonId });
    if (!search.result?.resultCount) return false;

    const nodes = await send('DOM.getSearchResults', {
      searchId: search.result.searchId, fromIndex: 0, toIndex: 1
    });
    const nodeId = nodes.result?.nodeIds?.[0];
    if (!nodeId) return false;

    const resolved = await send('DOM.resolveNode', { nodeId });
    const objId = resolved.result?.object?.objectId;
    if (!objId) return false;

    // Get coords for trusted click
    const rect = await send('Runtime.callFunctionOn', {
      objectId: objId,
      functionDeclaration: `function() {
        this.scrollIntoView({ block: 'center' });
        const r = this.getBoundingClientRect();
        return JSON.stringify({ x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2), w: r.width });
      }`,
      returnByValue: true
    });
    const coords = JSON.parse(rect.result?.result?.value || '{}');

    // Trusted click (if coords are plausible)
    if (coords.x > 0 && coords.y > 0 && coords.w > 5) {
      await trustedClick(coords.x, coords.y);
    }
    // .click() fallback (always try)
    await send('Runtime.callFunctionOn', {
      objectId: objId,
      functionDeclaration: 'function() { this.click(); }'
    });

    return true;
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
  log(`Strategie: mouseMoved ~${ACTIVITY_INTERVAL_MS / 1000}s (±${ACTIVITY_JITTER_MS / 1000}s) + popup is-visible check`);

  let activityCount = 0;
  let popupDismissCount = 0;
  let lastActivityTime = Date.now();

  // --- Main loop ---
  while (true) {
    if (Date.now() >= sessionEndTime) {
      log('30-Min Hard-Limit erreicht — Session beendet.');
      break;
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    try {
      const now = Date.now();
      const remaining = Math.round((sessionEndTime - now) / 60000);

      // PROACTIVE: send activity if randomized interval elapsed
      const jitter = Math.round((Math.random() * 2 - 1) * ACTIVITY_JITTER_MS);
      if (now - lastActivityTime >= ACTIVITY_INTERVAL_MS + jitter) {
        await sendActivity();
        activityCount++;
        lastActivityTime = now;
        if (activityCount % 5 === 1) {
          log(`Activity #${activityCount} gesendet (${remaining} Min verbleibend)`);
        }
      }

      // REACTIVE: check all popup types
      await send('DOM.getDocument', { depth: 0 });

      for (const popup of POPUPS) {
        const status = await checkPopupVisible(popup.popupId);
        if (!status.visible) continue;

        log(`${popup.label} Popup SICHTBAR (${popup.popupId}, class="${status.data?.className}")`);

        const clicked = await clickButton(popup.buttonId);
        if (clicked) {
          popupDismissCount++;
          log(`${popup.label} Button geklickt (#${popupDismissCount})`);

          // Verify dismissal
          await new Promise(r => setTimeout(r, 1500));
          const postStatus = await checkPopupVisible(popup.popupId);
          log(`Post-click: ${postStatus.visible ? 'STILL_VISIBLE' : 'DISMISSED'}`);
        } else {
          log(`WARNING: ${popup.label} Button (${popup.buttonId}) nicht gefunden`);
        }
      }

    } catch (e) {
      // Context destroyed during navigation — retry next cycle
    }
  }

  log(`Keep-Alive beendet. ${activityCount} activities, ${popupDismissCount} popups dismissed.`);
  ws.close();
})();
