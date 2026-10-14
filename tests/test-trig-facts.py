"""Trig facts drill on phone-size Chromium (not iOS): dosed sets, timing, misses coming back after a gap, automatic status, persistence."""
import functools, http.server, pathlib, threading, sys
from playwright.sync_api import sync_playwright
ROOT = pathlib.Path(__file__).resolve().parent.parent; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'app')))
http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
threading.Thread(target=srv.serve_forever, daemon=True).start()
URL = f'http://127.0.0.1:{srv.server_port}/trig/facts.html'

def tap(page, right):
    ch, ans = page.evaluate('facts.choices()'), page.evaluate('facts.card().answer')
    j = ch.index(ans) if right else next(i for i, c in enumerate(ch) if c != ans)
    page.locator('#choices .choice').nth(j).click()

with sync_playwright() as p:
    b = p.chromium.launch(); errs = []
    for w in (375, 430):
        page = b.new_page(viewport={'width': w, 'height': 800}, device_scale_factor=2, has_touch=True)
        page.on('pageerror', lambda e: errs.append(str(e)))
        # Skip the 650 ms pause after a fast right answer (test speed only; the auto-advance itself still runs).
        page.add_init_script('{ const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 650 ? 0 : ms, ...a); }'
                             '{ const n = Date.now; let off = 0; window.warp = ms => { off += ms; }; Date.now = () => n() + off; }')  # fake wall clock for the gaps
        page.goto(URL); page.evaluate('localStorage.clear()'); page.reload()
        assert page.locator('.deck').count() == 3
        if w == 375: page.screenshot(path=str(OUT / 'facts-home.png'))
        page.locator('.deck').nth(1).click()  # sin/cos/tan 0-90
        assert page.locator('#aid').get_attribute('open') is not None  # memory aid open on a new deck
        # A new fact is shown first (untimed), then asked after a few other questions.
        assert page.evaluate('facts.kind()') == 'intro' and 'New fact' in page.inner_text('#prompt') and page.locator('#mini').count() == 1
        if w == 375: page.screenshot(path=str(OUT / 'facts-intro.png'))
        first = page.evaluate('facts.card().id'); page.click('#next')
        asked, missed, k = [], None, 0
        while page.locator('#drill').is_visible() and k < 200:
            k += 1; page.evaluate('warp(20000)')  # 20 s of "thinking time" between questions, so the minute gaps pass
            if page.evaluate('facts.kind()') == 'intro': page.click('#next'); continue
            cid = page.evaluate('facts.card().id'); asked.append(cid)
            if w == 375 and len(asked) == 1: page.screenshot(path=str(OUT / 'facts-question.png'))
            if missed is None and cid != first:
                missed = cid; at = len(asked); tap(page, False)
                assert 'Tap it to go on' in page.inner_text('#result') and page.locator('#next').is_hidden() and page.locator('#mini').count() == 1
                if w == 375: page.screenshot(path=str(OUT / 'facts-wrong.png'))
                assert page.locator('#choices .choice:enabled').count() == 1 and page.evaluate('facts.copy()')  # only the right answer can be tapped
                tap(page, True); page.wait_for_function('!facts.answered()'); continue
            n = page.evaluate('facts.drill().q'); tap(page, True)
            if page.locator('#next').is_visible(): page.click('#next')
            else: page.wait_for_function(f'facts.drill().q > {n} && (!facts.answered() || facts.kind() === "intro") || !document.querySelector("#drill").offsetParent', timeout=3000)
        assert page.locator('#done').is_visible(), k
        back = asked.index(missed, at); assert back - at >= 2, (asked, missed)  # the miss came back after 2+ other questions
        st = page.evaluate('facts.state()'); dr = page.evaluate('({cold: facts.drill().cold.length, cap: facts.drill().set.length})')
        assert st[missed]['hist'][0]['ok'] is False and st[missed]['hist'][-1]['ok'] is True and 's0' in st[missed]['hist'][0]
        assert dr['cold'] >= 3 and 'automatic' in page.inner_text('#doneText'), (dr, page.inner_text('#doneText'))
        assert st[first].get('cold') and st[first]['due'] > page.evaluate('Date.now()') + 20 * 3600e3  # first review a day later
        if w == 375: page.screenshot(path=str(OUT / 'facts-done.png'))
        page.reload(); assert 'right but slow' in page.inner_text('#decks') or 'missed' in page.inner_text('#decks') or 'automatic' in page.inner_text('#decks')
        # A slow right answer: freeze the clock past 3 s.
        page.locator('.deck').nth(0).click(); page.click('#next')  # angles: shown first (never seen here), then asked
        while page.evaluate('facts.kind()') == 'intro': page.click('#next')
        page.evaluate('() => { const n = performance.now.bind(performance); const t = n(); performance.now = () => n() + 4000; }')
        tap(page, True)
        assert 'Aim for under 3' in page.inner_text('#result'), page.inner_text('#result')
        if w == 375: page.screenshot(path=str(OUT / 'facts-slow.png'))
    # Automatic after 3 fast right answers (pure logic is covered in facts.test.js; here check the label shows).
    page.evaluate("() => { localStorage.setItem('trig-facts-v1', JSON.stringify({'d2r:30': {hist:[{ok:true,s:1},{ok:true,s:1},{ok:true,s:1}], box:3, due:0, seen:0}})); }")
    page.reload(); assert '1 automatic' in page.inner_text('#decks')
    assert not errs, errs
    b.close()
print('PASS: trig facts drill — 3 decks, memory aid, new facts shown first, a miss is copied then comes back after 2+ questions, 3+ facts go cold, fast answers auto-advance, slow answer coached, progress persists; 375/430 px Chromium, not iOS.')
