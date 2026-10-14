import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from './server.mjs';
import {parseTranscription,validateImage,createRecognizer} from './recognizer.mjs';
const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jFOsAAAAASUVORK5CYII=';
const recognized={lines:[{latex:'x^{2}+2x=3',uncertain:false}],warnings:[],model:'claude-sonnet-5-5'};
test('strict transcription parser preserves wrong math, multi-line fractions and uncertainty',()=>{
 assert.deepEqual(parseTranscription(JSON.stringify({lines:[{latex:'2+2=5'},{latex:'\\frac{x}{2}=3',uncertain:true}],warnings:['Check denominator']})),{lines:[{latex:'2+2=5',uncertain:false},{latex:'\\frac{x}{2}=3',uncertain:true}],warnings:['Check denominator']});
 assert.throws(()=>parseTranscription('{"lines":[{"latex":"\\\\htmlClass{evil}{x}"}]}'));
 assert.throws(()=>parseTranscription('{"lines":[{"latex":""}]}'));
 assert.throws(()=>parseTranscription('{"lines":"x=2"}'));
 assert.ok(validateImage(image));assert.throws(()=>validateImage('data:image/png;base64,abcd'));
 const huge=Buffer.from(image.split(',')[1],'base64');huge.writeUInt32BE(99999,16);assert.throws(()=>validateImage('data:image/png;base64,'+huge.toString('base64')));
});
test('one fast transcription call, no second reader or reasoning wait',async()=>{
 const calls=[],model={id:'fast-reader',provider:'anthropic',input:['text','image']};
 const runtime={getModel:()=>model,completeSimple:async(...args)=>{calls.push(args);return {stopReason:'stop',content:[{type:'text',text:'{"lines":[{"latex":"2+2=5"}],"warnings":[]}'}]};}};
 const recognize=await createRecognizer({runtime,modelRef:'anthropic/fast-reader'});
 const result=await recognize(image,AbortSignal.timeout(1000));
 assert.equal(calls.length,1);assert.equal(result.lines[0].latex,'2+2=5');assert.equal(result.model,'fast-reader');assert.equal(recognize.provider,'Anthropic');
 assert.equal('reasoning' in calls[0][2],false);assert.equal(calls[0][1].messages[0].content.length,1);
});
async function setup(t,recognize=async()=>recognized,perHour=120,careful){const server=createServer({token:'a'.repeat(48),recognize,careful,secureCookies:false,perHour});await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url='http://127.0.0.1:'+server.address().port;const session=await fetch(url+'/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({invite:'a'.repeat(48)})});const cookie=session.headers.get('set-cookie').split(';')[0];return {url,cookie};}
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
test('slower AI reading is explicit, shares all private API protections and cannot bypass the budget',async t=>{
 let fast=0,slow=0;const careful=async()=>{slow++;return recognized;};careful.provider='Anthropic';
 const {url,cookie}=await setup(t,async()=>{fast++;return {...recognized,model:'bttr-local'};},1,careful);
 const status=await (await fetch(url+'/api/status')).json();assert.equal(status.careful,true);assert.equal(status.carefulProvider,'Anthropic');
 assert.equal((await fetch(url+'/api/recognize-careful',{method:'POST',headers:headers(''),body:JSON.stringify({image})})).status,401);
 assert.equal((await fetch(url+'/api/recognize-careful',{method:'POST',headers:{...headers(cookie),Origin:'https://evil.test'},body:JSON.stringify({image})})).status,403);
 const result=await fetch(url+'/api/recognize-careful',{method:'POST',headers:headers(cookie),body:JSON.stringify({image})});assert.equal(result.status,200);assert.equal(slow,1);assert.equal(fast,0);
 assert.equal((await fetch(url+'/api/recognize',{method:'POST',headers:headers(cookie),body:JSON.stringify({image})})).status,429);
});
test('model failure leaves client a safe retry response; budgets bound authenticated calls',async t=>{
 const first=await setup(t,async()=>{throw new Error('internal credential details');});
 const failed=await fetch(first.url+'/api/recognize',{method:'POST',headers:headers(first.cookie),body:JSON.stringify({image})});assert.equal(failed.status,503);assert.ok(!(await failed.text()).includes('credential'));
 const limited=await setup(t,async()=>recognized,1);
 assert.equal((await fetch(limited.url+'/api/recognize',{method:'POST',headers:headers(limited.cookie),body:JSON.stringify({image})})).status,200);
 assert.equal((await fetch(limited.url+'/api/recognize',{method:'POST',headers:headers(limited.cookie),body:JSON.stringify({image})})).status,429);
});
