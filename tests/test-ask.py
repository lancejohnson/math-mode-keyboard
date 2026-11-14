"""Lesson chat (app/ask.js): highlight lesson text, Ask about this, talk, Back to lesson keeps the lesson's place,
Back to chat reopens the same talk. Owner only. Fake model behind server/server.mjs (tests/bug-server.mjs). Chromium, not iOS."""
import json, subprocess, sys, urllib.request
from pathlib import Path
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(Path(__file__).parent)); from pwfast import phone, fail_report

ROOT = Path(__file__).resolve().parent.parent
proc = subprocess.Popen(['node', str(ROOT / 'tests/bug-server.mjs')], stdout=subprocess.PIPE, text=True)
SELECT = """sel => { const el = document.querySelector(sel), r = document.createRange(); r.selectNodeContents(el);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r); }"""
try:
    _, app_port, relay_port = proc.stdout.readline().split()
    base = f'http://127.0.0.1:{app_port}'
    asks = lambda: json.load(urllib.request.urlopen(f'http://127.0.0.1:{relay_port}/captured'))['asks']
    with sync_playwright() as p:
        browser = p.chromium.launch()
        guest = browser.new_context(viewport={'width': 390, 'height': 844})
        page = guest.new_page(); page.goto(base + '/kelly/'); page.wait_for_timeout(600)
        assert page.locator('#askPill').count() == 0, 'guest gets the chat'
        assert guest.request.post(base + '/api/ask', data={'selection': 'x', 'messages': [{'role': 'user', 'text': 'q'}]}, headers={'x-math-mode': '1'}).status == 401
        guest.close()

        owner = browser.new_context(viewport={'width': 390, 'height': 844}, has_touch=True)
        assert owner.request.post(base + '/api/session', data={'invite': 'a' * 48}).ok
        assert owner.request.post(base + '/api/ask', data={'selection': 'x', 'messages': []}, headers={'x-math-mode': '1'}).status == 400
        page = owner.new_page(); page.set_default_timeout(3000); errs = []; page.on('pageerror', lambda e: errs.append(str(e)))
        try:
            page.goto(base + '/kelly/'); page.wait_for_selector('#askPill', state='attached')
            page.locator('#part p').first.wait_for()
            page.evaluate('scrollTo(0, 120)'); y0 = page.evaluate('scrollY')
            quote = page.locator('#part p').first.inner_text().strip()
            page.evaluate(SELECT, '#part p')
            page.get_by_role('button', name='Ask about this').click()
            page.get_by_role('dialog', name='Chat about the lesson').wait_for()
            assert page.locator('#askLog blockquote').inner_text().strip() == quote
            assert page.evaluate("document.elementFromPoint(20, innerHeight - 20).closest('#askSheet') !== null"), 'the chat covers the tabs'
            page.get_by_label('Your question').fill('Why does betting more hurt?')
            page.get_by_label('Your question').press('Enter')
            page.locator('#askLog .tutor', has_text='Answer 1').wait_for()
            assert page.locator('#askLog .tutor b').inner_text() == 'one'
            a = asks()[-1]
            assert a['selection'] == quote and a['messages'] == [{'role': 'user', 'text': 'Why does betting more hurt?'}], a
            assert quote in a['context'] and 'Kelly' in a['title'], a
            assert page.get_by_role('button', name='Another example').count() == 0, 'starters go once you ask'
            page.get_by_label('Your question').fill('And then?'); page.get_by_role('button', name='Send').click()
            page.locator('#askLog .tutor', has_text='Answer 3').wait_for()
            assert [m['role'] for m in asks()[-1]['messages']] == ['user', 'assistant', 'user']
            # A failed answer keeps the question in the box.
            page.get_by_label('Your question').fill('fail'); page.get_by_role('button', name='Send').click()
            page.locator('#askLog .err').wait_for(); assert page.get_by_label('Your question').input_value() == 'fail'
            page.get_by_label('Your question').fill('')

            page.get_by_role('button', name='‹ Back to lesson').click()
            page.locator('#askSheet').wait_for(state='hidden')
            assert page.evaluate('scrollY') == y0, 'the lesson keeps its place'
            page.get_by_role('button', name='Back to chat').click()
            assert page.locator('#askLog .tutor').count() == 2, 'same talk comes back'
            page.get_by_role('button', name='‹ Back to lesson').click(); page.locator('#askSheet').wait_for(state='hidden')

            # Trig lesson: a new highlight starts a new talk; starter buttons ask for you.
            page.goto(base + '/trig/unit1.html'); page.wait_for_selector('#askPill', state='attached')
            page.locator('#topicList button, #topicList a').first.click(); page.locator('#topicView').wait_for()
            page.wait_for_function("document.querySelector('#say, #learn')?.innerText.trim().length > 5")
            target = '#say' if page.evaluate("document.querySelector('#say').innerText.trim().length > 5") else '#learn'
            page.evaluate(SELECT, target)
            page.get_by_role('button', name='Ask about this').click()
            page.get_by_role('button', name='Explain this').click()
            page.locator('#askLog .tutor', has_text='Answer 1').wait_for()
            assert asks()[-1]['messages'][0]['text'] == 'Explain this more simply.'
            assert not errs, errs
        except Exception:
            fail_report(page, 'ask'); raise
        browser.close()
    print('PASS test-ask')
finally:
    proc.terminate()
