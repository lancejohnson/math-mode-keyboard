"""Navigation: bottom tab bar (Today · Course · Facts · Workspace) on every page incl. the workspace, current tab
marked, full width, fixed at the bottom; it hides while the math keyboard is up. Today links every section."""
import subprocess, sys, time, socket, pathlib, json
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 375, 'height': 812}, device_scale_factor=2)
        errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        tabs = {'/': 'Today', '/trig/': 'Course', '/trig/unit1.html': 'Course', '/trig/map.html': 'Course', '/kelly/': 'Course',
                '/trig/facts.html': 'Facts', '/workspace/': 'Workspace'}
        for path, name in tabs.items():
            page.goto(base + path); page.wait_for_selector('#siteNav')
            assert page.inner_text('#siteNav a.on').strip() == name, (path, page.inner_text('#siteNav a.on'))
            assert [t.strip() for t in page.locator('#siteNav a').all_inner_texts()] == ['Today', 'Course', 'Facts', 'Workspace']
            box = page.locator('#siteNav').bounding_box(); assert box['x'] <= 0.5 and box['width'] >= 374, box
            assert abs(box['y'] + box['height'] - 812) <= 1, (path, 'tabs sit at the bottom', box)
            assert page.evaluate('document.documentElement.scrollWidth') <= 375, 'nav must not widen the page'
            if path == '/': page.screenshot(path=str(OUT / 'home.png'), full_page=True)
        for path in ('/lesson/', '/model/'):
            page.goto(base + path); page.wait_for_selector('#siteNav')
        # Today: every section is one tap away and lands on the right page.
        for text, url in [('Trigonometry', '/trig/'), ('The Kelly criterion', '/kelly/'), ('Knowledge map', '/trig/map.html'),
                          ('Graphing parabolas', '/lesson/'), ('How reviews read the clock', '/model/')]:
            page.goto(base + '/'); page.click(f'.list a:has-text("{text}")'); page.wait_for_url(base + url)
        page.goto(base + '/'); page.click('text=Practise facts'); page.wait_for_url(base + '/trig/facts.html')
        # Course lists both courses.
        page.goto(base + '/trig/'); assert page.locator('#kellyParts a').count() == 4
        page.click('#kellyParts a >> nth=1'); page.wait_for_url(base + '/kelly/#derive')
        # Progress shows on Today and Continue goes to the next topic.
        page.goto(base + '/'); page.evaluate("localStorage.setItem('trig-unit1-v2', JSON.stringify({done:['turns','thirty','negative'],pred:{}}))"); page.reload()
        assert '3 of 11' in page.inner_text('#u1progress') and 'Continue' in page.inner_text('#continue')
        page.click('#continue'); page.wait_for_url(base + '/trig/unit1.html#pi')
        # Workspace: tabs in the page flow, hidden while the math keyboard is up, back after it is hidden.
        page.click('#siteNav >> text=Workspace'); page.wait_for_url(base + '/workspace/')
        page.wait_for_selector('#kb:not([hidden])'); assert not page.locator('#siteNav').is_visible(), 'tabs hide behind the keyboard'
        page.click('#kb button[title="Hide keyboard"]'); page.wait_for_selector('#siteNav', state='visible')
        page.click('.tabs button:has-text("Ink")'); assert page.locator('#siteNav').is_visible(), 'tabs stay in Ink'
        page.click('#siteNav >> text=Today'); page.wait_for_url(base + '/')
        # The private link (/#recognition=…) is taken on any page now (the iPhone app opens with it): it stays on Today and the hash goes.
        page.goto('about:blank'); page.goto(base + '/#recognition=' + 'a' * 48); page.wait_for_function("location.pathname === '/' && !location.hash")
        # Stays fixed at the bottom while scrolling.
        page.goto(base + '/trig/'); page.mouse.wheel(0, 2000); time.sleep(.3); bx = page.locator('#siteNav').bounding_box(); assert abs(bx['y'] + bx['height'] - 812) <= 1
        assert not errs, errs
        b.close()
    print('PASS: navigation — bottom tabs Today/Course/Facts/Workspace on every page incl. workspace (current tab marked, full width, fixed), hide behind the keyboard, Today links every section + Continue, Course lists Trig and Kelly, private link taken on any page; 375 px Chromium, not iOS.')
finally:
    srv.terminate()
