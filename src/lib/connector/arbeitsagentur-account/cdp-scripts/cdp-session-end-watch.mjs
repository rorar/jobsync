// Watch for session expiration behavior in the browser
const resp = await fetch('http://127.0.0.1:9223/json/list');
const targets = await resp.json();
const page = targets.find(t => t.type === 'page' && !t.url.startsWith('devtools://'));

if (!page) { console.error('No page'); process.exit(1); }

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise(resolve => ws.addEventListener('open', resolve));

let id = 1;
function send(method, params = {}) {
  return new Promise((resolve) => {
    const msgId = id++;
    const timeout = setTimeout(() => resolve(null), 5000);
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

await send('Network.enable');
await send('Page.enable');

let lastUrl = page.url;
let sessionEnded = false;

ws.addEventListener('message', (event) => {
  const msg = JSON.parse(event.data);
  if (!msg.method) return;
  const now = new Date().toLocaleTimeString('de-DE');

  if (msg.method === 'Page.frameNavigated') {
    const { frame } = msg.params;
    if (frame.parentId) return;
    if (frame.url !== lastUrl) {
      lastUrl = frame.url;
      const safe = frame.url.replace(/code=[^&]+/g,'code=***').replace(/session_state=[^&]+/g,'ss=***');
      console.log(`[${now}] 🌐 NAVIGATION: ${safe.substring(0, 120)}`);
      if (frame.url.includes('logout') || frame.url.includes('openid-connect/auth')) {
        console.log(`  ⚠ SESSION ENDED — Logout/Re-Auth detected!`);
        sessionEnded = true;
      }
    }
  }

  // Watch for token refresh attempts
  if (msg.method === 'Network.requestWillBeSent') {
    const { request } = msg.params;
    if (request.url.includes('openid-connect/token')) {
      console.log(`[${now}] 🔑 TOKEN REQUEST: ${request.method} ${request.url.substring(0, 80)}`);
    }
    if (request.url.includes('logout')) {
      console.log(`[${now}] 🚪 LOGOUT REQUEST: ${request.method} ${request.url.substring(0, 100)}`);
    }
    if (request.url.includes('check_session') || request.url.includes('login-status')) {
      console.log(`[${now}] 🔍 SESSION CHECK: ${request.url.substring(0, 100)}`);
    }
  }

  if (msg.method === 'Network.responseReceived') {
    const { response, requestId } = msg.params;
    if (response.url.includes('openid-connect/token') && response.status !== 200) {
      console.log(`[${now}] ❌ TOKEN REFRESH FAILED: ${response.status} ${response.url.substring(0, 80)}`);
    }
    if (response.status === 401 || response.status === 403) {
      console.log(`[${now}] 🚫 AUTH ERROR ${response.status}: ${response.url.substring(0, 100)}`);
    }
  }
});

console.log(`🔴 SESSION-END WATCHER aktiv (${new Date().toLocaleTimeString('de-DE')})`);
console.log(`  Beobachte: Token-Refreshes, Logouts, Session-Checks, Auth-Errors\n`);

// Also periodically check for session-timer appearance and modal popups
const checkInterval = setInterval(async () => {
  if (sessionEnded) { clearInterval(checkInterval); return; }
  const now = new Date().toLocaleTimeString('de-DE');
  
  const res = await send('Runtime.evaluate', {
    expression: `
      (function() {
        // Check for any session warning modals/popups
        const modals = document.querySelectorAll('[role="dialog"], [aria-modal="true"], .modal.show, [class*="expir"]');
        const visible = [...modals].filter(m => m.offsetParent !== null || getComputedStyle(m).display !== 'none');
        if (visible.length) return 'MODAL VISIBLE: ' + visible.map(m => m.textContent?.trim()?.substring(0, 80)).join(' | ');
        
        // Check for session-timer in shadow DOM  
        const timer = document.querySelector('session-timer');
        if (timer?.shadowRoot) {
          const text = timer.shadowRoot.textContent?.trim();
          if (text) return 'SESSION-TIMER: ' + text.substring(0, 50);
        }
        
        return null;
      })()
    `
  });
  
  if (res?.result?.value) {
    console.log(`[${now}] 👁 ${res.result.value}`);
  }
}, 10000); // check every 10s

// Run for 15 minutes
setTimeout(() => {
  clearInterval(checkInterval);
  console.log('\n⏰ Watcher beendet nach 15 Min');
  ws.close();
  process.exit(0);
}, 900000);
