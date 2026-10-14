// Site-wide tab bar for the course pages: Course · Unit 1 · Map · Facts · Workspace.
// Self-contained (own styles) so any page can load it with one <script defer>.
(() => {
  const TABS = [
    ['Course', '/trig/', p => p === '/trig/' || p === '/trig/index.html'],
    ['Unit 1', '/trig/unit1.html'],
    ['Map', '/trig/map.html'],
    ['Facts', '/trig/facts.html'],
    ['Workspace', '/', p => p === '/' || p === '/index.html'],
  ];
  const here = location.pathname;
  const css = document.createElement('style');
  css.textContent = `#siteNav{position:sticky;top:0;z-index:40;display:flex;background:#0d1017f2;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);
    border-bottom:1px solid #232a3a;padding-top:env(safe-area-inset-top);font:600 13px/1 -apple-system,system-ui,sans-serif}
  #siteNav a{flex:1;text-align:center;padding:12px 2px 10px;color:#9aa4b8;text-decoration:none;border-bottom:2px solid transparent;white-space:nowrap}
  #siteNav a.on{color:#e8eaf0;border-bottom-color:#f783ac}
  #siteNav a .pi{font-size:15px;margin-right:2px}`;
  const nav = document.createElement('nav'); nav.id = 'siteNav'; nav.setAttribute('aria-label', 'Sections');
  nav.innerHTML = TABS.map(([label, href, is]) => {
    const on = is ? is(here) : here === href;
    return `<a href="${href}"${on ? ' class="on" aria-current="page"' : ''}>${label === 'Course' ? '<span class="pi">π</span>' : ''}${label}</a>`;
  }).join('');
  const mount = () => {
    // Stretch across the page: cancel the body's side padding.
    const st = getComputedStyle(document.body);
    nav.style.margin = `0 -${st.paddingRight} 0 -${st.paddingLeft}`;
    document.head.append(css); document.body.prepend(nav);
  };
  document.body ? mount() : addEventListener('DOMContentLoaded', mount);
})();
