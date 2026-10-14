"""Replay historical event-routing/hit-target faults without modifying app files."""
import contextlib
import io
from unittest.mock import patch
import functools
import http.server
import json
import pathlib
import re
import threading

from playwright.sync_api import sync_playwright
from ink_diagnostics import run_diagnostics, print_report, check_with_diagnostics

ROOT = pathlib.Path(__file__).resolve().parents[1]


def inject_faults(page):
    # These are the exact two production defects from the slow turn. Serve the
    # pre-fix behavior in this context only, keeping the checkout/live app intact.
    app = (ROOT/'app/app.js').read_text()
    app, count = re.subn(r"^\$\('#inkTyped'\)\.addEventListener\('pointerdown'.*\n", '', app, flags=re.M)
    assert count == 1, 'Pointer forwarding changed; update fault fixture'
    css = (ROOT/'app/style.css').read_text()
    css, count = re.subn(r'(\.inkEditLine\{[^}]*?)pointer-events:auto;', r'\1', css)
    assert count == 1, 'Edit button CSS changed; update fault fixture'
    page.route('**/app.js*', lambda r:r.fulfill(body=app,content_type='text/javascript'))
    page.route('**/style.css*', lambda r:r.fulfill(body=css,content_type='text/css'))


if __name__ == '__main__':
    original=AssertionError('original edit assertion')
    def failing_check():raise original
    for diagnostic_fails in (False,True):
        with patch('ink_diagnostics.run_diagnostics',side_effect=RuntimeError('diagnostic failure') if diagnostic_fails else None,return_value={}) as run, \
             patch('ink_diagnostics.print_report') as emit, contextlib.redirect_stdout(io.StringIO()):
            try:
                check_with_diagnostics(None,'http://unused',failing_check,ROOT/'.artifacts/unused.json')
            except AssertionError as error:
                assert error is original
            else:raise AssertionError('Original failure swallowed')
            run.assert_called_once()
            assert emit.call_count==(0 if diagnostic_fails else 1)
    with patch('ink_diagnostics.run_diagnostics') as run:
        check_with_diagnostics(None,'http://unused',lambda:None,ROOT/'.artifacts/unused.json')
        run.assert_not_called()
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'app')))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            exe=next(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
            browser=p.chromium.launch(executable_path=str(exe))
            try:
                url=f'http://127.0.0.1:{server.server_port}/workspace/'
                healthy=run_diagnostics(browser,url)
                assert healthy['ok'], healthy
                broken=run_diagnostics(browser,url,mutate=inject_faults)
                print_report(broken,ROOT/'.artifacts/ink-diagnostics-faults.json')
                assert not broken['ok'], broken
                probes={x['name']:x for x in broken['probes']}
                scribble=probes['focused-scribble']
                assert 'canvas handler did not' in scribble['diagnosis'], scribble
                assert not scribble['gesture']['delivered'], scribble
                assert scribble['gesture']['events'][0]['target']=='MATH-FIELD', scribble
                assert not probes['insert-inside']['ok'], probes
                previous=probes['previous-line-hit']
                assert 'not receiving the hit' in previous['diagnosis'], previous
                assert previous['after']['editButtons'][0]['pointerEvents']=='none', previous
                assert previous['hit']['host']=='#inkCompleted', previous
                # The point/glyph evidence is available even if pointer routing
                # fails first; no second source edit/rerun is needed to collect it.
                field=scribble['before']['fields'][0]
                assert len(field['atoms'])==6 and len(field['pointOffsets'])==11, field
                assert not browser.contexts, 'Diagnostic contexts leaked'
                print(json.dumps({'healthy_seconds':healthy['seconds'],'routing_fault_seconds':broken['seconds']}))
                print('PASS: healthy edits, intercepted pointer delivery, inert edit button and glyph-gap evidence; all probes run and contexts close. Chromium, not iOS.')
            finally:browser.close()
    finally:
        server.shutdown();server.server_close();thread.join()
        print('Stopped the temporary diagnostic regression test server.')
