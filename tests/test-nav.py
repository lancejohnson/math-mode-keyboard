"""Navigation: / is a home page linking to every section; every page but the workspace has the tab bar (current tab marked); the workspace links home."""
import subprocess, sys, time, socket, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 375, 'height': 812}, device_scale_factor=2)
        tabs = {'Home': '/', 'Trig': '/trig/', 'Unit 1': '/trig/unit1.html', 'Facts': '/trig/facts.html'}
        for name, path in tabs.items():
            page.goto(base + path); page.wait_for_selector('#siteNav')
            assert page.inner_text('#siteNav a.on').strip().endswith(name), (path, page.inner_text('#siteNav a.on'))
            box = page.locator('#siteNav').bounding_box(); assert box['x'] <= 0.5 and box['width'] >= 374, box
            assert page.evaluate('document.documentElement.scrollWidth') <= 375, 'nav must not widen the page'
            if name == 'Home': page.screenshot(path=str(OUT / 'home.png'), full_page=True)
            if name == 'Unit 1': page.screenshot(path=str(OUT / 'nav-unit1.png'))
        for path in ('/lesson/', '/model/', '/trig/map.html'):
            page.goto(base + path); page.wait_for_selector('#siteNav')
        # Home page: every section is one tap away and lands on the right page.
        for text, url in [('Unit 1: Angles and radians', '/trig/unit1.html'), ('Knowledge map', '/trig/map.html'), ('All 12 units', '/trig/'),
                          ('Math workspace', '/workspace/'), ('Graphing parabolas', '/lesson/'), ('How reviews read the clock', '/model/')]:
            page.goto(base + '/'); page.click(f'.home a.card:has-text("{text}")'); page.wait_for_url(base + url)
        page.goto(base + '/'); page.click('.home a.card:has-text("Facts")'); page.wait_for_url(base + '/trig/facts.html')
        # Progress shows on the Unit 1 card.
        page.evaluate("localStorage.setItem('trig-unit1-v2', JSON.stringify({done:['turns','thirty','negative'],pred:{}}))"); page.goto(base + '/')
        assert '3 of 11' in page.inner_text('#u1progress') and 'Continue' in page.inner_text('#continue .go')
        page.click('#siteNav >> text=Workspace'); page.wait_for_url(base + '/workspace/'); assert page.locator('#siteNav').count() == 0
        page.wait_for_selector('#toHome'); page.click('#toHome'); page.wait_for_url(base + '/')
        # The old private handwriting link (/#recognition=…) forwards to the workspace.
        page.goto('about:blank'); page.goto(base + '/#recognition=' + 'a' * 48, wait_until='commit'); page.wait_for_function("location.pathname === '/workspace/'")
        page.goto(base + '/trig/'); page.mouse.wheel(0, 2000); time.sleep(.3); assert page.locator('#siteNav').bounding_box()['y'] <= 1
        b.close()
    print('PASS: navigation — home page links to every section (Unit 1 progress shown), tab bar on every page but the workspace (current tab marked, full width, sticky), workspace links home, old handwriting link forwards; 375 px Chromium, not iOS.')
finally:
    srv.terminate()
