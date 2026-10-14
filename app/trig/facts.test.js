import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, CARDS, VALUES, FN, radOf, choicesFor, choiceText, status, record, buildRound, requeue, deckSummary, FAST, INTERVALS } from './facts.js';

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

test('rounds: struggling cards first, a few new ones, automatic ones only when due', () => {
  const deck = DECKS[0], now = 1e12, st = {};
  const r1 = buildRound(deck, st, { now }); assert.equal(r1.length, 10); // 5 new cards, each twice
  assert.equal(new Set(r1.map(c => c.id)).size, 5); r1.slice(1).forEach((c, i) => assert.notEqual(c.id, r1[i].id));
  for (const c of deck.cards.slice(0, 6)) st[c.id] = record(record(record({}, true, 1, now), true, 1, now), true, 1, now);
  st[deck.cards[6].id] = record({}, false, 2, now); st[deck.cards[7].id] = record({}, true, 6, now);
  const r2 = buildRound(deck, st, { now: now + 1 }).map(c => c.id);
  assert.ok(r2.includes(deck.cards[6].id) && r2.includes(deck.cards[7].id));
  assert.equal(r2.length, 10); // shaky + slow + 5 new + automatic fillers
  const r3 = buildRound(deck, st, { now: now + 1, maxNew: 0, size: 2 }).map(c => c.id);
  assert.deepEqual(new Set(r3), new Set([deck.cards[6].id, deck.cards[7].id]));
  assert.deepEqual(deckSummary(deck, st), { new: 24, shaky: 1, slow: 1, automatic: 6 });
  const small = r1.slice(0, 4), rq = requeue(small, 0, small[0]); assert.equal(rq.length, 5); assert.equal(rq[4].id, small[0].id);
  assert.equal(requeue(rq, 0, small[0]).length, 5);
});
