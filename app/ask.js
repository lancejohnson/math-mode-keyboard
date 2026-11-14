// Lesson chat: highlight part of a lesson, tap "Ask about this", talk it over, then "Back to lesson".
// The chat is an opaque sheet over the page (over the tab bar too, so nothing under it has to hide), so the lesson keeps its place, step and scroll underneath.
// "Back to chat" reopens the same talk until you highlight something new. Owner only (it costs a model call
// per message): it runs only when /api/status says this browser holds the private cookie. Loaded by nav.js.
(() => {
  const SKIP = '#kb, math-field, input, textarea, [contenteditable], #askSheet, #askPill, #bugSheet, #siteNav';
  let chat = null, picked = null, busy = false, hideTimer = 0;

  function build() {
    const css = document.createElement('style');
    css.textContent = `
    #askPill{position:fixed;z-index:45;left:50%;bottom:calc(var(--tabs-h) + 14px + env(safe-area-inset-bottom));transform:translate(-50%,8px);opacity:0;pointer-events:none;
      transition:opacity .16s,transform .16s;min-height:44px;padding:0 20px;border:0;border-radius:22px;background:var(--color-accent);color:var(--color-accent-ink);
      font:600 var(--text-md)/1 var(--font-body);box-shadow:0 4px 18px #0008;white-space:nowrap;-webkit-user-select:none;user-select:none}
    #askPill.on{opacity:1;transform:translate(-50%,0);pointer-events:auto}
    #askPill.resume{background:var(--color-paper-3);color:var(--color-ink)}
    body:has(#kb:not([hidden])) #askPill,body:has([data-hide-tabs]:not([hidden])) #askPill{display:none}
    #askSheet{position:fixed;left:0;right:0;top:0;height:100%;z-index:65;display:flex;flex-direction:column;background:var(--color-paper);color:var(--color-ink);
      font:var(--text-md)/1.45 var(--font-body);padding-top:env(safe-area-inset-top);transition:opacity .18s,transform .18s;overscroll-behavior:contain}
    #askSheet[hidden]{display:none}
    #askSheet.out{opacity:0;transform:translateY(24px)}
    #askSheet header{flex:none;display:flex;align-items:center;border-bottom:1px solid var(--color-rule)}
    #askBack{min-height:48px;padding:0 var(--space-md);border:0;background:none;color:var(--color-accent-hi);font:600 var(--text-md)/1 var(--font-body)}
    #askLog{flex:1;overflow-y:auto;overscroll-behavior:contain;padding:var(--space-md);display:flex;flex-direction:column;gap:var(--space-sm)}
    #askLog blockquote{margin:0;padding:var(--space-xs) var(--space-sm);border-left:3px solid var(--color-accent-hi);background:var(--color-paper-2);color:var(--color-ink-2);
      white-space:pre-wrap;max-height:9.5em;overflow-y:auto}
    #askLog .me{align-self:flex-end;max-width:85%;background:var(--color-key-op);padding:var(--space-xs) var(--space-sm);border-radius:var(--radius-key);white-space:pre-wrap}
    #askLog .tutor p{margin:0 0 .6em}#askLog .tutor p:last-child{margin:0}
    #askLog .wait{color:var(--color-muted)}#askLog .err{color:var(--color-wrong)}
    #askLog .starts{display:flex;gap:var(--space-xs);flex-wrap:wrap}
    #askLog .starts button{min-height:40px;padding:0 var(--space-md);border:1px solid var(--color-paper-3);border-radius:20px;background:var(--color-paper-2);color:var(--color-ink);font:inherit}
    #askForm{flex:none;padding:var(--space-xs) var(--space-sm) calc(var(--space-xs) + env(safe-area-inset-bottom));border-top:1px solid var(--color-rule)}
    #askForm .box{border:1px solid var(--color-paper-3);border-radius:4px;background:var(--color-paper-2)}
    #askForm .box:focus-within{border-color:var(--color-focus)}
    #askText{display:block;width:100%;box-sizing:border-box;resize:none;border:0;outline:0;background:none;color:var(--color-ink);font:16px/1.4 var(--font-body);padding:10px 12px 4px;min-height:0;max-height:140px}
    #askForm .tools{display:flex;align-items:center;justify-content:flex-end;gap:4px;padding:0 4px 4px}
    #askForm .tools button{width:40px;height:40px;border:0;border-radius:4px;background:none;color:var(--color-muted);display:grid;place-items:center}
    #askForm .tools button svg{width:22px;height:22px}
    #askMic.live{color:var(--color-accent-2)}
    #askSend{background:var(--color-accent)!important;color:var(--color-accent-ink)!important}
    #askSend:disabled{opacity:.4}`;
    const pill = document.createElement('button');
    pill.id = 'askPill'; pill.type = 'button';
    const sheet = document.createElement('div');
    sheet.id = 'askSheet'; sheet.hidden = true; sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-label', 'Chat about the lesson');
    sheet.innerHTML = `<header><button type="button" id="askBack">‹ Back to lesson</button></header><div id="askLog" aria-live="polite"></div>
      <form id="askForm"><div class="box"><textarea id="askText" rows="1" aria-label="Your question" placeholder="Ask about this…"></textarea>
      <div class="tools"><button type="button" id="askMic" aria-label="Dictate" hidden><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg></button>
      <button type="submit" id="askSend" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M5 12l7-7 7 7"/></svg></button></div></div></form>`;
    document.head.append(css); document.body.append(pill, sheet);
    return { pill, sheet, log: sheet.querySelector('#askLog'), text: sheet.querySelector('#askText'), send: sheet.querySelector('#askSend'), mic: sheet.querySelector('#askMic') };
  }

  // What was highlighted, plus the lesson text around it (the nearest section or the whole lesson view).
  function readSelection() {
    const sel = getSelection(), text = sel?.toString().replace(/\s+\n/g, '\n').trim();
    if (!text || text.length < 2 || !sel.rangeCount) return null;
    const node = sel.getRangeAt(0).commonAncestorContainer, el = node.nodeType === 1 ? node : node.parentElement;
    if (!el || el.closest(SKIP)) return null;
    const where = el.closest('#topicView:not([hidden]), main, article, #listView, body');
    return { selection: text.slice(0, 2000), context: (where?.innerText || '').slice(0, 8000), title: document.title };
  }

  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const tutorHtml = t => t.split(/\n{2,}/).map(p => '<p>' + esc(p).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\n/g, '<br>') + '</p>').join('');

  function init() {
    const ui = build();
    const setPill = () => {
      clearTimeout(hideTimer);
      const now = readSelection();
      if (now) { picked = now; ui.pill.textContent = 'Ask about this'; ui.pill.className = 'on'; return; }
      // Tapping the pill clears the selection on iPhone before the tap lands: keep the pick a moment.
      hideTimer = setTimeout(() => { picked = null; ui.pill.textContent = 'Back to chat'; ui.pill.className = chat ? 'on resume' : ''; }, 400);
    };
    document.addEventListener('selectionchange', setPill);

    const render = () => {
      ui.log.innerHTML = `<blockquote>${esc(chat.selection)}</blockquote>` +
        chat.messages.map(m => m.role === 'user' ? `<div class="me">${esc(m.text)}</div>` : `<div class="tutor">${tutorHtml(m.text)}</div>`).join('') +
        (busy ? '<div class="wait">Thinking…</div>' : '') + (chat.error ? `<div class="err">${esc(chat.error)}</div>` : '') +
        (!chat.messages.length && !busy ? '<div class="starts"><button type="button" data-q="Explain this more simply.">Explain this</button><button type="button" data-q="Can you give me another example?">Another example</button><button type="button" data-q="Why is this true?">Why?</button></div>' : '');
      ui.log.scrollTop = ui.log.scrollHeight;
      ui.send.disabled = busy;
    };
    const grow = () => { ui.text.style.height = 'auto'; ui.text.style.height = Math.min(ui.text.scrollHeight, 140) + 'px'; };
    const open = () => {
      getSelection()?.removeAllRanges(); ui.pill.className = '';
      ui.sheet.hidden = false; ui.sheet.classList.add('out'); fit();
      requestAnimationFrame(() => requestAnimationFrame(() => ui.sheet.classList.remove('out')));
      render(); if (!chat.messages.length) ui.text.focus();
    };
    const close = () => {
      ui.text.blur(); ui.sheet.classList.add('out');
      setTimeout(() => { ui.sheet.hidden = true; ui.sheet.classList.remove('out'); setPill(); }, 180);
    };
    ui.pill.addEventListener('pointerdown', e => e.preventDefault());   // keep the selection (and the pick) through the tap
    ui.pill.addEventListener('click', () => {
      const now = readSelection() || picked;
      if (now) chat = { ...now, messages: [] };
      if (chat) open();
    });
    ui.sheet.querySelector('#askBack').addEventListener('click', close);
    ui.sheet.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });

    async function ask(q) {
      q = q.trim(); if (!q || busy) return;
      chat.error = null; chat.messages.push({ role: 'user', text: q }); busy = true; render();
      const mine = chat;
      try {
        const r = await fetch('/api/ask', { method: 'POST', headers: { 'content-type': 'application/json', 'x-math-mode': '1' },
          body: JSON.stringify({ title: mine.title, context: mine.context, selection: mine.selection, messages: mine.messages }) });
        const out = await r.json().catch(() => ({}));
        if (!r.ok || !out.text) throw new Error(out.error || 'No answer this time. Try again.');
        mine.messages.push({ role: 'assistant', text: out.text });
      } catch (err) {
        mine.messages.pop(); mine.error = err.message || 'No answer this time. Try again.';
        if (mine === chat && !ui.text.value) { ui.text.value = q; grow(); }
      } finally { busy = false; if (mine === chat) render(); }
    }
    ui.sheet.querySelector('#askForm').addEventListener('submit', e => { e.preventDefault(); const q = ui.text.value; ui.text.value = ''; grow(); ask(q); });
    ui.text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ui.sheet.querySelector('#askForm').requestSubmit(); } });
    ui.text.addEventListener('input', grow);
    ui.log.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) ask(b.dataset.q); });

    // The on-screen keyboard: keep the box above it (iPhone shrinks the visual viewport, not the fixed sheet).
    const vv = window.visualViewport;
    function fit() { if (vv && !ui.sheet.hidden) { ui.sheet.style.height = vv.height + 'px'; ui.sheet.style.top = vv.offsetTop + 'px'; } }
    vv?.addEventListener('resize', fit); vv?.addEventListener('scroll', fit);

    // Dictation where the browser has it (Chrome, Safari); the phone keyboard's own mic works everywhere.
    const Speech = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Speech) {
      ui.mic.hidden = false; let rec = null;
      ui.mic.addEventListener('click', () => {
        if (rec) return rec.stop();
        rec = new Speech(); rec.interimResults = false; const before = ui.text.value;
        rec.onresult = e => { ui.text.value = (before ? before + ' ' : '') + [...e.results].map(r => r[0].transcript).join(' '); grow(); };
        rec.onend = rec.onerror = () => { rec = null; ui.mic.classList.remove('live'); };
        try { rec.start(); ui.mic.classList.add('live'); } catch { rec = null; }
      });
    }
  }

  async function start() {
    try {
      await window.mathModeSession;
      const status = await (await fetch('/api/status', { signal: AbortSignal.timeout?.(8000) })).json();
      if (!status.authorized) return;
    } catch { return; }
    init();
  }
  document.body ? start() : addEventListener('DOMContentLoaded', start);
})();
