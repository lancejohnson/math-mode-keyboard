"""Current-line handwriting and asynchronous recovery. Mocked OCR, Chromium NOT iOS."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run_ink_checks(page):
    page.route('**/api/status',lambda r:r.fulfill(json={'authorized':True,'recognition':True,'provider':'this Math Mode server (fast math reader)','careful':True}))
    page.get_by_role('button',name='Ink',exact=True).click()
    page.set_default_timeout(8000)
    calls=[];reading=['x^{2}+2x=3'];fail=[False]
    def fixture(route):
        calls.append(json.loads(route.request.post_data))
        if fail[0]:route.fulfill(status=503,json={'error':'Could not read. Original ink saved.'})
        else:route.fulfill(json={'lines':[{'latex':reading[0],'uncertain':False}],'warnings':[],'model':'bttr-local'})
    page.route('**/api/recognize',fixture)
    canvas=page.locator('#inkCanvas')
    def ink_state(problem_id=None):
        page.wait_for_timeout(180)
        return page.evaluate('(id)=>JSON.parse(localStorage.getItem("mathmode-v1")).problems.find(p=>p.id===id)',problem_id or page.locator('#problem').input_value())
    def draw(x=230,y=55):
        r=canvas.bounding_box();page.mouse.move(r['x']+x,r['y']+y);page.mouse.down();page.mouse.move(r['x']+x+80,r['y']+min(y+35,r['height']-12),steps=8);page.mouse.up();page.wait_for_timeout(180)
    def current():return page.locator('#inkTyped math-field:visible')
    def convert():page.get_by_role('button',name='Convert',exact=True).click()
    def newline():page.get_by_role('button',name='New line ↑',exact=True).click();page.wait_for_timeout(180)
    def undo():page.get_by_role('button',name='Undo handwriting',exact=True).click();page.wait_for_timeout(180)
    def restore():
        if current().count():current().last.focus()
        page.get_by_role('button',name='Recognized math actions',exact=True).last.click();page.get_by_role('button',name='↶ Restore ink',exact=True).click();page.wait_for_timeout(180)
    def resolve(n,value):page.evaluate('(a)=>window.pendingReads[a[0]](a[1])',[n,value]);page.wait_for_timeout(180)
    draw();original=ink_state()['strokes'];r=canvas.bounding_box()
    page.mouse.dblclick(r['x']+290,r['y']+r['height']-30,delay=90)
    current().wait_for();assert len(calls)==1 and set(calls[0])=={'image'}
    assert canvas.bounding_box()==r and current().bounding_box()['x']==12
    assert ink_state()['strokes']==[] and ink_state()['inkConversions'][0]['strokes']==original
    assert page.locator('#inkReview').count()==0 and page.get_by_role('button',name='Use this math',exact=True).count()==0
    current().evaluate("f=>{f.value='x=4';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    page.get_by_role('button',name='→ / out',exact=True).first.click()
    # Hiding the keyboard must not move the grid under a finger starting a stroke.
    before=canvas.bounding_box();page.mouse.move(260,before['y']+25);page.mouse.down()
    assert canvas.bounding_box()==before
    assert page.locator('#kb').is_hidden()
    page.mouse.move(300,before['y']+55,steps=5);page.mouse.up();page.wait_for_timeout(180)
    added=ink_state()['strokes'];assert len(added)==1 and all(0<=p[1]<=before['height'] for p in added[0]['pts'])
    undo();assert current().evaluate('f=>f.value')=='x=4'
    page.reload(wait_until='networkidle');assert current().evaluate('f=>f.value')=='x=4'
    restore();assert ink_state()['strokes']==original
    fail[0]=True;convert();page.wait_for_function("document.querySelector('#inkTyped .inkStatus')?.textContent.startsWith('Couldn’t')")
    assert ink_state()['inkConversions'][0]['strokes']==original
    restore();assert ink_state()['strokes']==original
    fail[0]=False;page.unroute('**/api/recognize',fixture)
    page.evaluate("""()=>{window.realFetch=window.fetch;window.pendingReads=[];window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(resolve=>window.pendingReads.push((latex)=>resolve(new Response(JSON.stringify({lines:[{latex,uncertain:false}],warnings:[],model:'bttr-local'}),{headers:{'Content-Type':'application/json'}})))):window.realFetch(url,...args);} """)
    convert();page.wait_for_function('window.pendingReads.length===1');r=canvas.bounding_box()
    newline();after=canvas.bounding_box();assert after['width']==r['width'] and abs(after['y']+after['height']-r['y']-r['height'])<1 and after['height']>=r['height']-200
    assert page.locator('#inkCompleted .pending:visible').count()==1 and current().count()==0
    archived_id=ink_state()['inkConversions'][0]['lineId'];assert ink_state()['inkLineId']!=archived_id
    draw();second_ink=ink_state()['strokes'];convert();page.wait_for_function('window.pendingReads.length===2')
    resolve(1,'+3');current().wait_for();assert current().evaluate('f=>f.value')=='+3'
    assert not ink_state()['inkConversions'][-1].get('appendTo')  # No cross-line joining.
    current().evaluate("f=>{f.value='7';f.dispatchEvent(new Event('input',{bubbles:true}));f.focus();}")
    resolve(0,'x=9');assert current().evaluate('f=>f.value==="7" && document.activeElement===f')
    assert page.locator('#inkCompleted math-field:visible').evaluate('f=>f.value')=='x=9'
    newline();assert current().count()==0 and page.locator('#inkCompleted math-field:visible').count()==2
    undo();assert current().evaluate('f=>f.value')=='7'
    undo();assert current().count()==0 and ink_state()['strokes']==second_ink
    assert page.evaluate('window.pendingReads.length')==2  # Completed snapshots are not reread.
    convert();page.wait_for_function('window.pendingReads.length===3');undo();convert();page.wait_for_function('window.pendingReads.length===4')
    resolve(2,'x=77');assert current().count()==0
    resolve(3,'x=88');current().wait_for();assert current().evaluate('f=>f.value')=='x=88'
    draw();page.evaluate("window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(()=>{}):window.realFetch(url,...args)")
    source=ink_state()['strokes'];convert();pending_id=ink_state()['inkConversions'][-1]['id']
    reading[0]='+1';page.route('**/api/recognize',fixture);count=len(calls)
    page.reload(wait_until='networkidle');page.wait_for_timeout(600)
    page.wait_for_function("document.querySelector('#inkTyped math-field')?.value.replace(/\\s+/g,'')==='x=88+1'")
    assert len(calls)==count+1 and ink_state()['inkConversions'][-1]['id']==pending_id
    assert ink_state()['inkConversions'][-1]['strokes']==source
    # Undoing a later stroke must not concatenate an already-joined equation twice.
    draw();undo();assert current().evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x=88+1'
    # New line converts unfinished ink and immediately archives it without waiting.
    draw();page.unroute('**/api/recognize',fixture)
    page.evaluate("""()=>{window.realFetch=window.fetch;window.pendingReads=[];window.fetch=(url,...args)=>url==='/api/recognize'?new Promise(resolve=>window.pendingReads.push((latex)=>resolve(new Response(JSON.stringify({lines:[{latex,uncertain:false}],warnings:[],model:'bttr-local'}),{headers:{'Content-Type':'application/json'}})))):window.realFetch(url,...args);} """)
    original_problem=page.locator('#problem').input_value();raw=ink_state()['strokes'];newline()
    page.wait_for_function('window.pendingReads.length===1')
    assert ink_state()['strokes']==[] and ink_state()['inkConversions'][-1]['strokes']==raw
    assert current().count()==0
    page.once('dialog',lambda d:d.accept('Background isolation'));page.locator('#newProblem').click()
    resolve(0,'+2');assert current().count()==0
    assert ink_state(original_problem)['inkConversions'][-1]['status']=='ready'
    page.locator('#problem').select_option(original_problem);page.wait_for_timeout(200)
    assert page.locator('#inkCompleted math-field:visible').last.evaluate(r"f=>f.value.replace(/\s+/g,'')")=='x=88+1+2'
    # Captured pointer events outside the current grid cannot draw on previous lines.
    r=canvas.bounding_box();page.mouse.move(230,r['y']+30);page.mouse.down();page.mouse.move(260,r['y']-50,steps=6);page.mouse.move(280,r['y']+60,steps=6);page.mouse.up()
    assert all(0<=pt[1]<=r['height'] for stroke in ink_state()['strokes'] for pt in stroke['pts'])
    undo()
    page.evaluate('window.fetch=window.realFetch');page.route('**/api/recognize',fixture)
    for width,height in [(375,667),(390,844),(430,932)]:
        page.set_viewport_size({'width':width,'height':height});page.wait_for_timeout(100)
        assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
        for name in ['Undo handwriting','New line ↑','Convert']:
            target=page.get_by_role('button',name=name,exact=True);box=target.bounding_box();assert box['height']>=44 and box['x']+box['width']<=width
        past=page.locator('#inkPast').bounding_box();assert past['height']<=min(.26*height,180)+1 and canvas.bounding_box()['height']>=max(past['height'],.3*height)-1,(width,height,past,canvas.bounding_box())
        assert page.locator('#inkCompleted').bounding_box()['y']<canvas.bounding_box()['y']
    page.set_viewport_size({'width':390,'height':844})
    out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(out/'current-line-workspace.png'))
    print('PASS: confined writing line, completed expressions immediately above, instant New line with pending recognition, no cross-line joins, keypad/focus stability, exact originals, failure/reload/Undo/stale-response recovery and three phone sizes. Mocked OCR; Chromium, not iOS.')
if __name__=='__main__':
    class Quiet(http.server.SimpleHTTPRequestHandler):
        def log_message(self,*args):pass
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),functools.partial(Quiet,directory=str(ROOT/'app')))
    thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
    try:
        with sync_playwright() as p:
            exe=next(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
            browser=p.chromium.launch(executable_path=str(exe));page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
            errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(f'http://127.0.0.1:{server.server_port}',wait_until='networkidle');page.wait_for_timeout(400)
            run_ink_checks(page);assert not errors,errors;browser.close()
    finally:server.shutdown();server.server_close();thread.join();print('Stopped the temporary current-line test server.')
