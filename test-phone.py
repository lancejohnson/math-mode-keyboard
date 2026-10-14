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
    assert page.locator('#lines math-field').nth(1).evaluate('f=>f.value')==''
    second=page.locator('#lines math-field').nth(1)
    second.evaluate("f=>{f.value='x+2';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    page.wait_for_timeout(300)
    ret=page.get_by_role('button',name='↵ step',exact=True).bounding_box()
    rx,ry=ret['x']+ret['width']/2,ret['y']+ret['height']/2
    page.mouse.move(rx,ry);page.mouse.down();page.wait_for_timeout(420)
    page.mouse.move(rx,ry-55,steps=6);page.mouse.up()
    assert page.locator('#lines math-field').count()==3
    assert page.locator('#lines math-field').last.evaluate('f=>f.value')=='x+2'
    # Variant switch and target dimensions.
    page.wait_for_timeout(350)
    targets=page.locator('#kb .k').all()
    for t in targets:
      if t.get_attribute('aria-label') in list('0123456789'):
        r=t.bounding_box();assert r['width']>=90 and r['height']>=58,r
    page.get_by_role('button',name='4 wide',exact=True).click()
    assert page.get_by_role('button',name='5 compact',exact=True).is_visible()
    assert page.get_by_role('button',name='÷',exact=True).count()==0
    nine=page.get_by_role('button',name='9',exact=True).bounding_box()
    xkey=page.get_by_role('button',name='x',exact=True).bounding_box()
    assert abs(nine['y']-xkey['y'])<1 and abs(xkey['x']-nine['x']-nine['width'])<1
    page.get_by_role('button',name='x',exact=True).click()
    assert 'x' in page.locator('#lines math-field').last.evaluate('f=>f.value')
    page.get_by_role('button',name='↵',exact=True).click()
    assert page.locator('#lines math-field').last.evaluate('f=>f.value')==''
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
    # Automatic conversion: explicit model fixtures, no confirmation, continue drawing.
    recognition_calls=[]
    def fixture(route):
      recognition_calls.append(json.loads(route.request.post_data))
      route.fulfill(json={'lines':[{'latex':'x^{2}+2x=3','uncertain':False}],'warnings':[],'model':'fast-reader'})
    def ink_state():return page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1"))')['problems'][0]
    def draw():
      r=page.locator('#inkCanvas').bounding_box()
      page.mouse.move(45,r['y']+30);page.mouse.down();page.mouse.move(140,r['y']+85,steps=12);page.mouse.up()
      page.wait_for_timeout(180)
    def restore_last():
      page.get_by_role('button',name='Recognized math actions',exact=True).last.click()
      page.get_by_role('button',name='↶ Restore ink',exact=True).click()
      page.wait_for_timeout(200)
    page.route('**/api/recognize',fixture)
    page.get_by_role('button',name='Ink',exact=True).click()
    draw();original=ink_state()['strokes'];assert len(original)==1
    page.mouse.dblclick(290,400,delay=90)
    page.locator('#inkTyped math-field').wait_for()
    page.wait_for_timeout(200)
    assert len(recognition_calls)==1 and set(recognition_calls[0])=={'image'}
    assert recognition_calls[0]['image'].startswith('data:image/png;base64,')
    assert page.locator('#inkReview').count()==0
    assert page.get_by_role('button',name='Use this math',exact=True).count()==0
    assert ink_state()['strokes']==[] and ink_state()['inkConversions'][0]['strokes']==original
    assert page.locator('.inkGroupActions').first.is_hidden()
    assert page.locator('#inkTyped math-field').bounding_box()['x']<=14
    before=page.locator('#lines math-field').count()
    typed=page.locator('#inkTyped math-field').first
    typed.evaluate("f=>{f.value='x=4';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    page.wait_for_timeout(200)
    page.get_by_role('button',name='↵ step',exact=True).click()
    assert page.locator('#lines math-field').count()==before
    page.get_by_role('button',name='Undo handwriting').click()
    page.wait_for_timeout(200)
    assert ink_state()['strokes']==original and ink_state()['inkConversions']==[]
    undo=page.get_by_role('button',name='Undo handwriting').bounding_box()
    assert undo['width']>=70 and undo['height']>=44
    # Editable math persists, with recovery tucked into the row menu.
    page.get_by_role('button',name='Convert',exact=True).click()
    page.locator('#inkTyped math-field').wait_for()
    page.locator('#inkTyped math-field').evaluate("f=>{f.value='x=l';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();f.executeCommand('moveToMathfieldEnd');}")
    page.wait_for_timeout(150)
    page.get_by_role('button',name='+',exact=True).click()
    page.get_by_role('button',name='1',exact=True).click()
    page.reload(wait_until='networkidle')
    assert page.locator('#inkTyped math-field').evaluate('f=>f.value')=='x=l+1'
    restore_last();assert ink_state()['strokes']==original
    page.unroute('**/api/recognize',fixture)
    def failed(route):route.fulfill(status=503,json={'error':'Recognition failed. Original ink saved.'})
    page.route('**/api/recognize',failed)
    page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function("document.querySelector('.inkStatus')?.textContent.startsWith('Couldn’t')")
    page.wait_for_timeout(200)
    assert ink_state()['inkConversions'][0]['strokes']==original
    restore_last();assert ink_state()['strokes']==original
    page.unroute('**/api/recognize',failed)
    # Deferred requests expose concurrency, pen-down layout stability and late-response races.
    page.evaluate("""()=>{window.realFetch=window.fetch;window.pendingReads=[];window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(resolve=>window.pendingReads.push((latex='x=9')=>resolve(new Response(JSON.stringify({lines:[{latex,uncertain:false}],warnings:[],model:'fast-reader'}),{headers:{'Content-Type':'application/json'}})))):window.realFetch(url,...args);}""")
    page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function('window.pendingReads.length===1')
    page.wait_for_timeout(180)
    assert ink_state()['strokes']==[] and page.get_by_role('button',name='Convert',exact=True).is_enabled()
    draw();assert len(ink_state()['strokes'])==1  # Can write before the recognition returns.
    r=page.locator('#inkCanvas').bounding_box()
    page.mouse.move(180,r['y']+30);page.mouse.down();page.mouse.move(250,r['y']+75,steps=10)
    page.evaluate('window.pendingReads[0]()');page.wait_for_timeout(100)
    assert page.locator('#inkTyped math-field').count()==0  # No reflow while finger is down.
    assert page.locator('#inkCanvas').bounding_box()['y']==r['y']
    page.mouse.up();page.locator('#inkTyped math-field').wait_for();page.wait_for_timeout(200)
    assert len(ink_state()['strokes'])==2 and ink_state()['inkConversions'][0]['strokes']==original
    page.get_by_role('button',name='Undo handwriting').click()
    page.get_by_role('button',name='Undo handwriting').click()
    page.wait_for_timeout(200)
    assert ink_state()['strokes']==[]
    assert page.locator('#inkTyped math-field').evaluate('f=>f.value')=='x=9'
    assert page.evaluate('window.pendingReads.length')==1  # Undo reconciles stale pending snapshots.
    page.get_by_role('button',name='Undo handwriting').click();page.wait_for_timeout(200)
    assert ink_state()['strokes']==original
    page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function('window.pendingReads.length===2')
    page.get_by_role('button',name='Undo handwriting').click()
    page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function('window.pendingReads.length===3')
    page.evaluate("window.pendingReads[1]('x=77')");page.wait_for_timeout(100)
    assert page.locator('#inkTyped math-field').count()==0
    page.evaluate("window.pendingReads[2]('x=88')");page.locator('#inkTyped math-field').wait_for()
    assert page.locator('#inkTyped math-field').evaluate('f=>f.value')=='x=88'
    # A later batch must not steal focus or overwrite edits to an earlier math row.
    draw();page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function('window.pendingReads.length===4')
    first=page.locator('#inkTyped math-field').first
    first.evaluate("f=>{f.value='x=42';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    page.evaluate("window.pendingReads[3]('y=2')");page.wait_for_timeout(200)
    assert page.locator('#inkTyped math-field').count()==2
    assert first.evaluate('f=>document.activeElement===f && f.value==="x=42"')
    page.get_by_role('button',name='Undo handwriting').click();page.wait_for_timeout(200)
    assert page.locator('#inkTyped math-field').first.evaluate('f=>f.value')=='x=42'
    page.evaluate('window.fetch=window.realFetch')
    # Persisted pending batches resume after refresh, without resending finished rows.
    saved_source=ink_state()['strokes']
    page.evaluate("window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(()=>{}):window.realFetch(url,...args)")
    page.get_by_role('button',name='Convert',exact=True).click();page.wait_for_timeout(200)
    pending_id=ink_state()['inkConversions'][-1]['id']
    page.route('**/api/recognize',fixture)
    page.reload(wait_until='networkidle')
    page.wait_for_function("document.querySelectorAll('#inkTyped math-field').length===2")
    page.wait_for_timeout(200)
    resumed=ink_state()['inkConversions'][-1]
    assert resumed['id']==pending_id and resumed['status']=='ready' and resumed['strokes']==saved_source
    assert page.locator('#inkTyped math-field').first.evaluate('f=>f.value')=='x=42'
    # A background batch remains attached to its original problem after a switch.
    original_problem=page.locator('#problem').input_value()
    page.evaluate("""()=>{window.realFetch=window.fetch;window.pendingReads=[];window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(resolve=>window.pendingReads.push(()=>resolve(new Response(JSON.stringify({lines:[{latex:'x=123',uncertain:false}],warnings:[],model:'fast-reader'}),{headers:{'Content-Type':'application/json'}})))):window.realFetch(url,...args);}""")
    draw();page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_function('window.pendingReads.length===1')
    page.once('dialog',lambda d:d.accept('Background isolation'))
    page.locator('#newProblem').click()
    page.evaluate('window.pendingReads[0]()');page.wait_for_timeout(200)
    assert page.locator('#inkTyped math-field').count()==0
    assert ink_state()['inkConversions'][-1]['lines'][0]['latex']=='x=123'
    page.locator('#problem').select_option(original_problem)
    assert page.locator('#inkTyped math-field').last.evaluate('f=>f.value')=='x=123'
    page.evaluate('window.fetch=window.realFetch')
    for width,height in [(375,667),(390,844)]:
      page.set_viewport_size({'width':width,'height':height})
      assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
      assert page.get_by_role('button',name='Undo handwriting').is_visible()
    page.set_viewport_size({'width':390,'height':844})
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
    print('PASS: number pad, fraction navigation, blank/hold-slide-copy steps, both-side operations, graph/shape, automatic recognition, uninterrupted drawing, editing/undo/recovery/races (mocked model), local persistence, 3 phone sizes; no browser JS errors.')
finally:
 server.shutdown();server.server_close();thread.join()
 print('Stopped the temporary test HTTP server.')
