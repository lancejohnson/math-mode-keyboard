import test from 'node:test';
import assert from 'node:assert/strict';
import { DECKS, status, record } from './facts.js?v=3';
import { DRILL, factOf, startDrill, nextCard, answerCard, shown, coldRecord, drillSummary } from './drill.js';

const ANG = DECKS[0].cards; // d2r:30, r2d:30, d2r:45, …
const auto = () => ({ hist: [{ ok: true, s: 1 }, { ok: true, s: 1 }, { ok: true, s: 1 }], box: 3, due: Infinity });

// Drive a sitting. learner(card, s) -> [ok, secs]. Returns the asked sequence with times.
function play(s, learner, { now = 0, max = 400, onAsk } = {}) {
  const seq = [];
  for (let k = 0; k < max; k++) {
    const c = nextCard(s, now); if (!c) break;
    if (c.kind === 'intro') { shown(s, c.id, now); seq.push({ ...c, q: s.q, t: now }); now += 4e3; continue; }
    const [ok, secs] = learner(c, s); now += secs * 1e3 + 500;
    const out = answerCard(s, c, ok, secs, now); seq.push({ ...c, ok, q: s.q, t: now, ...out }); onAsk?.(c, s, out);
  }
  return { seq, now };
}

test('a fact is both directions; cards met before skip the intro', () => {
  assert.equal(factOf(ANG[0]), factOf(ANG[1]));
  const s = startDrill(ANG.slice(0, 6), {}, { now: 0 });
  assert.equal(s.facts.size, 3);
  assert.equal(nextCard(s, 0).kind, 'intro');
  const seen = startDrill(ANG.slice(0, 6), {}, { now: 0, intro: false });
  assert.equal(nextCard(seen, 0).kind, 'learn');
});

test('a miss comes back after at least 2 other questions and 10 s, ahead of new facts', () => {
  const s = startDrill(ANG.slice(0, 12), {}, { now: 0, intro: false });
  const missed = nextCard(s, 0); answerCard(s, missed, false, 2, 2e3);
  const at = s.q, { seq } = play(s, () => [true, 1.5], { now: 2e3, max: 30 });
  const back = seq.find(a => a.id === missed.id);
  assert.ok(back.q - at >= DRILL.gapQ[0] + 1, `came back after ${back.q - at - 1} other questions`);
  assert.ok(back.t - 2e3 >= 10e3, `came back after ${back.t - 2e3} ms`);
});

test('gaps widen 2 → 4 → 8 questions, 10 → 30 → 60 s; a slow right answer repeats the gap', () => {
  const s = startDrill(ANG.slice(0, 2), {}, { now: 0 });
  const c = nextCard(s, 0); shown(s, c.id, 0);
  const it = s.items[c.id];
  assert.deepEqual([it.step, it.dueQ - s.q, it.dueT], [0, 2, 10e3]);
  s.q += 5; answerCard(s, { id: c.id, kind: 'learn' }, true, 1.5, 20e3); assert.deepEqual([it.step, it.dueQ - s.q, it.dueT], [1, 4, 50e3]);
  s.q += 5; answerCard(s, { id: c.id, kind: 'learn' }, true, 5, 60e3); assert.deepEqual([it.step, it.dueQ - s.q, it.dueT], [1, 4, 90e3]);
  s.q += 5; answerCard(s, { id: c.id, kind: 'learn' }, true, 1.5, 100e3); assert.deepEqual([it.step, it.dueQ - s.q, it.dueT], [2, 8, 160e3]);
  s.q += 9; const out = answerCard(s, { id: c.id, kind: 'learn' }, true, 1.5, 170e3); assert.ok(it.cold);
  assert.equal(out.cold, undefined, 'the other direction is not cold yet, so the fact is not');
  s.q += 9; answerCard(s, { id: c.id, kind: 'learn' }, false, 1, 300e3); // (a later miss on a cold card can't happen in play; just no crash)
});

test('cold: 3 fast right in a row, the last after a minute or more; fast first sight of a met fact needs 2', () => {
  const s = startDrill(ANG.slice(0, 2), {}, { now: 0, intro: true });
  const { seq } = play(s, () => [true, 1.5]);
  for (const id of ['d2r:30', 'r2d:30']) {
    const mine = seq.filter(a => a.id === id && a.kind === 'learn');
    assert.equal(mine.length, 3, id);
    assert.ok(mine[2].t - mine[1].t >= 60e3, 'last right answer comes after the one-minute gap');
  }
  assert.equal(drillSummary(s).cold, 1); assert.equal(nextCard(s, 1e9), null);
  const met = startDrill(ANG.slice(0, 2), {}, { now: 0, intro: false }), r = play(met, () => [true, 1.5]);
  assert.equal(r.seq.filter(a => a.kind === 'learn').length, 4, 'two answers per direction');
  // An early answer (gap not up) never advances a card.
  for (const a of r.seq.filter(a => a.kind === 'early')) assert.ok(!a.cold);
});

test('no more than 3 facts being learned at once; a new one joins only when one has settled', () => {
  const s = startDrill(ANG, {}, { now: 0, intro: true });
  let worst = 0;
  play(s, (c, st) => [!(c.kind === 'learn' && Math.random() < .2), 1.8], {
    onAsk: (c, st) => { const learning = st.set.filter(f => st.facts.get(f).some(id => !st.items[id]?.cold && (st.items[id]?.step ?? 0) < 2)).length; worst = Math.max(worst, learning); },
  });
  assert.ok(worst <= DRILL.set + 1, `at most 3 learning (+1 for a slipped known fact), saw ${worst}`);
});

test('fillers are known facts, never brand-new ones', () => {
  const store = Object.fromEntries(ANG.slice(0, 8).map(c => [c.id, auto()]));
  const s = startDrill(ANG, store, { now: 0 });
  const { seq } = play(s, () => [true, 1.5], { max: 60 });
  for (const a of seq.filter(a => a.kind === 'filler')) assert.ok(status(store[a.id]) === 'automatic' || s.items[a.id]?.cold, a.id);
  assert.ok(seq.some(a => a.kind === 'filler'));
});

test('known facts that are due come first; a slipped one is learned again', () => {
  const store = Object.fromEntries(ANG.slice(0, 4).map(c => [c.id, { ...auto(), due: 0 }]));
  const s = startDrill(ANG.slice(0, 8), store, { now: 10 });
  const first = [0, 1, 2, 3].map(() => { const c = nextCard(s, 10); answerCard(s, c, c.id !== 'r2d:45', 1.5, 10); return c; });
  assert.deepEqual(first.map(c => c.kind), ['review', 'review', 'review', 'review']);
  assert.ok(s.set.includes(factOf(ANG[3])), 'the missed review is back in the set');
});

test('4 of the last 10 wrong: no new fact joins until that clears; a stuck card shrinks the set to 2', () => {
  const s = startDrill(ANG, {}, { now: 0, intro: false });
  let now = 0; const asked = [];
  for (let k = 0; k < 6; k++) { const c = nextCard(s, now); asked.push(c.id); now += 3e3; answerCard(s, c, k > 3, 2, now); }
  assert.ok(s.frozen);
  const before = s.set.length; for (let k = 0; k < 3; k++) { const c = nextCard(s, now += 20e3); answerCard(s, c, true, 1.5, now); }
  assert.equal(s.set.length, before, 'held');
  const t = startDrill(ANG, {}, { now: 0, intro: false }), id = nextCard(t, 0).id;
  for (let k = 0; k < 3; k++) answerCard(t, { id, kind: 'learn' }, false, 2, k * 20e3);
  assert.equal(t.cap, DRILL.small);
});

test('simulated learners: a perfect one masters all 16 angles in a few minutes; every sitting ends', () => {
  const s = startDrill(ANG, {}, { now: 0, intro: false }), r = play(s, () => [true, 1.6]);
  assert.equal(drillSummary(s).cold, 16); assert.ok(r.now < 8 * 60e3, `${(r.now / 60e3).toFixed(1)} min`);
  for (const p of [.6, .85]) {
    const w = startDrill(ANG, {}, { now: 0, intro: true }), x = play(w, () => [Math.random() < p, 2.2], { max: 1000 });
    assert.equal(nextCard(w, x.now + 1e9), null); assert.ok(w.q <= w.maxQ + 30);
  }
});

test('store: a cold card counts as automatic, first review in a day; a miss clears it', () => {
  let st = record({}, true, 1.5, 0, 0.9); assert.equal(st.hist[0].s0, 0.9);
  st = coldRecord(record(st, true, 1.4, 1e3), 1e3);
  assert.equal(status(st), 'automatic'); assert.equal(st.due, 1e3 + 864e5);
  st = record(st, true, 1.2, 2e3); assert.ok(st.cold);
  st = record(st, false, 1.2, 3e3); assert.equal(st.cold, undefined); assert.equal(status(st), 'shaky');
});
