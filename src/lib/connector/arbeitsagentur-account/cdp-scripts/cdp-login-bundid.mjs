// cdp-login-bundid.mjs — Automated BundID/eID Login Flow
// Handles: SSO → BundID → eID selection → AusweisApp wait → WEITER → Keycloak → profil-ui
// Manual step: User must complete eID authentication in AusweisApp (PIN + Ausweis)

import { anonymize } from './cdp-anonymize.mjs';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const TARGET_APP = process.env.TARGET_APP || 'profil-ui'; // profil-ui | kokos-ui | termine

// --- CDP Helper ---
function createCDP(wsUrl) {
  const ws = new WebSocket(wsUrl);
  let id = 1;

  function send(method, params = {}, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      const timeout = setTimeout(() => reject(new Error(`CDP timeout: ${method}`)), timeoutMs);
      function handler(event) {
        const msg = JSON.parse(event.data);
        if (msg.id === msgId) {
          clearTimeout(timeout);
          ws.removeEventListener('message', handler);
          resolve(msg);
        }
      }
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }

  function evaluate(expression, timeoutMs = 10000) {
    return send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true }, timeoutMs)
      .then(r => r.result?.result?.value);
  }

  async function trustedClick(x, y) {
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  }

  function onEvent(eventName, handler) {
    ws.addEventListener('message', (event) => {
      const msg = JSON.parse(event.data);
      if (msg.method === eventName) handler(msg.params);
    });
  }

  return { ws, send, evaluate, trustedClick, onEvent };
}

// --- Main Login Flow ---
(async () => {
  const startTime = Date.now();
  const log = (msg) => console.log(`[${new Date().toISOString()}] ${msg}`);

  // Connect to browser
  const tabs = await fetch(`${CDP_ENDPOINT}/json/list`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) { console.error('No browser tab found'); process.exit(1); }

  const cdp = createCDP(page.webSocketDebuggerUrl);
  await new Promise(resolve => cdp.ws.addEventListener('open', resolve));
  await cdp.send('Page.enable');

  log('Connected to: ' + page.title);

  // --- Phase 1: Navigate to SSO Login ---
  const appUrls = {
    'profil-ui': 'https://web.arbeitsagentur.de/profil/profil-ui/pd/',
    'kokos-ui': 'https://web.arbeitsagentur.de/kokos/kokos-ui/pd/',
    'termine': 'https://web.arbeitsagentur.de/portal/termine/pd/',
  };
  const targetUrl = appUrls[TARGET_APP] || appUrls['profil-ui'];

  log(`Phase 1: Navigate to ${TARGET_APP} → Keycloak`);
  await cdp.send('Page.navigate', { url: targetUrl });
  await new Promise(r => setTimeout(r, 5000));

  // --- Phase 2: Click BundID on Keycloak ---
  log('Phase 2: Keycloak → BundID');
  await cdp.evaluate("document.getElementById('mitBundIdButton')?.click()");
  await new Promise(r => setTimeout(r, 4000));

  // Click "Zur BundID wechseln"
  await cdp.evaluate(`
    const btns = [...document.querySelectorAll('button, a')];
    const btn = btns.find(b => b.textContent?.includes('BundID wechseln'));
    if (btn) btn.click();
  `);
  await new Promise(r => setTimeout(r, 5000));

  const bundIdUrl = await cdp.evaluate('document.location.href');
  if (!bundIdUrl?.includes('id.bund.de')) {
    log('ERROR: BundID redirect failed. URL: ' + bundIdUrl);
    cdp.ws.close();
    process.exit(1);
  }
  log('BundID erreicht: ' + bundIdUrl.substring(0, 60));

  // --- Phase 3: BundID eID Selection ---
  log('Phase 3: BundID → eID Auswahl');

  // Click "Anmelden" on BundID welcome
  await cdp.evaluate(`
    const els = [...document.querySelectorAll('a, button')];
    const btn = els.find(e => e.textContent?.trim() === 'Anmelden' || e.textContent?.trim() === 'ANMELDEN');
    if (btn) btn.click();
  `);
  await new Promise(r => setTimeout(r, 3000));

  // --- Phase 4: Click Anmelden (eID action) via CDP trusted click ---
  log('Phase 4: eID Anmelden → AusweisApp Modal');

  // Get button coords and trusted-click
  const anmeldenCoords = await cdp.evaluate(`(function() {
    const btn = document.querySelector('button[data-test-id="9XNNb"]');
    if (btn) { btn.scrollIntoView({block:'center'}); const r=btn.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); }
    return '{}';
  })()`);
  const c1 = JSON.parse(anmeldenCoords || '{}');

  if (c1.x) {
    await cdp.trustedClick(c1.x, c1.y);
    log('Anmelden geklickt (CDP trusted)');
  } else {
    log('WARNING: Anmelden button nicht gefunden');
  }

  await new Promise(r => setTimeout(r, 2000));

  // --- Phase 5: Click WEITER MIT AUSWEISAPP ---
  log('Phase 5: WEITER MIT AUSWEISAPP');

  const ausweisCoords = await cdp.evaluate(`(function() {
    const modal = document.querySelector('[data-test-id*="modal-content"]');
    if (modal) {
      const btn = [...modal.querySelectorAll('button')].find(b => b.textContent?.includes('AUSWEISAPP'));
      if (btn) { const r=btn.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); }
    }
    return '{}';
  })()`);
  const c2 = JSON.parse(ausweisCoords || '{}');

  if (c2.x) {
    await cdp.trustedClick(c2.x, c2.y);
    log('WEITER MIT AUSWEISAPP geklickt');
  } else {
    log('WARNING: AUSWEISAPP Modal nicht gefunden — evtl. noch nicht geöffnet');
  }

  // --- Phase 6: Wait for AusweisApp completion ---
  log('Phase 6: Warte auf AusweisApp...');
  log('>>> MANUELLE AKTION: eID-Authentifizierung in AusweisApp durchführen <<<');

  // After clicking WEITER MIT AUSWEISAPP, the page navigates to externalNpaAuthn.
  // We must wait for that navigation, THEN poll for the WEITER (d0gQ0) modal.
  // The page stays on externalNpaAuthn until AusweisApp completes, then BundID
  // renders the "Sie werden zurückgeleitet" modal WITHOUT navigating (SPA).

  // Wait for externalNpaAuthn page to settle
  await new Promise(r => setTimeout(r, 5000));

  // Poll with resilient evaluate (catches context-destroyed errors during navigation)
  let weiterClicked = false;
  let pollCount = 0;
  let observerInjected = false;

  while (!weiterClicked) {
    await new Promise(r => setTimeout(r, 3000));
    pollCount++;

    try {
      // Try to inject MutationObserver (idempotent — checks if already installed)
      if (!observerInjected) {
        const injectResult = await cdp.evaluate(`
          (function() {
            if (window.__loginAutoComplete) return 'already_installed';
            window.__loginAutoComplete = { phase: 'waiting_for_ausweisapp' };
            const observer = new MutationObserver(() => {
              if (window.__loginAutoComplete.phase !== 'waiting_for_ausweisapp') return;
              const weiterBtn = document.querySelector('button[data-test-id="d0gQ0"]');
              if (weiterBtn) {
                window.__loginAutoComplete.phase = 'weiter_found';
                weiterBtn.scrollIntoView({ block: 'center' });
                const rect = weiterBtn.getBoundingClientRect();
                window.__loginAutoComplete.coords = { x: Math.round(rect.x + rect.width/2), y: Math.round(rect.y + rect.height/2) };
                observer.disconnect();
              }
            });
            observer.observe(document.body, { childList: true, subtree: true });
            return 'installed';
          })()
        `, 5000);
        if (injectResult === 'installed' || injectResult === 'already_installed') {
          observerInjected = true;
        }
      }

      // Check MutationObserver state
      const state = await cdp.evaluate('JSON.stringify(window.__loginAutoComplete || {})', 5000);
      const parsed = JSON.parse(state || '{}');

      if (parsed.phase === 'weiter_found' && parsed.coords) {
        await new Promise(r => setTimeout(r, 500));
        await cdp.trustedClick(parsed.coords.x, parsed.coords.y);
        log('WEITER geklickt (MutationObserver)');
        weiterClicked = true;
      } else {
        // Fallback: direct DOM check
        const directCheck = await cdp.evaluate(`(function() {
          const btn = document.querySelector('button[data-test-id="d0gQ0"]');
          if (btn) { btn.scrollIntoView({block:'center'}); const r=btn.getBoundingClientRect(); return JSON.stringify({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}); }
          return null;
        })()`, 5000);
        if (directCheck) {
          const coords = JSON.parse(directCheck);
          await cdp.trustedClick(coords.x, coords.y);
          log('WEITER geklickt (Fallback)');
          weiterClicked = true;
        }
      }
    } catch (e) {
      // Context destroyed during navigation — retry next cycle
      observerInjected = false;
    }

    if (pollCount % 10 === 0) {
      log(`  ...warte seit ${pollCount * 3}s auf AusweisApp`);
    }
  }

  // --- Phase 7: Keycloak post-broker → "Online Angebot nutzen" ---
  log('Phase 7: Keycloak → Online Angebot nutzen');

  // Wait for Keycloak redirect via Page.frameNavigated
  await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 15000);
    cdp.onEvent('Page.frameNavigated', (params) => {
      if (params.frame?.url?.includes('sso.arbeitsagentur.de') || params.frame?.url?.includes(TARGET_APP)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });

  await new Promise(r => setTimeout(r, 3000));

  // Click "Online Angebot nutzen"
  await cdp.evaluate(`
    const btns = [...document.querySelectorAll('button, a')];
    const btn = btns.find(b => b.textContent?.includes('Online Angebot'));
    if (btn) btn.click();
  `);
  log('"Online Angebot nutzen" geklickt');

  // --- Phase 8: Verify login success ---
  await new Promise(r => setTimeout(r, 6000));

  const finalUrl = await cdp.evaluate('document.location.href');
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  if (finalUrl?.includes('web.arbeitsagentur.de')) {
    log(`LOGIN ERFOLGREICH in ${elapsed}s`);
    log('URL: ' + anonymize(finalUrl).substring(0, 80));

    // Read session timer
    const authTime = await cdp.evaluate(`(function() {
      const keys = ['profil-online', 'kokos', 'ota-online'];
      for (const k of keys) {
        const raw = sessionStorage.getItem('oidc.user:https://sso.arbeitsagentur.de/auth/realms/OCP:' + k);
        if (raw) {
          const token = JSON.parse(raw).access_token;
          const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
          const remaining = Math.round((payload.auth_time + 1800 - Date.now()/1000) / 60);
          return JSON.stringify({ client: k, authTime: new Date(payload.auth_time * 1000).toISOString(), remainingMin: remaining });
        }
      }
      return null;
    })()`);

    if (authTime) {
      const session = JSON.parse(authTime);
      log(`Session: ${session.client}, verbleibend: ${session.remainingMin} Min`);
    }
  } else {
    log('LOGIN FEHLGESCHLAGEN');
    log('URL: ' + (finalUrl || 'unknown'));
  }

  cdp.ws.close();
})();
