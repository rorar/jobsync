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

// Navigate to profil (triggers login)
await send('Page.navigate', { url: 'https://web.arbeitsagentur.de/profil/profil-ui/pd/' });
await new Promise(r => setTimeout(r, 4000));

// Dismiss cookie banner
await send('Runtime.evaluate', {
  expression: `
    (function() {
      function findInShadow(root, selector) {
        let el = root.querySelector(selector);
        if (el) return el;
        for (const child of root.querySelectorAll('*')) {
          if (child.shadowRoot) {
            el = findInShadow(child.shadowRoot, selector);
            if (el) return el;
          }
        }
        return null;
      }
      const btn = findInShadow(document, '[data-testid="bahf-cookie-disclaimer-btn-ablehnen"]');
      if (btn) btn.click();
    })()
  `
});

// Click BundID
await send('Runtime.evaluate', {
  expression: `typeof onClickBundId === 'function' ? (onClickBundId('x'), 'ok') : 'no fn'`
});
await new Promise(r => setTimeout(r, 3000));

// Check where we are
const { result: { value: url } } = await send('Runtime.evaluate', { expression: 'location.href' });
console.log('After BundID click:', url.substring(0, 80));

// Click "Zur BundID wechseln" if present
await send('Runtime.evaluate', {
  expression: `
    [...document.querySelectorAll('button')].find(b => b.textContent.includes('Zur BundID wechseln'))?.click()
  `
});
await new Promise(r => setTimeout(r, 3000));

const { result: { value: url2 } } = await send('Runtime.evaluate', { expression: 'location.href' });
console.log('Now:', url2.substring(0, 80));

ws.close();
