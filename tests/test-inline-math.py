"""Same-grid continuation and editing in phone-size Chromium, NOT iOS.
Recognition outputs are explicitly mocked; run with uv --with playwright.
"""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'app')))
thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
exe=next(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
try:
 with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(exe))
    page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
    page.set_default_timeout(6000)
    errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
    page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle')
    original=[{'color':'#7dd3fc','pts':[[80,70],[120,110]]},{'color':'#7dd3fc','pts':[[120,70],[80,110]]}]
    state={'problems':[{'id':'inline','title':'Continue the equation','lines':[{'id':'step','latex':'','why':''}],'strokes':original,'curves':[],'shapes':[]}],'current':'inline','tab':'ink','layout':'compact'}
    page.add_init_script("if(!localStorage.getItem('inline-fixture-loaded')){localStorage.setItem('mathmode-v1',JSON.stringify("+json.dumps(state)+"));localStorage.setItem('inline-fixture-loaded','1');}")
    page.reload(wait_until='networkidle')
    calls=[]
    def recognize(route):
        calls.append(json.loads(route.request.post_data))
        route.fulfill(json={'lines':[{'latex':'x' if len(calls)==1 else '+3','uncertain':False}],'warnings':[]})
    page.route('**/api/recognize',recognize)
    canvas=page.locator('#inkCanvas')
    before=canvas.bounding_box()
    page.get_by_role('button',name='Convert',exact=True).click()
    math=page.locator('#inkTyped math-field:visible');math.wait_for()
    assert math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x'
    after=canvas.bounding_box()
    assert before==after  # No strip steals space or moves the writing origin.
    rect=math.bounding_box();assert rect['x']==12 and abs(rect['y']-(before['y']+70))<1
    assert page.locator('#inkTyped').evaluate('n=>n.parentElement.id')=='inkScroll'
    # Write a continuation directly to the right on the same grid row.
    x,y=rect['x']+rect['width']+22,rect['y']+5
    for points in [[(x,y+15),(x+28,y+15)],[(x+14,y),(x+14,y+30)],[(x+42,y),(x+64,y),(x+68,y+8),(x+58,y+15),(x+44,y+15),(x+62,y+15),(x+70,y+24),(x+62,y+33),(x+42,y+33)]]:
        page.mouse.move(*points[0]);page.mouse.down()
        for point in points[1:]:page.mouse.move(*point)
        page.mouse.up()
    page.wait_for_timeout(200)
    addition=page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0].strokes')
    page.get_by_role('button',name='Convert',exact=True).click()
    page.wait_for_timeout(300)
    page.wait_for_function("[...document.querySelectorAll('#inkTyped math-field')].some(f=>f.value.replace(/\\s+/g,'')==='x+3')")
    page.wait_for_timeout(200)
    assert math.count()==1 and math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x+3'
    assert math.bounding_box()['x']==12 and math.bounding_box()['y']==rect['y']
    assert canvas.bounding_box()==before
    saved=page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0]')
    assert saved['inkConversions'][1]['joined'] and saved['inkConversions'][1]['strokes']==addition
    # Tap the whole equation, edit with the custom math pad, then return to pen input.
    math.click()
    math.evaluate("f=>f.executeCommand('moveToMathfieldEnd')")
    page.get_by_role('button',name='+',exact=True).click();page.get_by_role('button',name='1',exact=True).click()
    assert math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x+3+1'
    page.get_by_role('button',name='↵',exact=True).click();page.wait_for_timeout(200)
    page.reload(wait_until='networkidle')
    assert math.count()==1 and math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x+3+1'
    # The grid and editable math pan together, not as separate scrolling sections.
    top=math.bounding_box()['y'];r=canvas.bounding_box()
    canvas.evaluate("n=>n.addEventListener('wheel',e=>window.scrollDelta=e.deltaY,{once:true})")
    page.mouse.move(330,r['y']+180);page.mouse.wheel(0,40);page.wait_for_timeout(150)
    assert abs(math.bounding_box()['y']-(top-page.evaluate('window.scrollDelta')))<1
    page.mouse.wheel(0,-40);page.wait_for_timeout(150)
    out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True)
    page.screenshot(path=str(out/'inline-equation.png'))
    # Saved recovery restores only the handwritten addition; the prior equation remains.
    math.focus();page.get_by_role('button',name='Recognized math actions',exact=True).last.click()
    page.get_by_role('button',name='↶ Restore ink',exact=True).click();page.wait_for_timeout(200)
    assert math.count()==1 and math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x'
    assert page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0].strokes')==addition
    page.get_by_role('button',name='Undo handwriting').click();page.wait_for_timeout(200)
    assert math.count()==1 and math.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x+3+1'
    assert not errors,errors
    assert len(calls)==2
    browser.close()
    print('PASS: same-grid compact editable math, handwritten continuation joins whole equation, unchanged canvas geometry, shared pan, numpad editing, reload and original-ink recovery. Mocked recognition, Chromium not iOS.')
finally:
 server.shutdown();server.server_close();thread.join()
 print('Stopped the temporary inline test server.')
