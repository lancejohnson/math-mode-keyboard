"""Knowledge map for trig Unit 1: data matches the unit, graph draws, progress and fact cards show, tapping opens the topic."""
import json, subprocess, sys, time, socket, pathlib
from playwright.sync_api import sync_playwright
from pwfast import phone, fail_report
ROOT = pathlib.Path(__file__).resolve().parents[1]; OUT = ROOT / '.artifacts/live'; OUT.mkdir(parents=True, exist_ok=True)
s = socket.socket(); s.bind(('127.0.0.1', 0)); port = s.getsockname()[1]; s.close()
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(port), '-d', str(ROOT / 'app')], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
try:
    time.sleep(0.6); base = f'http://127.0.0.1:{port}/trig/'
    with sync_playwright() as p:
        b = p.chromium.launch(); page = phone(b, 390, 844, has_touch=False)
        page.goto(base + 'unit1.html'); page.wait_for_function('window.u1')
        unit = page.evaluate('u1.topics.map(t => ({id: t.id, title: t.title, facts: t.facts || null}))')
        page.goto(base + 'map.html'); page.wait_for_function('window.map')
        data = page.evaluate("import('./map.js?v=1').then(m => m.UNIT1.topics.map(t => ({id: t.id, title: t.title, kind: t.kind, needs: t.needs})))")
        assert [t['id'] for t in data] == [t['id'] for t in unit], 'map topics must match unit1.html order'
        assert [t['title'] for t in data] == [t['title'] for t in unit], [(a['title'], b['title']) for a, b in zip(data, unit) if a['title'] != b['title']]
        assert all(t['kind'] in ('concept', 'procedure', 'automatic') for t in data)
        assert page.locator('.node').count() == len(unit) and page.locator('path.edge').count() == sum(len(t['needs']) for t in data)
        assert page.locator('.node.open').count() == 1 and page.locator('.node.locked').count() == len(unit) - 1
        # Some progress: first 5 topics mastered, a few fact cards automatic and one due.
        now = int(time.time() * 1000); fast = [{'ok': True, 's': 1.2, 't': now}] * 3
        facts = {'d2r:90': {'hist': fast, 'due': now + 9e8}, 'r2d:90': {'hist': fast, 'due': now - 1000}, 'd2r:180': {'hist': [{'ok': False, 's': 5, 't': now}]}}
        page.evaluate(f"localStorage.setItem('trig-unit1-v2', JSON.stringify({{done: ['turns','thirty','negative','pi','quarters'], pred: {{sixths: 'right'}}}})); localStorage.setItem('trig-facts-v1', JSON.stringify({json.dumps(facts)}))")
        page.reload(); page.wait_for_function('window.map')
        st = page.evaluate('Object.fromEntries(Object.entries(map.st).map(([k, v]) => [k, v.state]))')
        assert st['turns'] == 'mastered' and st['pi'] == 'review' and st['sixths'] == 'learning' and st['convert'] == 'locked', st
        assert '5 of 11' in page.inner_text('#summary') and '1 fact due' in page.inner_text('#summary'), page.inner_text('#summary')
        assert '2/8 automatic' in page.inner_text('#n-pi'), page.inner_text('#n-pi')
        assert page.locator('path.edge.lit').count() > 0
        page.screenshot(path=str(OUT / 'trig-map.png'), full_page=True)
        page.click('#n-sixths'); page.wait_for_function('window.u1 && !document.querySelector("#topicView").hidden')
        assert page.inner_text('#topicTitle') == unit[5]['title']
        b.close()
    print('PASS: trig knowledge map — 11 topics match the unit, prerequisite arrows, concept/procedure/automatic tags, progress states, fact-card bars, tap opens topic')
finally:
    srv.terminate()
