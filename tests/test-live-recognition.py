"""Real model + public-host integration, Chromium phone viewport (NOT iOS).
Run from repository root: uv run --with playwright python tests/test-live-recognition.py
Reads the private invite locally; never prints it. Requires running production service.
"""
import os,json,pathlib,re,time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
url=os.environ.get('MATH_MODE_TEST_URL') or pathlib.Path('/tmp/math-mode-url').read_text().strip()
token=pathlib.Path.home().joinpath('.local/state/math-mode/recognition-invite').read_text().strip()
exe=next(pathlib.Path.home().glob('.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-linux64/chrome-headless-shell'))
def normalize(latex):
    return re.sub(r'\s+','',latex).replace('\\left','').replace('\\right','').replace('\\dfrac','\\frac').replace('^{2}','^2').lower()
expected={'quadratic':'x^2+2x=3','fraction':'\\frac{2x+3}{x-1}=5','wrong-arithmetic':'2+2=5'}
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path=str(exe))
    try:
        page=browser.new_page(viewport={'width':390,'height':844},device_scale_factor=2,is_mobile=True,has_touch=True)
        errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(url.rstrip('/')+'/workspace/#recognition='+token,wait_until='domcontentloaded',timeout=60000)
        page.wait_for_function("document.querySelector('#inkPrivacy').textContent.startsWith('Cropped ink')")
        page.wait_for_function("localStorage.getItem('mathmode-v1') !== null",timeout=30000)
        assert not errors,errors
        assert '#recognition=' not in page.url
        for name in expected:
            strokes=json.loads((ROOT/'tests/fixtures'/f'{name}.json').read_text())
            strokes=[{**s,'pts':[[x*.48,y*.48] for x,y in s['pts']]} for s in strokes]
            page.add_init_script("{let s=JSON.parse(localStorage.getItem('mathmode-v1'));s.problems[0].strokes="+json.dumps(strokes)+";s.problems[0].inkConversions=[];s.tab='ink';localStorage.setItem('mathmode-v1',JSON.stringify(s));}")
            page.reload(wait_until='domcontentloaded',timeout=60000)
            page.locator('#view-ink.on #inkCanvas').wait_for(timeout=30000)
            started=time.perf_counter()
            with page.expect_response(lambda r:r.url.endswith('/api/recognize'),timeout=40000) as response:
                page.get_by_role('button',name='Convert',exact=True).click()
                # The canvas is freed immediately; write a new mark while recognition runs.
                r=page.locator('#inkCanvas').bounding_box()
                page.mouse.move(225,r['y']+35);page.mouse.down();page.mouse.move(310,r['y']+75,steps=10);page.mouse.up()
            elapsed=time.perf_counter()-started
            result=response.value.json()
            assert response.value.ok and result['model']=='bttr-local',(name,result)
            assert len(result['lines'])==1 and normalize(result['lines'][0]['latex'])==expected[name],(name,result)
            page.locator('#inkTyped math-field').wait_for()
            page.wait_for_timeout(250)
            saved=page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0]')
            assert len(saved['strokes'])==1 and saved['inkConversions'][0]['strokes']==strokes
            assert saved['inkConversions'][0]['status']=='ready'
            assert page.get_by_role('button',name='Use this math',exact=True).count()==0
            assert page.locator('#inkTyped math-field').count()==1
            assert page.locator('#inkTyped math-field').bounding_box()['x']<=14
            assert page.locator('.inkGroupActions').is_hidden()
            out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(out/f'auto-recognition-{name}.png'))
            # Undo the new mark, then the conversion; the original vectors are exact.
            page.get_by_role('button',name='Undo handwriting').click()
            page.get_by_role('button',name='Undo handwriting').click()
            page.wait_for_timeout(250)
            assert page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0].strokes')==strokes
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            print(f'PASS real automatic conversion: {name}; {elapsed:.2f}s public round trip; uninterrupted writing and exact ink recovery')
        # Real handwritten continuation joins an existing equation on the grid.
        page.get_by_role('button',name='Convert',exact=True).click()
        math=page.locator('#inkTyped math-field:visible');math.wait_for()
        assert normalize(math.evaluate('f=>f.value'))=='2+2=5'
        rect=math.bounding_box();x,y=rect['x']+rect['width']+20,rect['y']+3
        canvas_before=page.locator('#inkCanvas').bounding_box()
        for points in [[(x,y+15),(x+28,y+15)],[(x+14,y),(x+14,y+30)],[(x+42,y),(x+64,y),(x+68,y+8),(x+58,y+15),(x+44,y+15),(x+62,y+15),(x+70,y+24),(x+62,y+33),(x+42,y+33)]]:
            page.mouse.move(*points[0]);page.mouse.down()
            for point in points[1:]:page.mouse.move(*point)
            page.mouse.up()
        with page.expect_response(lambda r:r.url.endswith('/api/recognize'),timeout=40000) as response:
            page.get_by_role('button',name='Convert',exact=True).click()
        addition=response.value.json()
        assert response.value.ok and normalize(addition['lines'][0]['latex'])=='+3',addition
        page.wait_for_function("document.querySelector('#inkTyped math-field')?.value.replace(/\\s+/g,'')==='2+2=5+3'")
        assert math.count()==1 and math.bounding_box()['y']==rect['y']
        assert page.locator('#inkCanvas').bounding_box()==canvas_before
        page.screenshot(path=str(ROOT/'.artifacts/live/inline-real-continuation.png'))
        print('PASS real same-grid handwritten +3 continuation; one editable equation, no canvas movement, incorrect arithmetic preserved')
        assert not errors,errors
        print('PASS private invite exchange and URL removal; dedicated fast math recognition through public service. Chromium, not iOS.')
    except Exception as exc:
        print('Live test error:',str(exc).replace(token,'[private invite]').replace(url,'[live app]'))
        print('Browser errors:',errors)
        raise SystemExit(1)
    finally:
        browser.close()
