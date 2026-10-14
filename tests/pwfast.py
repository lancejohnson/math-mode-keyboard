"""Fail-fast helpers for the trig browser tests (headless Chromium at phone sizes, not iOS).

Every page here is a static file on 127.0.0.1, so anything Playwright waits for either happens in
milliseconds or never. Playwright's default 30 s timeout turned each wrong selector or disabled
button into a 30-38 s run (math-mode turn 2026-10-14: four failing runs in a row while editing the
fact-drill test). With these helpers a failing step stops in ~2 s and prints, in the last lines:
the test line that failed, the short error, page JS errors, and a screenshot path, so `| tail`
is enough and no rerun is needed to find the line.

    from pwfast import phone, FAST_CLOCK, fail_report
    page = phone(browser, 375, 800)           # 2 s default timeout, records page.errs
    page.add_init_script(FAST_CLOCK)          # window.warp(ms) fake wall clock; 650 ms pause skipped
    try: ...
    except Exception: fail_report(page, 'facts', "facts.kind()"); raise SystemExit(1)

PW_TIMEOUT=30000 restores the long wait (e.g. with --slow animations).
"""
import json, os, pathlib, sys, traceback

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '.artifacts' / 'live'
TIMEOUT = int(os.environ.get('PW_TIMEOUT', '2000'))

# Virtual time for the tests: skip the 650 ms auto-advance after a fast right fact, and give the page a
# wall clock the test can move forward (window.warp(ms)) so minute-long drill gaps pass without waiting.
FAST_CLOCK = ("if (!window.__fastTimers) { window.__fastTimers = 1; const st = window.setTimeout;"
              " window.setTimeout = (f, ms, ...a) => st(f, ms === 650 ? 0 : ms, ...a); }"
              "if (!window.warp) { const n = Date.now; let off = 0; window.warp = ms => { off += ms; }; Date.now = () => n() + off; }")


def phone(browser, w, h=800, timeout=None, **kw):
    """New phone-size page with a short default timeout; uncaught JS errors land in page.errs (assert it's empty),
    console.error lines in page.console (shown on failure only)."""
    kw.setdefault('has_touch', True)
    page = browser.new_page(viewport={'width': w, 'height': h}, device_scale_factor=2, **kw)
    page.set_default_timeout(timeout or TIMEOUT)
    page.errs, page.console = [], []
    page.on('pageerror', lambda e: page.errs.append(str(e)))
    page.on('console', lambda m: m.type == 'error' and page.console.append(m.text))
    return page


def fail_report(page, name, state_js=None, shot=True):
    """From an `except`: print the full traceback, then a short summary as the LAST lines of stderr
    (test line, error, page errors, state, screenshot). Then `raise SystemExit(1)`."""
    et, ev, tb = sys.exc_info()
    traceback.print_exc()
    here = [f for f in traceback.extract_tb(tb) if f.filename.startswith(str(ROOT / 'tests'))]
    print('\n---- FAIL ' + name, file=sys.stderr)
    for f in here[-3:]: print(f'  {pathlib.Path(f.filename).name}:{f.lineno} in {f.name}: {f.line}', file=sys.stderr)
    msg = str(ev).split('\n')
    print(f'  {et.__name__ if et else "?"}: ' + '\n  '.join(m for m in msg[:4] if m.strip()), file=sys.stderr)
    errs = getattr(page, 'errs', []) + [f'console: {c}' for c in getattr(page, 'console', [])]
    if errs: print('  page errors: ' + json.dumps(errs[-5:])[:800], file=sys.stderr)
    try:
        if state_js: print('  state: ' + json.dumps(page.evaluate(state_js), default=str)[:1200], file=sys.stderr)
        if shot:
            f = OUT / f'{name}-FAIL.png'; page.screenshot(path=str(f), full_page=True)
            print(f'  screenshot: {f}', file=sys.stderr)
    except Exception as e:
        print(f'  (page state unavailable: {str(e).splitlines()[0]})', file=sys.stderr)
