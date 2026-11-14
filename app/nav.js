// Site-wide tab bar: a floating pill at the bottom with Today · Courses · Facts · Workspace (style A, 2026-11).
// Each tab is an icon over its name; the current tab is filled blue.
// It hides while the math keyboard is up and during a fact sitting ([data-hide-tabs]). It stays in the Ink view, so you can leave it.
// Self-contained (own styles, colours from /tokens.css) so any page can load it with one <script defer>.
(() => {
  // The private link (#recognition=<invite>) works on any page: it sets the owner cookie that turns on handwriting
  // conversion and the bug button. The iPhone app opens with it every launch (its cookie jar is not Safari's).
  const invite = location.hash.match(/^#recognition=([a-f0-9]{48})$/);
  if (invite) {
    history.replaceState(null, '', location.pathname + location.search);
    window.mathModeSession = fetch('/api/session', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ invite: invite[1] }), signal: AbortSignal.timeout?.(8000) })
      .then(r => r.ok, () => false);
  }
  const ICON = {
    home: '<path d="M4 11l8-7 8 7v9h-5v-6h-6v6H4z"/>',
    course: '<path d="M4 5h6a2 2 0 0 1 2 2v13a2 2 0 0 0-2-2H4zM20 5h-6a2 2 0 0 0-2 2v13a2 2 0 0 1 2-2h6z"/>',
    facts: '<rect x="3" y="6" width="14" height="14" rx="2"/><path d="M7 3h12a2 2 0 0 1 2 2v12"/>',
    work: '<path d="M4 20l4-1 11-11-3-3L5 16zM14 7l3 3"/>',
  };
  const TABS = [
    ['Today', '/', 'home', p => p === '/' || p === '/index.html'],
    ['Courses', '/courses/', 'course', p => /^\/(courses\/(index\.html)?|trig\/(index\.html|unit1\.html|map\.html)?|kelly\/.*)$/.test(p)],
    ['Facts', '/trig/facts.html', 'facts', p => p === '/trig/facts.html'],
    ['Workspace', '/workspace/', 'work', p => p.startsWith('/workspace')],
  ];
  const here = location.pathname, inApp = here.startsWith('/workspace');
  if (!document.querySelector('link[href^="/tokens.css"]')) document.head.insertAdjacentHTML('afterbegin', '<link rel="stylesheet" href="/tokens.css?v=2">');
  const css = document.createElement('style');
  css.textContent = `#siteNav{${inApp ? 'flex:none;position:relative;margin:6px 16px calc(8px + env(safe-area-inset-bottom))' : 'position:fixed;left:16px;right:16px;bottom:calc(12px + env(safe-area-inset-bottom))'};z-index:40;
    display:grid;grid-template-columns:repeat(4,minmax(0,1fr));height:var(--tabs-h);padding:6px;border-radius:calc(var(--tabs-h) / 2);
    background:var(--color-paper-3);box-shadow:0 8px 24px #000a;font:600 11px/1 var(--font-body)}
  #siteNav a{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:calc(var(--tabs-h) / 2 - 6px);color:var(--color-muted);text-decoration:none;white-space:nowrap;overflow:hidden}
  #siteNav a.on{color:var(--color-accent-ink);background:var(--color-accent)}
  #siteNav svg{width:24px;height:24px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linejoin:round;stroke-linecap:round}
  body:has(#kb:not([hidden])) #siteNav,body:has([data-hide-tabs]:not([hidden])) #siteNav{display:none}
  ${inApp ? '' : 'body{padding-bottom:calc(var(--tabs-h) + 36px + env(safe-area-inset-bottom))}'}`;
  const nav = document.createElement('nav'); nav.id = 'siteNav'; nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = TABS.map(([label, href, c, is]) => `<a href="${href}"${is(here) ? ' class="on" aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[c]}</svg>${label}</a>`).join('');
  const mount = () => { document.head.append(css); document.body.append(nav); };
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);
  // The bug button and rolling recording (owner only; bug.js checks).
  const bug = document.createElement('script'); bug.src = '/bug.js?v=3'; bug.defer = true; document.head.append(bug);
  // Lesson chat: highlight, Ask about this, Back to lesson (owner only; ask.js checks). Not in the workspace.
  if (!inApp) { const ask = document.createElement('script'); ask.src = '/ask.js?v=1'; ask.defer = true; document.head.append(ask); }

  // The iPhone app keeps one page alive for days and has no pull-to-refresh. When you come back to it after
  // 30 s or more, fetch this page's HTML again; if it changed (a release bumps the ?v= of the scripts), reload.
  // Progress lives in localStorage, so a reload loses nothing. Never while the keyboard is up or mid-sitting.
  const html = () => fetch(location.pathname, { cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null);
  let first = html(), hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Date.now() - hiddenAt < 30000) return;
    const [a, b] = await Promise.all([first, html()]);
    const busy = document.querySelector('#kb:not([hidden]), [data-hide-tabs]:not([hidden]), #askSheet:not([hidden])');
    if (a && b && a !== b && !busy) location.reload(); else if (!a && b) first = Promise.resolve(b);
  });
})();
