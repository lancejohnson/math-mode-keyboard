// Site-wide tab bar at the bottom: Today · Course · Facts · Workspace (v4 design).
// Each tab has its own colour line: Today ink, Course blue, Facts pink, Workspace light blue.
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
  const TABS = [
    ['Today', '/', 'home', p => p === '/' || p === '/index.html'],
    ['Course', '/trig/', 'course', p => /^\/(trig\/(index\.html|unit1\.html|map\.html)?|kelly\/.*)$/.test(p) && !p.endsWith('facts.html')],
    ['Facts', '/trig/facts.html', 'facts', p => p === '/trig/facts.html'],
    ['Workspace', '/workspace/', 'work', p => p.startsWith('/workspace')],
  ];
  const here = location.pathname, inApp = here.startsWith('/workspace');
  if (!document.querySelector('link[href^="/tokens.css"]')) document.head.insertAdjacentHTML('afterbegin', '<link rel="stylesheet" href="/tokens.css?v=1">');
  const css = document.createElement('style');
  css.textContent = `#siteNav{${inApp ? 'flex:none;position:relative' : 'position:fixed;left:0;right:0;bottom:0'};z-index:40;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
    background:var(--color-paper-2);border-top:1px solid var(--color-rule);padding-bottom:env(safe-area-inset-bottom);font:600 13px/1 var(--font-body)}
  #siteNav a{display:flex;flex-direction:column;gap:10px;height:var(--tabs-h);padding:0 0 0 12px;color:var(--color-muted);text-decoration:none;white-space:nowrap;overflow:hidden}
  #siteNav a+a{border-left:1px solid var(--color-rule)}
  #siteNav a i{display:block;height:4px;margin-left:-12px}
  #siteNav a.on{color:var(--color-ink);background:var(--color-paper-3)}
  #siteNav .c-home{background:var(--color-ink)}#siteNav .c-course{background:var(--color-accent)}#siteNav .c-facts{background:var(--color-accent-2)}#siteNav .c-work{background:var(--color-accent-hi)}
  body:has(#kb:not([hidden])) #siteNav,body:has([data-hide-tabs]:not([hidden])) #siteNav{display:none}
  ${inApp ? '' : 'body{padding-bottom:calc(var(--tabs-h) + 24px + env(safe-area-inset-bottom))}'}`;
  const nav = document.createElement('nav'); nav.id = 'siteNav'; nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = TABS.map(([label, href, c, is]) => `<a href="${href}"${is(here) ? ' class="on" aria-current="page"' : ''}><i class="c-${c}"></i>${label}</a>`).join('');
  const mount = () => { document.head.append(css); document.body.append(nav); };
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);
  // The bug button and rolling recording (owner only; bug.js checks).
  const bug = document.createElement('script'); bug.src = '/bug.js?v=3'; bug.defer = true; document.head.append(bug);

  // The iPhone app keeps one page alive for days and has no pull-to-refresh. When you come back to it after
  // 30 s or more, fetch this page's HTML again; if it changed (a release bumps the ?v= of the scripts), reload.
  // Progress lives in localStorage, so a reload loses nothing. Never while the keyboard is up or mid-sitting.
  const html = () => fetch(location.pathname, { cache: 'no-store' }).then(r => r.ok ? r.text() : null).catch(() => null);
  let first = html(), hiddenAt = 0;
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    if (Date.now() - hiddenAt < 30000) return;
    const [a, b] = await Promise.all([first, html()]);
    const busy = document.querySelector('#kb:not([hidden]), [data-hide-tabs]:not([hidden])');
    if (a && b && a !== b && !busy) location.reload(); else if (!a && b) first = Promise.resolve(b);
  });
})();
