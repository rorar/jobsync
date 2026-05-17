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

// --- Resilient Button Click Helpers ---

// Polls for a URL pattern, returns when matched. Throws after timeoutMs.
async function waitForUrl(cdp, pattern, timeoutMs = 30000, pollMs = 1000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const url = await cdp.evaluate('document.location.href');
      if (url?.includes(pattern)) return url;
    } catch (_) {}
    await new Promise(r => setTimeout(r, pollMs));
  }
  throw new Error(`Timeout waiting for URL containing "${pattern}"`);
}

// Polls for a button by selector, scrolls into view, trusted-clicks it.
// Returns true on success. Uses overlap detection + retry.
async function waitForAndClick(cdp, { selector, textMatch, log, timeoutMs = 20000, useTrustedClick = true }) {
  const deadline = Date.now() + timeoutMs;
  let attempt = 0;

  while (Date.now() < deadline) {
    attempt++;
    await new Promise(r => setTimeout(r, 1000));

    try {
      const findExpr = selector
        ? `document.querySelector('${selector}')`
        : `[...document.querySelectorAll('button, a')].find(e => e.textContent?.includes('${textMatch}'))`;

      const info = await cdp.evaluate(`(function() {
        const btn = ${findExpr};
        if (!btn || btn.offsetParent === null) return null;
        btn.scrollIntoView({ block: 'center' });
        const r = btn.getBoundingClientRect();
        const cx = Math.round(r.x + r.width / 2);
        const cy = Math.round(r.y + r.height / 2);
        const topEl = document.elementFromPoint(cx, cy);
        const isOnTop = topEl === btn || btn.contains(topEl);
        return JSON.stringify({ x: cx, y: cy, w: Math.round(r.width), h: Math.round(r.height), isOnTop });
      })()`);

      if (!info) continue;
      const coords = JSON.parse(info);

      if (coords.w < 10) continue; // too small, not rendered yet

      if (useTrustedClick && coords.isOnTop) {
        await cdp.trustedClick(coords.x, coords.y);
        log(`Geklickt (${coords.x},${coords.y}) ${coords.w}x${coords.h}`);
        return true;
      }

      if (useTrustedClick && !coords.isOnTop) {
        // Scroll more and retry
        await cdp.evaluate('window.scrollBy(0, 200)');
        continue;
      }

      // Non-trusted click (.click()) — for non-Vue pages
      if (!useTrustedClick) {
        await cdp.evaluate(`(function() { const btn = ${findExpr}; if (btn) btn.click(); })()`);
        log('Geklickt (.click())');
        return true;
      }
    } catch (_) {}
  }

  // Last resort: .click() fallback
  try {
    const findExpr = selector
      ? `document.querySelector('${selector}')`
      : `[...document.querySelectorAll('button, a')].find(e => e.textContent?.includes('${textMatch}'))`;
    await cdp.evaluate(`(function() { const btn = ${findExpr}; if (btn) btn.click(); })()`);
    log('Geklickt (Fallback .click())');
    return true;
  } catch (_) {}

  return false;
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
  await waitForUrl(cdp, 'sso.arbeitsagentur.de', 15000).catch(() => {});
  await new Promise(r => setTimeout(r, 2000)); // let page render

  // --- Phase 2: Click BundID on Keycloak ---
  log('Phase 2: Keycloak → BundID');
  // Keycloak is NOT Vue 3 — .click() works fine here
  await waitForAndClick(cdp, {
    selector: '#mitBundIdButton',
    log: (m) => log('  BundID Button: ' + m),
    useTrustedClick: false,
    timeoutMs: 15000
  });
  await new Promise(r => setTimeout(r, 2000));

  // Click "Zur BundID wechseln" (intermediate page, also Keycloak)
  await waitForAndClick(cdp, {
    textMatch: 'BundID wechseln',
    log: (m) => log('  Zur BundID: ' + m),
    useTrustedClick: false,
    timeoutMs: 10000
  });

  // Wait for BundID page
  await waitForUrl(cdp, 'id.bund.de', 15000).catch(() => {});
  await new Promise(r => setTimeout(r, 2000));

  const bundIdUrl = await cdp.evaluate('document.location.href');
  if (!bundIdUrl?.includes('id.bund.de')) {
    log('ERROR: BundID redirect failed. URL: ' + bundIdUrl);
    cdp.ws.close();
    process.exit(1);
  }
  log('BundID erreicht: ' + bundIdUrl.substring(0, 60));

  // --- Phase 3: BundID → eID Selection ---
  // BundID is Vue 3 — .click() is UNRELIABLE, must use trusted clicks!
  // Two possible starting pages:
  //   a) Welcome page (/de/welcome) — has "Anmelden" button (data-test-id="Tml88")
  //   b) Method selection (/de/welcome/auth/1/eID) — eID already pre-selected
  log('Phase 3: BundID → eID Auswahl');

  if (!bundIdUrl.includes('/eID')) {
    // Phase 3a: Click "Anmelden" on welcome page
    log('  Welcome page erkannt — klicke "Anmelden"');
    await waitForAndClick(cdp, {
      selector: 'button[data-test-id="Tml88"]',
      log: (m) => log('  Welcome Anmelden: ' + m),
      useTrustedClick: true,
      timeoutMs: 15000
    });
    await new Promise(r => setTimeout(r, 3000));

    // Phase 3b: If not on eID page yet, click Online-Ausweis card
    const afterWelcome = await cdp.evaluate('document.location.href');
    if (afterWelcome && !afterWelcome.includes('/eID')) {
      log('  Methoden-Auswahl — klicke "Online-Ausweis"');
      await waitForAndClick(cdp, {
        selector: 'button[data-test-id="sjqET"]',
        log: (m) => log('  Online-Ausweis: ' + m),
        useTrustedClick: true,
        timeoutMs: 10000
      });
      await new Promise(r => setTimeout(r, 2000));
    }
  } else {
    log('  eID bereits vorausgewählt');
  }

  // --- Phase 4: Click Anmelden (eID action) → AusweisApp Modal ---
  log('Phase 4: eID Anmelden → AusweisApp Modal');
  await waitForAndClick(cdp, {
    selector: 'button[data-test-id="9XNNb"]',
    log: (m) => log('  eID Anmelden: ' + m),
    useTrustedClick: true,
    timeoutMs: 15000
  });
  await new Promise(r => setTimeout(r, 1500));

  // --- Phase 5: Click WEITER MIT AUSWEISAPP ---
  log('Phase 5: WEITER MIT AUSWEISAPP');
  // Try data-test-id first, then text match
  const phase5ok = await waitForAndClick(cdp, {
    selector: 'button[data-test-id="el2nW"]',
    log: (m) => log('  AUSWEISAPP (el2nW): ' + m),
    useTrustedClick: true,
    timeoutMs: 8000
  });
  if (!phase5ok) {
    // Fallback: find by text
    await waitForAndClick(cdp, {
      textMatch: 'AUSWEISAPP',
      log: (m) => log('  AUSWEISAPP (text): ' + m),
      useTrustedClick: true,
      timeoutMs: 8000
    });
  }

  // --- Phase 6: Wait for AusweisApp completion ---
  log('Phase 6: Warte auf AusweisApp...');
  log('>>> MANUELLE AKTION: eID-Authentifizierung in AusweisApp durchführen <<<');

  await new Promise(r => setTimeout(r, 5000));

  // Poll for WEITER (d0gQ0) — appears after AusweisApp completes
  let weiterClicked = false;
  let pollCount = 0;
  let observerInjected = false;

  while (!weiterClicked) {
    await new Promise(r => setTimeout(r, 3000));
    pollCount++;

    try {
      // Inject MutationObserver (idempotent)
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
      observerInjected = false;
    }

    if (pollCount % 10 === 0) {
      log(`  ...warte seit ${pollCount * 3}s auf AusweisApp`);
    }
  }

  // --- Phase 7: Keycloak post-broker → "Online Angebot nutzen" ---
  log('Phase 7: Keycloak → Online Angebot nutzen');

  // Wait for Keycloak redirect
  await new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), 15000);
    cdp.onEvent('Page.frameNavigated', (params) => {
      if (params.frame?.url?.includes('sso.arbeitsagentur.de') || params.frame?.url?.includes(TARGET_APP)) {
        clearTimeout(timeout);
        resolve(true);
      }
    });
  });

  await new Promise(r => setTimeout(r, 2000));

  // Click "Online Angebot nutzen" (Keycloak — .click() works)
  await waitForAndClick(cdp, {
    textMatch: 'Online Angebot',
    log: (m) => log('  Online Angebot: ' + m),
    useTrustedClick: false,
    timeoutMs: 10000
  });

  // --- Phase 8: Verify login success ---
  await waitForUrl(cdp, 'web.arbeitsagentur.de', 15000).catch(() => {});
  await new Promise(r => setTimeout(r, 3000));

  const finalUrl = await cdp.evaluate('document.location.href');
  const elapsed = Math.round((Date.now() - startTime) / 1000);

  if (finalUrl?.includes('web.arbeitsagentur.de')) {
    log(`LOGIN ERFOLGREICH in ${elapsed}s`);
    log('URL: ' + anonymize(finalUrl).substring(0, 80));

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
