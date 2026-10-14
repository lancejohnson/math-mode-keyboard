// Timing model for Math Mode reviews: expected time, learning curve, forgetting,
// mastery-level evidence, effort check and XP. Pure functions, no DOM.
// Explained in app/model/index.html (served at /model/).

export const DEFAULTS = Object.freeze({
  secPerStep: 1.35,      // Keystroke-Level Model "mental preparation" operator (Card, Moran & Newell 1980)
  secPerSymbol: 0.7,     // handwriting on a phone; replaced by the learner's own copy-test calibration
  readSecPerWord: 0.25,  // ~240 words per minute
  startMultiple: 4,      // first attempts take ~4x the floor until real data exists
  rate: 0.35,            // how fast the gap closes per practice (fitted per learner and topic)
  forgetK: 1.0,          // extra time per unit of forgetting: x(1 + k(1 - R))
});

// Mastery levels, lowest to highest. Ratios are measured against the floor.
export const LEVELS = Object.freeze([
  { id: 'recognize', label: 'Recognize', rule: 'Correct. Time ignored.' },
  { id: 'explain', label: 'Explain & sketch', rule: 'Correct; first stroke within 2x the start floor; at most 1 restart.' },
  { id: 'fluent', label: 'Fluent', rule: 'Last 3 correct answers, median total time within 1.5x the floor.' },
  { id: 'automatic', label: 'Automatic', rule: 'Last 5 correct, median within 1.2x the floor and log-time spread at most 0.25.' },
]);
export const TARGETS = Object.freeze({ explainStart: 2, maxRestarts: 1, fluent: 1.5, automatic: 1.2, automaticSpread: 0.25 });

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1)); };

// 1. Floor: the time a master needs. Reading + thinking + writing.
export function floorTime({ words = 0, steps = 1, symbols = 0, secPerSymbol = DEFAULTS.secPerSymbol, secPerStep = DEFAULTS.secPerStep, readSecPerWord = DEFAULTS.readSecPerWord } = {}) {
  const read = words * readSecPerWord, think = steps * secPerStep, write = symbols * secPerSymbol;
  return { read, think, write, total: read + think + write, firstStroke: read + secPerStep };
}

// The learner's writing speed from a copy test: seconds per symbol.
export function calibrateWriting(copies) {
  const r = copies.filter(c => c.symbols > 0 && c.seconds > 0).map(c => c.seconds / c.symbols);
  return r.length ? median(r) : DEFAULTS.secPerSymbol;
}

// 2. Learning curve: floor + gap shrinking exponentially with practice n (Heathcote, Brown & Mewhort 2000).
export function expectedTime({ floor, start = floor * DEFAULTS.startMultiple, rate = DEFAULTS.rate, n = 0, R = 1, forgetK = DEFAULTS.forgetK }) {
  return (floor + Math.max(0, start - floor) * Math.exp(-rate * n)) * forgettingFactor(R, forgetK);
}
// Power-law version, for comparison only (what averaging many learners looks like).
export function powerLawTime({ floor, start = floor * DEFAULTS.startMultiple, c = 0.6, n = 0 }) {
  return floor + Math.max(0, start - floor) * (n + 1) ** -c;
}

// 3. Forgetting: recall slows as retrievability R (0..1, from the memory model) falls.
export function forgettingFactor(R = 1, forgetK = DEFAULTS.forgetK) { return 1 + forgetK * (1 - clamp(R, 0, 1)); }

// 4. Score one attempt: share of the start-to-floor gap closed, on a log scale. 0 = beginner, 1 = mastered.
export function gapClosed(seconds, { floor, start = floor * DEFAULTS.startMultiple, R = 1, forgetK = DEFAULTS.forgetK }) {
  const t = seconds / forgettingFactor(R, forgetK);
  if (start <= floor) return t <= floor ? 1 : 0;
  return clamp((Math.log(start) - Math.log(t)) / (Math.log(start) - Math.log(floor)), 0, 1);
}

// Time never fails a correct answer: it only scales credit (0.7x-1.3x) and picks the memory-model grade.
export function creditFromTime(progress) {
  const multiplier = 0.7 + 0.6 * clamp(progress, 0, 1);
  const grade = progress < 0.33 ? 'hard' : progress < 0.8 ? 'good' : 'easy';
  return { multiplier, grade };
}

// Fit the per-learner, per-topic rate from (n, seconds) pairs by least squares on log time.
export function fitRate(points, { floor, start = floor * DEFAULTS.startMultiple }) {
  let best = { rate: DEFAULTS.rate, err: Infinity };
  for (let rate = 0.02; rate <= 2.0001; rate += 0.01) {
    const err = points.reduce((s, p) => s + (Math.log(p.seconds) - Math.log(expectedTime({ floor, start, rate, n: p.n, R: p.R ?? 1 }))) ** 2, 0);
    if (err < best.err) best = { rate: +rate.toFixed(2), err };
  }
  return best.rate;
}

// Spread of log times. Automatic skills are fast AND consistent (Segalowitz & Segalowitz 1993).
export function logSpread(seconds) { return seconds.length < 2 ? Infinity : sd(seconds.map(Math.log)); }

// 5. Highest mastery level the recent attempts show. Each attempt:
// { correct, seconds, firstStroke?, restarts?, R?, effort? } with floors from floorTime().
export function levelEvidence(attempts, { floor, firstStrokeFloor = floor * 0.3, forgetK = DEFAULTS.forgetK }) {
  const ok = attempts.filter(a => a.correct && a.effort !== 'rushed' && a.effort !== 'blank');
  if (!ok.length) return null;
  const adj = a => a.seconds / forgettingFactor(a.R ?? 1, forgetK);
  let level = 'recognize';
  const last = ok[ok.length - 1];
  if (last.firstStroke != null && last.firstStroke <= TARGETS.explainStart * firstStrokeFloor && (last.restarts ?? 0) <= TARGETS.maxRestarts) level = 'explain';
  const l3 = ok.slice(-3).map(adj);
  if (l3.length === 3 && median(l3) <= TARGETS.fluent * floor) level = 'fluent';
  const l5 = ok.slice(-5).map(adj);
  if (l5.length === 5 && median(l5) <= TARGETS.automatic * floor && logSpread(l5) <= TARGETS.automaticSpread) level = 'automatic';
  return level;
}
export const levelRank = id => LEVELS.findIndex(l => l.id === id);
export const meetsTarget = (shown, target) => shown != null && levelRank(shown) >= levelRank(target);

// 6. Effort check. Free-response handwriting makes lucky guesses rare, but blowing off a task is still possible.
// A wrong answer written faster than half the time needed to even write the expected answer was not a try.
export function effortCheck({ correct, seconds, inkSymbols = null, writeFloor }) {
  if (inkSymbols === 0) return 'blank';
  if (!correct && writeFloor > 0 && seconds < 0.5 * writeFloor) return 'rushed';
  return 'ok';
}

// 7. XP. 1 XP = 1 minute of focused work for a typical serious learner (Math Academy's calibration).
// Base XP uses the typical learner's time, so faster learners earn more XP per minute.
export function baseXP(typicalSeconds) { return Math.max(1, Math.round(typicalSeconds / 60)); }

// Bands follow Math Academy (The Math Academy Way, p. 311); the numbers are ours.
export function awardXP(base, { correct, total, passed, rushed = 0, priorBlowOffs = 0 }) {
  const frac = total ? correct / total : 0;
  if (rushed >= 2 && rushed >= total / 2) {
    return { xp: -Math.min(base * 2, Math.max(1, Math.round(base * 0.5)) * (1 + priorBlowOffs)), band: 'blow-off' };
  }
  if (passed && frac === 1) return { xp: Math.round(base * 1.25), band: 'perfect' };
  if (passed && frac >= 0.9) return { xp: base, band: 'nearly perfect' };
  if (passed) return { xp: Math.round(base * 0.8), band: 'passed' };
  if (frac >= 0.5) return { xp: Math.round(base * 0.2), band: 'nearly passed' };
  return { xp: 0, band: 'not passed' };
}
