import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, curveExpression, snapStroke, compactInkStrokes } from './core.js';
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

test('handwriting shrinking preserves older rows, aspect ratio and source strokes',()=>{
 const original=[{color:'#fff',pts:[[50,100],[350,300]]}];
 const before=structuredClone(original);const first=compactInkStrokes(original,390);
 assert.deepEqual(original,before);assert.ok(first.strokes[0].packed);
 assert.equal(first.bottom,68);assert.deepEqual(first.strokes[0].pts,[[16,20],[88,68]]);
 const next=compactInkStrokes([...first.strokes,{color:'#fff',pts:[[30,200],[200,350]]}],390);
 assert.deepEqual(next.strokes[0],first.strokes[0]);assert.equal(next.strokes[1].pts[0][1],90);
 assert.equal(compactInkStrokes(next.strokes,390),null);
 const wide=compactInkStrokes([{color:'#fff',pts:[[0,0],[2000,10]]}],375);
 assert.ok(wide.strokes[0].pts[1][0]<=359);assert.ok(wide.strokes[0].width>=1.2);
});
