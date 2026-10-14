import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, CARDS, VALUES, FN, radOf, choicesFor, choiceText, status, record, deckSummary, FAST, INTERVALS } from './facts.js';

const evalRad = s => { const m = s.replace('−', '-').match(/^(-?)(\d*)π(?:\/(\d+))?$/); return s === '0' ? 0 : (m[1] ? -1 : 1) * (m[2] ? +m[2] : 1) * 180 / (m[3] ? +m[3] : 1); };

test('every card answer is mathematically right', () => {
  for (const c of Object.values(CARDS)) {
    if (c.pool === 'rad') assert.equal(evalRad(c.answer), c.t, c.id);
    else if (c.pool === 'deg') assert.equal(c.answer, c.t + '°', c.id);
    else {
      const v = FN[c.f](c.t), want = VALUES[c.answer].v;
      if (Number.isNaN(want)) assert.ok(Number.isNaN(v), c.id); else assert.ok(Math.abs(v - want) < 1e-9, c.id);
    }
  }
  assert.equal(radOf(150), '5π/6'); assert.equal(radOf(180), 'π'); assert.equal(radOf(360), '2π'); assert.equal(radOf(90), 'π/2');
  assert.deepEqual(DECKS.map(d => d.cards.length), [32, 15, 36]);
});

test('choices: 4 different, answer included, near misses', () => {
  for (const c of Object.values(CARDS)) for (let i = 0; i < 5; i++) {
    const ch = choicesFor(c);
    assert.equal(ch.length, 4, c.id); assert.equal(new Set(ch).size, 4, c.id); assert.ok(ch.includes(c.answer), c.id);
    ch.forEach(x => assert.ok(choiceText(c, x), c.id));
  }
  // π/6 vs π/3 confusion is always offered; sign flip is offered on round-the-circle cards.
  assert.ok(choicesFor(CARDS['d2r:30']).includes('π/3'));
  assert.ok(choicesFor(CARDS['sin:210']).includes('1/2'));
});

test('status and spacing', () => {
  let st; const t0 = 1e12;
  assert.equal(status(st), 'new');
  st = record(st, true, 5, t0); assert.equal(status(st), 'slow'); assert.equal(st.box, 0);
  st = record(st, true, 2, t0); st = record(st, true, 2, t0); assert.equal(status(st), 'slow');
  st = record(st, true, 2.9, t0); assert.equal(status(st), 'automatic'); assert.equal(st.box, 3); assert.equal(st.due, t0 + INTERVALS[3]);
  st = record(st, false, 1, t0); assert.equal(status(st), 'shaky'); assert.equal(st.box, 0); assert.equal(st.due, t0);
  assert.ok(FAST >= 2 && FAST <= 4);
});

test('deck summary counts each status', () => {
  const deck = DECKS[0], now = 1e12, st = {};
  for (const c of deck.cards.slice(0, 6)) st[c.id] = record(record(record({}, true, 1, now), true, 1, now), true, 1, now);
  st[deck.cards[6].id] = record({}, false, 2, now); st[deck.cards[7].id] = record({}, true, 6, now);
  assert.deepEqual(deckSummary(deck, st), { new: 24, shaky: 1, slow: 1, automatic: 6 });
});

import { kindOf, CANON, target, complete, limitFor, checkTyped, wrongTyped } from './facts.js';
test('typed answers: every card\'s answer is typeable and right; a wrong one is wrong', () => {
  for (const c of Object.values(CARDS)) {
    const t = target(c); assert.ok(CANON[kindOf(c)].includes(t), c.id);
    assert.equal(checkTyped(c, t).ok, true, c.id); assert.equal(checkTyped(c, wrongTyped(c)).ok, false, c.id);
    const lim = limitFor(c); assert.ok(lim >= 2 && lim <= 4.5, `${c.id} ${lim}`);
  }
});
test('typed answers: auto-submit only when nothing longer could follow', () => {
  assert.ok(complete('rad', 'π/3')); assert.ok(!complete('rad', 'π')); assert.ok(!complete('rad', '2π')); assert.ok(complete('rad', '2π/3'));
  assert.ok(!complete('deg', '30')); assert.ok(complete('deg', '45')); assert.ok(complete('deg', '300'));
  assert.ok(!complete('value', '1')); assert.ok(complete('value', '1/2')); assert.ok(!complete('value', '√3')); assert.ok(complete('value', 'undefined'));
  assert.equal(limitFor(CARDS['d2r:60']), 3); assert.equal(limitFor(CARDS['r2d:30']), 3); assert.equal(limitFor(CARDS['d2r:330']), 4);
});
test('typed answers: equal forms count with a note; units mixed up get a hint', () => {
  assert.deepEqual(checkTyped(CARDS['d2r:60'], '2π/6').ok, true); assert.match(checkTyped(CARDS['d2r:60'], '2π/6').note, /π\/3/);
  assert.equal(checkTyped(CARDS['tan:30'], '1/√3').ok, true);
  assert.equal(checkTyped(CARDS['d2r:60'], '60').ok, false); assert.match(checkTyped(CARDS['d2r:60'], '60').note, /degrees/);
  assert.equal(checkTyped(CARDS['r2d:60'], 'π/3').ok, false);
  assert.equal(checkTyped(CARDS['tan:90'], 'undefined').ok, true); assert.equal(checkTyped(CARDS['tan:90'], '0').ok, false);
});
test('record: fast is judged against the card\'s own limit', () => {
  let st = record({}, true, 3.5, 0, 1, 4); assert.equal(st.hist[0].f, 1); assert.equal(st.box, 1);
  st = record({}, true, 3.5, 0, 1, 3); assert.equal(st.hist[0].f, 0); assert.equal(st.box, 0);
  // Older records without f fall back to FAST.
  assert.equal(status({ hist: [{ ok: true, s: 1 }, { ok: true, s: 1 }, { ok: true, s: 1 }] }), 'automatic');
});
