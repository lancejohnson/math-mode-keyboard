import test from 'node:test';
import assert from 'node:assert/strict';
import { ComputeEngine } from '../vendor/compute/compute-engine.js';
import { growth, kelly, kellyInvest, keptShare, simulate, median, drawdown, readNumber, sameExpression, sameEquation, setup } from './kelly.js';
const ce = setup(new ComputeEngine());

test('Kelly fraction is where growth peaks', () => {
  for (const [p, b] of [[.6, 1], [.55, 2], [.7, .5]]) {
    const f = kelly(p, b), g = growth(f, p, b);
    assert.ok(g > growth(f - .01, p, b) && g > growth(f + .01, p, b));
  }
  assert.ok(Math.abs(kelly(.6, 1) - .2) < 1e-12);
  assert.ok(Math.abs(growth(.4, .6, 1)) < .01, 'twice Kelly is about zero growth');
  assert.ok(Math.abs(kellyInvest(.08, .04, .2) - 1) < 1e-12);
  assert.equal(keptShare(.5), .75);
});
test('simulation is repeatable and betting everything ruins', () => {
  assert.deepEqual(simulate({ f: .2, p: .6, b: 1, n: 50, paths: 3 }), simulate({ f: .2, p: .6, b: 1, n: 50, paths: 3 }));
  const all = simulate({ f: 1, p: .6, b: 1, n: 100, paths: 10 }).map(w => w.at(-1));
  assert.ok(median(all) < 1e-6);
  const k = simulate({ f: .2, p: .6, b: 1, n: 400, paths: 30 }).map(w => w.at(-1)), over = simulate({ f: .5, p: .6, b: 1, n: 400, paths: 30 }).map(w => w.at(-1));
  assert.ok(median(k) > 1 && median(k) > median(over));
  assert.equal(drawdown([1, 2, 1, 3]), .5);
});
test('typed numbers', () => {
  for (const [s, v] of [['0.2', .2], ['20\\%', .2], ['\\frac{1}{5}', .2], ['f=0.25', .25], ['1.25', 1.25]]) assert.ok(Math.abs(readNumber(ce, s) - v) < 1e-9, s);
  assert.ok(Number.isNaN(readNumber(ce, 'p')));
  assert.ok(Number.isNaN(readNumber(ce, '')));
});
test('typed algebra is checked by value', () => {
  const G = 'p\\ln\\left(1+bf\\right)+q\\ln\\left(1-f\\right)';
  assert.ok(sameExpression(ce, 'p\\ln(1+bf)+(1-p)\\ln(1-f)', G).ok);
  assert.ok(sameExpression(ce, 'G(f)=q\\ln(1-f)+p\\ln(bf+1)', G).ok);
  assert.ok(!sameExpression(ce, 'p\\ln(1+bf)-q\\ln(1-f)', G).ok);
  const d = '\\frac{pb}{1+bf}-\\frac{q}{1-f}';
  assert.ok(sameExpression(ce, '\\frac{bp}{bf+1}-\\frac{q}{1-f}', d).ok);
  assert.ok(sameExpression(ce, "G'(f)=\\frac{pb}{1+bf}+\\frac{q}{f-1}", d).ok);
  assert.ok(!sameExpression(ce, '\\frac{p}{1+bf}-\\frac{q}{1-f}', d).ok);
  const eq = 'pb(1-f)=q(1+bf)';
  assert.ok(sameEquation(ce, 'pb-pbf=q+qbf', eq).ok);
  assert.ok(sameEquation(ce, 'pb-pbf-q-qbf=0', eq).ok);
  assert.ok(!sameEquation(ce, 'pb(1+f)=q(1-bf)', eq).ok);
  assert.equal(sameEquation(ce, 'pb(1-f)', eq).why, 'noequals');
  const k = 'p-\\frac{q}{b}';
  for (const s of ['\\frac{pb-q}{b}', 'f=p-\\frac{1-p}{b}', '\\frac{p(b+1)-1}{b}']) assert.ok(sameExpression(ce, s, k).ok, s);
  assert.ok(!sameExpression(ce, 'p-q', k).ok);
  assert.equal(sameExpression(ce, 'x+1', k).why, 'vars');
});
