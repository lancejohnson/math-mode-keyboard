"""Prototype parabola lesson: drag the model, step the recipe, solve with the model,
graded freehand sketch. Headless Chromium at phone sizes, NOT iOS Safari."""
import functools, http.server, pathlib, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'live'


def drag(page, plane, start, end):
    page.locator(f'#{plane}Canvas').scroll_into_view_if_needed()
    a = page.evaluate(f'lesson.{plane}.client({start[0]},{start[1]})')
    b = page.evaluate(f'lesson.{plane}.client({end[0]},{end[1]})')
    page.mouse.move(*a); page.mouse.down()
    for i in range(1, 9):
        page.mouse.move(a[0] + (b[0] - a[0]) * i / 8, a[1] + (b[1] - a[1]) * i / 8)
    page.mouse.up()


def draw(page, fn, x0, x1):
    pts = [page.evaluate(f'lesson.sketch.client({x},{fn(x)})') for x in [x0 + (x1 - x0) * i / 40 for i in range(41)]]
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p)
    page.mouse.up()


def run(page):
    page.set_default_timeout(6000)
    # Predict, observe, explain: a right guess, then the classic wrong one (x − 2 moves right).
    choice = lambda t: page.locator('#predictChoices .choice', has_text=t).click()
    choice('Moves up 3'); assert 'matched' in page.inner_text('#predictVerdict')
    page.wait_for_function('lesson.shown().k===3'); page.click('#predictNext')
    choice('Moves left 2'); v = page.inner_text('#predictVerdict'); assert 'Surprise' in v and 'moves right 2' in v, v
    assert page.locator('#predictChoices .right').inner_text().strip() == 'Moves right 2'
    page.wait_for_function('lesson.shown().h===2'); page.click('#predictWhy'); assert 'x = 2' in page.inner_text('#predictKey')
    page.locator('#predict').screenshot(path=str(OUT / 'lesson-predict.png'))
    page.click('#predictNext'); choice('Flips and gets narrower'); page.wait_for_function('lesson.shown().a===-0.5')
    assert page.inner_text('#predictNext') == 'Now explore it yourself ↓'
    # Explore: drag vertex to (2,1), shape handle to a = -1.
    drag(page, 'explore', (0, -2), (2, 1))
    assert page.locator('#exploreEq').inner_text() == 'y = (x − 2)² + 1', page.locator('#exploreEq').inner_text()
    drag(page, 'explore', (3, 2), (3, 0))
    assert page.locator('#exploreEq').inner_text() == 'y = −(x − 2)² + 1'
    assert 'opens down' in page.locator('#exploreFacts').inner_text()
    page.get_by_role('button', name='x-intercepts').click()
    assert 'x-intercepts at 2 ± 1' in page.locator('#exploreFacts').inner_text()
    page.locator('#explore').screenshot(path=str(OUT / 'lesson-explore.png'))
    # Recipe: five moves.
    for _ in range(5): page.get_by_role('button', name='Next move').click()
    assert 'Join' in page.locator('#recipeCaption').inner_text() and page.get_by_role('button', name='Next move').is_disabled()
    page.locator('#recipe').screenshot(path=str(OUT / 'lesson-recipe.png'))
    # Solve with the model.
    assert page.locator('#solveMore').is_hidden()
    drag(page, 'solve', (0, 0), (-2, -3))
    drag(page, 'solve', (-1, -2), (-1, -1))
    assert page.locator('#solveEq').inner_text() == 'y = 2(x + 2)² − 3', page.locator('#solveEq').inner_text()
    assert page.locator('#solveMore').is_visible()
    page.fill('#solveX', '4'); page.click('#solveCheck'); assert 'Not quite' in page.inner_text('#solveFeedback')
    page.fill('#solveX', '-4'); page.click('#solveCheck'); assert 'Right' in page.inner_text('#solveFeedback')
    page.locator('#solve').screenshot(path=str(OUT / 'lesson-solve.png'))
    # Sketch: correct freehand passes, wrong direction and shifted vertex fail.
    page.evaluate('lesson.setTarget({a:-1,h:1,k:2})')
    page.locator('#sketch').scroll_into_view_if_needed()
    draw(page, lambda x: -(x - 1) ** 2 + 2 + 0.15, -1.6, 3.6)
    page.click('#sketchCheck'); res = page.inner_text('#sketchResult')
    assert '✗' not in res and 'every defining feature' in res, res
    page.click('#sketchClear'); draw(page, lambda x: (x - 1) ** 2 - 2, -1.4, 3.4)
    page.click('#sketchCheck'); assert 'should open down' in page.inner_text('#sketchResult')
    page.click('#sketchClear'); draw(page, lambda x: -(x + 1) ** 2 + 2, -3.6, 1.6)
    page.click('#sketchCheck'); res = page.inner_text('#sketchResult')
    assert 'vertex should be (1, 2)' in res, res
    assert res.count('✓') == 3, res  # right direction and width, only the vertex is wrong
    page.click('#sketchClear'); draw(page, lambda x: -2 * (x - 1) ** 2 + 2, -0.6, 2.6)
    page.click('#sketchCheck'); res = page.inner_text('#sketchResult'); assert 'should be down 1' in res, res
    page.locator('#sketch').screenshot(path=str(OUT / 'lesson-sketch.png'))
    page.click('#explainShow'); assert page.locator('#explainKey').is_visible()


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'app')))
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for w, h in [(375, 667), (390, 844), (430, 932)]:
                page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True)
                errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{srv.server_port}/lesson/')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), w
                if w == 390: run(page)
                assert not errors, errors
                page.close()
            browser.close()
        print('PASS: lesson prototype — predict/observe/explain with morph and surprise feedback, drag model + feature callouts, five-move recipe, solve-with-model + symmetry, freehand sketch graded on features (right passes, wrong direction/vertex caught); 3 phone sizes, no JS errors. Chromium, not iOS.')
    finally:
        srv.shutdown()


if __name__ == '__main__':
    main()
