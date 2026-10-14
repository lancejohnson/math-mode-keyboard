"""Trig Unit 1 v2 (small topics + mastery practice). Headless Chromium at phone sizes, NOT iOS Safari.
Masters every topic by answering through the real UI (drag the dot, tap choices, type on the pad),
with one deliberate wrong answer per answer type to check the feedback."""
import functools, http.server, math, pathlib, threading
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'live'


def drag_to(page, t, a=0):
    page.locator('#wheel').scroll_into_view_if_needed()
    steps = max(8, int(abs(t - a) * 12))
    pts = [page.evaluate(f'u1.wheel.client({a + (t - a) * i / steps})') for i in range(steps + 1)]
    page.mouse.move(*pts[0]); page.mouse.down()
    for p in pts[1:]: page.mouse.move(*p)
    page.mouse.up()


def type_pad(page, s):
    for ch in s:
        page.click(f'#pad button[data-k="{ch}"]')


def answer(page, right, shots):
    q = page.evaluate('({type:u1.q().type,t:u1.q().t,ans:u1.q().ans,answer:u1.q().answer})')
    if q['type'] == 'drag':
        drag_to(page, q['t'] if right else q['t'] + math.pi / 2)
        page.click('#check')
    elif q['type'] == 'choice':
        i = q['answer'] if right else (q['answer'] + 1) % 4
        page.locator('#choices .choice').nth(i).click()
    else:
        v = q['ans'] if right else q['ans'] + 7
        type_pad(page, str(round(v, 3)).replace('-', '−'))
        page.click('#check')
    fb = page.inner_text('#feedback')
    assert ('Right' in fb) == right, (q, fb)
    if not right and q['type'] not in shots:
        shots.add(q['type']); page.locator('#topicView').screenshot(path=str(OUT / f'trig1v2-wrong-{q["type"]}.png'))


def lesson(page, shot=None):
    """Step through the lesson; on "your turn" steps, Next stays disabled until the dot is dragged there."""
    k = 0
    while page.inner_text('#stepNext') != 'Start practice →' or page.evaluate('!!u1.step().try') and page.locator('#stepNext').is_disabled():
        st = page.evaluate('u1.step()')
        if st.get('try'):
            assert page.locator('#stepNext').is_disabled()
            w = st['try']['t'] + math.pi / 2
            drag_to(page, w); assert page.locator('#stepNext').is_disabled(), (st, page.evaluate('u1.wheel.s.cur'), page.inner_text('#tryMsg'))
            drag_to(page, st['try']['t'], w)
            assert page.locator('#stepNext').is_enabled(), st
            if shot and not (OUT / shot).exists(): page.locator('#topicView').screenshot(path=str(OUT / shot))
            if page.inner_text('#stepNext') == 'Start practice →': break
        else:
            page.wait_for_timeout(250)
        page.click('#stepNext'); k += 1
    page.click('#stepNext')
    assert page.locator('#practice').is_visible()


def run(page):
    page.set_default_timeout(6000)
    n = page.evaluate('u1.topics.length')
    assert page.locator('.topic').count() == n and page.locator('.topic:disabled').count() == n - 1
    page.screenshot(path=str(OUT / 'trig1v2-list.png'))
    shots = set()
    for ti in range(n):
        if ti == 0: page.locator('.topic').nth(ti).click()
        assert page.inner_text('#topicTitle') == page.evaluate(f'u1.topics[{ti}].title')
        page.wait_for_timeout(1300)
        if ti in (0, 8): page.locator('#topicView').screenshot(path=str(OUT / f'trig1v2-learn{ti}.png'))
        lesson(page, 'trig1v2-yourturn.png')
        if ti == 6: page.evaluate('u1.ask(1, 90)')  # make sure a typed (pad) question gets a wrong answer
        wrongs = 0
        while page.locator('#done').is_hidden():
            right = not (ti in (0, 2, 4, 6, 9) and wrongs == 0)
            answer(page, right, shots)
            if not right: wrongs += 1
            if page.locator('#done').is_hidden(): page.click('#next')
        assert page.evaluate('u1.right()') == 4
        page.click('#nextTopic') if ti < n - 1 else None
    assert {'choice', 'pad'} <= shots, shots  # wrong drag is covered in specific()
    page.reload(); assert page.locator('.topic.done').count() == n and 'Unit complete' in page.inner_text('#unitStatus')


def specific(page):
    # The classic mistakes get specific feedback.
    page.locator('.topic').nth(0).click(); lesson(page)
    page.evaluate('u1.ask(0, 90)'); drag_to(page, math.pi / 2 - 2 * math.pi); page.click('#check')
    assert 'wrong way' in page.inner_text('#feedback'), page.inner_text('#feedback')
    page.locator('#topicView').screenshot(path=str(OUT / 'trig1v2-wrongway.png'))
    page.click('#back')
    for s, v in {'3π/4': 3 * math.pi / 4, '3pi/4': 3 * math.pi / 4, '−π/2': -math.pi / 2, '2π': 2 * math.pi, '135': 135}.items():
        assert abs(page.evaluate('s=>u1.parseAns(s)', s) - v) < 1e-9, s


def main():
    (OUT / 'trig1v2-yourturn.png').unlink(missing_ok=True)
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
                page.goto(f'http://127.0.0.1:{srv.server_port}/trig/'); page.click('text=Angles and radians')
                page.evaluate('localStorage.clear()'); page.reload()
                if w == 390: specific(page); run(page)
                else:
                    page.locator('.topic').nth(0).click(); lesson(page)
                assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), w
                assert not errors, errors
                page.close()
            browser.close()
        print('PASS: trig unit 1 v2 — 10 topics mastered through drag / tap / pad, wrong-answer feedback for each type, wrong-way turn caught, unlocks + progress persist; 3 phone sizes, no JS errors. Chromium, not iOS.')
    finally:
        srv.shutdown()


if __name__ == '__main__':
    main()
