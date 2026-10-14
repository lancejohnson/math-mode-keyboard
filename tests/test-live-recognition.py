"""Real model + public-host integration, Chromium phone viewport (NOT iOS).
Run from repository root: uv run --with playwright python tests/test-live-recognition.py
Reads the private invite locally; never prints it. Requires running production service.
"""
import os,json,pathlib,re
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
        page.goto(url.rstrip('/')+'/#recognition='+token,wait_until='domcontentloaded',timeout=60000)
        page.wait_for_function("document.querySelector('#inkPrivacy').textContent.startsWith('Convert sends only')")
        page.wait_for_function("localStorage.getItem('mathmode-v1') !== null",timeout=30000)
        assert not errors,errors
        assert '#recognition=' not in page.url
        for name in expected:
            strokes=json.loads((ROOT/'tests/fixtures'/f'{name}.json').read_text())
            strokes=[{**s,'pts':[[x*.48,y*.48] for x,y in s['pts']]} for s in strokes]
            page.add_init_script("{let s=JSON.parse(localStorage.getItem('mathmode-v1'));s.problems[0].strokes="+json.dumps(strokes)+";s.problems[0].inkConversions=[];s.tab='ink';localStorage.setItem('mathmode-v1',JSON.stringify(s));}")
            page.reload(wait_until='domcontentloaded',timeout=60000)
            page.locator('#view-ink.on #inkCanvas').wait_for(timeout=30000)
            with page.expect_response(lambda r:r.url.endswith('/api/recognize'),timeout=70000) as response:
                page.get_by_role('button',name='Convert',exact=True).click()
            result=response.value.json()
            assert response.value.ok and result['checked'],(name,result)
            candidates=[result['lines']]+[a['lines'] for a in result['alternatives']]
            assert any(len(lines)==1 and normalize(lines[0]['latex'])==expected[name] for lines in candidates),(name,result)
            page.get_by_role('button',name='Use this math',exact=True).wait_for()
            assert page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0].strokes')==strokes
            out=ROOT/'.artifacts/live';out.mkdir(parents=True,exist_ok=True)
            page.screenshot(path=str(out/f'recognition-{name}-review.png'))
            page.get_by_role('button',name='Use this math',exact=True).click()
            page.wait_for_timeout(250)
            saved=page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0]')
            assert saved['strokes']==[] and saved['inkConversions'][0]['strokes']==strokes
            assert page.locator('#inkTyped math-field').count()==1
            page.screenshot(path=str(out/f'recognition-{name}-typed.png'))
            page.get_by_role('button',name='Undo handwriting').click()
            page.wait_for_timeout(250)
            assert page.evaluate('JSON.parse(localStorage.getItem("mathmode-v1")).problems[0].strokes')==strokes
            assert page.evaluate('document.documentElement.scrollWidth<=innerWidth')
            print(f'PASS real independent readers: {name}; agreement={result["agreement"]}; editable typesetting and exact ink recovery')
        assert not errors,errors
        print('PASS private invite exchange and URL removal; real-model recognition through public service. Chromium, not iOS.')
    except Exception as exc:
        print('Live test error:',str(exc).replace(token,'[private invite]').replace(url,'[live app]'))
        print('Browser errors:',errors)
        raise SystemExit(1)
    finally:
        browser.close()
