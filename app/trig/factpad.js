// The fact keypad: typed answers for trig facts instead of multiple choice.
// Two layouts: angles (digits, π, /) and exact values (1 2 3 0, √, /, −, undefined).
// It submits by itself on a complete answer that nothing longer starts with (π/3, 135, √2/2), right or wrong,
// so that gives nothing away. Otherwise (30 could become 300, 1 could become 1/2) you tap ✓.
// The answer logic (what counts as complete, right, fast) lives in facts.js; this is only the keys.
import { kindOf, target, complete, tokens } from './facts.js?v=4';
const join = ts => (ts[0] === 'u' ? 'undefined' : ts.join(''));

const LAYOUT = {
  angle: ['7', '8', '9', 'π', '4', '5', '6', '/', '1', '2', '3', '⌫', '0:2', '✓:2'],
  value: ['1', '2', '3', '⌫', '√', '/', '−', '0', 'u:2', '✓:2'],
};
const LABEL = { u: 'undefined', '✓': '✓' };
// Physical keyboard: p = π, r or s = √, u = undefined, - = −.
const KEYMAP = { p: 'π', r: '√', s: '√', u: 'u', '-': '−', Backspace: '⌫', Enter: '✓' };

// el: an empty container. Returns { ask(card, { onSubmit(typed), onFirst() }), copy(onMatch), off(), value }.
export function mountFactPad(el) {
  el.classList.add('factPad');
  el.innerHTML = '<div class="padOut factOut"><span class="fv"></span><span class="dim fu"></span></div><div class="pad factKeys"></div>';
  const out = el.querySelector('.fv'), unit = el.querySelector('.fu'), keys = el.querySelector('.factKeys');
  let ts = [], mode = 'off', card = null, h = {}, layout = '';
  // After a miss, the box shows the right answer faintly until you start typing it.
  const draw = () => { const ghost = mode === 'copy' && !ts.length; out.textContent = ghost ? target(card) : join(ts) || ' '; out.classList.toggle('ghost', ghost); out.parentElement.classList.toggle('empty', !ts.length); out.parentElement.classList.toggle('copy', mode === 'copy'); };
  function lay(name) {
    if (name === layout) return; layout = name;
    keys.innerHTML = LAYOUT[name].map(k => { const [key, span] = k.split(':'); return `<button type="button" data-k="${key}" class="${span ? 'span2' : ''} ${key === '✓' ? 'ok' : ''}">${LABEL[key] || key}</button>`; }).join('');
  }
  function press(k) {
    if (mode === 'off') return;
    if (mode === 'answer' && !ts.length && k !== '⌫' && k !== '✓') h.onFirst?.();
    if (k === '⌫') ts = ts[0] === 'u' ? [] : ts.slice(0, -1);
    else if (k === 'u') ts = ['u'];
    else if (k !== '✓') ts = (ts[0] === 'u' ? [] : ts).concat(k).slice(0, 8);
    draw(); const s = join(ts);
    if (mode === 'copy') { if (s === target(card)) { mode = 'off'; h.onMatch?.(); } return; }
    if (s && (k === '✓' || complete(kindOf(card), s))) { mode = 'off'; el.classList.add('locked'); h.onSubmit?.(s); }
  }
  keys.addEventListener('pointerdown', e => { const b = e.target.closest('button'); if (b) { e.preventDefault(); press(b.dataset.k); } });
  // Clicks without a pointerdown first (keyboard focus + Enter, some test drivers).
  keys.addEventListener('click', e => { const b = e.target.closest('button'); if (b && e.detail === 0) press(b.dataset.k); });
  addEventListener('keydown', e => {
    if (mode === 'off' || !el.offsetParent || e.metaKey || e.ctrlKey) return;
    const k = KEYMAP[e.key] ?? (/^[0-9/]$/.test(e.key) ? e.key : null);
    if (k && keys.querySelector(`[data-k="${k}"]`)) { e.preventDefault(); press(k); }
  });
  return {
    ask(c, handlers = {}) { card = c; h = handlers; ts = []; mode = 'answer'; el.classList.remove('locked'); lay(kindOf(c) === 'value' ? 'value' : 'angle'); unit.textContent = kindOf(c) === 'deg' ? '°' : ''; draw(); },
    // After a miss: type the right answer to go on.
    copy(onMatch) { h = { onMatch }; ts = []; mode = 'copy'; el.classList.remove('locked'); draw(); },
    off() { mode = 'off'; },
    // Tests: press the keys for a typed answer; enter = also press ✓.
    type(s, enter) { for (const k of tokens(s)) press(k); if (enter && mode !== 'off') press('✓'); },
    get value() { return join(ts); },
    get mode() { return mode; },
  };
}
