"""Kelly course: all four parts end to end at phone size. Choices, sliders, typed algebra checked by value
(a wrong step is caught, an equivalent form is accepted), the math keyboard opens for answers and hides the tabs,
number drills, Write mode with mocked recognition, progress kept across reloads. Chromium, not iOS."""
import subprocess, sys, time, socket, pathlib, json, re
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); from pwfast import phone, fail_report
ROOT = pathlib.Path(__file__).resolve().parents[1]; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
SHOTS = '--shots' in sys.argv
# Right answers typed per block id; drills read the question and compute.
ALT = {'G': 'q\\ln(1-f)+p\\ln(bf+1)', 'dG': '\\frac{bp}{bf+1}-\\frac{q}{1-f}', 'clear': 'pb-pbf=q+qbf', 'solve': '\\frac{pb-q}{b}', 'dGi': 'a-fs^2', 'fi': '\\frac{a}{s^2}'}
def nums(t): return [float(x) for x in re.findall(r'\d+(?:\.\d+)?', t)]
def drill_answer(bid, q):
    n = nums(q)
    if bid == 'kellyNum': p, b = n[0] / 100, n[1]; return p - (1 - p) / b
    if bid == 'investNum': mu, r, s = [x / 100 for x in n[:3]]; return (mu - r) / s ** 2
    return {'half': .75, 'two': 1 / 3, 'partial': .8}[bid]
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        br = p.chromium.launch(); page = phone(br, 390, 844)
        page.route('**/api/status', lambda r: r.fulfill(json={'authorized': True}))
        page.route('**/api/recognize', lambda r: r.fulfill(json={'lines': [{'latex': '\\frac{pb-q}{b}'}]}))
        try:
            page.goto(base + '/kelly/'); page.wait_for_selector('#part h1')
            assert page.text_content('#part h1') == 'Why not bet it all?' and page.locator('.parts a').count() == 4
            def cur(): return page.locator('#part .block').last
            def cont(): cur().locator('.cont button').click()
            def shot(name):
                if SHOTS: page.screenshot(path=str(OUT / f'kelly-{name}.png'))
            seen = set(); wrong_tried = False; write_tried = False
            for part in ('intuition', 'derive', 'invest', 'variants'):
                for _ in range(40):
                    blk = cur(); kind = blk.get_attribute('data-kind'); i = blk.get_attribute('data-i')
                    blk.scroll_into_view_if_needed(); seen.add(kind)
                    if kind == 'text': pass
                    elif kind == 'choice':
                        opts = blk.locator('.choice'); opts.nth(0).click()
                        assert blk.locator('.choice:disabled').count() == opts.count()
                    elif kind == 'sim':
                        blk.locator('canvas').first.wait_for()
                        r = blk.locator('input[type=range]')
                        if r.count():
                            before = blk.locator('.simBox').inner_text(); r.first.fill(r.first.get_attribute('max'))
                            assert blk.locator('.simBox').inner_text() != before, 'moving a slider changes the readout'
                        if blk.locator('.chip').count():
                            blk.locator('.chip').first.click(); assert blk.locator('.chip[aria-pressed=true]').count() == 1
                        if part == 'intuition' and blk.locator('.chip').count():
                            blk.locator('.chip:has-text("All")').click(); assert blk.locator('.stats div').nth(1).inner_text().startswith('24/24'), 'all-in ruins everyone'
                            blk.locator('.chip:has-text("20%")').click(); assert blk.locator('.stats div').nth(1).inner_text().split('/')[0] in [str(k) for k in range(0, 8)]
                            shot('coin')
                    elif kind in ('type', 'drill'):
                        mf = blk.locator('math-field'); mf.click(); page.wait_for_selector('#kb:not([hidden])')
                        assert not page.locator('#siteNav').is_visible(), 'tabs hide while the keyboard is up'
                        if kind == 'type':
                            target = page.evaluate(f"import('/kelly/content.js?v=1').then(m=>m.PARTS.find(p=>p.id==='{part}').blocks[{i}])")
                            if not wrong_tried:  # a sign slip is caught, then a hint appears
                                mf.evaluate("(f)=>f.value='p\\\\ln(1+bf)-q\\\\ln(1-f)'"); blk.locator('.chk').click()
                                assert blk.locator('.fb .no').count() == 1 and blk.locator('.hint').is_visible(); shot('wrong'); wrong_tried = True
                            if part == 'derive' and target['id'] == 'solve' and not write_tried:  # answer by handwriting (mocked recognition)
                                page.click('#kb button[title="Hide keyboard"]')
                                blk.locator('.switch button:has-text("Write")').click(); cv = blk.locator('canvas.writeInk'); cv.wait_for(); cv.scroll_into_view_if_needed(); time.sleep(.1)
                                bb = cv.bounding_box(); page.mouse.move(bb['x'] + 30, bb['y'] + 60); page.mouse.down(); page.mouse.move(bb['x'] + 120, bb['y'] + 90, steps=6); page.mouse.up()
                                shot('write'); blk.locator('.writePane [data-a=read]').click(); blk.locator('.fb .ok').wait_for()
                                write_tried = True; assert blk.locator('.switch').is_hidden() and blk.locator('math-field').is_visible(), 'answered: shows the answer, not the canvas'
                                page.evaluate("localStorage.setItem('mathmode-input','type')")
                            else:
                                # type the first few keys on the on-screen keyboard to prove it drives the field, then set the rest
                                if target['id'] == 'G':
                                    mf.evaluate("f=>f.value=''"); page.click('#kb button[aria-label="0"]'); page.click('#kb button[aria-label="."]'); page.click('#kb button[aria-label="6"]')
                                    assert mf.evaluate('f=>f.value') == '0.6', mf.evaluate('f=>f.value'); shot('keyboard')
                                mf.evaluate(f"f=>f.value={json.dumps(ALT[target['id']])}"); blk.locator('.chk').click(); blk.locator('.fb .ok').wait_for()
                        else:
                            b = page.evaluate(f"import('/kelly/content.js?v=1').then(m=>m.PARTS.find(p=>p.id==='{part}').blocks[{i}].id)")
                            for _ in range(8):
                                q = blk.locator('.q').inner_text(); v = drill_answer(b, q)
                                mf.evaluate(f"f=>f.value={json.dumps(str(round(v, 4)))}"); blk.locator('.chk').click(); blk.locator('.fb .ok').wait_for()
                                if blk.locator('.nxt').count(): blk.locator('.nxt').click()
                                else: break
                        page.wait_for_selector('#kb', state='hidden')
                    if blk.locator('.cont').count(): cont()
                    if page.locator('.next').count(): break
                else: raise AssertionError(f'{part}: never finished')
                assert page.locator(f'.parts a.done[href="#{part}"]').count() == 1
                shot(part)
                if part != 'variants': page.click('.next a'); page.wait_for_function("document.querySelector('.parts a.on')?.getAttribute('href') !== '#" + part + "' && !document.querySelector('.next')")
            assert seen == {'text', 'choice', 'sim', 'type', 'drill'}, seen
            assert wrong_tried and write_tried
            # Progress is kept: reload a finished part, it shows complete with the next-part link.
            page.goto(base + '/kelly/#derive'); page.reload(); page.wait_for_selector('.next a')
            assert page.locator('.parts a.done').count() == 4 and page.locator('.fb .ok').count() >= 5
            assert page.evaluate('document.documentElement.scrollWidth') <= 390
            assert not page.errs, page.errs
        except Exception:
            fail_report(page, 'kelly', 'location.hash'); raise SystemExit(1)
        br.close()
    print('PASS: Kelly course — 4 parts end to end: choices, simulations (all-in ruins 24/24, 20% grows), typed derivation checked by value (wrong sign caught + hint, equivalent forms accepted), on-screen keyboard drives the field and hides the tabs, Write answer read by (mocked) recognition, number drills, progress persists; 390 px Chromium, not iOS.')
finally:
    srv.terminate()
