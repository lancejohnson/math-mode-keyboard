// Type / Write switch for any answer box. Write = a small pen canvas; the cropped ink goes to the same
// reader the workspace uses (/api/recognize, private link only) and comes back as LaTeX.
// mountWrite(host, typeEl, { onLatex(latex), hint }) puts the switch above typeEl and the canvas after it.
// The choice is remembered for every page (localStorage 'mathmode-input').
import { inkImage } from './recognition.js?v=9';

const KEY = 'mathmode-input';
const wanted = () => { try { return localStorage.getItem(KEY) === 'write' ? 'write' : 'type'; } catch { return 'type'; } };
let status = null;
const all = new Set();   // every switch on the page flips together
const access = () => (status ??= fetch('/api/status', { signal: AbortSignal.timeout(8000) }).then(r => r.json()).catch(() => ({ authorized: false })));

// LaTeX from the reader -> the plain text the fact checker and the number parser expect (π/3, √2/2, −1/2, 135).
export function latexToPlain(t) {
  let s = String(t || '');
  for (let i = 0; i < 4; i++) s = s.replace(/\\[dt]?frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)').replace(/\\sqrt\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\\left|\\right|\\,|\\;|\\!|\\ /g, '').replace(/\\pi/g, 'π').replace(/\^\{?\\circ\}?|°/g, '').replace(/\\text\{\s*undefined\s*\}|\\mathrm\{undefined\}/g, 'undefined')
    .replace(/\\cdot|\\times/g, '*').replace(/[{}\s]/g, '').replace(/-/g, '−');
  // Drop brackets around a single token: (π)/(3) -> π/3, √(2) -> √2.
  s = s.replace(/\(([0-9]+|π|[0-9]+π|√[0-9]+)\)/g, '$1').replace(/\(([0-9]+|π|[0-9]+π|√[0-9]+)\)/g, '$1');
  return s;
}

export function mountWrite(typeEl, { onLatex, hint = 'Write your answer, then tap Read.' } = {}) {
  const sw = document.createElement('div');
  sw.className = 'switch'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Answer by');
  sw.innerHTML = '<button type="button" data-m="type">Type</button><button type="button" data-m="write">Write</button>';
  const pane = document.createElement('div');
  pane.className = 'writePane'; pane.hidden = true;
  pane.innerHTML = `<p class="read" aria-live="polite"><span class="dim">${hint}</span></p><canvas class="writeInk" aria-label="Write your answer here"></canvas>
    <div class="row"><button type="button" class="act alt" data-a="clear">Clear</button><button type="button" class="act" data-a="read">Read</button></div>`;
  typeEl.before(sw); typeEl.after(pane);
  const cv = pane.querySelector('canvas'), g = cv.getContext('2d'), read = pane.querySelector('.read');
  let strokes = [], cur = null, mode = 'type', on = true, busy = false;
  const size = () => { const w = cv.clientWidth || 340, h = cv.clientHeight || 180, r = devicePixelRatio || 1; cv.width = w * r; cv.height = h * r; g.setTransform(r, 0, 0, r, 0, 0); draw(); };
  function draw() {
    g.clearRect(0, 0, cv.width, cv.height); g.lineCap = g.lineJoin = 'round'; g.lineWidth = 3; g.strokeStyle = getComputedStyle(cv).color;
    for (const s of strokes) { g.beginPath(); s.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y)); if (s.pts.length === 1) g.lineTo(s.pts[0][0] + .1, s.pts[0][1]); g.stroke(); }
  }
  const at = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { if (!on) return; e.preventDefault(); cv.setPointerCapture(e.pointerId); cur = { pts: [at(e)], width: 3 }; strokes.push(cur); draw(); });
  cv.addEventListener('pointermove', e => { if (!cur) return; for (const p of e.getCoalescedEvents?.() || [e]) cur.pts.push(at(p)); draw(); });
  const up = () => { cur = null; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const say = (html, cls = '') => { read.className = 'read ' + cls; read.innerHTML = html; };
  async function doRead() {
    if (busy || !on) return; if (!strokes.length) return say('Write something first.', 'no');
    const st = await access();
    if (!st.authorized) return say('Handwriting needs your private recognition link (open it once in this app). Type for now.', 'no');
    busy = true; say('Reading…');
    try {
      const r = await fetch('/api/recognize', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Math-Mode': '1' }, body: JSON.stringify({ image: inkImage(strokes) }), signal: AbortSignal.timeout(30000) });
      const out = await r.json(); if (!r.ok) throw new Error(out.error || 'Could not read it.');
      const latex = (out.lines || []).map(l => l.latex).join(' ').trim(); if (!latex) throw new Error('No readable math found. Try again, a little bigger.');
      say(`Read as <b class="readAs">${latexToPlain(latex).replace(/</g, '&lt;')}</b>`); onLatex?.(latex);
    } catch (err) { say(err.name === 'TimeoutError' ? 'Reading timed out. Try again.' : err.message, 'no'); }
    finally { busy = false; }
  }
  pane.addEventListener('click', e => { const a = e.target.closest('[data-a]')?.dataset.a; if (a === 'clear') api.clear(); if (a === 'read') doRead(); });
  sw.addEventListener('click', e => { const m = e.target.closest('[data-m]')?.dataset.m; if (m) { try { localStorage.setItem(KEY, m); } catch { } for (const a of all) a.set(m); } });
  addEventListener('resize', () => { if (mode === 'write') size(); });
  const api = {
    get mode() { return mode; },
    set(m) {
      mode = m; for (const b of sw.children) b.setAttribute('aria-pressed', String(b.dataset.m === m));
      typeEl.classList.toggle('typeOff', m === 'write'); pane.hidden = m !== 'write' || sw.hidden;
      if (m === 'write') requestAnimationFrame(size);
    },
    clear() { strokes = []; draw(); say(`<span class="dim">${hint}</span>`); },
    // Show/hide the switch and canvas together with the answer box they belong to.
    show(v) { sw.hidden = !v; pane.hidden = !v || mode !== 'write'; if (v && mode === 'write') requestAnimationFrame(size); },
    lock(v) { on = !v; pane.classList.toggle('locked', v); },
    // Answered: show the answer box with its value, drop the switch and canvas, stop following the page's switches.
    done() { all.delete(api); sw.hidden = true; pane.hidden = true; typeEl.classList.remove('typeOff'); on = false; },
    read: doRead, strokes: () => strokes,
  };
  all.add(api); api.set(wanted());
  return api;
}
