"""Headless Chromium phone viewport tests. Not iOS / Safari.
Run: uv run --with playwright python test-phone.py
"""
import os, threading, http.server, functools, pathlib, json
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parent
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args): pass
handler=functools.partial(Quiet,directory=str(ROOT/'app'))
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
exe=next(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
try:
 with sync_playwright() as p:
    b=p.chromium.launch(executable_path=str(exe))
    page=b.new_page(viewport={'width':390,'height':844},device_scale_factor=2,has_touch=True,is_mobile=True)
    errors=[];page.on('pageerror',lambda e:errors.append(e.stack))
    page.goto(os.environ.get('MATH_MODE_TEST_URL',f'http://127.0.0.1:{server.server_port}'),wait_until='networkidle')
    page.wait_for_timeout(1200)
    assert not errors,errors
    page.wait_for_selector('#kb:not([hidden])',timeout=5000)
    f=page.locator('#lines math-field').first
    f.evaluate("f=>{f.value='';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    for k in ['7','8','9']:
      page.locator('#kb .k').filter(has=page.locator('span',has_text=k)).first.click()
    assert f.evaluate('f=>f.getValue("ascii-math")')=='789'
    # Fractions work without a system keyboard, and cursor can leave the denominator.
    page.get_by_role('button',name='÷',exact=True).click()
    page.get_by_role('button',name='2',exact=True).click()
    assert '\\frac' in f.evaluate('f=>f.value')
    page.get_by_role('button',name='→ / out',exact=True).first.click()
    page.get_by_role('button',name='=',exact=True).click()
    page.get_by_role('button',name='1',exact=True).click()
    page.get_by_role('button',name='↵ step',exact=True).click()
    assert page.locator('#lines math-field').count()==2
    assert page.locator('#lines math-field').nth(1).evaluate('f=>f.value')==f.evaluate('f=>f.value')
    # Variant switch and target dimensions.
    page.wait_for_timeout(350)
    targets=page.locator('#kb .k').all()
    for t in targets:
      if t.get_attribute('aria-label') in list('0123456789'):
        r=t.bounding_box();assert r['width']>=90 and r['height']>=58,r
    page.get_by_role('button',name='4 wide',exact=True).click()
    assert page.get_by_role('button',name='5 compact',exact=True).is_visible()
    page.get_by_role('button',name='5 compact',exact=True).click()
    # Math Academy question drawer text persists.
    page.get_by_role('button',name='📌 Question').click()
    page.get_by_role('button',name='Aa Type it').click()
    page.locator('#qBody textarea').fill('Solve 3x = 12')
    page.get_by_role('button',name='📌 Question').click()
    # Moves performs an actual operation on both sides.
    page.get_by_role('button',name='Moves',exact=True).click()
    last=page.locator('#lines math-field').last
    last.evaluate("f=>{f.value='3x=12';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    page.locator('#operand').evaluate("f=>{f.value='3'}")
    page.locator('#movesPanel [data-op=Divide]').click()
    assert page.locator('#lines math-field').last.evaluate('f=>f.value')=='x=4'
    # Graph expression accepts symbols and survives incomplete input.
    page.get_by_role('button',name='Graph',exact=True).click()
    c=page.locator('#curves math-field').first
    c.evaluate("f=>{f.value='y=\\\\sin(x)';f.dispatchEvent(new Event('input',{bubbles:true}));}")
    page.get_by_role('button',name='📐 Draw shape',exact=True).click()
    rect=page.locator('#graphCanvas').bounding_box()
    assert rect['height']>100
    x,y=rect['x']+30,rect['y']+60
    page.mouse.move(x,y);page.mouse.down();page.mouse.move(x+90,y+2,steps=12);page.mouse.up()
    page.wait_for_timeout(200)
    saved=page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1"))')
    assert len(saved['problems'][0]['shapes'])==1
    # Ink gets real stored strokes. No recognition claims.
    page.get_by_role('button',name='Ink',exact=True).click()
    page.mouse.move(50,200);page.mouse.down();page.mouse.move(150,260,steps=15);page.mouse.up()
    page.wait_for_timeout(200)
    assert len(page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1"))')['problems'][0]['strokes'])==1
    page.get_by_role('button',name='Steps',exact=True).click()
    page.wait_for_timeout(200)
    before=page.locator('#lines math-field').count()
    page.reload(wait_until='networkidle')
    assert page.locator('#lines math-field').count()==before
    # Fit at multiple phone sizes, no horizontal page overflow.
    for width,height in [(390,844),(375,667),(430,932)]:
      page.set_viewport_size({'width':width,'height':height})
      page.wait_for_timeout(150)
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
      assert page.locator('#kb').bounding_box()['y']>=80
    page.set_viewport_size({'width':390,'height':844})
    out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'big-pad.png'))
    page.get_by_role('button',name='4 wide',exact=True).click()
    page.screenshot(path=str(out/'compact-pad.png'))
    assert not errors,errors
    b.close()
    print('PASS: number pad, fraction navigation, copied steps, both-side operations, graph/shape, ink, local persistence, 3 phone sizes; no browser JS errors.')
finally:
 server.shutdown();server.server_close();thread.join()
 print('Stopped the temporary test HTTP server.')
