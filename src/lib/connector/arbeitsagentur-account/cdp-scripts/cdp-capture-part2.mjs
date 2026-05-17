import { writeFileSync } from 'fs';
import { anonymize } from './cdp-anonymize.mjs';

const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
const capturedFlow = [];
let done = false;

function send(method, params = {}) {
  return new Promise((resolve) => {
    const msgId = id++;
    function handler(event) {
      const msg = JSON.parse(event.data);
      if (msg.id === msgId) {
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    }
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}


ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.method) return;
  const now = new Date().toLocaleTimeString('de-DE');

  if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, redirectResponse, type } = msg.params;
    const entry = { time: now, requestId, type, method: request.method, url: anonymize(request.url), status: null };
    if (redirectResponse) {
      entry.redirectFrom = anonymize(redirectResponse.url || '');
      entry.redirectStatus = redirectResponse.status;
      const sc = redirectResponse.headers?.['set-cookie'] || redirectResponse.headers?.['Set-Cookie'];
      if (sc) entry.redirectSetCookie = sc.replace(/=([^;]+)/g, '=<V>').substring(0, 200);
    }
    capturedFlow.push(entry);
  }

  if (msg.method === 'Network.responseReceived') {
    const { requestId, response } = msg.params;
    const entry = capturedFlow.find(e => e.requestId === requestId && !e.status);
    if (entry) {
      entry.status = response.status;
      const sc = response.headers?.['set-cookie'] || response.headers?.['Set-Cookie'];
      if (sc) entry.setCookie = sc.replace(/=([^;]+)/g, '=<V>').substring(0, 200);
      const loc = response.headers?.['location'] || response.headers?.['Location'];
      if (loc) entry.location = anonymize(loc).substring(0, 150);
      for (const h of ['x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after']) {
        if (response.headers?.[h]) entry[h] = response.headers[h];
      }
    }
  }

  if (msg.method === 'Page.frameNavigated') {
    const { frame } = msg.params;
    if (frame.parentId) return;
    console.log(`[${now}] 🌐 ${anonymize(frame.url).substring(0, 120)}`);
    if (frame.url.includes('profil-ui/pd') && !frame.url.includes('openid-connect')) {
      console.log('\n✓ LOGIN ERFOLGREICH!\n');
      done = true;
    }
  }
});

await send('Network.enable');
await send('Page.enable');
console.log('🔴 CAPTURE PART 2 — warte auf AusweisApp + Rückweg...\n');

// Wait up to 3 minutes, or until login complete
for (let i = 0; i < 180 && !done; i++) {
  await new Promise(r => setTimeout(r, 1000));
}

// Print auth flow
const authFlow = capturedFlow.filter(e =>
  e.url?.includes('arbeitsagentur') ||
  e.url?.includes('bundid') ||
  e.url?.includes('bund.de') ||
  e.url?.includes('openid') ||
  e.url?.includes('oauth') ||
  e.url?.includes('auth') ||
  e.url?.includes('token') ||
  e.url?.includes('login') ||
  e.url?.includes('saml') ||
  e.url?.includes('broker') ||
  e.setCookie ||
  e.redirectSetCookie ||
  e.location ||
  e.status === 302 || e.status === 301 || e.status === 303
);

console.log(`\n========== AUTH FLOW PART 2 (${authFlow.length} requests) ==========\n`);
for (const e of authFlow) {
  console.log(`${e.method} ${e.status || '→'} ${e.url?.substring(0, 140)}`);
  if (e.location) console.log(`  → Location: ${e.location}`);
  if (e.setCookie) console.log(`  🍪 ${e.setCookie.substring(0, 150)}`);
  if (e.redirectFrom) console.log(`  ↩ from ${e.redirectStatus}: ${e.redirectFrom.substring(0, 100)}`);
  console.log('');
}

writeFileSync('/tmp/auth-flow-part2.json', JSON.stringify(authFlow, null, 2));
console.log('Saved to /tmp/auth-flow-part2.json');
ws.close();
