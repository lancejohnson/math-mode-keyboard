// Fact drill: how new facts are dosed inside one sitting. Pure logic (no DOM), tested with node --test.
//
// Rules (Lance's: a few facts at a time until they're cold, a miss comes back soon but not at once):
// - At most 3 facts are being learned at once ("the set"). A new fact joins only when one goes cold.
// - A miss shows the answer at once, then the card waits at least 2 other questions AND 10 s
//   (long enough to clear working memory), then comes back ahead of anything new.
// - Each fast right answer widens the gap: 2 → 4 → 8 questions, and 10 s → 30 s → 60 s (both must pass).
//   A miss starts it over. A right but slow answer repeats the same gap.
// - Cold = 3 fast right answers in a row at those widening gaps, the last after at least a minute.
//   A fact the learner already met (in a lesson) and gets fast first time skips the first two steps.
// - Gaps are filled with facts already known, never a brand-new one. If nothing else is due, a set card
//   comes early; an early right answer doesn't move it on (it isn't evidence of recall after a gap).
// - 4 or more of the last 10 answers wrong: no new fact joins until that clears. A card missed 3 times: the set shrinks to 2.
// - A fact is the thing remembered: π/3 = 60° is one fact asked both ways (two cards).
// Cold facts are then reviewed by facts.js spacing, starting 1 day later.
import { FAST, status } from './facts.js?v=3';

export const DRILL = { set: 3, small: 2, gapQ: [2, 4, 8], gapMs: [10e3, 30e3, 60e3], freezeAt: 4, stuckAt: 3, fast: FAST };
const DAY = 864e5;

// Both directions of an angle conversion are one fact; each value card is its own fact.
export const factOf = c => (c.pool === 'rad' || c.pool === 'deg' ? `${c.deck}:${c.t}` : c.id);
const known = st => status(st) === 'automatic';

// cards: the pool in teaching order. store: the facts store (facts.js). intro: show never-seen facts first.
// maxQ: after this many questions no new fact joins and the sitting ends once the set is cold, or 30 questions later
// at most (so a tired learner whose known facts keep slipping isn't held forever).
export function startDrill(cards, store, { now = Date.now(), intro = true, maxQ = 120 } = {}) {
  const facts = new Map();
  for (const c of cards) { const f = factOf(c); if (!facts.has(f)) facts.set(f, []); facts.get(f).push(c.id); }
  const allKnown = f => facts.get(f).every(id => known(store[id]));
  return {
    cards: Object.fromEntries(cards.map(c => [c.id, c])), facts, store, intro, maxQ,
    todo: [...facts.keys()].filter(f => !allKnown(f)),
    // Known facts due a review are asked once each, first (yesterday's facts start the sitting).
    reviews: cards.filter(c => known(store[c.id]) && (store[c.id].due ?? 0) <= now).map(c => c.id),
    set: [], items: {}, cold: [], q: 0, misses: 0, frozen: false, cap: DRILL.set, last: null, lastAsked: {}, log: [],
  };
}

const item = (s, id) => (s.items[id] ||= { step: 0, dueQ: 0, dueT: 0, misses: 0, fresh: true });
const ready = (s, it, now) => s.q >= it.dueQ && now >= it.dueT;
const setCards = s => s.set.flatMap(f => s.facts.get(f)).filter(id => !s.items[id]?.cold);
// Facts still being learned. A fact whose cards are all past their second right answer is only waiting for the
// one-minute check, so it no longer blocks a new fact (otherwise the sitting stalls on early asks).
const learning = s => s.set.filter(f => s.facts.get(f).some(id => !s.items[id]?.cold && (s.items[id]?.step ?? 0) < 2)).length;

// What to ask next: { id, kind } with kind learn | intro | review | filler | early, or null when the sitting is done.
export function nextCard(s, now = Date.now()) {
  const notLast = id => id !== s.last;
  if (s.q >= s.maxQ + 30) return null;
  // 1. Set cards whose gap is up, the longest-waiting first.
  const due = setCards(s).filter(id => notLast(id) && ready(s, item(s, id), now)).sort((a, b) => s.items[a].dueQ - s.items[b].dueQ);
  if (due.length) return { id: due[0], kind: 'learn' };
  // 2. Known facts due a review.
  const rv = s.reviews.find(notLast);
  if (rv) return { id: rv, kind: 'review' };
  // 3. Room in the set: the next fact joins. Its first card is asked now (or shown first, if never seen).
  if (learning(s) < s.cap && s.set.length < 2 * s.cap && !held(s) && s.todo.length && s.q < s.maxQ) {
    const f = s.todo.shift(); s.set.push(f);
    const [first, ...rest] = s.facts.get(f);
    for (const id of rest) Object.assign(item(s, id), { dueQ: s.q + 1 });
    const fresh = s.intro && !s.store[first]?.hist?.length;
    return { id: first, kind: fresh ? 'intro' : 'learn' };
  }
  const waiting = setCards(s);
  if (!waiting.length && !s.todo.length) return null; // everything cold (or frozen with an empty set)
  if (!waiting.length && s.q >= s.maxQ) return null;
  // 4. A filler while set cards wait: a known fact, the one asked longest ago.
  const fill = Object.values(s.cards).map(c => c.id).filter(id => !waiting.includes(id) && s.q - (s.lastAsked[id] ?? -9) >= 3 && (s.items[id]?.cold || known(s.store[id])))
    .sort((a, b) => (s.lastAsked[a] ?? -1) - (s.lastAsked[b] ?? -1));
  if (fill.length) return { id: fill[0], kind: 'filler' };
  // 5. Nothing else to ask: the set card whose gap is nearest to up, asked early.
  const early = waiting.filter(notLast).sort((a, b) => s.items[a].dueT - s.items[b].dueT);
  return { id: early[0] ?? waiting[0], kind: 'early' };
}

// After a new fact is shown (untimed, both ways at once), its cards are asked after the shortest gap.
export function shown(s, id, now = Date.now()) {
  s.q++; s.last = id; s.lastAsked[id] = s.q; // a shown fact takes a turn, so it counts toward the gaps
  for (const cid of s.facts.get(factOf(s.cards[id]))) Object.assign(item(s, cid), { fresh: false, step: 0, dueQ: s.q + DRILL.gapQ[0], dueT: now + DRILL.gapMs[0] });
}

// Record an answer. secs = time to answer. Returns { cold: factKey } when a fact just went cold,
// plus the store updates the caller should save (store records for cold cards get their first review in a day).
export function answerCard(s, { id, kind }, ok, secs, now = Date.now()) {
  s.q++; s.last = id; s.lastAsked[id] = s.q; const fast = ok && secs <= DRILL.fast;
  s.log.push({ id, kind, ok, s: secs });
  const out = { ok, fast };
  if (kind === 'review' || kind === 'filler') {
    s.reviews = s.reviews.filter(x => x !== id);
    if (!ok) { // a known fact slipped: that card is learned again (the set may go one over to take it back)
      const f = factOf(s.cards[id]); s.misses++;
      if (!s.set.includes(f)) { s.todo = s.todo.filter(x => x !== f); s.set.push(f); }
      for (const cid of s.facts.get(f)) if (!s.items[cid]) s.items[cid] = { step: 3, cold: true, dueQ: 0, dueT: 0, misses: 0, fresh: false };
      s.items[id] = { step: 0, dueQ: s.q + DRILL.gapQ[0], dueT: now + DRILL.gapMs[0], misses: 1, fresh: false };
      s.cold = s.cold.filter(x => x !== f);
    }
    return freeze(s, out);
  }
  const it = item(s, id), first = it.fresh; it.fresh = false;
  if (!ok) {
    it.misses++; s.misses++;
    Object.assign(it, { step: 0, dueQ: s.q + DRILL.gapQ[0], dueT: now + DRILL.gapMs[0] });
    if (it.misses >= DRILL.stuckAt) s.cap = DRILL.small;
    return freeze(s, out);
  }
  // Met before (a lesson, an earlier sitting) and fast at first sight: one more right answer after the longest gap makes it cold.
  if (ok) freeze(s, out);
  if (fast && kind !== 'early') it.step = first ? 2 : it.step + 1;
  if (it.step >= 3) {
    it.cold = true; const f = factOf(s.cards[id]);
    if (s.facts.get(f).every(cid => s.items[cid]?.cold || known(s.store[cid]))) {
      s.set = s.set.filter(x => x !== f); s.cold.push(f); out.cold = f;
      // A sitting with a stuck card shrank the set; once that card is cold, go back to 3.
      if (s.cap < DRILL.set && !s.set.some(x => s.facts.get(x).some(cid => s.items[cid]?.misses >= DRILL.stuckAt))) s.cap = DRILL.set;
    }
    return out;
  }
  if (kind !== 'early' || !ok) {
    const g = Math.min(it.step, 2);
    Object.assign(it, { dueQ: s.q + DRILL.gapQ[g], dueT: now + DRILL.gapMs[g] });
  } else it.dueQ = Math.max(it.dueQ, s.q + 1);
  return out;
}
// Holding: 4 or more of the last 10 answers wrong (under 70%). No new fact joins until that clears.
const held = s => s.log.slice(-10).filter(a => !a.ok).length >= DRILL.freezeAt;
function freeze(s, out) { s.frozen = held(s); out.held = s.frozen; return out; }

// Store record for a card that just went cold: counts as automatic, first review in a day.
export const coldRecord = (st, now = Date.now()) => ({ ...st, box: Math.max(st?.box ?? 0, 2), due: now + DAY, cold: now });

export function drillSummary(s) {
  const total = s.facts.size, cold = [...s.facts.keys()].filter(f => s.cold.includes(f) || s.facts.get(f).every(id => known(s.store[id]))).length;
  return { total, cold, learning: s.set.length, left: s.todo.length, asked: s.q, right: s.log.filter(a => a.ok).length, frozen: s.frozen };
}
