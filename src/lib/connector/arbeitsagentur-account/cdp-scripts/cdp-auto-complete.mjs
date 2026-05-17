// Auto-clicks WEITER + "Online Angebot nutzen" when they appear
// Stops when profil page is reached
let lastUrl = '';

for (let i = 0; i < 120; i++) {
  const resp = await fetch('http://127.0.0.1:9223/json/list');
  const targets = await resp.json();
  const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));
  if (!page) { await new Promise(r => setTimeout(r, 2000)); continue; }

  if (page.url !== lastUrl) {
    lastUrl = page.url;
    console.log(`[${new Date().toLocaleTimeString('de-DE')}] ${page.title?.substring(0, 30)} — ${page.url.substring(0, 80)}`);
    if (page.url.includes('profil-ui/pd') && !page.url.includes('openid-connect')) {
      console.log('\n✓ PROFIL ERREICHT!');
      process.exit(0);
    }
  }

  try {
    const ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });
    
    let id = 1;
    const send = (method, params = {}) => new Promise(resolve => {
      const msgId = id++;
      const t = setTimeout(() => resolve(null), 3000);
      ws.addEventListener('message', function h(e) {
        const m = JSON.parse(e.data);
        if (m.id === msgId) { clearTimeout(t); ws.removeEventListener('message', h); resolve(m.result); }
      });
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });

    const res = await send('Runtime.evaluate', {
      expression: `
        (function() {
          // BundID "WEITER" modal
          const w = document.querySelector('[data-test-id="d0gQ0"]');
          if (w && w.offsetParent !== null) { w.click(); return 'CLICKED: WEITER'; }
          // Keycloak "Online Angebot nutzen"
          for (const b of document.querySelectorAll('button')) {
            if (b.textContent.includes('Online Angebot nutzen') && b.offsetParent) { b.click(); return 'CLICKED: Online Angebot nutzen'; }
          }
          return null;
        })()
      `
    });
    if (res?.result?.value) console.log(`  → ${res.result.value}`);
    ws.close();
  } catch(e) {}

  await new Promise(r => setTimeout(r, 2000));
}
