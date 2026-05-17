import { writeFileSync } from 'fs';
import { anonymize } from './cdp-anonymize.mjs';

const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

if (!page) { console.error('No page found'); process.exit(1); }
console.log(`Connected to: ${page.title}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
const apiCalls = [];
const pendingBodies = new Map();

function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const msgId = id++;
    const timeout = setTimeout(() => reject(new Error(`Timeout: ${method}`)), 10000);
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


// Only capture API calls (XHR/Fetch), skip static assets
function isApiCall(url, type) {
  if (type === 'XHR' || type === 'Fetch') return true;
  if (url.includes('/api/') || url.includes('/rest.') || url.includes('-service/') || url.includes('-api/')) return true;
  return false;
}

function isStaticAsset(url) {
  return /\.(js|css|woff2?|ttf|svg|png|jpg|ico|json)(\?|$)/.test(url) && !url.includes('/api/');
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.method) return;

  if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, type } = msg.params;
    if (isStaticAsset(request.url) && !isApiCall(request.url, type)) return;
    if (!isApiCall(request.url, type)) return;

    const entry = {
      requestId,
      time: new Date().toLocaleTimeString('de-DE'),
      method: request.method,
      url: anonymize(request.url),
      type,
      reqHeaders: {},
      reqBody: null,
      status: null,
      resHeaders: {},
      resBody: null
    };

    // Capture relevant request headers
    for (const [k, v] of Object.entries(request.headers || {})) {
      const kl = k.toLowerCase();
      if (['content-type', 'accept', 'authorization', 'x-requested-with', 'origin', 'referer'].includes(kl)) {
        entry.reqHeaders[k] = anonymize(v);
      }
    }

    if (request.postData) {
      entry.reqBody = anonymize(request.postData).substring(0, 500);
    }

    apiCalls.push(entry);
  }

  if (msg.method === 'Network.responseReceived') {
    const { requestId, response } = msg.params;
    const entry = apiCalls.find(e => e.requestId === requestId && !e.status);
    if (!entry) return;

    entry.status = response.status;
    entry.statusText = response.statusText;
    entry.resContentType = response.headers?.['content-type'] || response.headers?.['Content-Type'] || '';

    // Capture response headers of interest
    for (const h of ['set-cookie', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'retry-after', 'cache-control', 'content-type', 'location']) {
      const val = response.headers?.[h] || response.headers?.[h.split('-').map((w,i) => i?w[0].toUpperCase()+w.slice(1):w).join('-')];
      if (val) entry.resHeaders[h] = anonymize(val)?.substring(0, 200);
    }

    // Request response body
    pendingBodies.set(requestId, entry);
  }

  if (msg.method === 'Network.loadingFinished') {
    const { requestId } = msg.params;
    const entry = pendingBodies.get(requestId);
    if (entry) {
      pendingBodies.delete(requestId);
      // Fetch response body
      send('Network.getResponseBody', { requestId }).then(result => {
        if (result && result.body) {
          entry.resBody = anonymize(result.body).substring(0, 1000);
        }
      }).catch(() => {});
    }
  }
});

// Enable network with response bodies
await send('Network.enable', { maxResourceBufferSize: 5000000, maxTotalBufferSize: 50000000 });
await send('Page.enable');

console.log('🔴 API DISCOVERY aktiv — erfasse alle XHR/Fetch-Calls...');
console.log('   Profil-Seite ist geladen, warte auf API-Aktivität + manuelle Navigation...\n');

// Trigger a page reload to capture initial API calls
await send('Page.reload');

// Wait 60 seconds for initial page load APIs
await new Promise(r => setTimeout(r, 60000));

// Print results
console.log(`\n========== API DISCOVERY ERGEBNIS ==========`);
console.log(`Erfasste API-Calls: ${apiCalls.length}\n`);

for (const call of apiCalls) {
  console.log(`${call.method} ${call.status} ${call.url}`);
  if (Object.keys(call.reqHeaders).length) console.log(`  Req-Headers: ${JSON.stringify(call.reqHeaders)}`);
  if (call.reqBody) console.log(`  Req-Body: ${call.reqBody.substring(0, 200)}`);
  if (call.resContentType) console.log(`  Res-Type: ${call.resContentType}`);
  if (call.resBody) console.log(`  Res-Body: ${call.resBody.substring(0, 300)}`);
  if (call.resHeaders['x-ratelimit-limit']) console.log(`  ⚠ Rate-Limit: ${call.resHeaders['x-ratelimit-limit']}`);
  console.log('');
}

// Save full data
writeFileSync('/tmp/api-discovery.json', JSON.stringify(apiCalls, null, 2));
console.log('Full data saved to /tmp/api-discovery.json');

ws.close();
