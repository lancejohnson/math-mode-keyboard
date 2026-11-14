"""Navigation: floating tab pill (Today · Courses · Facts · Workspace) on every page incl. the workspace, current tab
filled, 16 px in from each side, near the bottom; it hides while the math keyboard is up. Today links every section."""
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
        tabs = {'/': 'Today', '/courses/': 'Courses', '/trig/': 'Courses', '/trig/unit1.html': 'Courses', '/trig/map.html': 'Courses', '/kelly/': 'Courses',
                '/trig/facts.html': 'Facts', '/workspace/': 'Workspace'}
        for path, name in tabs.items():
            page.goto(base + path); page.wait_for_selector('#siteNav')
            assert page.inner_text('#siteNav a.on').strip() == name, (path, page.inner_text('#siteNav a.on'))
            assert [t.strip() for t in page.locator('#siteNav a').all_inner_texts()] == ['Today', 'Courses', 'Facts', 'Workspace']
            # The workspace opens its keyboard just after load (tabs hide behind it): close it before measuring, or this races it.
            if path == '/workspace/': page.wait_for_selector('#kb:not([hidden])'); page.click('#kb button[title="Hide keyboard"]'); page.wait_for_selector('#siteNav', state='visible')
            box = page.locator('#siteNav').bounding_box(); assert abs(box['x'] - 16) <= 1 and abs(box['width'] - 343) <= 1, (path, box)
            assert 799 <= box['y'] + box['height'] <= 805, (path, 'pill floats just above the bottom', box)
            assert page.locator('#siteNav a svg').count() == 4, 'every tab has an icon'
            assert page.evaluate('document.documentElement.scrollWidth') <= 375, 'nav must not widen the page'
            if path == '/': page.screenshot(path=str(OUT / 'home.png'), full_page=True)
        for path in ('/lesson/', '/model/'):
            page.goto(base + path); page.wait_for_selector('#siteNav')
        # Today: every section is one tap away and lands on the right page.
        for text, url in [('Trigonometry', '/trig/'), ('The Kelly criterion', '/kelly/'), ('Knowledge map', '/trig/map.html'),
                          ('Graphing parabolas', '/lesson/'), ('How reviews read the clock', '/model/')]:
            page.goto(base + '/'); page.click(f'.list a:has-text("{text}")'); page.wait_for_url(base + url)
        page.goto(base + '/'); page.click('#factsCard'); page.wait_for_url(base + '/trig/facts.html')
        # Courses tab: a chooser with each course's progress; a card opens that course. Trig page is Trig only.
        page.evaluate("localStorage.setItem('kelly-v1', JSON.stringify({done:['intuition'],reached:{}}))")
        page.click('#siteNav >> text=Courses'); page.wait_for_url(base + '/courses/')
        assert page.locator('.course').count() == 2 and 'Not started' in page.inner_text('#c-trig')
        assert '1 of 4 parts' in page.inner_text('#c-kelly') and '25%' in page.inner_text('#c-kelly .ring')
        page.click('#c-kelly'); page.wait_for_url(base + '/kelly/#derive')
        page.goto(base + '/courses/'); page.click('#c-trig'); page.wait_for_url(base + '/trig/')
        assert page.locator('#kellyParts').count() == 0 and 'Kelly' not in page.inner_text('body')
        page.click('.crumb a'); page.wait_for_url(base + '/courses/')
        # Progress shows on Today and Continue goes to the next topic.
        page.goto(base + '/'); page.evaluate("localStorage.setItem('trig-unit1-v2', JSON.stringify({done:['turns','thirty','negative'],pred:{}}))"); page.reload()
        assert '3 of 11' in page.inner_text('#u1progress') and 'Continue' in page.inner_text('#continue')
        page.goto(base + '/courses/'); assert 'Unit 1 · 3 of 11 topics' in page.inner_text('#c-trig') and '27%' in page.inner_text('#c-trig .ring') and 'Unit 1' in page.inner_text('#c-trig .ring')
        page.screenshot(path=str(OUT / 'courses.png'))
        for name, path in [('today', '/'), ('trig', '/trig/'), ('unit1', '/trig/unit1.html'), ('facts', '/trig/facts.html'), ('kelly', '/kelly/')]:
            page.goto(base + path); time.sleep(.4); page.screenshot(path=str(OUT / f'style-{name}.png'))
        page.goto(base + '/trig/'); assert '3 of 11 topics' in page.inner_text('#u1sub')
        page.goto(base + '/')
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
        page.goto(base + '/trig/'); page.mouse.wheel(0, 2000); time.sleep(.3); bx = page.locator('#siteNav').bounding_box(); assert abs(bx['y'] + bx['height'] - 800) <= 1
        assert not errs, errs
        b.close()
    print('PASS: navigation — floating tab pill with icons, Today/Courses/Facts/Workspace on every page incl. workspace (current tab filled, inset, fixed), hide behind the keyboard, Today links every section + Continue, Courses tab is a chooser with progress (Trig, Kelly), private link taken on any page; 375 px Chromium, not iOS.')
finally:
    srv.terminate()
