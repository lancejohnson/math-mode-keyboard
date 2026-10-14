import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, curveExpression, snapStroke } from './core.js';
test('arithmetic, fractions, powers and known constants',()=>{
assert.equal(evaluate(['Add',['Power','x',2],-4],{x:3}),5);
assert.equal(evaluate(['Divide',['Add',['Multiply',2,'x'],3],['Add','x',-1]],{x:2}),7);
assert.equal(evaluate(['Sin','Pi']),Math.sin(Math.PI));
assert.equal(evaluate(['Log',100]),2);
assert.equal(evaluate(['Power','ExponentialE',1]),Math.E);
assert.equal(evaluate({num:'1.5'}),1.5);
});
test('only explicit y equations are graphed',()=>{
assert.deepEqual(curveExpression(['Equal','y',['Power','x',2]]),['Power','x',2]);
assert.throws(()=>curveExpression(['Equal',['Multiply',2,'x'],3]));
});
test('unrecognized input is rejected rather than executed',()=>{
assert.throws(()=>evaluate('window.alert(1)'));
assert.throws(()=>evaluate(['Error','syntax']));
assert.ok(!Number.isFinite(evaluate(['Divide',1,0])));
});
test('line snapping and polygon closure',()=>{
assert.deepEqual(snapStroke([[0,5],[20,6],[40,9]]),{pts:[[0,5],[40,5]],closed:false});
const triangle=snapStroke([[0,0],[20,30],[40,60],[70,30],[100,0],[50,0],[0,0]]);
assert.equal(triangle.closed,true);assert.equal(triangle.pts.length,3);
});
