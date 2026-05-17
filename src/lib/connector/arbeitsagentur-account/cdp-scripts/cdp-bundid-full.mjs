const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
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

// Step 1: Click Anmelden
await send('Runtime.evaluate', {
  expression: `[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Anmelden')?.click()`
});
await new Promise(r => setTimeout(r, 2000));

// Step 2: Click Online-Ausweis (sjqET)
await send('Runtime.evaluate', {
  expression: `document.querySelector('[data-test-id="sjqET"]')?.click()`
});
await new Promise(r => setTimeout(r, 2000));

// Step 3: Click second "Anmelden" or "WEITER MIT AUSWEISAPP"
let { result: { value: r3 } } = await send('Runtime.evaluate', {
  expression: `
    (function() {
      const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
      for (const b of btns) {
        if (b.textContent.includes('WEITER MIT AUSWEISAPP')) { b.click(); return 'WEITER MIT AUSWEISAPP'; }
      }
      for (const b of btns) {
        if (b.textContent.trim() === 'Anmelden') { b.click(); return 'Anmelden (2nd)'; }
      }
      return 'buttons: ' + btns.map(b => b.textContent.trim().substring(0, 20)).join(', ');
    })()
  `
});
console.log('Step 3:', r3);
await new Promise(r => setTimeout(r, 2000));

// Step 4: If "WEITER MIT AUSWEISAPP" wasn't clicked yet, try again
if (!r3.includes('WEITER MIT AUSWEISAPP')) {
  const { result: { value: r4 } } = await send('Runtime.evaluate', {
    expression: `
      (function() {
        const btns = [...document.querySelectorAll('button')].filter(b => b.offsetParent !== null);
        for (const b of btns) {
          if (b.textContent.includes('WEITER MIT AUSWEISAPP')) { b.click(); return 'clicked WEITER MIT AUSWEISAPP'; }
        }
        return 'not found: ' + btns.map(b => b.textContent.trim().substring(0, 25)).join(', ');
      })()
    `
  });
  console.log('Step 4:', r4);
}

console.log('\n✓ AusweisApp-Flow gestartet — warte auf eID-Scan...');
ws.close();
