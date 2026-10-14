"""Trig Unit 1 v2 (small topics + mastery practice). Headless Chromium at phone sizes, NOT iOS Safari.
Masters every topic by answering through the real UI (drag the dot, tap choices, type on the pad),
with one deliberate wrong answer per answer type to check the feedback.

Fast by default: the circle's intro animations are made instant from the test (no production hook) and drags
move in ~0.33 rad steps, since each mouse move costs one rendered frame. On failure it prints the phase, topic,
lesson step, wheel state and feedback, and saves .artifacts/live/trig1v2-FAIL.png, so one run tells you why.
Flags: --only 390 (one phone size), --topics 3 (master only the first N topics), --slow (real animations),
--part specific (only the targeted wrong-way / swipe / parse checks at 390, ~5 s; use while editing those asserts),
--part mastery (only the 11-topic mastery run), --part sizes (only the 375/430 layout checks)."""
import argparse, functools, http.server, json, math, pathlib, sys, threading, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'live'


ARGS = argparse.Namespace(only=None, topics=None, slow=False, part=None)
STATE = {'phase': 'start', 'topic': None}
FAST_PLAY = """(W => { W.play = function (t, extra = {}) { cancelAnimationFrame(this.anim); this.set({ ...extra, cur: t, curLabel: extra.curLabel }); }; })(Object.getPrototypeOf(u1.wheel));
if (!window.__fastTimers) { window.__fastTimers = 1; const st = window.setTimeout; window.setTimeout = (f, ms, ...a) => st(f, ms === 650 ? 0 : ms, ...a); }"""
# ^ also skips the 650 ms auto-advance after a fast right quick fact (about 10 s of waiting per run).


def fast(page):
    """Make the intro animations instant (end state only). The test drives the UI; it doesn't need to watch it."""
    if not ARGS.slow: page.evaluate(FAST_PLAY)


def drag_to(page, t, a=0):
    page.locator('#wheel').scroll_into_view_if_needed()
    steps = max(4, math.ceil(abs(t - a) * 3))  # the wheel unwraps any step under π; each move costs a frame
    pts = page.evaluate(f'[...Array({steps + 1}).keys()].map(i => u1.wheel.client({a} + ({t - a}) * i / {steps}))')
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
    elif q['type'] in ('choice', 'fact'):
        i = q['answer'] if right else (q['answer'] + 1) % 4
        page.locator('#choices .choice').nth(i).click()
    else:
        v = q['ans'] if right else q['ans'] + 7
        type_pad(page, str(round(v, 3)).replace('-', '−'))
        page.click('#check')
    fb = page.inner_text('#feedback')
    assert ('✗' not in fb) == right, (q, fb)
    if not right and q['type'] not in shots:
        shots.add(q['type']); page.locator('#topicView').screenshot(path=str(OUT / f'trig1v2-wrong-{q["type"]}.png'))


def nxt(page):
    """Go to the next question: tap Next, or wait for the auto-advance after a fast right quick fact."""
    if page.locator('#done').is_visible(): return
    if page.locator('#next').is_visible(): page.click('#next')
    else: page.wait_for_function('!u1.q().done')


def lesson(page, shot=None):
    """Step through the lesson; on "your turn" steps, Next stays disabled until the dot is dragged there and Check confirms it."""
    k = 0
    while page.inner_text('#stepNext') != 'Start practice →' or page.evaluate('!!u1.step().try') and page.locator('#stepNext').is_disabled():
        st = page.evaluate('u1.step()')
        if st.get('predict'):
            assert page.locator('#stepNext').is_disabled() and page.evaluate('u1.si()') >= 2  # guess comes after the lesson
            pr = st['predict']; wrong = page.evaluate('u1.topics.indexOf(u1.topics.find(t=>t.title===document.querySelector("#topicTitle").innerText))') % 2 == 1
            page.locator(f'#predChoices .choice[data-j="{(pr["answer"] + 1) % 4 if wrong else pr["answer"]}"]').click()
            assert page.locator('#stepNext').is_enabled() and ('Not quite' in page.inner_text('#tryMsg')) == wrong, page.inner_text('#tryMsg')
            if not (OUT / 'trig1v2-predict.png').exists(): page.locator('#topicView').screenshot(path=str(OUT / 'trig1v2-predict.png'))
        elif st.get('try'):
            assert page.locator('#stepNext').is_disabled()
            w = st['try']['t'] + math.pi / 2
            drag_to(page, w); assert page.locator('#stepNext').is_disabled() and '✓' not in page.inner_text('#tryMsg'), (st, page.inner_text('#tryMsg'))
            page.click('#tryCheck'); assert page.locator('#stepNext').is_disabled() and '✗' in page.inner_text('#tryMsg'), page.inner_text('#tryMsg')
            drag_to(page, st['try']['t'], w)
            assert page.locator('#stepNext').is_disabled() and '✓' not in page.inner_text('#tryMsg'), 'no answer shown before Check'
            page.click('#tryCheck'); assert page.locator('#stepNext').is_enabled() and '✓' in page.inner_text('#tryMsg'), st
            if shot and not (OUT / shot).exists(): page.locator('#topicView').screenshot(path=str(OUT / shot))
            if page.inner_text('#stepNext') == 'Start practice →': break
        elif ARGS.slow:
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
    for ti in range(min(n, ARGS.topics or n)):
        STATE['topic'] = ti
        if ti == 0: page.locator('.topic').nth(ti).click()
        assert page.inner_text('#topicTitle') == page.evaluate(f'u1.topics[{ti}].title')
        page.wait_for_timeout(1300 if ARGS.slow else 50)
        if ti in (0, 7, 8): page.locator('#topicView').screenshot(path=str(OUT / f'trig1v2-learn{ti}.png'))
        lesson(page, 'trig1v2-yourturn.png')
        if ti == 0: page.evaluate('u1.ask(2)')  # make sure a tap (choice) question gets a wrong answer
        if ti == 6: page.evaluate('u1.ask(1, 90)')  # make sure a typed (pad) question gets a wrong answer
        wrongs = 0
        while page.locator('#done').is_hidden():
            right = not (ti in (0, 2, 4, 6, 7, 9) and wrongs == 0)
            answer(page, right, shots)
            if not right: wrongs += 1
            nxt(page)
        assert page.evaluate('u1.right()') == page.evaluate(f'u1.topics[{ti}].goal || 4')
        page.click('#nextTopic') if ti < n - 1 else None
    STATE['topic'] = None
    if ARGS.topics and ARGS.topics < n: return
    assert {'choice', 'pad', 'fact'} <= shots, shots  # wrong drag is covered in specific()
    page.reload(); assert page.locator('.topic.done').count() == n and 'Unit complete' in page.inner_text('#unitStatus')
    # Quick facts review on the topic list: learned angles that are due, timed, back to the list when done.
    assert page.locator('#quickFacts').is_visible() and 'due' in page.inner_text('#quickFacts'), page.inner_text('#quickFacts')
    page.screenshot(path=str(OUT / 'trig1v2-quickfacts-list.png'))
    page.click('#quickFacts'); fast(page); first = True
    while page.locator('#done').is_hidden():
        assert page.evaluate('u1.q().type') == 'fact'
        answer(page, True, shots)
        if first: page.locator('#topicView').screenshot(path=str(OUT / 'trig1v2-quickfacts.png')); first = False
        nxt(page)
    assert 'Review done' in page.inner_text('#doneText'); page.click('#nextTopic'); assert page.locator('#listView').is_visible()


def specific(page):
    # The classic mistakes get specific feedback.
    # A swipe straight across the middle keeps the direction it was already turning (no flip to the other way).
    page.evaluate('u1.open(1)'); lesson(page)
    page.evaluate('u1.ask(0, 210)'); c = page.evaluate('[u1.wheel.client(0, 0.9), u1.wheel.client(1.2, 0.9), u1.wheel.client(1.2 + Math.PI, 0.9)]')
    page.mouse.move(*c[0]); page.mouse.down(); page.mouse.move(*c[1]); page.mouse.move(*c[2]); page.mouse.up()
    assert page.evaluate('u1.wheel.s.cur') > 3, page.evaluate('u1.wheel.s.cur')
    # The short clockwise drag to 300° is −60°, and says so; the finger path is kept for the server.
    page.evaluate('u1.ask(0, 300)'); drag_to(page, -math.pi / 3); page.click('#check')
    assert 'wrong way' in page.inner_text('#feedback') and len(page.evaluate('u1.wheel.trace')) > 3, (page.inner_text('#feedback'), page.evaluate('[u1.wheel.s.cur, document.querySelector("#check").hidden, document.querySelector("#practice").hidden]'))
    page.click('#back')
    page.evaluate('u1.open(3)'); lesson(page)
    page.evaluate('u1.ask(0, Math.PI / 2)'); drag_to(page, math.pi / 2 - 2 * math.pi); page.click('#check')
    assert 'wrong way' in page.inner_text('#feedback'), page.inner_text('#feedback')
    page.locator('#topicView').screenshot(path=str(OUT / 'trig1v2-wrongway.png'))
    page.click('#back')
    for s, v in {'3π/4': 3 * math.pi / 4, '3pi/4': 3 * math.pi / 4, '−π/2': -math.pi / 2, '2π': 2 * math.pi, '135': 135}.items():
        assert abs(page.evaluate('s=>u1.parseAns(s)', s) - v) < 1e-9, s


def dump(page):
    """Print what the page looked like when an assertion failed."""
    try:
        st = page.evaluate("""() => { const v = s => document.querySelector(s); const t = s => v(s) && !v(s).hidden ? v(s).innerText.slice(0, 200) : null;
          let step = null, q = null; try { step = u1.step() } catch {} try { q = u1.q() } catch {}
          return { title: t('#topicTitle'), step, question: q && { type: q.type, t: q.t, ans: q.ans, answer: q.answer }, wheelCur: u1.wheel?.s?.cur,
                   stepNext: v('#stepNext') && { text: v('#stepNext').innerText, disabled: v('#stepNext').disabled }, tryMsg: t('#tryMsg'), feedback: t('#feedback') }; }""")
        page.screenshot(path=str(OUT / 'trig1v2-FAIL.png'), full_page=True)
        print('FAIL STATE', json.dumps({**STATE, **st}, default=str)[:2000], f'\nFAIL SHOT {OUT / "trig1v2-FAIL.png"}', file=sys.stderr)
        part = 'specific' if 'specific' in STATE['phase'] else 'mastery' if 'mastery' in STATE['phase'] else 'sizes'
        print(f'RERUN just this part while fixing it: uv run -q --with playwright python tests/test-trig-unit1.py --part {part}', file=sys.stderr)
    except Exception as e:
        print('FAIL STATE unavailable:', e, file=sys.stderr)


def main():
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument('--only', type=int, help='run only this viewport width (375, 390, 430); 390 runs the full mastery path')
    ap.add_argument('--topics', type=int, help='master only the first N topics in the full path (skips the end-of-unit checks)')
    ap.add_argument('--slow', action='store_true', help='real animation timing and pauses (as before)')
    ap.add_argument('--part', choices=('specific', 'mastery', 'sizes'), help='run one part: specific = targeted checks at 390 (~5 s), mastery = 11-topic run at 390, sizes = 375/430 layout')
    ap.parse_args(namespace=ARGS)
    t0 = time.time()
    for f in ('trig1v2-yourturn.png', 'trig1v2-predict.png'): (OUT / f).unlink(missing_ok=True)
    OUT.mkdir(parents=True, exist_ok=True)
    srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(ROOT / 'app')))
    http.server.SimpleHTTPRequestHandler.log_message = lambda *a: None
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            for w, h in [(375, 667), (390, 844), (430, 932)]:
                if ARGS.only and w != ARGS.only: continue
                if ARGS.part and (ARGS.part == 'sizes') != (w != 390): continue
                tw = time.time(); STATE.update(phase=f'{w}px', topic=None)
                page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2, has_touch=True)
                errors = []; page.on('pageerror', lambda e: errors.append(str(e)))
                page.goto(f'http://127.0.0.1:{srv.server_port}/trig/'); page.click('text=Angles and radians')
                page.evaluate('localStorage.clear()'); page.reload(); fast(page)
                try:
                    if w == 390:
                        if ARGS.part != 'mastery': STATE['phase'] = '390px specific'; specific(page)
                        if ARGS.part != 'specific': STATE['phase'] = '390px mastery run'; run(page)
                    else:
                        page.locator('.topic').nth(0).click(); lesson(page)
                    assert page.evaluate('document.documentElement.scrollWidth<=innerWidth'), w
                    assert not errors, errors
                except Exception:
                    dump(page); raise
                print(f'  {w}px ok in {time.time() - tw:.1f}s', file=sys.stderr)
                page.close()
            browser.close()
        print('PASS: trig unit 1 v2 — 11 topics incl. timed by-heart drill + quick-facts review: short lesson then a stretch guess, then mastery through drag / tap / pad, wrong-answer feedback for each type, wrong-way turn caught, unlocks + progress persist; 3 phone sizes, no JS errors. Chromium, not iOS.' if not (ARGS.only or ARGS.topics or ARGS.part) else f'PASS (partial: only={ARGS.only} topics={ARGS.topics} part={ARGS.part}) in {time.time() - t0:.1f}s')
        if not (ARGS.only or ARGS.topics or ARGS.part): print(f'  total {time.time() - t0:.1f}s', file=sys.stderr)
    finally:
        srv.shutdown()


if __name__ == '__main__':
    main()
