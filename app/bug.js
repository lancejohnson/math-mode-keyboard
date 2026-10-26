// Bug button + rolling screen recording, the same way Relay does it (relay shared/bug-recorder.ts).
// rrweb records the page's DOM (not pixels) and posts a chunk every 15 s and on hide to /api/recording,
// which hands it to the Relay daemon; Relay keeps the last 10 minutes. The bug button marks the moment,
// asks what went wrong and posts /api/bug, which starts a Relay session that reads the recording first.
// Only for the owner: it runs only when /api/status says this browser holds the private recognition cookie.
// Nothing here may break the app: every hook is wrapped, and a recorder that fails just leaves it unrecorded.
(() => {
  const FLUSH_MS = 15000, CHECKOUT_MS = 60000, RETENTION_MS = 600000, EV_META = 4, ID_KEY = 'mathmode.recorder.id';
  const app = !!window.nativeShell, kind = app ? 'phone' : 'web', build = 'mathmode-1';
  let markNow = null;

  function installId() {
    try {
      let id = localStorage.getItem(ID_KEY);
      if (!id || !/^[A-Za-z0-9_-]{4,64}$/.test(id)) { id = `mm-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`; localStorage.setItem(ID_KEY, id); }
      return id;
    } catch { return 'nostorage'; }
  }
  function describe(el) {
    if (!el) return { label: '', target: '' };
    const hit = el.closest('button,a,[role=button],[role=tab],input,textarea,select,summary,label,math-field,.k,[data-testid]') || el;
    const text = (hit.getAttribute('aria-label') || hit.getAttribute('title') || hit.textContent || hit.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
    const cls = typeof hit.className === 'string' ? hit.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return { label: text, target: hit.tagName.toLowerCase() + (cls ? '.' + cls : '') };
  }
  const stringify = args => args.map(a => a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : (() => { try { return JSON.stringify(a); } catch { return String(a); } })()).join(' ').slice(0, 1000);

  function start(record) {
    const client = installId(), page = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    let seq = 0, current = null, sending = false, recording = false;
    const queue = [];
    const cut = () => { if (current && current.events.length) queue.push(current); current = null; };
    const note = (tag, payload) => { if (recording) try { record.record.addCustomEvent(tag, payload); } catch {} };
    const emit = (event, isCheckout) => {
      if (isCheckout && event.type === EV_META) cut();
      if (!current) current = { t0: event.timestamp, t1: event.timestamp, page, seq: seq++, full: event.type === EV_META, events: [] };
      current.events.push(event); current.t1 = event.timestamp;
    };
    async function body(events) {
      const json = JSON.stringify(events);
      if (typeof CompressionStream === 'function') try { return { blob: await new Response(new Blob([json]).stream().pipeThrough(new CompressionStream('gzip'))).blob(), gz: true }; } catch {}
      return { blob: new Blob([json]), gz: false };
    }
    const origFetch = window.fetch.bind(window);
    async function send(leaving = false) {
      if (sending) return;
      const cutoff = Date.now() - RETENTION_MS - CHECKOUT_MS;
      while (queue.length && queue[0].t1 < cutoff) queue.shift();
      sending = true;
      try {
        while (queue.length) {
          const c = queue[0], { blob, gz } = await body(c.events);
          const q = new URLSearchParams({ client, kind, build, page: c.page, seq: String(c.seq), t0: String(c.t0), t1: String(c.t1), full: c.full ? '1' : '0' });
          const res = await origFetch('/api/recording?' + q, { method: 'POST', keepalive: leaving && blob.size < 60000, headers: { 'content-type': gz ? 'application/gzip' : 'application/json' }, body: blob, signal: AbortSignal.timeout?.(30000) });
          if (res.status === 403) { stop(); return; }
          if (!res.ok) break;
          queue.shift();
        }
      } catch { /* kept for the next attempt */ } finally { sending = false; }
    }
    const flush = (leaving = false) => { if (!recording) return; cut(); send(leaving); };
    let stopRecord;
    const stop = () => { try { stopRecord?.(); } catch {} recording = false; markNow = null; queue.length = 0; current = null; };
    try {
      stopRecord = record.record({
        emit, checkoutEveryNms: CHECKOUT_MS, maskInputOptions: { password: true },
        sampling: { mousemove: 100, scroll: 150, media: 800, input: 'last', canvas: 1 },
        // Handwriting lives on canvases: one still a second is enough to see the ink.
        recordCanvas: true, dataURLOptions: { type: 'image/webp', quality: 0.5 }, collectFonts: false, inlineImages: false,
      });
      recording = typeof stopRecord === 'function';
    } catch { recording = false; }
    if (!recording) return;
    markNow = text => { const at = Date.now(); note('mark', { note: text.slice(0, 300), at }); flush(); return { client, at }; };
    note('page', { kind, build, ua: navigator.userAgent, client });
    document.addEventListener('click', e => { try { note('click', describe(e.target instanceof Element ? e.target : null)); } catch {} }, true);
    document.addEventListener('keydown', e => { if (['Enter', 'Escape', 'Tab', 'Backspace'].includes(e.key)) note('key', { key: e.key, target: describe(e.target instanceof Element ? e.target : null).target }); }, true);
    const nav = () => note('nav', { url: location.pathname + location.search + location.hash });
    addEventListener('hashchange', nav); addEventListener('popstate', nav);
    addEventListener('error', e => note('error', { message: e.message || String(e.error), stack: e.error instanceof Error ? e.error.stack : `${e.filename}:${e.lineno}` }));
    addEventListener('unhandledrejection', e => { const r = e.reason; note('error', { message: 'unhandled rejection: ' + (r instanceof Error ? r.message : stringify([r])), stack: r instanceof Error ? r.stack : undefined }); });
    for (const level of ['error', 'warn']) { const orig = console[level].bind(console); console[level] = (...args) => { note('console', { level, text: stringify(args) }); orig(...args); }; }
    window.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, t = Date.now(), method = init?.method || input?.method || 'GET';
      try { const res = await origFetch(input, init); if (!res.ok) note('fetch', { method, url, status: res.status, ms: Date.now() - t }); return res; }
      catch (err) { note('fetch', { method, url, status: err?.message || 'failed', ms: Date.now() - t }); throw err; }
    };
    document.addEventListener('visibilitychange', () => { note('visibility', { state: document.visibilityState }); if (document.hidden) flush(true); });
    addEventListener('pagehide', () => flush(true));
    setInterval(flush, FLUSH_MS);
    window.mathModeMarkBug = text => markNow?.(text || '') ?? null;
  }

  const ICON = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7.5a3 3 0 0 1 6 0"/><rect x="7" y="7.5" width="10" height="12" rx="5"/><path d="M12 10v9.5M7 12H3.5M17 12h3.5M7 16.5l-3 2M17 16.5l3 2M7.5 9l-3-2M16.5 9l3-2M10 4.5 9 3M14 4.5l1-1.5"/></svg>';
  function button() {
    const css = document.createElement('style');
    // Floats above the tab bar; when the tabs hide (math keyboard up, a fact sitting) it becomes a small handle on the right edge, above where the keyboard starts.
    css.textContent = `#bugBtn{position:fixed;z-index:60;bottom:calc(var(--tabs-h) + env(safe-area-inset-bottom) + 12px);right:12px;width:36px;height:36px;border-radius:18px;display:grid;place-items:center;
      background:var(--color-paper-2);color:var(--color-muted);border:1px solid var(--color-rule);opacity:.7;padding:0}
    #bugBtn::after{content:'';position:absolute;inset:-4px}
    body:has(#kb:not([hidden])) #bugBtn,body:has([data-hide-tabs]:not([hidden]):not(#bugSheet)) #bugBtn{bottom:auto;top:30vh;right:0;width:30px;border-radius:18px 0 0 18px;border-right:0}
    #bugSheet{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;background:#0009}
    #bugSheet[hidden]{display:none}
    #bugSheet form{width:100%;max-width:560px;margin:0 auto;background:var(--color-paper-2);border-top:4px solid var(--color-accent-2);padding:var(--space-md) var(--space-md) calc(var(--space-md) + env(safe-area-inset-bottom));
      display:grid;gap:var(--space-sm);font:var(--text-md)/1.4 var(--font-body);color:var(--color-ink)}
    #bugSheet h2{margin:0;font:700 var(--text-lg)/1.2 var(--font-display)}
    #bugSheet p{margin:0;color:var(--color-muted);font-size:var(--text-sm)}
    #bugSheet textarea{min-height:110px;resize:vertical;background:var(--color-paper);color:var(--color-ink);border:1px solid var(--color-paper-3);border-radius:var(--radius-key);padding:var(--space-sm);font:inherit;font-size:16px}
    #bugSheet textarea:focus{outline:2px solid var(--color-focus);outline-offset:1px}
    #bugSheet .row{display:flex;gap:var(--space-xs);justify-content:flex-end}
    #bugSheet button{min-height:44px;padding:0 var(--space-lg);border-radius:var(--radius-key);border:0;font:600 var(--text-md)/1 var(--font-body);background:var(--color-key);color:var(--color-ink)}
    #bugSheet button[type=submit]{background:var(--color-accent);color:var(--color-accent-ink)}
    #bugSheet button:disabled{opacity:.5}
    #bugToast{position:fixed;z-index:70;left:50%;transform:translateX(-50%);top:calc(env(safe-area-inset-top) + 52px);padding:10px 16px;border-radius:22px;background:var(--color-paper-3);color:var(--color-ink);font:600 var(--text-sm)/1.2 var(--font-body);white-space:nowrap}`;
    const btn = document.createElement('button');
    btn.id = 'bugBtn'; btn.type = 'button'; btn.setAttribute('aria-label', 'Report a bug'); btn.innerHTML = ICON;
    const sheet = document.createElement('div');
    sheet.id = 'bugSheet'; sheet.hidden = true; sheet.dataset.hideTabs = '';
    sheet.innerHTML = `<form role="dialog" aria-modal="true" aria-labelledby="bugH"><h2 id="bugH">Report a bug</h2>
      <p>The last few minutes on screen go with it, so you only need to say what went wrong.</p>
      <textarea id="bugText" aria-label="What went wrong" placeholder="What went wrong?" required></textarea>
      <div class="row"><button type="button" id="bugCancel">Cancel</button><button type="submit" id="bugSend">Send</button></div></form>`;
    let mark = null;
    const close = () => { sheet.hidden = true; };
    const toast = text => { document.querySelector('#bugToast')?.remove(); const t = document.createElement('div'); t.id = 'bugToast'; t.setAttribute('role', 'status'); t.textContent = text; document.body.append(t); setTimeout(() => t.remove(), 4000); };
    btn.addEventListener('click', e => {
      e.stopPropagation();
      mark = markNow ? markNow('') : null;   // the moment of the tap, before the sheet covers the screen
      sheet.hidden = false; sheet.querySelector('#bugText').focus();
    });
    sheet.querySelector('#bugCancel').addEventListener('click', close);
    sheet.addEventListener('click', e => { if (e.target === sheet) close(); });
    sheet.querySelector('form').addEventListener('submit', async e => {
      e.preventDefault();
      const area = sheet.querySelector('#bugText'), send = sheet.querySelector('#bugSend'), text = area.value.trim();
      if (!text) return area.focus();
      send.disabled = true; send.textContent = 'Sending…';
      try {
        const r = await fetch('/api/bug', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, client: mark?.client, at: mark?.at, page: location.pathname + location.hash, viewport: `${innerWidth}×${innerHeight}`, app }) });
        if (!r.ok) throw new Error();
        area.value = ''; close(); toast('Sent. An agent is on it.');
      } catch { toast('Could not send. Try again.'); }
      finally { send.disabled = false; send.textContent = 'Send'; }
    });
    document.head.append(css); document.body.append(btn, sheet);
  }

  async function init() {
    try {
      const status = await (await fetch('/api/status', { signal: AbortSignal.timeout?.(8000) })).json();
      if (!status.authorized) return;
    } catch { return; }
    button();
    const s = document.createElement('script');
    s.src = '/vendor/rrweb-record.min.js?v=1';
    s.onload = () => { try { if (window.rrwebRecord?.record) start(window.rrwebRecord); } catch {} };
    document.head.append(s);
  }
  document.body ? init() : addEventListener('DOMContentLoaded', init);
})();
