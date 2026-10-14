"""Navigation: every course page has the tab bar (current tab marked) and each tab goes where it says; the workspace links to the course."""
import subprocess, sys, time, socket, pathlib
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parents[1]; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        b = p.chromium.launch(); page = b.new_page(viewport={'width': 375, 'height': 812}, device_scale_factor=2)
        tabs = {'Course': '/trig/', 'Unit 1': '/trig/unit1.html', 'Map': '/trig/map.html', 'Facts': '/trig/facts.html'}
        for name, path in tabs.items():
            page.goto(base + path); page.wait_for_selector('#siteNav')
            assert page.inner_text('#siteNav a.on').strip().endswith(name), (path, page.inner_text('#siteNav a.on'))
            box = page.locator('#siteNav').bounding_box(); assert box['x'] <= 0.5 and box['width'] >= 374, box
            assert page.evaluate('document.documentElement.scrollWidth') <= 375, 'nav must not widen the page'
            if name == 'Unit 1': page.screenshot(path=str(OUT / 'nav-unit1.png'))
        for path in ('/lesson/', '/model/'):
            page.goto(base + path); page.wait_for_selector('#siteNav')
        page.goto(base + '/trig/map.html'); page.click('#siteNav >> text=Facts'); page.wait_for_url('**/trig/facts.html')
        page.click('#siteNav >> text=Workspace'); page.wait_for_url(base + '/'); assert page.locator('#siteNav').count() == 0
        page.click('#toCourse'); page.wait_for_url('**/trig/'); assert page.locator('#siteNav a.on').inner_text().endswith('Course')
        # The tab bar stays on screen while scrolling.
        page.goto(base + '/trig/'); page.mouse.wheel(0, 2000); time.sleep(.3); assert page.locator('#siteNav').bounding_box()['y'] <= 1
        b.close()
    print('PASS: navigation — tab bar on every course page (current tab marked, full width, sticky), tabs go to the right pages, workspace links to the course; 375 px Chromium, not iOS.')
finally:
    srv.terminate()
