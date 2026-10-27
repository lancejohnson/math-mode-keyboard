// Kelly course page: one part at a time (#intuition, #derive, #invest, #variants), blocks revealed in order.
// Typed answers use the same math keyboard as the workspace (kb.js); every answer box also has Write (ink-answer.js).
import { MathfieldElement } from '../vendor/mathlive.min.mjs';
import { ComputeEngine } from '../vendor/compute/compute-engine.js';
import { createKeyboard } from '../kb.js?v=1';
import { mountWrite } from '../ink-answer.js?v=3';
import { PARTS } from './content.js?v=1';
import { growth, kelly, growthInvest, kellyInvest, simulate, median, drawdown, readNumber, sameExpression, sameEquation, setup } from './kelly.js?v=1';

MathfieldElement.fontsDirectory = new URL('../vendor/fonts', import.meta.url).href;
MathfieldElement.soundsDirectory = null; MathfieldElement.keypressSound = null; MathfieldElement.plonkSound = null;
const ce = setup(new ComputeEngine());
const $ = s => document.querySelector(s), kb = $('#kb');
const KEY = 'kelly-v1';
let prog = {}; try { prog = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { }
prog.reached ||= {}; prog.done ||= [];
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(prog)); } catch { } };
const COL = { line: '#74c0fc', peak: '#f783ac', right: '#8ce99a', slow: '#91a7ff', muted: '#8b93a5', rule: '#2a2f3a', key: '#3a3f4b', ink: '#e8eaf0', violet: '#b197fc', bg: '#1a1d24' };

// The workspace keyboard, unchanged. It shares the workspace's numpad layout choice (mathmode-v1).
let active = null, onEnter = null;
const ws = () => { try { return JSON.parse(localStorage.getItem('mathmode-v1')) || {}; } catch { return {}; } };
const keyboard = createKeyboard(kb, {
  active: () => active,
  getLayout: () => ws().layout || 'big',
  setLayout: l => { const s = ws(); s.layout = l; try { localStorage.setItem('mathmode-v1', JSON.stringify(s)); } catch { } },
  special: v => { if (v === '@next' || v === '@copyNext') { onEnter?.(); return true; } return false; },
  afterRender: () => reveal(),
});
// The keyboard is fixed over the bottom of the page: room is made under the page for it, then the answer row and its
// buttons are scrolled to sit just above it (scrollIntoView doesn't know the keyboard is there: bug 2026-10-27).
function reveal() {
  if (!active || kb.hidden) return;
  document.body.style.paddingBottom = kb.offsetHeight + 24 + 'px';
  const row = active.closest('.ansRow') || active, acts = row.parentElement?.querySelector(':scope > .acts');
  const top = row.getBoundingClientRect().top, bottom = Math.max(row.getBoundingClientRect().bottom, acts?.getBoundingClientRect().bottom ?? 0);
  const room = kb.getBoundingClientRect().top - 12, over = bottom - room;
  if (over > 0) scrollBy(0, Math.min(over, top - 8));
  else if (top < 8) scrollBy(0, top - 8);
}
// The keyboard's own ⌄ button hides it directly.
new MutationObserver(() => { if (kb.hidden) document.body.style.paddingBottom = ''; }).observe(kb, { attributes: true, attributeFilter: ['hidden'] });
const hideKb = () => { active?.blur(); active = null; kb.hidden = true; };
// Tapping elsewhere closes the keyboard, but not the answer's own buttons: closing it there would shift the page mid-tap.
document.addEventListener('pointerdown', e => { if (!kb.hidden && !e.target.closest('#kb, math-field, .acts, .switch')) hideKb(); });
function field(onSubmit) {
  const f = new MathfieldElement(); f.mathVirtualKeyboardPolicy = 'manual'; f.smartFence = true; f.smartMode = false; f.popoverPolicy = 'off';
  f.setAttribute('aria-label', 'Your answer');
  f.addEventListener('focus', () => { active = f; onEnter = onSubmit; kb.hidden = false; keyboard.render(); });
  f.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); onSubmit(); } });
  return f;
}

// ---- page ----
const partIx = () => Math.max(0, PARTS.findIndex(p => p.id === location.hash.slice(1)));
function tabs(cur) {
  $('#parts').innerHTML = PARTS.map((p, i) => `<a href="#${p.id}" class="${i === cur ? 'on' : ''} ${prog.done.includes(p.id) ? 'done' : ''}"${i === cur ? ' aria-current="step"' : ''}><i></i>${i + 1}. ${p.short}</a>`).join('');
  $('#partOf').textContent = `Part ${cur + 1} of ${PARTS.length}`;
}
let sims = [];
function render() {
  hideKb(); sims.forEach(s => s.stop?.()); sims = [];
  const ix = partIx(), part = PARTS[ix]; tabs(ix);
  const main = $('#part'); main.innerHTML = `<h1>${part.title}</h1><p class="dim">${part.blurb}</p>`;
  const reached = Math.min(prog.reached[part.id] ?? 0, part.blocks.length - 1);
  for (let i = 0; i <= reached; i++) block(part, i, i < reached || prog.done.includes(part.id), el => main.append(el));
}
addEventListener('hashchange', () => { render(); scrollTo(0, 0); });

// Shows block i. `past` = already done on an earlier visit: shown complete, no Continue button.
// `place` puts it in the page before it is filled: a math field must be mounted before its value is set.
function block(part, i, past, place) {
  const b = part.blocks[i], el = document.createElement('section'); el.className = 'block'; el.dataset.kind = b.kind; el.dataset.i = i; place(el);
  const last = i === part.blocks.length - 1;
  const advance = () => {
    el.querySelector('.cont')?.remove();
    if (last) return finish(part, el);
    prog.reached[part.id] = Math.max(prog.reached[part.id] ?? 0, i + 1); save();
    if (!el.nextElementSibling) { const n = block(part, i + 1, false, x => el.after(x)); requestAnimationFrame(() => n.scrollIntoView({ block: 'start', behavior: 'smooth' })); }
  };
  const cont = (label = 'Continue') => { if (past || el.querySelector('.cont')) return; const c = document.createElement('div'); c.className = 'acts cont'; c.innerHTML = `<button class="act">${label}</button>`; c.firstChild.onclick = advance; el.append(c); };
  if (b.kind === 'text') { el.innerHTML = b.html; cont(last ? 'Finish this part' : 'Continue'); }
  else if (b.kind === 'choice') choice(el, b, past, () => cont(last ? 'Finish this part' : 'Continue'));
  else if (b.kind === 'sim') { el.innerHTML = b.html + '<div class="simBox"></div>'; sims.push(SIMS[b.sim](el.querySelector('.simBox'))); cont(); }
  else if (b.kind === 'type') typed(el, b, past, () => cont(last ? 'Finish this part' : 'Continue'));
  else if (b.kind === 'drill') drill(el, b, past, () => cont(last ? 'Finish this part' : 'Continue'));
  if (past && last && prog.done.includes(part.id)) finish(part, el);
  return el;
}
function finish(part, el) {
  if (!prog.done.includes(part.id)) { prog.done.push(part.id); save(); tabs(partIx()); }
  if (el.parentElement?.querySelector('.next')) return;
  const ix = PARTS.indexOf(part), nx = PARTS[ix + 1], d = document.createElement('div'); d.className = 'next';
  d.innerHTML = `<p class="ok">✓ Part ${ix + 1} done.</p>` + (nx ? `<a class="btn btn--primary" href="#${nx.id}">Part ${ix + 2}: ${nx.title} →</a>` : `<a class="btn btn--primary" href="/">Back to Today</a>`);
  el.after(d);
}

function choice(el, b, past, done) {
  el.innerHTML = `<p class="ask">${b.prompt}</p><div class="opts choices text">${b.options.map((o, j) => `<button class="choice" data-j="${j}">${o}</button>`).join('')}</div><div class="fb"></div>`;
  const pickIt = j => {
    el.querySelectorAll('.choice').forEach((c, k) => { c.disabled = true; if (!b.any && k === b.answer) c.classList.add('right'); else if (k === j && (b.any || j !== b.answer)) c.classList.add(b.any ? 'picked' : 'wrong'); });
    const ok = b.any || j === b.answer;
    el.querySelector('.fb').innerHTML = b.any ? `<p>${b.after}</p>` : `<p class="${ok ? 'ok' : 'no'}">${ok ? '✓ Right.' : `✗ It's “${b.options[b.answer]}”.`}</p><p>${b.why}</p>`;
    prog[b.id] = j; save(); done();
  };
  el.querySelector('.opts').onclick = e => { const c = e.target.closest('.choice'); if (c && !c.disabled) pickIt(+c.dataset.j); };
  if (past && prog[b.id] != null) pickIt(prog[b.id]);
}

// An answer box: [label] [math field], with the Type / Write switch above it.
function answerBox(el, label, submit) {
  const row = document.createElement('div'); row.className = 'ansRow';
  if (label) row.innerHTML = `<span class="lbl">${label}</span>`;
  const f = field(submit); row.append(f); el.append(row);
  const acts = document.createElement('div'); acts.className = 'acts'; acts.innerHTML = '<button class="act chk">Check</button><button class="act alt hint">Hint</button><button class="act alt show" hidden>Show me</button>';
  el.append(acts); const fb = document.createElement('div'); fb.className = 'fb'; fb.setAttribute('aria-live', 'polite'); el.append(fb);
  acts.querySelector('.chk').onclick = submit;
  // Write: converted math lands in the answer field (shown above the canvas) and you keep writing to extend it, like the
  // workspace. Nothing is graded until Check, so a misread can be fixed with the keyboard first.
  let before = '';
  const write = mountWrite(row, { keepTyped: true, onLatex: l => { before = f.value; f.value = f.value ? f.value + l : l; }, onUndoConvert: () => { f.value = before; } });
  return { f, fb, acts, write };
}
const NOTE = { parse: 'I can\'t read that as maths yet. Check the brackets.', equation: 'Just the expression, please (no = sign).', noequals: 'This one needs an equation: something = something.', vars: v => `Use only the letters in the question (not ${v.join(', ')}).` };

function typed(el, b, past, done) {
  el.innerHTML = `<p class="ask">${b.prompt}</p>`;
  let tries = 0, solved = false;
  const box = answerBox(el, b.label, () => {
    if (solved) return;
    const r = (b.check === 'eq' ? sameEquation : sameExpression)(ce, box.f.value, b.target);
    if (r.ok) return win('✓ Right.');
    tries++;
    const note = r.why === 'vars' ? NOTE.vars(r.vars) : NOTE[r.why];
    box.fb.innerHTML = `<p class="no">✗ ${note || 'Not the same as the answer. Tried a few values of the letters and they didn\'t match.'}</p>`;
    if (tries >= 1) box.acts.querySelector('.hint').hidden = false;
    if (tries >= 2) box.acts.querySelector('.show').hidden = false;
  });
  box.acts.querySelector('.hint').onclick = () => { box.fb.insertAdjacentHTML('beforeend', `<p>${b.hint}</p>`); box.acts.querySelector('.hint').hidden = true; box.acts.querySelector('.show').hidden = false; };
  box.acts.querySelector('.show').onclick = () => { box.f.value = b.target; win('Here it is. Read it through, then carry on.'); };
  function win(msg) {
    solved = true; box.f.readOnly = true; hideKb(); box.write.done();
    box.fb.innerHTML = `<p class="ok">${msg}</p>`; box.acts.querySelectorAll('.hint,.show,.chk').forEach(x => x.hidden = true);
    prog[b.id] = box.f.value; save(); done();
  }
  if (past) { box.f.value = prog[b.id] ?? b.target; win('✓ Done earlier.'); }
}

function drill(el, b, past, done) {
  let right = 0, q = null;
  el.innerHTML = `<p class="ask">${b.prompt}</p><div class="progress small dots"></div><p class="q"></p>`;
  const dots = () => { el.querySelector('.dots').innerHTML = b.goal > 1 ? Array.from({ length: b.goal }, (_, k) => `<i class="${k < right ? 'ok' : ''}"></i>`).join('') : ''; };
  const box = answerBox(el, b.label, () => {
    if (!q || q.done) return;
    const v = readNumber(ce, box.f.value);
    if (Number.isNaN(v)) { box.fb.innerHTML = '<p class="no">Type a number, like 0.25 or 25%.</p>'; return; }
    const ok = Math.abs(v - q.ans) <= (b.tol ?? .005) * Math.max(1, Math.abs(q.ans)) || Math.abs(v - q.ans) < .0051;
    q.done = true; if (ok) right++; dots();
    box.fb.innerHTML = `<p class="${ok ? 'ok' : 'no'}">${ok ? '✓ Right.' : `✗ Not quite: ${+q.ans.toFixed(4)}.`}</p><p>${q.why}</p>`;
    if (right >= b.goal) { box.f.readOnly = true; hideKb(); box.write.done(); box.acts.querySelector('.chk').hidden = true; prog[b.id] = true; save(); done(); }
    else { const n = document.createElement('button'); n.className = 'act nxt'; n.textContent = 'Next question'; n.onclick = ask; box.acts.querySelector('.chk').hidden = true; box.acts.prepend(n); }
  });
  box.acts.querySelector('.hint').hidden = true;
  function ask() {
    q = b.fixed ? { ...b.fixed } : b.gen(); el.querySelector('.q').innerHTML = q.q; box.f.value = ''; box.fb.innerHTML = ''; box.write.clear();
    box.acts.querySelector('.nxt')?.remove(); box.acts.querySelector('.chk').hidden = false;
  }
  dots(); ask();
  if (past && prog[b.id]) { right = b.goal; dots(); q.done = true; box.f.value = String(+q.ans.toFixed(4)); box.f.readOnly = true; box.write.done(); box.acts.querySelector('.chk').hidden = true; box.fb.innerHTML = `<p class="ok">✓ Done earlier.</p><p>${q.why}</p>`; done(); }
}

// ---- simulations ----
function canvas(host, h = 220) {
  const cv = document.createElement('canvas'); host.append(cv); cv.style.height = h + 'px';
  const g = cv.getContext('2d');
  const fit = () => { const r = devicePixelRatio || 1, w = cv.clientWidth || 340; cv.width = w * r; cv.height = h * r; g.setTransform(r, 0, 0, r, 0, 0); return { w, h }; };
  return { cv, g, fit };
}
const slider = (host, label, min, max, step, value, fmt) => {
  const d = document.createElement('label'); d.className = 'ctl';
  d.innerHTML = `<span>${label}</span><input type="range" min="${min}" max="${max}" step="${step}" value="${value}"><output></output>`;
  host.append(d); const inp = d.querySelector('input'), out = d.querySelector('output'); const show = () => out.textContent = fmt(+inp.value); show();
  return { inp, get v() { return +inp.value; }, set v(x) { inp.value = x; show(); }, on(fn) { inp.addEventListener('input', () => { show(); fn(); }); } };
};
const P = x => `${Math.round(x * 100)}%`;
const money = x => x >= 1e6 ? `$${(x / 1e6).toFixed(1)}M` : x >= 1e4 ? `$${Math.round(x / 1e3)}k` : x >= 1 ? `$${Math.round(x)}` : x >= .01 ? `${Math.round(x * 100)}¢` : '≈ $0';
function axes(g, w, h, pad) { g.strokeStyle = COL.rule; g.lineWidth = 1; g.beginPath(); g.moveTo(pad.l, pad.t); g.lineTo(pad.l, h - pad.b); g.lineTo(w - pad.r, h - pad.b); g.stroke(); g.fillStyle = COL.muted; g.font = '600 11px Karla, system-ui'; }
// Wealth paths on a log scale, $1 to $1M-ish, starting at $100.
function drawPaths(c, sets) {
  const { w, h } = c.fit(), g = c.g, pad = { l: 40, r: 8, t: 8, b: 20 }, lo = -2, hi = 6; // log10 of $: 1¢ … $1M
  g.clearRect(0, 0, w, h); axes(g, w, h, pad);
  const n = sets[0].paths[0].length - 1, X = i => pad.l + (w - pad.l - pad.r) * i / n, Y = v => { const l = Math.log10(Math.max(v * 100, 10 ** lo)); return h - pad.b - (h - pad.t - pad.b) * (l - lo) / (hi - lo); };
  for (let e = lo; e <= hi; e += 2) { g.fillText(e === -2 ? '1¢' : e === 0 ? '$1' : e === 2 ? '$100' : e === 4 ? '$10k' : '$1M', 4, Y(10 ** e / 100) + 4); g.strokeStyle = COL.rule; g.beginPath(); g.moveTo(pad.l, Y(10 ** e / 100)); g.lineTo(w - pad.r, Y(10 ** e / 100)); g.stroke(); }
  g.fillText(`${n} bets`, w - pad.r - 44, h - 5);
  for (const s of sets) { g.strokeStyle = s.color; g.globalAlpha = s.alpha ?? .45; g.lineWidth = 1.4; for (const p of s.paths) { g.beginPath(); p.forEach((v, i) => i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))); g.stroke(); } }
  g.globalAlpha = 1;
}
function drawCurve(c, { fn, xmax, marks = [], extra = [], ylab = 'growth per bet', xoff = 0 }) {
  const { w, h } = c.fit(), g = c.g, pad = { l: 40, r: 10, t: 28, b: 22 };
  g.clearRect(0, 0, w, h);
  const xs = Array.from({ length: 201 }, (_, i) => xmax * i / 200), ys = [fn, ...extra.map(e => e.fn)].flatMap(f => xs.map(f)).filter(Number.isFinite);
  const top = Math.max(...ys, 1e-4) * 1.25, bot = Math.min(-top * .8, Math.max(Math.min(...ys), -top * 2.5));
  const X = x => pad.l + (w - pad.l - pad.r) * x / xmax, Y = y => pad.t + (h - pad.t - pad.b) * (top - y) / (top - bot);
  axes(g, w, h, pad); g.strokeStyle = COL.key; g.beginPath(); g.moveTo(pad.l, Y(0)); g.lineTo(w - pad.r, Y(0)); g.stroke();
  g.fillStyle = COL.muted; g.fillText('0', 26, Y(0) + 4); g.fillText(ylab, pad.l + 4, 16);
  // x labels: first left-aligned, last right-aligned so neither is clipped.
  for (let k = 0; k <= 4; k++) { g.textAlign = k === 0 ? 'left' : k === 4 ? 'right' : 'center'; g.fillText(P(xoff + xmax * k / 4), X(xmax * k / 4), h - 6); }
  g.textAlign = 'left';
  for (const e of extra) { g.strokeStyle = e.color; g.lineWidth = 2; g.setLineDash([5, 4]); g.beginPath(); let up = false; xs.forEach(x => { const y = e.fn(x); if (!Number.isFinite(y) || y < bot) { up = false; return; } up ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); up = true; }); g.stroke(); g.setLineDash([]); }
  g.strokeStyle = COL.line; g.lineWidth = 3; g.beginPath(); let up = false;
  xs.forEach(x => { const y = fn(x); if (!Number.isFinite(y) || y < bot) { up = false; return; } up ? g.lineTo(X(x), Y(y)) : g.moveTo(X(x), Y(y)); up = true; }); g.stroke();
  for (const m of marks) { if (!(m.x >= 0 && m.x <= xmax)) continue; const y = fn(m.x); g.fillStyle = m.color; g.beginPath(); g.arc(X(m.x), Y(Math.max(y, bot)), 6, 0, 7); g.fill(); g.font = '600 12px Karla, system-ui'; g.strokeStyle = COL.bg; g.lineWidth = 4; g.lineJoin = 'round'; g.strokeText(m.label, Math.min(X(m.x) + 8, w - 90), Y(Math.max(y, bot)) - 8); g.fillText(m.label, Math.min(X(m.x) + 8, w - 90), Y(Math.max(y, bot)) - 8); }
}
const stats = (host, cells) => { host.innerHTML = cells.map(([v, l]) => `<div><b>${v}</b><small>${l}</small></div>`).join(''); };
const onResize = fn => { addEventListener('resize', fn); return { stop: () => removeEventListener('resize', fn) }; };

const SIMS = {
  coin(host) {
    const c = canvas(host), f = slider(host, 'Stake', 0, 1, .01, .5, P), pre = document.createElement('div'); pre.className = 'presets';
    pre.innerHTML = [[1, 'All'], [.6, '60%'], [.4, '40%'], [.2, '20%'], [.05, '5%']].map(([v, l]) => `<button class="chip" data-v="${v}">${l}</button>`).join(''); host.append(pre);
    const st = document.createElement('div'); st.className = 'stats'; host.append(st);
    const draw = () => {
      const paths = simulate({ f: f.v, p: .6, b: 1, n: 200, paths: 24 }), ends = paths.map(w => w.at(-1) * 100);
      drawPaths(c, [{ paths, color: COL.line }]);
      stats(st, [[money(median(ends)), 'typical player ends with'], [`${ends.filter(x => x < 100).length}/24`, 'end below $100'], [`${(growth(f.v, .6, 1) * 100).toFixed(1)}%`, 'growth per bet, G(f)']]);
      pre.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.v === f.v)));
    };
    f.on(draw); pre.onclick = e => { const b = e.target.closest('[data-v]'); if (b) { f.v = +b.dataset.v; draw(); } };
    requestAnimationFrame(draw); return onResize(draw);
  },
  curve(host) {
    const c = canvas(host), p = slider(host, 'Win chance p', .5, .9, .01, .6, P), b = slider(host, 'Pays b', .5, 4, .1, 1, x => x.toFixed(1)), note = document.createElement('p'); note.className = 'dim'; host.append(note);
    const draw = () => {
      const k = kelly(p.v, b.v);
      drawCurve(c, { fn: x => growth(x, p.v, b.v), xmax: 1, marks: k > 0 ? [{ x: k, label: `Kelly ${P(k)}`, color: COL.peak }, ...(2 * k < 1 ? [{ x: 2 * k, label: `2× ${P(2 * k)}`, color: COL.slow }] : [])] : [] });
      note.textContent = k > 0 ? `Peak at f* = ${P(k)}: about ${(growth(k, p.v, b.v) * 100).toFixed(2)}% growth a bet.` : 'No edge: every stake shrinks you. Don\'t bet.';
    };
    p.on(draw); b.on(draw); requestAnimationFrame(draw); return onResize(draw);
  },
  invest(host) {
    const c = canvas(host), mu = slider(host, 'Return μ', .02, .15, .005, .08, P), r = slider(host, 'Cash r', 0, .06, .005, .03, P), s = slider(host, 'Volatility σ', .08, .5, .01, .18, P);
    const note = document.createElement('p'); host.append(note);
    const draw = () => {
      const k = kellyInvest(mu.v, r.v, s.v), xmax = Math.max(2, Math.min(4, Math.ceil(k * 1.6)));
      drawCurve(c, { fn: x => growthInvest(x, mu.v, r.v, s.v), xmax, ylab: 'growth a year', marks: k > 0 ? [{ x: k, label: `Kelly ${P(k)}`, color: COL.peak }] : [] });
      note.innerHTML = k > 0 ? `f* = (${P(mu.v)} − ${P(r.v)}) / ${P(s.v)}² = <b>${P(k)}</b>${k > 1 ? ', which means borrowing' : ''}. Best growth ${(growthInvest(k, mu.v, r.v, s.v) * 100).toFixed(1)}% a year.` : 'The stock doesn\'t beat cash: hold none of it.';
    };
    [mu, r, s].forEach(x => x.on(draw)); requestAnimationFrame(draw); return onResize(draw);
  },
  half(host) {
    const c = canvas(host, 240), lg = document.createElement('div'); lg.className = 'legend'; host.append(lg);
    const st = document.createElement('div'); st.className = 'stats'; host.append(st);
    const sel = document.createElement('div'); sel.className = 'presets'; sel.innerHTML = '<button class="chip" data-c=".5" aria-pressed="true">Half Kelly</button><button class="chip" data-c="1">Full Kelly</button><button class="chip" data-c="2">Double</button>'; host.prepend(sel);
    let cc = .5;
    const draw = () => {
      const f = .2 * cc, paths = simulate({ f, p: .6, b: 1, n: 500, paths: 40, seed: 11 }), ends = paths.map(w => w.at(-1) * 100), dds = paths.map(drawdown);
      drawPaths(c, [{ paths, color: cc === 1 ? COL.line : cc < 1 ? COL.right : COL.peak, alpha: .35 }]);
      lg.innerHTML = `<span>Stake ${P(f)} of the money each bet (${cc === .5 ? 'half' : cc === 1 ? 'full' : 'double'} Kelly).</span>`;
      stats(st, [[money(median(ends)), 'typical player ends with'], [P(median(dds)), 'typical worst fall from a high'], [`${dds.filter(x => x >= .5).length}/40`, 'at some point lose half']]);
      sel.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.c === cc)));
    };
    sel.onclick = e => { const b = e.target.closest('[data-c]'); if (b) { cc = +b.dataset.c; draw(); } };
    requestAnimationFrame(draw); return onResize(draw);
  },
  edge(host) {
    const c = canvas(host), bel = slider(host, 'You believe p', .51, .8, .01, .6, P), note = document.createElement('p'); host.append(note);
    const draw = () => {
      const f = kelly(bel.v, 1);
      drawCurve(c, { fn: tp => growth(f, .5 + tp, 1), xmax: .3, ylab: 'your growth per bet', xoff: .5, marks: [{ x: bel.v - .5, label: 'p as you believe', color: COL.peak }], extra: [{ fn: tp => growth(Math.max(0, kelly(.5 + tp, 1)), .5 + tp, 1), color: COL.right }] });
      note.innerHTML = `You stake ${P(f)}. Across the bottom is the true p. The dashed green line is what you'd get if you knew it. If the true p is under ${P(.5 + (bel.v - .5) / 2)}, you are more than twice Kelly and shrinking.`;
    };
    bel.on(draw); requestAnimationFrame(draw); return onResize(draw);
  },
};

render();
