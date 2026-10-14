// Small-topic practice engine for the trigonometry course.
// A unit is a list of topics. Each topic: a short stepped lesson (one idea, shown on the circle, with
// "your turn" drags), then practice until the learner gets GOAL right. Questions are answered by turning the dot,
// tapping a choice, or typing on a small math pad — never by reading ahead.
export const PI = Math.PI, TAU = 2 * PI, D = d => d * PI / 180;
export const C = { pink: '#f783ac', blue: '#74c0fc', green: '#8ce99a', amber: '#ffd43b', violet: '#b197fc', orange: '#ff922b', ink: '#e8eaf0', dim: '#7d879c' };
const $ = s => document.querySelector(s);
const gcd = (a, b) => b ? gcd(b, a % b) : a;
export const minus = s => String(s).replace(/^-/, '−');
export const dec = t => minus((Math.round(t * 100) / 100).toString());
export function piFrac(t) {
  const k = Math.round(t / (PI / 12)); if (Math.abs(t - k * PI / 12) > 1e-6) return null; if (!k) return '0';
  const g = gcd(Math.abs(k), 12), n = k / g, d = 12 / g;
  return (n < 0 ? '−' : '') + (Math.abs(n) === 1 ? '' : Math.abs(n)) + 'π' + (d === 1 ? '' : '/' + d);
}
export const deg = t => minus(Math.round(t * 180 / PI)) + '°';
export const rad = t => piFrac(t) ?? dec(t);
export const norm = t => ((t % TAU) + TAU) % TAU;
export const same = (a, b) => Math.abs(a - b) < 1e-6;
export const pick = a => a[Math.floor(Math.random() * a.length)];
export const shuffle = a => a.map(v => [Math.random(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
// Four options: the answer plus three distinct distractors from a pool.
export function options(answer, pool, fmt = String) {
  const others = shuffle([...new Set(pool.map(fmt))].filter(s => s !== fmt(answer))).slice(0, 3);
  const opts = shuffle([fmt(answer), ...others]); return { choices: opts, answer: opts.indexOf(fmt(answer)) };
}
export function parseAns(s) {
  s = String(s).trim().replace(/°|degrees?|deg|cm|radians?|rad/gi, '').replace(/[−–]/g, '-').replace(/pi/gi, 'π').replace(/×/g, '*').replace(/÷/g, '/').trim();
  if (!s || !/^[\d.+\-*/()\sπ]+$/.test(s)) return NaN;
  s = s.replace(/(\d|\)|π)\s*(?=[π(])/g, '$1*').replace(/π\s*(?=[\d])/g, 'π*').replace(/π/g, '(Math.PI)');
  try { const v = Function('"use strict";return (' + s + ')')(); return typeof v === 'number' && isFinite(v) ? v : NaN; } catch { return NaN; }
}

// The circle. Angles are counterclockwise from 3 o'clock; `cur` is unwrapped so it can go negative or past a full turn.
export class Wheel {
  constructor(canvas) {
    this.c = canvas; this.s = {}; addEventListener('resize', () => this.fit()); this.fit();
    let prev = null, raw = 0;
    const loc = e => { const b = this.c.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
    const move = e => {
      if (prev === null) return; const [x, y] = loc(e); if (Math.hypot(x - this.cx, y - this.cy) < this.R * .15) return;
      const a = Math.atan2(this.cy - y, x - this.cx); let d = a - prev; d = ((d + PI) % TAU + TAU) % TAU - PI; raw += d; prev = a;
      raw = Math.max(-1.5 * TAU, Math.min(2.5 * TAU, raw)); const sn = this.s.snap || PI / 12; this.s.cur = Math.round(raw / sn) * sn; this.render(); this.onturn?.();
    };
    this.c.addEventListener('pointerdown', e => { if (!this.s.drag) return; const [x, y] = loc(e); prev = Math.atan2(this.cy - y, x - this.cx); raw = this.s.cur; this.c.setPointerCapture(e.pointerId); e.preventDefault(); });
    this.c.addEventListener('pointermove', move);
    this.c.addEventListener('pointerup', e => { move(e); prev = null; });
    this.c.addEventListener('pointercancel', () => prev = null);
  }
  fit() {
    const p = this.c.parentElement; if (!p.clientWidth) return; const st = getComputedStyle(p), w = Math.min(p.clientWidth - parseFloat(st.paddingLeft) - parseFloat(st.paddingRight), 460),
      h = Math.round(Math.min(w * .82, 330)), d = devicePixelRatio || 1;
    Object.assign(this.c.style, { width: w + 'px', height: h + 'px' }); this.c.width = w * d; this.c.height = h * d;
    this.w = w; this.h = h; this.cx = w / 2; this.cy = h / 2; this.R = Math.min(w, h) * .38;
    this.g = this.c.getContext('2d'); this.g.setTransform(d, 0, 0, d, 0, 0); this.render();
  }
  set(s) { this.s = s; this.render(); }
  P(t, r = this.R) { return [this.cx + r * Math.cos(t), this.cy - r * Math.sin(t)]; }
  client(t, f = 1) { const b = this.c.getBoundingClientRect(), [x, y] = this.P(t, this.R * f); return [b.left + x, b.top + y]; }
  ray(t, color, width = 3, dash = []) { const g = this.g, [x, y] = this.P(t); g.save(); g.strokeStyle = color; g.lineWidth = width; g.setLineDash(dash); g.beginPath(); g.moveTo(this.cx, this.cy); g.lineTo(x, y); g.stroke(); g.restore(); }
  turn(t, color, r = this.R * .25) {
    if (Math.abs(t) < .02) return; const g = this.g, n = Math.ceil(Math.abs(t) * 30), rr = s => r + this.R * .1 * Math.abs(s) / TAU;
    g.save(); g.strokeStyle = color; g.lineWidth = 2.5; g.beginPath();
    for (let i = 0; i <= n; i++) { const s = t * i / n, [x, y] = this.P(s, rr(s)); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    const [x, y] = this.P(t, rr(t)), sg = Math.sign(t), dx = -Math.sin(t) * sg, dy = -Math.cos(t) * sg;
    g.fillStyle = color; g.beginPath(); g.moveTo(x + dx * 9, y + dy * 9); g.lineTo(x - dx * 2 + dy * 6, y - dy * 2 - dx * 6); g.lineTo(x - dx * 2 - dy * 6, y - dy * 2 + dx * 6); g.fill(); g.restore();
  }
  string(t) {
    const g = this.g, n = Math.max(2, Math.ceil(Math.abs(t) * 40)), rr = s => this.R + 6 * Math.abs(s) / TAU; g.save(); g.strokeStyle = C.blue; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath();
    for (let i = 0; i <= n; i++) { const s = t * i / n, [x, y] = this.P(s, rr(s)); i ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
    g.fillStyle = C.blue; g.font = '600 12px system-ui'; g.textAlign = 'center';
    for (let i = 1; i <= Math.floor(Math.abs(t) + 1e-9); i++) {
      const s = Math.sign(t) * i, [a, b] = this.P(s, rr(s) - 8), [c, d] = this.P(s, rr(s) + 8), [lx, ly] = this.P(s, rr(s) + 18);
      g.strokeStyle = '#10131a'; g.lineWidth = 3; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); g.fillText(i, lx, ly + 4);
    } g.restore();
  }
  text(s, x, y, color, size = 14) {
    const g = this.g; g.font = `600 ${size}px system-ui`; const w = g.measureText(s).width; x = Math.max(4, Math.min(this.w - w - 4, x - w / 2)); y = Math.max(size + 2, Math.min(this.h - 6, y));
    g.fillStyle = '#10131acc'; g.fillRect(x - 4, y - size, w + 8, size + 6); g.fillStyle = color; g.fillText(s, x, y);
  }
  label(t, s, color, f = .62) { const [x, y] = this.P(t, this.R * f + 8 * Math.abs(t) / TAU), side = Math.abs(Math.sin(t)) < .5 ? -12 : 5; this.text(s, x, y + side, color); }
  render() {
    const g = this.g, s = this.s; if (!g) return; g.clearRect(0, 0, this.w, this.h);
    g.strokeStyle = '#262d3d'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(this.cx - this.R * 1.25, this.cy); g.lineTo(this.cx + this.R * 1.25, this.cy); g.moveTo(this.cx, this.cy - this.R * 1.25); g.lineTo(this.cx, this.cy + this.R * 1.25); g.stroke();
    g.strokeStyle = '#4a5470'; g.lineWidth = 2; g.beginPath(); g.arc(this.cx, this.cy, this.R, 0, TAU); g.stroke();
    if (s.grid) for (let t = 0; t < TAU - 1e-9; t += s.grid) { const [a, b] = this.P(t, this.R - 7), [c, d] = this.P(t, this.R + 7); g.strokeStyle = '#7d879c'; g.lineWidth = 2; g.beginPath(); g.moveTo(a, b); g.lineTo(c, d); g.stroke(); }
    this.ray(0, '#7d879c', 2); { const [x, y] = this.P(0, this.R + 16); g.fillStyle = C.dim; g.font = '11px system-ui'; g.fillText('start', x - 12, y + 18); }
    if (s.target !== undefined) { this.ray(s.target, C.green, 3, [8, 6]); this.turn(s.target, C.green, this.R * .4); if (s.targetLabel) this.label(s.target, s.targetLabel, C.green, 1.12); }
    for (const sh of s.show || []) { if (sh.string) this.string(sh.t); this.turn(sh.t, sh.color || C.violet); this.ray(sh.t, C.ink, 3); if (sh.label) this.label(sh.t, sh.label, sh.color || C.ink); }
    if (s.cur !== undefined) {
      if (s.string) this.string(s.cur); this.turn(s.cur, s.cur >= 0 ? C.violet : C.orange); this.ray(s.cur, C.ink, 3);
      const [x, y] = this.P(s.cur); g.fillStyle = C.pink; g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
      if (s.drag) { g.strokeStyle = C.pink; g.lineWidth = 2; g.beginPath(); g.arc(x, y, 17, 0, TAU); g.stroke(); }
      if (s.curLabel) this.label(s.cur, s.curLabel, s.cur >= 0 ? C.violet : C.orange);
    }
  }
  // Animate the dot from 0 to t, then label it.
  play(t, extra = {}, ms = 1100) {
    cancelAnimationFrame(this.anim); const t0 = performance.now();
    const step = now => { const u = Math.min(1, (now - t0) / ms), e = 1 - (1 - u) ** 2; this.set({ ...extra, cur: t * e, curLabel: u === 1 ? extra.curLabel : '' }); if (u < 1) this.anim = requestAnimationFrame(step); };
    this.anim = requestAnimationFrame(step);
  }
}

// A compact math pad, so the phone keyboard never opens.
export function mountPad(el, out, onEnter) {
  const keys = ['7', '8', '9', 'π', '⌫', '4', '5', '6', '/', '−', '1', '2', '3', '0', '.'];
  el.innerHTML = keys.map(k => `<button type="button" data-k="${k}">${k}</button>`).join('');
  let v = ''; const draw = () => { out.textContent = v || ' '; out.classList.toggle('empty', !v); };
  el.onclick = e => { const k = e.target.closest('button')?.dataset.k; if (!k) return; v = k === '⌫' ? v.slice(0, -1) : (v + k).slice(0, 12); draw(); };
  draw(); return { get value() { return v; }, set value(s) { v = s; draw(); } };
}

export function runUnit({ unit, topics, storeKey, nextHref }) {
  const GOAL = 4, wheel = new Wheel($('#wheel')), pad = mountPad($('#pad'), $('#padOut'));
  let prog = {}; try { prog = JSON.parse(localStorage.getItem(storeKey)) || {}; } catch { }
  prog.done ||= [];
  const save = () => { try { localStorage.setItem(storeKey, JSON.stringify(prog)); } catch { } };
  let ti = 0, q = null, right = 0, tries = 0, phase = 'learn', last = '';
  const T = () => topics[ti];

  function list() {
    $('#topicView').hidden = true; $('#listView').hidden = false; cancelAnimationFrame(wheel.anim);
    $('#topicList').innerHTML = topics.map((t, i) => {
      const done = prog.done.includes(t.id), open = done || i === 0 || prog.done.includes(topics[i - 1].id);
      return `<button class="topic ${done ? 'done' : ''}" data-i="${i}" ${open ? '' : 'disabled'}><b>${done ? '✓' : i + 1}</b>${t.title}<small>${done ? 'Mastered' : open ? 'Start →' : 'Locked'}</small></button>`;
    }).join('');
    const n = prog.done.length; $('#unitBar').innerHTML = topics.map(t => `<i class="${prog.done.includes(t.id) ? 'ok' : ''}"></i>`).join('');
    $('#unitStatus').textContent = n === topics.length ? 'Unit complete.' : `${n} of ${topics.length} topics mastered`;
  }
  $('#topicList').onclick = e => { const b = e.target.closest('.topic'); if (b && !b.disabled) open(+b.dataset.i); };
  $('#back').onclick = () => list();

  let si = 0;
  function open(i) {
    ti = i; right = 0; tries = 0; phase = 'learn'; $('#listView').hidden = true; $('#topicView').hidden = false; scrollTo(0, 0);
    $('#topicNum').textContent = `Topic ${i + 1} of ${topics.length} · Lesson`; $('#topicTitle').textContent = T().title;
    wheel.fit(); $('#learn').innerHTML = T().learn; $('#learn').hidden = true; $('#learnAgain').hidden = true;
    $('#lesson').hidden = false; $('#lessonTop').hidden = false; $('#practice').hidden = true; $('#done').hidden = true; step(0);
  }
  // The lesson: a few short screens, each with the circle showing one thing, and "your turn" steps
  // where the learner drags the dot and the lesson waits until it is right.
  function step(k) {
    const L = T().lesson; si = Math.max(0, Math.min(L.length - 1, k)); const st = L[si], grid = st.grid ?? T().grid;
    $('#stepDots').innerHTML = L.map((_, j) => `<i class="${j < si ? 'ok' : j === si ? 'now' : ''}"></i>`).join('');
    $('#say').innerHTML = st.say; $('#tryMsg').innerHTML = ''; $('#stepBack').disabled = si === 0;
    $('#stepNext').textContent = si === L.length - 1 ? 'Start practice →' : 'Next';
    $('#replay').hidden = !st.play; wheel.onturn = null; cancelAnimationFrame(wheel.anim);
    if (st.try) {
      const tr = st.try; $('#stepNext').disabled = true; $('#replay').hidden = true;
      wheel.set({ grid, snap: tr.snap ?? T().snap, string: tr.string, cur: 0, drag: true });
      $('#tryMsg').innerHTML = `<span class="dim">Drag the pink dot.</span>`;
      wheel.onturn = () => {
        const c = wheel.s.cur, ok = same(c, tr.t); $('#stepNext').disabled = !ok; wheel.s.curLabel = ok ? tr.label : ''; wheel.render();
        if (ok) { $('#tryMsg').innerHTML = `<span class="ok">✓ ${tr.done || 'That\'s it.'}</span>`; $('#stepNext').disabled = false; }
        else if (same(norm(c), norm(tr.t)) && c) $('#tryMsg').innerHTML = `<span class="no">Right spot, but ${Math.sign(c) !== Math.sign(tr.t) ? 'turn the other way' : 'count the full turns'}.</span>`;
        else $('#tryMsg').innerHTML = `<span class="dim">${tr.hint || 'Keep turning.'}</span>`;
      };
    } else {
      $('#stepNext').disabled = false; play();
    }
  }
  function play() {
    const st = T().lesson[si], grid = st.grid ?? T().grid;
    if (st.play) wheel.play(st.play.t, { grid, string: st.play.string, curLabel: st.play.label, show: st.show || [] }, st.play.ms || 1100);
    else wheel.set({ grid, show: st.show || [], cur: st.cur, curLabel: st.curLabel });
  }
  $('#replay').onclick = play;
  $('#stepBack').onclick = () => step(si - 1);
  $('#stepNext').onclick = () => { if (si < T().lesson.length - 1) step(si + 1); else startPractice(); };
  $('#learnAgain').onclick = () => { const h = !$('#learn').hidden; $('#learn').hidden = h; $('#learnAgain').textContent = h ? 'Show the key idea' : 'Hide the key idea'; };
  function startPractice() {
    phase = 'practice'; wheel.onturn = null; $('#lesson').hidden = true; $('#lessonTop').hidden = true; $('#topicNum').textContent = `Topic ${ti + 1} of ${topics.length} · Practice`;
    $('#learnAgain').hidden = false; $('#learnAgain').textContent = 'Show the key idea'; $('#practice').hidden = false; ask(); scrollTo(0, 0);
  }

  function bar() { $('#dots').innerHTML = Array.from({ length: GOAL }, (_, i) => `<i class="${i < right ? 'ok' : ''}"></i>`).join(''); $('#dotsText').textContent = `${right} of ${GOAL} right`; }
  function make(topic, force) {
    for (let k = 0; k < 8; k++) { const g = force ? topic.gens[force.gen] : pick(topic.gens), nq = g(force ? () => force.v : pick); if (force || nq.prompt !== last) return nq; }
    return pick(topic.gens)(pick);
  }
  function ask(force) {
    cancelAnimationFrame(wheel.anim); let topic = T(), review = false;
    // Mixed review: about one question in four comes from an earlier topic.
    if (!force && ti > 1 && Math.random() < .25) { topic = topics[Math.floor(Math.random() * ti)]; review = true; }
    q = make(topic, force); q.topic = topic; last = q.prompt;
    $('#qText').innerHTML = (review ? '<span class="tag">Review</span> ' : '') + q.prompt;
    $('#feedback').innerHTML = ''; $('#next').hidden = true; $('#check').hidden = q.type === 'choice'; $('#check').disabled = false;
    $('#choices').hidden = q.type !== 'choice'; $('#padWrap').hidden = q.type !== 'pad';
    if (q.type === 'choice') $('#choices').innerHTML = q.choices.map((c, i) => `<button class="choice" data-i="${i}">${c}</button>`).join('');
    if (q.type === 'pad') { pad.value = ''; $('#padUnit').textContent = q.unit || ''; }
    wheel.set(q.type === 'drag' ? { grid: q.grid ?? topic.grid, snap: q.snap ?? topic.snap, string: q.string, cur: 0, drag: true } : { grid: q.grid ?? topic.grid, show: q.show ? [q.show] : [] });
    bar();
  }
  function grade(ok, msg) {
    tries++; if (ok) right++;
    $('#feedback').innerHTML = ok ? `<p class="ok">✓ Right. ${q.why || ''}</p>` : `<p class="no">✗ ${msg || 'Not quite.'}</p><p>${q.why || ''}</p>`;
    $('#check').hidden = true; $('#choices').querySelectorAll('button').forEach(b => b.disabled = true); bar();
    if (right >= GOAL) {
      if (!prog.done.includes(T().id)) prog.done.push(T().id); save();
      $('#next').hidden = true; $('#done').hidden = false; const last = ti === topics.length - 1;
      $('#doneText').innerHTML = `Topic mastered in ${tries} question${tries > 1 ? 's' : ''}.` + (last ? ' That completes the unit.' : '');
      $('#nextTopic').textContent = last ? (nextHref ? 'Back to the course →' : 'Back to the unit') : 'Next topic →';
    } else { $('#next').hidden = false; $('#next').focus({ preventScroll: true }); }
    $('#feedback').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  $('#check').onclick = () => {
    if (q.type === 'drag') {
      const a = wheel.s.cur, t = q.t; let ok = same(a, t), msg = '';
      if (!ok && !q.exact && same(norm(a), norm(t)) && Math.sign(a) === Math.sign(t) && t !== 0) ok = true;
      if (!ok) {
        if (same(norm(a), norm(t))) msg = Math.sign(a) !== Math.sign(t) ? `That ends in the right place but you turned the wrong way: that's ${q.fmt(a)}. ${t > 0 ? 'Positive angles turn counterclockwise ↺.' : 'Negative angles turn clockwise ↻.'}` : `That ends in the right place, but this one needs ${Math.abs(t) > Math.abs(a) ? 'another' : 'one less'} full turn.`;
        else msg = a === 0 ? 'Drag the pink dot around the circle first.' : `You stopped at ${q.fmt(a)}.`;
        wheel.set({ ...wheel.s, drag: false, target: t, targetLabel: q.fmt(t), curLabel: a ? q.fmt(a) : '' });
      } else wheel.set({ ...wheel.s, drag: false, curLabel: q.fmt(t) });
      grade(ok, msg);
    } else if (q.type === 'pad') {
      const v = parseAns(pad.value); if (isNaN(v)) { $('#feedback').innerHTML = '<p class="no">Type a number, or use π like 3π/4.</p>'; return; }
      const ok = Math.abs(v - q.ans) <= (q.tol ?? .011 * Math.max(1, Math.abs(q.ans)));
      if (q.reveal !== undefined) wheel.set({ ...wheel.s, show: [{ t: q.reveal, label: q.revealLabel, color: C.green, string: q.string }] });
      grade(ok, ok ? '' : (q.hint?.(v) || `Not quite — the answer is ${q.answerText}.`));
    }
  };
  $('#choices').onclick = e => {
    const b = e.target.closest('.choice'); if (!b || b.disabled) return; const i = +b.dataset.i, ok = i === q.answer;
    $('#choices').querySelectorAll('.choice').forEach((c, j) => { if (j === q.answer) c.classList.add('right'); else if (j === i) c.classList.add('wrong'); });
    if (q.reveal !== undefined) wheel.set({ ...wheel.s, show: [{ t: q.reveal, label: q.revealLabel, color: C.green, string: q.string }] });
    grade(ok, ok ? '' : (q.hint?.(i) || `The answer is ${q.choices[q.answer]}.`));
  };
  $('#next').onclick = () => { ask(); $('#topicView').scrollIntoView({ behavior: 'smooth' }); };
  $('#nextTopic').onclick = () => { if (ti < topics.length - 1) open(ti + 1); else if (nextHref) location.href = nextHref; else list(); };
  $('#reset').onclick = () => { if (confirm('Clear your progress for this unit?')) { prog = { done: [] }; save(); list(); } };

  list();
  return { wheel, topics, step: () => T().lesson[si], si: () => si, q: () => q, right: () => right, open, ask: (gen, v) => ask({ gen, v }), prog: () => prog, parseAns, pad };
}
