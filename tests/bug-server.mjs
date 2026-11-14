// Test harness for tests/test-bug.py and test-ask.py: Math Mode's server with a fake Relay daemon behind it.
// Prints "ready <app port> <relay port>"; GET /captured on the relay port returns what Relay was sent.
import http from 'node:http';
import {gunzipSync} from 'node:zlib';
import {createServer} from '../server/server.mjs';
const captured={recordings:[],sessions:[],auth:[],asks:[]};
const relay=http.createServer(async(req,res)=>{
  if(req.method==='GET'&&req.url==='/captured'){res.writeHead(200,{'content-type':'application/json'});return res.end(JSON.stringify(captured));}
  const chunks=[];for await(const c of req)chunks.push(c);let raw=Buffer.concat(chunks);captured.auth.push(req.headers.authorization);
  const url=new URL(req.url,'http://x');
  if(url.pathname==='/api/recording'){if(raw[0]===0x1f&&raw[1]===0x8b)raw=gunzipSync(raw);captured.recordings.push({query:Object.fromEntries(url.searchParams),events:JSON.parse(raw.toString())});res.writeHead(200);return res.end('{"ok":true}');}
  if(url.pathname==='/api/sessions'){captured.sessions.push(JSON.parse(raw.toString()));res.writeHead(201,{'content-type':'application/json'});return res.end('{"session":{"sessionId":"s-test"}}');}
  res.writeHead(404);res.end();
});
await new Promise(r=>relay.listen(0,'127.0.0.1',r));
const app=createServer({token:'a'.repeat(48),recognize:async()=>({lines:[{latex:'x',uncertain:false}],warnings:[]}),secureCookies:false,ask:async a=>{captured.asks.push(a);if(a.messages.at(-1).text==='fail')throw new Error('x');return {text:'Answer '+a.messages.length+': **one** turn.'};},relay:{base:'http://127.0.0.1:'+relay.address().port,token:async()=>'relay-test-token'}});
await new Promise(r=>app.listen(0,'127.0.0.1',r));
console.log('ready',app.address().port,relay.address().port);
