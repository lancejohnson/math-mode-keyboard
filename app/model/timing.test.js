import test from 'node:test';
import assert from 'node:assert/strict';
import { floorTime, calibrateWriting, expectedTime, powerLawTime, forgettingFactor, gapClosed, creditFromTime, fitRate, logSpread, levelEvidence, meetsTarget, effortCheck, baseXP, awardXP } from './timing.js';

// Deterministic noise so the simulated learners are repeatable.
function rng(seed) { return () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; }; }
function gauss(r) { return Math.sqrt(-2 * Math.log(r() || 1e-9)) * Math.cos(2 * Math.PI * r()); }

test('floor adds reading, thinking and writing', () => {
  const f = floorTime({ words: 8, steps: 3, symbols: 10, secPerSymbol: 0.5 });
  assert.equal(f.read, 2); assert.equal(f.think, 3 * 1.35); assert.equal(f.write, 5);
  assert.ok(Math.abs(f.total - 11.05) < 1e-9);
  assert.equal(calibrateWriting([{ symbols: 10, seconds: 6 }, { symbols: 10, seconds: 8 }, { symbols: 0, seconds: 3 }]), 0.7);
});

test('curve starts at start, approaches the floor, and forgetting slows it', () => {
  assert.equal(expectedTime({ floor: 10, start: 40, n: 0 }), 40);
  assert.ok(Math.abs(expectedTime({ floor: 10, start: 40, n: 60 }) - 10) < 1e-6);
  assert.ok(expectedTime({ floor: 10, start: 40, n: 3 }) > expectedTime({ floor: 10, start: 40, n: 4 }));
  assert.equal(forgettingFactor(0.7), 1.3);
  assert.equal(expectedTime({ floor: 10, start: 10, n: 9, R: 0.5 }), 15);
  assert.equal(powerLawTime({ floor: 10, start: 40, n: 0 }), 40);
});

test('gap closed: 0 at start, 1 at floor, forgetting excused', () => {
  const p = { floor: 10, start: 40 };
  assert.equal(gapClosed(40, p), 0);
  assert.equal(gapClosed(10, p), 1);
  assert.ok(Math.abs(gapClosed(20, p) - 0.5) < 1e-9); // halfway on a log scale
  assert.equal(gapClosed(13, { ...p, R: 0.7 }), 1); // 13 s after fading = 10 s fresh
  assert.equal(gapClosed(200, p), 0);
});

test('time scales credit but never fails a correct answer', () => {
  assert.deepEqual(creditFromTime(0), { multiplier: 0.7, grade: 'hard' });
  assert.equal(creditFromTime(0.5).grade, 'good');
  assert.equal(creditFromTime(1).grade, 'easy');
  assert.ok(Math.abs(creditFromTime(1).multiplier - 1.3) < 1e-9);
});

test('simulated learners: fitted rate recovers the true rate', () => {
  for (const [trueRate, seed] of [[0.15, 1], [0.4, 2], [0.9, 3]]) {
    const r = rng(seed), floor = 12, start = 48;
    const pts = Array.from({ length: 12 }, (_, n) => ({ n, seconds: expectedTime({ floor, start, rate: trueRate, n }) * Math.exp(0.1 * gauss(r)) }));
    const fitted = fitRate(pts, { floor, start });
    assert.ok(Math.abs(fitted - trueRate) < 0.12 * Math.max(1, trueRate * 2), `true ${trueRate} fitted ${fitted}`);
  }
});

test('levels: a simulated learner climbs recognize -> explain -> fluent -> automatic', () => {
  const r = rng(7), floor = 10, opts = { floor, firstStrokeFloor: 3 };
  const att = [];
  const seen = [];
  for (let n = 0; n < 20; n++) {
    const noise = Math.exp((n < 10 ? 0.35 : 0.1) * gauss(r)); // consistency improves too
    const seconds = expectedTime({ floor, start: 45, rate: 0.3, n }) * noise;
    att.push({ correct: true, seconds, firstStroke: seconds * 0.3, restarts: n < 2 ? 2 : 0 });
    seen.push(levelEvidence(att, opts));
  }
  assert.equal(seen[0], 'recognize');
  assert.ok(seen.includes('explain') && seen.includes('fluent'));
  assert.equal(seen.at(-1), 'automatic');
  assert.ok(meetsTarget('automatic', 'fluent') && !meetsTarget('explain', 'fluent') && !meetsTarget(null, 'recognize'));
});

test('fast but inconsistent is not automatic', () => {
  const att = [8, 16, 7, 15, 9].map(seconds => ({ correct: true, seconds, firstStroke: 1 }));
  assert.ok(logSpread(att.map(a => a.seconds)) > 0.25);
  assert.equal(levelEvidence(att, { floor: 10, firstStrokeFloor: 3 }), 'fluent');
});

test('slow answer after a long gap still counts as fluent once forgetting is excused', () => {
  const att = [16, 16, 16].map(seconds => ({ correct: true, seconds, R: 0.6, firstStroke: 2 }));
  assert.equal(levelEvidence(att, { floor: 10, firstStrokeFloor: 3, forgetK: 1 }), 'fluent');
  assert.equal(levelEvidence(att.map(a => ({ ...a, R: 1 })), { floor: 10, firstStrokeFloor: 3 }), 'explain');
});

test('effort check and XP bands, including blow-off penalty', () => {
  assert.equal(effortCheck({ correct: false, seconds: 1, writeFloor: 6 }), 'rushed');
  assert.equal(effortCheck({ correct: true, seconds: 1, writeFloor: 6 }), 'ok');
  assert.equal(effortCheck({ correct: false, seconds: 20, writeFloor: 6 }), 'ok');
  assert.equal(effortCheck({ correct: false, seconds: 9, inkSymbols: 0, writeFloor: 6 }), 'blank');
  assert.equal(baseXP(9 * 60), 9);
  assert.deepEqual(awardXP(10, { correct: 5, total: 5, passed: true }), { xp: 13, band: 'perfect' });
  assert.equal(awardXP(10, { correct: 9, total: 10, passed: true }).xp, 10);
  assert.equal(awardXP(10, { correct: 4, total: 5, passed: true }).xp, 8);
  assert.equal(awardXP(10, { correct: 3, total: 5, passed: false }).xp, 2);
  assert.equal(awardXP(10, { correct: 1, total: 5, passed: false }).xp, 0);
  assert.deepEqual(awardXP(10, { correct: 0, total: 5, passed: false, rushed: 4 }), { xp: -5, band: 'blow-off' });
  assert.equal(awardXP(10, { correct: 0, total: 5, passed: false, rushed: 4, priorBlowOffs: 3 }).xp, -20);
});
