"""Focused eraser + toolbar regression. Mocked recognition; Chromium, NOT iOS.

Run with `make test-eraser`. No screenshots or unrelated editing suites.
"""
import functools
import http.server
import pathlib
import threading

from playwright.sync_api import expect, sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
PHONE_SIZES = [(375, 667), (390, 844), (430, 932)]
STATE = """() => JSON.parse(localStorage.getItem('mathmode-v1'))?.problems
    .find(p => p.id === document.querySelector('#problem').value)"""


def run_eraser_checks(page):
    page.set_default_timeout(8000)
    page.get_by_role('button', name='Ink', exact=True).click()
    eraser = page.get_by_role('button', name='Eraser', exact=True)
    canvas = page.locator('#inkCanvas')
    field = page.locator('#inkTyped math-field:visible').last

    def layout_checks():
        for width, height in PHONE_SIZES:
            page.set_viewport_size({'width': width, 'height': height})
            # Wait on geometry, not an arbitrary screenshot/render delay.
            page.wait_for_function('document.querySelector("#inkCanvas").width / devicePixelRatio === innerWidth')
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), f'Page overflow at {width}px'
            for name in ['Undo handwriting', 'Convert', 'New line ↑', 'Pen colors', 'Eraser', 'Clear']:
                box = page.get_by_role('button', name=name, exact=True).bounding_box()
                assert box and box['height'] >= 44 and box['x'] >= 0 and box['x'] + box['width'] <= width, (width, name, box)
        page.set_viewport_size({'width': 390, 'height': 844})
        page.wait_for_function('document.querySelector("#inkCanvas").width / devicePixelRatio === innerWidth')

    def stroke(points):
        page.mouse.move(*points[0])
        page.mouse.down()
        for point in points[1:]:
            page.mouse.move(*point, steps=2)
        page.mouse.up()

    def write(x, y):
        box = canvas.bounding_box()
        stroke([(box['x'] + x, box['y'] + y), (box['x'] + x + 30, box['y'] + y + 25)])

    def saved_strokes(count):
        page.wait_for_function(f'() => ({STATE})()?.strokes.length === {count}')
        return page.evaluate(STATE)['strokes']

    def value():
        return field.evaluate(r'f => f.value.replace(/\s+/g, "")')

    def undo():
        page.get_by_role('button', name='Undo handwriting', exact=True).click()

    layout_checks()
    write(40, 40)
    page.get_by_role('button', name='Convert', exact=True).click()
    expect(field).to_be_visible()
    page.wait_for_function('document.querySelector("#inkTyped math-field")?.value === "x+2=5"')
    saved_strokes(0)

    write(60, 200)
    saved_strokes(1)
    write(200, 200)
    original = saved_strokes(2)
    eraser.click()
    expect(eraser).to_have_attribute('aria-pressed', 'true')
    assert eraser.evaluate('b => b.classList.contains("on")')
    layout_checks()
    box = canvas.bounding_box()
    stroke([(box['x'] + 70, box['y'] + 195), (box['x'] + 80, box['y'] + 230), (box['x'] + 75, box['y'] + 215)])
    remaining = saved_strokes(1)
    # Entire touched stroke gone; untouched stroke exact; no hidden erase marks.
    assert remaining == [original[1]], remaining
    assert value() == 'x+2=5'

    box = field.bounding_box()
    x, y = box['x'] + box['width'] - 6, box['y'] + box['height'] / 2
    stroke([(x, y - 4), (x + 1, y + 4), (x, y)])
    assert value() == 'x+2=', value()
    undo()
    assert value() == 'x+2=5'
    assert saved_strokes(1) == remaining
    undo()
    assert saved_strokes(2) == original  # One Undo per sweep, not per move.

    eraser.click()
    expect(eraser).to_have_attribute('aria-pressed', 'false')
    write(300, 260)
    assert saved_strokes(3)[-1]['color'] != 'erase'
    # Pen color control also leaves erase mode.
    eraser.click()
    page.get_by_role('button', name='Pen colors', exact=True).click()
    expect(eraser).to_have_attribute('aria-pressed', 'false')
    print('PASS: eraser toggle, whole-stroke removal, exact untouched ink, typed-symbol deletion, per-sweep Undo, pen return and toolbar fit at 375/390/430px. Mocked recognition; Chromium, not iOS.')


def main():
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=str(ROOT / 'app')))
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with sync_playwright() as p:
            # Prefer Playwright's matching installed browser; fallback matches the
            # existing repository tests when uv resolves a newer Playwright.
            executable = pathlib.Path(p.chromium.executable_path)
            if not executable.exists():
                executable = sorted(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))[-1]
            browser = p.chromium.launch(executable_path=str(executable))
            try:
                page = browser.new_page(viewport={'width': 390, 'height': 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.route('**/api/status', lambda route: route.fulfill(json={'authorized': True, 'recognition': True, 'provider': 'test fixture'}))
                page.route('**/api/recognize', lambda route: route.fulfill(json={'lines': [{'latex': 'x+2=5', 'uncertain': False}], 'warnings': [], 'model': 'test fixture'}))
                page.goto(f'http://127.0.0.1:{server.server_port}/workspace/', wait_until='load')
                run_eraser_checks(page)
                assert not errors, errors
            finally:
                browser.close()
    finally:
        server.shutdown()
        server.server_close()
        thread.join()
        print('Stopped the temporary eraser test server.')


if __name__ == '__main__':
    main()
