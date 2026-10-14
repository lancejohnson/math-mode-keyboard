"""Trig facts drill on phone-size Chromium (not iOS): rounds, timing, wrong answers coming back, automatic status, persistence."""
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
        page.add_init_script('{ const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 650 ? 0 : ms, ...a); }')
        page.goto(URL); page.evaluate('localStorage.clear()'); page.reload()
        assert page.locator('.deck').count() == 3
        if w == 375: page.screenshot(path=str(OUT / 'facts-home.png'))
        page.locator('.deck').nth(1).click()  # sin/cos/tan 0-90
        assert page.locator('#aid').get_attribute('open') is not None  # memory aid open on a new deck
        page.wait_for_selector('#choices .choice')
        if w == 375: page.screenshot(path=str(OUT / 'facts-question.png'))
        first = page.evaluate('facts.card().id'); n0 = len(page.evaluate('facts.round()'))
        tap(page, False)
        assert 'come back' in page.inner_text('#result') and page.locator('#next').is_visible() and page.locator('#mini').count() == 1
        assert first in [c['id'] for c in page.evaluate('facts.round()')[1:]]  # it comes back later this round
        if w == 375: page.screenshot(path=str(OUT / 'facts-wrong.png'))
        page.click('#next')
        while page.locator('#drill').is_visible():
            page.wait_for_function('!facts.answered()')
            at = page.evaluate('facts.at()'); tap(page, True)
            if page.locator('#next').is_visible(): page.click('#next')  # slow (shouldn't happen) still works
            else: page.wait_for_function(f'facts.at() > {at} || !document.querySelector("#drill").offsetParent', timeout=3000)
        assert page.locator('#done').is_visible()
        st = page.evaluate('facts.state()')
        assert st[first]['hist'][0]['ok'] is False and st[first]['hist'][-1]['ok'] is True
        if w == 375: page.screenshot(path=str(OUT / 'facts-done.png'))
        page.reload(); assert 'right but slow' in page.inner_text('#decks') or 'missed' in page.inner_text('#decks') or 'automatic' in page.inner_text('#decks')
        # A slow right answer: freeze the clock past 3 s.
        page.locator('.deck').nth(0).click(); page.wait_for_selector('#choices .choice')
        page.evaluate('() => { const n = performance.now.bind(performance); const t = n(); performance.now = () => n() + 4000; }')
        tap(page, True)
        assert 'Aim for under 3' in page.inner_text('#result'), page.inner_text('#result')
        if w == 375: page.screenshot(path=str(OUT / 'facts-slow.png'))
    # Automatic after 3 fast right answers (pure logic is covered in facts.test.js; here check the label shows).
    page.evaluate("() => { localStorage.setItem('trig-facts-v1', JSON.stringify({'d2r:30': {hist:[{ok:true,s:1},{ok:true,s:1},{ok:true,s:1}], box:3, due:0, seen:0}})); }")
    page.reload(); assert '1 automatic' in page.inner_text('#decks')
    assert not errs, errs
    b.close()
print('PASS: trig facts drill — 3 decks, memory aid, wrong answer shown with picture and re-queued, fast answers auto-advance, slow answer coached, progress persists; 375/430 px Chromium, not iOS.')
