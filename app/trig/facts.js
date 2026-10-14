// Facts to know by heart: decks of cards, how each card is doing, and which cards come up next.
// Pure logic (no DOM) so it can be tested with node --test. UI is in facts.html.
//
// A fact is "automatic" when its last 3 answers were all right and each took at most FAST seconds.
// Spacing: every fast right answer moves the card up a box and pushes its next showing further out;
// a slow right answer keeps it in place and brings it back soon; a wrong one sends it back to box 0.

export const KEY = 'trig-facts-v1';         // shared by the units and facts.html
export function loadFacts() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } }
export function saveFacts(st) { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch { } }
// Both directions of the degrees <-> radians cards for these angles.
export const angleIds = degs => degs.flatMap(d => [`d2r:${d}`, `r2d:${d}`]);

export const FAST = 3;                     // seconds, for tapping 1 of 4 answers on a phone
export const NEED = 3;                     // fast right answers in a row to count as automatic
const MIN = 60e3, DAY = 864e5;
export const INTERVALS = [0, 10 * MIN, DAY, 3 * DAY, 7 * DAY, 21 * DAY, 60 * DAY];

const PI = Math.PI;
const gcd = (a, b) => (b ? gcd(b, a % b) : a);

// 150 -> "5π/6", 180 -> "π", 360 -> "2π"
export function radOf(d) {
  if (d === 0) return '0';
  const g = gcd(Math.abs(d), 180), n = d / g, m = 180 / g, sign = n < 0 ? '−' : '', a = Math.abs(n);
  return sign + (a === 1 ? '' : a) + 'π' + (m === 1 ? '' : '/' + m);
}

// Exact values that show up at the special angles. Keys are stable ids; text uses a/b for fractions.
export const VALUES = {
  '0': { v: 0, text: '0' }, '1/2': { v: .5, text: '1/2' }, 'r2/2': { v: Math.SQRT2 / 2, text: '√2/2' },
  'r3/2': { v: Math.sqrt(3) / 2, text: '√3/2' }, '1': { v: 1, text: '1' },
  'r3/3': { v: Math.sqrt(3) / 3, text: '√3/3' }, 'r3': { v: Math.sqrt(3), text: '√3' }, 'u': { v: NaN, text: 'undefined' },
};
for (const k of Object.keys(VALUES)) if (k !== '0' && k !== 'u') VALUES['-' + k] = { v: -VALUES[k].v, text: '−' + VALUES[k].text };

export const FN = { sin: d => Math.sin(d * PI / 180), cos: d => Math.cos(d * PI / 180), tan: d => (Math.abs(Math.cos(d * PI / 180)) < 1e-9 ? NaN : Math.tan(d * PI / 180)) };
export function valueKey(x) {
  if (Number.isNaN(x)) return 'u';
  for (const [k, { v }] of Object.entries(VALUES)) if (Math.abs(v - x) < 1e-9) return k;
  throw new Error('not a special value: ' + x);
}

const ANGLES = [30, 45, 60, 90, 120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];
const FIRST = [0, 30, 45, 60, 90];
const REST = [120, 135, 150, 180, 210, 225, 240, 270, 300, 315, 330, 360];

// The base step an angle is a count of, for the "why" line: 150° = 5 × 30°.
function steps(d) {
  for (const b of [180, 90, 60, 45, 30]) if (d % b === 0) return { b, k: d / b };
  return { b: 30, k: d / 30 };
}
const refAngle = d => { const r = d % 180; return Math.min(r, 180 - r); };
const quadrant = d => (d % 360 === 0 ? 'on the start line' : d % 90 === 0 ? 'on an axis' : ['in the top right', 'in the top left', 'in the bottom left', 'in the bottom right'][Math.floor((d % 360) / 90)]);

function angleCards() {
  const cards = [];
  for (const d of ANGLES) {
    const { b, k } = steps(d), r = radOf(d), rb = radOf(b);
    const why = d === 180 ? 'The anchor: π = 180°, a half turn.'
      : k === 1 ? `π = 180°, so ${d}° = 180° ÷ ${180 / d} = ${r}.`
      : `${d}° is ${k} × ${b}°, and ${b}° = ${rb}, so ${d}° = ${k} × ${rb} = ${r}.`;
    cards.push({ id: `d2r:${d}`, deck: 'angles', t: d, prompt: `<b>${d}°</b> in radians`, answer: r, pool: 'rad', why });
    cards.push({ id: `r2d:${d}`, deck: 'angles', t: d, prompt: `<b>${r}</b> in degrees`, answer: d + '°', pool: 'deg', why });
  }
  return cards;
}

function valueCards(deck, angles) {
  const cards = [];
  for (const d of angles) for (const f of ['sin', 'cos', 'tan']) {
    const key = valueKey(FN[f](d)), ref = refAngle(d), refKey = valueKey(Math.abs(FN[f](ref)));
    let why;
    if (deck === 'first') {
      const i = FIRST.indexOf(d), n = f === 'sin' ? i : 4 - i, sv = VALUES[valueKey(FN.sin(d))].text, cv = VALUES[valueKey(FN.cos(d))].text;
      why = f === 'tan' ? `tan = sin ÷ cos = (${sv}) ÷ (${cv}) = ${VALUES[key].text}.`
        : `Across 0°, 30°, 45°, 60°, 90°, ${f === 'sin' ? 'sin is √0/2, √1/2, √2/2, √3/2, √4/2' : 'cos is the sin list backwards: √4/2, √3/2, √2/2, √1/2, √0/2'}. So ${f} ${d}° = √${n}/2 = ${VALUES[key].text}.`.replace('= √2/2 = √2/2', '= √2/2').replace('= √3/2 = √3/2', '= √3/2');
    } else {
      const sign = key.startsWith('-') ? 'negative' : key === '0' || key === 'u' ? '' : 'positive';
      why = d % 90 === 0 ? `${d}° points ${['right', 'up', 'left', 'down'][(d / 90) % 4]}: the point is (${VALUES[valueKey(FN.cos(d))].text}, ${VALUES[valueKey(FN.sin(d))].text}), so ${f} ${d}° = ${VALUES[key].text}.`
        : `Reference angle ${ref}° (to the nearest horizontal): ${f} ${ref}° = ${VALUES[refKey].text}. ${d}° is ${quadrant(d)}, where ${f} is ${sign}: ${VALUES[key].text}.`;
    }
    cards.push({ id: `${f}:${d}`, deck, t: d, f, prompt: null, answer: key, pool: f === 'tan' ? 'tan' : 'sc', why });
  }
  return cards;
}

export const DECKS = [
  { id: 'angles', title: 'Degrees ↔ radians', blurb: 'The 16 angles you\'ll use all the time, both ways.', after: 'Unit 1',
    aid: '<p><b>Anchor: π = 180°.</b> Then the four building blocks: <b>π/6 = 30°</b>, <b>π/4 = 45°</b>, <b>π/3 = 60°</b>, <b>π/2 = 90°</b>.</p><p>Every other angle is a count of one of those: 5π/6 is 5 × 30° = 150°, 7π/4 is 7 × 45° = 315°.</p>',
    cards: angleCards() },
  { id: 'first', title: 'sin, cos, tan at 0° to 90°', blurb: 'The values at 0°, 30°, 45°, 60°, 90°.', after: 'Unit 3',
    aid: '<p><b>sin, going up from 0° to 90°:</b> write √0, √1, √2, √3, √4, each over 2. That gives <b>0, 1/2, √2/2, √3/2, 1</b>.</p><p><b>cos</b> is the same list going down: 1, √3/2, √2/2, 1/2, 0.</p><p><b>tan = sin ÷ cos</b>: 0, √3/3, 1, √3, undefined (you can\'t divide by 0).</p>',
    cards: valueCards('first', FIRST) },
  { id: 'circle', title: 'sin, cos, tan round the circle', blurb: 'The same values at 120° to 360°, with signs.', after: 'Unit 4',
    aid: '<p>On a circle of radius 1, the point at angle θ is <b>(cos θ, sin θ)</b>: cos is how far right, sin is how far up.</p><p>So: find the <b>reference angle</b> (the angle back to the nearest horizontal line), use its 0°–90° value, then take the <b>sign</b> from where the point is. Left means cos is negative, below means sin is negative. tan is positive in the top-right and bottom-left.</p>',
    cards: valueCards('circle', REST) },
];
export const CARDS = Object.fromEntries(DECKS.flatMap(d => d.cards).map(c => [c.id, c]));

// Prompts for value cards ask in degrees or radians at random, so both forms become automatic.
export function promptFor(card, useRad) {
  if (card.prompt) return card.prompt;
  return `<b>${card.f} ${useRad ? radOf(card.t) : card.t + '°'}</b>`;
}

// Four choices: the answer plus near misses (neighboring angles, sign flips, sin/cos swaps).
export function choicesFor(card, rnd = Math.random) {
  const shuffle = a => a.map(v => [rnd(), v]).sort((x, y) => x[0] - y[0]).map(x => x[1]);
  let near;
  if (card.pool === 'rad' || card.pool === 'deg') {
    const fmt = card.pool === 'rad' ? radOf : d => d + '°';
    const i = ANGLES.indexOf(card.t), around = ANGLES.filter((_, j) => j !== i && Math.abs(j - i) <= 3);
    const swap = { 30: 60, 60: 30, 120: 150, 150: 120, 210: 240, 240: 210, 300: 330, 330: 300 }[card.t];
    near = shuffle([...new Set([...(swap ? [swap] : []), ...shuffle(around)])]).slice(0, 5).map(fmt);
    if (swap && !near.slice(0, 3).includes(fmt(swap))) near.unshift(fmt(swap));
  } else {
    const k = card.answer, flip = k.startsWith('-') ? k.slice(1) : '-' + k;
    const other = card.f === 'tan' ? null : valueKey(card.f === 'sin' ? FN.cos(card.t) : FN.sin(card.t));
    const base = card.pool === 'tan' ? ['0', 'r3/3', '1', 'r3', 'u'] : ['0', '1/2', 'r2/2', 'r3/2', '1'];
    const signed = base.flatMap(b => (b === '0' || b === 'u' ? [b] : [b, '-' + b]));
    const pool = card.deck === 'first' ? base : signed;
    const cand = [...(card.deck !== 'first' && VALUES[flip] ? [flip] : []), ...(other ? [other] : []), ...shuffle(pool)];
    near = [...new Set(cand)].filter(x => x !== k);
  }
  near = [...new Set(near)].filter(x => x !== card.answer).slice(0, 3);
  return shuffle([card.answer, ...near]);
}
export const choiceText = (card, c) => (card.pool === 'rad' || card.pool === 'deg' ? c : VALUES[c].text);

// --- How each card is doing ---
export function status(st) {
  if (!st || !st.hist?.length) return 'new';
  const h = st.hist, last = h[h.length - 1];
  if (!last.ok) return 'shaky';
  const lastN = h.slice(-NEED);
  if (lastN.length === NEED && lastN.every(a => a.ok && a.s <= FAST)) return 'automatic';
  if (st.cold && last.s <= FAST) return 'automatic'; // went cold in the fact drill (drill.js)
  return 'slow';
}

// secs = time to answer; start = time to the first touch on an answer (logged, not yet used).
export function record(st = {}, ok, secs, now = Date.now(), start) {
  const a = { ok, s: Math.round(secs * 10) / 10 }; if (start != null) a.s0 = Math.round(start * 10) / 10;
  const hist = [...(st.hist || []), a].slice(-6);
  let box = st.box || 0;
  if (ok && secs <= FAST) box = Math.min(box + 1, INTERVALS.length - 1);
  else if (!ok) box = 0;
  const next = { hist, box, seen: now, ...(ok && st.cold ? { cold: st.cold } : {}), due: now + (ok && secs <= FAST ? INTERVALS[box] : 0) };
  // Not automatic yet: keep the gap short so it comes back in the next round.
  if (status(next) !== 'automatic') next.due = Math.min(next.due, now + 10 * MIN);
  return next;
}

export function deckSummary(deck, state) {
  const n = { new: 0, shaky: 0, slow: 0, automatic: 0 };
  for (const c of deck.cards) n[status(state[c.id])]++;
  return n;
}
