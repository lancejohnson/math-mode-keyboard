"""Test-only ink event/geometry diagnostics. No app instrumentation or real OCR."""
import json
import time

# Observe both DOM dispatch and actual canvas-handler delivery. A document event
# alone does not prove that the canvas received a stroke (MathLive has a shadow DOM).
INSTALL = r"""() => {
  const canvas = document.querySelector('#inkCanvas');
  const log = window.__inkDiagnostic = {events: [], delivered: [], hits: []};
  const label = n => n?.id ? '#' + n.id : n?.tagName || String(n);
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel','lostpointercapture']) {
    document.addEventListener(type, e => {
      log.events.push({type, target:label(e.target), path:e.composedPath().slice(0,5).map(label),
        x:e.clientX, y:e.clientY, pointer:e.pointerId});
      if (log.events.length > 160) log.events.shift();
    }, true);
  }
  for (const type of ['pointerdown','pointermove','pointerup','pointercancel']) {
    const original = canvas['on'+type];
    canvas['on'+type] = function(e) {
      log.delivered.push({type, x:e.clientX, y:e.clientY});
      if (log.delivered.length > 160) log.delivered.shift();
      return original?.call(this,e);
    };
  }
  window.__inkHit = (x,y) => {
    let n=document.elementFromPoint(x,y), deep=n;
    while(deep?.shadowRoot) {
      const next=deep.shadowRoot.elementFromPoint(x,y);
      if(!next || next===deep) break;
      deep=next;
    }
    const hit={x,y,host:label(n),deep:label(deep),stack:document.elementsFromPoint(x,y).slice(0,6).map(label)};
    log.hits.push(hit); return hit;
  };
}"""

SNAPSHOT = r"""() => {
  const rect = b => b && ({left:b.left,top:b.top,right:b.right,bottom:b.bottom,width:b.width,height:b.height});
  const fields = [...document.querySelectorAll('#inkTyped math-field')].filter(f=>f.getBoundingClientRect().width);
  let p;try {p=JSON.parse(localStorage.getItem('mathmode-v1')).problems.find(p=>p.id===document.querySelector('#problem').value);}catch{}
  return {fields:fields.map(f=>{
    const b=f.getBoundingClientRect(), atoms=[];
    for(let k=0;k<=f.lastOffset;k++){const a=f.getElementInfo(k);atoms.push({offset:k,latex:a?.latex,bounds:rect(a?.bounds)});}
    return {value:f.value,focused:f.matches(':focus-within'),bounds:rect(b),atoms,
      pointOffsets:[0,.1,.2,.3,.4,.5,.6,.7,.8,.9,1].map(k=>({fraction:k,offset:f.getOffsetFromPoint(b.left+k*b.width,b.top+b.height/2)}))};
  }), strokes:p?.strokes.map(s=>({points:s.pts.length,first:s.pts[0],last:s.pts.at(-1)})),
    line:document.querySelector('#inkLineLabel').textContent,
    toast:document.querySelector('#toast').textContent,
    editButtons:[...document.querySelectorAll('.inkEditLine')].map(n=>({label:n.ariaLabel,
      pointerEvents:getComputedStyle(n).pointerEvents,bounds:rect(n.getBoundingClientRect())})),
    ...window.__inkDiagnostic};
}"""


def stroke(page, points):
    page.mouse.move(*points[0])
    page.mouse.down()
    for point in points[1:]:
        page.mouse.move(*point, steps=2)
    page.mouse.up()
    page.wait_for_timeout(180)  # app's debounced localStorage save


def run_diagnostics(browser, url, *, mutate=None):
    """Independent probes: one failed gesture never hides the other failures.

    mutate(page) is a test-only route injector for regression tests. Reports are
    JSON so a failed run gives evidence in the tool result, not a screenshot loop.
    """
    started = time.monotonic()
    report = {'browser': 'headless Chromium, NOT iOS', 'probes': []}
    for name in ('focused-scribble', 'insert-inside', 'previous-line-hit'):
        context = browser.new_context(viewport={'width':390,'height':844},
                                      device_scale_factor=2, is_mobile=True, has_touch=True)
        page = context.new_page()
        page.set_default_timeout(2500)
        result = {'name': name}
        report['probes'].append(result)
        try:
            errors=[]
            page.on('pageerror',lambda e:errors.append(str(e)))
            if mutate:
                mutate(page)
            page.route('**/api/status', lambda r:r.fulfill(json={'authorized':True,'recognition':True}))
            reading = ['x+2=5']
            page.route('**/api/recognize', lambda r:r.fulfill(json={
                'lines':[{'latex':reading[0],'uncertain':False}], 'warnings':[], 'model':'diagnostic-fixture'}))
            page.goto(url, wait_until='networkidle')
            page.get_by_role('button', name='Ink', exact=True).click()
            canvas = page.locator('#inkCanvas')
            b = canvas.bounding_box()
            if not b:
                raise AssertionError(f'Ink canvas has no visible bounds; browser errors: {errors}')
            stroke(page, [(b['x']+40,b['y']+40),(b['x']+70,b['y']+65)])
            page.get_by_role('button', name='Convert', exact=True).click()
            field = page.locator('#inkTyped math-field:visible').last
            field.wait_for()
            page.wait_for_timeout(200)
            # Reproduce the state that caused MathLive to steal the next stroke.
            field.focus()
            page.wait_for_timeout(100)
            page.evaluate(INSTALL)
            result['before'] = page.evaluate(SNAPSHOT)
            if name == 'previous-line-hit':
                page.get_by_role('button', name='New line ↑', exact=True).click()
                page.wait_for_timeout(180)
                target = page.get_by_role('button', name='Edit line 1 by hand', exact=True)
                b = target.bounding_box()
                if not b:
                    raise AssertionError('Edit button has no visible bounds')
                result['target'] = page.evaluate(SNAPSHOT)['editButtons']
                x,y = b['x']+b['width']/2,b['y']+b['height']/2
                result['hit'] = page.evaluate('([x,y])=>window.__inkHit(x,y)', [x,y])
                # Raw mouse avoids Playwright's eight-second actionability retry.
                page.mouse.click(x,y)
                page.wait_for_timeout(180)
                result['ok'] = page.locator('#inkTyped math-field:visible').count() == 1
            else:
                b=field.bounding_box();x=b['x'];y=b['y']+b['height']/2;w=b['width']
                if name == 'focused-scribble':
                    l,r=x+w*.3,x+w*.62
                    points=[(l,y-6),(r,y+4),(l,y-4),(r,y+6),(l,y-2),(r,y+3)]
                else:
                    points=[(x+w*.22,y-14),(x+w*.22+18,y+14)]
                page.evaluate('([x,y])=>window.__inkHit(x,y)',points[0])
                stroke(page,points)
                # Capture delivered events before toolbar clicks add noise.
                result['gesture'] = page.evaluate(SNAPSHOT)
                if name == 'insert-inside' and result['gesture']['strokes']:
                    reading[0]='3'
                    page.get_by_role('button',name='Convert',exact=True).click()
                    page.wait_for_function('!document.querySelector("#inkTyped .inkStatus")')
                    page.wait_for_timeout(200)
                v=field.evaluate(r'f=>f.value.replace(/\s+/g,"")')
                result['value']=v
                if name == 'focused-scribble':
                    result['ok']=v!='x+2=5' and len(v)<5 and v.startswith('x') and v.endswith('5')
                else:
                    result['ok']=v!='x+2=53' and v.replace('3','',1)=='x+2=5' and '3' in v
            result['browserErrors']=errors
            result['after']=page.evaluate(SNAPSHOT)
            data=result.get('gesture',result['after'])
            downs=sum(e['type']=='pointerdown' for e in data.get('events',[]))
            delivered=sum(e['type']=='pointerdown' for e in data.get('delivered',[]))
            if not result['ok']:
                if name=='previous-line-hit':
                    result['diagnosis']='Edit button is not receiving the hit; inspect hit stack and pointerEvents.'
                elif downs and not delivered:
                    result['diagnosis']='DOM pointerdown arrived but canvas handler did not: overlay/shadow-root interception.'
                else:
                    result['diagnosis']='Canvas received gesture; inspect point offsets, atom bounds, stroke points and edit result.'
        except Exception as e:
            result.update(ok=False,error=str(e))
            try:
                result['after']=page.evaluate(SNAPSHOT)
            except Exception:
                pass
        finally:
            context.close()
    report['seconds']=round(time.monotonic()-started,3)
    report['ok']=all(p['ok'] for p in report['probes'])
    return report


def print_report(report, path):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(report,indent=2)+'\n')
    # All useful evidence fits in one tool output; full event paths remain in JSON.
    for p in report['probes']:
        data=p.get('gesture',p.get('after',{}))
        print(json.dumps({k:v for k,v in {
            'probe':p['name'],'ok':p['ok'],'diagnosis':p.get('diagnosis'),
            'error':p.get('error'),'browserErrors':p.get('browserErrors'),'value':p.get('value'),'hit':p.get('hit',data.get('hits')),
            'canvasDelivery':data.get('delivered'),'domTargets':sorted(set(e['target'] for e in data.get('events',[]))),
            'fieldsBefore':p.get('before',{}).get('fields'),'strokesAfter':data.get('strokes'),
            'editButtons':p.get('target',p.get('after',{}).get('editButtons'))}.items() if v is not None}))
    print(f"Ink diagnostics: {report['seconds']:.3f}s; full report: {path}")


def check_with_diagnostics(browser, url, check, path):
    """Preserve the original failure even if diagnostic collection also fails."""
    try:
        check()
    except Exception:
        try:
            print_report(run_diagnostics(browser, url), path)
        except Exception as diagnostic_error:
            print(f'Ink diagnostic runner failed: {diagnostic_error}')
        raise
