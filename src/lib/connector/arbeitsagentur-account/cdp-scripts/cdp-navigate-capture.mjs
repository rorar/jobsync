import { writeFileSync } from 'fs';

const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

if (!page) { console.error('No page found'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
const apiCalls = [];
const pendingBodies = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = id++;
    const timeout = setTimeout(() => resolve(null), 10000);
    function handler(event) {
      const msg = JSON.parse(event.data);
      if (msg.id === msgId) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        resolve(msg.result || msg.error);
      }
    }
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

function anonymize(str) {
  if (!str) return str;
  return str
    .replace(/access_token["\s:=]+[^&\s",}]+/g, 'access_token=<REDACTED>')
    .replace(/Bearer [^\s"]+/g, 'Bearer <REDACTED>')
    .replace(/"name"\s*:\s*"[^"]*"/g, '"name": "<REDACTED>"')
    .replace(/"vorname"\s*:\s*"[^"]*"/g, '"vorname": "<REDACTED>"')
    .replace(/"nachname"\s*:\s*"[^"]*"/g, '"nachname": "<REDACTED>"')
    .replace(/"kundennummer"\s*:\s*"[^"]*"/gi, '"kundennummer": "<REDACTED>"')
    // .replace(/<KUNDENNR_REGEX>/g, "<KUNDENNR>") // Configure per user
    // .replace(/<NAME_REGEX>/gi, "<REDACTED>") // Configure per user
}

function isApiCall(url, type) {
  if (type === 'XHR' || type === 'Fetch') return true;
  if (url.includes('rest.arbeitsagentur') || url.includes('/api/') || url.includes('-service/')) return true;
  return false;
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|svg|png|jpg|ico)(\?|$)/.test(url) && !url.includes('/api/') && !url.includes('-service/');
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.method) return;

  if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, type } = msg.params;
    if (isStaticAsset(request.url)) return;
    if (!isApiCall(request.url, type)) return;

    apiCalls.push({
      requestId,
      time: new Date().toLocaleTimeString('de-DE'),
      method: request.method,
      url: anonymize(request.url),
      type,
      reqHeaders: Object.fromEntries(
        Object.entries(request.headers || {}).filter(([k]) =>
          ['content-type','accept','authorization','x-requested-with'].includes(k.toLowerCase())
        ).map(([k,v]) => [k, anonymize(v)])
      ),
      reqBody: request.postData ? anonymize(request.postData).substring(0, 800) : null,
      status: null, resBody: null
    });
  }

  if (msg.method === 'Network.responseReceived') {
    const { requestId, response } = msg.params;
    const entry = apiCalls.find(e => e.requestId === requestId && !e.status);
    if (!entry) return;
    entry.status = response.status;
    entry.resContentType = response.headers?.['content-type'] || '';
    const rl = response.headers?.['x-ratelimit-limit'];
    if (rl) entry.rateLimit = rl;
    pendingBodies.set(requestId, entry);
  }

  if (msg.method === 'Network.loadingFinished') {
    const { requestId } = msg.params;
    const entry = pendingBodies.get(requestId);
    if (entry) {
      pendingBodies.delete(requestId);
      send('Network.getResponseBody', { requestId }).then(result => {
        if (result?.body) entry.resBody = anonymize(result.body).substring(0, 1500);
      }).catch(() => {});
    }
  }

  if (msg.method === 'Page.frameNavigated') {
    const { frame } = msg.params;
    if (!frame.parentId) {
      console.log(`🌐 Navigated: ${frame.url.substring(0, 100)}`);
    }
  }
});

await send('Network.enable', { maxResourceBufferSize: 5000000, maxTotalBufferSize: 50000000 });
await send('Page.enable');

// === NAVIGATE TO TERMINE ===
console.log('\n=== NAVIGATING TO TERMINE ===\n');
await send('Page.navigate', { url: 'https://web.arbeitsagentur.de/portal/termine/pd' });

// Wait for page load + API calls
await new Promise(r => setTimeout(r, 15000));

console.log(`\n=== TERMINE API CALLS: ${apiCalls.length} ===\n`);
for (const c of apiCalls) {
  if (c.method === 'OPTIONS') continue;
  console.log(`${c.method} ${c.status} ${c.url}`);
  if (c.reqBody) console.log(`  Body: ${c.reqBody.substring(0, 300)}`);
  if (c.resBody) console.log(`  Resp: ${c.resBody.substring(0, 500)}`);
  if (c.rateLimit) console.log(`  ⚠ Rate-Limit: ${c.rateLimit}`);
  console.log('');
}

// Save
writeFileSync('/tmp/termine-apis.json', JSON.stringify(apiCalls.filter(c => c.method !== 'OPTIONS'), null, 2));
console.log('Saved to /tmp/termine-apis.json');

ws.close();
