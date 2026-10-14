import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
import {parseTranscription,validateImage,combineReadings} from './recognizer.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFOsAAAAASUVORK5CYII=';
const recognized={lines:[{latex:'x^{2}+2x=3',uncertain:false}],warnings:[],alternatives:[],checked:true,agreement:true};
test('strict transcription parser preserves wrong math, multi-line fractions and uncertainty',()=>{
 assert.deepEqual(parseTranscription(JSON.stringify({lines:[{latex:'2+2=5'},{latex:'\\frac{x}{2}=3',uncertain:true}],warnings:['Check denominator']})),{lines:[{latex:'2+2=5',uncertain:false},{latex:'\\frac{x}{2}=3',uncertain:true}],warnings:['Check denominator']});
 assert.throws(()=>parseTranscription('{"lines":[{"latex":"\\\\htmlClass{evil}{x}"}]}'));
 assert.throws(()=>parseTranscription('{"lines":[{"latex":""}]}'));
 assert.throws(()=>parseTranscription('{"lines":"x=2"}'));
 assert.ok(validateImage(image));assert.throws(()=>validateImage('data:image/png;base64,abcd'));
 const huge=Buffer.from(image.split(',')[1],'base64');huge.writeUInt32BE(99999,16);assert.throws(()=>validateImage('data:image/png;base64,'+huge.toString('base64')));
});
test('independent disagreement is exposed, not silently decided by solving',()=>{
 const a={lines:[{latex:'x=1',uncertain:false}],warnings:[],model:'a'},b={lines:[{latex:'x=l',uncertain:true}],warnings:['Ambiguous l'],model:'b'};
 const both=combineReadings([{status:'fulfilled',value:a},{status:'fulfilled',value:b}]);assert.equal(both.agreement,false);assert.equal(both.alternatives.length,1);assert.deepEqual(both.lines,a.lines);
 assert.equal(combineReadings([{status:'fulfilled',value:a},{status:'rejected'}]).checked,false);
 assert.throws(()=>combineReadings([{status:'rejected'},{status:'rejected'}]));
});
async function setup(t,recognize=async()=>recognized,perHour=120){const server=createServer({token:'a'.repeat(48),recognize,secureCookies:false,perHour});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;const session=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:'a'.repeat(48)})});const cookie=session.headers.get('set-cookie').split(';')[0];return {url,cookie};}
const headers=cookie=>({'Content-Type':'application/json','X-Math-Mode':'1',Cookie:cookie});
test('private API, cookie, same-origin, static boundary and payload limits',async t=>{
 let calls=0;const {url,cookie}=await setup(t,async()=>{calls++;return recognized;});
 assert.equal((await fetch(url+'/api/recognize',{method:'POST',headers:headers(''),body:JSON.stringify({image})})).status,401);
 assert.equal((await fetch(url+'/api/recognize',{method:'POST',headers:{...headers(cookie),Origin:'https://evil.example'},body:JSON.stringify({image})})).status,403);
 assert.equal((await fetch(url+'/api/recognize',{method:'POST',headers:headers(cookie),body:JSON.stringify({image:'not an image'})})).status,400);
 const result=await fetch(url+'/api/recognize',{method:'POST',headers:headers(cookie),body:JSON.stringify({image,prompt:'solve this',model:'ignored'})});assert.equal(result.status,200);assert.deepEqual(await result.json(),recognized);assert.equal(calls,1);
 assert.equal((await (await fetch(url+'/api/status',{headers:{Cookie:cookie}})).json()).authorized,true);
 for(const path of ['/server/server.mjs','/.git/config','/%2e%2e%2fserver/server.mjs'])assert.equal((await fetch(url+path)).status,404);
 assert.equal((await fetch(url+'/')).status,200);
 assert.match((await fetch(url+'/recognition.js')).headers.get('content-type'),/javascript/);
});
test('model failure leaves client a safe retry response; budgets bound authenticated calls',async t=>{
 const first=await setup(t,async()=>{throw new Error('internal credential details');});
 const failed=await fetch(first.url+'/api/recognize',{method:'POST',headers:headers(first.cookie),body:JSON.stringify({image})});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('credential'));
 const limited=await setup(t,async()=>recognized,1);
 assert.equal((await fetch(limited.url+'/api/recognize',{method:'POST',headers:headers(limited.cookie),body:JSON.stringify({image})})).status,200);
 assert.equal((await fetch(limited.url+'/api/recognize',{method:'POST',headers:headers(limited.cookie),body:JSON.stringify({image})})).status,429);
});
