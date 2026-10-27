"""Bug button + rolling recording (app/bug.js): owner-only, chunks reach Relay, a report starts a session."""
import json, subprocess, sys, time, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
proc = subprocess.Popen(['node', str(ROOT / 'tests/bug-server.mjs')], stdout=subprocess.PIPE, text=True)
try:
    _, app_port, relay_port = proc.stdout.readline().split()
    base, captured = f'http://127.0.0.1:{app_port}', lambda: json.load(urllib.request.urlopen(f'http://127.0.0.1:{relay_port}/captured'))
    def wait_for(pred, what, timeout=8):
        end = time.time() + timeout
        while time.time() < end:
            c = captured()
            if pred(c): return c
            time.sleep(0.2)
        c = captured(); sys.exit(f"FAIL: {what}: sessions={len(c['sessions'])} chunks={[(r['query']['seq'], len(r['events']), [e['data'].get('tag') for e in r['events'] if e['type'] == 5]) for r in c['recordings']]}")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        # A stranger: no button, nothing recorded, and the endpoints refuse.
        guest = browser.new_context(viewport={'width': 390, 'height': 844})
        page = guest.new_page(); page.goto(base + '/trig/facts.html'); page.wait_for_timeout(800)
        assert page.locator('#bugBtn').count() == 0, 'guest sees the bug button'
        assert guest.request.post(base + '/api/recording?client=x', data='[]', headers={'content-type': 'application/json'}).status == 403
        assert guest.request.post(base + '/api/bug', data={'text': 'x'}).status == 403
        guest.close()

        owner = browser.new_context(viewport={'width': 390, 'height': 844})
        assert owner.request.post(base + '/api/session', data={'invite': 'a' * 48}).ok
        page = owner.new_page(); errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.goto(base + '/trig/facts.html')
        page.get_by_role('button', name='Report a bug').wait_for()
        page.wait_for_function('!!window.mathModeMarkBug')
        page.get_by_role('button', name='Report a bug').click()
        page.get_by_label('What went wrong').fill('The keypad froze after 7')
        page.get_by_role('button', name='Send').click()
        page.get_by_role('status').filter(has_text='Sent').wait_for()
        assert page.locator('#bugSheet').is_hidden()
        c = wait_for(lambda c: c['sessions'] and any(e.get('data', {}).get('tag') == 'mark' for r in c['recordings'] for e in r['events']), 'mark chunk + session')
        s = c['sessions'][0]
        rec = c['recordings'][0]['query']
        assert rec['full'] == '1' and rec['kind'] == 'web' and rec['client'].startswith('mm-'), rec
        mark = next(e['data']['payload'] for r in c['recordings'] for e in r['events'] if e.get('data', {}).get('tag') == 'mark')
        assert s['cwd'] == '/Users/work/Projects/math-mode-keyboard' and s['project'] == 'Bugs' and s['title'].startswith('Math Mode bug: The keypad froze'), s
        for want in (f"--client {rec['client']} --at {mark['at']}", 'The keypad froze after 7', '/trig/facts.html', '390×844'):
            assert want in s['prompt'], (want, s['prompt'])
        assert set(c['auth']) == {'Bearer relay-test-token'}, c['auth']

        # Handwriting is on a canvas: it must be in the recording too.
        page.goto(base + '/workspace/'); page.wait_for_function('!!window.mathModeMarkBug')
        page.get_by_role('button', name='Ink', exact=True).click()
        box = page.locator('#inkScroll').bounding_box()
        page.mouse.move(box['x'] + 60, box['y'] + 80); page.mouse.down()
        for i in range(12): page.mouse.move(box['x'] + 60 + i * 10, box['y'] + 80 + (i % 3) * 8)
        page.mouse.up(); page.wait_for_timeout(1500)
        page.evaluate("window.mathModeMarkBug('ink')")
        wait_for(lambda c: any(e.get('type') == 3 and e['data'].get('source') == 9 for r in c['recordings'] for e in r['events']), 'canvas frames in the recording')
        assert not errors, errors

        # The iPhone app has its own cookie jar: it opens /#recognition=<invite> and must get the button without the workspace.
        phone = browser.new_context(viewport={'width': 390, 'height': 844})
        page = phone.new_page(); page.goto(base + '/#recognition=' + 'a' * 48)
        page.get_by_role('button', name='Report a bug').wait_for()
        assert '#recognition=' not in page.url, page.url
        page.goto(base + '/trig/'); page.get_by_role('button', name='Report a bug').wait_for()   # the cookie stays
        phone.close()
        browser.close()
    print('PASS test-bug')
finally:
    proc.terminate()
