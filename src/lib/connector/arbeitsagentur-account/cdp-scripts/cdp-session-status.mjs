// cdp-session-status.mjs — Read session status from arbeitsagentur.de
// Shows both server-side (JWT auth_time) and client-side (DOM timer) views.
// Safe to run alongside cdp-keep-alive.mjs (read-only, no page interaction).
//
// Usage: node cdp-session-status.mjs [--watch]
//   Without --watch: prints status once and exits
//   With --watch: polls every 30s until session ends

import { anonymize } from './cdp-anonymize.mjs';

const CDP_ENDPOINT = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9223';
const WATCH_MODE = process.argv.includes('--watch');
const WATCH_INTERVAL_MS = 30_000;

async function connect() {
  const tabs = await fetch(`${CDP_ENDPOINT}/json/list`).then(r => r.json());
  const page = tabs.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) { console.error('No browser tab found'); process.exit(1); }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(resolve => ws.addEventListener('open', resolve));

  let id = 1;
  const pending = new Map();

  function send(method, params = {}) {
    return new Promise((resolve) => {
      const msgId = id++;
      const timeout = setTimeout(() => { pending.delete(msgId); resolve({ result: null }); }, 10000);
      pending.set(msgId, { resolve, timeout });
      ws.send(JSON.stringify({ id: msgId, method, params }));
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
  });

  async function evaluate(expr) {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    return r.result?.result?.value;
  }

  return { ws, send, evaluate, url: page.url, title: page.title };
}

async function readJwtStatus(evaluate) {
  const result = await evaluate(`(function() {
    const clients = ['profil-online', 'kokos', 'ota-online'];
    for (const k of clients) {
      const raw = sessionStorage.getItem('oidc.user:https://sso.arbeitsagentur.de/auth/realms/OCP:' + k);
      if (!raw) continue;
      try {
        const oidcUser = JSON.parse(raw);
        const token = oidcUser.access_token;
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/')));
        const now = Math.floor(Date.now() / 1000);
        return JSON.stringify({
          client: k,
          authTime: payload.auth_time,
          authTimeISO: new Date(payload.auth_time * 1000).toISOString(),
          sessionEndISO: new Date((payload.auth_time + 1800) * 1000).toISOString(),
          sessionRemainingSec: payload.auth_time + 1800 - now,
          sessionRemainingMin: Math.round((payload.auth_time + 1800 - now) / 60),
          tokenExpiresSec: payload.exp - now,
          sessionElapsedMin: Math.round((now - payload.auth_time) / 60),
          authnLevel: payload['authn-level'],
          actingType: payload['acting-type'],
          beyondLimit: now > payload.auth_time + 1800
        });
      } catch (e) { return JSON.stringify({ error: e.message }); }
    }
    return JSON.stringify({ error: 'no_session' });
  })()`);
  return JSON.parse(result || '{"error":"evaluate_failed"}');
}

async function readDomTimer(cdp) {
  await cdp.send('DOM.enable');
  await cdp.send('DOM.getDocument', { depth: 0 });

  const search = await cdp.send('DOM.performSearch', { query: 'session-timer-button' });
  if (!search.result?.resultCount) return { error: 'no_timer_element' };

  const nodes = await cdp.send('DOM.getSearchResults', {
    searchId: search.result.searchId, fromIndex: 0, toIndex: search.result.resultCount
  });

  for (const nid of (nodes.result?.nodeIds || [])) {
    const desc = await cdp.send('DOM.describeNode', { nodeId: nid, depth: 0 });
    if (desc.result?.node?.nodeType !== 1) continue; // skip text nodes

    const resolved = await cdp.send('DOM.resolveNode', { nodeId: nid });
    const objId = resolved.result?.object?.objectId;
    if (!objId) continue;

    const info = await cdp.send('Runtime.callFunctionOn', {
      objectId: objId,
      functionDeclaration: `function() {
        if (this.tagName !== 'BUTTON') return null;
        const span = this.querySelector('span');
        const parent = this.closest('.ba-header-element');
        const detail = parent?.querySelector('p.h2');
        const sr = parent?.querySelector('.sr-only');
        return JSON.stringify({
          buttonText: span?.textContent?.trim(),
          detailTimer: detail?.textContent?.trim(),
          srText: sr?.textContent?.trim()
        });
      }`,
      returnByValue: true
    });
    const data = info.result?.result?.value;
    if (data && data !== 'null') return JSON.parse(data);
  }

  return { error: 'button_not_found' };
}

function formatStatus(jwt, dom, pageUrl) {
  const lines = [];
  const ts = new Date().toISOString();

  if (jwt.error) {
    lines.push(`[${ts}] JWT: ${jwt.error}`);
  } else {
    const status = jwt.beyondLimit ? 'BEYOND 30-MIN LIMIT' : 'active';
    lines.push(`[${ts}] Session: ${jwt.client} (${status})`);
    lines.push(`  JWT:  ${jwt.sessionRemainingMin} Min remaining (${jwt.sessionElapsedMin} Min elapsed)`);
    lines.push(`  Auth: ${jwt.authTimeISO} → End: ${jwt.sessionEndISO}`);
    lines.push(`  Token expires in: ${jwt.tokenExpiresSec}s | Level: ${jwt.authnLevel} | Type: ${jwt.actingType}`);
  }

  if (dom.error) {
    lines.push(`  DOM:  ${dom.error}`);
  } else {
    lines.push(`  DOM:  ${dom.buttonText} (detail: ${dom.detailTimer})`);
    if (dom.srText) lines.push(`  A11y: ${dom.srText}`);
  }

  if (!jwt.error && !dom.error) {
    // Parse DOM timer to seconds for comparison
    const domParts = dom.detailTimer?.match(/(\d+)\s*:\s*(\d+)/);
    if (domParts) {
      const domSec = parseInt(domParts[1]) * 60 + parseInt(domParts[2]);
      const diff = domSec - jwt.sessionRemainingSec;
      if (Math.abs(diff) > 30) {
        lines.push(`  DRIFT: DOM vs JWT differ by ${Math.round(diff / 60)} Min`);
      }
    }
  }

  lines.push(`  Page: ${anonymize(pageUrl).substring(0, 70)}`);
  return lines.join('\n');
}

// --- Main ---
(async () => {
  const cdp = await connect();

  const printStatus = async () => {
    const jwt = await readJwtStatus(cdp.evaluate);
    const dom = await readDomTimer(cdp);
    console.log(formatStatus(jwt, dom, cdp.url));
  };

  await printStatus();

  if (WATCH_MODE) {
    console.log(`\n--- Watch mode: polling every ${WATCH_INTERVAL_MS / 1000}s (Ctrl+C to stop) ---\n`);
    const interval = setInterval(async () => {
      try {
        await printStatus();
        console.log('');
      } catch (e) {
        console.log(`[${new Date().toISOString()}] Error: ${e.message}`);
        clearInterval(interval);
        cdp.ws.close();
      }
    }, WATCH_INTERVAL_MS);

    process.on('SIGINT', () => { clearInterval(interval); cdp.ws.close(); });
    process.on('SIGTERM', () => { clearInterval(interval); cdp.ws.close(); });
  } else {
    cdp.ws.close();
  }
})();
