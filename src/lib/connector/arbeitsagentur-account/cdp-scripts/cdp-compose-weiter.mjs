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
}

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.method) return;
  if (msg.method === 'Network.requestWillBeSent') {
    const { requestId, request, type } = msg.params;
    if (type === 'XHR' || type === 'Fetch' || request.url.includes('rest.arbeitsagentur')) {
      if (/\.(js|css|woff2?|svg|png|ico)/.test(request.url)) return;
      apiCalls.push({ requestId, method: request.method, url: anonymize(request.url), status: null,
        reqBody: request.postData ? anonymize(request.postData).substring(0, 1500) : null, resBody: null });
    }
  }
  if (msg.method === 'Network.responseReceived') {
    const { requestId, response } = msg.params;
    const entry = apiCalls.find(e => e.requestId === requestId && !e.status);
    if (entry) { entry.status = response.status; pendingBodies.set(requestId, entry); }
  }
  if (msg.method === 'Network.loadingFinished') {
    const { requestId } = msg.params;
    const entry = pendingBodies.get(requestId);
    if (entry) { pendingBodies.delete(requestId);
      send('Network.getResponseBody', { requestId }).then(r => { if (r?.body) entry.resBody = anonymize(r.body).substring(0, 2500); }).catch(() => {}); }
  }
});

await send('Network.enable', { maxResourceBufferSize: 5000000, maxTotalBufferSize: 50000000 });

// Navigate fresh to /neu
console.log('🔴 COMPOSE FLOW — navigiere zu /neu\n');
await send('Page.navigate', { url: 'https://web.arbeitsagentur.de/kokos/kokos-ui/pd/neu' });
await new Promise(r => setTimeout(r, 5000));

// Step 1: Select AA
console.log('Step 1: Select "Agentur für Arbeit (AA)"');
await send('Runtime.evaluate', {
  expression: `
    const radio = document.getElementById('radio-AA');
    radio.click(); radio.checked = true;
    radio.dispatchEvent(new Event('change', { bubbles: true }));
  `
});
await new Promise(r => setTimeout(r, 1500));

// Step 2: Select "Allgemeine Anfrage"
console.log('Step 2: Select "Allgemeine Anfrage"');
await send('Runtime.evaluate', {
  expression: `
    const select = document.getElementById('select-anliegen');
    for (const opt of select.options) {
      if (opt.textContent.includes('Allgemeine Anfrage')) {
        select.value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        break;
      }
    }
  `
});
await new Promise(r => setTimeout(r, 1500));

// Step 3: Check for sub-anliegen select
console.log('Step 3: Check sub-anliegen');
const { result: { value: subCheck } } = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const selects = [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null);
      return JSON.stringify(selects.map(s => ({ id: s.id, selected: s.options[s.selectedIndex]?.textContent?.trim(), opts: [...s.options].map(o => o.textContent.trim().substring(0, 40)) })));
    })()
  `
});
console.log('Selects:', subCheck);

// Select sub-anliegen if present (first non-default option)
await send('Runtime.evaluate', {
  expression: `
    const selects = [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null && s.id !== 'select-anliegen');
    for (const s of selects) {
      if (s.options.length > 1) {
        s.selectedIndex = 1;
        s.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  `
});
await new Promise(r => setTimeout(r, 1500));

// Step 4: Click "Weiter"
console.log('Step 4: Click "Weiter"');
const { result: { value: weiterResult } } = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const btn = document.getElementById('link-forward');
      if (btn) { btn.click(); return 'clicked Weiter'; }
      const btns = [...document.querySelectorAll('a.ba-btn, button')].filter(b => b.offsetParent && b.textContent.includes('Weiter'));
      if (btns.length) { btns[0].click(); return 'clicked Weiter (fallback)'; }
      return 'Weiter not found';
    })()
  `
});
console.log(weiterResult);
await new Promise(r => setTimeout(r, 4000));

// Step 5: Analyze the compose form
console.log('\n--- COMPOSE FORM STATE ---');
const { result: { value: formState } } = await send('Runtime.evaluate', {
  expression: `
    JSON.stringify({
      url: location.href,
      h1: document.querySelector('h1')?.textContent?.trim(),
      h2s: [...document.querySelectorAll('h2, h3')].filter(h => h.offsetParent !== null).map(h => h.textContent?.trim()).slice(0, 10),
      labels: [...document.querySelectorAll('label')].filter(l => l.offsetParent !== null).map(l => ({ for: l.htmlFor, text: l.textContent?.trim()?.substring(0, 40) })).slice(0, 15),
      inputs: [...document.querySelectorAll('input[type=text], input[type=email], input[type=number]')].filter(i => i.offsetParent !== null).map(i => ({ id: i.id, name: i.name, maxLength: i.maxLength, placeholder: i.placeholder?.substring(0, 30), required: i.required })),
      textareas: [...document.querySelectorAll('textarea')].filter(t => t.offsetParent !== null).map(t => ({ id: t.id, name: t.name, maxLength: t.maxLength, rows: t.rows, required: t.required })),
      fileInputs: [...document.querySelectorAll('input[type=file]')].map(f => ({ id: f.id, name: f.name, accept: f.accept, multiple: f.multiple })),
      selects: [...document.querySelectorAll('select')].filter(s => s.offsetParent !== null).map(s => ({ id: s.id, opts: [...s.options].map(o => o.textContent.trim().substring(0, 30)).slice(0, 8) })),
      buttons: [...document.querySelectorAll('button, a.ba-btn, input[type=submit]')].filter(b => b.offsetParent !== null).map(b => ({ text: b.textContent?.trim()?.substring(0, 30), id: b.id, type: b.type || b.tagName })),
      checkboxes: [...document.querySelectorAll('input[type=checkbox]')].filter(c => c.offsetParent !== null).map(c => ({ id: c.id, name: c.name, label: c.nextElementSibling?.textContent?.trim()?.substring(0, 40) })),
      hiddenInputs: [...document.querySelectorAll('input[type=hidden]')].map(h => ({ name: h.name, value: h.value?.substring(0, 30) })).slice(0, 10)
    })
  `
});
const form = JSON.parse(formState);
console.log('URL:', form.url);
console.log('H1:', form.h1);
console.log('H2s:', form.h2s);
console.log('Labels:', form.labels);
console.log('Inputs:', form.inputs);
console.log('Textareas:', form.textareas);
console.log('File Inputs:', form.fileInputs);
console.log('Selects:', form.selects);
console.log('Buttons:', form.buttons);
console.log('Checkboxes:', form.checkboxes);
console.log('Hidden:', form.hiddenInputs);

// API calls during this flow
const relevant = apiCalls.filter(c => c.method !== 'OPTIONS');
console.log(`\n=== API CALLS: ${relevant.length} ===\n`);
for (const c of relevant) {
  console.log(`${c.method} ${c.status} ${c.url}`);
  if (c.reqBody) console.log(`  Body: ${c.reqBody.substring(0, 400)}`);
  if (c.resBody) console.log(`  Resp: ${c.resBody.substring(0, 600)}`);
  console.log('');
}

writeFileSync('/tmp/compose-flow-apis.json', JSON.stringify(relevant, null, 2));
ws.close();
