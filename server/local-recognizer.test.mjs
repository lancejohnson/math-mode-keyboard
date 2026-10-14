import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createLocalRecognizer} from './local-recognizer.mjs';
const enabled=process.env.MATH_MODE_TEST_LOCAL==='1';
const image=async name=>'data:image/png;base64,'+(await readFile(new URL(`../tests/fixtures/${name}.png`,import.meta.url))).toString('base64');
const normalize=s=>s.replace(/\s+/g,'').replaceAll('^{2}','^2').toLowerCase();
test('real dedicated reader preserves powers, fractions and incorrect arithmetic without an external model',{skip:!enabled},async t=>{
 const recognize=await createLocalRecognizer();t.after(()=>recognize.close());
 for(const [name,want] of [['quadratic','x^2+2x=3'],['fraction','\\frac{2x+3}{x-1}=5'],['wrong-arithmetic','2+2=5']]){
  const result=await recognize(await image(name),AbortSignal.timeout(6000));assert.equal(result.model,'bttr-local');assert.equal(result.lines.length,1);assert.equal(normalize(result.lines[0].latex),want);
 }
});
test('native queue stays bounded, cancellation cannot publish or expand its queue, malformed input stays safe',{skip:!enabled},async t=>{
 const recognize=await createLocalRecognizer();t.after(()=>recognize.close());const png=await image('fraction');
 const abort=new AbortController();const first=recognize(png,abort.signal);const second=recognize(png,AbortSignal.timeout(6000));abort.abort();
 await assert.rejects(first,/cancelled/);await assert.rejects(recognize(png),/busy/);assert.equal((await second).model,'bttr-local');
 await assert.rejects(recognize('data:image/png;base64,abcd'),/Invalid PNG/);
 const bad=Buffer.alloc(24);Buffer.from('89504e470d0a1a0a','hex').copy(bad);bad.writeUInt32BE(10,16);bad.writeUInt32BE(10,20);
 await assert.rejects(recognize('data:image/png;base64,'+bad.toString('base64')),/Couldn’t read/);assert.equal(recognize.isClosed(),false);
});
