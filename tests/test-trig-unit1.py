"""Trig Unit 1 (angles and radians): predict rounds, turning model incl. negative and multi-turn,
conversion recipe, bike-wheel solve, graded drawing, practice with checking. Headless Chromium at
phone sizes, NOT iOS Safari."""
import functools, http.server, math, pathlib, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'live'
PI = math.pi


def turn(page, wheel, t0, t1, steps=30):
    page.locator(f'#{wheel}Canvas').scroll_into_view_if_needed()
    pts = [page.evaluate(f'u1.{wheel}.client({t0 + (t1 - t0) * i / steps})') for i in range(steps + 1)]
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p)
    page.mouse.up()


def draw_ray(page, t, f=0.95):
    page.locator('#sketchCanvas').scroll_into_view_if_needed()
    a = page.evaluate(f'u1.sketch.client({t},0.05)'); b = page.evaluate(f'u1.sketch.client({t},{f})')
    page.mouse.move(*a); page.mouse.down()
    for i in range(1, 11): page.mouse.move(a[0] + (b[0] - a[0]) * i / 10, a[1] + (b[1] - a[1]) * i / 10)
    page.mouse.up()


def run(page):
    page.set_default_timeout(6000)
    pick = lambda t: page.locator('#predictChoices .choice', has_text=t).click()
    pick('Exactly 60°'); assert 'Surprise' in page.inner_text('#predictVerdict')
    page.wait_for_function('u1.pt()===1'); page.click('#predictWhy'); assert '57.3°' in page.inner_text('#predictKey')
    page.locator('#predict').screenshot(path=str(OUT / 'trig1-predict.png'))
    page.click('#predictNext'); pick('A bit more than 6'); assert 'matched' in page.inner_text('#predictVerdict')
    page.click('#predictNext'); pick('They’re equal'); page.wait_for_function('u1.pt()===1.5')
    # Explore: from π/4 to 3π/4, then clockwise past zero, then past a full turn.
    turn(page, 'explore', PI / 4, 3 * PI / 4)
    read = page.inner_text('#exploreRead'); assert read.startswith('135° = 3π/4 rad'), read
    turn(page, 'explore', 3 * PI / 4, -PI / 2, 60)
    assert page.inner_text('#exploreRead').startswith('−90° = −π/2'), page.inner_text('#exploreRead')
    facts = page.inner_text('#exploreFacts'); assert 'Negative' in facts and 'Same end position as 3π/2' in facts, facts
    turn(page, 'explore', -PI / 2, 2 * PI + PI / 3, 90)
    assert page.inner_text('#exploreRead').startswith('420° = 7π/3'), page.inner_text('#exploreRead')
    page.locator('#explore').screenshot(path=str(OUT / 'trig1-explore.png'))
    # Recipe: 135° → 3/4 of a half turn → 3π/4.
    for _ in range(3): page.click('#recipeNext')
    cap = page.inner_text('#recipeCaption'); assert '2.36' in cap and page.locator('#recipeNext').is_disabled(), cap
    page.click('#recipeBack'); assert '3π/4' in page.inner_text('#recipeCaption')
    page.click('#recipeNext'); page.locator('#recipe').screenshot(path=str(OUT / 'trig1-recipe.png'))
    page.click('#recipeNew'); assert page.inner_text('#recipeEq') != '135° = ?'
    # Solve: turn the wheel 2.5 rad, then a full turn by reasoning.
    assert page.locator('#solveMore').is_hidden()
    turn(page, 'solve', 0, 2.5, 40)
    assert page.evaluate('u1.st()') == 2.5 and '75 cm' in page.inner_text('#solveChecks')
    page.fill('#solveIn', '30pi'); page.click('#solveCheck'); assert 'half turn' in page.inner_text('#solveFeedback')
    page.fill('#solveIn', '60π'); page.click('#solveCheck'); assert 'Right' in page.inner_text('#solveFeedback')
    page.locator('#solve').screenshot(path=str(OUT / 'trig1-solve.png'))
    # Draw: right, wrong way round, measured from 9 o'clock.
    page.evaluate(f'u1.setTarget({-PI/3})'); draw_ray(page, -PI / 3); page.click('#sketchCheck')
    r = page.inner_text('#sketchResult'); assert '✗' not in r and 'clockwise' in r, r
    page.click('#sketchClear'); draw_ray(page, PI / 3); page.click('#sketchCheck'); assert 'wrong way' in page.inner_text('#sketchResult')
    page.evaluate(f'u1.setTarget({PI/6})'); draw_ray(page, 5 * PI / 6); page.click('#sketchCheck'); assert "9 o'clock" in page.inner_text('#sketchResult')
    page.evaluate(f'u1.setTarget({9*PI/4})'); draw_ray(page, PI / 4); page.click('#sketchCheck'); assert 'one full turn' in page.inner_text('#sketchResult')
    page.evaluate(f'u1.setTarget({3*PI/4})'); draw_ray(page, PI / 4); page.click('#sketchCheck')
    page.locator('#sketch').screenshot(path=str(OUT / 'trig1-sketch.png'))
    # Practice: answer every question right except one, through the input like a learner would.
    for i in range(8):
        ans = page.evaluate('u1.pq().ans')
        page.fill('#practiceIn', '999' if i == 2 else repr(round(ans, 4)))
        page.click('#practiceCheck'); fb = page.inner_text('#practiceFeedback')
        assert ('Not quite' in fb) == (i == 2), (i, fb)
        if i == 2: page.locator('#practice').screenshot(path=str(OUT / 'trig1-practice.png'))
        page.click('#practiceNext')
    assert '7 of 8' in page.inner_text('#practiceQ') and 'mastered' in page.inner_text('#practiceQ')
    page.click('#explainShow'); assert page.locator('#explainKey').is_visible()


PARSE = {'3π/4': 3 * PI / 4, '3pi/4': 3 * PI / 4, '−π/2': -PI / 2, '2(π)': 2 * PI, '135°': 135, '60 π': 60 * PI, 'π': PI, '7π/6 rad': 7 * PI / 6, '2.36': 2.36}


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'app')))
    srv.RequestHandlerClass.log_message = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for w, h in [(375, 667), (390, 844), (430, 932)]:
                page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True)
                errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{srv.server_port}/trig/')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), w
                page.click('text=Angles and radians')
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), w
                if w == 390:
                    for s, v in PARSE.items():
                        got = page.evaluate('s=>u1.parseAns(s)', s); assert abs(got - v) < 1e-9, (s, got)
                    assert page.evaluate("Number.isNaN(u1.parseAns('alert(1)'))")
                    run(page)
                assert not errors, errors
                page.close()
            browser.close()
        print('PASS: trig unit 1 — predict rounds, turning model (negative, multi-turn, coterminal), recipe, bike-wheel solve, drawing graded (right / wrong way / from 9 o\'clock / full turn), practice 7 of 8, answer parser; 3 phone sizes, no JS errors. Chromium, not iOS.')
    finally:
        srv.shutdown()


if __name__ == '__main__':
    main()
