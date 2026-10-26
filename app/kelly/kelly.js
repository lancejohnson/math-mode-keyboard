// The Kelly criterion: the maths the course page draws and checks. Pure functions, tested in kelly.test.js.

// Growth per bet (expected log of the wealth multiplier) when you stake fraction f,
// win b per 1 staked with chance p, and lose the stake otherwise.
export const growth = (f, p, b) => p * Math.log(1 + b * f) + (1 - p) * Math.log(1 - f);
export const kelly = (p, b) => p - (1 - p) / b;
// Continuous version for investing: growth ≈ r + f(μ − r) − ½ f² σ², best at f = (μ − r) / σ².
export const growthInvest = (f, mu, r, sigma) => r + f * (mu - r) - f * f * sigma * sigma / 2;
export const kellyInvest = (mu, r, sigma) => (mu - r) / (sigma * sigma);
// Share of the full-Kelly growth kept by betting c times Kelly (exact for the quadratic, close for small bets).
export const keptShare = c => 2 * c - c * c;

export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
// `paths` players each make `n` bets from wealth 1. The same seed gives the same coin flips at every f,
// so moving the slider shows the effect of f alone.
export function simulate({ f, p, b, n = 200, paths = 24, seed = 7 }) {
  const out = [];
  for (let k = 0; k < paths; k++) {
    const r = rng(seed * 1000 + k), w = [1]; let x = 1;
    for (let i = 0; i < n; i++) { x *= r() < p ? 1 + b * f : 1 - f; if (x < 1e-12) x = 1e-12; w.push(x); }
    out.push(w);
  }
  return out;
}
export const median = a => { const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
// Largest fall from a peak, as a share of the peak (0.6 = lost 60% at worst).
export function drawdown(w) { let peak = w[0], dd = 0; for (const x of w) { peak = Math.max(peak, x); dd = Math.max(dd, 1 - x / peak); } return dd; }

// A typed number: 0.2, .2, 20%, 1/5, \frac{1}{5}. Returns NaN when it is not a plain number.
export function readNumber(ce, latex) {
  let s = String(latex || '').trim(), pct = false;
  if (/\\%|%$/.test(s)) { pct = true; s = s.replace(/\\%|%/g, ''); }
  s = s.replace(/^[a-z]\^?\{?\*?\}?\s*=/i, '').replace(/\\approx|≈/g, '');
  if (!s.trim()) return NaN;
  let v = NaN; try { const e = ce.parse(s); if (!e.freeVariables?.length) { const n = e.N(); v = typeof n.re === 'number' ? n.re : Number(n.value); } } catch { }
  return pct ? v / 100 : v;
}

// Typed algebra is checked by value: both sides are evaluated at several random points (q = 1 − p),
// so p - q/b, (pb - q)/b and \frac{bp-q}{b} all count, and a slip shows up as a wrong number.
const POINTS = [{ p: .61, b: 1.7, f: .13, a: .05, s: .21, r: .03 }, { p: .73, b: .9, f: .31, a: .11, s: .34, r: .02 }, { p: .55, b: 2.6, f: .07, a: .02, s: .15, r: .04 }, { p: .82, b: 1.2, f: .44, a: .08, s: .5, r: .01 }];
const VARS = ['p', 'q', 'b', 'f', 'a', 's', 'r'];
// Declare the letters as numbers, or ComputeEngine reads b(1 − f) as a function b applied to 1 − f.
export function setup(ce) { for (const v of VARS) { try { ce.declare(v, 'real'); } catch { } } return ce; }
function valueAt(ce, expr, pt) {
  const subs = {}; for (const [k, v] of Object.entries({ ...pt, q: 1 - pt.p })) subs[k] = ce.number(v);
  const n = expr.subs(subs).N(); const v = typeof n.re === 'number' ? n.re : Number(n.value);
  return v;
}
const close = (x, y) => Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(y));
export function parseMath(ce, latex) { try { const e = ce.parse(String(latex || '').trim()); return e.isValid === false ? null : e; } catch { return null; } }
// Strip a leading "G(f) =", "G'(f) =", "f =", "f^* =" so the answer can be written either way.
export function rhs(ce, e) {
  if (e?.operator !== 'Equal') return e;
  const l = JSON.stringify(e.op1.json);
  return /"f"|"G"|Derivative|"Apply"/.test(l) && !/"p"|"b"|"q"/.test(l) ? e.op2 : e;
}
export function sameExpression(ce, latex, target) {
  let e = parseMath(ce, latex); if (!e) return { ok: false, why: 'parse' };
  e = rhs(ce, e); if (e.operator === 'Equal') return { ok: false, why: 'equation' };
  const t = ce.parse(target);
  const free = e.freeVariables || []; const odd = free.filter(v => !VARS.includes(v)); if (odd.length) return { ok: false, why: 'vars', vars: odd };
  return { ok: POINTS.every(pt => close(valueAt(ce, e, pt), valueAt(ce, t, pt))) };
}
// Two equations are the same step if (left − right) of one is a constant, non-zero multiple of the other's.
export function sameEquation(ce, latex, target) {
  const e = parseMath(ce, latex); if (!e) return { ok: false, why: 'parse' };
  if (e.operator !== 'Equal') return { ok: false, why: 'noequals' };
  const t = ce.parse(target);
  const ratios = POINTS.map(pt => { const u = valueAt(ce, e.op1, pt) - valueAt(ce, e.op2, pt), v = valueAt(ce, t.op1, pt) - valueAt(ce, t.op2, pt); return u / v; });
  return { ok: ratios.every(x => Number.isFinite(x) && Math.abs(x) > 1e-9 && close(x, ratios[0])) };
}
