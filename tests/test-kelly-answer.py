"""Kelly answer box on a phone (bug 2026-10-27, iPhone app on /kelly/#derive, 440 wide):
1. Focusing the answer opens the math keyboard; the field and its Check button must end up above the keyboard, not under it.
2. Write is a real writing area like the workspace: tall grid canvas, double-tap converts, the math lands in the answer
   field (not auto-submitted), more writing appends, Undo removes the last stroke, Check then grades it.
Mocked recognition. Headless Chromium at phone sizes, not iOS."""
import subprocess, sys, time, socket, pathlib
from playwright.sync_api import sync_playwright
sys.path.insert(0, str(pathlib.Path(__file__).parent)); from pwfast import phone, fail_report
ROOT = pathlib.Path(__file__).resolve().parents[1]
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
READS = iter(['q\\ln(1-f)', '+p\\ln(1+bf)'])
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}'
    with sync_playwright() as p:
        br = p.chromium.launch()
        for w, h in ((440, 894), (375, 667), (440, 600)):
            page = phone(br, w, h)
            page.route('**/api/status', lambda r: r.fulfill(json={'authorized': True}))
            page.route('**/api/recognize', lambda r: r.fulfill(json={'lines': [{'latex': next(READS, 'x')}]}))
            try:
                page.goto(base + '/kelly/#derive'); page.wait_for_selector('#part h1')
                page.evaluate("localStorage.setItem('mathmode-input','type'); localStorage.setItem('kelly-v1', JSON.stringify({reached:{derive:1}, done:[]}))"); page.reload(); page.wait_for_selector('#part math-field')
                blk = page.locator('#part .block').last; mf = blk.locator('math-field')
                mf.click(); page.wait_for_selector('#kb:not([hidden])'); time.sleep(.3)
                kb_top = page.evaluate("document.querySelector('#kb').getBoundingClientRect().top")
                fb = mf.bounding_box(); chk = blk.locator('.chk').bounding_box()
                assert fb['y'] >= 0 and fb['y'] + fb['height'] <= kb_top, f'{w}x{h}: field {fb} under keyboard top {kb_top}'
                assert chk['y'] + chk['height'] <= kb_top, f'{w}x{h}: Check {chk} under keyboard top {kb_top}'
                # Keys still type into it.
                page.click('#kb button[aria-label="7"]'); assert mf.evaluate('f=>f.value') == '7'
                page.click('#kb button[title="Hide keyboard"]'); mf.evaluate("f=>f.value=''")
                if (w, h) != (440, 894): page.close(); continue
                # Write mode.
                blk.locator('.switch button:has-text("Write")').click(); cv = blk.locator('canvas.writeInk'); cv.wait_for(); cv.scroll_into_view_if_needed(); time.sleep(.15)
                bb = cv.bounding_box(); assert bb['height'] >= 0.4 * h and bb['width'] >= w - 40, f'canvas too small: {bb}'
                assert mf.is_visible() and blk.locator('.chk').is_visible(), 'answer field and Check stay visible in Write mode'
                def stroke(x0, y0, x1, y1):
                    page.mouse.move(bb['x'] + x0, bb['y'] + y0); page.mouse.down(); page.mouse.move(bb['x'] + x1, bb['y'] + y1, steps=6); page.mouse.up()
                def dbl(x, y):
                    for _ in range(2): page.mouse.move(bb['x'] + x, bb['y'] + y); page.mouse.down(); page.mouse.up(); time.sleep(.05)
                stroke(30, 60, 120, 90); stroke(40, 100, 130, 60)
                assert page.evaluate("document.querySelector('.writePane').__strokes()") == 2
                blk.locator('.writePane [data-a=undo]').click(); assert page.evaluate("document.querySelector('.writePane').__strokes()") == 1
                dbl(200, 150); page.wait_for_function("document.querySelector('#part .block:last-child math-field').value.includes('ln')")
                assert page.evaluate("document.querySelector('.writePane').__strokes()") == 0, 'converted ink leaves the canvas'
                assert blk.locator('.fb').inner_text().strip() == '', 'converting does not grade it'
                stroke(30, 60, 120, 90); dbl(200, 150)
                page.wait_for_function("document.querySelector('#part .block:last-child math-field').value.includes('bf')")
                assert mf.evaluate('f=>f.value') == 'q\\ln(1-f)+p\\ln(1+bf)', mf.evaluate('f=>f.value')
                blk.locator('.chk').click(); blk.locator('.fb .ok').wait_for()
                assert not page.errs, page.errs
            except Exception:
                fail_report(page, 'kelly-answer', 'location.hash'); raise SystemExit(1)
            page.close()
        br.close()
    print('PASS: Kelly answer — field + Check stay above the math keyboard (440x894, 375x667, 440x600); Write is a tall grid canvas, double-tap converts into the field, writing again appends, Undo, Check grades; Chromium, not iOS.')
finally:
    srv.terminate()
