"""Hand-editing typed math on the writing line: tap to edit, scribble to delete,
write inside to insert, pinch to zoom, ✎ on previous lines. Mocked OCR, Chromium NOT iOS."""
import functools,http.server,json,pathlib,threading,sys
from ink_diagnostics import run_diagnostics, print_report, check_with_diagnostics
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
def run_edit_checks(page):
    page.route('**/api/status',lambda r:r.fulfill(json={'authorized':True,'recognition':True,'provider':'this Math Mode server (fast math reader)'}))
    page.get_by_role('button',name='Ink',exact=True).click();page.set_default_timeout(8000)
    reading=['x+2=5'];calls=[]
    def fixture(route):calls.append(1);route.fulfill(json={'lines':[{'latex':reading[0],'uncertain':False}],'warnings':[],'model':'bttr-local'})
    page.route('**/api/recognize',fixture)
    canvas=page.locator('#inkCanvas');field=lambda:page.locator('#inkTyped math-field:visible').last
    value=lambda:field().evaluate('f=>f.value.replace(/\\s+/g,"")')
    def stroke(points):
        page.mouse.move(*points[0]);page.mouse.down()
        for p in points[1:]:page.mouse.move(*p,steps=2)
        page.mouse.up();page.wait_for_timeout(150)
    def write(x,y):r=canvas.bounding_box();stroke([(r['x']+x,r['y']+y),(r['x']+x+30,r['y']+y+25)])
    def convert():page.get_by_role('button',name='Convert',exact=True).click();page.wait_for_function('!document.querySelector("#inkTyped .inkStatus")');page.wait_for_timeout(200)
    def strokes():return page.evaluate('()=>JSON.parse(localStorage.getItem("mathmode-v1")).problems.find(p=>p.id===document.querySelector("#problem").value).strokes.length')
    def undo():page.get_by_role('button',name='Undo handwriting',exact=True).click();page.wait_for_timeout(200)

    write(40,40);convert();assert value()=='x+2=5',value()
    # Tap typed math: keypad editing with the caret where tapped; no ink dot added.
    box=field().bounding_box();before=strokes()
    page.mouse.click(box['x']+box['width']-4,box['y']+box['height']/2);page.wait_for_timeout(250)
    assert not page.locator('#kb').is_hidden() and field().evaluate('f=>f.matches(":focus-within")') and strokes()==before
    page.locator('#kb .k',has_text='7').first.click();assert value()=='x+2=57',value()
    field().evaluate('f=>{f.executeCommand("deleteBackward");f.dispatchEvent(new Event("input",{bubbles:true}))}');assert value()=='x+2=5',value()
    # Scribble across the middle symbols deletes them; Undo restores them exactly.
    box=field().bounding_box();y=box['y']+box['height']/2;l=box['x']+box['width']*.3;r=box['x']+box['width']*.62
    stroke([(l,y-6),(r,y+4),(l,y-4),(r,y+6),(l,y-2),(r,y+3)])
    after=value();assert after!='x+2=5' and len(after)<5 and after.startswith('x') and after.endswith('5') and strokes()==before,after
    undo();assert value()=='x+2=5',value()
    # Writing that starts inside the expression is inserted there, not appended.
    reading[0]='3';box=field().bounding_box();y=box['y']+box['height']/2;x0=box['x']+box['width']*.22
    stroke([(x0,y-14),(x0+18,y+14)]);convert();v=value()
    assert v!='x+2=53' and v.replace('3','',1)=='x+2=5' and v.index('3')<4,v
    # Scribbling over unconverted ink removes those strokes only.
    r0=canvas.bounding_box();write(240,120);n=strokes();assert n>=1
    stroke([(r0['x']+235,r0['y']+130),(r0['x']+280,r0['y']+135),(r0['x']+235,r0['y']+140),(r0['x']+280,r0['y']+145),(r0['x']+235,r0['y']+150),(r0['x']+280,r0['y']+152)])
    assert strokes()==n-1 and value()==v
    # Double-tap over typed math with unconverted ink still converts (no keyboard).
    reading[0]='+1';write(250,40);c=len(calls);box=field().bounding_box()
    page.mouse.click(box['x']+5,box['y']+box['height']/2);page.wait_for_timeout(60);page.mouse.click(box['x']+5,box['y']+box['height']/2)
    page.wait_for_function('!document.querySelector("#inkTyped .inkStatus")');page.wait_for_timeout(400)
    assert len(calls)==c+1 and value()==v+'+1' and page.locator('#kb').is_hidden(),value()
    # Pinch zoom: math and ink grow together, new ink is stored at world scale, reset returns to 1×.
    cdp=page.context.new_cdp_session(page);r=canvas.bounding_box();cx=r['x']+120;cy=r['y']+60;small=field().bounding_box()['width']
    cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':cx-30,'y':cy,'id':1},{'x':cx+30,'y':cy,'id':2}]})
    for d in range(30,95,8):cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':cx-d,'y':cy,'id':1},{'x':cx+d,'y':cy,'id':2}]})
    cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]});page.wait_for_timeout(200)
    zoom=page.locator('#inkZoom');assert zoom.is_visible() and float(zoom.inner_text().split('×')[0])>2.5,zoom.inner_text()
    assert field().bounding_box()['width']>small*2.5
    n=strokes();r=canvas.bounding_box();stroke([(r['x']+300,r['y']+r['height']-60),(r['x']+360,r['y']+r['height']-60)])
    span=page.evaluate('()=>{const s=JSON.parse(localStorage.getItem("mathmode-v1")).problems.find(p=>p.id===document.querySelector("#problem").value).strokes.at(-1).pts;return s.at(-1)[0]-s[0][0]}')
    assert strokes()==n+1 and 10<span<25,span
    out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True);page.screenshot(path=str(out/'ink-zoomed.png'))
    zoom.click();page.wait_for_timeout(150);assert zoom.is_hidden() and abs(field().bounding_box()['width']-small)<2
    undo()
    # Eraser: removes whole strokes it touches (no hidden marks) and typed symbols it rubs over.
    eraser=page.get_by_role('button',name='Eraser',exact=True);r=canvas.bounding_box()
    write(60,200);write(200,200);n=strokes();eraser.click();assert eraser.get_attribute('aria-pressed')=='true'
    stroke([(r['x']+70,r['y']+195),(r['x']+80,r['y']+230),(r['x']+75,r['y']+215)])
    st=page.evaluate('()=>JSON.parse(localStorage.getItem("mathmode-v1")).problems.find(p=>p.id===document.querySelector("#problem").value).strokes')
    assert len(st)==n-1 and not any(k['color']=='erase' for k in st) and st[-1]['pts'][0][0]>150,st
    page.screenshot(path=str(out/'ink-eraser.png'))
    before=value();box=field().bounding_box();ex=box['x']+box['width']-6;y=box['y']+box['height']/2
    stroke([(ex,y-4),(ex+1,y+4),(ex,y)]);after=value()
    assert after==before[:-1],(before,after)
    undo();assert value()==before and strokes()==n-1,value()
    undo();assert strokes()==n
    eraser.click();assert eraser.get_attribute('aria-pressed')=='false'
    write(300,260);assert strokes()==n+1
    for _ in range(3):undo()
    assert strokes()==0,strokes()
    # ✎ on a previous line makes it the writing line again without restoring ink.
    page.get_by_role('button',name='New line ↑',exact=True).click();page.wait_for_timeout(200)
    assert page.locator('#inkTyped math-field:visible').count()==0
    page.get_by_role('button',name='Edit line 1 by hand',exact=True).click();page.wait_for_timeout(200)
    assert page.locator('#inkLineLabel').inner_text()=='Current line 1' and value()==v+'+1' and strokes()==0
    page.screenshot(path=str(out/'ink-editing.png'))
    print('PASS: tap typed math to edit, scribble deletes symbols or ink, writing inside inserts, double-tap still converts, pinch zoom keeps world-scale ink, eraser removes whole strokes and typed symbols, ✎ reopens previous lines; Undo restores. Mocked OCR; Chromium, not iOS.')
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
            url=f'http://127.0.0.1:{server.server_port}/workspace/'
            try:
                if '--diagnose' in sys.argv:
                    report=run_diagnostics(browser,url)
                    print_report(report,ROOT/'.artifacts/ink-diagnostics.json')
                    assert report['ok'], 'Ink diagnostic probes failed'
                else:
                    page.goto(url,wait_until='networkidle');page.wait_for_timeout(400)
                    def checks():
                        run_edit_checks(page);assert not errors,errors
                    check_with_diagnostics(browser,url,checks,ROOT/'.artifacts/ink-diagnostics.json')
            finally:browser.close()
    finally:server.shutdown();server.server_close();thread.join();print('Stopped the temporary editing test server.')
