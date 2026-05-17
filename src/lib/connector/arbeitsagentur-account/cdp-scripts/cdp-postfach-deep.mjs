import { writeFileSync } from 'fs';

const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
const apiCalls = [];
const pendingBodies = new Map();

function send(method, params = {}) {
  return new Promise((resolve) => {
    const msgId = id++;
    const timeout = setTimeout(() => resolve(null), 10000);
    function handler(event) {
      const msg = JSON.parse(event.data);
      if (msg.id === msgId) {
        clearTimeout(timeout);
        ws.removeEventListener('message', handler);
        resolve(msg.result);
      }
    }
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: msgId, method, params }));
  });
}

function anonymize(str) {
  if (!str) return str;
  return str
    .replace(/Bearer [^\s"]+/g, 'Bearer <REDACTED>')
    // .replace(/<KUNDENNR_REGEX>/g, "<KUNDENNR>") // Configure per user
    // .replace(/<NAME_REGEX>/gi, "<REDACTED>") // Configure per user
    // .replace(/<BETREUER_REGEX>/g, "<BETREUER>") // Configure per user
    // .replace(/<ORT_REGEX>/g, "<ORT>") // Configure per user
    // .replace(/<DSTNR_REGEX>/g, "<DSTNR>") // Configure per user
    .replace(/"betreff"\s*:\s*"[^"]*"/g, '"betreff": "<SUBJECT>"')
    .replace(/"text"\s*:\s*"[^"]*"/g, '"text": "<CONTENT>"')
    .replace(/"inhalt"\s*:\s*"[^"]*"/g, '"inhalt": "<CONTENT>"')
    .replace(/"nachrichtText"\s*:\s*"[^"]*"/g, '"nachrichtText": "<CONTENT>"');
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
      requestId, method: request.method, url: anonymize(request.url), type, status: null,
      reqHeaders: Object.fromEntries(
        Object.entries(request.headers || {}).filter(([k]) =>
          ['content-type','accept','authorization'].includes(k.toLowerCase())
        ).map(([k,v]) => [k, anonymize(v)])
      ),
      reqBody: request.postData ? anonymize(request.postData).substring(0, 1000) : null,
      resBody: null
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
        if (result?.body) entry.resBody = anonymize(result.body).substring(0, 2500);
      }).catch(() => {});
    }
  }

  if (msg.method === 'Page.frameNavigated') {
    const { frame } = msg.params;
    if (!frame.parentId) console.log(`🌐 ${frame.url.substring(0, 100)}`);
  }
});

await send('Network.enable', { maxResourceBufferSize: 5000000, maxTotalBufferSize: 50000000 });
await send('Page.enable');

console.log('🔴 DEEP POSTFACH EXPLORATION\n');

// Step 1: Click on first message to open it
console.log('--- Step 1: Open first message ---');
const { result: { value: clickResult } } = await send('Runtime.evaluate', {
  expression: `
    (function() {
      // Find message list items and click the first one
      const links = document.querySelectorAll('a[href*="nachricht"], a[href*="nachrichten"], tr[class*="message"], [data-testid*="nachricht"]');
      if (links.length > 0) { links[0].click(); return 'clicked first link: ' + links[0].href?.substring(0, 60); }
      // Fallback: find clickable rows
      const rows = document.querySelectorAll('[role="row"], [role="link"], .message-row, li a');
      for (const r of rows) {
        if (r.href && r.href.includes('nachricht')) { r.click(); return 'clicked row link: ' + r.href.substring(0, 60); }
      }
      // Last fallback: any link in the message area
      const all = document.querySelectorAll('a');
      for (const a of all) {
        if (a.href && a.href.includes('nachricht') && !a.href.includes('ordner')) { 
          a.click(); return 'clicked: ' + a.href.substring(0, 80); 
        }
      }
      return 'no message links found. URLs on page: ' + [...document.querySelectorAll('a')].map(a=>a.href).filter(h=>h.includes('kokos')).slice(0,5).join(', ');
    })()
  `
});
console.log(clickResult);
await new Promise(r => setTimeout(r, 5000));

// Step 2: Check what loaded
console.log('\n--- Step 2: Capture message detail API calls ---');
const { result: { value: currentUrl } } = await send('Runtime.evaluate', { expression: 'location.href' });
console.log('Current URL:', currentUrl.substring(0, 100));

// Step 3: Navigate to "Gesendet" folder
console.log('\n--- Step 3: Navigate to Gesendet folder ---');
await send('Page.navigate', { url: 'https://web.arbeitsagentur.de/kokos/kokos-ui/pd/ordner/gesendet' });
await new Promise(r => setTimeout(r, 5000));

// Step 4: Navigate to "Neue Nachricht" page to discover compose API
console.log('\n--- Step 4: Navigate to Neue Nachricht ---');
const { result: { value: newMsgResult } } = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const links = document.querySelectorAll('a, button');
      for (const l of links) {
        const text = l.textContent?.trim();
        if (text && (text.includes('Neue Nachricht') || text.includes('Nachricht schreiben') || text.includes('Verfassen'))) {
          l.click(); return 'clicked: ' + text;
        }
      }
      return 'Neue Nachricht button not found. Buttons: ' + [...links].filter(l=>l.offsetParent).map(l=>l.textContent?.trim()?.substring(0,25)).filter(Boolean).slice(0,10).join(', ');
    })()
  `
});
console.log(newMsgResult);
await new Promise(r => setTimeout(r, 5000));

// Final URL
const { result: { value: finalUrl } } = await send('Runtime.evaluate', { expression: 'location.href' });
console.log('Final URL:', finalUrl.substring(0, 100));

// Print all captured API calls
const relevant = apiCalls.filter(c => c.method !== 'OPTIONS');
console.log(`\n\n========== DEEP POSTFACH API CALLS: ${relevant.length} ==========\n`);
for (const c of relevant) {
  console.log(`${c.method} ${c.status} ${c.url}`);
  if (c.reqBody) console.log(`  ReqBody: ${c.reqBody.substring(0, 400)}`);
  if (c.resBody) console.log(`  Response: ${c.resBody.substring(0, 800)}`);
  if (c.rateLimit) console.log(`  ⚠ Rate-Limit: ${c.rateLimit}`);
  console.log('');
}

writeFileSync('/tmp/postfach-deep-apis.json', JSON.stringify(relevant, null, 2));
console.log('Saved to /tmp/postfach-deep-apis.json');
ws.close();
